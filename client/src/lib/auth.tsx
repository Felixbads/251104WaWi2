import { useState, useEffect, createContext, useContext } from "react";
import axios from "axios";
import { useToast } from "../hooks/use-toast";
import { User } from "./types";

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();
  
  useEffect(() => {
    axios.defaults.withCredentials = true;
  }, []);
  
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('/api/auth/user');
        
        if (response.data) {
          const userData = {
            id: response.data.id,
            username: response.data.email?.split('@')[0] || 'user',
            email: response.data.email || '',
            role: 'user',
            approved: true,
            firstName: response.data.firstName,
            lastName: response.data.lastName,
            profileImageUrl: response.data.profileImageUrl
          };
          
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  const login = () => {
    window.location.href = '/api/login';
  };
  
  const logout = () => {
    window.location.href = '/api/logout';
  };
  
  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      login, 
      logout,
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

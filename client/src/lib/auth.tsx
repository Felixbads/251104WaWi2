import { useState, useEffect, createContext, useContext } from "react";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/lib/types";

// Auth Context für globale Authentifizierungsinformationen
interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (credentials: { username: string; password: string }) => Promise<boolean>;
  register: (userData: any) => Promise<boolean>;
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

// Auth Provider Komponente
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();
  
  // Setup axios interceptor for token
  useEffect(() => {
    // Request interceptor to add token to requests
    const interceptor = axios.interceptors.request.use(
      (config) => {
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Cleanup function
    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, [token]);
  
  // Prüfen, ob es einen gespeicherten Auth-Status gibt
  useEffect(() => {
    const checkAuth = async () => {
      // HINWEIS: Authentifizierungsprüfung temporär deaktiviert für Testzwecke
      // Simuliere einen authentifizierten Benutzer
      setUser({
        id: 1,
        username: "Admin",
        email: "admin@example.com",
        isAdmin: true,
        createdAt: new Date().toISOString()
      });
      setToken("dummy_token_for_testing");
      setIsAuthenticated(true);
      
      // Code für die tatsächliche Authentifizierung (temporär auskommentiert)
      /*
      const storedToken = localStorage.getItem('auth_token');
      
      if (storedToken) {
        try {
          // Token an den Authorization-Header anhängen
          const config = {
            headers: { Authorization: `Bearer ${storedToken}` }
          };
          
          // Benutzerinformationen vom Server abrufen
          const response = await axios.get('/api/auth/me', config);
          
          if (response.data) {
            setUser(response.data);
            setToken(storedToken);
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error('Token validation error:', error);
          // Bei Fehler den Token entfernen
          localStorage.removeItem('auth_token');
        }
      }
      */
      
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);
  
  const login = async (credentials: { username: string; password: string }) => {
    try {
      setIsLoading(true);
      const response = await axios.post('/api/auth/login', credentials);
      
      if (response.data && response.data.success) {
        const { token, user } = response.data;
        
        // Token und User im localStorage speichern
        localStorage.setItem('auth_token', token);
        
        // State aktualisieren
        setToken(token);
        setUser(user);
        setIsAuthenticated(true);
        
        toast({
          title: "Erfolgreich angemeldet",
          description: `Willkommen zurück, ${user.username}!`,
        });
        
        setIsLoading(false);
        return true;
      } else {
        toast({
          title: "Anmeldung fehlgeschlagen",
          description: response.data.error || "Ungültige Anmeldedaten",
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || "Fehler bei der Anmeldung";
      toast({
        title: "Anmeldung fehlgeschlagen",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return false;
    }
  };
  
  const register = async (userData: any) => {
    try {
      setIsLoading(true);
      const response = await axios.post('/api/auth/register', userData);
      
      if (response.data && response.data.success) {
        toast({
          title: "Registrierung erfolgreich",
          description: "Du kannst dich jetzt anmelden.",
        });
        setIsLoading(false);
        return true;
      } else {
        toast({
          title: "Registrierung fehlgeschlagen",
          description: response.data.error || "Fehler bei der Registrierung",
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }
    } catch (error: any) {
      const errorMessage = 
        error.response?.data?.error || 
        error.response?.data?.details || 
        "Fehler bei der Registrierung";
      
      toast({
        title: "Registrierung fehlgeschlagen",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return false;
    }
  };
  
  const logout = async () => {
    try {
      if (token) {
        // API aufrufen, um das Token zu invalidieren
        await axios.post('/api/auth/logout', { token });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Lokalen Zustand zurücksetzen
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      
      toast({
        title: "Abgemeldet",
        description: "Du wurdest erfolgreich abgemeldet.",
      });
    }
  };
  
  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      token,
      login, 
      register,
      logout,
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}
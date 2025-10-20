import { useState, useEffect, createContext, useContext } from "react";
import axios from "axios";
import { useToast } from "../hooks/use-toast";
import { User } from "./types";

// Auth Context für globale Authentifizierungsinformationen
interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (credentials?: { username: string; password: string }) => Promise<boolean>;
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
  
  // Setup axios interceptor for token - runs immediately to catch all requests
  useEffect(() => {
    // Request interceptor to add token to all requests
    const interceptor = axios.interceptors.request.use(
      (config) => {
        // Read token from localStorage (single source of truth)
        const storedToken = localStorage.getItem('authToken');
        
        if (storedToken) {
          config.headers['Authorization'] = `Bearer ${storedToken}`;
          console.log(`[AUTH] Sending request to ${config.url} with auth token: true`);
        } else {
          console.log(`[AUTH] Sending request to ${config.url} with auth token: false`);
        }
        
        // Set withCredentials for all API requests (Enhanced Auth uses HttpOnly Cookies)
        if (config.url?.startsWith('/api/')) {
          config.withCredentials = true;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Cleanup function
    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []); // Empty dependency array - run once on mount
  
  // Check authentication status using Replit's native authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log("[AUTH] Checking Replit authentication status...");
        
        // Try to get current user from Enhanced Replit authentication
        const response = await axios.get('/api/enhanced-auth/me');
        
        if (response.data && response.data.success) {
          const { user } = response.data;
          console.log("[AUTH] Replit user authenticated:", user);
          
          setUser(user);
          setIsAuthenticated(true);
          
          // Generate a token for consistency with existing code
          const replitToken = btoa(`replit:${user.username}:${Date.now()}`);
          setToken(replitToken);
          localStorage.setItem('authToken', replitToken);
          
          // Set default authorization header
          axios.defaults.headers.common['Authorization'] = `Bearer ${replitToken}`;
        } else {
          console.log("[AUTH] No Replit user found, user needs to authenticate");
          setIsAuthenticated(false);
          setUser(null);
          setToken(null);
          localStorage.removeItem('authToken');
        }
      } catch (error) {
        console.log("[AUTH] Authentication check failed:", error);
        
        // If running in development mode, try to login automatically
        try {
          const loginResponse = await axios.post('/api/enhanced-auth/login');
          if (loginResponse.data && loginResponse.data.success) {
            const { user, token } = loginResponse.data;
            console.log("[AUTH] Development mode login successful:", user);
            
            setUser(user);
            setIsAuthenticated(true);
            setToken(token);
            localStorage.setItem('authToken', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          } else {
            setIsAuthenticated(false);
            setUser(null);
            setToken(null);
          }
        } catch (loginError) {
          console.error("[AUTH] Auto-login failed:", loginError);
          setIsAuthenticated(false);
          setUser(null);
          setToken(null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  const login = async (credentials?: { username: string; password: string }) => {
    try {
      setIsLoading(true);
      
      // For Enhanced Replit auth, credentials are not needed - authentication is based on environment
      const response = await axios.post('/api/enhanced-auth/login');
      
      if (response.data && response.data.success) {
        const { token, user } = response.data;
        
        console.log("[AUTH] Replit login successful:", user);
        
        // Token und User im localStorage speichern (use consistent key: 'authToken')
        localStorage.setItem('authToken', token);
        
        // Token für alle zukünftigen Anfragen als Default setzen
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // State aktualisieren
        setToken(token);
        setUser(user);
        setIsAuthenticated(true);
        
        // Prüfe, ob der Benutzer freigegeben wurde
        if (!user.approved && user.role !== 'admin') {
          toast({
            title: "Anmeldung erfolgreich",
            description: "Dein Konto wurde noch nicht vom Administrator freigegeben.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Erfolgreich angemeldet",
            description: `Willkommen zurück, ${user.username}!`,
          });
          
          // Wir leiten nicht hier weiter, sondern in der Login-Funktion selbst
          // für schnellere Reaktionszeit
        }
        
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
      
      // Registrierung ist für Enhanced Replit Auth nicht verfügbar - Benutzer werden automatisch erstellt
      toast({
        title: "Registrierung nicht erforderlich",
        description: "Bei Enhanced Replit Auth werden Benutzer automatisch erstellt. Melden Sie sich einfach mit Ihrem Replit-Konto an.",
        variant: "default",
      });
      
      setIsLoading(false);
      return false; // Registrierung ist nicht möglich/nötig
    } catch (error: any) {
      toast({
        title: "Registrierung nicht verfügbar",
        description: "Enhanced Replit Auth erstellt Benutzer automatisch bei der ersten Anmeldung.",
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
        await axios.post('/api/enhanced-auth/logout', { token });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Lokalen Zustand zurücksetzen (use consistent key: 'authToken')
      localStorage.removeItem('authToken');
      
      // Authentifizierungsheader aus Standardkonfiguration entfernen
      delete axios.defaults.headers.common['Authorization'];
      
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
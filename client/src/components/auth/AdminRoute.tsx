import { Redirect } from "wouter";
import { useAuth } from "@/lib";

/**
 * Schützt Routen, die nur für Admin-Benutzer zugänglich sein sollten
 */
export default function AdminRoute({ component: Component, ...rest }: any) {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Während des Ladens zeigen wir nichts an
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Lade...</div>;
  }
  
  // Prüfen, ob der Benutzer authentifiziert ist und Admin-Rechte hat
  if (!isAuthenticated || user?.role !== 'admin') {
    return <Redirect to="/dashboard" />;
  }
  
  return <Component {...rest} />;
}
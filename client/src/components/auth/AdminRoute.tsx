import { Redirect } from "wouter";
import { useAuth } from "../../lib/auth";

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
    return <Redirect to="/" />;
  }
  
  // Admins müssen generell nicht freigegeben werden, aber wir können das für zusätzliche Sicherheit hinzufügen
  if (user && !user.approved) {
    return <Redirect to="/nicht-freigegeben" />;
  }
  
  return <Component {...rest} />;
}

/**
 * Schützt Routen, die nur für bestimmte Rollen zugänglich sein sollten
 */
export function RoleBasedRoute({ component: Component, allowedRoles, ...rest }: any) {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Während des Ladens zeigen wir nichts an
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Lade...</div>;
  }
  
  // Prüfen, ob der Benutzer authentifiziert ist und die erforderliche Rolle hat
  if (!isAuthenticated || !user || !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }
  
  // Prüfen, ob der Benutzer freigegeben wurde
  if (!user.approved) {
    return <Redirect to="/nicht-freigegeben" />;
  }
  
  return <Component {...rest} />;
}
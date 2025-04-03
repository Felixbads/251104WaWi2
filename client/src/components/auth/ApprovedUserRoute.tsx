import { Redirect } from "wouter";
import { useAuth } from "../../lib/auth";
import { ReactElement } from "react";

interface ApprovedUserRouteProps {
  component: React.ComponentType<any>;
  [x: string]: any;
}

/**
 * Schützt Routen, die nur für freigegebene Benutzer zugänglich sein sollten
 * Diese Komponente kann für alle regulären Seiten verwendet werden, die eine Freigabe erfordern,
 * aber von jedem Benutzertyp (Admin oder regulärer Benutzer) besucht werden können
 */
export default function ApprovedUserRoute({ 
  component: Component, 
  ...rest 
}: ApprovedUserRouteProps): ReactElement {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Während des Ladens zeigen wir nichts an
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Lade...</div>;
  }
  
  // Prüfen, ob der Benutzer authentifiziert ist
  if (!isAuthenticated || !user) {
    return <Redirect to="/login" />;
  }
  
  // Prüfen, ob der Benutzer freigegeben wurde
  // Admins können immer alle Seiten sehen, auch wenn sie theoretisch nicht freigegeben sind
  if (!user.approved && user.role !== 'admin') {
    return <Redirect to="/nicht-freigegeben" />;
  }
  
  return <Component {...rest} />;
}
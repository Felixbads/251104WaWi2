import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib";

/**
 * Komponente, die das Routing für öffentliche Seiten mit Direktumleitung für authentifizierte Benutzer handhabt
 */
export default function PublicRoute({ 
  component: Component, 
  ...rest 
}: { 
  component: React.ElementType;
  [x: string]: any 
}) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Bei angemeldetem Benutzer direkt zum Dashboard umleiten
  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/dashboard";
    }
  }, [isAuthenticated]);

  // Anzeige der eigentlichen Komponente (z.B. Login)
  return <Component {...rest} />;
}
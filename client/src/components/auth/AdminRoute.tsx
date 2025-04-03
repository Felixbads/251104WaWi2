import React from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * AdminRoute-Komponente
 * 
 * Schützt Routen, die nur für Administratoren zugänglich sein sollen.
 * Überprüft, ob der Benutzer authentifiziert ist UND die Rolle "admin" hat.
 * Leitet zu /login um, wenn der Benutzer nicht angemeldet ist.
 * Leitet zu /unauthorized um, wenn der Benutzer nicht die erforderliche Rolle hat.
 */
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // Während der Authentifizierungsstatus geladen wird, zeigen wir einen Ladeindikator
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span className="text-lg">Authentifizierung wird überprüft...</span>
      </div>
    );
  }
  
  // Wenn der Benutzer nicht angemeldet ist, leiten wir ihn zur Login-Seite weiter
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  // Wenn der Benutzer angemeldet ist, aber keine Admin-Rolle hat, leiten wir ihn zur
  // Unauthorized-Seite weiter
  if (user?.role !== 'admin') {
    return <Redirect to="/unauthorized" />;
  }
  
  // Wenn der Benutzer ein Admin ist, zeigen wir die geschützte Route an
  return <>{children}</>;
};

export default AdminRoute;
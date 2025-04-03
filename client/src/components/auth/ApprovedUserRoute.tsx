import React from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

interface ApprovedUserRouteProps {
  children: React.ReactNode;
}

/**
 * ApprovedUserRoute-Komponente
 * 
 * Schützt Routen, die nur für angemeldete und genehmigte Benutzer zugänglich sein sollen.
 * Überprüft, ob der Benutzer authentifiziert ist UND genehmigt wurde.
 * Leitet zu /login um, wenn der Benutzer nicht angemeldet ist.
 * Leitet zu /not-approved um, wenn der Benutzer nicht genehmigt wurde.
 */
const ApprovedUserRoute: React.FC<ApprovedUserRouteProps> = ({ children }) => {
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
  
  // Wenn der Benutzer angemeldet ist, aber nicht genehmigt wurde, leiten wir ihn zur
  // "Nicht genehmigt"-Seite weiter
  if (!user?.approved) {
    return <Redirect to="/not-approved" />;
  }
  
  // Wenn der Benutzer angemeldet und genehmigt ist, zeigen wir die geschützte Route an
  return <>{children}</>;
};

export default ApprovedUserRoute;
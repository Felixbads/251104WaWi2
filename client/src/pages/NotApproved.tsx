import React from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { ClockIcon, ShieldAlert, LogOut } from 'lucide-react';

/**
 * NotApproved-Seite
 * 
 * Diese Seite wird angezeigt, wenn ein Benutzer sich erfolgreich registriert hat,
 * aber sein Konto noch nicht von einem Administrator genehmigt wurde.
 */
const NotApproved: React.FC = () => {
  const { logout } = useAuth();
  
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
            <ClockIcon className="h-6 w-6 text-yellow-600" />
          </div>
          <CardTitle className="text-xl">Konto wartet auf Genehmigung</CardTitle>
          <CardDescription>
            Ihr Konto wurde erfolgreich erstellt, muss aber noch von einem Administrator genehmigt werden.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Aus Sicherheitsgründen erfordert die Proviantomat-Anwendung eine manuelle Überprüfung
              neuer Benutzerkonten, bevor der Zugriff gewährt wird.
            </p>
            <p>
              Ein Administrator wird Ihre Anfrage in Kürze prüfen. Sie erhalten Zugriff, sobald Ihr
              Konto genehmigt wurde.
            </p>
            <div className="mt-6 rounded-md bg-blue-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ShieldAlert className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Haben Sie Fragen?</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>
                      Falls Sie Fragen zur Kontogenehmigung haben oder der Prozess länger als erwartet dauert,
                      wenden Sie sich bitte an Ihren Administrator oder das Support-Team.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-between border-t bg-gray-50/50 px-6 py-4">
          <Button
            variant="outline"
            onClick={logout}
            className="flex items-center"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Abmelden
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">
              Zurück zum Login
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default NotApproved;
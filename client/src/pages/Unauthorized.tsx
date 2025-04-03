import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldXIcon, ArrowLeft } from 'lucide-react';

/**
 * Unauthorized-Seite
 * 
 * Diese Seite wird angezeigt, wenn ein Benutzer versucht, auf eine Ressource zuzugreifen,
 * für die er nicht die erforderlichen Berechtigungen hat.
 */
const Unauthorized: React.FC = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <ShieldXIcon className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-xl">Zugriff verweigert</CardTitle>
          <CardDescription>
            Sie haben nicht die erforderlichen Berechtigungen, um auf diese Seite zuzugreifen.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Der Zugriff auf diese Funktion ist auf Benutzer mit bestimmten Rollen 
              beschränkt. Möglicherweise benötigen Sie Administratorrechte, um auf 
              diese Ressource zuzugreifen.
            </p>
            <p>
              Wenn Sie der Meinung sind, dass Sie Zugriff haben sollten, wenden Sie sich 
              bitte an Ihren Systemadministrator, um die entsprechenden Berechtigungen zu erhalten.
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-center border-t bg-gray-50/50 px-6 py-4">
          <Button asChild variant="default" className="flex items-center">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zur Startseite
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Unauthorized;
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingBag, LogIn, Loader2 } from "lucide-react";

// Login schema mit Validierungsregeln
const loginSchema = z.object({
  username: z.string().min(1, "Benutzername ist erforderlich"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();

  // Keine automatische Weiterleitung per useEffect mehr
  // Die Weiterleitung erfolgt nur noch direkt im erfolgreichen Login-Handler

  // Form-Handling mit react-hook-form und zod-Validierung
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Handle Replit authentication (no form submission needed)
  const handleReplitLogin = async () => {
    setIsFormSubmitting(true);
    
    try {
      const success = await login(); // No credentials needed for Replit auth
      
      if (success) {
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen bei der Warenwirtschaft!",
          variant: "default",
        });
      } else {
        toast({
          title: "Anmeldung fehlgeschlagen",
          description: "Bitte stellen Sie sicher, dass Sie diese App auf Replit ausführen.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Fehler bei der Anmeldung",
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Legacy form submission handler (kept for compatibility)
  const onSubmit = async (data: LoginFormValues) => {
    await handleReplitLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <ShoppingBag className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Proviantomat</h1>
            <p className="text-muted-foreground">Warenwirtschaftssystem für Vendig Automaten</p>
          </div>
        </div>

        {/* Login Form */}
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl text-center">Anmeldung</CardTitle>
            <CardDescription className="text-center">
              Authentifizierung über Replit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Diese App verwendet Replit's native Authentifizierung. 
                  Klicken Sie auf "Mit Replit anmelden" um sich automatisch anzumelden.
                </p>
              </div>
              
              <Button 
                onClick={handleReplitLogin}
                className="w-full h-11 text-base font-medium" 
                disabled={isFormSubmitting || isLoading}
              >
                {isFormSubmitting || isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 
                    Wird angemeldet...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" /> 
                    Mit Replit anmelden
                  </>
                )}
              </Button>
              
              {/* Fallback form for development */}
              <details className="text-left">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-primary">
                  Entwicklermodus (für lokale Tests)
                </summary>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Benutzername</Label>
                    <Input 
                      id="username"
                      placeholder="Ihr Benutzername" 
                      {...form.register("username")}
                      autoComplete="username"
                      className="h-11"
                    />
                    {form.formState.errors.username && (
                      <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Passwort</Label>
                    <Input 
                      id="password"
                      type="password" 
                      placeholder="Ihr Passwort" 
                      {...form.register("password")}
                      autoComplete="current-password"
                      className="h-11"
                    />
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    variant="outline"
                    className="w-full h-11 text-base font-medium" 
                    disabled={isFormSubmitting || isLoading}
                  >
                    Entwickler-Login
                  </Button>
                </form>
              </details>
            </div>
          </CardContent>
          <CardFooter className="justify-center pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Bei Replit werden Benutzer automatisch registriert.<br />
              Keine separate Registrierung erforderlich.
            </p>
          </CardFooter>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            © 2025 Elbsandstein Proviant & Quartier GmbH
          </p>
          <div className="flex justify-center space-x-4 text-xs text-muted-foreground">
            <Button variant="link" size="sm" className="p-0 h-auto text-xs">
              Datenschutz
            </Button>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs">
              Impressum
            </Button>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs">
              Support
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
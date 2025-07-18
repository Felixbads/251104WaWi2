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

  // Form-Submission Handler
  const onSubmit = async (data: LoginFormValues) => {
    setIsFormSubmitting(true);
    
    try {
      const success = await login(data);
      
      if (success) {
        // Nach erfolgreichem Login machen wir nichts, da der Dashboard-Inhalt direkt angezeigt wird
        // Wir verwenden keine Weiterleitungen mehr, um unnötige Seitenreloads zu vermeiden
        setIsFormSubmitting(false);
      } else {
        // Fehler wird bereits in der Login-Funktion über Toast angezeigt
        setIsFormSubmitting(false);
      }
    } catch (error) {
      toast({
        title: "Fehler bei der Anmeldung",
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
      setIsFormSubmitting(false);
    }
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
              Bitte melden Sie sich mit Ihren Zugangsdaten an
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Passwort</Label>
                  <Button variant="link" size="sm" className="text-xs p-0 h-auto text-muted-foreground hover:text-primary">
                    Passwort vergessen?
                  </Button>
                </div>
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
                    Anmelden
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center pt-6">
            <p className="text-sm text-muted-foreground">
              Noch kein Konto?{" "}
              <Button 
                variant="link" 
                className="p-0 h-auto text-primary font-medium" 
                onClick={() => setLocation("/register")}
              >
                Registrieren
              </Button>
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
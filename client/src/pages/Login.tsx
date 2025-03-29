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

  // Umleitung zurück zur ursprünglichen Seite nach Login
  useEffect(() => {
    if (isAuthenticated) {
      // Wenn die Weiterleitung in der URL steht, diese verwenden
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect');
      
      if (redirectTo) {
        setLocation(decodeURIComponent(redirectTo));
      } else {
        setLocation('/');
      }
    }
  }, [isAuthenticated, setLocation]);

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
      
      if (!success) {
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Proviantomat</CardTitle>
          <CardDescription>
            Bitte melden Sie sich mit Ihren Zugangsdaten an
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input 
                id="username"
                placeholder="Ihr Benutzername" 
                {...form.register("username")}
                autoComplete="username"
              />
              {form.formState.errors.username && (
                <p className="text-sm text-red-500">{form.formState.errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Passwort</Label>
                <Button variant="link" size="sm" className="text-xs p-0 h-auto">
                  Passwort vergessen?
                </Button>
              </div>
              <Input 
                id="password"
                type="password" 
                placeholder="Ihr Passwort" 
                {...form.register("password")}
                autoComplete="current-password"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isFormSubmitting || isLoading}
            >
              {isFormSubmitting || isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird angemeldet...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" /> Anmelden
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-gray-600">
            Noch kein Konto?{" "}
            <Button 
              variant="link" 
              className="p-0 h-auto text-primary" 
              onClick={() => setLocation("/register")}
            >
              Registrieren
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
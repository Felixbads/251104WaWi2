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
import { ShoppingBag, UserPlus, Loader2 } from "lucide-react";

// Registrierungsschema mit Validierungsregeln
const registerSchema = z.object({
  username: z.string().min(3, "Benutzername muss mindestens 3 Zeichen lang sein"),
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein"),
  confirmPassword: z.string(),
  role: z.string().default("user"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const { register: registerUser, isLoading } = useAuth();

  // Form-Handling mit react-hook-form und zod-Validierung
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "user",
    },
  });

  // Form-Submission Handler
  const onSubmit = async (data: RegisterFormValues) => {
    setIsFormSubmitting(true);
    
    try {
      const success = await registerUser(data);
      
      if (success) {
        setLocation("/login");
      } else {
        // Fehler wird bereits in der register-Funktion über Toast angezeigt
        setIsFormSubmitting(false);
      }
    } catch (error) {
      toast({
        title: "Fehler bei der Registrierung",
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
            Erstellen Sie ein neues Konto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input 
                id="username"
                placeholder="Wählen Sie einen Benutzernamen" 
                {...form.register("username")}
                autoComplete="username"
              />
              {form.formState.errors.username && (
                <p className="text-sm text-red-500">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input 
                id="email"
                type="email"
                placeholder="Ihre E-Mail-Adresse" 
                {...form.register("email")}
                autoComplete="email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input 
                id="password"
                type="password" 
                placeholder="Mindestens 6 Zeichen" 
                {...form.register("password")}
                autoComplete="new-password"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <Input 
                id="confirmPassword"
                type="password" 
                placeholder="Passwort wiederholen" 
                {...form.register("confirmPassword")}
                autoComplete="new-password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isFormSubmitting || isLoading}
            >
              {isFormSubmitting || isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registriere...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" /> Registrieren
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-gray-600">
            Bereits registriert?{" "}
            <Button 
              variant="link" 
              className="p-0 h-auto text-primary" 
              onClick={() => setLocation("/login")}
            >
              Anmelden
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
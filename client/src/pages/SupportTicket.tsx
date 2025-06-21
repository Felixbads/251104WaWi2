import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  Bug, 
  HelpCircle, 
  Monitor, 
  Phone, 
  Mail, 
  Building, 
  User,
  FileText,
  Settings,
  Clock,
  CheckCircle
} from 'lucide-react';

// Ticket-Schema für Formvalidierung
const ticketFormSchema = z.object({
  // Kundendaten (PFLICHT)
  customerName: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  customerEmail: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  customerPhone: z.string().optional(),
  customerCompany: z.string().optional(),
  
  // Ticket-Details (PFLICHT)
  priority: z.enum(["low", "medium", "high", "urgent"]),
  category: z.enum(["technical", "billing", "general", "feature_request", "bug_report"]),
  subject: z.string().min(5, "Betreff muss mindestens 5 Zeichen lang sein"),
  description: z.string().min(20, "Beschreibung muss mindestens 20 Zeichen lang sein"),
  
  // System-Informationen (OPTIONAL)
  affectedSystem: z.string().optional(),
  errorMessage: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  
  // Zusätzliche Informationen (OPTIONAL)
  browserInfo: z.string().optional(),
  deviceInfo: z.string().optional(),
  additionalNotes: z.string().optional(),
});

type TicketFormValues = z.infer<typeof ticketFormSchema>;

const priorityConfig = {
  low: { label: "Niedrig", color: "bg-green-100 text-green-800", icon: Clock },
  medium: { label: "Mittel", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  high: { label: "Hoch", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  urgent: { label: "Dringend", color: "bg-red-100 text-red-800", icon: AlertTriangle }
};

const categoryConfig = {
  technical: { label: "Technisches Problem", icon: Bug },
  billing: { label: "Abrechnung/Zahlung", icon: FileText },
  general: { label: "Allgemeine Anfrage", icon: HelpCircle },
  feature_request: { label: "Feature-Anfrage", icon: Settings },
  bug_report: { label: "Bug-Meldung", icon: Bug }
};

export default function SupportTicket() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [submittedTicketNumber, setSubmittedTicketNumber] = useState<string | null>(null);

  // Browser- und Geräteinformationen automatisch erfassen
  const [browserInfo, setBrowserInfo] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');

  useEffect(() => {
    // Browser-Informationen automatisch erfassen
    const userAgent = navigator.userAgent;
    const browser = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[0] || 'Unbekannt';
    setBrowserInfo(`${browser} auf ${navigator.platform}`);
    
    // Geräteinformationen
    const device = `Bildschirmauflösung: ${screen.width}x${screen.height}, Sprache: ${navigator.language}`;
    setDeviceInfo(device);
  }, []);

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerCompany: "",
      priority: "medium",
      category: "general",
      subject: "",
      description: "",
      affectedSystem: "",
      errorMessage: "",
      stepsToReproduce: "",
      expectedBehavior: "",
      actualBehavior: "",
      browserInfo: browserInfo,
      deviceInfo: deviceInfo,
      additionalNotes: "",
    },
  });

  // Form-Werte automatisch aktualisieren
  useEffect(() => {
    form.setValue('browserInfo', browserInfo);
    form.setValue('deviceInfo', deviceInfo);
  }, [browserInfo, deviceInfo, form]);

  // Ticket-Submission Mutation
  const submitTicketMutation = useMutation({
    mutationFn: async (data: TicketFormValues) => {
      const response = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fehler beim Erstellen des Tickets');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setTicketSubmitted(true);
      setSubmittedTicketNumber(data.ticketNumber);
      toast({
        title: "Ticket erfolgreich erstellt",
        description: `Ihr Ticket ${data.ticketNumber} wurde erstellt. Sie erhalten eine Bestätigungs-E-Mail.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen des Tickets",
        description: error.message || "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: TicketFormValues) => {
    setIsSubmitting(true);
    try {
      await submitTicketMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Erfolgsansicht nach Ticket-Erstellung
  if (ticketSubmitted) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-green-700">
              Ticket erfolgreich erstellt!
            </CardTitle>
            <CardDescription>
              Ihr Support-Ticket wurde erfolgreich übermittelt.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-lg font-semibold">
                Ticket-Nummer: <span className="text-green-700">{submittedTicketNumber}</span>
              </p>
            </div>
            <div className="space-y-2 text-left">
              <h4 className="font-semibold">Was passiert als nächstes?</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Sie erhalten eine Bestätigungs-E-Mail mit allen Ticket-Details</li>
                <li>Unser Support-Team wird Ihr Ticket prüfen und bearbeiten</li>
                <li>Sie erhalten Updates per E-Mail über den Bearbeitungsfortschritt</li>
                <li>Bei dringenden Anfragen melden wir uns innerhalb von 2 Stunden</li>
              </ul>
            </div>
            <Button 
              onClick={() => {
                setTicketSubmitted(false);
                setSubmittedTicketNumber(null);
                form.reset();
              }}
              className="w-full"
            >
              Neues Ticket erstellen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Support-Ticket erstellen</h1>
        <p className="text-muted-foreground">
          Beschreiben Sie Ihr Anliegen detailliert. Alle Angaben werden in den E-Mails an Sie und unser Team übermittelt.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Kundendaten */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Ihre Kontaktdaten
              </CardTitle>
              <CardDescription>
                Diese Informationen werden für die Kommunikation und Zuordnung verwendet.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">Vor- und Nachname</FormLabel>
                    <FormControl>
                      <Input placeholder="Max Mustermann" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">E-Mail-Adresse</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="max@beispiel.de" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefonnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="+49 123 456789" {...field} />
                    </FormControl>
                    <FormDescription>Optional für Rückfragen</FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerCompany"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unternehmen</FormLabel>
                    <FormControl>
                      <Input placeholder="Mustermann GmbH" {...field} />
                    </FormControl>
                    <FormDescription>Falls zutreffend</FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Ticket-Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Ticket-Details
              </CardTitle>
              <CardDescription>
                Grundlegende Informationen zu Ihrem Anliegen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="required">Priorität</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Priorität auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(priorityConfig).map(([value, config]) => (
                            <SelectItem key={value} value={value}>
                              <div className="flex items-center gap-2">
                                <config.icon className="h-4 w-4" />
                                <span>{config.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="required">Kategorie</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kategorie auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(categoryConfig).map(([value, config]) => (
                            <SelectItem key={value} value={value}>
                              <div className="flex items-center gap-2">
                                <config.icon className="h-4 w-4" />
                                <span>{config.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">Betreff</FormLabel>
                    <FormControl>
                      <Input placeholder="Kurze Zusammenfassung Ihres Problems" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">Detaillierte Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Beschreiben Sie Ihr Problem oder Anliegen so detailliert wie möglich..."
                        rows={5}
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Je mehr Details Sie angeben, desto besser können wir Ihnen helfen.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* System-Informationen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                System-Informationen
              </CardTitle>
              <CardDescription>
                Helfen Sie uns bei der Problemdiagnose (alle Felder optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="affectedSystem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Betroffenes System/Modul</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Bestellsystem, Dashboard, Login..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="errorMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fehlermeldung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Falls eine Fehlermeldung angezeigt wurde, kopieren Sie diese hier hinein"
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="expectedBehavior"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Erwartetes Verhalten</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Was sollte passieren?"
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="actualBehavior"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tatsächliches Verhalten</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Was passiert stattdessen?"
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="stepsToReproduce"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schritte zur Reproduktion</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="1. Klicken Sie auf... &#10;2. Geben Sie ein... &#10;3. Das Problem tritt auf..."
                        rows={4}
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Beschreiben Sie schrittweise, wie das Problem auftritt
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Technische Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Technische Details
              </CardTitle>
              <CardDescription>
                Diese Informationen werden automatisch erfasst, können aber angepasst werden
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="browserInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Browser-Informationen</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>Automatisch erkannt</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deviceInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geräteinformationen</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>Automatisch erkannt</FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="additionalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zusätzliche Notizen</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Weitere Informationen, die bei der Lösung helfen könnten..."
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-center">
            <Button 
              type="submit" 
              size="lg" 
              disabled={isSubmitting}
              className="w-full md:w-auto"
            >
              {isSubmitting ? 'Ticket wird erstellt...' : 'Support-Ticket erstellen'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
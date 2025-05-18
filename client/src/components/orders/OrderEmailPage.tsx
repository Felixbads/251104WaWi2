import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Send, ChevronLeft, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

interface OrderEmailPageProps {
  orderId: number | null;
  supplierEmail?: string;
  orderNumber?: string;
  supplierName?: string;
  onSendEmail?: (supplierEmail: string, additionalNotes: string) => void;
  onBack?: () => void;
  onNext?: () => void;
}

/**
 * OrderEmailPage Komponente
 * 
 * Diese Komponente stellt ein Formular für das Versenden von Bestellungen per E-Mail dar.
 */
const OrderEmailPage: React.FC<OrderEmailPageProps> = ({
  orderId,
  supplierEmail,
  orderNumber,
  supplierName,
  onSendEmail,
  onBack,
  onNext
}) => {
  const { toast } = useToast();
  
  // State-Variablen
  const [emailAddress, setEmailAddress] = useState(supplierEmail || '');
  const [emailSubject, setEmailSubject] = useState(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
  const [emailText, setEmailText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [isLoading, setIsLoading] = useState(false);

  // Lade E-Mail-Vorlage bei Komponenteninitialisierung oder Wechsel des Templates
  useEffect(() => {
    if (!orderId) return;
    
    const loadTemplate = async () => {
      setIsLoading(true);
      try {
        const response = await apiRequest(`/api/orders/${orderId}/email-template?type=${selectedTemplate}`);
        
        if (response && response.content) {
          setEmailText(response.content);
          
          // Wenn Betreff in der API-Antwort vorhanden ist, diesen setzen
          if (response.subject) {
            setEmailSubject(response.subject);
          }
        } else {
          throw new Error('Ungültige Antwort vom Server');
        }
      } catch (error) {
        console.error('Fehler beim Laden der E-Mail-Vorlage:', error);
        toast({
          title: 'Fehler beim Laden der Vorlage',
          description: 'Die E-Mail-Vorlage konnte nicht geladen werden.',
          variant: 'destructive',
        });
        
        // Fallback: Einfache Standard-E-Mail
        setEmailText(`Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:
{'{{orderItems}}'}

Mit freundlichen Grüßen
Ihr Proviantomat Team`);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadTemplate();
  }, [orderId, selectedTemplate, orderNumber, supplierName, toast]);
  
  // Handler für Template-Auswahl
  const handleTemplateChange = (value: string) => {
    setSelectedTemplate(value);
  };
  
  // E-Mail senden
  const handleSendEmail = async () => {
    if (!orderId) {
      toast({
        title: 'Fehler',
        description: 'Keine Bestellungs-ID vorhanden',
        variant: 'destructive',
      });
      return;
    }
    
    if (!emailAddress) {
      toast({
        title: 'E-Mail-Adresse fehlt',
        description: 'Bitte geben Sie eine E-Mail-Adresse ein',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSending(true);
    
    try {
      // API-Anfrage zum Senden der E-Mail
      const response = await apiRequest(`/api/orders/${orderId}/send-email`, {
        to: emailAddress,
        subject: emailSubject,
        content: emailText,
      }, 'post');
      
      if (response && response.success) {
        toast({
          title: 'E-Mail gesendet',
          description: 'Die Bestellung wurde erfolgreich per E-Mail versendet.',
        });
        
        // Callback aufrufen, falls vorhanden
        if (onSendEmail) {
          onSendEmail(emailAddress, emailText);
        }
        
        // Zum nächsten Schritt gehen, falls vorhanden
        if (onNext) {
          setTimeout(() => onNext(), 1500);
        }
      } else {
        throw new Error(response?.message || 'Unbekannter Fehler beim E-Mail-Versand');
      }
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      toast({
        title: 'Fehler beim Senden',
        description: `Die E-Mail konnte nicht gesendet werden: ${(error as Error).message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Bestellung per E-Mail versenden</h2>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Einstellungen</CardTitle>
            <CardDescription>
              Die Bestellung wird per E-Mail an den Lieferanten gesendet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Empfänger E-Mail-Adresse</Label>
              <Input
                id="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="lieferant@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Betreff</Label>
              <Input
                id="subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Vorlage</Label>
              <Tabs value={selectedTemplate} onValueChange={handleTemplateChange} defaultValue="standard">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="standard">Standard</TabsTrigger>
                  <TabsTrigger value="urgent">Dringend</TabsTrigger>
                  <TabsTrigger value="reorder">Nachbestellung</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Inhalt</CardTitle>
            <CardDescription>
              Der Inhalt der E-Mail mit den Bestellpositionen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span>Vorlage wird geladen...</span>
              </div>
            ) : (
              <Textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                className="h-[200px] font-mono"
              />
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Der Platzhalter {'{{orderItems}}'} wird durch die Artikeltabelle ersetzt
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ChevronLeft className="mr-2 h-4 w-4" /> Zurück
              </Button>
            )}
            <div className="space-x-2">
              <Button 
                onClick={handleSendEmail} 
                disabled={isSending || !emailAddress || isLoading}
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gesendet...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    E-Mail senden
                  </>
                )}
              </Button>
              {onNext && (
                <Button variant="outline" onClick={onNext} disabled={isSending}>
                  Überspringen <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default OrderEmailPage;
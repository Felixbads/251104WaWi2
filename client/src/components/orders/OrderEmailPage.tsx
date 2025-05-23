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
  
  // Debugging: Mounten/Unmounten der Komponente loggen
  useEffect(() => {
    console.log('[OrderEmailPage] mounted, props:', { onNext, autoSend: (onNext !== undefined) });
    return () => console.log('[OrderEmailPage] unmount');
  }, []);
  
  // State-Variablen
  const [emailAddress, setEmailAddress] = useState(supplierEmail || '');
  const [emailSubject, setEmailSubject] = useState(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
  const [emailText, setEmailText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Lade E-Mail-Vorlage bei Komponenteninitialisierung oder Wechsel des Templates
  useEffect(() => {
    if (!orderId) return;
    
    const loadTemplate = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fix 1: Korrekter GET-Request ohne method: 'POST'
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const directResponse = await fetch(`/api/orders/${orderId}/email-template?type=${selectedTemplate}`, {
          method: 'GET',
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        });
        
        if (directResponse.ok) {
          const templateData = await directResponse.json();
          console.log("E-Mail-Vorlage geladen:", templateData);
          
          if (templateData && templateData.subject && templateData.content) {
            // Verwende die Vorlage direkt vom Server
            setEmailSubject(templateData.subject);
            setEmailText(templateData.content);
          } else {
            throw new Error('Keine gültige E-Mail-Vorlage gefunden');
          }
        } else {
          // Versuche alternativ, die Vorlage über den direkten SQL-Endpunkt zu laden
          const fallbackResponse = await fetch('/api/email-templates-direct');
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            console.log("Fallback: E-Mail-Vorlagen geladen:", fallbackData);
            
            if (fallbackData && fallbackData.success && Array.isArray(fallbackData.data) && fallbackData.data.length > 0) {
              // Wähle die passende Vorlage basierend auf dem Template-Typ
              const template = fallbackData.data.find((tpl: any) => {
                if (selectedTemplate === 'urgent' && tpl.name.toLowerCase().includes('dringend')) return true;
                if (selectedTemplate === 'reorder' && tpl.name.toLowerCase().includes('nachbestellung')) return true;
                if (selectedTemplate === 'standard' && tpl.is_default) return true;
                return false;
              }) || fallbackData.data[0]; // Fallback zur ersten Vorlage
              
              // Formatiere die Vorlage mit den verfügbaren Daten
              // Vorlage mit Handlebars-ähnlichen Platzhaltern
              setEmailSubject(template.subject
                .replace('{{orderNumber}}', orderNumber || '')
                .replace('{{date}}', new Date().toLocaleDateString('de-DE'))
                .replace('{{supplier}}', supplierName || '')
              );
              
              // Text speichern zum späteren Ersetzen
              setEmailText(template.body);
            } else {
              throw new Error('Keine E-Mail-Vorlagen gefunden');
            }
          } else {
            throw new Error('Ungültige Antwort vom Server');
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden der E-Mail-Vorlage:', error);
        
        // Fix 2: Keine störenden Toast-Nachrichten mehr bei Template-Fehlern
        console.log('E-Mail-Vorlage konnte nicht geladen werden, verwende Standard-Template');
        
        // Standard-Template setzen aber Dialog OFFEN lassen
        const supplierText = supplierName ? ` von ${supplierName}` : '';
        const orderText = orderNumber ? ` (Bestellnummer: ${orderNumber})` : '';
        
        setEmailText(`Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel${supplierText}${orderText}:

{{orderItems}}

Bitte bestätigen Sie den Eingang dieser Bestellung.

Mit freundlichen Grüßen
Ihr Proviantomat Team`);
        
        setEmailSubject(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
        setError(null); // Error zurücksetzen, da wir Fallback verwenden
        return; // Dialog bleibt geöffnet
      } finally {
        setIsLoading(false);
      }
    };
    
    loadTemplate();
  }, [orderId, selectedTemplate, orderNumber, supplierName]);
  
  // Bestellpositionen über den direkten SQL-Endpunkt laden
  useEffect(() => {
    if (!orderId) return;
    
    const loadOrderItems = async () => {
      try {
        console.log(`Lade Bestellpositionen für Bestellung ${orderId} über direkten SQL-Endpunkt`);
        
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const response = await fetch(`/api/order-items-direct/${orderId}`, {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Laden der Bestellpositionen: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Bestellpositionen geladen:', result);
        
        if (result && result.success && Array.isArray(result.data)) {
          // Daten transformieren in das Format, das die E-Mail benötigt
          interface OrderItem {
            id: number;
            product_id: string | number;
            product_name: string;
            quantity: number;
            price: number;
            unit: string;
          }
          
          const formattedItems = result.data.map((item: OrderItem) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name || 'Unbekanntes Produkt',
            quantity: item.quantity || 0,
            price: item.price || 0,
            unit: item.unit || 'Stück',
            totalPrice: (item.quantity || 0) * (item.price || 0)
          }));
          
          setOrderItems(formattedItems);
        } else {
          throw new Error('Unerwartetes Format der Bestellpositionen');
        }
      } catch (error) {
        console.error('Fehler beim Laden der Bestellpositionen:', error);
        setError('Bestellpositionen konnten nicht geladen werden');
        setOrderItems([]);
      }
    };
    
    loadOrderItems();
  }, [orderId]);

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
        content: prepareEmailContent(),
        templateType: selectedTemplate,
      });
      
      if (response && response.success) {
        toast({
          title: 'E-Mail gesendet',
          description: `Die Bestellung wurde erfolgreich an ${emailAddress} gesendet.`,
        });
        
        // Callback aufrufen
        if (onSendEmail) {
          onSendEmail(emailAddress, '');
        }
        
        // E-Mail wurde gesendet - Status setzen
        setEmailSent(true);
        
        // Nach erfolgreichem Versand der E-Mail gehen wir zum nächsten Schritt
        // ABER NUR wenn dieser Button explizit geklickt wurde
        if (onNext) {
          console.log('[OrderEmailPage] E-Mail erfolgreich gesendet, Navigation zum nächsten Schritt wird ausgeführt');
          // Rufe die onNext-Funktion auf, um zur Übersicht zurückzukehren
          onNext();
        } else {
          console.log('[OrderEmailPage] no onNext callback passed');
        }
      } else {
        throw new Error(response?.message || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      
      // Verbesserte Fehlerbehandlung für bessere Diagnose
      let errorMessage = 'Unbekannter Fehler';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Falls es ein JSON-Parse-Fehler ist, zeige eine klarere Nachricht
        if (error.message.includes('Unexpected token') || error.message.includes('JSON')) {
          errorMessage = 'Server-Antwort konnte nicht verarbeitet werden. Möglicherweise ist das E-Mail-System nicht korrekt konfiguriert.';
        }
      }
      
      toast({
        title: 'Fehler beim Senden',
        description: `Die E-Mail konnte nicht gesendet werden: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };
  
  // Helper-Funktion zur Vorbereitung des E-Mail-Inhalts
  const prepareEmailContent = () => {
    if (!orderItems || orderItems.length === 0) {
      return emailText.replace('{{orderItems}}', 'Keine Bestellpositionen vorhanden');
    }
    
    // Artikel-HTML für die E-Mail erstellen
    let orderItemsHtml = '<ul>';
    orderItems.forEach(item => {
      orderItemsHtml += `<li>${item.quantity} ${item.unit} ${item.productName} (${item.price.toFixed(2)} € je ${item.unit})</li>`;
    });
    orderItemsHtml += '</ul>';
    
    // Total berechnen
    const total = orderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    
    // Ersatz des Platzhalters im E-Mail-Text
    return emailText
      .replace('{{orderItems}}', orderItemsHtml)
      .replace('{{totalAmount}}', total.toFixed(2));
  };
  
  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Einstellungen</CardTitle>
            <CardDescription>
              Details für den E-Mail-Versand
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
          </CardContent>
        </Card>
      </div>
      
      {/* Bestellpositionen-Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>
            Diese Positionen werden in der E-Mail enthalten sein
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderItems.length === 0 ? (
            <div className="text-center p-4">
              <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p>Keine Bestellpositionen vorhanden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">Produkt</th>
                    <th className="py-2 text-right">Menge</th>
                    <th className="py-2 text-right">Einheit</th>
                    <th className="py-2 text-right">Einzelpreis</th>
                    <th className="py-2 text-right">Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2">{item.productName}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{item.unit}</td>
                      <td className="py-2 text-right">{item.price?.toFixed(2)} €</td>
                      <td className="py-2 text-right">{(item.quantity * item.price)?.toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={4} className="py-2 text-right">Gesamtbetrag:</td>
                    <td className="py-2 text-right">
                      {orderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        
        {emailSent ? (
          <Button
            onClick={() => {
              console.log('[OrderEmailPage] user closed the dialog');
              if (onNext) {
                onNext?.();
              }
            }}
            className="flex items-center"
          >
            <ChevronRight className="h-4 w-4 mr-2" />
            Zur Übersicht
          </Button>
        ) : (
          <Button
            onClick={handleSendEmail}
            disabled={isSending || isLoading}
            className="flex items-center"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                E-Mail senden
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default OrderEmailPage;
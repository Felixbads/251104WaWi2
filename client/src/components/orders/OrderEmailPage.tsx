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
  const [emailAddress, setEmailAddress] = useState('');
  const [ccEmails, setCcEmails] = useState('andreas@proviantomat.de, einkauf@proviantomat.de');
  const [emailSubject, setEmailSubject] = useState(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
  const [emailText, setEmailText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);

  // Load order data and supplier information on component mount
  useEffect(() => {
    if (!orderId) return;
    
    const loadOrderAndSupplierData = async () => {
      try {
        // Set supplier email from props immediately if available
        if (supplierEmail && supplierEmail !== 'lieferant@example.com') {
          console.log('Lieferanten-E-Mail aus Props:', supplierEmail);
          setEmailAddress(supplierEmail);
        } else {
          // Try loading from order data if props don't have it
          console.log('Keine Lieferanten-E-Mail in Props, lade aus Bestelldaten');
        }
        
        // Load order data to get supplier information
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const orderResponse = await fetch(`/api/orders/${orderId}`, {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        });
        
        if (orderResponse.ok) {
          const orderData = await orderResponse.json();
          console.log('Bestelldaten geladen:', orderData);
          
          // Set supplier email and ID - prioritize props over order data
          const supplierEmailFromOrder = orderData.supplier_email || orderData.supplierEmail;
          if (!emailAddress && supplierEmailFromOrder && supplierEmailFromOrder !== 'lieferant@example.com') {
            console.log('Lieferanten-E-Mail aus Bestellung gefunden:', supplierEmailFromOrder);
            setEmailAddress(supplierEmailFromOrder);
          } else if (emailAddress) {
            console.log('Behalte bereits gesetzte E-Mail-Adresse:', emailAddress);
          }
          
          const supplierIdFromOrder = orderData.supplier_id || orderData.supplierId;
          setSupplierId(supplierIdFromOrder);
          
          // Load supplier email templates if supplier ID is available
          if (supplierIdFromOrder) {
            try {
              const templatesResponse = await fetch(`/api/supplier-email-templates/${supplierIdFromOrder}`, {
                headers: {
                  ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                }
              });
              
              if (templatesResponse.ok) {
                const templatesRaw = await templatesResponse.json();
                console.log('E-Mail-Vorlagen (Roh) geladen:', templatesRaw);
                
                // Transform database templates to match expected format
                const templates = templatesRaw.map((template: any) => ({
                  id: template.id,
                  name: template.template_name,
                  subject: template.subject_template,
                  body: template.content_template,
                  isDefault: template.is_default,
                  templateType: template.template_type
                }));
                
                console.log('E-Mail-Vorlagen (transformiert):', templates);
                setAvailableTemplates(templates);
                
                // Select default template if available
                const defaultTemplate = templates.find((t: any) => t.isDefault && t.templateType === 'standard');
                if (defaultTemplate) {
                  console.log('Standard-Vorlage für Lieferant gefunden:', defaultTemplate.name);
                  setSelectedTemplate(defaultTemplate);
                } else if (templates.length > 0) {
                  console.log('Erste verfügbare Vorlage verwenden:', templates[0].name);
                  setSelectedTemplate(templates[0]);
                }
              } else {
                console.log('Keine lieferantenspezifischen Vorlagen gefunden, verwende Standard-Vorlage');
                // Create a standard template using the user's uploaded template
                const standardTemplate = {
                  id: 'standard',
                  name: 'Standard-Vorlage',
                  subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
                  body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{productTable}

Liefertermin: {deliveryDate}
Bestellnummer: {orderNumber}

Lieferanschrift:
Elbsandstein Proviant & Quartier GmbH
Bahnhofstraße 10
01796 Pirna

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`,
                  isDefault: true,
                  templateType: 'standard'
                };
                setAvailableTemplates([standardTemplate]);
                setSelectedTemplate(standardTemplate);
              }
            } catch (error) {
              console.error('Fehler beim Laden der E-Mail-Vorlagen:', error);
              // Create a standard template using the user's uploaded template
              const standardTemplate = {
                id: 'standard',
                name: 'Standard-Vorlage',
                subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
                body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{productTable}

Liefertermin: {deliveryDate}
Bestellnummer: {orderNumber}

Lieferanschrift:
Elbsandstein Proviant & Quartier GmbH
Bahnhofstraße 10
01796 Pirna

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`,
                isDefault: true,
                templateType: 'standard'
              };
              setAvailableTemplates([standardTemplate]);
              setSelectedTemplate(standardTemplate);
            }
          } else {
            // No supplier ID found, use standard template
            const standardTemplate = {
              id: 'standard',
              name: 'Standard-Vorlage',
              subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
              body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{productTable}

Bestellnummer: {orderNumber}
Bestelldatum: ${new Date().toLocaleDateString('de-DE')}
Gewünschter Liefertermin: {deliveryDate}

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`,
              isDefault: true,
              templateType: 'standard'
            };
            setAvailableTemplates([standardTemplate]);
            setSelectedTemplate(standardTemplate);
          }
        } else {
          console.error('Fehler beim Laden der Bestelldaten - Status:', orderResponse.status);
          // Use standard template as fallback
          const standardTemplate = {
            id: 'standard',
            name: 'Standard-Vorlage',
            subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
            body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{productTable}

Bestellnummer: {orderNumber}
Bestelldatum: ${new Date().toLocaleDateString('de-DE')}
Gewünschter Liefertermin: {deliveryDate}

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`,
            isDefault: true,
            templateType: 'standard'
          };
          setAvailableTemplates([standardTemplate]);
          setSelectedTemplate(standardTemplate);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Bestelldaten:', error);
        // Use standard template as fallback
        const standardTemplate = {
          id: 'standard',
          name: 'Standard-Vorlage',
          subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
          body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{productTable}

Bestellnummer: {orderNumber}
Bestelldatum: ${new Date().toLocaleDateString('de-DE')}
Gewünschter Liefertermin: {deliveryDate}

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`,
          isDefault: true,
          templateType: 'standard'
        };
        setAvailableTemplates([standardTemplate]);
        setSelectedTemplate(standardTemplate);
      }
    };
    
    loadOrderAndSupplierData();
  }, [orderId, supplierEmail]);

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
            unit_price: number;
            price?: number;
            unit: string;
            vat_rate: number;
            total_price: number;
          }
          
          const formattedItems = result.data.map((item: OrderItem) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name || 'Unbekanntes Produkt',
            quantity: item.quantity || 0,
            unit_price: item.unit_price || item.price || 0,
            price: item.unit_price || item.price || 0,
            unit: item.unit || 'Stück',
            vat_rate: item.vat_rate || 19,
            totalPrice: item.total_price || (item.quantity || 0) * (item.unit_price || item.price || 0)
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

  // Load template content when template selection changes
  useEffect(() => {
    if (selectedTemplate && selectedTemplate.subject && selectedTemplate.body) {
      setEmailSubject(selectedTemplate.subject);
      setEmailText(selectedTemplate.body);
    }
  }, [selectedTemplate]);
  
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
      console.log(`[OrderEmailPage] Sende E-Mail für Bestellung ${orderId} an ${emailAddress}`);
      // API-Anfrage zum Senden der E-Mail - verwende POST Methode explizit
      const response = await apiRequest(`/api/orders/${orderId}/send-email`, {
        to: emailAddress,
        supplierEmail: emailAddress, // Backend erwartet auch supplierEmail
        subject: emailSubject,
        content: prepareEmailContent(),
        templateType: selectedTemplate,
        additionalNotes: ''
      }, 'post');
      
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
        
        // Nach erfolgreichem Versand der E-Mail NICHT automatisch weiterleiten
        // Benutzer bleibt auf der E-Mail-Seite und kann manuell zurück navigieren
        console.log('[OrderEmailPage] E-Mail erfolgreich gesendet, Benutzer bleibt auf der E-Mail-Seite');
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
      return emailText.replace(/\{productTable\}|\{\{orderItems\}\}/g, 'Keine Bestellpositionen vorhanden');
    }
    
    // HTML-Tabelle für die Bestellpositionen erstellen
    let productTableHtml = `
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="text-align: left; padding: 8px;">Menge</th>
            <th style="text-align: left; padding: 8px;">Produktname</th>
            <th style="text-align: right; padding: 8px;">Einzelpreis (netto)</th>
            <th style="text-align: right; padding: 8px;">MwSt.</th>
            <th style="text-align: right; padding: 8px;">Gesamtpreis (brutto)</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    let totalNet = 0;
    let totalVat = 0;
    let totalGross = 0;
    
    orderItems.forEach(item => {
      // Use unit_price instead of price and calculate proper totals
      const unitPrice = item.unit_price || item.price || 2.5; // fallback to 2.5 if no price
      const quantity = item.quantity || 0;
      const vatRate = item.vat_rate || 19; // default 19% VAT
      
      const netTotal = quantity * unitPrice;
      const vatAmount = netTotal * (vatRate / 100);
      const grossTotal = netTotal + vatAmount;
      
      totalNet += netTotal;
      totalVat += vatAmount;
      totalGross += grossTotal;
      
      productTableHtml += `
        <tr>
          <td style="padding: 8px;">${quantity} ${item.unit || 'Stk'}</td>
          <td style="padding: 8px;">${item.product_name || item.productName}</td>
          <td style="padding: 8px; text-align: right;">${unitPrice.toFixed(2)} €</td>
          <td style="padding: 8px; text-align: right;">${vatRate}% (${vatAmount.toFixed(2)} €)</td>
          <td style="padding: 8px; text-align: right;">${grossTotal.toFixed(2)} €</td>
        </tr>
      `;
    });
    
    productTableHtml += `
        </tbody>
        <tfoot>
          <tr style="background-color: #f5f5f5;">
            <td colspan="4" style="padding: 8px; text-align: right; font-weight: bold;">Netto-Gesamtsumme:</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${totalNet.toFixed(2)} €</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td colspan="4" style="padding: 8px; text-align: right; font-weight: bold;">MwSt-Gesamtsumme:</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${totalVat.toFixed(2)} €</td>
          </tr>
          <tr style="background-color: #f0f0f0;">
            <td colspan="4" style="padding: 8px; text-align: right; font-weight: bold;">Brutto-Gesamtsumme:</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${totalGross.toFixed(2)} €</td>
          </tr>
        </tfoot>
      </table>
    `;
    
    // Ersatz der Platzhalter im E-Mail-Text
    return emailText
      .replace(/\{productTable\}/g, productTableHtml)
      .replace(/\{\{orderItems\}\}/g, productTableHtml)
      .replace(/\{\{totalAmount\}\}/g, totalGross.toFixed(2))
      .replace(/\{orderNumber\}/g, orderNumber || '')
      .replace(/\{deliveryDate\}/g, new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE'));
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
              <Label htmlFor="cc">CC (Kopie an)</Label>
              <Input
                id="cc"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="andreas@proviantomat.de, einkauf@proviantomat.de"
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
              {availableTemplates.length > 0 ? (
                <Select 
                  value={selectedTemplate?.id?.toString() || ''} 
                  onValueChange={(value) => {
                    const template = availableTemplates.find((t: any) => t.id.toString() === value);
                    setSelectedTemplate(template);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vorlage auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((template: any) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} {template.isDefault ? '(Standard)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-gray-500">
                  Keine E-Mail-Vorlagen verfügbar
                </div>
              )}
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
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
  const [usePdf, setUsePdf] = useState(false);
  const [coverText, setCoverText] = useState('');

  // Load complete email data using the new fixed API endpoint
  useEffect(() => {
    if (!orderId) return;
    
    const loadEmailData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`Lade vollständige E-Mail-Daten für Bestellung ${orderId} mit neuer API`);
        
        const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        const response = await fetch(`/api/orders/${orderId}/email-data`, {
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          }
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Laden der E-Mail-Daten: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Neue E-Mail-API Daten geladen:', data);
        
        if (data.success) {
          setOrderDetails(data);
          
          // Set email addresses from supplier master data
          const correctSupplierEmail = data.supplier.email || supplierEmail || '';
          console.log('Korrekte Lieferanten-E-Mail gefunden:', correctSupplierEmail);
          setEmailAddress(correctSupplierEmail);
          setCcEmails(data.supplier.ccEmails || 'andreas@proviantomat.de,einkauf@proviantomat.de');
          
          // Set available templates
          if (data.emailTemplates && data.emailTemplates.length > 0) {
            console.log('E-Mail-Vorlagen verfügbar:', data.emailTemplates.length);
            setAvailableTemplates(data.emailTemplates);
            
            // Find and apply default template
            const defaultTemplate = data.emailTemplates.find((t: any) => t.isDefault) || data.emailTemplates[0];
            if (defaultTemplate) {
              console.log('Verwende Standard-Vorlage:', defaultTemplate.name);
              setSelectedTemplate(defaultTemplate);
              await generateEmailFromTemplate(defaultTemplate.id, data);
            }
          } else {
            // Create default template if no templates available
            const standardTemplate = {
              id: 'standard',
              name: 'Standard-Vorlage',
              subject: `Bestellung {orderNumber} – Lieferung am {deliveryDate}`,
              body: `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{itemsList}

Bestellnummer: {orderNumber}
Bestelldatum: {orderDate}
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
            await generateEmailFromTemplate('standard', data);
          }
        } else {
          throw new Error('Ungültige Antwort vom Server');
        }
      } catch (error) {
        console.error('Fehler beim Laden der E-Mail-Daten mit neuer API:', error);
        
        // Fallback to props data
        setEmailAddress(supplierEmail || '');
        setEmailSubject(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
        setError(error instanceof Error ? error.message : 'Unbekannter Fehler');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadEmailData();
  }, [orderId, supplierEmail, orderNumber]);

  // Generate email content from template using new API
  const generateEmailFromTemplate = async (templateId: string | number, data?: any) => {
    if (!orderId) return;
    
    try {
      console.log(`Generiere E-Mail mit Vorlage ${templateId} über neue API`);
      
      const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      const response = await fetch(`/api/orders/${orderId}/generate-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ templateId })
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Generieren der E-Mail: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('E-Mail-Inhalt generiert:', result);
      
      if (result.success) {
        setEmailSubject(result.subject);
        setEmailText(result.content);
        
        // Update email addresses if provided
        if (result.supplierEmail) setEmailAddress(result.supplierEmail);
        if (result.ccEmails) setCcEmails(result.ccEmails);
      }
    } catch (error) {
      console.error('Fehler beim Generieren der E-Mail-Inhalt:', error);
      
      // Fallback template generation
      if (data && data.order && data.items) {
        const itemsList = data.items.map((item: any, index: number) => 
          `${index + 1}. ${item.productName || 'Unbekanntes Produkt'} - ${item.quantity || 1} ${item.unit || 'Stk'} à ${(item.unitPrice || 0).toFixed(2)} € = ${(item.totalPrice || 0).toFixed(2)} €`
        ).join('\n');
        
        setEmailSubject(`Bestellung ${data.order.orderNumber} – Lieferung am ${data.order.deliveryDate}`);
        setEmailText(`Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

${itemsList}

Bestellnummer: ${data.order.orderNumber}
Bestelldatum: ${data.order.orderDate}
Gewünschter Liefertermin: ${data.order.deliveryDate}

Gesamtsumme: ${data.order.grossTotal} €

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`);
      }
    }
  };

  // Handle template selection change
  const handleTemplateChange = async (value: string) => {
    const template = availableTemplates.find(t => t.id.toString() === value);
    if (template) {
      console.log('Vorlage gewechselt zu:', template.name);
      setSelectedTemplate(template);
      await generateEmailFromTemplate(template.id, orderDetails);
    }
  };
  
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
      
      // Use the working email API endpoint with PDF support
      const response = await apiRequest(`/api/orders-email-working/${orderId}/send-email-working`, {
        emailAddress: emailAddress,
        subject: emailSubject,
        content: usePdf ? undefined : prepareEmailContent(),
        usePdf: usePdf,
        coverText: usePdf ? coverText : undefined
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
                  onValueChange={handleTemplateChange}
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
            <CardTitle>Versandoptionen</CardTitle>
            <CardDescription>
              Wählen Sie das gewünschte Format für die Bestellung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="usePdf"
                checked={usePdf}
                onChange={(e) => setUsePdf(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="usePdf" className="text-sm font-medium">
                Als PDF-Anhang versenden
              </Label>
            </div>
            
            {usePdf && (
              <div className="space-y-2">
                <Label htmlFor="coverText">Begleittext für PDF</Label>
                <Textarea
                  id="coverText"
                  value={coverText}
                  onChange={(e) => setCoverText(e.target.value)}
                  className="h-[100px]"
                  placeholder="Sehr geehrte Damen und Herren,&#10;&#10;anbei erhalten Sie unsere Bestellung als PDF-Anhang.&#10;&#10;Mit freundlichen Grüßen&#10;Ihr Proviantomat Team"
                />
                <div className="text-xs text-gray-500">
                  Lassen Sie das Feld leer, um einen Standardtext zu verwenden.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Inhalt</CardTitle>
            <CardDescription>
              {usePdf ? 'PDF-Bestellung wird als Anhang versandt' : 'Der Inhalt der E-Mail mit den Bestellpositionen'}
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
                disabled={usePdf}
                placeholder={usePdf ? "Bei PDF-Versand wird der E-Mail-Inhalt automatisch durch den Begleittext ersetzt" : undefined}
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
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="py-3 px-2 text-left">Produkt</th>
                    <th className="py-3 px-2 text-right">Menge</th>
                    <th className="py-3 px-2 text-right">Gebindegröße</th>
                    <th className="py-3 px-2 text-right">Gesamtmenge</th>
                    <th className="py-3 px-2 text-right">Einzelpreis (Netto)</th>
                    <th className="py-3 px-2 text-right">Pfand</th>
                    <th className="py-3 px-2 text-right">Netto</th>
                    <th className="py-3 px-2 text-right">MwSt.</th>
                    <th className="py-3 px-2 text-right">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let totalNet = 0;
                    let totalVat = 0;
                    let totalGross = 0;
                    let totalPfand = 0;

                    const rows = orderItems.map((item, index) => {
                      const unitPrice = item.price || item.unit_price || 0;
                      const quantity = item.quantity || 0;
                      const vatRate = item.vat_rate || 19;
                      const gebindegroesse = item.package_size || item.gebindegroesse || 1;
                      const gesamtmenge = quantity * gebindegroesse;
                      const pfandPerUnit = item.deposit || item.pfand || 0;
                      const pfandTotal = quantity * pfandPerUnit;
                      
                      const netTotal = quantity * unitPrice;
                      const vatAmount = netTotal * (vatRate / 100);
                      const grossTotal = netTotal + vatAmount;
                      
                      totalNet += netTotal;
                      totalVat += vatAmount;
                      totalGross += grossTotal;
                      totalPfand += pfandTotal;

                      return (
                        <tr key={index} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2">{item.productName}</td>
                          <td className="py-2 px-2 text-right">{quantity}</td>
                          <td className="py-2 px-2 text-right">{gebindegroesse}</td>
                          <td className="py-2 px-2 text-right">{gesamtmenge}</td>
                          <td className="py-2 px-2 text-right">{unitPrice.toFixed(2)} €</td>
                          <td className="py-2 px-2 text-right">{pfandTotal.toFixed(2)} €</td>
                          <td className="py-2 px-2 text-right">{netTotal.toFixed(2)} €</td>
                          <td className="py-2 px-2 text-right">{vatAmount.toFixed(2)} €</td>
                          <td className="py-2 px-2 text-right font-medium">{grossTotal.toFixed(2)} €</td>
                        </tr>
                      );
                    });

                    return [...rows, (
                      <tr key="totals" className="font-bold bg-muted/50 border-t-2">
                        <td className="py-3 px-2">Summen:</td>
                        <td className="py-3 px-2"></td>
                        <td className="py-3 px-2"></td>
                        <td className="py-3 px-2"></td>
                        <td className="py-3 px-2"></td>
                        <td className="py-3 px-2 text-right">{totalPfand.toFixed(2)} €</td>
                        <td className="py-3 px-2 text-right">{totalNet.toFixed(2)} €</td>
                        <td className="py-3 px-2 text-right">{totalVat.toFixed(2)} €</td>
                        <td className="py-3 px-2 text-right text-lg">{totalGross.toFixed(2)} €</td>
                      </tr>
                    )];
                  })()}
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
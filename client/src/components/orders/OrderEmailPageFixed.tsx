import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Send, ChevronLeft, ChevronRight, AlertTriangle, Loader2, Check } from 'lucide-react';
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

interface EmailData {
  order: {
    id: number;
    orderNumber: string;
    orderDate: string;
    deliveryDate: string;
    deliveryType: string;
    deliveryAddress: string;
    notes: string;
    netTotal: string;
    vatAmount: string;
    grossTotal: string;
    warehouseName: string;
    warehouseAddress: string;
  };
  supplier: {
    id: number;
    name: string;
    email: string;
    ccEmails: string;
    bccEmails: string;
    signature: string;
  };
  items: Array<{
    id: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit: string;
    category: string;
  }>;
  emailTemplates: Array<{
    id: number;
    name: string;
    subject: string;
    body: string;
    isDefault: boolean;
    templateType: string;
  }>;
}

const OrderEmailPageFixed: React.FC<OrderEmailPageProps> = ({
  orderId,
  supplierEmail,
  orderNumber,
  supplierName,
  onSendEmail,
  onBack,
  onNext
}) => {
  const { toast } = useToast();
  
  // State variables
  const [emailAddress, setEmailAddress] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [bccEmails, setBccEmails] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load complete email data when component mounts
  useEffect(() => {
    if (!orderId) return;
    
    const loadEmailData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`Lade vollständige E-Mail-Daten für Bestellung ${orderId}`);
        
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
        console.log('E-Mail-Daten geladen:', data);
        
        if (data.success) {
          setEmailData(data);
          
          // Set email addresses from supplier data
          setEmailAddress(data.supplier.email || supplierEmail || '');
          setCcEmails(data.supplier.ccEmails || 'andreas@proviantomat.de,einkauf@proviantomat.de');
          setBccEmails(data.supplier.bccEmails || '');
          
          // Find and apply default template
          const defaultTemplate = data.emailTemplates.find(t => t.isDefault) || data.emailTemplates[0];
          if (defaultTemplate) {
            console.log('Verwende Standard-Vorlage:', defaultTemplate.name);
            setSelectedTemplateId(defaultTemplate.id);
            await generateEmailFromTemplate(defaultTemplate.id, data);
          }
        } else {
          throw new Error('Ungültige Antwort vom Server');
        }
      } catch (error) {
        console.error('Fehler beim Laden der E-Mail-Daten:', error);
        setError(error instanceof Error ? error.message : 'Unbekannter Fehler');
        
        // Set basic fallback data
        setEmailAddress(supplierEmail || '');
        setEmailSubject(`Bestellung ${orderNumber || ''} vom ${new Date().toLocaleDateString('de-DE')}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadEmailData();
  }, [orderId, supplierEmail, orderNumber]);

  // Generate email content from template
  const generateEmailFromTemplate = async (templateId: number, data?: EmailData) => {
    if (!orderId) return;
    
    try {
      console.log(`Generiere E-Mail mit Vorlage ${templateId}`);
      
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
      console.log('E-Mail generiert:', result);
      
      if (result.success) {
        setEmailSubject(result.subject);
        setEmailContent(result.content);
        
        // Update email addresses if provided
        if (result.supplierEmail) setEmailAddress(result.supplierEmail);
        if (result.ccEmails) setCcEmails(result.ccEmails);
        if (result.bccEmails) setBccEmails(result.bccEmails);
      }
    } catch (error) {
      console.error('Fehler beim Generieren der E-Mail:', error);
      toast({
        title: 'Fehler beim Generieren der E-Mail',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    }
  };

  // Handle template selection change
  const handleTemplateChange = async (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplateId(id);
    await generateEmailFromTemplate(id, emailData);
  };

  // Handle email sending
  const handleSendEmail = async () => {
    if (!emailAddress || !emailSubject || !emailContent) {
      toast({
        title: 'Fehlende Daten',
        description: 'Bitte füllen Sie alle erforderlichen Felder aus',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSending(true);
    
    try {
      console.log('Sende E-Mail:', { emailAddress, emailSubject });
      
      const emailData = {
        to: emailAddress,
        cc: ccEmails,
        bcc: bccEmails,
        subject: emailSubject,
        htmlContent: emailContent.replace(/\n/g, '<br>'),
        useTemplate: true,
        templateId: selectedTemplateId
      };
      
      const result = await apiRequest(`/orders/${orderId}/send-email`, {
        method: 'POST',
        body: JSON.stringify(emailData)
      });
      
      console.log('E-Mail gesendet:', result);
      
      toast({
        title: 'E-Mail erfolgreich gesendet',
        description: `Die Bestellung wurde an ${emailAddress} gesendet.`
      });
      
      // Callback to parent component
      if (onSendEmail) {
        onSendEmail(emailAddress, emailContent);
      }
      
      // Auto-proceed to next step if available
      if (onNext) {
        setTimeout(() => onNext(), 1500);
      }
      
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      toast({
        title: 'Fehler beim Senden der E-Mail',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Lade E-Mail-Daten...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="py-12">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Fehler beim Laden der E-Mail-Daten</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          E-Mail an Lieferanten senden
        </CardTitle>
        <CardDescription>
          Bestellung {emailData?.order.orderNumber} an {emailData?.supplier.name} senden
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Template Selection */}
        {emailData?.emailTemplates && emailData.emailTemplates.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="template">E-Mail-Vorlage</Label>
            <Select value={selectedTemplateId?.toString() || ''} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue placeholder="Vorlage auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {emailData.emailTemplates.map(template => (
                  <SelectItem key={template.id} value={template.id.toString()}>
                    {template.name} {template.isDefault && '(Standard)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Email Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail-Adresse *</Label>
            <Input
              id="email"
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="lieferant@example.com"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cc">CC-Empfänger</Label>
            <Input
              id="cc"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="cc@example.com, cc2@example.com"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Betreff *</Label>
          <Input
            id="subject"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Bestellbetreff"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">E-Mail-Inhalt *</Label>
          <Textarea
            id="content"
            value={emailContent}
            onChange={(e) => setEmailContent(e.target.value)}
            rows={12}
            placeholder="E-Mail-Inhalt..."
            required
          />
        </div>

        {/* Order Summary */}
        {emailData && (
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Bestellzusammenfassung</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Bestellnummer:</span> {emailData.order.orderNumber}
              </div>
              <div>
                <span className="font-medium">Liefertermin:</span> {emailData.order.deliveryDate}
              </div>
              <div>
                <span className="font-medium">Artikel:</span> {emailData.items.length}
              </div>
              <div>
                <span className="font-medium">Gesamtbetrag:</span> {emailData.order.grossTotal} €
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="flex space-x-2">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
          )}
        </div>
        
        <div className="flex space-x-2">
          <Button 
            onClick={handleSendEmail} 
            disabled={isSending || !emailAddress || !emailSubject || !emailContent}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sende...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                E-Mail senden
              </>
            )}
          </Button>
          
          {onNext && (
            <Button variant="outline" onClick={onNext}>
              Weiter
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default OrderEmailPageFixed;
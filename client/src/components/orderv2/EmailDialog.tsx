import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send, Eye, Code } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  supplierEmail: string;
  orderNumber: string;
  supplierName: string;
  onSendEmail: (success: boolean) => void;
}

export default function EmailDialog({ 
  open, 
  onOpenChange, 
  orderId, 
  supplierEmail, 
  orderNumber, 
  supplierName, 
  onSendEmail 
}: EmailDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [useTemplate, setUseTemplate] = useState(true);
  const [emailData, setEmailData] = useState({
    to: '',
    cc: 'andreas@proviantomat.de,einkauf@proviantomat.de',
    bcc: '',
    subject: '',
    htmlContent: '',
  });
  
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [previewTab, setPreviewTab] = useState('preview');
  const [editTab, setEditTab] = useState('edit');

  // Load supplier template and default values when dialog opens
  useEffect(() => {
    if (open && orderId) {
      loadEmailTemplate();
    }
  }, [open, orderId]);

  const loadEmailTemplate = async () => {
    try {
      setIsLoading(true);

      // Try to load order data and create comprehensive email template
      let orderData = null;
      try {
        const orderResponse = await fetch(`/api/orders-direct/${orderId}`);
        if (orderResponse.ok) {
          orderData = await orderResponse.json();
        }
      } catch (error) {
        console.log('Could not load order data, using basic template');
      }

      // Load order items
      let orderItems = [];
      try {
        const itemsResponse = await fetch(`/api/order-items-direct/${orderId}`);
        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          orderItems = itemsData.data || [];
        }
      } catch (error) {
        console.log('Could not load order items');
      }

      // Create comprehensive email template
      const subject = `Bestellung ${orderNumber || orderId} - ${supplierName}`;
      
      // Build detailed HTML content
      let htmlContent = `
        <h2>Neue Bestellung</h2>
        <p>Sehr geehrte Damen und Herren,</p>
        <p>hiermit erhalten Sie eine neue Bestellung mit der Nummer <strong>${orderNumber || orderId}</strong>.</p>
        
        <h3>Bestelldetails:</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f5f5f5;">
            <td><strong>Bestellnummer:</strong></td>
            <td>${orderNumber || orderId}</td>
          </tr>
          <tr>
            <td><strong>Lieferant:</strong></td>
            <td>${supplierName}</td>
          </tr>
          <tr>
            <td><strong>Lager:</strong></td>
            <td>${orderData?.warehouse_name || 'Nicht angegeben'}</td>
          </tr>
          <tr>
            <td><strong>Gewünschter Liefertermin:</strong></td>
            <td>${orderData?.expected_delivery_date ? new Date(orderData.expected_delivery_date).toLocaleDateString('de-DE') : 'Nicht angegeben'}</td>
          </tr>
        </table>
      `;

      // Add order items if available
      if (orderItems.length > 0) {
        htmlContent += `
          <h3>Bestellpositionen:</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th>Artikel</th>
                <th>Menge</th>
                <th>Einheit</th>
                <th>Einzelpreis</th>
                <th>Gesamtpreis</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        let totalAmount = 0;
        orderItems.forEach((item: any) => {
          const itemTotal = item.total_price || (item.quantity * item.unit_price);
          totalAmount += itemTotal;
          htmlContent += `
            <tr>
              <td>${item.product_name || 'Unbekanntes Produkt'}</td>
              <td>${item.quantity || 0}</td>
              <td>${item.unit || 'Stk'}</td>
              <td>${item.unit_price ? item.unit_price.toFixed(2) + ' €' : 'N/A'}</td>
              <td>${itemTotal ? itemTotal.toFixed(2) + ' €' : 'N/A'}</td>
            </tr>
          `;
        });
        
        htmlContent += `
            <tr style="background-color: #f5f5f5; font-weight: bold;">
              <td colspan="4">Gesamtsumme:</td>
              <td>${totalAmount.toFixed(2)} €</td>
            </tr>
            </tbody>
          </table>
        `;
      }

      htmlContent += `
        <h3>Weitere Informationen:</h3>
        <p>Bei Fragen zur Bestellung stehen wir Ihnen gerne zur Verfügung.</p>
        <p>Mit freundlichen Grüßen<br>
        Ihr Proviantomat-Team</p>
        
        <hr>
        <p style="font-size: 12px; color: #666;">
        Proviantomat<br>
        E-Mail: einkauf@proviantomat.de<br>
        Diese E-Mail wurde automatisch generiert.
        </p>
      `;

      setEmailData(prev => ({
        ...prev,
        subject: subject,
        htmlContent: htmlContent,
      }));

      // Use supplier email from order data if available
      const supplierEmail = orderData?.supplier_email || '';
      console.log('Setting supplier email from order data:', supplierEmail);
      
      setEmailData(prev => ({
        ...prev,
        to: supplierEmail || 'test@example.com',
        cc: 'andreas@proviantomat.de, einkauf@proviantomat.de',
      }));

    } catch (error) {
      console.error('Error loading email template:', error);
      
      // Set minimal fallback data even on error
      setEmailData(prev => ({
        ...prev,
        subject: `Bestellung ${orderNumber || orderId}`,
        htmlContent: '<p>Bestellung wurde erstellt.</p>',
        to: 'test@example.com',
        cc: 'andreas@proviantomat.de, einkauf@proviantomat.de',
      }));
      
      toast({
        title: "Warnung",
        description: "E-Mail-Vorlage konnte nicht vollständig geladen werden. Basisvorlage wird verwendet.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailData.to.trim()) {
      toast({
        title: "Fehler",
        description: "E-Mail-Adresse des Empfängers ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    if (!emailData.subject.trim()) {
      toast({
        title: "Fehler",
        description: "Betreff ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`/api/send-email-simple/${orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to.trim(),
          cc: emailData.cc.trim() || undefined,
          bcc: emailData.bcc.trim() || undefined,
          subject: emailData.subject.trim(),
          content: emailData.htmlContent.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Erfolg",
          description: "E-Mail erfolgreich gesendet",
        });
        onSendEmail(true);
        onOpenChange(false);
      } else {
        throw new Error(result.error || 'Fehler beim Senden der E-Mail');
      }

    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Fehler beim Senden der E-Mail",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setEmailData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            E-Mail senden - Bestellung {orderNumber || orderId}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="useTemplate"
                checked={useTemplate}
                onCheckedChange={setUseTemplate}
              />
              <Label htmlFor="useTemplate">
                E-Mail-Vorlage verwenden
              </Label>
            </div>
            
            {useTemplate && availableTemplates.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="templateSelect">Vorlage auswählen</Label>
                <Select
                  value={selectedTemplate?.id?.toString() || ''}
                  onValueChange={(value) => {
                    const template = availableTemplates.find((t: any) => t.id.toString() === value);
                    setSelectedTemplate(template);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vorlage auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((template: any) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} {template.isDefault ? '(Standard)' : ''} - {template.templateType === 'urgent' ? 'DRINGEND' : 'Normal'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate.description || 'Keine Beschreibung verfügbar'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Recipient */}
          <div className="space-y-2">
            <Label htmlFor="to">An (E-Mail-Adresse) *</Label>
            <Input
              id="to"
              type="email"
              value={emailData.to}
              onChange={(e) => handleInputChange('to', e.target.value)}
              placeholder="lieferant@beispiel.de"
              required
            />
          </div>

          {/* CC */}
          <div className="space-y-2">
            <Label htmlFor="cc">CC (optional)</Label>
            <Input
              id="cc"
              type="text"
              value={emailData.cc}
              onChange={(e) => handleInputChange('cc', e.target.value)}
              placeholder="andreas@proviantomat.de, einkauf@proviantomat.de"
            />
            <p className="text-sm text-muted-foreground">
              Mehrere E-Mail-Adressen durch Komma trennen
            </p>
          </div>

          {/* BCC */}
          <div className="space-y-2">
            <Label htmlFor="bcc">BCC (optional)</Label>
            <Input
              id="bcc"
              type="email"
              value={emailData.bcc}
              onChange={(e) => handleInputChange('bcc', e.target.value)}
              placeholder="bcc@beispiel.de"
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Betreff *</Label>
            <Input
              id="subject"
              value={emailData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              placeholder="Bestellung vom [Datum]"
              required
            />
          </div>

          {/* HTML Preview Section */}
          <div className="space-y-2">
            <Label>E-Mail-Vorschau</Label>
            <Tabs value={previewTab} onValueChange={setPreviewTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Vorschau
                </TabsTrigger>
                <TabsTrigger value="html" className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  HTML-Code
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-2">
                <div className="border rounded-md p-4 bg-white min-h-[300px] max-h-[400px] overflow-y-auto">
                  {emailData.htmlContent ? (
                    <div 
                      dangerouslySetInnerHTML={{ __html: emailData.htmlContent }}
                      className="prose prose-sm max-w-none"
                    />
                  ) : (
                    <p className="text-muted-foreground italic">E-Mail-Inhalt wird automatisch generiert basierend auf der Bestellung</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="html" className="mt-2">
                <div className="border rounded-md p-4 bg-gray-50 min-h-[300px] max-h-[400px] overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {emailData.htmlContent || '<!-- E-Mail-Inhalt wird automatisch generiert -->'}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Custom Content (only if not using template) */}
          {!useTemplate && (
            <div className="space-y-2">
              <Label>E-Mail-Inhalt (HTML) (optional)</Label>
              <Tabs value={editTab} onValueChange={setEditTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit" className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Bearbeiten
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    HTML-Vorschau
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="mt-2">
                  <Textarea
                    id="htmlContent"
                    value={emailData.htmlContent}
                    onChange={(e) => handleInputChange('htmlContent', e.target.value)}
                    placeholder="Benutzerdefinierter E-Mail-Inhalt..."
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Leer lassen, um die Standard-Vorlage zu verwenden
                  </p>
                </TabsContent>
                <TabsContent value="preview" className="mt-2">
                  <div className="border rounded-md p-4 bg-white min-h-[250px] max-h-[350px] overflow-y-auto">
                    {emailData.htmlContent ? (
                      <div 
                        dangerouslySetInnerHTML={{ __html: emailData.htmlContent }}
                        className="prose prose-sm max-w-none"
                      />
                    ) : (
                      <p className="text-muted-foreground italic">Kein Inhalt vorhanden - Standard-Vorlage wird verwendet</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Order Info */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Bestellinformationen</h4>
            <div className="text-sm space-y-1">
              <p><strong>Lieferant:</strong> {supplierName || 'Unbekannt'}</p>
              <p><strong>Bestellnummer:</strong> {orderNumber || orderId}</p>
              <p><strong>E-Mail:</strong> {supplierEmail || 'Nicht angegeben'}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button onClick={handleSendEmail} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                E-Mail senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
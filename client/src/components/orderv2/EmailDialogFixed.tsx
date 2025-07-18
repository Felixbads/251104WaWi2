import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Mail, Send, Eye, FileText } from 'lucide-react';

interface EmailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  orderNumber?: string;
  supplierName?: string;
  supplierEmail?: string;
  onSendEmail: (success: boolean) => void;
}

interface EmailTemplate {
  id: number;
  template_name: string;
  template_type: string;
  subject_template: string;
  content_template: string;
}

export default function EmailDialogFixed({
  isOpen,
  onOpenChange,
  orderId,
  orderNumber,
  supplierName,
  supplierEmail,
  onSendEmail
}: EmailDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  
  const [emailData, setEmailData] = useState({
    to: '',
    cc: 'andreas@proviantomat.de, einkauf@proviantomat.de',
    bcc: '',
    subject: '',
    content: '',
  });

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [orderData, setOrderData] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);

  // Load order data and email templates on dialog open
  useEffect(() => {
    if (isOpen) {
      loadOrderData();
      loadEmailTemplates();
    }
  }, [isOpen, orderId]);

  const loadOrderData = async () => {
    try {
      // Load order details
      const orderResponse = await fetch(`/api/orders-direct/${orderId}`);
      if (orderResponse.ok) {
        const order = await orderResponse.json();
        setOrderData(order);
        
        // Set supplier email automatically
        const emailAddress = order.supplier_email || supplierEmail || '';
        setEmailData(prev => ({
          ...prev,
          to: emailAddress,
          subject: `Bestellung ${orderNumber || order.order_number || orderId} - ${supplierName || order.supplier_name || ''}`,
        }));
      }

      // Load order items
      const itemsResponse = await fetch(`/api/order-items-direct/${orderId}`);
      if (itemsResponse.ok) {
        const itemsData = await itemsResponse.json();
        setOrderItems(itemsData.data || []);
      }
    } catch (error) {
      console.error('Error loading order data:', error);
    }
  };

  const loadEmailTemplates = async () => {
    try {
      const response = await fetch('/api/supplier-email-templates');
      if (response.ok) {
        const templatesData = await response.json();
        setTemplates(templatesData.templates || []);
      }
    } catch (error) {
      console.error('Error loading email templates:', error);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id.toString() === templateId);
    if (!template) return;

    // Generate comprehensive email content using template
    let subject = template.subject_template || '';
    let content = template.content_template || '';

    // Replace template variables
    const orderNumber = orderData?.order_number || orderId.toString();
    const orderDate = orderData?.order_date ? new Date(orderData.order_date).toLocaleDateString('de-DE') : new Date().toLocaleDateString('de-DE');
    const deliveryDate = orderData?.expected_delivery_date ? new Date(orderData.expected_delivery_date).toLocaleDateString('de-DE') : 'Nach Vereinbarung';
    const supplier = supplierName || orderData?.supplier_name || 'Sehr geehrte Damen und Herren';
    const warehouse = orderData?.warehouse_name || 'Unbekanntes Lager';

    // Calculate totals
    let totalNet = 0;
    let totalGross = 0;
    orderItems.forEach(item => {
      const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
      totalNet += itemTotal;
      totalGross += itemTotal * (1 + (orderData?.vatRate || 0.19));
    });

    // Create product table
    const productTableRows = orderItems.map((item, index) => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.product_name || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity || 0}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.unit || 'Stk'}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(item.unit_price || 0).toFixed(2)} €</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)} €</td>
      </tr>
    `).join('');

    const productTable = `
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px;">Pos.</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Artikel</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Menge</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Einheit</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Einzelpreis</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Gesamtpreis</th>
          </tr>
        </thead>
        <tbody>
          ${productTableRows}
          <tr style="background-color: #f5f5f5; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtsumme netto:</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${totalNet.toFixed(2)} €</td>
          </tr>
          <tr style="background-color: #f5f5f5; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">zzgl. 19% MwSt:</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(totalGross - totalNet).toFixed(2)} €</td>
          </tr>
          <tr style="background-color: #e9ecef; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtsumme brutto:</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${totalGross.toFixed(2)} €</td>
          </tr>
        </tbody>
      </table>
    `;

    // Template variable replacements
    const replacements = {
      '{orderNumber}': orderNumber,
      '{orderDate}': orderDate,
      '{deliveryDate}': deliveryDate,
      '{supplierName}': supplier,
      '{warehouseName}': warehouse,
      '{productTable}': productTable,
      '{totalNet}': totalNet.toFixed(2),
      '{totalGross}': totalGross.toFixed(2),
      '{vatAmount}': (totalGross - totalNet).toFixed(2),
      '{itemsCount}': orderItems.length.toString(),
      '{companyName}': 'Elbsandstein Proviant & Quartier GmbH',
      '{companyAddress}': 'Seifhennersdorfer Straße 14<br>01099 Dresden',
      '{taxNumber}': 'DE353967134'
    };

    // Apply replacements
    Object.entries(replacements).forEach(([key, value]) => {
      subject = subject.replace(new RegExp(key, 'g'), value);
      content = content.replace(new RegExp(key, 'g'), value);
    });

    setEmailData(prev => ({
      ...prev,
      subject,
      content
    }));
  };

  const generateDefaultContent = () => {
    const orderNumber = orderData?.order_number || orderId.toString();
    const supplier = supplierName || orderData?.supplier_name || 'Sehr geehrte Damen und Herren';
    
    // Calculate totals
    let totalNet = 0;
    orderItems.forEach(item => {
      totalNet += (item.quantity || 0) * (item.unit_price || 0);
    });
    
    const totalGross = totalNet * 1.19;

    // Create product table for default content
    const productRows = orderItems.map((item, index) => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.product_name || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity || 0}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.unit || 'Stk'}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(item.unit_price || 0).toFixed(2)} €</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)} €</td>
      </tr>
    `).join('');

    const defaultContent = `
      <h2>Bestellung ${orderNumber}</h2>
      <p>Sehr geehrte Damen und Herren,</p>
      <p>hiermit bestellen wir bei Ihnen folgende Artikel:</p>
      
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px;">Pos.</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Artikel</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Menge</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Einheit</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Einzelpreis</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Gesamtpreis</th>
          </tr>
        </thead>
        <tbody>
          ${productRows}
          <tr style="background-color: #e9ecef; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtsumme:</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${totalGross.toFixed(2)} €</td>
          </tr>
        </tbody>
      </table>
      
      <p>Liefertermin: ${orderData?.expected_delivery_date ? new Date(orderData.expected_delivery_date).toLocaleDateString('de-DE') : 'Nach Vereinbarung'}</p>
      <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
      <p>Mit freundlichen Grüßen<br>Elbsandstein Proviant & Quartier GmbH</p>
    `;

    setEmailData(prev => ({
      ...prev,
      content: defaultContent
    }));
  };

  const handleSendEmail = async () => {
    // Validate email data
    if (!emailData.to.trim()) {
      toast({
        title: "Fehler",
        description: "Empfänger-Adresse ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    // Simple email validation - just check for @ symbol
    if (!emailData.to.trim().includes('@')) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein",
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

    if (!emailData.content.trim()) {
      toast({
        title: "Fehler",
        description: "E-Mail-Inhalt ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`/api/orders/${orderId}/debug-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to.trim(),
          cc: emailData.cc.trim() || undefined,
          bcc: emailData.bcc.trim() || undefined,
          subject: emailData.subject.trim(),
          content: emailData.content.trim(),
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Erfolg",
          description: `E-Mail erfolgreich gesendet${result.testMode ? ' (Testmodus)' : ''}`,
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-Mail senden - Bestellung {orderNumber || orderId}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              E-Mail verfassen
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Vorschau
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4">
            {/* Template Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  E-Mail-Vorlage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedTemplateId} onValueChange={(value) => {
                    setSelectedTemplateId(value);
                    if (value) {
                      applyTemplate(value);
                    }
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Vorlage auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.template_name} ({template.template_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={generateDefaultContent}>
                    Standard-Inhalt
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Email Form */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="to">An (Empfänger) *</Label>
                <Input
                  id="to"
                  type="email"
                  value={emailData.to}
                  onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                  placeholder="empfaenger@example.com"
                />
              </div>

              <div>
                <Label htmlFor="cc">CC (Kopie)</Label>
                <Input
                  id="cc"
                  type="email"
                  value={emailData.cc}
                  onChange={(e) => setEmailData(prev => ({ ...prev, cc: e.target.value }))}
                  placeholder="cc@example.com"
                />
              </div>

              <div>
                <Label htmlFor="bcc">BCC (Blindkopie)</Label>
                <Input
                  id="bcc"
                  type="email"
                  value={emailData.bcc}
                  onChange={(e) => setEmailData(prev => ({ ...prev, bcc: e.target.value }))}
                  placeholder="bcc@example.com"
                />
              </div>

              <div>
                <Label htmlFor="subject">Betreff *</Label>
                <Input
                  id="subject"
                  value={emailData.subject}
                  onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Betreff der E-Mail"
                />
              </div>

              <div>
                <Label htmlFor="content">Inhalt *</Label>
                <Textarea
                  id="content"
                  value={emailData.content}
                  onChange={(e) => setEmailData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="E-Mail-Inhalt (HTML wird unterstützt)"
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>E-Mail-Vorschau</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 border rounded p-4">
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div><strong>An:</strong> {emailData.to}</div>
                    {emailData.cc && <div><strong>CC:</strong> {emailData.cc}</div>}
                    {emailData.bcc && <div><strong>BCC:</strong> {emailData.bcc}</div>}
                    <div><strong>Betreff:</strong> {emailData.subject}</div>
                  </div>
                  <hr />
                  <div 
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: emailData.content }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSendEmail} disabled={isLoading}>
            <Send className="h-4 w-4 mr-2" />
            {isLoading ? 'Wird gesendet...' : 'E-Mail senden'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
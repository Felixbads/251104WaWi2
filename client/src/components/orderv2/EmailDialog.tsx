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
  isOpen: boolean;
  onClose: () => void;
  order: any;
  onEmailSent?: () => void;
}

export default function EmailDialog({ isOpen, onClose, order, onEmailSent }: EmailDialogProps) {
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
    if (isOpen && order) {
      loadEmailTemplate();
    }
  }, [isOpen, order]);

  const loadEmailTemplate = async () => {
    try {
      setIsLoading(true);

      // Load supplier email templates  
      const supplierId = order.supplier_id || order.supplierId;
      if (supplierId) {
        try {
          const templatesResponse = await fetch(`/api/supplier-email-templates/${supplierId}`);
          if (templatesResponse.ok) {
            const templates = await templatesResponse.json();
            console.log('E-Mail-Vorlagen geladen:', templates);
            setAvailableTemplates(templates);
            
            // Find default template
            const defaultTemplate = templates.find((t: any) => t.isDefault && t.templateType === 'standard');
            if (defaultTemplate) {
              setSelectedTemplate(defaultTemplate);
              setUseTemplate(true);
            }
          }
        } catch (error) {
          console.error('Fehler beim Laden der E-Mail-Vorlagen:', error);
        }
      }

      // Set email recipient from order data - check all possible field names first
      console.log('Full order object:', order);
      const supplierEmail = order.supplier_email || order.supplierEmail || order.orderEmailRecipient || '';

      // Load complete email template with proper variable handling
      const templateResponse = await fetch(`/api/orders/${order.id}/email-template-complete`);

      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        console.log('📧 Complete template data loaded:', templateData);
        
        setEmailData(prev => ({
          ...prev,
          subject: templateData.subject || prev.subject,
          htmlContent: templateData.content || prev.htmlContent,
        }));
        
        // Override supplier email from template if available
        if (templateData.supplierEmail && templateData.supplierEmail !== supplierEmail) {
          console.log('📧 Using supplier email from template:', templateData.supplierEmail);
          setEmailData(prev => ({
            ...prev,
            to: templateData.supplierEmail,
          }));
        }
        
      } else {
        console.warn('⚠️ Failed to load complete template, falling back to basic subject generation');
        
        // Fallback to basic subject generation
        const subjectResponse = await fetch('/api/email/generate-subject', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId: order.id }),
        });

        if (subjectResponse.ok) {
          const subjectData = await subjectResponse.json();
          setEmailData(prev => ({
            ...prev,
            subject: subjectData.subject,
          }));
        }
      }
      console.log('Checking order data for email:', {
        supplier_email: order.supplier_email,
        supplierEmail: order.supplierEmail,
        orderEmailRecipient: order.orderEmailRecipient,
        result: supplierEmail
      });
      
      // Only set email data if we have a valid supplier email
      if (supplierEmail && supplierEmail !== 'lieferant@example.com') {
        console.log('Setting supplier email:', supplierEmail);
        setEmailData(prev => ({
          ...prev,
          to: supplierEmail,
          cc: 'andreas@proviantomat.de, einkauf@proviantomat.de',
        }));
      } else {
        // Use test email for safe testing
        console.log('Using test email instead of supplier email');
        setEmailData(prev => ({
          ...prev,
          to: 'test@example.com',
          cc: 'andreas@proviantomat.de, einkauf@proviantomat.de',
        }));
      }

    } catch (error) {
      console.error('Error loading email template:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Laden der E-Mail-Vorlage",
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

      const response = await fetch(`/api/orders/${order.id}/send-email-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to.trim(),
          cc: emailData.cc.trim() || undefined,
          bcc: emailData.bcc.trim() || undefined,
          subject: emailData.subject.trim(),
          htmlContent: emailData.htmlContent.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Erfolg",
          description: "E-Mail erfolgreich gesendet",
        });
        onEmailSent?.();
        onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            E-Mail senden - Bestellung {order?.orderNumber || order?.id}
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
            <Tabs defaultValue="preview" className="w-full">
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
              <Tabs defaultValue="edit" className="w-full">
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
              <p><strong>Lieferant:</strong> {order?.supplierName || 'Unbekannt'}</p>
              <p><strong>Lager:</strong> {order?.warehouseName || 'Unbekannt'}</p>
              <p><strong>Bestelldatum:</strong> {order?.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'Unbekannt'}</p>
              <p><strong>Liefertermin:</strong> {order?.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 'Nicht angegeben'}</p>
              {order?.comments && <p><strong>Kommentare:</strong> {order.comments}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
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
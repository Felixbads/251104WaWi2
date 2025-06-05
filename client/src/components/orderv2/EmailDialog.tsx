import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
      if (order.supplier_id) {
        try {
          const templatesResponse = await fetch(`/api/supplier-email-templates/${order.supplier_id}`);
          if (templatesResponse.ok) {
            const templates = await templatesResponse.json();
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

      // Generate default subject
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

      // Load supplier template if available
      if (order.supplierId) {
        const templateResponse = await fetch(`/api/email/supplier-template/${order.supplierId}`);
        
        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          setEmailData(prev => ({
            ...prev,
            to: templateData.orderEmailRecipient || order.supplierEmail || '',
            cc: templateData.orderEmailCc || 'andreas@proviantomat.de,einkauf@proviantomat.de',
            bcc: templateData.orderEmailBcc || '',
          }));
        }
      } else {
        // Fallback to order supplier email
        setEmailData(prev => ({
          ...prev,
          to: order.supplierEmail || '',
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

      const response = await fetch('/api/email/send-order-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          to: emailData.to.trim(),
          cc: emailData.cc.trim() || undefined,
          bcc: emailData.bcc.trim() || undefined,
          subject: emailData.subject.trim(),
          htmlContent: emailData.htmlContent.trim() || undefined,
          useTemplate: useTemplate,
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
          {/* Template Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="useTemplate"
              checked={useTemplate}
              onCheckedChange={setUseTemplate}
            />
            <Label htmlFor="useTemplate">
              Standard-E-Mail-Vorlage verwenden
            </Label>
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
              type="email"
              value={emailData.cc}
              onChange={(e) => handleInputChange('cc', e.target.value)}
              placeholder="andreas@proviantomat.de,einkauf@proviantomat.de"
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

          {/* Custom Content (only if not using template) */}
          {!useTemplate && (
            <div className="space-y-2">
              <Label htmlFor="htmlContent">E-Mail-Inhalt (HTML) (optional)</Label>
              <Textarea
                id="htmlContent"
                value={emailData.htmlContent}
                onChange={(e) => handleInputChange('htmlContent', e.target.value)}
                placeholder="Benutzerdefinierter E-Mail-Inhalt..."
                rows={8}
              />
              <p className="text-sm text-muted-foreground">
                Leer lassen, um die Standard-Vorlage zu verwenden
              </p>
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
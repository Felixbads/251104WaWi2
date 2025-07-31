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
  const [sendAsPdf, setSendAsPdf] = useState(false);
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

      // Lade das neue 11-Punkte-Professionelle E-Mail-Template von der Backend-API
      console.log(`[EmailDialog] Lade professionelles Template für Bestellung ${orderId}...`);
      
      const templateResponse = await fetch(`/api/orders/${orderId}/email-template?type=standard`);
      if (!templateResponse.ok) {
        throw new Error(`Template-API-Fehler: ${templateResponse.status}`);
      }
      
      const templateData = await templateResponse.json();
      console.log(`[EmailDialog] Professionelles Template geladen:`, templateData);
      
      // Setze Template-Daten aus der Backend-API
      setEmailData({
        to: supplierEmail || templateData.supplierEmail || '',
        cc: 'andreas@proviantomat.de,einkauf@proviantomat.de',
        bcc: '',
        subject: templateData.subject || `Bestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`,
        htmlContent: templateData.content || 'Fehler beim Laden des Templates'
      });

      console.log(`[EmailDialog] Template geladen - Subject: ${templateData.subject}`);
      console.log(`[EmailDialog] Template geladen - Content-Länge: ${templateData.content?.length || 0} Zeichen`);

    } catch (error) {
      console.error('[EmailDialog] Fehler beim Laden des Templates:', error);
      
      // Fallback für einfaches Template
      setEmailData({
        to: supplierEmail || '',
        cc: 'andreas@proviantomat.de,einkauf@proviantomat.de',
        bcc: '',
        subject: `Bestellung ${orderNumber} - ${supplierName}`,
        htmlContent: `
          <h2>Neue Bestellung</h2>
          <p>Sehr geehrte Damen und Herren,</p>
          <p>hiermit erhalten Sie eine neue Bestellung mit der Nummer <strong>${orderNumber}</strong>.</p>
          <p>Bitte bestätigen Sie den Erhalt dieser Bestellung.</p>
          <p>Mit freundlichen Grüßen<br>Elbsandstein Proviant & Quartier GmbH</p>
        `
      });

      toast({
        title: "Template-Warnung",
        description: "Professionelles Template konnte nicht geladen werden. Einfaches Template wird verwendet.",
        variant: "destructive"
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
          sendAsPdf: sendAsPdf,
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
        description: error instanceof Error ? error.message : "E-Mail konnte nicht gesendet werden",
        variant: "destructive",
      });
      onSendEmail(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-Mail senden - Bestellung {orderNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* E-Mail Empfänger-Felder */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="to">An *</Label>
              <Input
                id="to"
                type="email"
                value={emailData.to}
                onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                placeholder="lieferant@example.com"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <Label htmlFor="cc">CC</Label>
              <Input
                id="cc"
                type="email"
                value={emailData.cc}
                onChange={(e) => setEmailData(prev => ({ ...prev, cc: e.target.value }))}
                placeholder="cc@example.com"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <Label htmlFor="bcc">BCC</Label>
              <Input
                id="bcc"
                type="email"
                value={emailData.bcc}
                onChange={(e) => setEmailData(prev => ({ ...prev, bcc: e.target.value }))}
                placeholder="bcc@example.com"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <Label htmlFor="subject">Betreff *</Label>
              <Input
                id="subject"
                value={emailData.subject}
                onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Betreff der E-Mail"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* PDF-Option hinzufügen */}
          <div className="flex items-center space-x-2 p-4 bg-gray-50 rounded-lg">
            <Switch
              id="pdf-mode"
              checked={sendAsPdf}
              onCheckedChange={setSendAsPdf}
              disabled={isLoading}
            />
            <Label htmlFor="pdf-mode" className="text-sm font-medium">
              Als PDF-Anhang senden (statt HTML-Inhalt)
            </Label>
          </div>

          {/* Template Tabs */}
          <Tabs value={previewTab} onValueChange={setPreviewTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Vorschau
              </TabsTrigger>
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Bearbeiten
              </TabsTrigger>
              <TabsTrigger value="html" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                HTML-Code
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="preview" className="mt-4">
              <div className="border rounded-lg p-4 bg-white min-h-[400px] max-h-[500px] overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: emailData.htmlContent }} />
              </div>
            </TabsContent>
            
            <TabsContent value="edit" className="mt-4">
              <div>
                <Label htmlFor="content">E-Mail Inhalt</Label>
                <Textarea
                  id="content"
                  value={emailData.htmlContent}
                  onChange={(e) => setEmailData(prev => ({ ...prev, htmlContent: e.target.value }))}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="E-Mail-Inhalt..."
                  disabled={isLoading}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="html" className="mt-4">
              <div>
                <Label htmlFor="html">HTML-Quellcode</Label>
                <Textarea
                  id="html"
                  value={emailData.htmlContent}
                  onChange={(e) => setEmailData(prev => ({ ...prev, htmlContent: e.target.value }))}
                  className="min-h-[400px] font-mono text-xs"
                  placeholder="HTML-Quellcode..."
                  disabled={isLoading}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          
          <Button 
            onClick={handleSendEmail}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sendAsPdf ? 'Als PDF senden' : 'E-Mail senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
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
import { queryClient } from '@/lib/queryClient';

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
  const [includePortalLink, setIncludePortalLink] = useState(true);
  const [coverText, setCoverText] = useState('');
  const [emailData, setEmailData] = useState({
    to: '',
    cc: 'andreas@proviantomat.de,einkauf@proviantomat.de',
    bcc: '',
    subject: '',
    htmlContent: '',
  });
  
  // !! PERFORMANCE: PORTAL-LINK-CACHING SYSTEM !!
  const [cachedPortalLink, setCachedPortalLink] = useState<string | null>(null);
  const [portalLinkCacheKey, setPortalLinkCacheKey] = useState<string | null>(null);
  const [portalLinkLoadTime, setPortalLinkLoadTime] = useState<number | null>(null);
  
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [previewTab, setPreviewTab] = useState('preview');
  const [editTab, setEditTab] = useState('edit');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Portal-Link-Cache-Management - generiert Cache-Key für Eindeutigkeit
  const generatePortalLinkCacheKey = (orderId: number, supplierName: string): string => {
    return `portalLink_${orderId}_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  };

  // Prüft ob Portal-Link-Cache noch gültig ist (5 Minuten Gültigkeit)
  const isPortalLinkCacheValid = (): boolean => {
    if (!cachedPortalLink || !portalLinkLoadTime) return false;
    
    const now = Date.now();
    const cacheAgeMs = now - portalLinkLoadTime;
    const maxCacheAgeMs = 5 * 60 * 1000; // 5 Minuten
    
    const isValid = cacheAgeMs < maxCacheAgeMs;
    
    if (!isValid) {
      console.log(`[EmailDialog] Portal-Link-Cache abgelaufen (${Math.round(cacheAgeMs / 1000)}s alt)`);
    }
    
    return isValid;
  };

  // Load supplier template and default values when dialog opens
  useEffect(() => {
    if (open && orderId) {
      // Cache-Key für diesen Dialog generieren
      const newCacheKey = generatePortalLinkCacheKey(orderId, supplierName);
      
      // Prüfe ob sich der Cache-Key geändert hat (anderer Order/Supplier)
      if (newCacheKey !== portalLinkCacheKey) {
        console.log(`[EmailDialog] Neuer Dialog - invalidiere Portal-Link-Cache`);
        setCachedPortalLink(null);
        setPortalLinkLoadTime(null);
        setPortalLinkCacheKey(newCacheKey);
      }
      
      loadEmailTemplate();
    }
  }, [open, orderId, supplierName]);

  // Update email preview when portal link toggle changes (mit Cache-Optimierung)
  useEffect(() => {
    if (open && orderId && emailData.htmlContent) {
      updateEmailPreview();
    }
  }, [includePortalLink]);

  const loadEmailTemplate = async () => {
    try {
      setIsLoading(true);

      // Lade das neue 11-Punkte-Professionelle E-Mail-Template von der Backend-API
      console.log(`[EmailDialog] Lade professionelles Template für Bestellung ${orderId}...`);
      
      const templateResponse = await fetch(`/api/orders/${orderId}/email-template?type=standard&includePortalLink=${includePortalLink}`);
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

  /**
   * OPTIMIERTE E-Mail-Vorschau mit Portal-Link-Caching
   */
  const updateEmailPreview = async () => {
    try {
      console.log(`[EmailDialog] Aktualisiere E-Mail-Vorschau (includePortalLink=${includePortalLink})...`);
      
      // Performance-Optimierung: Verwende gecachten Portal-Link falls verfügbar
      let usePortalLinkParam = includePortalLink;
      
      if (includePortalLink && isPortalLinkCacheValid()) {
        console.log(`[EmailDialog] Verwende gecachten Portal-Link für Performance-Optimierung`);
        // Backend kann gecachten Link verwenden - signalisiere das über speziellen Parameter
        usePortalLinkParam = true;
      }
      
      // Verwende das dynamische Portal-Abschnitt-System des Backend
      const previewResponse = await fetch(`/api/orders/${orderId}/email-template?type=standard&includePortalLink=${usePortalLinkParam}`);
      
      if (!previewResponse.ok) {
        console.warn('[EmailDialog] Vorschau-Update fehlgeschlagen, behalte aktuellen Content');
        return;
      }
      
      const previewData = await previewResponse.json();
      
      // Cache-Update: Speichere Portal-Link falls im Response enthalten
      if (previewData.portalLink && includePortalLink) {
        if (!isPortalLinkCacheValid() || cachedPortalLink !== previewData.portalLink) {
          console.log(`[EmailDialog] Aktualisiere Portal-Link-Cache: ${previewData.portalLink.substring(0, 50)}...`);
          setCachedPortalLink(previewData.portalLink);
          setPortalLinkLoadTime(Date.now());
        }
      }
      
      // Aktualisiere nur htmlContent, behalte andere E-Mail-Daten
      setEmailData(prev => ({
        ...prev,
        htmlContent: previewData.content || prev.htmlContent
      }));
      
      console.log(`[EmailDialog] E-Mail-Vorschau erfolgreich aktualisiert (Portal-Link: ${includePortalLink ? 'EIN' : 'AUS'}, Cache: ${isPortalLinkCacheValid() ? 'GÜLTIG' : 'UNGÜLTIG'})`);
      
    } catch (error) {
      console.error('[EmailDialog] Fehler beim Aktualisieren der E-Mail-Vorschau:', error);
    }
  };

  /**
   * Erweiterte Portal-Link-Toggle-Handler mit sofortiger Vorschau-Aktualisierung
   */
  const handlePortalToggle = (checked: boolean) => {
    console.log(`[EmailDialog] Portal-Link-Toggle: ${checked ? 'aktiviert' : 'deaktiviert'}`);
    setIncludePortalLink(checked);
    // useEffect wird automatisch updateEmailPreview() aufrufen
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

      // Use the correct PDF-enabled endpoint
      const response = await fetch(`/api/orders-email-working/${orderId}/send-email-working`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailAddress: emailData.to.trim(),
          cc: emailData.cc.trim(),
          bcc: emailData.bcc.trim(),
          subject: emailData.subject.trim(),
          content: sendAsPdf ? undefined : emailData.htmlContent.trim(),
          usePdf: sendAsPdf,
          includePortalLink: includePortalLink,
          coverText: sendAsPdf ? coverText : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Show success message based on what was actually sent
        const successMessage = result.type === 'html_fallback' 
          ? `${result.message}${result.warning ? ` (${result.warning})` : ''}`
          : result.message;
          
        toast({
          title: "Erfolg",
          description: successMessage,
          variant: result.type === 'html_fallback' ? "default" : "default",
        });
        
        // Invalidate orders cache to show updated status
        queryClient.invalidateQueries({ queryKey: ['/api/orders/dashboard/open'] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        
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

  // PDF preview function
  const generatePdfPreview = async () => {
    try {
      setIsGeneratingPdf(true);
      
      const response = await fetch(`/api/orders-email-working/${orderId}/pdf-preview`, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf',
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        
        // Cleanup old URL to prevent memory leaks
        return () => {
          if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
          }
        };
      } else {
        // Handle fallback response from backend
        const errorData = await response.json();
        
        if (errorData.fallback && response.status === 503) {
          // PDF not available, but system can send HTML emails
          toast({
            title: "PDF-Vorschau nicht verfügbar",
            description: errorData.details || "PDF-Generierung ist aufgrund fehlender Systemabhängigkeiten temporär nicht verfügbar. Sie können die E-Mail trotzdem im HTML-Format versenden.",
            variant: "default",
          });
          
          // Automatically disable PDF mode
          setSendAsPdf(false);
          
        } else {
          throw new Error(errorData.error || 'PDF-Vorschau konnte nicht generiert werden');
        }
      }
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      toast({
        title: "Fehler",
        description: "PDF-Vorschau konnte nicht erstellt werden",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
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

          {/* PDF-Option und Versandoptionen */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="pdf-mode"
                checked={sendAsPdf}
                onCheckedChange={setSendAsPdf}
                disabled={isLoading}
              />
              <Label htmlFor="pdf-mode" className="text-sm font-medium">
                Als PDF-Anhang senden
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="portal-link"
                checked={includePortalLink}
                onCheckedChange={handlePortalToggle}
                disabled={isLoading}
                data-testid="toggle-portal-link"
              />
              <Label htmlFor="portal-link" className="text-sm font-medium">
                🔗 Portal-Link mitschicken
              </Label>
            </div>
            
            {sendAsPdf && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="cover-text">Begleittext für PDF-Anhang</Label>
                  <Textarea
                    id="cover-text"
                    value={coverText}
                    onChange={(e) => setCoverText(e.target.value)}
                    className="h-[100px]"
                    placeholder="Sehr geehrte Damen und Herren,&#10;&#10;anbei erhalten Sie unsere Bestellung als PDF-Anhang.&#10;&#10;Mit freundlichen Grüßen&#10;Ihr Proviantomat Team"
                    disabled={isLoading}
                  />
                  <div className="text-xs text-gray-500">
                    Lassen Sie das Feld leer, um einen Standardtext zu verwenden.
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generatePdfPreview}
                    disabled={isGeneratingPdf || isLoading}
                    className="flex items-center gap-2"
                  >
                    {isGeneratingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    PDF-Vorschau generieren
                  </Button>
                  {pdfPreviewUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(pdfPreviewUrl, '_blank')}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      PDF öffnen
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            <div className="text-sm text-gray-600 space-y-2">
              <div>
                {sendAsPdf ? (
                  <>
                    📄 <strong>PDF-Modus:</strong> Die Bestellung wird als PDF-Datei angehängt und der E-Mail-Inhalt wird durch den Begleittext ersetzt.
                  </>
                ) : (
                  <>
                    📧 <strong>HTML-Modus:</strong> Die vollständigen Bestelldetails werden direkt im E-Mail-Inhalt angezeigt.
                  </>
                )}
              </div>
              {includePortalLink && (
                <div className="text-blue-600">
                  🔗 <strong>Portal-Link:</strong> Ein Link zum Lieferantenportal wird automatisch in die E-Mail eingefügt. Der Lieferant kann dort Bestellungen bestätigen und Liefertermine angeben.
                </div>
              )}
            </div>
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
                {sendAsPdf ? (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded">
                      <strong>PDF-Modus:</strong> Die E-Mail wird mit dem Begleittext versendet und die vollständige Bestellung als PDF angehängt.
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">E-Mail-Inhalt (Begleittext):</h4>
                      <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap">
                        {coverText || `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung ${orderNumber} als PDF-Anhang.

Bitte bestätigen Sie den Empfang und teilen Sie uns den voraussichtlichen Liefertermin mit.

Mit freundlichen Grüßen
Ihr Proviantomat Team`}
                      </div>
                    </div>
                    {pdfPreviewUrl && (
                      <div>
                        <h4 className="font-medium mb-2">PDF-Anhang:</h4>
                        <iframe
                          src={pdfPreviewUrl}
                          className="w-full h-[300px] border rounded"
                          title="PDF-Vorschau"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: emailData.htmlContent }} />
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="edit" className="mt-4">
              <div>
                <Label htmlFor="content">
                  {sendAsPdf ? 'Begleittext (PDF wird angehängt)' : 'E-Mail Inhalt'}
                </Label>
                {sendAsPdf ? (
                  <Textarea
                    id="content"
                    value={coverText}
                    onChange={(e) => setCoverText(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    placeholder="Sehr geehrte Damen und Herren,&#10;&#10;anbei erhalten Sie unsere Bestellung als PDF-Anhang.&#10;&#10;Mit freundlichen Grüßen&#10;Ihr Proviantomat Team"
                    disabled={isLoading}
                  />
                ) : (
                  <Textarea
                    id="content"
                    value={emailData.htmlContent}
                    onChange={(e) => setEmailData(prev => ({ ...prev, htmlContent: e.target.value }))}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="E-Mail-Inhalt..."
                    disabled={isLoading}
                  />
                )}
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
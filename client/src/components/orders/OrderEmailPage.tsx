import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Send, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
 * Eigenständiger E-Mail-Versandschritt für Bestellungen
 * 
 * Diese Komponente bietet:
 * - Auswahl aus verschiedenen E-Mail-Vorlagen
 * - Vorschau der PDF als Vollbildansicht
 * - Volle Bearbeitungsmöglichkeit des E-Mail-Textes
 * - Anpassung der E-Mail-Empfänger und Betreff
 */
const OrderEmailPage: React.FC<OrderEmailPageProps> = ({
  orderId,
  supplierEmail = '',
  orderNumber = '',
  supplierName = '',
  pdfBlob,
  onSendEmail,
  onBack,
  onNext
}) => {
  const { toast } = useToast();
  
  // State für E-Mail-Daten
  const [emailData, setEmailData] = useState({
    to: supplierEmail,
    subject: `Bestellung ${orderNumber} von Elbsandstein Proviant & Quartier GmbH`,
    content: '',
    additionalNotes: ''
  });
  
  // State für Template-Auswahl
  const [selectedTemplate, setSelectedTemplate] = useState<string>('1');
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  
  // State für aktiven Tab
  const [activeTab, setActiveTab] = useState<string>("email");
  
  // State für PDF-Vorschau
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  
  // State für E-Mail-Versand
  const [isSending, setIsSending] = useState(false);
  const [sendingError, setSendingError] = useState<string | null>(null);
  
  // Vorlagen laden
  useEffect(() => {
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const response = await apiRequest('/api/mail-templates');
        setTemplates(response);
      } catch (error) {
        console.error('Fehler beim Laden der Vorlagen:', error);
        toast({
          title: 'Fehler beim Laden der E-Mail-Vorlagen',
          description: 'Die E-Mail-Vorlagen konnten nicht geladen werden. Standard-Vorlagen werden verwendet.',
          variant: 'destructive',
        });
        
        // Fallback zu Standard-Vorlagen
        setTemplates([
          { id: 1, name: 'Standard Bestellung' },
          { id: 2, name: 'Dringende Bestellung' },
          { id: 3, name: 'Nachbestellung' }
        ]);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    
    loadTemplates();
  }, [toast]);
  
  // Template laden, wenn sich die Auswahl ändert
  useEffect(() => {
    const loadTemplate = async () => {
      if (!orderId) return;
      
      try {
        const response = await apiRequest(`/api/mail-templates/${selectedTemplate}`);
        
        // Platzhalter ersetzen
        let subject = response.subject;
        let content = response.content;
        
        subject = subject.replace(/{{orderNumber}}/g, orderNumber);
        content = content.replace(/{{orderNumber}}/g, orderNumber);
        
        if (supplierName) {
          content = content.replace(/{{supplierName}}/g, supplierName);
        }
        
        setEmailData(prev => ({
          ...prev,
          subject,
          content
        }));
      } catch (error) {
        console.error('Fehler beim Laden der Vorlage:', error);
        toast({
          title: 'Fehler beim Laden der E-Mail-Vorlage',
          description: 'Die ausgewählte Vorlage konnte nicht geladen werden.',
          variant: 'destructive',
        });
      }
    };
    
    loadTemplate();
  }, [orderId, selectedTemplate, orderNumber, supplierName, toast]);
  
  // Keine PDF-Vorschau mehr benötigt - nur E-Mail
  useEffect(() => {
    if (!orderId) return;
    
    console.log('E-Mail-Versand wird vorbereitet für Bestellung:', orderId);
  }, [orderId]);
  
  // Kein PDF-Download mehr nötig
  
  // E-Mail senden
  const handleSendEmail = async () => {
    if (!orderId) {
      toast({
        title: 'Fehler beim Senden der E-Mail',
        description: 'Keine Bestellungs-ID vorhanden.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!emailData.to || !emailData.to.includes('@')) {
      toast({
        title: 'Ungültige E-Mail-Adresse',
        description: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSending(true);
    setSendingError(null);
    
    try {
      await apiRequest(`/api/orders/${orderId}/email`, {
        supplierEmail: emailData.to,
        subject: emailData.subject,
        content: emailData.content,
        additionalNotes: emailData.additionalNotes
      }, 'post');
      
      toast({
        title: 'E-Mail erfolgreich gesendet',
        description: 'Die Bestellung wurde per E-Mail an den Lieferanten gesendet.',
      });
      
      // Nach erfolgreicher Sendung zum nächsten Schritt gehen
      if (onNext) {
        onNext();
      }
    } catch (error: any) {
      console.error('Fehler beim Senden der E-Mail:', error);
      setSendingError(error.message || 'Beim Senden der E-Mail ist ein Fehler aufgetreten.');
      
      toast({
        title: 'Fehler beim Senden der E-Mail',
        description: error.message || 'Beim Senden der E-Mail ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };
  
  // Vorschau der PDF vorbereiten
  const getPdfPreview = () => {
    if (!pdfUrl) {
      return (
        <div className="flex justify-center items-center h-96 bg-gray-100 rounded-md">
          <div className="text-center p-4">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">PDF wird geladen...</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="h-[70vh] w-full relative">
        <iframe 
          src={pdfUrl} 
          className="w-full h-full border-0 rounded" 
          title="PDF Vorschau"
        />
        
        <div className="absolute top-2 right-2 flex space-x-2">
          <Button size="sm" variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>
            Schließen
          </Button>
          <Button size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-2 h-4 w-4" /> 
            Herunterladen
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Bestellung per E-Mail versenden</CardTitle>
          <CardDescription>
            Senden Sie die Bestellung per E-Mail an den Lieferanten. 
            Sie können vorab die PDF-Datei prüfen und den E-Mail-Text anpassen.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="email">E-Mail</TabsTrigger>
              <TabsTrigger value="pdf">PDF-Vorschau</TabsTrigger>
            </TabsList>
            
            <TabsContent value="email" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="col-span-1 md:col-span-3">
                  <label className="text-sm font-medium">E-Mail-Vorlage</label>
                  <Select 
                    value={selectedTemplate} 
                    onValueChange={setSelectedTemplate}
                    disabled={isLoadingTemplates}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vorlage auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-1">
                  <label className="text-sm font-medium">Bestellnummer</label>
                  <Input 
                    value={orderNumber}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">E-Mail des Lieferanten</label>
                <Input 
                  value={emailData.to}
                  onChange={e => setEmailData({...emailData, to: e.target.value})}
                  placeholder="lieferant@example.com"
                  type="email"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Betreff</label>
                <Input 
                  value={emailData.subject}
                  onChange={e => setEmailData({...emailData, subject: e.target.value})}
                  placeholder="Bestellung von Elbsandstein Proviant & Quartier GmbH"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">E-Mail-Text</label>
                <Textarea 
                  value={emailData.content}
                  onChange={e => setEmailData({...emailData, content: e.target.value})}
                  placeholder="Sehr geehrte Damen und Herren,
hiermit senden wir Ihnen unsere Bestellung..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Zusätzliche Anmerkungen</label>
                <Textarea 
                  value={emailData.additionalNotes}
                  onChange={e => setEmailData({...emailData, additionalNotes: e.target.value})}
                  placeholder="Zusätzliche Anmerkungen für diese Bestellung..."
                  rows={3}
                />
              </div>
              
              {sendingError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Fehler beim Senden der E-Mail</AlertTitle>
                  <AlertDescription>{sendingError}</AlertDescription>
                </Alert>
              )}
            </TabsContent>
            
            <TabsContent value="pdf">
              <div className="border rounded-md overflow-hidden">
                {isPdfPreviewOpen ? (
                  // Vollbild-PDF-Vorschau
                  getPdfPreview()
                ) : (
                  // Mini-Vorschau mit Vollbildschaltfläche
                  <div className="p-4 flex flex-col items-center">
                    {pdfUrl ? (
                      <>
                        <div className="w-full h-32 md:h-56 bg-gray-100 flex items-center justify-center">
                          <iframe 
                            src={pdfUrl} 
                            className="w-full h-full border-0 pointer-events-none" 
                            title="PDF Miniaturvorschau"
                          />
                        </div>
                        <div className="flex space-x-2 mt-4">
                          <Button 
                            variant="outline" 
                            onClick={() => setIsPdfPreviewOpen(true)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Vollbildansicht
                          </Button>
                          <Button 
                            onClick={handleDownloadPdf}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            PDF herunterladen
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4">
                        <FileText className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-500">PDF wird geladen...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          
          <Button 
            onClick={handleSendEmail} 
            disabled={isSending}
          >
            {isSending ? (
              <>Wird gesendet...</>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                E-Mail senden
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default OrderEmailPage;
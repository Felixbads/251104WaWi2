import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// UI Komponenten
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

// Icons
import {
  FileText,
  Mail,
  Download,
  Loader2,
  Send,
  Printer,
  Copy,
  Check,
  ChevronRight,
  InfoIcon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  CalendarIcon,
  Building
} from "lucide-react";

// PDF Viewer Component wurde entfernt

// E-Mail senden
const sendEmail = async (data: any) => {
  const response = await fetch('/api/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "E-Mail konnte nicht gesendet werden");
  }

  return response.json();
};

interface OrderDetailActionsProps {
  order: any;
  pdfContentRef: React.RefObject<HTMLDivElement>;
}

export default function OrderDetailActions({ order }: OrderDetailActionsProps) {
  const { toast } = useToast();
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // E-Mail State
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [ccAddresses, setCcAddresses] = useState("");
  
  // Mutation für E-Mail senden
  const sendEmailMutation = useMutation({
    mutationFn: (data: any) => sendEmail(data),
    onSuccess: () => {
      setIsDialogOpen(false);
      toast({
        title: "E-Mail gesendet",
        description: "Die E-Mail wurde erfolgreich versendet."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Senden",
        description: error.message || "Die E-Mail konnte nicht gesendet werden.",
        variant: "destructive"
      });
    }
  });
  
  // E-Mail-Dialog öffnen - Direkte Funktion anstelle der PDF-Generierung
  const handleOpenEmailDialog = () => {
    if (!order) return;
    
    // Standardwerte für die E-Mail setzen
    if (order.supplier?.email) {
      setEmailAddress(order.supplier.email);
    } else if (order.supplierEmail) {
      setEmailAddress(order.supplierEmail);
    }
    
    setEmailSubject(`Bestellung ${order.orderNumber} vom ${new Date(order.orderDate).toLocaleDateString('de-DE')}`);
    setEmailText(`Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung ${order.orderNumber} vom ${new Date(order.orderDate).toLocaleDateString('de-DE')}.

Bestellpositionen:
${(order.orderItems || []).map((item: any) => `- ${item.productName || item.name}: ${item.quantity} ${item.unit || "Stk."} x ${item.unitPrice ? (item.unitPrice).toFixed(2) : "0.00"} € = ${item.totalPrice ? (item.totalPrice).toFixed(2) : (item.unitPrice * item.quantity).toFixed(2)} €`).join('\n')}

Gesamtsumme: ${order.totalAmount ? order.totalAmount.toFixed(2) : (order.orderItems || []).reduce((sum: number, item: any) => sum + (item.totalPrice || (item.unitPrice * item.quantity)), 0).toFixed(2)} €

Lieferdatum: ${order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 'Nicht festgelegt'}
Priorität: ${order.priority || 'Normal'}
${order.notes ? `Anmerkungen: ${order.notes}` : ''}

Bitte bestätigen Sie uns den Erhalt und den voraussichtlichen Liefertermin.

Mit freundlichen Grüßen
${order.createdByName || "Ihr Bestellteam"}`);

    // Dialog öffnen
    setIsDialogOpen(true);
  };
  
  // E-Mail Dialog öffnen
  const handlePrepareEmail = () => {
    // Standardwerte setzen
    if (order.supplier?.email) {
      setEmailAddress(order.supplier.email);
    } else if (order.supplierEmail) {
      setEmailAddress(order.supplierEmail);
    }
    
    setEmailSubject(`Bestellung ${order.orderNumber} vom ${new Date(order.orderDate).toLocaleDateString('de-DE')}`);
    setEmailText(`Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung ${order.orderNumber} vom ${new Date(order.orderDate).toLocaleDateString('de-DE')}.

Bitte bestätigen Sie uns den Erhalt und den voraussichtlichen Liefertermin.

Mit freundlichen Grüßen
${order.createdByName || "Ihr Bestellteam"}`);

    setActiveTab("email");
  };
  
  // E-Mail senden
  const handleSendEmail = async () => {
    if (!pdfBlob || !emailAddress || !emailSubject || !emailText) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // PDF in Base64 konvertieren
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      
      reader.onloadend = () => {
        const base64data = reader.result as string;
        
        // Nur den Base64-String ohne den Prefix (data:application/pdf;base64,)
        const base64Content = base64data.split(',')[1];
        
        // E-Mail-Daten vorbereiten
        const emailData = {
          to: emailAddress,
          subject: emailSubject,
          text: emailText,
          html: emailText.replace(/\n/g, '<br>'),
          attachments: [
            {
              filename: `Bestellung_${order.orderNumber}.pdf`,
              content: base64Content,
              encoding: 'base64',
              contentType: 'application/pdf'
            }
          ]
        };
        
        // CC-Empfänger hinzufügen, wenn vorhanden
        if (ccAddresses) {
          (emailData as any).cc = ccAddresses.split(',').map(email => email.trim());
        }
        
        // E-Mail senden
        sendEmailMutation.mutate(emailData);
      };
    } catch (error) {
      toast({
        title: "Fehler beim Senden",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  // Text in Zwischenablage kopieren
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({
          title: "Kopiert",
          description: "Text wurde in die Zwischenablage kopiert."
        });
      })
      .catch(() => {
        toast({
          title: "Fehler",
          description: "Text konnte nicht kopiert werden.",
          variant: "destructive"
        });
      });
  };
  
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleGeneratePdf}
        disabled={isGeneratingPdf || !order}
        className="flex items-center"
      >
        {isGeneratingPdf ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">PDF wird generiert...</span>
            <span className="sm:hidden">Generiere...</span>
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">PDF generieren</span>
            <span className="sm:hidden">PDF</span>
          </>
        )}
      </Button>
      
      {/* Neuer direkt-Download Button, der den Backend-Endpunkt nutzt */}
      <OrderPDFButton 
        orderId={order?.id}
        variant="outline"
        size="sm"
      />
      
      {pdfBlob && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsDialogOpen(true);
            handlePrepareEmail();
          }}
          className="flex items-center"
        >
          <Mail className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Per E-Mail versenden</span>
          <span className="sm:hidden">E-Mail</span>
        </Button>
      )}
      
      {/* Multifunction Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 md:p-6 border-b">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bestellung #{order?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              {activeTab === "pdf" && "Vorschau und Versand der Bestellung als PDF-Dokument"}
              {activeTab === "email" && "Versenden Sie die Bestellung per E-Mail an den Lieferanten"}
              {activeTab === "details" && "Details zur Bestellung und zum Lieferanten"}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="border-b">
              <TabsList className="w-full h-12 p-0 bg-transparent justify-start rounded-none px-4">
                <TabsTrigger 
                  value="pdf" 
                  className="flex items-center data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">PDF-Vorschau</span>
                  <span className="sm:hidden">PDF</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="email" 
                  className="flex items-center data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">E-Mail verfassen</span>
                  <span className="sm:hidden">E-Mail</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="details" 
                  className="flex items-center data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full"
                >
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Bestelldetails</span>
                  <span className="sm:hidden">Details</span>
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* PDF Tab */}
            <TabsContent value="pdf" className="flex-1 overflow-hidden flex flex-col m-0 p-0">
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {!pdfUrl ? (
                    <div className="flex flex-col items-center justify-center h-[40vh] sm:h-[50vh]">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                      <p className="text-center mb-4">PDF noch nicht generiert oder konnte nicht geladen werden.</p>
                      <Button 
                        onClick={handleGeneratePdf} 
                        disabled={isGeneratingPdf}
                      >
                        {isGeneratingPdf ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            PDF wird generiert...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            PDF generieren
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <PdfViewer url={pdfUrl} />
                  )}
                </div>
              </ScrollArea>
              
              <div className="border-t p-4">
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={handleDownloadPdf}
                    className="sm:w-auto"
                    disabled={!pdfUrl || isGeneratingPdf}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Herunterladen</span>
                    <span className="sm:hidden">Download</span>
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handlePrintPdf}
                    className="sm:w-auto"
                    disabled={!pdfUrl || isGeneratingPdf}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Drucken</span>
                    <span className="sm:hidden">Drucken</span>
                  </Button>
                  <Button 
                    onClick={() => {
                      setActiveTab("email");
                      handlePrepareEmail();
                    }}
                    className="sm:w-auto"
                    disabled={!pdfUrl || isGeneratingPdf}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Per E-Mail versenden</span>
                    <span className="sm:hidden">E-Mail</span>
                    <ChevronRight className="ml-2 h-4 w-4 hidden sm:block" />
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            {/* E-Mail Tab */}
            <TabsContent value="email" className="flex-1 overflow-hidden flex flex-col m-0 p-0">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {!pdfBlob && (
                    <Alert className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>PDF erforderlich</AlertTitle>
                      <AlertDescription>
                        Das PDF muss zuerst generiert werden, bevor die E-Mail gesendet werden kann.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-sm font-medium">Empfänger</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input 
                          value={emailAddress}
                          onChange={(e) => setEmailAddress(e.target.value)}
                          placeholder="lieferant@example.com"
                          className="flex-grow"
                        />
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => copyToClipboard(emailAddress)}
                          className="shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-sm font-medium">CC-Empfänger (optional)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 py-2">
                      <Input
                        value={ccAddresses}
                        onChange={(e) => setCcAddresses(e.target.value)}
                        placeholder="empfaenger2@example.com, empfaenger3@example.com"
                      />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-sm font-medium">Betreff</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input 
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Betreff der E-Mail"
                          className="flex-grow"
                        />
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => copyToClipboard(emailSubject)}
                          className="shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="flex-1">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-sm font-medium">Nachricht</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 py-2">
                      <div className="flex flex-col gap-2">
                        <Textarea 
                          value={emailText}
                          onChange={(e) => setEmailText(e.target.value)}
                          placeholder="Text der E-Mail"
                          className="min-h-[150px]"
                        />
                        <div className="flex justify-end">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyToClipboard(emailText)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Text kopieren
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-3 pt-0">
                      <div className="w-full flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Anhang: </span>
                        <Badge variant="outline" className="font-normal">
                          Bestellung_{order?.orderNumber}.pdf
                        </Badge>
                      </div>
                    </CardFooter>
                  </Card>
                </div>
              </ScrollArea>
              
              <div className="border-t p-4">
                <Button
                  onClick={handleSendEmail}
                  disabled={sendEmailMutation.isPending || !emailAddress || !emailSubject || !emailText || !pdfBlob}
                  className="w-full sm:w-auto"
                >
                  {sendEmailMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Senden...</span>
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      <span>E-Mail senden</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
            
            {/* Details Tab */}
            <TabsContent value="details" className="flex-1 overflow-hidden flex flex-col m-0 p-0">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <Card>
                    <CardHeader className="p-3">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <InfoIcon className="h-4 w-4" />
                        Bestellung
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Bestellnummer:</p>
                          <p className="font-medium">{order?.orderNumber}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Datum:</p>
                          <p className="font-medium">
                            {order?.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'Nicht angegeben'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Status:</p>
                          <Badge variant={order?.status === "sent" ? "success" : "outline"}>
                            {order?.status === "draft" ? "Entwurf" : 
                             order?.status === "sent" ? "Versendet" : 
                             order?.status === "confirmed" ? "Bestätigt" :
                             order?.status === "delivered" ? "Geliefert" : order?.status || "Unbekannt"}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Lieferdatum:</p>
                          <p className="font-medium">
                            {order?.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 'Nicht angegeben'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="p-3">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        Lieferant
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Name:</p>
                          <p className="font-medium">{order?.supplierName || 'Nicht angegeben'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">E-Mail:</p>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{order?.supplierEmail || 'Nicht angegeben'}</p>
                            {order?.supplierEmail && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => copyToClipboard(order.supplierEmail)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Telefon:</p>
                          <p className="font-medium">{order?.supplierPhone || 'Nicht angegeben'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Ansprechpartner:</p>
                          <p className="font-medium">{order?.supplierContactPerson || 'Nicht angegeben'}</p>
                        </div>
                        {order?.supplierAddress && (
                          <div className="space-y-1 sm:col-span-2">
                            <p className="text-xs text-muted-foreground">Adresse:</p>
                            <p className="font-medium whitespace-pre-line">{order.supplierAddress}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="p-3">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Lieferadresse
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Lieferort:</p>
                        <p className="font-medium">{order?.deliveryAddress || order?.locationName || 'Standard-Lieferadresse'}</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {order?.notes && (
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-base font-medium">Hinweise zur Bestellung</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <p className="whitespace-pre-line">{order.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
              
              <div className="border-t p-4">
                <Button
                  onClick={() => setActiveTab("email")}
                  className="w-full sm:w-auto"
                  disabled={!pdfBlob}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Weiter zur E-Mail
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="border-t p-4 flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
              size="sm"
            >
              Schließen
            </Button>
            
            {activeTab === "email" && (
              <Button
                size="sm"
                onClick={handleSendEmail}
                disabled={sendEmailMutation.isPending || !emailAddress || !emailSubject || !emailText || !pdfBlob}
              >
                {sendEmailMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Senden...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Senden
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
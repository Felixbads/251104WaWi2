import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";

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

// Icons
import {
  FileText,
  Mail,
  Download,
  Loader2,
  Send,
  Printer
} from "lucide-react";

// PDF Viewer Component
const PdfViewer = ({ url }: { url: string }) => {
  return (
    <div className="w-full h-[70vh] overflow-hidden rounded-md border">
      <iframe 
        src={url} 
        className="w-full h-full" 
        title="PDF Vorschau"
      />
    </div>
  );
};

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

export default function OrderDetailActions({ order, pdfContentRef }: OrderDetailActionsProps) {
  const { toast } = useToast();
  
  // Dialog States
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  
  // PDF State
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // E-Mail State
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [ccAddresses, setCcAddresses] = useState("");
  
  // Mutation für E-Mail senden
  const sendEmailMutation = useMutation({
    mutationFn: (data: any) => sendEmail(data),
    onSuccess: () => {
      setShowEmailDialog(false);
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
  
  // PDF generieren
  const handleGeneratePdf = async () => {
    if (!order || !pdfContentRef.current) return;
    
    try {
      setIsGeneratingPdf(true);
      
      // Status setzen
      toast({
        title: "PDF wird generiert",
        description: "Bitte warten Sie einen Moment...",
      });
      
      // QR-Code generieren für das PDF
      const portalUrl = `${window.location.origin}/lieferantenportal/${order.supplierId}/bestellung/${order.id}`;
      const qrDataUrl = await QRCode.toDataURL(portalUrl, {
        width: 150,
        margin: 1,
      });
      
      // HTML in Canvas umwandeln
      const canvas = await html2canvas(pdfContentRef.current, {
        scale: 1.2,
        useCORS: true,
        logging: false
      });
      
      // PDF erstellen
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Berechnungen für die Bildanpassung
      const imgWidth = 190;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      // Bild zum PDF hinzufügen
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      // QR-Code zum PDF hinzufügen
      pdf.addImage(qrDataUrl, 'PNG', 155, 10, 35, 35);
      
      // PDF als Blob speichern
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      
      // URL für die Vorschau erstellen
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      
      // PDF-Vorschau anzeigen
      setShowPdfDialog(true);
      
      // Status aktualisieren
      toast({
        title: "PDF erfolgreich generiert",
        description: "Das PDF wurde erfolgreich erstellt."
      });
    } catch (error) {
      toast({
        title: "Fehler beim Generieren",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  
  // PDF herunterladen
  const handleDownloadPdf = () => {
    if (!pdfBlob) return;
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bestellung_${order.orderNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // PDF drucken
  const handlePrintPdf = () => {
    if (!pdfUrl) return;
    
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };
  
  // E-Mail Dialog öffnen
  const handleOpenEmailDialog = () => {
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

    setShowEmailDialog(true);
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
          emailData.cc = ccAddresses.split(',').map(email => email.trim());
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
  
  return (
    <div className="flex flex-col space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleGeneratePdf}
          disabled={isGeneratingPdf || !order}
        >
          {isGeneratingPdf ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              PDF generieren...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              PDF generieren
            </>
          )}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenEmailDialog}
          disabled={!pdfBlob || !order}
        >
          <Mail className="mr-2 h-4 w-4" />
          Per E-Mail versenden
        </Button>
      </div>
      
      {/* PDF Vorschau Dialog */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
          <DialogHeader>
            <DialogTitle>PDF Vorschau - Bestellung {order?.orderNumber}</DialogTitle>
            <DialogDescription>
              Vorschau der generierten PDF-Datei
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <PdfViewer url={pdfUrl} />
          </div>
          
          <DialogFooter className="flex justify-between sm:justify-between">
            <div className="space-x-2">
              <Button 
                type="button" 
                variant="outline"
                onClick={handlePrintPdf}
                disabled={!pdfUrl}
              >
                <Printer className="mr-2 h-4 w-4" />
                Drucken
              </Button>
              
              <Button 
                type="button" 
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={!pdfBlob}
              >
                <Download className="mr-2 h-4 w-4" />
                Herunterladen
              </Button>
            </div>
            
            <Button
              type="button"
              onClick={handleOpenEmailDialog}
              disabled={!pdfBlob}
            >
              <Mail className="mr-2 h-4 w-4" />
              Per E-Mail versenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* E-Mail Versand Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bestellung per E-Mail versenden</DialogTitle>
            <DialogDescription>
              Versenden Sie die Bestellung {order?.orderNumber} per E-Mail an den Lieferanten.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Empfänger</Label>
              <Input
                id="email"
                type="email"
                placeholder="lieferant@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cc">CC (optional, mehrere durch Komma trennen)</Label>
              <Input
                id="cc"
                type="text"
                placeholder="empfaenger2@example.com, empfaenger3@example.com"
                value={ccAddresses}
                onChange={(e) => setCcAddresses(e.target.value)}
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
              <Label htmlFor="text">Nachricht</Label>
              <Textarea
                id="text"
                rows={8}
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmailDialog(false)}
            >
              Abbrechen
            </Button>
            
            <Button
              type="button"
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending || !emailAddress || !emailSubject || !emailText}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import LoadingButton from "@/components/common/LoadingButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent 
} from "@/components/ui/tabs";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, Download, Send, Eye } from "lucide-react";

interface OrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  supplierEmail?: string;
  orderNumber: string;
  supplierName: string;
  pdfBlob?: Blob;
  onSendEmail?: (supplierEmail: string, additionalNotes: string) => void;
}

/**
 * Erweiterte E-Mail-Dialog-Komponente mit PDF-Vorschau
 * 
 * Diese Komponente bietet:
 * - Auswahl aus verschiedenen E-Mail-Vorlagen
 * - Vorschau der PDF (falls verfügbar)
 * - Volle Bearbeitungsmöglichkeit des E-Mail-Textes
 * - Anpassung der E-Mail-Empfänger und Betreff
 */
const OrderEmailDialog: React.FC<OrderEmailDialogProps> = ({
  open,
  onOpenChange,
  orderId,
  supplierEmail: initialSupplierEmail = "",
  orderNumber,
  supplierName,
  pdfBlob,
  onSendEmail,
}) => {
  const { toast } = useToast();
  const [emailContent, setEmailContent] = useState<string>("");
  const [supplierEmail, setSupplierEmail] = useState<string>(initialSupplierEmail);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [templateType, setTemplateType] = useState<string>("standard");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // E-Mail-Vorlage laden
  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ["/api/orders", orderId, "email-template", templateType],
    queryFn: () => 
      apiRequest(`/api/orders/${orderId}/email-template?type=${templateType}`),
    enabled: open,
  });

  // Aktualisiert die E-Mail-Vorlage, wenn sich der Vorlagentyp ändert
  useEffect(() => {
    if (templateData) {
      setEmailContent(templateData.content);
      setEmailSubject(templateData.subject);
    }
  }, [templateData]);

  // E-Mail senden Mutation
  const { mutate: sendEmail, isPending: isSending } = useMutation({
    mutationFn: (data: {
      to: string;
      subject: string;
      content: string;
      templateType: string;
    }) => 
      apiRequest(`/api/orders/${orderId}/email`, {
        method: "POST",
        data,
      }),
    onSuccess: () => {
      toast({
        title: "E-Mail gesendet",
        description: "Die E-Mail wurde erfolgreich versendet",
        variant: "default",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die E-Mail konnte nicht gesendet werden. " + (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Ausgewählte Vorlage beim Klick auf den Tab aktualisieren
  const handleTemplateChange = (value: string) => {
    setTemplateType(value);
  };

  // E-Mail senden
  const handleSendEmail = () => {
    if (!supplierEmail) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine E-Mail-Adresse ein",
        variant: "destructive",
      });
      return;
    }
    
    // Wenn eine externe Handler-Funktion übergeben wurde, nutze diese
    if (onSendEmail) {
      onSendEmail(supplierEmail, emailContent);
      onOpenChange(false);
      return;
    }
    
    // Ansonsten verwende die interne Sende-Logik
    sendEmail({
      to: supplierEmail,
      subject: emailSubject,
      content: emailContent,
      templateType,
    });
  };

  // PDF herunterladen
  const handleDownloadPdf = () => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bestellung_${orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  // PDF in neuem Tab öffnen
  const handleOpenPdfInNewTab = () => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bestellung versenden: {orderNumber}</DialogTitle>
          <DialogDescription>
            Bestellung an {supplierName} vorschau und per E-Mail versenden
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "edit" | "preview")} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="edit">E-Mail bearbeiten</TabsTrigger>
              <TabsTrigger value="preview">PDF-Vorschau</TabsTrigger>
            </TabsList>
            
            {pdfBlob && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenPdfInNewTab}>
                  <Eye className="h-4 w-4 mr-1" />
                  In neuem Tab öffnen
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                  <Download className="h-4 w-4 mr-1" />
                  PDF herunterladen
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="edit" className="flex-1 overflow-auto border-0 p-0 m-0">
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  E-Mail-Adresse
                </Label>
                <Input
                  id="email"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                  placeholder="lieferant@example.com"
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="subject" className="text-right">
                  Betreff
                </Label>
                <Input
                  id="subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="col-span-3"
                />
              </div>

              <div className="mb-4">
                <Label>Vorlage auswählen</Label>
                <Tabs
                  defaultValue="standard"
                  value={templateType}
                  onValueChange={handleTemplateChange}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-3 mt-2">
                    <TabsTrigger value="standard">Standard</TabsTrigger>
                    <TabsTrigger value="dringend">Dringend</TabsTrigger>
                    <TabsTrigger value="nachbestellung">Nachbestellung</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {templateLoading ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Vorlage wird geladen...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="emailContent" className="mb-2 block">
                      E-Mail-Inhalt
                    </Label>
                    <Textarea
                      id="emailContent"
                      value={emailContent}
                      onChange={(e) => setEmailContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="E-Mail-Inhalt wird geladen..."
                    />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Der Platzhalter {{orderItems}} wird automatisch durch die Artikeltabelle ersetzt
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-auto border-0 p-0 m-0">
            {pdfBlob ? (
              <div className="w-full h-full min-h-[400px] border rounded-md overflow-hidden">
                <iframe 
                  src={URL.createObjectURL(pdfBlob)} 
                  className="w-full h-full" 
                  title="PDF Vorschau"
                />
              </div>
            ) : (
              <Card className="h-full flex items-center justify-center min-h-[400px]">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">PDF wird geladen...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-end mt-4">
          <DialogClose asChild>
            <Button variant="outline">Abbrechen</Button>
          </DialogClose>
          <LoadingButton
            isLoading={isSending}
            loadingText="Wird gesendet..."
            onClick={handleSendEmail}
            variant="default"
          >
            <Send className="h-4 w-4 mr-2" />
            E-Mail senden
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderEmailDialog;
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, CheckCircle, RefreshCw, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import LoadingButton from "@/components/common/LoadingButton";

interface OrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  supplierEmail?: string;
  orderNumber: string;
  supplierName: string;
}

const OrderEmailDialog: React.FC<OrderEmailDialogProps> = ({
  open,
  onOpenChange,
  orderId,
  supplierEmail,
  orderNumber,
  supplierName,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // E-Mail-Template Typen
  const emailTemplates = {
    standard: "Standard-Bestellung",
    dringend: "Dringende Bestellung",
    nachbestellung: "Nachbestellung"
  };

  // State für E-Mail Felder
  const [emailType, setEmailType] = useState<keyof typeof emailTemplates>("standard");
  const [to, setTo] = useState(supplierEmail || "");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Erstellen von Betreff und Inhalt basierend auf Template
  useEffect(() => {
    // Betreff generieren
    switch (emailType) {
      case "dringend":
        setSubject(`DRINGEND: Bestellung ${orderNumber} - ${supplierName}`);
        break;
      case "nachbestellung":
        setSubject(`Nachbestellung ${orderNumber} - ${supplierName}`);
        break;
      default:
        setSubject(`Bestellung ${orderNumber} - ${supplierName}`);
    }

    // Inhalt basierend auf Template generieren
    loadEmailTemplate(emailType);
  }, [emailType, orderNumber, supplierName]);

  // E-Mail-Template laden
  const loadEmailTemplate = async (templateType: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/email-template?type=${templateType}`);
      if (!response.ok) {
        throw new Error("Fehler beim Laden der E-Mail-Vorlage");
      }
      const data = await response.json();
      setContent(data.content);
    } catch (error) {
      console.error("Fehler beim Laden der E-Mail-Vorlage:", error);
      // Fallback-Template, falls API-Aufruf fehlschlägt
      const companyName = "Elbsandstein Proviant & Quartier GmbH";
      const companyContact = "Felix Zschoge | Proviantomat | www.proviantomat.de";
      const companyAddress = "Seifhennersdorfer Str. 14 | 01099 Dresden | 0173 - 4385330";
      
      // Standardinhalte für verschiedene Template-Typen
      let emailBody = "";
      
      switch (templateType) {
        case "dringend":
          emailBody = `Sehr geehrte Damen und Herren,

DRINGEND: Hiermit bestellen wir folgende Artikel mit der Bitte um schnellstmögliche Lieferung:

ARTIKELLISTE WIRD AUTOMATISCH EINGEFÜGT

Bestellnummer: ${orderNumber}
Lieferdatum: Bitte schnellstmöglich

Aufgrund unserer aktuellen Bestandssituation bitten wir um bevorzugte und beschleunigte Bearbeitung.

Bitte bestätigen Sie den Erhalt dieser Bestellung und das voraussichtliche Lieferdatum umgehend.

Mit freundlichen Grüßen,

${companyName}
${companyContact}
${companyAddress}`;
          break;
          
        case "nachbestellung":
          emailBody = `Sehr geehrte Damen und Herren,

hiermit senden wir eine Nachbestellung zu einer kürzlich getätigten Bestellung:

ARTIKELLISTE WIRD AUTOMATISCH EINGEFÜGT

Bestellnummer: ${orderNumber}
Lieferdatum: Nach Vereinbarung

Bitte liefern Sie diese Nachbestellung wenn möglich zusammen mit unserer Hauptbestellung.

Mit freundlichen Grüßen,

${companyName}
${companyContact}
${companyAddress}`;
          break;
          
        default: // standard
          emailBody = `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

ARTIKELLISTE WIRD AUTOMATISCH EINGEFÜGT

Bestellnummer: ${orderNumber}
Gewünschtes Lieferdatum: Nach Vereinbarung

Bitte bestätigen Sie uns den Erhalt dieser Bestellung und das voraussichtliche Lieferdatum.

Mit freundlichen Grüßen,

${companyName}
${companyContact}
${companyAddress}`;
      }
      
      setContent(emailBody);
    }
  };

  // E-Mail senden
  const handleSendEmail = async () => {
    if (!to) {
      toast({
        title: "E-Mail-Adresse fehlt",
        description: "Bitte geben Sie eine E-Mail-Adresse für den Empfänger ein.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to,
          subject,
          content,
          templateType: emailType
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Fehler beim Senden der E-Mail");
      }

      toast({
        title: "E-Mail gesendet",
        description: "Die Bestellung wurde erfolgreich per E-Mail versendet."
      });

      // Cache für Bestellungen aktualisieren
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });

      // Dialog schließen
      onOpenChange(false);
    } catch (error) {
      console.error("Fehler beim Senden der E-Mail:", error);
      toast({
        title: "Fehler beim Senden",
        description: `${(error as Error).message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Zwischen Bearbeiten und Vorschau umschalten
  const togglePreviewMode = () => {
    setPreviewMode(!previewMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Mail className="mr-2 h-5 w-5" />
            Bestellung per E-Mail senden
          </DialogTitle>
          <DialogDescription>
            Senden Sie die Bestellung per E-Mail an den Lieferanten.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="standard" value={emailType} onValueChange={(value) => setEmailType(value as keyof typeof emailTemplates)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="standard">Standard</TabsTrigger>
            <TabsTrigger value="dringend">Dringend</TabsTrigger>
            <TabsTrigger value="nachbestellung">Nachbestellung</TabsTrigger>
          </TabsList>
          
          <div className="mt-4">
            <div className="mb-4">
              <Label htmlFor="to">Empfänger</Label>
              <Input
                id="to"
                placeholder="lieferant@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="mb-4">
              <Label htmlFor="subject">Betreff</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="content">Inhalt</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePreviewMode}
                  className="text-xs"
                >
                  {previewMode ? (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3" /> Bearbeiten
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1 h-3 w-3" /> Vorschau
                    </>
                  )}
                </Button>
              </div>

              {previewMode ? (
                <Card className="border border-gray-200 dark:border-gray-800">
                  <CardContent className="pt-4">
                    <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }} />
                  </CardContent>
                </Card>
              ) : (
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isLoading}
                  rows={12}
                  className="font-mono text-sm"
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Hinweis: Die Artikelliste wird automatisch eingefügt, wenn Sie die E-Mail senden.
              </p>
            </div>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Abbrechen
          </Button>
          <LoadingButton 
            onClick={handleSendEmail} 
            isLoading={isLoading}
            loadingText="Wird gesendet..."
          >
            <Send className="mr-2 h-4 w-4" /> E-Mail senden
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderEmailDialog;
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Icons
import {
  Mail,
  Loader2,
  Send,
  InfoIcon
} from "lucide-react";

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
  
  // E-Mail-Dialog öffnen
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
  
  // E-Mail senden
  const handleSendEmail = async () => {
    if (!emailAddress || !emailSubject || !emailText) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // E-Mail-Daten vorbereiten
      const emailData = {
        to: emailAddress,
        subject: emailSubject,
        text: emailText,
        html: emailText.replace(/\n/g, '<br>')
      };
      
      // CC-Empfänger hinzufügen, wenn vorhanden
      if (ccAddresses) {
        (emailData as any).cc = ccAddresses.split(',').map(email => email.trim());
      }
      
      // E-Mail senden
      sendEmailMutation.mutate(emailData);
    } catch (error) {
      toast({
        title: "Fehler beim Senden",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleOpenEmailDialog}
        disabled={!order}
        className="flex items-center"
      >
        <Mail className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">E-Mail senden</span>
        <span className="sm:hidden">E-Mail</span>
      </Button>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Bestellung {order?.orderNumber} - E-Mail versenden
            </DialogTitle>
            <DialogDescription>
              Füllen Sie die E-Mail-Details aus, um die Bestellung zu versenden.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emailTo">An:</Label>
              <Input 
                id="emailTo"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="E-Mail-Adresse des Empfängers"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="emailCc">CC:</Label>
              <Input 
                id="emailCc"
                value={ccAddresses}
                onChange={(e) => setCcAddresses(e.target.value)}
                placeholder="CC-Empfänger (mit Komma getrennt)"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="emailSubject">Betreff:</Label>
              <Input 
                id="emailSubject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Betreff der E-Mail"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="emailBody">Nachricht:</Label>
              <Textarea 
                id="emailBody"
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Text der E-Mail"
                className="h-[200px]"
              />
            </div>
            
            <Alert className="mt-4">
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>Information</AlertTitle>
              <AlertDescription>
                Die E-Mail enthält die Bestellinformationen im Text und wird ohne Anhang versendet.
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={handleSendEmail}
              disabled={!emailAddress || !emailSubject || !emailText || sendEmailMutation.isPending}
              className="flex items-center"
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gesendet...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  E-Mail senden
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
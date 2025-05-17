import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface TextEmailButtonProps {
  orderId: number;
  orderNumber: string;
  supplierEmail?: string;
  supplierName?: string;
}

export function TextEmailButton({ orderId, orderNumber, supplierEmail, supplierName }: TextEmailButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(supplierEmail || '');
  const [subject, setSubject] = useState(`Bestellung ${orderNumber} von Elbsandstein Proviant & Quartier GmbH`);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const handleSendEmail = async () => {
    if (!email || !email.includes('@')) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Bestellpositionen abrufen
      const itemsResponse = await fetch(`/api/orders/${orderId}/items`);
      const items = await itemsResponse.json();

      // Bestellung abrufen
      const orderResponse = await fetch(`/api/orders/${orderId}`);
      const order = await orderResponse.json();

      // Einfachen E-Mail-Text erstellen
      let emailText = `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Bestellung mit der Nummer ${orderNumber}.

`;

      if (supplierName) {
        emailText += `Lieferant: ${supplierName}\n`;
      }

      if (order.expectedDeliveryDate) {
        const deliveryDate = new Date(order.expectedDeliveryDate);
        emailText += `Gewünschtes Lieferdatum: ${deliveryDate.toLocaleDateString('de-DE')}\n`;
      }

      if (notes) {
        emailText += `\nAnmerkungen: ${notes}\n`;
      }

      emailText += `\nBestellpositionen:\n`;
      emailText += `----------------------------------------------------\n`;
      if (items && items.length > 0) {
        items.forEach((item, index) => {
          const unitPrice = item.unitPrice ? `${item.unitPrice.toFixed(2)} €` : 'k.A.';
          const totalPrice = item.totalPrice ? `${item.totalPrice.toFixed(2)} €` : 'k.A.';
          emailText += `${index + 1}. ${item.productName} - ${item.quantity} ${item.unit || 'stk'} - ${unitPrice} - Gesamt: ${totalPrice}\n`;
        });

        // Gesamtsumme
        const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        emailText += `----------------------------------------------------\n`;
        emailText += `Gesamtbetrag: ${totalAmount.toFixed(2)} €\n`;
      } else {
        emailText += "Keine Bestellpositionen vorhanden.\n";
      }

      emailText += `\nMit freundlichen Grüßen\nElbsandstein Proviant & Quartier GmbH`;

      // Mock-E-Mail-Versand (da wir den echten Endpunkt nicht haben)
      // In einer echten Umgebung würden wir hier einen API-Endpunkt aufrufen
      console.log("E-Mail würde gesendet werden:", {
        to: email,
        subject,
        text: emailText
      });

      // Mock-Erfolgsmeldung
      toast({
        title: "E-Mail erstellt",
        description: "Die E-Mail wurde an Ihr E-Mail-Programm weitergeleitet. Bitte überprüfen Sie den Text und senden Sie die E-Mail manuell.",
      });

      // E-Mail öffnen in Standard-E-Mail-Programm
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailText)}`;

      setOpen(false);
    } catch (error) {
      console.error('Fehler beim Vorbereiten der E-Mail:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Fehler beim Vorbereiten der E-Mail',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
        <Mail className="mr-2 h-4 w-4" /> E-Mail ohne Anhang
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestellung per E-Mail senden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail-Adresse des Lieferanten</Label>
              <Input
                id="email"
                placeholder="lieferant@beispiel.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Betreff</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Zusätzliche Anmerkungen</Label>
              <Textarea
                id="notes"
                placeholder="Optionale Anmerkungen zur Bestellung..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Abbrechen
            </Button>
            <Button type="button" onClick={handleSendEmail} disabled={loading}>
              {loading ? "Wird vorbereitet..." : "E-Mail vorbereiten"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
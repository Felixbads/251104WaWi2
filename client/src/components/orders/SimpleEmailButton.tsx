import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from '@lib/queryClient';

interface SimpleEmailButtonProps {
  orderId: number;
  orderNumber: string;
  supplierEmail?: string;
  supplierName?: string;
}

export function SimpleEmailButton({ orderId, orderNumber, supplierEmail, supplierName }: SimpleEmailButtonProps) {
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
      const response = await apiRequest(`/api/orders/${orderId}/simple-email`, {
        method: 'POST',
        body: JSON.stringify({
          supplierEmail: email,
          subject,
          additionalNotes: notes
        })
      });

      if (response.success) {
        toast({
          title: "E-Mail gesendet",
          description: response.message,
        });
        setOpen(false);
      } else {
        throw new Error(response.error || 'Fehler beim Senden der E-Mail');
      }
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Fehler beim Senden der E-Mail',
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
              {loading ? "Wird gesendet..." : "E-Mail senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
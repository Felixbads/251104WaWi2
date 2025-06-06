import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Send } from 'lucide-react';

interface DirectEmailSenderProps {
  orderId: number;
  orderNumber?: string;
  supplierEmail?: string;
  onSuccess: () => void;
}

export default function DirectEmailSender({
  orderId,
  orderNumber,
  supplierEmail,
  onSuccess
}: DirectEmailSenderProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Direct state management without any form validation
  const [to, setTo] = useState(supplierEmail || 'test@proviantomat.de');
  const [cc, setCc] = useState('andreas@proviantomat.de, einkauf@proviantomat.de');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(`Bestellung ${orderNumber || orderId}`);
  const [content, setContent] = useState(`
Sehr geehrte Damen und Herren,

hiermit möchten wir folgende Bestellung aufgeben:

Bestellnummer: ${orderNumber || orderId}

Mit freundlichen Grüßen
Ihr Proviantomat-Team
  `.trim());

  const handleDirectSend = async () => {
    // Basic validation only
    if (!to.trim()) {
      toast({
        title: "Fehler",
        description: "E-Mail-Adresse ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: "Fehler", 
        description: "Betreff ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "Fehler",
        description: "E-Mail-Inhalt ist erforderlich", 
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      // Direct fetch without any form library involvement
      const requestData = {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        content: content.trim()
      };

      console.log('[DirectEmailSender] Sending request:', requestData);

      const response = await fetch(`/api/orders/${orderId}/send-email-bypass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();
      console.log('[DirectEmailSender] Response:', result);

      if (response.ok && result.success) {
        toast({
          title: "Erfolg",
          description: "E-Mail erfolgreich verarbeitet",
        });
        onSuccess();
      } else {
        console.error('[DirectEmailSender] Failed:', result);
        throw new Error(result.error || 'Fehler beim Senden der E-Mail');
      }

    } catch (error) {
      console.error('[DirectEmailSender] Error:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('[DirectEmailSender] Error message:', errorMessage);
      
      if (errorMessage.includes('string did not match the expected pattern')) {
        toast({
          title: "Validierungsfehler",
          description: "Systemvalidierung fehlgeschlagen. Bitte kontaktieren Sie den Support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Fehler",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Direkter E-Mail-Versand (Bypass-Modus)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="direct-to">An (Test-E-Mail verwenden)</Label>
            <Input
              id="direct-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="test@proviantomat.de"
            />
          </div>

          <div>
            <Label htmlFor="direct-cc">CC</Label>
            <Input
              id="direct-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="CC-Empfänger (optional)"
            />
          </div>

          <div>
            <Label htmlFor="direct-bcc">BCC</Label>
            <Input
              id="direct-bcc"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="BCC-Empfänger (optional)"
            />
          </div>

          <div>
            <Label htmlFor="direct-subject">Betreff</Label>
            <Input
              id="direct-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E-Mail-Betreff"
            />
          </div>

          <div>
            <Label htmlFor="direct-content">Nachricht</Label>
            <Textarea
              id="direct-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="E-Mail-Inhalt"
              rows={10}
            />
          </div>
        </div>

        <Button 
          onClick={handleDirectSend}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Sende...' : 'E-Mail senden (Bypass)'}
        </Button>

        <div className="text-sm text-muted-foreground">
          <p>Hinweis: Dieser Bypass-Modus umgeht alle Formvalidierungen und sendet direkt an den Server.</p>
          <p>Verwenden Sie Test-E-Mail-Adressen für Tests.</p>
        </div>
      </CardContent>
    </Card>
  );
}
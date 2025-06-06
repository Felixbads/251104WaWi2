import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RawHttpEmailSenderProps {
  orderId: number;
  orderNumber: string;
  supplierEmail: string;
  onSuccess?: () => void;
}

export function RawHttpEmailSender({ 
  orderId, 
  orderNumber, 
  supplierEmail,
  onSuccess 
}: RawHttpEmailSenderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Raw form fields - no validation
  const [emailData, setEmailData] = useState({
    to: 'test@proviantomat.de',
    cc: 'backup@proviantomat.de',
    subject: `Bestellung ${orderNumber}`,
    message: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung ${orderNumber}.

Mit freundlichen Grüßen
Ihr Proviantomat-Team`
  });

  const handleSendRawEmail = async () => {
    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      console.log('[RawHttp] Sending raw HTTP request...');

      // Completely raw fetch - no libraries, no validation
      const rawResponse = await fetch(`/api/orders/${orderId}/raw-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawEmailData: emailData,
          orderId,
          orderNumber,
          timestamp: new Date().toISOString()
        })
      });

      console.log('[RawHttp] Response status:', rawResponse.status);
      console.log('[RawHttp] Response headers:', Object.fromEntries(rawResponse.headers.entries()));

      const responseText = await rawResponse.text();
      console.log('[RawHttp] Raw response text:', responseText);

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        parsedResponse = { rawText: responseText, parseError: String(parseError) };
      }

      setResponse(parsedResponse);

      if (rawResponse.ok && parsedResponse.success) {
        console.log('[RawHttp] Success!');
        onSuccess?.();
      } else {
        console.log('[RawHttp] Request completed but not successful');
      }

    } catch (fetchError) {
      console.error('[RawHttp] Raw fetch error:', fetchError);
      setError(`Raw HTTP error: ${String(fetchError)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Raw HTTP E-Mail Sender
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="raw-to">An (Test E-Mail)</Label>
            <Input
              id="raw-to"
              value={emailData.to}
              onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
              placeholder="test@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="raw-cc">CC (Optional)</Label>
            <Input
              id="raw-cc"
              value={emailData.cc}
              onChange={(e) => setEmailData({ ...emailData, cc: e.target.value })}
              placeholder="cc@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="raw-subject">Betreff</Label>
            <Input
              id="raw-subject"
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="raw-message">Nachricht</Label>
            <Textarea
              id="raw-message"
              value={emailData.message}
              onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
              rows={6}
            />
          </div>
        </div>

        <Button
          onClick={handleSendRawEmail}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Raw HTTP E-Mail senden
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {response && (
          <Alert variant={response.success ? "default" : "destructive"}>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div><strong>Status:</strong> {response.success ? 'Erfolg' : 'Fehler'}</div>
                <div><strong>Response:</strong></div>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
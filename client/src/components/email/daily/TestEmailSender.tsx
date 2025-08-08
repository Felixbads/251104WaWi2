import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { TestTube, Mail, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';

interface TestEmailSenderProps {
  manual?: boolean;
}

export const TestEmailSender: React.FC<TestEmailSenderProps> = ({ manual = false }) => {
  const [testEmail, setTestEmail] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>();
  const { toast } = useToast();

  // Lade verfügbare Templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['/api/email/daily/templates'],
    select: (data: any) => data?.data || [],
  });

  // Sende Test-E-Mail
  const sendTestEmailMutation = useMutation({
    mutationFn: async ({ recipientEmail, templateId }: { recipientEmail: string; templateId?: number }) => {
      const response = await fetch('/api/email/daily/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail,
          templateId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler beim Senden der Test-E-Mail');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test-E-Mail gesendet",
        description: `Test-E-Mail wurde erfolgreich an ${testEmail} gesendet.`,
      });
      if (!manual) {
        setTestEmail('');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sende manuelle tägliche E-Mail
  const sendManualEmailMutation = useMutation({
    mutationFn: async (date?: string) => {
      const response = await fetch('/api/email/daily/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: date || new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler beim Senden der E-Mail');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "E-Mail gesendet",
        description: `Tägliche E-Mail wurde erfolgreich an ${data.data?.emailsSent || 0} Empfänger gesendet.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: "E-Mail-Adresse erforderlich",
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
        variant: "destructive",
      });
      return;
    }

    await sendTestEmailMutation.mutateAsync({
      recipientEmail: testEmail,
      templateId: selectedTemplateId,
    });
  };

  const handleSendManualEmail = async () => {
    await sendManualEmailMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      {manual ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Manuelle E-Mail-Benachrichtigung
            </CardTitle>
            <CardDescription>
              Senden Sie eine tägliche E-Mail-Benachrichtigung manuell an alle konfigurierten Empfänger
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Diese Funktion sendet den aktuellen Tagesbericht an alle aktivierten E-Mail-Empfänger.
                Stellen Sie sicher, dass Ihre E-Mail-Einstellungen korrekt konfiguriert sind.
              </AlertDescription>
            </Alert>
            
            <div className="flex justify-center">
              <Button
                onClick={handleSendManualEmail}
                disabled={sendManualEmailMutation.isPending}
                size="lg"
                className="flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                {sendManualEmailMutation.isPending ? 'Sende E-Mail...' : 'Tägliche E-Mail jetzt senden'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Test-E-Mail senden
            </CardTitle>
            <CardDescription>
              Senden Sie eine Test-E-Mail, um Ihre Konfiguration zu überprüfen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Test-E-Mails verwenden Beispieldaten und werden nur an die angegebene E-Mail-Adresse gesendet.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label htmlFor="test-email">E-Mail-Adresse für Test</Label>
                <Input
                  id="test-email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                />
              </div>

              {templates.length > 0 && (
                <div>
                  <Label htmlFor="template-select">E-Mail-Vorlage (optional)</Label>
                  <select
                    id="template-select"
                    value={selectedTemplateId || ''}
                    onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md"
                  >
                    <option value="">Standard-Vorlage verwenden</option>
                    {templates.map((template: any) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleSendTestEmail}
                  disabled={sendTestEmailMutation.isPending || !testEmail}
                  className="flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sendTestEmailMutation.isPending ? 'Sende Test-E-Mail...' : 'Test-E-Mail senden'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
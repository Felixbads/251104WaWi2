import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  TestTube, 
  Send, 
  Mail, 
  Zap, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Settings,
  Eye,
  PlayCircle
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

const eventTypes = [
  { value: 'coin_low', label: 'Niedriger Münzbestand', icon: '🪙' },
  { value: 'cash_high', label: 'Hoher Bargeldbestand', icon: '💰' },
  { value: 'mhd_soon', label: 'MHD-Warnung', icon: '📅' },
  { value: 'stock_low', label: 'Niedriger Lagerbestand', icon: '📦' },
  { value: 'sales_yesterday', label: 'Täglicher Verkaufsbericht', icon: '📊' },
  { value: 'sales_weekly', label: 'Wöchentlicher Verkaufsbericht', icon: '📈' },
  { value: 'margin_report', label: 'Deckungsbeitrags-Analyse', icon: '💰' },
  { value: 'forecast_week', label: 'Wöchentliche Verkaufsprognose', icon: '🔮' },
];

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  timestamp: string;
}

export function NotificationTestCenter() {
  const [activeTab, setActiveTab] = useState('single');
  const [testEmail, setTestEmail] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('coin_low');
  const [testData, setTestData] = useState('{}');
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const { toast } = useToast();

  // Fetch recipients for quick select
  const { data: recipients } = useQuery({
    queryKey: ['/api/notifications/recipients'],
  });

  // Single email test mutation
  const singleTestMutation = useMutation({
    mutationFn: async (data: { email: string; eventType: string; testData?: any }) =>
      apiRequest('/api/notifications/test/single', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      setLastTestResult({
        success: true,
        message: 'Test-E-Mail erfolgreich gesendet',
        data: result,
        timestamp: new Date().toISOString(),
      });
      toast({
        title: 'Test erfolgreich',
        description: 'Die Test-E-Mail wurde erfolgreich gesendet.',
      });
    },
    onError: (error: any) => {
      setLastTestResult({
        success: false,
        message: error.message || 'Fehler beim Senden der Test-E-Mail',
        timestamp: new Date().toISOString(),
      });
      toast({
        title: 'Test fehlgeschlagen',
        description: error.message || 'Fehler beim Senden der Test-E-Mail',
        variant: 'destructive',
      });
    },
  });

  // Trigger test mutation
  const triggerTestMutation = useMutation({
    mutationFn: async (eventType: string) =>
      apiRequest(`/api/notifications/test/trigger/${eventType}`, {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setLastTestResult({
        success: true,
        message: 'Trigger erfolgreich ausgeführt',
        data: result,
        timestamp: new Date().toISOString(),
      });
      toast({
        title: 'Trigger erfolgreich',
        description: 'Der Ereignis-Trigger wurde erfolgreich ausgeführt.',
      });
    },
    onError: (error: any) => {
      setLastTestResult({
        success: false,
        message: error.message || 'Fehler beim Ausführen des Triggers',
        timestamp: new Date().toISOString(),
      });
      toast({
        title: 'Trigger fehlgeschlagen',
        description: error.message || 'Fehler beim Ausführen des Triggers',
        variant: 'destructive',
      });
    },
  });

  // Template preview mutation
  const previewMutation = useMutation({
    mutationFn: async (data: { eventType: string; testData?: any }) =>
      apiRequest('/api/notifications/test/preview', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });

  const handleSingleTest = () => {
    if (!testEmail || !selectedEventType) {
      toast({
        title: 'Unvollständige Angaben',
        description: 'Bitte geben Sie eine E-Mail-Adresse und einen Ereignistyp an.',
        variant: 'destructive',
      });
      return;
    }

    let parsedTestData = {};
    if (testData.trim()) {
      try {
        parsedTestData = JSON.parse(testData);
      } catch (error) {
        toast({
          title: 'Ungültige Testdaten',
          description: 'Die Testdaten müssen gültiges JSON sein.',
          variant: 'destructive',
        });
        return;
      }
    }

    singleTestMutation.mutate({
      email: testEmail,
      eventType: selectedEventType,
      testData: parsedTestData,
    });
  };

  const handleTriggerTest = () => {
    triggerTestMutation.mutate(selectedEventType);
  };

  const handlePreview = () => {
    let parsedTestData = {};
    if (testData.trim()) {
      try {
        parsedTestData = JSON.parse(testData);
      } catch (error) {
        toast({
          title: 'Ungültige Testdaten',
          description: 'Die Testdaten müssen gültiges JSON sein.',
          variant: 'destructive',
        });
        return;
      }
    }

    previewMutation.mutate({
      eventType: selectedEventType,
      testData: parsedTestData,
    });
  };

  const getEventTypeInfo = (eventType: string) => {
    return eventTypes.find(et => et.value === eventType) || { 
      value: eventType, 
      label: eventType, 
      icon: '📧' 
    };
  };

  return (
    <Card data-testid="notification-test-center">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Benachrichtigungs-Testzentrum
        </CardTitle>
        <CardDescription>
          Testen Sie E-Mail-Vorlagen, Trigger und die Benachrichtigungs-Pipeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="single" data-testid="single-test-tab">
              <Mail className="mr-2 h-4 w-4" />
              Einzeltest
            </TabsTrigger>
            <TabsTrigger value="trigger" data-testid="trigger-test-tab">
              <Zap className="mr-2 h-4 w-4" />
              Trigger-Test
            </TabsTrigger>
            <TabsTrigger value="preview" data-testid="preview-tab">
              <Eye className="mr-2 h-4 w-4" />
              Vorschau
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="test-email">Test-E-Mail-Adresse</Label>
                  <Input
                    id="test-email"
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@example.com"
                    data-testid="test-email-input"
                  />
                </div>
                
                <div>
                  <Label htmlFor="quick-recipients">Oder Empfänger auswählen</Label>
                  <Select onValueChange={setTestEmail}>
                    <SelectTrigger data-testid="quick-recipients-select">
                      <SelectValue placeholder="Empfänger auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients?.map((recipient: any) => (
                        <SelectItem key={recipient.id} value={recipient.email}>
                          {recipient.name} ({recipient.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="event-type">Ereignistyp</Label>
                  <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                    <SelectTrigger data-testid="event-type-select">
                      <SelectValue placeholder="Ereignistyp auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((eventType) => (
                        <SelectItem key={eventType.value} value={eventType.value}>
                          {eventType.icon} {eventType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="test-data">Testdaten (JSON, optional)</Label>
                  <Textarea
                    id="test-data"
                    value={testData}
                    onChange={(e) => setTestData(e.target.value)}
                    placeholder='{"machineName": "Test Automat", "location": "Test Standort"}'
                    rows={4}
                    className="font-mono text-sm"
                    data-testid="test-data-input"
                  />
                </div>

                <Button
                  onClick={handleSingleTest}
                  disabled={singleTestMutation.isPending}
                  className="w-full"
                  data-testid="send-test-email-button"
                >
                  {singleTestMutation.isPending ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Sende Test-E-Mail...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Test-E-Mail senden
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Ereignistyp-Information</h3>
                {selectedEventType && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{getEventTypeInfo(selectedEventType).icon}</span>
                        <div>
                          <h4 className="font-medium">{getEventTypeInfo(selectedEventType).label}</h4>
                          <p className="text-sm text-gray-600">{selectedEventType}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        Diese Test-E-Mail verwendet die Vorlage für den ausgewählten Ereignistyp mit den angegebenen Testdaten.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {lastTestResult && (
                  <Alert className={lastTestResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                    <div className="flex items-center gap-2">
                      {lastTestResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">
                        {lastTestResult.success ? 'Test erfolgreich' : 'Test fehlgeschlagen'}
                      </span>
                    </div>
                    <AlertDescription className="mt-2">
                      <p>{lastTestResult.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(lastTestResult.timestamp).toLocaleString('de-DE')}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trigger" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="trigger-event-type">Ereignistyp</Label>
                  <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                    <SelectTrigger data-testid="trigger-event-type-select">
                      <SelectValue placeholder="Ereignistyp auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((eventType) => (
                        <SelectItem key={eventType.value} value={eventType.value}>
                          {eventType.icon} {eventType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Achtung:</strong> Dieser Test löst den echten Trigger aus und sendet E-Mails an alle konfigurierten Empfänger für diesen Ereignistyp.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleTriggerTest}
                  disabled={triggerTestMutation.isPending}
                  className="w-full"
                  variant="outline"
                  data-testid="trigger-test-button"
                >
                  {triggerTestMutation.isPending ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Führe Trigger aus...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Trigger ausführen
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Trigger-Information</h3>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-600 mb-3">
                      Der Trigger-Test führt die komplette Benachrichtigungs-Pipeline aus:
                    </p>
                    <ol className="text-sm space-y-1 list-decimal list-inside text-gray-600">
                      <li>Ereignis auslösen</li>
                      <li>Daten sammeln</li>
                      <li>Empfänger ermitteln</li>
                      <li>E-Mails generieren</li>
                      <li>E-Mails versenden</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="preview-event-type">Ereignistyp</Label>
                  <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                    <SelectTrigger data-testid="preview-event-type-select">
                      <SelectValue placeholder="Ereignistyp auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((eventType) => (
                        <SelectItem key={eventType.value} value={eventType.value}>
                          {eventType.icon} {eventType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="preview-test-data">Testdaten (JSON, optional)</Label>
                  <Textarea
                    id="preview-test-data"
                    value={testData}
                    onChange={(e) => setTestData(e.target.value)}
                    placeholder='{"machineName": "Test Automat", "location": "Test Standort"}'
                    rows={6}
                    className="font-mono text-sm"
                    data-testid="preview-test-data-input"
                  />
                </div>

                <Button
                  onClick={handlePreview}
                  disabled={previewMutation.isPending}
                  className="w-full"
                  data-testid="preview-template-button"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Erstelle Vorschau...
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Vorlage anzeigen
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">E-Mail-Vorschau</h3>
                {previewMutation.data ? (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <div>
                          <strong>Betreff:</strong> {previewMutation.data.subject}
                        </div>
                        <div>
                          <strong>Von:</strong> {previewMutation.data.from}
                        </div>
                        <div className="border-t pt-3">
                          <div 
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: previewMutation.data.html }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">
                        Wählen Sie einen Ereignistyp und klicken Sie auf "Vorlage anzeigen", um eine Vorschau der E-Mail zu sehen.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
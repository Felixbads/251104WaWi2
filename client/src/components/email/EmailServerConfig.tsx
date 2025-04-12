import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Save, XCircle, CheckCircle, Settings, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmailServerSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  provider: 'smtp' | 'mailgun' | 'sendgrid';
  apiKey?: string;
  domain?: string;
}

interface EmailServerConfigProps {
  onSave?: (settings: EmailServerSettings) => void;
}

export const EmailServerConfig: React.FC<EmailServerConfigProps> = ({ onSave }) => {
  const [settings, setSettings] = useState<EmailServerSettings>({
    host: '',
    port: 587,
    username: '',
    password: '',
    secure: true,
    senderName: '',
    senderEmail: '',
    replyTo: '',
    provider: 'smtp'
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<null | { success: boolean; message: string }>(null);
  const [activeTab, setActiveTab] = useState<'smtp' | 'api'>('smtp');
  
  const { toast } = useToast();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // In a real app, we would fetch the settings from an API
        // For this example, we'll simulate a delay
        setTimeout(() => {
          // Default values
          setSettings({
            host: 'smtp.example.com',
            port: 587,
            username: 'user@example.com',
            password: '********',
            secure: true,
            senderName: 'Bestellsystem',
            senderEmail: 'bestellungen@example.com',
            replyTo: 'support@example.com',
            provider: 'smtp'
          });
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error loading email server settings:', error);
        toast({
          title: 'Fehler beim Laden der Einstellungen',
          description: 'Die E-Mail-Server-Einstellungen konnten nicht geladen werden.',
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [toast]);

  const handleInputChange = (key: keyof EmailServerSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    
    // Reset test result when settings change
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // In a real app, we would test the connection with an API call
      // For this example, we'll simulate a delay and then a success
      setTimeout(() => {
        // Simulate success for demo
        const success = Math.random() > 0.3; // 70% chance of success for demo
        
        setTestResult({
          success,
          message: success 
            ? 'Verbindung erfolgreich hergestellt. Test-E-Mail wurde gesendet.' 
            : 'Verbindung fehlgeschlagen. Bitte überprüfen Sie Ihre Einstellungen.'
        });
        
        toast({
          title: success ? 'Verbindungstest erfolgreich' : 'Verbindungstest fehlgeschlagen',
          description: success 
            ? 'Die Verbindung zum E-Mail-Server wurde erfolgreich hergestellt.'
            : 'Die Verbindung zum E-Mail-Server konnte nicht hergestellt werden. Bitte überprüfen Sie Ihre Einstellungen.',
          variant: success ? 'default' : 'destructive',
        });
        
        setIsTesting(false);
      }, 2000);
    } catch (error) {
      console.error('Error testing email server connection:', error);
      setTestResult({
        success: false,
        message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
      });
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    
    try {
      // In a real app, we would save the settings with an API call
      // For this example, we'll simulate a delay and then a success
      setTimeout(() => {
        toast({
          title: 'Einstellungen gespeichert',
          description: 'Die E-Mail-Server-Einstellungen wurden erfolgreich gespeichert.',
        });
        
        if (onSave) {
          onSave(settings);
        }
        
        setIsSaving(false);
      }, 1000);
    } catch (error) {
      console.error('Error saving email server settings:', error);
      toast({
        title: 'Fehler beim Speichern',
        description: 'Die E-Mail-Server-Einstellungen konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>E-Mail-Server-Einstellungen</CardTitle>
        <CardDescription>Konfigurieren Sie Ihren E-Mail-Server für das Versenden von Bestellungen und Benachrichtigungen</CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Einstellungen werden geladen...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="smtp" 
                onClick={() => handleInputChange('provider', 'smtp')}
              >
                SMTP Server
              </TabsTrigger>
              <TabsTrigger value="api"
                onClick={() => handleInputChange('provider', activeTab === 'smtp' ? 'mailgun' : settings.provider)}
              >
                API Dienste (Mailgun, SendGrid)
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="smtp" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="host">SMTP Server</Label>
                  <Input 
                    id="host"
                    placeholder="z.B. smtp.gmail.com"
                    value={settings.host}
                    onChange={(e) => handleInputChange('host', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input 
                    id="port"
                    type="number"
                    placeholder="z.B. 587"
                    value={settings.port}
                    onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="username">Benutzername</Label>
                  <Input 
                    id="username"
                    placeholder="z.B. user@example.com"
                    value={settings.username}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="password">Passwort</Label>
                  <Input 
                    id="password"
                    type="password"
                    placeholder="Ihr SMTP-Passwort"
                    value={settings.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox 
                    id="secure"
                    checked={settings.secure}
                    onCheckedChange={(checked) => handleInputChange('secure', !!checked)}
                  />
                  <Label htmlFor="secure" className="cursor-pointer">
                    Sichere Verbindung (SSL/TLS) verwenden
                  </Label>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="api" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="api-provider">E-Mail-API-Anbieter</Label>
                  <Select 
                    value={settings.provider !== 'smtp' ? settings.provider : 'mailgun'}
                    onValueChange={(value) => handleInputChange('provider', value)}
                  >
                    <SelectTrigger id="api-provider" className="mt-1">
                      <SelectValue placeholder="Wählen Sie einen API-Anbieter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="apiKey">API-Schlüssel</Label>
                  <Input 
                    id="apiKey"
                    type="password"
                    placeholder={`Ihr ${settings.provider === 'mailgun' ? 'Mailgun' : 'SendGrid'} API-Schlüssel`}
                    value={settings.apiKey || ''}
                    onChange={(e) => handleInputChange('apiKey', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                {settings.provider === 'mailgun' && (
                  <div>
                    <Label htmlFor="domain">Domain</Label>
                    <Input 
                      id="domain"
                      placeholder="z.B. mg.example.com"
                      value={settings.domain || ''}
                      onChange={(e) => handleInputChange('domain', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </TabsContent>
            
            <div className="border-t mt-6 pt-6">
              <h3 className="text-lg font-medium mb-4">Absender-Einstellungen</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="senderName">Absender-Name</Label>
                  <Input 
                    id="senderName"
                    placeholder="z.B. Bestellsystem"
                    value={settings.senderName}
                    onChange={(e) => handleInputChange('senderName', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="senderEmail">Absender-E-Mail</Label>
                  <Input 
                    id="senderEmail"
                    placeholder="z.B. bestellungen@example.com"
                    value={settings.senderEmail}
                    onChange={(e) => handleInputChange('senderEmail', e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="replyTo">Antwort an</Label>
                  <Input 
                    id="replyTo"
                    placeholder="z.B. support@example.com"
                    value={settings.replyTo}
                    onChange={(e) => handleInputChange('replyTo', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            
            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'} className="mt-6">
                {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <AlertTitle>{testResult.success ? 'Verbindungstest erfolgreich' : 'Verbindungstest fehlgeschlagen'}</AlertTitle>
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}
          </Tabs>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        <Button 
          variant="outline" 
          onClick={handleTestConnection}
          disabled={isLoading || isTesting || isSaving}
        >
          {isTesting ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Teste Verbindung...
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Verbindung testen
            </>
          )}
        </Button>
        
        <Button 
          onClick={handleSaveSettings}
          disabled={isLoading || isTesting || isSaving}
        >
          {isSaving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Speichern...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Einstellungen speichern
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EmailServerConfig;
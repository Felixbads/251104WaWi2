import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, CheckCircle, XCircle, Server, Package, Building, Database } from 'lucide-react';

interface ConnectionConfig {
  targetURL: string;
  appName: string;
}

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
}

export default function InterAppConnections() {
  const [config, setConfig] = useState<ConnectionConfig>({
    targetURL: '',
    appName: 'service-platform'
  });
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Verbindungsstatus abrufen
  const { data: connectionStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/inter-app-test/status'],
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren
  });

  // Verbindung konfigurieren
  const configureMutation = useMutation({
    mutationFn: async (config: ConnectionConfig) => {
      return apiRequest('/api/inter-app-test/configure', {
        method: 'POST',
        body: JSON.stringify(config)
      });
    },
    onSuccess: (data) => {
      setIsConnected(true);
      toast({
        title: "Verbindung erfolgreich",
        description: `Verbindung zur Service-Plattform hergestellt`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inter-app-test/status'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Verbindungsfehler",
        description: error.message || "Fehler beim Herstellen der Verbindung"
      });
    }
  });

  // Health Check
  const healthMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/inter-app-test/health');
    },
    onSuccess: (data) => {
      toast({
        title: "Health Check erfolgreich",
        description: "Verbindung ist aktiv und funktionsfähig"
      });
    }
  });

  // Lieferanten testen
  const suppliersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/inter-app-test/suppliers');
    }
  });

  // Produkte testen
  const productsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/inter-app-test/products');
    }
  });

  // Vollständigkeitsanalyse
  const completenessMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/inter-app-test/data-completeness');
    }
  });

  // Verbindung trennen
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/inter-app-test/disconnect', {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      setIsConnected(false);
      toast({
        title: "Verbindung getrennt",
        description: "Verbindung zur Service-Plattform wurde getrennt"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inter-app-test/status'] });
    }
  });

  const handleConnect = () => {
    if (!config.targetURL) {
      toast({
        variant: "destructive",
        title: "URL erforderlich",
        description: "Bitte geben Sie die URL der Service-Plattform ein"
      });
      return;
    }
    configureMutation.mutate(config);
  };

  const renderTestResult = (result: TestResult, title: string) => {
    if (!result) return null;

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.success ? (
            <div className="space-y-2">
              {result.data && (
                <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-40">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                {result.error || 'Unbekannter Fehler'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inter-App Verbindungen</h1>
          <p className="text-gray-600 mt-2">
            Sichere Kommunikation zwischen Warenwirtschaft und Service-Plattform
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {connectionStatus?.connected ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-4 w-4 mr-1" />
              Verbunden
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="h-4 w-4 mr-1" />
              Nicht verbunden
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connection">Verbindung</TabsTrigger>
          <TabsTrigger value="testing">API-Tests</TabsTrigger>
          <TabsTrigger value="data-analysis">Datenanalyse</TabsTrigger>
          <TabsTrigger value="security">Sicherheit</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Verbindung zur Service-Plattform
              </CardTitle>
              <CardDescription>
                Konfigurieren Sie die sichere Verbindung zu Ihrer zweiten Replit-Anwendung
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="targetURL">Service-Plattform URL</Label>
                <Input
                  id="targetURL"
                  placeholder="https://ihre-service-plattform.replit.app"
                  value={config.targetURL}
                  onChange={(e) => setConfig({ ...config, targetURL: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="appName">Anwendungsname</Label>
                <Input
                  id="appName"
                  placeholder="service-platform"
                  value={config.appName}
                  onChange={(e) => setConfig({ ...config, appName: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleConnect}
                  disabled={configureMutation.isPending}
                >
                  {configureMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Verbinden
                </Button>

                {connectionStatus?.connected && (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => healthMutation.mutate()}
                      disabled={healthMutation.isPending}
                    >
                      {healthMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Health Check
                    </Button>

                    <Button 
                      variant="destructive"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                    >
                      Trennen
                    </Button>
                  </>
                )}
              </div>

              {configureMutation.data && renderTestResult(configureMutation.data, 'Verbindungstest')}
              {healthMutation.data && renderTestResult(healthMutation.data, 'Health Check')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Lieferanten testen
                </CardTitle>
                <CardDescription>
                  Teste den Zugriff auf Lieferantendaten
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => suppliersMutation.mutate()}
                  disabled={suppliersMutation.isPending || !connectionStatus?.connected}
                  className="w-full"
                >
                  {suppliersMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Lieferanten abrufen
                </Button>
                {suppliersMutation.data && renderTestResult(suppliersMutation.data, 'Lieferanten')}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Produkte testen
                </CardTitle>
                <CardDescription>
                  Teste den Zugriff auf Produktdaten
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => productsMutation.mutate()}
                  disabled={productsMutation.isPending || !connectionStatus?.connected}
                  className="w-full"
                >
                  {productsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Produkte abrufen
                </Button>
                {productsMutation.data && renderTestResult(productsMutation.data, 'Produkte')}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data-analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Daten-Vollständigkeitsanalyse
              </CardTitle>
              <CardDescription>
                Analysiere die Vollständigkeit der Lieferanten- und Produktdaten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => completenessMutation.mutate()}
                disabled={completenessMutation.isPending || !connectionStatus?.connected}
                className="mb-4"
              >
                {completenessMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Vollständigkeitsanalyse starten
              </Button>

              {completenessMutation.data?.success && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Lieferanten</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Gesamt:</span>
                          <span>{completenessMutation.data.data.suppliers?.total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Beschreibung:</span>
                          <span>{completenessMutation.data.data.suppliers?.completeness?.description || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Website:</span>
                          <span>{completenessMutation.data.data.suppliers?.completeness?.website || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Adresse:</span>
                          <span>{completenessMutation.data.data.suppliers?.completeness?.address || 0}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Produkte</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Gesamt:</span>
                          <span>{completenessMutation.data.data.products?.total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Beschreibung:</span>
                          <span>{completenessMutation.data.data.products?.completeness?.description || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Preis:</span>
                          <span>{completenessMutation.data.data.products?.completeness?.price || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mit Lieferant:</span>
                          <span>{completenessMutation.data.data.products?.completeness?.supplier || 0}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Sicherheitsfeatures</CardTitle>
              <CardDescription>
                Übersicht über die implementierten Sicherheitsmaßnahmen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="font-semibold">Authentifizierung</h3>
                  <ul className="space-y-1 text-sm">
                    <li>✓ HMAC-SHA256 Signaturen</li>
                    <li>✓ API-Schlüssel Validierung</li>
                    <li>✓ Timestamp-basierter Replay-Schutz</li>
                    <li>✓ Request-Body Integrität</li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-semibold">Rate Limiting</h3>
                  <ul className="space-y-1 text-sm">
                    <li>✓ 200 Requests pro Minute</li>
                    <li>✓ Pro-App Limitierung</li>
                    <li>✓ Automatische Blockierung</li>
                    <li>✓ Sliding Window Algorithmus</li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-semibold">Datenvalidierung</h3>
                  <ul className="space-y-1 text-sm">
                    <li>✓ Input Sanitization</li>
                    <li>✓ Schema Validierung</li>
                    <li>✓ SQL Injection Schutz</li>
                    <li>✓ XSS Prävention</li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-semibold">Logging & Monitoring</h3>
                  <ul className="space-y-1 text-sm">
                    <li>✓ Request/Response Logging</li>
                    <li>✓ Fehler-Tracking</li>
                    <li>✓ Performance Monitoring</li>
                    <li>✓ Security Event Logs</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
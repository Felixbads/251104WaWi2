import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Settings, 
  Database, 
  Zap, 
  Mail, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  Activity,
  Clock,
  Server,
  Monitor
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface SystemHealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'offline';
  components: {
    database: 'healthy' | 'warning' | 'error' | 'offline';
    queueSystem: 'healthy' | 'warning' | 'error' | 'offline';
    emailService: 'healthy' | 'warning' | 'error' | 'offline';
    triggers: 'healthy' | 'warning' | 'error' | 'offline';
  };
  metrics: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
  };
  lastCheck: string;
}

interface QueueMetrics {
  totalJobs: number;
  activeJobs: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  queues: Array<{
    name: string;
    jobCount: number;
    processing: number;
    failed: number;
  }>;
}

export function NotificationSystemStatus() {
  const [activeTab, setActiveTab] = useState('health');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch system health
  const { data: systemStatus, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['/api/notifications/status'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Map the API response to the expected component structure
  const health = systemStatus ? {
    overall: systemStatus.system?.healthy ? 'healthy' : 'offline',
    components: {
      database: systemStatus.system?.healthy ? 'healthy' : 'offline',
      queueSystem: systemStatus.system?.healthy && Object.values(systemStatus.queue || {}).every(count => count >= 0) ? 'healthy' : 'offline',
      emailService: systemStatus.system?.healthy ? 'healthy' : 'offline',
      triggers: systemStatus.system?.healthy ? 'healthy' : 'offline',
    },
    metrics: {
      uptime: 0, // Not provided by current API
      memoryUsage: 0,
      cpuUsage: 0,
      diskUsage: 0,
    },
    lastCheck: systemStatus.system?.timestamp || new Date().toISOString(),
  } : null;

  // Map queue metrics from the same status endpoint
  const queueMetrics = systemStatus ? {
    totalJobs: Object.values(systemStatus.queue || {}).reduce((sum: number, count: number) => sum + count, 0),
    activeJobs: systemStatus.queue?.['process-events'] || 0,
    pendingJobs: systemStatus.queue?.['dispatch-notifications'] || 0,
    completedJobs: 0, // Not provided by current API
    failedJobs: 0, // Not provided by current API
    delayedJobs: systemStatus.queue?.['send-email'] || 0,
    queues: Object.entries(systemStatus.queue || {}).map(([name, jobCount]) => ({
      name: name === 'dispatch-notifications' ? 'Benachrichtigungen versenden' :
            name === 'process-events' ? 'Events verarbeiten' :
            name === 'send-email' ? 'E-Mails senden' :
            name === 'generate-report' ? 'Berichte erstellen' : name,
      jobCount: jobCount as number,
      processing: 0, // Not provided by current API
      failed: 0, // Not provided by current API
    })),
  } : null;
  const queueLoading = healthLoading;

  // Fetch system configuration
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['/api/notifications/system/config'],
  });

  // Restart queue mutation
  const restartQueueMutation = useMutation({
    mutationFn: () => apiRequest('/api/notifications/system/restart-queue', { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: 'Queue neu gestartet',
        description: 'Das Warteschlangen-System wurde erfolgreich neu gestartet.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/system'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Neustarten der Queue',
        variant: 'destructive',
      });
    },
  });

  // Clear failed jobs mutation
  const clearFailedMutation = useMutation({
    mutationFn: () => apiRequest('/api/notifications/system/clear-failed', { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: 'Fehlgeschlagene Jobs gelöscht',
        description: 'Alle fehlgeschlagenen Jobs wurden aus der Queue entfernt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/system'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Löschen der fehlgeschlagenen Jobs',
        variant: 'destructive',
      });
    },
  });

  // Pause/Resume queue mutation
  const toggleQueueMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume') => 
      apiRequest(`/api/notifications/system/queue/${action}`, { method: 'POST' }),
    onSuccess: (_, action) => {
      toast({
        title: action === 'pause' ? 'Queue pausiert' : 'Queue fortgesetzt',
        description: `Das Warteschlangen-System wurde ${action === 'pause' ? 'pausiert' : 'fortgesetzt'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/system'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Ändern des Queue-Status',
        variant: 'destructive',
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': 
      case 'error': return 'bg-red-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'Gesund';
      case 'warning': return 'Warnung';
      case 'critical': return 'Kritisch';
      case 'error': return 'Fehler';
      case 'offline': return 'Offline';
      default: return 'Unbekannt';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'critical':
      case 'error': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'offline': return <XCircle className="h-4 w-4 text-gray-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  return (
    <Card data-testid="notification-system-status">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              System-Status & Konfiguration
            </CardTitle>
            <CardDescription>
              Überwachen und verwalten Sie das Benachrichtigungssystem
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              refetchHealth();
            }}
            data-testid="refresh-system-status-button"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="health" data-testid="health-tab">
              <Monitor className="mr-2 h-4 w-4" />
              Systemstatus
            </TabsTrigger>
            <TabsTrigger value="queue" data-testid="queue-tab">
              <Zap className="mr-2 h-4 w-4" />
              Warteschlange
            </TabsTrigger>
            <TabsTrigger value="metrics" data-testid="metrics-tab">
              <Activity className="mr-2 h-4 w-4" />
              Metriken
            </TabsTrigger>
            <TabsTrigger value="config" data-testid="config-tab">
              <Settings className="mr-2 h-4 w-4" />
              Konfiguration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="space-y-6">
            {healthLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getStatusIcon(health?.overall || 'offline')}
                      Gesamtstatus
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge 
                      className={`${getStatusColor(health?.overall || 'offline')} text-white text-lg px-4 py-2`}
                      data-testid="overall-health-status"
                    >
                      {getStatusText(health?.overall || 'offline')}
                    </Badge>
                    {health?.lastCheck && (
                      <p className="text-sm text-gray-500 mt-2">
                        Letzte Prüfung: {new Date(health.lastCheck).toLocaleString('de-DE')}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      System-Uptime
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {health?.metrics?.uptime ? formatUptime(health.metrics.uptime) : 'Unbekannt'}
                    </div>
                  </CardContent>
                </Card>

                {health?.components && Object.entries(health.components).map(([component, status]) => (
                  <Card key={component}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {component === 'database' && <Database className="h-5 w-5" />}
                        {component === 'queueSystem' && <Zap className="h-5 w-5" />}
                        {component === 'emailService' && <Mail className="h-5 w-5" />}
                        {component === 'triggers' && <Activity className="h-5 w-5" />}
                        {component === 'database' && 'Datenbank'}
                        {component === 'queueSystem' && 'Warteschlangen-System'}
                        {component === 'emailService' && 'E-Mail-Service'}
                        {component === 'triggers' && 'Trigger-System'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status)}
                        <Badge className={getStatusColor(status) + ' text-white'}>
                          {getStatusText(status)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-6">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="outline"
                onClick={() => restartQueueMutation.mutate()}
                disabled={restartQueueMutation.isPending}
                data-testid="restart-queue-button"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Queue neu starten
              </Button>
              <Button
                variant="outline"
                onClick={() => toggleQueueMutation.mutate('pause')}
                disabled={toggleQueueMutation.isPending}
                data-testid="pause-queue-button"
              >
                <Pause className="h-4 w-4 mr-2" />
                Pausieren
              </Button>
              <Button
                variant="outline"
                onClick={() => toggleQueueMutation.mutate('resume')}
                disabled={toggleQueueMutation.isPending}
                data-testid="resume-queue-button"
              >
                <Play className="h-4 w-4 mr-2" />
                Fortsetzen
              </Button>
              <Button
                variant="destructive"
                onClick={() => clearFailedMutation.mutate()}
                disabled={clearFailedMutation.isPending}
                data-testid="clear-failed-button"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Fehlgeschlagene löschen
              </Button>
            </div>

            {queueLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{queueMetrics?.totalJobs || 0}</div>
                    <p className="text-sm text-gray-600">Gesamt Jobs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">{queueMetrics?.activeJobs || 0}</div>
                    <p className="text-sm text-gray-600">Aktive Jobs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-yellow-600">{queueMetrics?.pendingJobs || 0}</div>
                    <p className="text-sm text-gray-600">Wartende Jobs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-blue-600">{queueMetrics?.completedJobs || 0}</div>
                    <p className="text-sm text-gray-600">Abgeschlossene Jobs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-red-600">{queueMetrics?.failedJobs || 0}</div>
                    <p className="text-sm text-gray-600">Fehlgeschlagene Jobs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-gray-600">{queueMetrics?.delayedJobs || 0}</div>
                    <p className="text-sm text-gray-600">Verzögerte Jobs</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {queueMetrics?.queues && (
              <Card>
                <CardHeader>
                  <CardTitle>Queue-Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {queueMetrics.queues.map((queue, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <span className="font-medium">{queue.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span>Jobs: {queue.jobCount}</span>
                          <span>Verarbeitung: {queue.processing}</span>
                          <span className="text-red-600">Fehler: {queue.failed}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            {health?.metrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Speicherverbrauch</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Verwendet</span>
                        <span>{health.metrics.memoryUsage}%</span>
                      </div>
                      <Progress value={health.metrics.memoryUsage} className="w-full" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>CPU-Auslastung</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Verwendet</span>
                        <span>{health.metrics.cpuUsage}%</span>
                      </div>
                      <Progress value={health.metrics.cpuUsage} className="w-full" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Festplattenverbrauch</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Verwendet</span>
                        <span>{health.metrics.diskUsage}%</span>
                      </div>
                      <Progress value={health.metrics.diskUsage} className="w-full" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>System-Uptime</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatUptime(health.metrics.uptime)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            {configLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Systemkonfiguration ist schreibgeschützt. Änderungen müssen über Umgebungsvariablen oder Konfigurationsdateien vorgenommen werden.
                  </AlertDescription>
                </Alert>
                
                {config && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Aktuelle Konfiguration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                        {JSON.stringify(config, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Play, 
  Square, 
  RefreshCw, 
  Bot, 
  Activity, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Zap,
  Settings,
  TrendingUp,
  Server,
  Timer
} from 'lucide-react';

interface ServiceHealth {
  overall: 'healthy' | 'degraded' | 'critical' | 'offline';
  components: {
    resilientSync: 'healthy' | 'warning' | 'error' | 'offline';
    gapCrawler: 'healthy' | 'warning' | 'error' | 'offline';
    database: 'healthy' | 'warning' | 'error' | 'offline';
    vendonApi: 'healthy' | 'warning' | 'error' | 'offline';
  };
  lastCheck: string;
  uptime: number;
  stats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    dataGapsFound: number;
    dataGapsResolved: number;
    lastSyncDuration: number;
  };
}

interface SyncStatus {
  isRunning: boolean;
  lastSync: string | null;
  lastCheck: string | null;
  totalGapsFound: number;
  gapsResolved: number;
  nextScheduledSync: string | null;
  errors: string[];
  health: 'healthy' | 'warning' | 'critical';
}

interface SyncResult {
  status: 'success' | 'partial' | 'error';
  message: string;
  stats: {
    transactions: { found: number; saved: number; duplicates: number; };
    events: { found: number; saved: number; duplicates: number; };
    refills: { found: number; saved: number; duplicates: number; };
    errors: number;
    duration: number;
  };
}

const ResilientVendonSync: React.FC = () => {
  const [isOperating, setIsOperating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Status der resilienten Synchronisation abrufen
  const { data: status, isLoading, refetch } = useQuery<{
    backgroundService: ServiceHealth;
    resilientSync: SyncStatus;
    isRunning: boolean;
  }>({
    queryKey: ['/api/resilient-sync/status'],
    refetchInterval: 10000, // Alle 10 Sekunden aktualisieren
  });

  // Service starten
  const startServiceMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/resilient-sync/start'),
    onMutate: () => setIsOperating(true),
    onSuccess: (result: any) => {
      toast({
        title: 'Service gestartet',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/resilient-sync/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Starten',
        description: error.message || 'Service konnte nicht gestartet werden',
        variant: 'destructive',
      });
    },
    onSettled: () => setIsOperating(false),
  });

  // Service stoppen
  const stopServiceMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/resilient-sync/stop'),
    onMutate: () => setIsOperating(true),
    onSuccess: (result: any) => {
      toast({
        title: 'Service gestoppt',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/resilient-sync/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Stoppen',
        description: error.message || 'Service konnte nicht gestoppt werden',
        variant: 'destructive',
      });
    },
    onSettled: () => setIsOperating(false),
  });

  // Manueller Sync
  const manualSyncMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/resilient-sync/trigger-sync'),
    onMutate: () => setIsOperating(true),
    onSuccess: (result: SyncResult) => {
      toast({
        title: 'Synchronisation abgeschlossen',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/resilient-sync/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Synchronisation fehlgeschlagen',
        description: error.message || 'Fehler bei der Synchronisation',
        variant: 'destructive',
      });
    },
    onSettled: () => setIsOperating(false),
  });

  // Gap Check
  const gapCheckMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/resilient-sync/trigger-gap-check'),
    onMutate: () => setIsOperating(true),
    onSuccess: (result: any) => {
      toast({
        title: 'Gap-Check abgeschlossen',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/resilient-sync/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Gap-Check fehlgeschlagen',
        description: error.message || 'Fehler beim Gap-Check',
        variant: 'destructive',
      });
    },
    onSettled: () => setIsOperating(false),
  });

  // Gap Crawler starten
  const startGapCrawlerMutation = useMutation({
    mutationFn: () => apiRequest('post', '/api/resilient-sync/start-gap-crawler'),
    onMutate: () => setIsOperating(true),
    onSuccess: (result: any) => {
      toast({
        title: 'Gap Crawler gestartet',
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/resilient-sync/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Gap Crawler',
        description: error.message || 'Gap Crawler konnte nicht gestartet werden',
        variant: 'destructive',
      });
    },
    onSettled: () => setIsOperating(false),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': 
      case 'degraded': return 'bg-yellow-500';
      case 'critical':
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="w-4 h-4" />;
      case 'warning': 
      case 'degraded': return <AlertTriangle className="w-4 h-4" />;
      case 'critical':
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 animate-spin mr-2" />
        <span>Lade Status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Resiliente Vendon-Synchronisation</h1>
          <p className="text-muted-foreground">
            Kontinuierliche Hintergrund-Synchronisation mit automatischer Lückenschließung
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Gesamtstatus */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(status.backgroundService.overall)}
              System-Status
              <Badge variant={status.backgroundService.overall === 'healthy' ? 'default' : 'destructive'}>
                {status.backgroundService.overall.toUpperCase()}
              </Badge>
            </CardTitle>
            <CardDescription>
              Letzter Check: {new Date(status.backgroundService.lastCheck).toLocaleString()}
              {status.backgroundService.uptime > 0 && (
                <span className="ml-4">
                  Uptime: {formatUptime(status.backgroundService.uptime)}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Komponenten-Status */}
              {Object.entries(status.backgroundService.components).map(([component, componentStatus]) => (
                <div key={component} className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(componentStatus)}`} />
                    {component === 'resilientSync' ? 'Sync Engine' :
                     component === 'gapCrawler' ? 'Gap Crawler' :
                     component === 'database' ? 'Datenbank' :
                     component === 'vendonApi' ? 'Vendon API' : component}
                  </h3>
                  <p className="text-sm text-muted-foreground capitalize">
                    {componentStatus}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistiken */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Erfolgreiche Syncs</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {status.backgroundService.stats.successfulSyncs}
              </div>
              <p className="text-xs text-muted-foreground">
                von {status.backgroundService.stats.totalSyncs} gesamt
              </p>
              {status.backgroundService.stats.totalSyncs > 0 && (
                <Progress 
                  value={(status.backgroundService.stats.successfulSyncs / status.backgroundService.stats.totalSyncs) * 100} 
                  className="mt-2" 
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Datenlücken</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {status.backgroundService.stats.dataGapsFound}
              </div>
              <p className="text-xs text-muted-foreground">
                {status.backgroundService.stats.dataGapsResolved} geschlossen
              </p>
              {status.backgroundService.stats.dataGapsFound > 0 && (
                <Progress 
                  value={(status.backgroundService.stats.dataGapsResolved / status.backgroundService.stats.dataGapsFound) * 100} 
                  className="mt-2" 
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Letzte Sync-Dauer</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDuration(status.backgroundService.stats.lastSyncDuration)}
              </div>
              <p className="text-xs text-muted-foreground">
                {status.resilientSync.lastSync ? 
                  new Date(status.resilientSync.lastSync).toLocaleTimeString() : 
                  'Noch kein Sync'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Service-Kontrollen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Service Control
            </CardTitle>
            <CardDescription>
              Hintergrund-Synchronisation steuern
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {status?.isRunning ? (
              <Button
                onClick={() => stopServiceMutation.mutate()}
                disabled={isOperating}
                variant="destructive"
                className="w-full"
              >
                <Square className="w-4 h-4 mr-2" />
                Service stoppen
              </Button>
            ) : (
              <Button
                onClick={() => startServiceMutation.mutate()}
                disabled={isOperating}
                className="w-full"
              >
                <Play className="w-4 h-4 mr-2" />
                Service starten
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Manueller Sync
            </CardTitle>
            <CardDescription>
              Sofortige Synchronisation auslösen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => manualSyncMutation.mutate()}
              disabled={isOperating}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync starten
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Gap Check
            </CardTitle>
            <CardDescription>
              Datenlücken prüfen und schließen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => gapCheckMutation.mutate()}
              disabled={isOperating}
              variant="outline"
              className="w-full"
            >
              <Database className="w-4 h-4 mr-2" />
              Gap Check
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Gap Crawler
            </CardTitle>
            <CardDescription>
              Historische Daten crawlen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => startGapCrawlerMutation.mutate()}
              disabled={isOperating}
              variant="outline"
              className="w-full"
            >
              <Bot className="w-4 h-4 mr-2" />
              Crawler starten
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Fehler-Anzeige */}
      {status && status.resilientSync.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-semibold">Aktuelle Fehler:</p>
              {status.resilientSync.errors.slice(-3).map((error, index) => (
                <p key={index} className="text-sm">{error}</p>
              ))}
              {status.resilientSync.errors.length > 3 && (
                <p className="text-sm text-muted-foreground">
                  ... und {status.resilientSync.errors.length - 3} weitere
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Nächster geplanter Sync */}
      {status && status.resilientSync.nextScheduledSync && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Nächster geplanter Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {new Date(status.resilientSync.nextScheduledSync).toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Automatische Synchronisation alle 5 Minuten
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ResilientVendonSync;
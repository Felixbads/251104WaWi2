import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Clock, Database, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface SyncStatus {
  machines: {
    status: string;
    lastSync: number;
    count: number;
  };
  products: {
    status: string;
    lastSync: number;
    count: number;
  };
  transactions: {
    status: string;
    lastSync: number;
    count: number;
    latest?: number;
  };
  refills: {
    status: string;
    lastSync: number;
    count: number;
  };
  events: {
    status: string;
    lastSync: number;
    count: number;
  };
  stocks: {
    status: string;
    lastSync: number;
    count: number;
  };
  historicalSync: {
    inProgress: boolean;
    currentDate: string;
    targetDate: string;
    progress: number;
    completedMonths: string[];
    totalTransactions: number;
    processingTimeMin: number;
  };
}

interface RecoveryProgress {
  summary: {
    totalDays: number;
    completeDays: number;
    partialDays: number;
    missingDays: number;
    overallCompletion: number;
  };
  dailyProgress: Array<{
    date: string;
    transactions: number;
    activeMachines: number;
    completionPercentage: number;
    status: string;
  }>;
  lastUpdated: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'healthy':
    case 'complete':
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'warning':
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'critical':
    case 'missing':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'active':
      return <RefreshCw className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
    case 'success':
      return 'bg-green-500';
    case 'running':
      return 'bg-blue-500';
    case 'never':
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function getOverallStatus(syncData: SyncStatus): string {
  const statuses = [
    syncData.machines.status,
    syncData.products.status,
    syncData.transactions.status,
    syncData.events.status
  ];
  
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('never') || statuses.includes('failed')) return 'warning';
  if (statuses.every(s => s === 'completed' || s === 'success')) return 'healthy';
  return 'unknown';
}

export function SyncStatusWidget() {
  // Widget deaktiviert - von User angefordert
  return null;
}
    queryKey: ['/api/sync/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: recoveryProgress, isLoading: recoveryLoading } = useQuery<RecoveryProgress>({
    queryKey: ['/api/sync/recovery-progress'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Provide default values to prevent undefined errors
  const defaultSyncStatus: SyncStatus = {
    machines: { status: 'unknown', lastSync: 0, count: 0 },
    products: { status: 'unknown', lastSync: 0, count: 0 },
    transactions: { status: 'unknown', lastSync: 0, count: 0 },
    refills: { status: 'unknown', lastSync: 0, count: 0 },
    events: { status: 'unknown', lastSync: 0, count: 0 },
    stocks: { status: 'unknown', lastSync: 0, count: 0 },
    historicalSync: {
      inProgress: false,
      currentDate: '',
      targetDate: '',
      progress: 0,
      completedMonths: [],
      totalTransactions: 0,
      processingTimeMin: 0
    }
  };

  const safeSync = syncStatus || defaultSyncStatus;

  if (syncLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Synchronisierungsstatus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!syncStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Synchronisierungsstatus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Keine Synchronisierungsdaten verfügbar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Sync Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Synchronisierungsstatus
            </div>
            <Badge variant={getOverallStatus(safeSync) === 'healthy' ? 'default' : 'destructive'}>
              {getStatusIcon(getOverallStatus(safeSync))}
              <span className="ml-1">
                {getOverallStatus(safeSync) === 'healthy' ? 'Gesund' :
                 getOverallStatus(safeSync) === 'running' ? 'Läuft' :
                 getOverallStatus(safeSync) === 'warning' ? 'Warnung' : 'Unbekannt'}
              </span>
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Sync Services */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Transaktionen</span>
                {getStatusIcon(safeSync.transactions.status)}
              </div>
              <div className="text-2xl font-bold">
                {safeSync.transactions.count.toLocaleString('de-DE')}
              </div>
              <div className="text-xs text-muted-foreground">
                Status: {safeSync.transactions.status}
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Events</span>
                {getStatusIcon(safeSync.events.status)}
              </div>
              <div className="text-sm">
                Status: {safeSync.events.status}
              </div>
              <div className="text-xs text-muted-foreground">
                Letzter Sync: {safeSync.events.lastSync > 0 ? format(new Date(safeSync.events.lastSync), 'dd.MM.yyyy HH:mm', { locale: de }) : 'Nie'}
              </div>
            </div>
          </div>

          {/* Additional Services */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 border rounded">
              <div className="flex items-center justify-center mb-1">
                {getStatusIcon(safeSync.machines.status)}
              </div>
              <div className="text-xs font-medium">Automaten</div>
              <div className="text-xs text-muted-foreground">{safeSync.machines.status}</div>
            </div>
            
            <div className="text-center p-2 border rounded">
              <div className="flex items-center justify-center mb-1">
                {getStatusIcon(safeSync.products.status)}
              </div>
              <div className="text-xs font-medium">Produkte</div>
              <div className="text-xs text-muted-foreground">{safeSync.products.status}</div>
            </div>
            
            <div className="text-center p-2 border rounded">
              <div className="flex items-center justify-center mb-1">
                {getStatusIcon(safeSync.stocks.status)}
              </div>
              <div className="text-xs font-medium">Lagerbestände</div>
              <div className="text-xs text-muted-foreground">{safeSync.stocks.status}</div>
            </div>
          </div>

          {/* Historical Sync Progress */}
          {safeSync.historicalSync.inProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Historische Synchronisierung</span>
                <Badge variant="outline" className="text-blue-600">
                  Läuft
                </Badge>
              </div>
              <Progress value={safeSync.historicalSync.progress} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Fortschritt: {safeSync.historicalSync.progress}% • {safeSync.historicalSync.totalTransactions.toLocaleString('de-DE')} Transaktionen
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Letztes Update: {format(new Date(), 'HH:mm:ss', { locale: de })}
          </div>
        </CardContent>
      </Card>

      {/* Recovery Progress Card */}
      {recoveryProgress && !recoveryLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Wiederherstellungsfortschritt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Gesamtfortschritt</span>
                <span className="text-sm font-bold">{recoveryProgress.summary.overallCompletion}%</span>
              </div>
              <Progress value={recoveryProgress.summary.overallCompletion} className="h-2" />
            </div>

            {/* Status Breakdown */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="space-y-1">
                <div className="text-lg font-bold text-green-600">
                  {recoveryProgress.summary.completeDays}
                </div>
                <div className="text-xs text-muted-foreground">Vollständig</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-bold text-yellow-600">
                  {recoveryProgress.summary.partialDays}
                </div>
                <div className="text-xs text-muted-foreground">Teilweise</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-bold text-red-600">
                  {recoveryProgress.summary.missingDays}
                </div>
                <div className="text-xs text-muted-foreground">Fehlend</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-bold">
                  {recoveryProgress.summary.totalDays}
                </div>
                <div className="text-xs text-muted-foreground">Gesamt</div>
              </div>
            </div>

            {/* Recent Days Progress */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Letzte Tage</span>
              <div className="space-y-1">
                {recoveryProgress.dailyProgress.slice(-7).map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-xs">
                    <span>{format(new Date(day.date), 'dd.MM', { locale: de })}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div 
                          className={`w-2 h-2 rounded-full ${getStatusColor(day.status)}`}
                        />
                        <span>{day.transactions}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {day.completionPercentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
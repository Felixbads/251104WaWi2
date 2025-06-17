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
    lastSync: string;
    totalTransactions: number;
  };
  transactions: {
    status: string;
    lastSync: string;
    recentCount: number;
    totalCount: number;
    dateRange: {
      earliest: string;
      latest: string;
      daysWithData: number;
    };
  };
  recovery: {
    totalGaps: number;
    mostRecentGap: string | null;
    gapDetails: Array<{
      date: string;
      actualCount: number;
      status: string;
    }>;
  };
  overall: {
    status: string;
    lastUpdated: string;
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
    case 'healthy':
    case 'complete':
    case 'completed':
      return 'bg-green-500';
    case 'warning':
    case 'partial':
      return 'bg-yellow-500';
    case 'critical':
    case 'missing':
      return 'bg-red-500';
    case 'active':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}

export function SyncStatusWidget() {
  const { data: syncStatus, isLoading: syncLoading } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: recoveryProgress, isLoading: recoveryLoading } = useQuery<RecoveryProgress>({
    queryKey: ['/api/sync/recovery-progress'],
    refetchInterval: 60000, // Refresh every minute
  });

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
            <Badge variant={syncStatus.overall.status === 'healthy' ? 'default' : 'destructive'}>
              {getStatusIcon(syncStatus.overall.status)}
              <span className="ml-1">
                {syncStatus.overall.status === 'healthy' ? 'Gesund' :
                 syncStatus.overall.status === 'warning' ? 'Warnung' : 'Kritisch'}
              </span>
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Transaction Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Transaktionen</span>
                {getStatusIcon(syncStatus.transactions.status)}
              </div>
              <div className="text-2xl font-bold">
                {syncStatus.transactions.totalCount.toLocaleString('de-DE')}
              </div>
              <div className="text-xs text-muted-foreground">
                Letzte 24h: {syncStatus.transactions.recentCount} Transaktionen
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Datenabdeckung</span>
                <span className="text-xs text-muted-foreground">
                  {syncStatus.transactions.dateRange.daysWithData} Tage
                </span>
              </div>
              <div className="text-sm">
                <div>Von: {format(new Date(syncStatus.transactions.dateRange.earliest), 'dd.MM.yyyy', { locale: de })}</div>
                <div>Bis: {format(new Date(syncStatus.transactions.dateRange.latest), 'dd.MM.yyyy', { locale: de })}</div>
              </div>
            </div>
          </div>

          {/* Recovery Status */}
          {syncStatus.recovery.totalGaps > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Datenlücken</span>
                <Badge variant="outline" className="text-orange-600">
                  {syncStatus.recovery.totalGaps} Lücken
                </Badge>
              </div>
              {syncStatus.recovery.mostRecentGap && (
                <div className="text-xs text-muted-foreground">
                  Neueste Lücke: {format(new Date(syncStatus.recovery.mostRecentGap), 'dd.MM.yyyy', { locale: de })}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Letztes Update: {format(new Date(syncStatus.overall.lastUpdated), 'HH:mm:ss', { locale: de })}
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
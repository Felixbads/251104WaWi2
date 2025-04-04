import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration, formatDateTime, getSyncLogsByType, SyncLog } from "@/lib/api";
import { Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";

// Erweiterte Version des SyncLog-Interfaces für historische Synchronisierungen
interface HistoricalSyncLog {
  id: number;
  syncType: string;
  startDate: string;
  endDate: string | null;
  itemsFound: number;
  itemsSaved: number;
  itemsUpdated: number;
  duplicates: number;
  errors: number;
  syncStatus: 'running' | 'completed' | 'error';
  durationSeconds: number;
  errorMessage: string | null;
  additionalData: string | null;
  createdAt: string;
  updatedAt?: string;
}

export default function HistoricalSyncStatus() {
  // Abfrage der Synchronisierungslogs mit dem Typ 'historical_transactions'
  const { data: syncLogs, isLoading, error } = useQuery<HistoricalSyncLog[]>({
    queryKey: ['/api/sync/logs/historical'],
    queryFn: async () => {
      const logs = await getSyncLogsByType('historical_transactions', 50);
      // Typ-Umwandlung: Stellt sicher, dass die SyncLogs als HistoricalSyncLogs interpretiert werden
      return logs.map(log => {
        return {
          id: log.id,
          syncType: log.syncType,
          startDate: log.startDate,
          endDate: log.endDate,
          itemsFound: log.itemsFound,
          itemsSaved: log.itemsSaved,
          itemsUpdated: log.itemsUpdated,
          duplicates: log.duplicates,
          errors: log.errors,
          syncStatus: log.sync_status as 'running' | 'completed' | 'error',
          durationSeconds: log.duration_seconds,
          errorMessage: log.error_message,
          additionalData: log.additional_data,
          createdAt: log.created_at,
          updatedAt: log.updated_at
        } as HistoricalSyncLog;
      });
    },
    refetchInterval: 5000,
  });

  // Alle abgerufenen Logs sind bereits vom Typ 'historical_transactions'
  const historicalLogs = syncLogs || [];

  // Sortiere die Logs nach Erstellungsdatum absteigend
  const sortedLogs = [...historicalLogs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Aktive Synchronisierungen
  const activeSyncs = sortedLogs.filter(log => log.syncStatus === 'running');

  // Extrahiere Informationen aus additionalData
  const getProgress = (log: HistoricalSyncLog): number => {
    try {
      if (!log.additionalData) return 0;
      
      const data = JSON.parse(log.additionalData);
      
      // Wenn es Fortschrittsinformationen gibt
      if (data.currentProgress) {
        const currentDate = new Date(data.currentProgress.currentStartDate);
        
        // Verwende die Werte aus dem Log direkt, falls vorhanden
        const startDate = new Date(log.startDate);
        
        // Für endDate: verwende entweder den Wert aus dem Log oder aus den Metadaten oder das aktuelle Datum
        const endDateStr = log.endDate || data.endDate;
        const endDate = endDateStr ? new Date(endDateStr) : new Date();
        
        const totalMs = endDate.getTime() - startDate.getTime();
        const progressMs = currentDate.getTime() - startDate.getTime();
        
        if (totalMs <= 0) return 0;
        return Math.min(100, Math.round((progressMs / totalMs) * 100));
      }
      
      return 0;
    } catch (e) {
      console.error('Fehler beim Parsen der additionalData:', e);
      return 0;
    }
  };
  
  // Extrahiere aktuelle Statistiken
  const getCurrentStats = (log: HistoricalSyncLog) => {
    try {
      if (!log.additionalData) return { found: 0, saved: 0, currentDate: null };
      
      const data = JSON.parse(log.additionalData);
      
      if (data.currentProgress) {
        return {
          found: data.currentProgress.totalTransactionsFound || 0,
          saved: data.currentProgress.totalTransactionsSaved || 0,
          duplicates: data.currentProgress.totalDuplicates || 0,
          errors: data.currentProgress.totalErrors || 0,
          currentDate: data.currentProgress.currentStartDate || null,
          targetDate: data.endDate || null
        };
      }
      
      if (data.finalStats) {
        return {
          found: data.finalStats.totalTransactionsFound || 0,
          saved: data.finalStats.totalTransactionsSaved || 0,
          duplicates: data.finalStats.totalDuplicates || 0,
          errors: data.finalStats.totalErrors || 0,
          currentDate: null,
          targetDate: data.endDate || null
        };
      }
      
      return { 
        found: log.itemsFound || 0, 
        saved: log.itemsSaved || 0,
        duplicates: 0,
        errors: 0,
        currentDate: null,
        targetDate: null
      };
    } catch (e) {
      console.error('Fehler beim Parsen der additionalData:', e);
      return { 
        found: log.itemsFound || 0, 
        saved: log.itemsSaved || 0,
        duplicates: 0,
        errors: 0,
        currentDate: null,
        targetDate: null
      };
    }
  };

  // Status-Badge für Synchronisierungslogs
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-500">Läuft</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Abgeschlossen</Badge>;
      case 'error':
        return <Badge className="bg-red-500">Fehler</Badge>;
      default:
        return <Badge className="bg-gray-500">{status}</Badge>;
    }
  };

  // Status-Icon für Synchronisierungslogs
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-primary" />
              Historische Synchronisierungen
            </span>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            Übersicht aller historischen Synchronisierungsvorgänge mit Details zum Fortschritt und Status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !sortedLogs.length ? (
            <div className="p-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-500">Lade Synchronisierungslogs...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500">
              <XCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Fehler beim Laden der Synchronisierungslogs</p>
            </div>
          ) : sortedLogs.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-500">Keine historischen Synchronisierungen gefunden</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] rounded-md">
              <div className="space-y-4">
                {sortedLogs.map((log) => {
                  const progress = getProgress(log);
                  const stats = getCurrentStats(log);
                  
                  return (
                    <Card key={log.id} className={`p-4 ${log.syncStatus === 'running' ? 'border-blue-200 dark:border-blue-800' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center">
                          {getStatusIcon(log.syncStatus)}
                          <span className="ml-2 font-medium">
                            Synchronisierung #{log.id}
                          </span>
                        </div>
                        <div>
                          {getStatusBadge(log.syncStatus)}
                        </div>
                      </div>
                      
                      {log.syncStatus === 'running' && stats.currentDate && (
                        <div className="mb-2">
                          <div className="mb-1 flex justify-between text-xs text-gray-500">
                            <span>Aktueller Fortschritt: {Math.round(progress)}%</span>
                            <span>Zeitraum: {stats.currentDate} - {stats.targetDate || 'Heute'}</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      )}
                      
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-xs">
                        <div className="text-gray-500">Start:</div>
                        <div>{formatDateTime(log.startDate, 'datetime')}</div>
                        
                        <div className="text-gray-500">Ende:</div>
                        <div>{log.endDate ? formatDateTime(log.endDate, 'datetime') : '-'}</div>
                        
                        <div className="text-gray-500">Gefunden:</div>
                        <div>{stats.found.toLocaleString()}</div>
                        
                        <div className="text-gray-500">Gespeichert:</div>
                        <div>{stats.saved.toLocaleString()}</div>
                        
                        {stats.duplicates !== undefined && (
                          <>
                            <div className="text-gray-500">Duplikate:</div>
                            <div>{stats.duplicates.toLocaleString()}</div>
                          </>
                        )}
                        
                        {stats.errors !== undefined && (
                          <>
                            <div className="text-gray-500">Fehler:</div>
                            <div>{stats.errors.toLocaleString()}</div>
                          </>
                        )}
                        
                        <div className="text-gray-500">Laufzeit:</div>
                        <div>{formatDuration(log.durationSeconds || 0, true)}</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
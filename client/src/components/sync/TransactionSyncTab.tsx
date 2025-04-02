import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Loader2, FileText, Info, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { 
  startSync, 
  formatDateTime, 
  formatDuration, 
  getSyncLogsByType,
  SyncStatus
} from '@/lib/api';
import axios from 'axios';

export default function TransactionSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for date selection
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [batchSize, setBatchSize] = useState<string>("100");
  const [maxTransactions, setMaxTransactions] = useState<string>("2000");
  
  // Fetch current sync status
  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 5000, // Refetch every 5 seconds
  });
  
  // Get recent sync logs for transactions
  const { data: syncLogs } = useQuery({
    queryKey: ['/api/sync/logs', 'transactions'],
    queryFn: () => getSyncLogsByType('transactions', 5),
    refetchInterval: 10000,
  });
  
  // State for sync progress
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    processed: number;
    duplicates: number;
    errors: number;
    status: 'idle' | 'loading' | 'success' | 'error';
    startTime?: Date;
    endTime?: Date;
    dateRange?: string;
  }>({
    total: 0,
    processed: 0,
    duplicates: 0,
    errors: 0,
    status: 'idle'
  });
  
  // Aktiver Sync-Log für Polling
  const [activeSyncLogId, setActiveSyncLogId] = useState<number | null>(null);
  
  // Aktiver Sync-Log wenn vorhanden
  const { data: activeLog, refetch: refetchActiveLog } = useQuery({
    queryKey: ['/api/sync/logs', activeSyncLogId],
    queryFn: async () => {
      if (!activeSyncLogId) return null;
      try {
        const response = await axios.get(`/api/sync/logs/${activeSyncLogId}`);
        return response.data;
      } catch (error) {
        console.error("Fehler beim Abrufen des aktiven Sync-Logs:", error);
        return null;
      }
    },
    enabled: !!activeSyncLogId,
    refetchInterval: activeSyncLogId ? 2000 : false // Polling nur wenn aktiv
  });
  
  // Aktualisiere UI-Status basierend auf dem aktiven Log
  useEffect(() => {
    if (activeLog) {
      setSyncProgress({
        total: activeLog.itemsFound || 0,
        processed: activeLog.itemsSaved || 0,
        duplicates: activeLog.duplicates || 0,
        errors: activeLog.errors || 0,
        status: activeLog.syncStatus === 'completed' ? 'success' : 
                activeLog.syncStatus === 'error' ? 'error' : 'loading',
        startTime: activeLog.startDate ? new Date(activeLog.startDate) : undefined,
        endTime: activeLog.endDate ? new Date(activeLog.endDate) : undefined,
        dateRange: `${format(startDate || new Date(), 'P', { locale: de })} - ${format(endDate || new Date(), 'P', { locale: de })}`
      });
      
      // Wenn der Log abgeschlossen ist, stoppe das Polling
      if (activeLog.syncStatus === 'completed' || activeLog.syncStatus === 'error') {
        // Erfolgsmeldung oder Fehlermeldung
        if (activeLog.syncStatus === 'completed') {
          toast({
            title: "Synchronisierung abgeschlossen",
            description: `${activeLog.itemsSaved || 0} Transaktionen gespeichert, ${activeLog.duplicates || 0} Duplikate übersprungen.`,
            variant: "default"
          });
        } else {
          toast({
            title: "Synchronisierungsfehler",
            description: activeLog.errorMessage || "Unbekannter Fehler bei der Synchronisierung",
            variant: "destructive"
          });
        }
        
        // Reset des aktiven Logs - stoppe das Polling
        setActiveSyncLogId(null);
      }
    }
  }, [activeLog, startDate, endDate, toast]);
  
  // Mutation for triggering synchronization
  const syncMutation = useMutation({
    mutationFn: async () => {
      // UI-Status auf "Loading" setzen
      setSyncProgress({
        ...syncProgress,
        status: 'loading',
        startTime: new Date(),
        dateRange: `${format(startDate || new Date(), 'P', { locale: de })} - ${format(endDate || new Date(), 'P', { locale: de })}`
      });
      
      try {
        const options = {
          startDate,
          endDate,
          batchSize: parseInt(batchSize),
          maxTransactions: parseInt(maxTransactions)
        };
        
        console.log('Sending sync request with options:', options);
        
        // Synchronisierung starten (nutzt jetzt den verbesserten Endpunkt mit Hintergrundverarbeitung)
        const response = await startSync('transactions', options);
        
        console.log('Sync response received:', response);
        
        if (response && response.syncLogId) {
          // Aktiviere das Polling für diesen Sync-Log
          setActiveSyncLogId(response.syncLogId);
          
          // Sofortige UI-Aktualisierung mit den anfänglichen Daten
          setSyncProgress({
            total: response.stats?.itemsFound || 0,
            processed: response.stats?.itemsSaved || 0,
            duplicates: response.stats?.duplicates || 0,
            errors: response.stats?.errors || 0,
            status: 'loading',
            startTime: new Date(),
            dateRange: `${format(startDate || new Date(), 'P', { locale: de })} - ${format(endDate || new Date(), 'P', { locale: de })}`
          });
          
          // Queries aktualisieren
          queryClient.invalidateQueries({ queryKey: ['/api/sync/logs', 'transactions'] });
          queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
          
          return response;
        }
        
        // Fallback für unerwartete Antwortformate
        toast({
          title: "Unerwartete Serverantwort",
          description: "Der Server hat keine gültige Sync-ID zurückgegeben. Bitte versuchen Sie es später erneut.",
          variant: "destructive"
        });
        
        setSyncProgress(prev => ({
          ...prev,
          status: 'error',
          endTime: new Date()
        }));
        
        return null;
      } catch (error) {
        console.error('Error during sync:', error);
        
        setSyncProgress(prev => ({
          ...prev,
          status: 'error',
          endTime: new Date()
        }));
        
        throw error;
      }
    },
    onError: (error) => {
      toast({
        title: "Synchronisierungsfehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler bei der Synchronisierung.",
        variant: "destructive"
      });
      
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        endTime: new Date()
      }));
      
      // Reset des aktiven Logs
      setActiveSyncLogId(null);
    }
  });
  
  // Function to render the historical sync status
  const renderHistoricalSyncStatus = () => {
    if (!syncStatus?.historicalSync) return null;
    
    const { inProgress, currentDate, targetDate, progress, totalTransactions, processingTimeMin } = syncStatus.historicalSync as {
      inProgress: boolean;
      currentDate: string;
      targetDate: string;
      progress: number;
      totalTransactions: number;
      processingTimeMin: number;
    };
    
    if (!inProgress) return null;
    
    return (
      <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium flex items-center">
            <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />
            Historische Synchronisierung aktiv
          </h3>
          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
            {progress.toFixed(1)}% abgeschlossen
          </Badge>
        </div>
        <Progress 
          value={progress} 
          className="h-2 mb-2" 
        />
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
          <div>Aktuelles Datum: <span className="font-medium">{currentDate}</span></div>
          <div>Zieldatum: <span className="font-medium">{targetDate}</span></div>
          <div>Transaktionen: <span className="font-medium">{totalTransactions.toLocaleString()}</span></div>
          <div>Laufzeit: <span className="font-medium">{formatDuration(processingTimeMin * 60)}</span></div>
        </div>
      </Card>
    );
  };
  
  // Render recent transaction logs
  const renderTransactionLogs = () => {
    if (!syncLogs || syncLogs.length === 0) {
      return (
        <Card className="p-4 mb-4">
          <div className="text-sm text-gray-500 text-center py-2">
            Keine Synchronisierungsprotokolle gefunden
          </div>
        </Card>
      );
    }
    
    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Letzte Synchronisierungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {syncLogs.map((log: any) => (
              <div key={log.id} className="text-xs p-2 border rounded flex justify-between items-center">
                <div>
                  <span className="font-medium">{formatDateTime(log.startDate)}</span>
                  <span className="text-gray-500 mx-1">bis</span>
                  <span className="font-medium">{formatDateTime(log.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={log.syncStatus === "completed" ? "outline" : log.syncStatus === "error" ? "destructive" : "outline"} 
                      className={log.syncStatus === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" : ""}>
                    {log.itemsFound} gefunden, {log.itemsSaved} gespeichert
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };
  
  return (
    <div className="space-y-4">
      {/* Historical sync banner if active */}
      {renderHistoricalSyncStatus()}
      
      {/* Recent Transaction Logs */}
      {renderTransactionLogs()}
      
      {/* Sync Form */}
      <Card>
        <CardHeader>
          <CardTitle>Transaktions-Synchronisierung</CardTitle>
          <CardDescription>
            Synchronisieren Sie Transaktionen aus einem bestimmten Zeitraum mit dem Vendon-System
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    id="startDate"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      format(startDate, 'P', { locale: de })
                    ) : (
                      <span>Startdatum wählen</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">Enddatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    id="endDate"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      format(endDate, 'P', { locale: de })
                    ) : (
                      <span>Enddatum wählen</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch-Größe</Label>
              <Select 
                value={batchSize} 
                onValueChange={setBatchSize}
              >
                <SelectTrigger id="batchSize">
                  <SelectValue placeholder="Batch-Größe auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Transaktionen</SelectItem>
                  <SelectItem value="100">100 Transaktionen</SelectItem>
                  <SelectItem value="250">250 Transaktionen</SelectItem>
                  <SelectItem value="500">500 Transaktionen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="maxTransactions">
                Max. Transaktionen
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-4 w-4 p-0 ml-1">
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2 text-xs">
                    Limitiert die Anzahl der zu synchronisierenden Transaktionen pro Vorgang. Ein niedrigerer Wert ermöglicht schnellere Synchronisierungen, während ein höherer Wert mehr Daten in einem Durchgang überträgt.
                  </PopoverContent>
                </Popover>
              </Label>
              <Select 
                value={maxTransactions} 
                onValueChange={setMaxTransactions}
              >
                <SelectTrigger id="maxTransactions">
                  <SelectValue placeholder="Max. Transaktionen wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">1.000 Transaktionen</SelectItem>
                  <SelectItem value="2000">2.000 Transaktionen</SelectItem>
                  <SelectItem value="5000">5.000 Transaktionen</SelectItem>
                  <SelectItem value="10000">10.000 Transaktionen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Current Sync Progress */}
          {syncProgress.status === 'loading' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800 dark:text-blue-300 flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Synchronisierung läuft...
                </AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-400">
                  <div className="mt-2">
                    <Progress 
                      value={syncProgress.total ? (syncProgress.processed / syncProgress.total) * 100 : 0} 
                      className="h-2 mb-2" 
                    />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                      <div>Zeitraum: <span className="font-medium">{syncProgress.dateRange}</span></div>
                      <div>Fortschritt: <span className="font-medium">
                        {syncProgress.total 
                          ? `${(syncProgress.processed / syncProgress.total * 100).toFixed(1)}%` 
                          : '0%'}
                      </span></div>
                      <div>Gefunden: <span className="font-medium">{syncProgress.total.toLocaleString()}</span></div>
                      <div>Gespeichert: <span className="font-medium">{syncProgress.processed.toLocaleString()}</span></div>
                      <div>Duplikate: <span className="font-medium">{syncProgress.duplicates.toLocaleString()}</span></div>
                      <div>Fehler: <span className="font-medium">{syncProgress.errors.toLocaleString()}</span></div>
                      {syncProgress.startTime && (
                        <div>Startzeit: <span className="font-medium">{formatDateTime(syncProgress.startTime, 'time')}</span></div>
                      )}
                      <div>Laufzeit: <span className="font-medium">
                        {syncProgress.startTime 
                          ? formatDuration((new Date().getTime() - syncProgress.startTime.getTime()) / 1000) 
                          : '0s'}
                      </span></div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
          
          {/* Success Message */}
          {syncProgress.status === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <AlertCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-300">
                  Synchronisierung abgeschlossen
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-400">
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>Zeitraum: <span className="font-medium">{syncProgress.dateRange}</span></div>
                    <div>Dauer: <span className="font-medium">
                      {syncProgress.startTime && syncProgress.endTime 
                        ? formatDuration((syncProgress.endTime.getTime() - syncProgress.startTime.getTime()) / 1000) 
                        : '-'}
                    </span></div>
                    <div>Gefunden: <span className="font-medium">{syncProgress.total.toLocaleString()}</span></div>
                    <div>Gespeichert: <span className="font-medium">{syncProgress.processed.toLocaleString()}</span></div>
                    <div>Duplikate: <span className="font-medium">{syncProgress.duplicates.toLocaleString()}</span></div>
                    <div>Fehler: <span className="font-medium">{syncProgress.errors.toLocaleString()}</span></div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
          
          {/* Error Message */}
          {syncProgress.status === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800 dark:text-red-300">
                  Fehler bei der Synchronisierung
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">
                  Es ist ein Fehler bei der Synchronisierung aufgetreten. Bitte versuchen Sie es erneut oder prüfen Sie die Logs für weitere Details.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-xs text-gray-500">
            {syncStatus?.transactions && 'lastSync' in syncStatus.transactions
              ? `Letzte Synchronisierung: ${formatDateTime(String(syncStatus.transactions.lastSync))}`
              : "Noch keine Synchronisierung durchgeführt"}
          </div>
          <Button 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || syncProgress.status === 'loading' || !startDate || !endDate}
            className="flex items-center"
          >
            {syncMutation.isPending || syncProgress.status === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Synchronisierung läuft...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-5 w-5" />
                Transaktionen synchronisieren
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Info Card */}
      <Alert className="bg-gray-50 dark:bg-gray-800 mt-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Hinweis zur Transaktions-Synchronisierung</AlertTitle>
        <AlertDescription>
          <p className="text-sm mt-1">Die Synchronisierung von Transaktionen kann je nach Zeitraum und Datenmenge einige Zeit in Anspruch nehmen. Es werden nur Transaktionen aus dem ausgewählten Zeitraum synchronisiert, die noch nicht in der Datenbank vorhanden sind.</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
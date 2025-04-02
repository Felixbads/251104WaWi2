import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Loader2, FileText, Calendar, Info, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  
  // Mutation for triggering synchronization
  const syncMutation = useMutation({
    mutationFn: async () => {
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
          maxDays: parseInt(maxTransactions) / parseInt(batchSize)
        };
        
        const response = await startSync('transactions', options);
        
        console.log('Sync response:', response);
        
        // Wenn die Antwort syncLog enthält, benutze dies für initiale Werte
        if (response && response.syncLog) {
          setSyncProgress(prev => ({
            ...prev,
            total: response.syncLog.itemsFound || response.stats?.itemsFound || 0,
            processed: response.syncLog.itemsSaved || response.stats?.itemsSaved || 0,
            duplicates: response.syncLog.duplicates || response.stats?.duplicates || 0,
            errors: response.syncLog.errors || response.stats?.errors || 0
          }));
        }
        
        // Speichere die syncLogId für späteres Polling
        const syncLogId = response?.syncLogId || response?.syncLog?.id;
        
        // Start polling for updates
        const intervalId = setInterval(async () => {
          try {
            // Holen des aktuellen Sync-Status
            const statusResponse = await fetch('/api/sync/status');
            if (!statusResponse.ok) throw new Error('Failed to fetch sync status');
            const status = await statusResponse.json();
            
            // Prüfe, ob die Transaktion abgeschlossen ist
            if (status.transactions && status.transactions.status !== 'running') {
              clearInterval(intervalId);
              setSyncProgress(prev => ({
                ...prev,
                status: 'success',
                endTime: new Date()
              }));
            }
            
            // Hole den aktuellen Sync-Log, wenn syncLogId verfügbar ist
            if (syncLogId) {
              const logResponse = await fetch(`/api/sync/logs/${syncLogId}`);
              if (logResponse.ok) {
                const logData = await logResponse.json();
                console.log('Sync log update:', logData);
                setSyncProgress(prev => ({
                  ...prev,
                  total: logData.itemsFound || prev.total,
                  processed: logData.itemsSaved || prev.processed,
                  duplicates: logData.duplicates || prev.duplicates,
                  errors: logData.errors || prev.errors
                }));
              }
            } else {
              // Wenn keine syncLogId verfügbar ist, hole die neuesten Logs
              const logsResponse = await fetch('/api/sync/logs?type=transactions&limit=1');
              if (logsResponse.ok) {
                const logs = await logsResponse.json();
                if (logs && logs.length > 0) {
                  const latestLog = logs[0];
                  console.log('Latest sync log:', latestLog);
                  setSyncProgress(prev => ({
                    ...prev,
                    total: latestLog.itemsFound || prev.total,
                    processed: latestLog.itemsSaved || prev.processed, 
                    duplicates: latestLog.duplicates || prev.duplicates,
                    errors: latestLog.errors || prev.errors
                  }));
                }
              }
            }
          } catch (e) {
            console.error('Error polling for updates:', e);
          }
        }, 2000);
        
        // Clear interval after 5 minutes to prevent memory leaks
        setTimeout(() => clearInterval(intervalId), 5 * 60 * 1000);
        
        return response;
      } catch (error) {
        setSyncProgress(prev => ({
          ...prev,
          status: 'error',
          endTime: new Date()
        }));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/logs', 'transactions'] });
      
      toast({
        title: "Transaktions-Synchronisierung gestartet",
        description: "Die Transaktions-Synchronisierung wurde erfolgreich gestartet.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Synchronisierungsfehler",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
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
          <p className="text-sm mt-1">Die Synchronisierung lädt Transaktionen vom Vendon-Server und speichert sie in der lokalen Datenbank. Bereits vorhandene Transaktionen werden erkannt und übersprungen, um Duplikate zu vermeiden.</p>
          <p className="text-sm mt-2">Für die vollständige Synchronisierung aller historischen Daten, verwenden Sie die <strong>Historische Synchronisierung</strong> im Konfigurations-Tab.</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
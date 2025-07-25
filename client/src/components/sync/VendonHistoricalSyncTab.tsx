import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { 
  AlertTriangle, 
  Calendar, 
  Clock, 
  Database, 
  History, 
  RefreshCw, 
  RotateCcw,
  Play,
  Loader,
  CheckCircle,
  XCircle,
  DownloadCloud
} from 'lucide-react';

// Schema for the historical import form
const historicalImportSchema = z.object({
  startDate: z.string().min(1, 'Startdatum ist erforderlich'),
  endDate: z.string().optional(),
  batchSize: z.number().min(10).max(1000).default(100),
  maxTransactions: z.number().int().min(1000).default(20000),
  forceUpdate: z.boolean().default(false),
  syncStep: z.number().optional(),
});

type FormData = z.infer<typeof historicalImportSchema>;

// Format date helper
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  try {
    const date = parseISO(dateString);
    if (!date || isNaN(date.getTime())) return 'Ungültiges Datum';
    return format(date, 'dd.MM.yyyy HH:mm:ss', { locale: de });
  } catch (e) {
    return 'Ungültiges Datum';
  }
};

// Interface für Sync-Status
interface SyncStatus {
  lastRun: {
    id: number;
    status: string;
    startDate: string;
    endDate: string;
    durationSeconds: number;
    itemsFound: number;
    itemsSaved: number;
    duplicates: number;
    errors: number;
    additionalData: string;
  } | null;
  cursor: {
    lastDate: string;
    lastOffset: number;
    lastId: number | null;
    updatedAt: string;
  } | null;
  isRunning: boolean;
}

// Interface für die API-Antwort
interface SyncStatusResponse {
  success: boolean;
  status: SyncStatus;
}

const VendonHistoricalSyncTab: React.FC = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isTargetedBackfillRunning, setIsTargetedBackfillRunning] = useState(false);
  const { toast } = useToast();

  // Form setup with improved defaults
  const form = useForm<FormData>({
    resolver: zodResolver(historicalImportSchema),
    defaultValues: {
      startDate: '2020-01-01',
      endDate: '',
      batchSize: 100,
      maxTransactions: 20000, // Set higher for more transactions
      forceUpdate: false,
      syncStep: 30,
    },
  });

  // Fetch sync status
  const { 
    data: syncStatusData,
    isLoading, 
    isError, 
    error
  } = useQuery<SyncStatusResponse>({
    queryKey: ['/api/vendon/historical-import/status', refreshCounter],
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Extract sync status from data
  const syncStatus = syncStatusData?.status;

  // Set isImporting based on sync status
  useEffect(() => {
    if (syncStatus?.isRunning) {
      setIsImporting(true);
    } else {
      setIsImporting(false);
    }
  }, [syncStatus]);

  // Handle refresh
  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };

  // Start historical import
  const startHistoricalImport = async (data: FormData) => {
    try {
      setIsImporting(true);
      toast({
        title: "Import wird gestartet",
        description: "Der historische Import wird gestartet. Dies kann einige Zeit dauern.",
      });

      // Format the dates correctly
      const formData = {
        ...data,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
      };

      // Call the API to start the import
      const response = await axios.post('/api/vendon/historical-import', formData);

      toast({
        title: "Import-Auftrag gestartet",
        description: "Der Import läuft im Hintergrund. Der Fortschritt wird automatisch aktualisiert.",
      });

      // Refresh status data
      queryClient.invalidateQueries({ queryKey: ['/api/vendon/historical-import/status'] });
      handleRefresh();
    } catch (error) {
      setIsImporting(false);
      toast({
        title: "Fehler beim Starten des Imports",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    }
  };

  // Reset sync state (cursor)
  const resetSyncState = async () => {
    try {
      const response = await axios.post('/api/vendon/historical-import/reset', {
        confirm: true,
        startDate: form.getValues().startDate
      });

      toast({
        title: "Import-Status zurückgesetzt",
        description: "Der Import-Cursor wurde erfolgreich zurückgesetzt.",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/vendon/historical-import/status'] });
      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Zurücksetzen",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    }
  };

  // Targeted Historical Backfill bis 1. Juli 2023
  const startTargetedBackfill = async () => {
    try {
      setIsTargetedBackfillRunning(true);
      
      const response = await axios.post('/api/vendon/targeted-backfill', {
        action: 'start',
        targetDate: '2023-07-01',
        batchSize: 100,
        requestDelay: 1000,
        maxRetries: 3,
        enableDetailedLogging: true
      });

      toast({
        title: "Targeted Backfill gestartet",
        description: "Der Rückwärts-Import bis 1. Juli 2023 wurde gestartet. Prüfen Sie die Logs für den Fortschritt.",
      });

      // Nach kurzer Zeit den Status wieder auf false setzen
      setTimeout(() => {
        setIsTargetedBackfillRunning(false);
      }, 5000);

    } catch (error) {
      setIsTargetedBackfillRunning(false);
      toast({
        title: "Fehler beim Starten des Targeted Backfill",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    }
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    if (!syncStatus?.cursor?.lastDate) return 0;
    
    try {
      const startDate = new Date("2020-01-01");
      const endDate = new Date();
      const currentDate = new Date(syncStatus.cursor.lastDate);
      
      // Check if date is valid
      if (isNaN(currentDate.getTime())) return 0;
      
      // If currentDate is in the future, use endDate instead
      if (currentDate > endDate) return 100;
      
      // Total days in range
      const totalMilliseconds = endDate.getTime() - startDate.getTime();
      if (totalMilliseconds <= 0) return 0;
      
      // Current progress in days
      const progressMilliseconds = currentDate.getTime() - startDate.getTime();
      if (progressMilliseconds < 0) return 0;
      
      // Calculate percentage (cap at 100%)
      return Math.min(Math.round((progressMilliseconds / totalMilliseconds) * 100), 100);
    } catch (error) {
      console.error("Fehler bei der Fortschrittsberechnung:", error);
      return 0;
    }
  };

  // Parse additionalData
  const parseAdditionalData = (jsonString: string) => {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return { pagesProcessed: 'N/A', daysProcessed: 'N/A' };
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-center">
            <Loader className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2">Lade Synchronisationsstatus...</span>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fehler beim Laden des Synchronisationsstatus</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
        </AlertDescription>
      </Alert>
    );
  }

  // Last run data
  const lastRun = syncStatus?.lastRun;
  const additionalData = lastRun?.additionalData 
    ? parseAdditionalData(lastRun.additionalData) 
    : { pagesProcessed: 0, daysProcessed: 0 };

  // Cursor data
  const cursor = syncStatus?.cursor;
  const isRunning = syncStatus?.isRunning || false;

  // Calculate database status for display
  const transactionsSaved = lastRun?.itemsSaved || 0;
  const isImportNeeded = transactionsSaved < 1000;

  return (
    <div className="space-y-6">
      {/* Quick Start Guide */}
      {isImportNeeded && (
        <Alert className="bg-blue-50 border-blue-200">
          <DownloadCloud className="h-5 w-5 text-blue-500" />
          <AlertTitle className="text-blue-800">Mehr als 120.000 Transaktionen importieren</AlertTitle>
          <AlertDescription className="text-blue-700">
            Um alle historischen Transaktionen zu importieren, bitte:
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Stellen Sie sicher, dass das Startdatum weit genug in der Vergangenheit liegt (z.B. 2020-01-01)</li>
              <li>Setzen Sie die maximale Anzahl der Transaktionen auf mindestens 20.000</li>
              <li>Klicken Sie auf "Import starten" und warten Sie, bis die Transaktionen geladen sind</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Status Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>Historischer Import Status</CardTitle>
            <div className="flex gap-2">
              {isRunning ? (
                <Badge className="bg-blue-500">Läuft</Badge>
              ) : lastRun?.status === 'completed' ? (
                <Badge className="bg-green-500">Abgeschlossen</Badge>
              ) : lastRun?.status === 'failed' ? (
                <Badge className="bg-red-500">Fehlgeschlagen</Badge>
              ) : cursor ? (
                <Badge variant="outline" className="bg-amber-100">Teilweise importiert</Badge>
              ) : (
                <Badge variant="outline">Nicht gestartet</Badge>
              )}
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            Aktueller Fortschritt des historischen Vendon-Datenimports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fortschritt</span>
              <span className="font-medium">{calculateProgress()}%</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letztes importiertes Datum</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {cursor?.lastDate ? (() => {
                  try {
                    const date = new Date(cursor.lastDate);
                    if (isNaN(date.getTime())) return 'Ungültiges Datum';
                    return format(date, 'dd.MM.yyyy');
                  } catch (e) {
                    return 'Fehler beim Formatieren';
                  }
                })() : 'Nicht verfügbar'}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzter Offset</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                {cursor?.lastOffset || 0}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzte Aktualisierung</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {cursor?.updatedAt ? formatDate(cursor.updatedAt) : 'Nicht verfügbar'}
              </div>
            </div>
          </div>

          {/* Last run stats if available */}
          {lastRun && (
            <>
              <Separator className="my-4" />
              <div>
                <h3 className="text-sm font-medium mb-2">Letzter Import</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="text-sm font-medium">
                      {lastRun.status === 'completed' ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" /> Abgeschlossen
                        </span>
                      ) : lastRun.status === 'failed' ? (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" /> Fehlgeschlagen
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Loader className="h-4 w-4" /> In Bearbeitung
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Zeitraum</div>
                    <div className="text-sm font-medium">
                      {lastRun.startDate ? (() => {
                        try {
                          const date = new Date(lastRun.startDate);
                          if (isNaN(date.getTime())) return 'Ungültiges Datum';
                          return format(date, 'dd.MM.yyyy HH:mm');
                        } catch (e) {
                          return 'Fehler';
                        }
                      })() : 'N/A'}
                      {' '} bis {' '}
                      {lastRun.endDate ? (() => {
                        try {
                          const date = new Date(lastRun.endDate);
                          if (isNaN(date.getTime())) return 'Ungültiges Datum';
                          return format(date, 'dd.MM.yyyy HH:mm');
                        } catch (e) {
                          return 'Fehler';
                        }
                      })() : 'N/A'}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Dauer</div>
                    <div className="text-sm font-medium">
                      {lastRun.durationSeconds ? `${Math.floor(lastRun.durationSeconds / 60)} Min ${lastRun.durationSeconds % 60} Sek` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Gefunden</div>
                    <div className="text-sm font-medium">{lastRun.itemsFound}</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Gespeichert</div>
                    <div className="text-sm font-medium">{lastRun.itemsSaved}</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Duplikate</div>
                    <div className="text-sm font-medium">{lastRun.duplicates}</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Fehler</div>
                    <div className="text-sm font-medium">{lastRun.errors}</div>
                  </div>
                </div>

                {additionalData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Tage verarbeitet</div>
                      <div className="text-sm font-medium">{additionalData.daysProcessed}</div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Seiten verarbeitet</div>
                      <div className="text-sm font-medium">{additionalData.pagesProcessed}</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          
          {lastRun?.status === 'failed' && lastRun.errors > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fehler beim letzten Import</AlertTitle>
              <AlertDescription>
                Der letzte Import ist mit {lastRun.errors} Fehlern fehlgeschlagen. 
                Bitte überprüfen Sie die Logs oder setzen Sie den Import zurück.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Import Configuration Card - Simplified */}
      <Card>
        <CardHeader>
          <CardTitle>Historischen Import starten</CardTitle>
          <CardDescription>
            Importiere über 120.000 historische Vendon-Transaktionen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(startHistoricalImport)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Startdatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>
                        Datum, ab dem Transaktionen importiert werden sollen
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="maxTransactions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max. Transaktionen</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : 20000)}
                        />
                      </FormControl>
                      <FormDescription>
                        <strong>Mindestens 20.000 empfohlen</strong> für umfassenden Import
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Advanced Options Section - Hidden by Default */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">Erweiterte Einstellungen</summary>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enddatum (optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          Wenn leer, werden Daten bis heute importiert
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="batchSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch-Größe</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Anzahl der Transaktionen pro API-Anfrage (10-1000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="syncStep"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tage pro Schritt (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormDescription>
                          Anzahl der Tage, die pro Schritt importiert werden
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="forceUpdate"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Erzwinge Aktualisierung
                          </FormLabel>
                          <FormDescription>
                            Bestehende Transaktionen erneut importieren
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </details>

              <div className="flex justify-between pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (confirm("Sicher, dass Sie den Import-Status zurücksetzen möchten? Dies ermöglicht einen Neustart des Imports.")) {
                      resetSyncState();
                    }
                  }}
                  disabled={isImporting}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Import zurücksetzen
                </Button>
                
                <Button
                  type="submit"
                  disabled={isImporting}
                  className="gap-2"
                  size="lg"
                >
                  {isImporting ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Import läuft...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="h-5 w-5" />
                      Import starten
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Targeted Historical Backfill Card */}
      <Card className="border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            Gezielter Historischer Backfill bis 1. Juli 2023
          </CardTitle>
          <CardDescription>
            Systematische Rückwärts-Synchronisation aller Transaktionen bis zum 1. Juli 2023. 
            Startet vom neuesten Datum und arbeitet Tag für Tag rückwärts mit vollständiger Paginierung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Wichtiger Hinweis</AlertTitle>
            <AlertDescription className="text-amber-700">
              <strong>Dieser Prozess ist speziell für das Zieldatum 1. Juli 2023 entwickelt</strong> und arbeitet wie folgt:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Ermittelt automatisch das neueste Transaktionsdatum in der Datenbank</li>
                <li>Geht Tag für Tag rückwärts bis zum 1. Juli 2023</li>
                <li>Verwendet Paginierung mit 100 Transaktionen pro API-Aufruf</li>
                <li>Respektiert API-Limits mit 1-Sekunden-Pausen zwischen Aufrufen</li>
                <li>Führt automatische Duplikatsprüfung durch</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <div className="text-sm font-medium">Konfiguration</div>
              <div className="space-y-1 text-sm text-gray-600">
                <div>• Zieldatum: <strong>1. Juli 2023</strong></div>
                <div>• Batch-Größe: <strong>100 Transaktionen</strong></div>
                <div>• API-Verzögerung: <strong>1 Sekunde</strong></div>
                <div>• Max. Wiederholungen: <strong>3 Versuche</strong></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Prozess</div>
              <div className="space-y-1 text-sm text-gray-600">
                <div>• Automatische Startpunkt-Erkennung</div>
                <div>• Tag-für-Tag Rückwärts-Verarbeitung</div>
                <div>• Vollständige Paginierung pro Tag</div>
                <div>• Detailliertes Logging im Backend</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              onClick={startTargetedBackfill}
              disabled={isTargetedBackfillRunning || isImporting}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isTargetedBackfillRunning ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  Backfill wird gestartet...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Targeted Backfill bis Juli 2023 starten
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500">
            Der Fortschritt wird in den Backend-Logs angezeigt. Der Prozess läuft im Hintergrund weiter, 
            auch wenn Sie diese Seite verlassen.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendonHistoricalSyncTab;
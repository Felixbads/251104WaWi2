import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { 
  AlertTriangle, 
  Calendar, 
  CheckCircle, 
  Database, 
  Download, 
  FileBarChart, 
  History, 
  RefreshCw, 
  Server, 
  XCircle,
  Play,
  Loader,
  Info,
  CalendarClock,
  TrendingUp,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

// Import der neuen Komponente für den historischen Import
import VendonHistoricalSyncTab from '@/components/sync/VendonHistoricalSyncTab';

// Manual Import Form Schema
const manualImportFormSchema = z.object({
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
});

// Format date helper
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  try {
    return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: de });
  } catch (e) {
    return 'Ungültiges Datum';
  }
};

// Schema for the historical import form
const historyImportSchema = z.object({
  startDate: z.string().min(1, 'Startdatum ist erforderlich'),
  endDate: z.string().optional(),
  batchSize: z.number().min(1).max(100).default(100),
  requestDelay: z.number().min(100).max(10000).default(1000),
});

const VendonSyncDashboard: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>('history-import');
  const [refreshCounter, setRefreshCounter] = useState<number>(0);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const { toast } = useToast();
  
  // Form for historical import
  const historyImportForm = useForm<z.infer<typeof historyImportSchema>>({
    resolver: zodResolver(historyImportSchema),
    defaultValues: {
      startDate: '2023-01-01',
      batchSize: 100,
      requestDelay: 1000,
    },
  });

  // Form for manual import
  const manualImportForm = useForm<z.infer<typeof manualImportFormSchema>>({
    resolver: zodResolver(manualImportFormSchema),
    defaultValues: {
      startDate: '',
      endDate: '',
    },
  });

  // TypeScript interface definitions for API data
  interface TransactionStats {
    status: string;
    total: number;
    historyImport: number;
    liveImport: number;
    avgPrice: number;
  }
  
  interface SyncState {
    status: string;
    jobName?: string;
    lastDate?: string;
    lastOffset?: number;
    updatedAt?: string;
    message?: string;
  }
  
  interface Transaction {
    id: number;
    vendon_id: string;
    datetime: string;
    machine_id: number;
    machine_name: string;
    product_id: number;
    product_name: string;
    quantity: number;
    price: number;
    source: string;
    created_at: string;
  }
  
  interface RecentTransactions {
    status: string;
    transactions: Transaction[];
  }

  // General transaction stats
  const { data: statsData, isLoading, error, refetch } = useQuery<TransactionStats>({
    queryKey: ['/api/transactions/stats', refreshCounter],
    refetchOnWindowFocus: false
  });
  
  // Sync state data
  const { data: syncStateData, isLoading: syncStateLoading } = useQuery<SyncState>({
    queryKey: ['/api/vendon/sync-state', refreshCounter],
    refetchOnWindowFocus: false
  });
  
  // Recent transactions
  const { data: recentTransactionsData, isLoading: recentTransactionsLoading } = useQuery<RecentTransactions>({
    queryKey: ['/api/vendon/import/recent-transactions', refreshCounter],
    refetchOnWindowFocus: false
  });

  // Handle refresh button click
  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
  // Start historical import
  const startHistoricalImport = async (data: z.infer<typeof historyImportSchema>) => {
    try {
      setIsImporting(true);
      toast({
        title: "Import gestartet",
        description: "Der historische Import wurde gestartet. Dies kann einige Zeit dauern.",
      });
      
      // Call the API to start the import
      const response = await axios.post('/api/vendon/historical-import', data);
      
      // Show results
      toast({
        title: "Import abgeschlossen",
        description: `${response.data.saved} Transaktionen importiert, ${response.data.duplicates} Duplikate gefunden.`,
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/transactions/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendon/sync-state'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendon/import/recent-transactions'] });
      
      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Import",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  // Reset sync state to restart import from beginning
  const resetSyncState = async () => {
    try {
      await axios.post('/api/vendon/reset-sync-state');
      toast({
        title: "Sync-Status zurückgesetzt",
        description: "Der Import kann nun von vorne begonnen werden.",
      });
      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Zurücksetzen",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    }
  };

  // Manual import handlers for gap filling
  const handleManualImport = async (data: z.infer<typeof manualImportFormSchema>) => {
    try {
      setIsImporting(true);
      
      const response = await axios.post('/api/vendon/historical-import/fill-gaps', {
        startDate: data.startDate,
        endDate: data.endDate,
      });

      toast({
        title: "Import gestartet",
        description: `Import für ${data.startDate} bis ${data.endDate} wurde gestartet.`,
      });

      // Refresh data
      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Import",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFillGap = async (startDate: string, endDate: string) => {
    try {
      setIsImporting(true);
      
      const response = await axios.post('/api/vendon/historical-import/fill-gaps', {
        startDate,
        endDate,
      });

      toast({
        title: "Gap-Fill gestartet",
        description: `Import für ${startDate} bis ${endDate} wurde gestartet.`,
      });

      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Gap-Fill",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFillSingleDay = async (date: string) => {
    handleFillGap(date, date);
  };

  const handleFillAllGaps = async () => {
    try {
      setIsImporting(true);
      
      // Fill gaps for the last 365 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const response = await axios.post('/api/vendon/historical-import/fill-gaps', {
        startDate,
        endDate,
      });

      toast({
        title: "Alle Lücken werden gefüllt",
        description: "Import für alle erkannten Datenlücken wurde gestartet.",
      });

      handleRefresh();
    } catch (error) {
      toast({
        title: "Fehler beim Füllen aller Lücken",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleQuickFill = async (days: number) => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    handleFillGap(startDate, endDate);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-10">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden der Daten</AlertTitle>
          <AlertDescription>
            {(error as Error).message || 'Ein unbekannter Fehler ist aufgetreten.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // Calculate import progress if sync state exists
  const calculateProgress = () => {
    if (!syncStateData || !syncStateData.lastDate) {
      return 0;
    }
    
    const startDate = new Date("2015-01-01"); // Default start date
    const endDate = new Date();
    const currentDate = new Date(syncStateData.lastDate);
    
    const totalDays = differenceInDays(endDate, startDate) || 1;
    const completedDays = differenceInDays(currentDate, startDate) || 0;
    
    return Math.min(Math.floor((completedDays / totalDays) * 100), 100);
  };

  // Transaction sources breakdown (history vs live)
  const transactionSources = [
    { name: 'Historisch', count: statsData?.historyImport || 0 },
    { name: 'Live', count: statsData?.liveImport || 0 },
  ];
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendon Synchronisierung</h1>
          <p className="text-muted-foreground mt-1">
            Verwaltung und Überwachung der Vendon-Daten-Synchronisierung
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </Button>
      </div>
      
      {/* Status Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex justify-between">
            <span>Import-Status</span>
            {syncStateData?.status === 'in_progress' ? (
              <Badge className="bg-blue-500">In Bearbeitung</Badge>
            ) : syncStateData?.lastDate ? (
              <Badge variant="outline" className="bg-green-100">Teilweise importiert</Badge>
            ) : (
              <Badge variant="outline">Nicht gestartet</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Aktueller Fortschritt des Historien-Imports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fortschritt</span>
              <span className="font-medium">{calculateProgress()}%</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letztes importiertes Datum</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {syncStateData?.lastDate ? 
                  format(new Date(syncStateData.lastDate), 'dd.MM.yyyy') : 
                  'Nicht verfügbar'}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzter Offset</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                {syncStateData?.lastOffset || 0}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzte Aktualisierung</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                {syncStateData?.updatedAt ? 
                  formatDate(syncStateData.updatedAt) : 
                  'Nicht verfügbar'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Main Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="history-import">Historischer Import</TabsTrigger>
          <TabsTrigger value="gaps">Datenlücken</TabsTrigger>
          <TabsTrigger value="transactions">Transaktionen</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Transaktionsstatistik
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Gesamtanzahl</dt>
                    <dd className="text-sm font-bold">{statsData?.total || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Historischer Import</dt>
                    <dd className="text-sm font-bold">{statsData?.historyImport || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Live-Import</dt>
                    <dd className="text-sm font-bold">{statsData?.liveImport || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Ø Preis</dt>
                    <dd className="text-sm font-bold">
                      {statsData?.avgPrice 
                        ? `${Number(statsData.avgPrice).toFixed(2)} €` 
                        : '0.00 €'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart className="h-5 w-5 text-primary" />
                  Transaktionen nach Quelle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={transactionSources} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <RechartsTooltip />
                      <Bar dataKey="count" name="Anzahl" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Historical Import Tab */}
        <TabsContent value="history-import" className="space-y-4">
          <VendonHistoricalSyncTab />
        </TabsContent>

        {/* Gap Detection Tab */}
        <TabsContent value="gaps" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gap Overview Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-orange-500" />
                  Datenlücken-Übersicht
                </CardTitle>
                <CardDescription>
                  Fehlende Zeiträume in den Transaktionsdaten
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Fehlende Tage</div>
                    <div className="text-2xl font-bold text-orange-500">12</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Abdeckung</div>
                    <div className="text-2xl font-bold text-green-600">95%</div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Größte Datenlücken:</h4>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 rounded-md bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">15.08.2025 - 18.08.2025</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="destructive" className="text-xs">4 Tage</Badge>
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleFillGap('2025-08-15', '2025-08-18')}>
                          Füllen
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-2 rounded-md bg-yellow-50 border border-yellow-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">22.08.2025 - 23.08.2025</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs border-yellow-500">2 Tage</Badge>
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleFillGap('2025-08-22', '2025-08-23')}>
                          Füllen
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-2 rounded-md bg-orange-50 border border-orange-200">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-orange-500" />
                        <span className="text-sm">31.08.2025</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs border-orange-500">1 Tag</Badge>
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleFillGap('2025-08-31', '2025-08-31')}>
                          Füllen
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manual Import Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-blue-500" />
                  Manueller Zeitraum-Import
                </CardTitle>
                <CardDescription>
                  Importieren Sie Transaktionen für spezifische Zeiträume
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Form {...manualImportForm}>
                  <form onSubmit={manualImportForm.handleSubmit(handleManualImport)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={manualImportForm.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Startdatum</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={manualImportForm.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Enddatum</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        disabled={isImporting}
                        className="flex-1 gap-2"
                      >
                        {isImporting ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin" />
                            Importiere...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Zeitraum importieren
                          </>
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={handleFillAllGaps}
                        disabled={isImporting}
                        className="gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Alle Lücken
                      </Button>
                    </div>
                  </form>
                </Form>

                <Separator />

                {/* Quick Action Buttons */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Schnellaktionen:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickFill(7)}
                      disabled={isImporting}
                      className="text-xs"
                    >
                      Letzte 7 Tage
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickFill(30)}
                      disabled={isImporting}
                      className="text-xs"
                    >
                      Letzte 30 Tage
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickFill(90)}
                      disabled={isImporting}
                      className="text-xs"
                    >
                      Letzte 90 Tage
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickFill(365)}
                      disabled={isImporting}
                      className="text-xs"
                    >
                      Letztes Jahr
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gap Timeline Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Datenabdeckung Timeline
              </CardTitle>
              <CardDescription>
                Visualisierung der Transaktionsdaten nach Zeitraum
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  🟢 Vollständig abgedeckt • 🟡 Teilweise abgedeckt • 🔴 Datenlücke
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {/* Simulate 4 weeks of data */}
                  {Array.from({ length: 28 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (27 - i));
                    
                    // Simulate some missing days
                    const isMissing = [3, 4, 5, 10, 16, 22].includes(i);
                    const isPartial = [8, 15, 25].includes(i);
                    
                    return (
                      <div
                        key={i}
                        className={`
                          h-8 rounded border flex items-center justify-center text-xs font-medium cursor-pointer
                          ${isMissing ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' : 
                            isPartial ? 'bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200' : 
                            'bg-green-100 border-green-300 text-green-700 hover:bg-green-200'}
                        `}
                        title={`${date.toLocaleDateString('de-DE')} - ${isMissing ? 'Datenlücke' : isPartial ? 'Teilweise' : 'Vollständig'}`}
                        onClick={() => isMissing && handleFillSingleDay(date.toISOString().split('T')[0])}
                      >
                        {date.getDate()}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Klicken Sie auf rote Felder, um Datenlücken zu füllen
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Letzte importierte Transaktionen</CardTitle>
              <CardDescription>
                Die {recentTransactionsData?.transactions?.length || 0} zuletzt importierten Transaktionen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendon ID</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Automat</TableHead>
                        <TableHead>Preis</TableHead>
                        <TableHead>Quelle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTransactionsData?.transactions?.map((transaction: any) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-medium">{transaction.vendon_id}</TableCell>
                          <TableCell>{formatDate(transaction.datetime)}</TableCell>
                          <TableCell>{transaction.product_name}</TableCell>
                          <TableCell>{transaction.machine_name}</TableCell>
                          <TableCell>{transaction.price.toFixed(2)} €</TableCell>
                          <TableCell>
                            <Badge 
                              variant={transaction.source === 'history-import' ? 'default' : 'outline'}
                            >
                              {transaction.source === 'history-import' ? 'Historisch' : 'Live'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!recentTransactionsData?.transactions || recentTransactionsData.transactions.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                            Keine Transaktionen gefunden
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VendonSyncDashboard;
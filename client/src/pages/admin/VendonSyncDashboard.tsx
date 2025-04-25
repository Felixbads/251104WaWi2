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
  Info
} from 'lucide-react';

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
  const [selectedTab, setSelectedTab] = useState<string>('overview');
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
          <Card>
            <CardHeader>
              <CardTitle>Historischen Import konfigurieren</CardTitle>
              <CardDescription>
                Starten Sie einen Import historischer Vendon-Transaktionen für einen bestimmten Zeitraum.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...historyImportForm}>
                <form onSubmit={historyImportForm.handleSubmit(startHistoricalImport)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={historyImportForm.control}
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
                      control={historyImportForm.control}
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
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={historyImportForm.control}
                      name="batchSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Batch-Größe</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1} 
                              max={100}
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Anzahl der Transaktionen pro API-Anfrage (max. 100)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={historyImportForm.control}
                      name="requestDelay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API-Verzögerung (ms)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={100} 
                              max={10000}
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Verzögerung zwischen API-Anfragen in Millisekunden
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetSyncState}
                    >
                      <History className="mr-2 h-4 w-4" />
                      Fortschritt zurücksetzen
                    </Button>
                    
                    <Button type="submit" disabled={isImporting}>
                      {isImporting ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Importiere...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Import starten
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Über den historischen Import
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                Der historische Import lädt Vendon-Transaktionen tagesweise von einem bestimmten Startdatum bis heute.
                Der Prozess speichert seinen Fortschritt und kann jederzeit unterbrochen und fortgesetzt werden.
              </p>
              <p>
                Für große Datenmengen empfehlen wir die Ausführung des Befehls auf der Kommandozeile für
                mehr Kontrolle und detailliertere Logs:
              </p>
              <div className="bg-secondary p-2 rounded-md">
                <code className="text-xs md:text-sm">
                  node import_vendon_history.js --start-date=2023-01-01 --end-date=2023-12-31
                </code>
              </div>
              <p>
                Der Import verwendet ON CONFLICT DO NOTHING für idempotentes Verhalten, sodass ein
                wiederholter Import keine Duplikate erzeugt.
              </p>
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
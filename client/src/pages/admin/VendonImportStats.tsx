import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { format, parseISO, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
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
  XCircle
} from 'lucide-react';

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  try {
    return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: de });
  } catch (e) {
    return 'Ungültiges Datum';
  }
};

const VendonImportStats: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>('overview');
  const [refreshCounter, setRefreshCounter] = useState<number>(0);
  
  // Generelle Statistiken laden
  const { data: statsData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/vendon/import/stats', refreshCounter],
    refetchOnWindowFocus: false
  });
  
  // Tägliche Statistiken laden
  const { data: dateStatsData, isLoading: dateStatsLoading } = useQuery({
    queryKey: ['/api/vendon/import/date-stats', refreshCounter],
    enabled: selectedTab === 'charts',
    refetchOnWindowFocus: false
  });
  
  // Lücken-Prüfung laden
  const { data: gapCheckData, isLoading: gapCheckLoading } = useQuery({
    queryKey: ['/api/vendon/import/gap-check', refreshCounter],
    enabled: selectedTab === 'gaps',
    refetchOnWindowFocus: false
  });

  // Daten für Charts vorbereiten
  const yearlyChartData = statsData?.stats?.timeRanges?.map((year: any) => ({
    name: `${year.year}`,
    transactions: year.count
  })) || [];
  
  const dailyChartData = dateStatsData?.data?.map((day: any) => ({
    date: format(new Date(day.day), 'dd.MM.yyyy'),
    count: parseInt(day.transaction_count)
  })) || [];
  
  // Fortschritt berechnen
  const calculateProgress = () => {
    if (!statsData?.stats?.general?.earliest_transaction || 
        !statsData?.stats?.general?.latest_transaction || 
        !statsData?.stats?.syncState?.lastDate) {
      return 0;
    }
    
    const startDate = new Date(statsData.stats.general.earliest_transaction);
    const endDate = new Date();
    const currentDate = new Date(statsData.stats.syncState.lastDate);
    
    const totalDays = differenceInDays(endDate, startDate) || 1;
    const completedDays = differenceInDays(currentDate, startDate) || 0;
    
    return Math.min(Math.floor((completedDays / totalDays) * 100), 100);
  };
  
  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
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
  
  if (error) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden der Statistiken</AlertTitle>
          <AlertDescription>
            {(error as Error).message || 'Ein unbekannter Fehler ist aufgetreten.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendon Import Statistiken</h1>
          <p className="text-muted-foreground mt-1">
            Übersicht über den Fortschritt und Status des Vendon-Transaktionen-Imports
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </Button>
      </div>
      
      {/* Import-Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex justify-between">
            <span>Import-Status</span>
            {statsData?.stats?.syncState?.status === 'in_progress' ? (
              <Badge className="bg-blue-500">In Bearbeitung</Badge>
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
                {statsData?.stats?.syncState?.lastDate ? 
                  format(new Date(statsData.stats.syncState.lastDate), 'dd.MM.yyyy') : 
                  'Nicht verfügbar'}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzter Offset</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                {statsData?.stats?.syncState?.lastOffset || 0}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Letzte Aktualisierung</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                {statsData?.stats?.syncState?.updatedAt ? 
                  formatDate(statsData.stats.syncState.updatedAt) : 
                  'Nicht verfügbar'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Hauptinhalt mit Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="charts">Diagramme</TabsTrigger>
          <TabsTrigger value="gaps">Lückenanalyse</TabsTrigger>
          <TabsTrigger value="logs">Sync-Logs</TabsTrigger>
        </TabsList>
        
        {/* Übersicht Tab */}
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
                    <dd className="text-sm font-bold">{statsData?.stats?.general?.total_transactions || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Historie-Import</dt>
                    <dd className="text-sm font-bold">{statsData?.stats?.transactions?.history_import || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Live-Import</dt>
                    <dd className="text-sm font-bold">{statsData?.stats?.transactions?.live_import || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Ø Preis</dt>
                    <dd className="text-sm font-bold">
                      {statsData?.stats?.transactions?.avg_price 
                        ? `${parseFloat(statsData.stats.transactions.avg_price).toFixed(2)} €` 
                        : '0.00 €'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Zeitraumanalyse
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Früheste Transaktion</dt>
                    <dd className="text-sm font-bold">
                      {statsData?.stats?.general?.earliest_transaction 
                        ? format(new Date(statsData.stats.general.earliest_transaction), 'dd.MM.yyyy') 
                        : 'N/A'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Letzte Transaktion</dt>
                    <dd className="text-sm font-bold">
                      {statsData?.stats?.general?.latest_transaction 
                        ? format(new Date(statsData.stats.general.latest_transaction), 'dd.MM.yyyy')
                        : 'N/A'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Tage mit Daten</dt>
                    <dd className="text-sm font-bold">{statsData?.stats?.general?.days_with_data || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-muted-foreground">Letzte 24 Stunden</dt>
                    <dd className="text-sm font-bold">{statsData?.stats?.transactions?.last_24h || 0}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Zusätzliche Informationen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Eindeutige Automaten</div>
                  <div className="text-2xl font-bold">{statsData?.stats?.general?.unique_machines || 0}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Eindeutige Produkte</div>
                  <div className="text-2xl font-bold">{statsData?.stats?.general?.unique_products || 0}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Transaktionen (7 Tage)</div>
                  <div className="text-2xl font-bold">{statsData?.stats?.transactions?.last_7days || 0}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Transaktionen (30 Tage)</div>
                  <div className="text-2xl font-bold">{statsData?.stats?.transactions?.last_30days || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Diagramme Tab */}
        <TabsContent value="charts" className="space-y-4">
          {dateStatsLoading ? (
            <Card>
              <CardContent className="py-10">
                <div className="flex justify-center items-center">
                  <Skeleton className="h-[300px] w-full" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileBarChart className="h-5 w-5 text-primary" />
                    Jährliche Transaktionen
                  </CardTitle>
                  <CardDescription>
                    Anzahl der Transaktionen pro Jahr
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearlyChartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="transactions" fill="#3b82f6" name="Transaktionen" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileBarChart className="h-5 w-5 text-primary" />
                    Tägliche Transaktionen
                  </CardTitle>
                  <CardDescription>
                    Anzahl der Transaktionen pro Tag (letzte 30 Tage)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyChartData.slice(-30)} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" angle={-45} textAnchor="end" height={60} />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#3b82f6" name="Transaktionen" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        
        {/* Lückenanalyse Tab */}
        <TabsContent value="gaps" className="space-y-4">
          {gapCheckLoading ? (
            <Card>
              <CardContent className="py-10">
                <div className="flex justify-center items-center">
                  <Skeleton className="h-40 w-full" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Datumslückenanalyse
                  </CardTitle>
                  <CardDescription>
                    Analyse von fehlenden oder unvollständigen Transaktionsdaten
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium text-muted-foreground mb-1">Analysierte Tage</div>
                      <div className="text-2xl font-bold">{gapCheckData?.totalDays || 0}</div>
                    </div>
                    
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium text-muted-foreground mb-1">Tage ohne Transaktionen</div>
                      <div className="text-2xl font-bold text-yellow-500">{gapCheckData?.gaps?.count || 0}</div>
                    </div>
                    
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium text-muted-foreground mb-1">Tage mit niedriger Aktivität</div>
                      <div className="text-2xl font-bold text-blue-500">{gapCheckData?.lowActivity?.count || 0}</div>
                    </div>
                  </div>
                  
                  {gapCheckData?.gaps?.count > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-2">Tage ohne Transaktionen</h3>
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead className="text-right">Transaktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gapCheckData.gaps.list.slice(0, 10).map((gap: any) => (
                              <TableRow key={gap.date}>
                                <TableCell>{gap.date}</TableCell>
                                <TableCell className="text-right font-medium text-red-500">0</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          {gapCheckData.gaps.list.length > 10 && (
                            <TableCaption>
                              {gapCheckData.gaps.list.length - 10} weitere Tage nicht angezeigt
                            </TableCaption>
                          )}
                        </Table>
                      </div>
                    </div>
                  )}
                  
                  {gapCheckData?.lowActivity?.count > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-2">Tage mit niedriger Aktivität</h3>
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead className="text-right">Transaktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gapCheckData.lowActivity.list.slice(0, 10).map((day: any) => (
                              <TableRow key={day.date}>
                                <TableCell>{day.date}</TableCell>
                                <TableCell className="text-right font-medium text-yellow-500">
                                  {day.transactionCount}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          {gapCheckData.lowActivity.list.length > 10 && (
                            <TableCaption>
                              {gapCheckData.lowActivity.list.length - 10} weitere Tage nicht angezeigt
                            </TableCaption>
                          )}
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        
        {/* Sync-Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Letzte Synchronisationsprotokolle
              </CardTitle>
              <CardDescription>
                Historie der Vendon-Import-Vorgänge
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gefunden</TableHead>
                      <TableHead className="text-right">Gespeichert</TableHead>
                      <TableHead className="text-right">Duplikate</TableHead>
                      <TableHead className="text-right">Fehler</TableHead>
                      <TableHead className="text-right">Dauer (s)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsData?.stats?.recentLogs?.length > 0 ? (
                      statsData.stats.recentLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell>{formatDate(log.created_at)}</TableCell>
                          <TableCell>{log.sync_type}</TableCell>
                          <TableCell>
                            {log.sync_status === 'completed' ? (
                              <Badge className="bg-green-500">Abgeschlossen</Badge>
                            ) : log.sync_status === 'completed_with_errors' ? (
                              <Badge className="bg-yellow-500">Mit Fehlern</Badge>
                            ) : (
                              <Badge variant="outline">{log.sync_status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{log.items_found}</TableCell>
                          <TableCell className="text-right">{log.items_saved}</TableCell>
                          <TableCell className="text-right">{log.duplicates}</TableCell>
                          <TableCell className="text-right">{log.errors}</TableCell>
                          <TableCell className="text-right">
                            {parseFloat(log.duration_seconds).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          Keine Sync-Logs gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Dokumentation und Hilfe */}
      <Card>
        <CardHeader>
          <CardTitle>Dokumentation & Hilfe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Diese Seite zeigt den Fortschritt und Status des Vendon-Transaktionen-Imports.
            Für den Import historischer Daten von einem beliebigen Zeitpunkt, führen Sie den folgenden Befehl aus:
          </p>
          
          <div className="bg-secondary p-2 rounded-md">
            <code className="text-xs md:text-sm">
              node import_vendon_history.js --start-date=2023-01-01 --end-date=2023-12-31
            </code>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Für detaillierte Prüfungen der Datenqualität und Vollständigkeit, verwenden Sie:
          </p>
          
          <div className="bg-secondary p-2 rounded-md">
            <code className="text-xs md:text-sm">
              node check_vendon_import_completeness.js --start-date=2023-01-01 --details
            </code>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button variant="outline" className="gap-2" asChild>
            <a href="/VENDON_HISTORY_IMPORT.md" target="_blank">
              <Download className="h-4 w-4" />
              Dokumentation
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default VendonImportStats;
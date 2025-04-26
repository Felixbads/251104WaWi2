import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format, parseISO, subDays, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Server, 
  BarChart4, 
  Clock, 
  Database, 
  RefreshCw, 
  Download, 
  Cloud, 
  Calendar, 
  History,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  Loader,
  DownloadCloud,
  RotateCcw
} from 'lucide-react';

// Importiere Vendon Historical Sync Tab für die direkte Einbindung
import VendonHistoricalSyncTab from '@/components/sync/VendonHistoricalSyncTab';

// Definiere die Typen für die Datenbankstatistiken
interface StatsEntity {
  count: number;
  latest?: string | null;
}

interface DatabaseStats {
  transactions: number | StatsEntity;
  machines?: StatsEntity;
  refills?: StatsEntity;
  events?: StatsEntity;
  products?: StatsEntity;
  weatherForecasts?: number;
  weatherHistorical?: number;
  holidays?: number;
  syncLogs?: number;
  forecastModels?: number;
  openOrders?: number;
  lastUpdated?: string;
}

export default function SyncDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();
  
  // Hole Synchronisierungsstatus
  const syncStatusQuery = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: async () => {
      const response = await axios.get('/api/sync/status');
      return response.data;
    },
    refetchInterval: 15000  // Aktualisiere alle 15 Sekunden
  });

  // Typdefinitionen für API-Antwort
  interface StatsEntity {
    count: number;
    latest: string | null;
  }

  interface TransactionStats {
    earliest: string | null;
    latest: string | null;
    count: number;
    coverage: number;
  }

  interface DatabaseStats {
    transactions: StatsEntity;
    machines: StatsEntity;
    refills: StatsEntity;
    events: StatsEntity;
    products: StatsEntity;
    transactionStats?: TransactionStats;
    weatherForecasts?: number;
    weatherHistorical?: number;
    holidays?: number;
    syncLogs?: number;
    forecastModels?: number;
    [key: string]: StatsEntity | TransactionStats | number | undefined;
  }

  // Typsicherheit für Datenbankstatistiken
  type DatabaseStatsResponse = DatabaseStats;
  
  // Hole Datenbankstatistiken
  const databaseStatsQuery = useQuery<DatabaseStatsResponse>({
    queryKey: ['/api/database/stats'],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/database/stats');
        console.log('Datenbank-Statistiken:', response.data);
        return response.data;
      } catch (error) {
        console.error('Fehler beim Abrufen der Datenbankstatistiken:', error);
        // Return a safe default object with null values
        return {
          transactions: { count: 0, latest: null },
          machines: { count: 0, latest: null },
          refills: { count: 0, latest: null },
          events: { count: 0, latest: null },
          products: { count: 0, latest: null }
        };
      }
    },
    refetchInterval: 30000  // Aktualisiere alle 30 Sekunden
  });

  // Hole Wetter-API-Nutzungsstatistiken
  const weatherApiQuery = useQuery({
    queryKey: ['/api/weather/api-usage'],
    queryFn: async () => {
      const response = await axios.get('/api/weather/api-usage');
      return response.data;
    },
    refetchInterval: 60000  // Aktualisiere jede Minute
  });

  // Helfer-Funktionen
  const getStatusBadgeClass = (status: string | undefined): string => {
    switch(status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return 'Nie';
    try {
      const date = new Date(dateString);
      if (!isValid(date)) return 'Ungültiges Datum';
      return format(date, 'PPpp', { locale: de });
    } catch (error) {
      return 'Fehler beim Formatieren';
    }
  };

  // Manueller Sync-Starter
  const startSync = async (syncType: string) => {
    try {
      toast({
        title: `${syncType}-Synchronisierung gestartet`,
        description: "Die Synchronisierung läuft im Hintergrund und kann einige Zeit dauern.",
      });
      
      // Standard-Zeitraum: letzte 7 Tage bis heute
      const startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');
      
      // API-Aufruf zur Synchronisierung
      await axios.post(`/api/sync/${syncType}`, {
        startDate,
        endDate,
        batchSize: 100
      });
      
      // Nach dem Start invalidieren wir die Abfrage, um ein automatisches Neuladen auszulösen
      syncStatusQuery.refetch();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unbekannter Fehler';
      
      const responseMessage = axios.isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : errorMessage;
      
      toast({
        title: `Fehler bei ${syncType}-Synchronisierung`,
        description: responseMessage,
        variant: "destructive",
      });
    }
  };

  // Wetter-Synchronisierung starten
  const startWeatherSync = async (syncType: 'forecast' | 'historical' | 'historical_from_2023' | 'missing') => {
    try {
      toast({
        title: `Wetter-Synchronisierung gestartet (${syncType})`,
        description: "Die Synchronisierung läuft im Hintergrund und kann einige Zeit dauern.",
      });
      
      // API-Aufruf je nach Typ
      switch (syncType) {
        case 'forecast':
          await axios.post('/api/weather/forecast/sync');
          break;
        case 'historical':
          // Datum für gestern
          const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
          await axios.post('/api/weather/historical/sync', { date: yesterday });
          break;
        case 'historical_from_2023':
          await axios.post('/api/weather/historical/sync-from-2023', { batchSize: 10 });
          break;
        case 'missing':
          await axios.post('/api/weather/sync-missing', { 
            startDate: '2023-01-01',
            endDate: format(new Date(), 'yyyy-MM-dd'),
          });
          break;
      }
      
      toast({
        title: "Wetter-Synchronisierung gestartet",
        description: "Die Synchronisierung läuft im Hintergrund.",
      });
      
      // Nach dem Start die Wetter-Statistiken neu laden
      weatherApiQuery.refetch();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unbekannter Fehler';
      
      const responseMessage = axios.isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : errorMessage;
      
      toast({
        title: "Fehler bei der Wetter-Synchronisierung",
        description: responseMessage,
        variant: "destructive",
      });
    }
  };

  // Feiertage-Synchronisierung starten
  const syncHolidays = async (allStates = false) => {
    try {
      toast({
        title: "Feiertags-Synchronisierung gestartet",
        description: allStates 
          ? "Die Synchronisierung von Feiertagen und Schulferien für alle Bundesländer wird gestartet."
          : "Die Synchronisierung von Feiertagen und Schulferien für Sachsen wird gestartet.",
      });
      
      // Aktuelles Jahr + nächstes Jahr synchronisieren
      const currentYear = new Date().getFullYear();
      await axios.post('/api/holidays/sync', {
        year: currentYear,
        includeNextYear: true,
        state: "SN", // Default: Sachsen
        allStates: allStates, // Alle Bundesländer synchronisieren, wenn true
        includeSchoolHolidays: true
      });
      
      toast({
        title: "Feiertage erfolgreich synchronisiert",
        description: allStates
          ? `Feiertage und Schulferien für alle Bundesländer (${currentYear}/${currentYear+1}) wurden aktualisiert.`
          : `Feiertage und Schulferien für Sachsen (${currentYear}/${currentYear+1}) wurden aktualisiert.`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unbekannter Fehler';
      
      const responseMessage = axios.isAxiosError(error) && error.response?.data?.message
        ? error.response.data.message
        : errorMessage;
      
      toast({
        title: "Fehler bei der Feiertags-Synchronisierung",
        description: responseMessage,
        variant: "destructive",
      });
    }
  };

  // Ladezustand
  if (syncStatusQuery.isLoading && databaseStatsQuery.isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-3xl font-bold mb-4">Daten-Synchronisation</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-12 w-1/2 mb-4" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Fehler-Zustand
  if (syncStatusQuery.isError || databaseStatsQuery.isError) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-3xl font-bold mb-4">Daten-Synchronisation</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden der Synchronisationsdaten</AlertTitle>
          <AlertDescription>
            Es gab ein Problem beim Abrufen der Synchronisationsdaten. Bitte versuchen Sie es später erneut.
            {syncStatusQuery.error instanceof Error && (
              <p className="mt-2">Fehlermeldung: {syncStatusQuery.error.message}</p>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Hauptansicht
  return (
    <div className="container mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Daten-Synchronisation</h1>
        <p className="text-muted-foreground">
          Zentrale Verwaltung aller Daten-Synchronisationen: Vendon-API, Wetterdaten und Feiertage
        </p>
      </header>

      {/* Tabs für die verschiedenen Synchronisationstypen */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="vendon-history">Vendon Historie</TabsTrigger>
          <TabsTrigger value="weather">Wetterdaten</TabsTrigger>
          <TabsTrigger value="holidays">Feiertage & Ferien</TabsTrigger>
        </TabsList>

        {/* Übersichts-Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Status-Karten */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Automaten */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Automaten</p>
                    <p className="text-2xl font-bold">
                      {databaseStatsQuery.isLoading ? '...' : 
                        (databaseStatsQuery.data?.machines?.count || 0).toLocaleString('de-DE')}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Server className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="mt-3 flex flex-col space-y-1">
                  <div className="flex items-center text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.machines?.status)}`}>
                      {syncStatusQuery.data?.machines?.status === 'completed' ? 'Synchronisiert' : 
                       syncStatusQuery.data?.machines?.status === 'running' ? 'Läuft...' : 
                       syncStatusQuery.data?.machines?.status === 'pending' ? 'Anstehend' : 
                       syncStatusQuery.data?.machines?.status === 'error' ? 'Fehler' : 'Unbekannt'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.machines?.lastSync)}
                  </span>
                  <Button 
                    onClick={() => startSync('machines')} 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Aktualisieren
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Transaktionen */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Transaktionen</p>
                    <p className="text-2xl font-bold">
                      {databaseStatsQuery.isLoading ? '...' : 
                        (databaseStatsQuery.data?.transactions && 
                         typeof databaseStatsQuery.data.transactions === 'object' && 
                         'count' in databaseStatsQuery.data.transactions ?
                          Number(databaseStatsQuery.data.transactions.count || 0) :
                          typeof databaseStatsQuery.data?.transactions === 'number' ?
                          databaseStatsQuery.data.transactions : 0
                        ).toString()}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart4 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="mt-3 flex flex-col space-y-1">
                  <div className="flex items-center text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${getStatusBadgeClass(syncStatusQuery.data?.transactions?.status)}`}>
                      {syncStatusQuery.data?.transactions?.status === 'completed' ? 'Synchronisiert' : 
                       syncStatusQuery.data?.transactions?.status === 'running' ? 'Läuft...' : 
                       syncStatusQuery.data?.transactions?.status === 'pending' ? 'Anstehend' : 
                       syncStatusQuery.data?.transactions?.status === 'error' ? 'Fehler' : 'Unbekannt'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Letzte Aktualisierung: {formatDate(syncStatusQuery.data?.transactions?.lastSync)}
                  </span>
                  <Button 
                    onClick={() => startSync('transactions')} 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Aktualisieren
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Wetterdaten */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Wetterdaten</p>
                    <p className="text-2xl font-bold">
                      {weatherApiQuery.isLoading ? '...' : weatherApiQuery.data?.count || 0}/{weatherApiQuery.data?.limit || 1000}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Cloud className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="mt-3 flex flex-col space-y-1">
                  <div className="flex items-center text-xs space-x-1">
                    <span className={`px-2 py-0.5 rounded-full ${
                      weatherApiQuery.data?.remaining > 0.8 * weatherApiQuery.data?.limit ? 'bg-green-100 text-green-800' :
                      weatherApiQuery.data?.remaining > 0.5 * weatherApiQuery.data?.limit ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {weatherApiQuery.data?.remaining || 0} übrig
                    </span>
                    <span className="text-muted-foreground">
                      ({Math.round((weatherApiQuery.data?.remaining / weatherApiQuery.data?.limit) * 100) || 0}%)
                    </span>
                  </div>
                  
                  <Progress 
                    value={(weatherApiQuery.data?.count / weatherApiQuery.data?.limit) * 100 || 0} 
                    className="h-1.5 mt-1"
                  />
                  
                  <Button 
                    onClick={() => startWeatherSync('forecast')} 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Vorhersage aktualisieren
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Feiertage & Urlaube */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Feiertage & Ferien</p>
                    <p className="text-2xl font-bold">
                      {databaseStatsQuery.isLoading ? '...' : 
                        (typeof databaseStatsQuery.data?.holidays === 'number' ? 
                         databaseStatsQuery.data.holidays : 0).toString()}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="mt-3 flex flex-col space-y-1">
                  <div className="flex items-center text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                      {new Date().getFullYear()}-{new Date().getFullYear() + 1}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Sachsen (inkl. Schulferien)
                  </span>
                  <Button 
                    onClick={syncHolidays} 
                    size="sm" 
                    variant="outline" 
                    className="mt-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Aktualisieren
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Datenbank-Statistiken */}
          <Card>
            <CardHeader>
              <CardTitle>Datenbank-Statistiken</CardTitle>
              <CardDescription>
                Aktuelle Anzahl der Datensätze in der Datenbank
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* TRANSAKTIONEN */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Transaktionen</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading 
                      ? '...' 
                      : (() => {
                          const data = databaseStatsQuery.data;
                          if (!data || !data.transactions) return '0';
                          
                          // Wenn es eine Zahl ist, direkt formatieren
                          if (typeof data.transactions === 'number') {
                            return String(data.transactions);
                          }
                          
                          // Typ-Guard für Objekte mit count Eigenschaft
                          interface CountObject {
                            count: number;
                          }
                          
                          // Sicherstellen, dass es ein Objekt mit count ist
                          function isCountObject(obj: any): obj is CountObject {
                            return typeof obj === 'object' 
                              && obj !== null
                              && 'count' in obj 
                              && typeof obj.count === 'number';
                          }
                          
                          // Jetzt mit dem Typ-Guard prüfen
                          if (isCountObject(data.transactions)) {
                            return String(data.transactions.count);
                          }
                          
                          return '0';
                        })()
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Letzte: {(() => {
                      const transactions = databaseStatsQuery.data?.transactions;
                      if (!transactions) return 'N/A';
                      if (typeof transactions === 'object' && transactions.latest) {
                        const latest = transactions.latest;
                        if (typeof latest === 'string') {
                          try {
                            const date = parseISO(latest);
                            if (!isValid(date)) return 'Datum ungültig';
                            return format(date, 'dd.MM.yyyy');
                          } catch (error) {
                            return 'Datum-Fehler';
                          }
                        }
                        return 'Format ungültig';
                      }
                      return 'N/A';
                    })()}
                  </p>
                </div>
                
                {/* PRODUKTE */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Produkte</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : 
                      (databaseStatsQuery.data?.products?.count || 0).toString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aktiv
                  </p>
                </div>
                
                {/* AUTOMATEN */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Automaten</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : 
                      (databaseStatsQuery.data?.machines?.count || 0).toString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aktiv
                  </p>
                </div>
                
                {/* WETTERDATEN */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Wetterdaten</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading 
                      ? '...' 
                      : ((databaseStatsQuery.data?.weatherForecasts || 0) + (databaseStatsQuery.data?.weatherHistorical || 0))
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {databaseStatsQuery.data?.weatherForecasts || 0} Vorhersagen, {databaseStatsQuery.data?.weatherHistorical || 0} Historisch
                  </p>
                </div>
                
                {/* AUFFÜLLUNGEN */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Auffüllungen</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : 
                      (databaseStatsQuery.data?.refills?.count || 0).toString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gesamt
                  </p>
                </div>
                
                {/* FEIERTAGE */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Feiertage</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.holidays || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inkl. Schulferien
                  </p>
                </div>
                
                {/* SYNCHRONISIERUNGEN */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Synchronisierungen</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.syncLogs || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Protokolleinträge
                  </p>
                </div>
                
                {/* PROGNOSEMODELLE */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Prognosemodelle</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.forecastModels || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Prophet-basiert
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aktionen */}
          <Card>
            <CardHeader>
              <CardTitle>Schnellaktionen</CardTitle>
              <CardDescription>
                Starten Sie verschiedene Synchronisationen auf Knopfdruck
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Button 
                  onClick={() => startSync('transactions')}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <BarChart4 className="h-4 w-4" />
                  Transaktionen synchronisieren
                </Button>
                
                <Button 
                  onClick={() => startSync('machines')}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Server className="h-4 w-4" />
                  Automaten synchronisieren
                </Button>
                
                <Button 
                  onClick={() => startSync('refills')}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                  Auffüllungen synchronisieren
                </Button>
                
                <Button 
                  onClick={() => startWeatherSync('forecast')}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Cloud className="h-4 w-4" />
                  Wettervorhersage aktualisieren
                </Button>
                
                <Button 
                  onClick={() => startWeatherSync('historical')}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <History className="h-4 w-4" />
                  Gestrige Wetterdaten abrufen
                </Button>
                
                <Button 
                  onClick={syncHolidays}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Calendar className="h-4 w-4" />
                  Feiertage aktualisieren
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendon Historical Import Tab */}
        <TabsContent value="vendon-history" className="space-y-6">
          <VendonHistoricalSyncTab />
        </TabsContent>

        {/* Wetterdaten Tab */}
        <TabsContent value="weather" className="space-y-6">
          {/* Wetter API Status */}
          <Card>
            <CardHeader>
              <CardTitle>OpenWeather API-Status</CardTitle>
              <CardDescription>
                Aktueller Status der OpenWeather API-Nutzung und verfügbare Anfragen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API Limits und Nutzung */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-medium">API-Nutzung</h3>
                    <p className="text-sm text-muted-foreground">
                      Verbleibende Anfragen: {weatherApiQuery.data?.remaining || 0} von {weatherApiQuery.data?.limit || 1000}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    weatherApiQuery.data?.remaining > 0.8 * weatherApiQuery.data?.limit ? 
                      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                    weatherApiQuery.data?.remaining > 0.3 * weatherApiQuery.data?.limit ? 
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {Math.round((weatherApiQuery.data?.remaining / weatherApiQuery.data?.limit) * 100) || 0}% verfügbar
                  </span>
                </div>
                
                <Progress 
                  value={(weatherApiQuery.data?.count / weatherApiQuery.data?.limit) * 100 || 0} 
                  className="h-2"
                />
                
                <div className="text-xs text-muted-foreground">
                  <p>Tägliches Limit: {weatherApiQuery.data?.limit || 1000} Anfragen</p>
                  <p>Genutzt heute: {weatherApiQuery.data?.count || 0} Anfragen</p>
                  <p>Automatisches Reset: Jeden Tag um 00:00 UTC</p>
                </div>
                
                <Alert className="bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-500" />
                    <AlertTitle className="text-blue-800">API-Nutzungsempfehlungen</AlertTitle>
                  </div>
                  <AlertDescription className="text-blue-700 text-sm mt-2">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Aktuelle Vorhersage: 1x täglich ausreichend (8 Anfragen)</li>
                      <li>Historische Daten: 1x pro Tag für den Vortag (1 Anfrage)</li>
                      <li>Batch-Synchronisierung fehlender historischer Daten bei Bedarf</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>

              {/* Aktionen für Wetterdaten */}
              <div className="space-y-4">
                <Separator />
                <h3 className="text-sm font-medium">Wetterdaten synchronisieren</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="bg-gray-50">
                    <CardContent className="pt-4 pb-4">
                      <h4 className="text-sm font-medium mb-2">Aktuelle Vorhersage</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Aktuelle 7-Tage-Wettervorhersage (8 Anfragen)
                      </p>
                      <Button 
                        onClick={() => startWeatherSync('forecast')}
                        className="w-full"
                        variant="default"
                        size="sm"
                      >
                        <Cloud className="h-4 w-4 mr-2" />
                        Vorhersage aktualisieren
                      </Button>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-50">
                    <CardContent className="pt-4 pb-4">
                      <h4 className="text-sm font-medium mb-2">Gestrige Wetterdaten</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Historische Daten für gestern abrufen (1 Anfrage)
                      </p>
                      <Button 
                        onClick={() => startWeatherSync('historical')}
                        className="w-full" 
                        variant="default"
                        size="sm"
                      >
                        <History className="h-4 w-4 mr-2" />
                        Gestrige Daten abrufen
                      </Button>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-50 sm:col-span-2">
                    <CardContent className="pt-4 pb-4">
                      <h4 className="text-sm font-medium mb-2">Historische Daten seit 2023</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Fehlende historische Wetterdaten ab 01.01.2023 in Batches synchronisieren.
                        Diese Aktion nutzt viele API-Anfragen - bitte mit Vorsicht verwenden!
                      </p>
                      <div className="flex gap-4">
                        <Button 
                          onClick={() => startWeatherSync('historical_from_2023')}
                          className="flex-1" 
                          variant="outline"
                          size="sm"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Historische Daten in Batches abrufen
                        </Button>
                        
                        <Button 
                          onClick={() => startWeatherSync('missing')}
                          className="flex-1" 
                          variant="outline"
                          size="sm"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Nur fehlende Daten abrufen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feiertage & Ferien Tab */}
        <TabsContent value="holidays" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feiertage & Schulferien</CardTitle>
              <CardDescription>
                Aktueller Status und Synchronisierung von Feiertagen und Schulferien
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Feiertage</p>
                  <p className="text-2xl font-bold">
                    {databaseStatsQuery.isLoading ? '...' : databaseStatsQuery.data?.holidays || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Einträge in der Datenbank
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Zeitraum</p>
                  <p className="text-xl font-bold">
                    {new Date().getFullYear()}-{new Date().getFullYear() + 1}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aktuelles + nächstes Jahr
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Region</p>
                  <p className="text-xl font-bold">
                    Sachsen (SN)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bundesland
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Datentypen</p>
                  <div className="flex gap-2 mt-1">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800">Gesetzliche Feiertage</span>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800">Schulferien</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Inkludiert
                  </p>
                </div>
              </div>
              
              <Separator />
              
              {/* Aktionen */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Feiertage synchronisieren</h3>
                
                <Card className="bg-gray-50">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                      <div>
                        <h4 className="text-sm font-medium">Feiertage und Schulferien aktualisieren</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Feiertage und Schulferien für das aktuelle und nächste Jahr synchronisieren.
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          onClick={(e) => {
                            e.preventDefault();
                            syncHolidays(false);
                          }}
                          className="self-start" 
                          variant="default"
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Sachsen synchronisieren
                        </Button>
                        <Button 
                          onClick={(e) => {
                            e.preventDefault();
                            syncHolidays(true);
                          }}
                          className="self-start" 
                          variant="outline"
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Alle Bundesländer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertTitle className="text-blue-800">Information</AlertTitle>
                  <AlertDescription className="text-blue-700 text-sm mt-1">
                    Die Feiertagsdaten werden automatisch aus offiziellen Quellen abgerufen. 
                    Die Synchronisierung ist in der Regel nur einmal pro Jahr erforderlich, 
                    da die Daten für das aktuelle und das kommende Jahr importiert werden.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
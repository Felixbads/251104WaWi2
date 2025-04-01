import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Package, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard,
  BarChart3,
  Truck,
  Cloud,
  RefreshCw,
  Database,
  Clock,
  ArrowUpRight
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import WeatherWidget from "@/components/weather/WeatherWidget";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  getTransactions, 
  getMachines, 
  getEvents, 
  getSyncStatus, 
  getOpenOrders, 
  formatDateTime, 
  getForecastModels, 
  getDashboardForecasts,
  initializeDefaultForecastModel,
  getDatabaseStatistics,
  getRefills
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  XAxis,
  YAxis
} from "recharts";
import TransactionsTable from "@/components/tables/TransactionsTable";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Fetch data for metrics
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(100),
  });

  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });
  
  const { data: events, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['/api/events'],
    queryFn: () => getEvents(10),
  });
  
  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: () => getSyncStatus(),
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren
  });
  
  // Offene Bestellungen für die Dashboard-Ansicht
  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000 // Jede Minute aktualisieren
  });
  
  // Prognosemodelle für das Dashboard
  const { data: forecastModels, isLoading: isLoadingForecastModels } = useQuery({
    queryKey: ['/api/forecast/models'],
    queryFn: () => getForecastModels(),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });
  
  // Dashboard-Prognosen für die nächsten 14 Tage
  const { data: dashboardForecasts, isLoading: isLoadingDashboardForecasts } = useQuery({
    queryKey: ['/api/forecast/dashboard'],
    queryFn: () => getDashboardForecasts(),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });

  // Datenbankstatistiken für das Dashboard
  const { data: databaseStats, isLoading: isLoadingDatabaseStats } = useQuery({
    queryKey: ['/api/statistics/database'],
    queryFn: () => getDatabaseStatistics(),
    refetchInterval: 60000 // Jede Minute aktualisieren
  });

  // Refill-Daten für die letzten 7 Tage
  const { data: refillData, isLoading: isLoadingRefills } = useQuery({
    queryKey: ['/api/refills'],
    queryFn: () => getRefills({ 
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      limit: 100
    }),
  });

  // Berechne aktuelle Metriken aus realen Daten
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  // Maschinen-Statistiken
  const activeMachines = machines?.filter(m => m.status === "active").length || 0;
  const totalMachines = machines?.length || 0;

  // Umsatz heute
  const dailyRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate.toDateString() === today.toDateString()) {
      return sum + (tx.price || 0);
    }
    return sum;
  }, 0) || 0;
  
  // Umsatz gestern (als Vergleich)
  const yesterdayRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate.toDateString() === yesterday.toDateString()) {
      return sum + (tx.price || 0);
    }
    return sum;
  }, 0) || 0;
  
  // Trend berechnen
  const revenueTrend = yesterdayRevenue > 0 
    ? ((dailyRevenue - yesterdayRevenue) / yesterdayRevenue * 100) 
    : 0;
  
  // Top Produkte
  const topProducts = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.productName]) {
      acc[tx.productName] = { count: 0, revenue: 0 };
    }
    acc[tx.productName].count += 1;
    acc[tx.productName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};
  
  // Top Maschinen nach Transaktionen
  const machineTransactions = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.machineName]) {
      acc[tx.machineName] = { count: 0, revenue: 0 };
    }
    acc[tx.machineName].count += 1;
    acc[tx.machineName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};

  // Zahlungsmethoden nach Standort
  const locationPaymentMethods = transactions?.reduce((acc: Record<string, {
    machineName: string,
    cash: number,
    cashless: number,
    total: number,
    cashlessPercentage: number
  }>, tx) => {
    if (!acc[tx.machineId]) {
      acc[tx.machineId] = {
        machineName: tx.machineName,
        cash: 0,
        cashless: 0,
        total: 0,
        cashlessPercentage: 0
      };
    }
    
    acc[tx.machineId].total += 1;
    
    if (tx.paymentMethod === 'CASH') {
      acc[tx.machineId].cash += 1;
    } else if (tx.paymentMethod === 'CASHLESS') {
      acc[tx.machineId].cashless += 1;
    }
    
    // Prozentsatz berechnen
    acc[tx.machineId].cashlessPercentage = (acc[tx.machineId].cashless / acc[tx.machineId].total) * 100;
    
    return acc;
  }, {}) || {};

  // Entfernte Produkte aus der REST-API holen
  const { data: removedProductsData, isLoading: isLoadingRemovedProducts } = useQuery({
    queryKey: ['/api/removed-products'],
    queryFn: () => fetch('/api/removed-products').then(res => res.json()),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });
  
  // Interfaces für Removed Products API-Antwort
  interface RemovedProductItem {
    name: string;
    count: number;
  }

  interface RemovedProductsData {
    analytics: {
      byProduct: RemovedProductItem[];
    };
  }

  // Top 5 entnommene Waren - aus der spezialisierten API-Route für Removed Products
  const refillRemovedItems = React.useMemo<Record<string, number>>(() => {
    const data = removedProductsData as RemovedProductsData | undefined;
    if (!data?.analytics?.byProduct) return {};
    
    return data.analytics.byProduct.reduce(
      (acc: Record<string, number>, item: RemovedProductItem) => {
        if (item?.name && typeof item.count === 'number') {
          acc[item.name] = item.count;
        }
        return acc;
      }, 
      {} as Record<string, number>
    );
  }, [removedProductsData]);
  
  // Synchronisationsstatus
  const getLatestSyncTime = () => {
    if (!syncStatus) return null;
    
    const timestamps = [
      syncStatus.machines?.lastSync,
      syncStatus.products?.lastSync,
      syncStatus.transactions?.lastSync,
      syncStatus.refills?.lastSync,
      syncStatus.events?.lastSync
    ].filter(Boolean);
    
    if (timestamps.length === 0) return null;
    
    return new Date(Math.max(...timestamps));
  };
  
  const latestSyncTime = getLatestSyncTime();
  
  // Prüft, ob ein Synchronisierungsprozess läuft
  const isSyncRunning = syncStatus && (
    syncStatus.machines?.status === "running" ||
    syncStatus.products?.status === "running" ||
    syncStatus.transactions?.status === "running" ||
    syncStatus.refills?.status === "running" ||
    syncStatus.events?.status === "running"
  );

  // Aktualisieren der Daten
  const handleRefresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
    queryClient.invalidateQueries({ queryKey: ['/api/events'] });
    queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/statistics/database'] });
    
    toast({
      title: "Daten werden aktualisiert",
      description: "Die Dashboard-Daten werden neu geladen."
    });
  }, [queryClient, toast]);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-bold flex items-center">
          <BarChart3 className="h-6 w-6 mr-2" />
          Dashboard
        </h1>
      </div>
      
      <PageHeader 
        showRefresh={true}
        onRefresh={handleRefresh}
        additionalButtons={
          isSyncRunning && (
            <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1 rounded-md h-9">
              <div className="animate-spin h-3 w-3 mr-2 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              <span className="text-xs">Synchronisierung läuft...</span>
            </div>
          )
        }
      />
        
      {/* Top-Level Metriken - 3 Kacheln nach neuen Anforderungen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kachel 1: Heutiger Umsatz und Anzahl Transaktionen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-primary" />
              Heutige Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Umsatz</div>
                <div className="text-2xl font-bold">{dailyRevenue.toFixed(2)} €</div>
                {revenueTrend !== 0 && (
                  <div className="flex items-center text-xs mt-1">
                    <span className={`${revenueTrend >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center`}>
                      {revenueTrend >= 0 ? '↑' : '↓'} {Math.abs(revenueTrend).toFixed(1)}%
                    </span>
                    <span className="ml-1 text-muted-foreground">vs. gestern</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Transaktionen</div>
                <div className="text-2xl font-bold">
                  {transactions?.filter(tx => {
                    const txDate = new Date(tx.datetime);
                    return txDate.toDateString() === today.toDateString();
                  }).length || 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kachel 2: Anzahl offene Lieferungen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Truck className="h-5 w-5 mr-2 text-primary" />
              Offene Lieferungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              <div className="text-3xl font-bold">{openOrders?.length || 0}</div>
              {openOrders && openOrders.length > 0 ? (
                <div className="mt-2 text-sm">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Nächste Lieferung:</span>
                    <span className="font-medium text-foreground">
                      {openOrders[0].expectedDeliveryDate ? 
                        formatDateTime(openOrders[0].expectedDeliveryDate, 'date') : 'Nicht angegeben'}
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => setLocation("/bestellungen")}
                  >
                    Bestellungen anzeigen
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">Keine offenen Lieferungen</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Kachel 3: Kritische Automaten */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
              Kritische Automaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {machines && machines.filter(m => m.status !== "active").length > 0 ? (
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {machines.filter(m => m.status !== "active").slice(0, 5).map((machine, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md border p-2">
                    <div className="font-medium truncate" title={machine.machineName}>
                      {machine.machineName}
                    </div>
                    <Badge variant="outline" className="bg-red-50 text-red-700">
                      {machine.status === "inactive" ? "Inaktiv" : 
                       machine.status === "error" ? "Fehler" : 
                       machine.status === "maintenance" ? "Wartung" : 
                       machine.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px]">
                <div className="text-lg font-medium text-green-600">Alle Automaten aktiv</div>
                <div className="text-sm text-muted-foreground">Keine kritischen Probleme</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wettervorhersage und Verkaufsprognose */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Wettervorhersage */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Cloud className="h-5 w-5 mr-2 text-primary" />
              Wettervorhersage
            </CardTitle>
            <CardDescription>Wetter für die nächsten 7 Tage</CardDescription>
          </CardHeader>
          <CardContent>
            <WeatherWidget className="h-full" forecastDays={7} />
          </CardContent>
        </Card>

        {/* Verkaufsprognosen */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-primary" />
              Verkaufsprognosen
            </CardTitle>
            <CardDescription>Voraussichtliche Verkäufe der nächsten 14 Tage</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDashboardForecasts ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : dashboardForecasts && Array.isArray(dashboardForecasts) && dashboardForecasts.length > 0 ? (
              <div className="space-y-4">
                {/* Prognose-Visualisierung */}
                <div className="border rounded-md overflow-hidden p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Array.isArray(dashboardForecasts) ? dashboardForecasts.slice(0, 14) : []} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          tick={{ fontSize: 11 }}
                          interval={1}
                        />
                        <YAxis hide />
                        <Tooltip
                          formatter={(value: number) => [Math.round(value) + ' Verkäufe', 'Prognose']}
                          labelFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        />
                        <Bar dataKey="predictedQuantity" fill="#6366f1" radius={[2, 2, 0, 0]}>
                          {Array.isArray(dashboardForecasts) && dashboardForecasts.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.isHoliday ? '#f97316' : '#6366f1'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex gap-3 flex-wrap">
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full bg-indigo-500 mr-1.5"></div>
                      <span>Reguläre Tage</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-1.5"></div>
                      <span>Feiertage</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-muted-foreground">
                  {!forecastModels || !Array.isArray(forecastModels) || forecastModels.length === 0
                    ? "Kein Prognosemodell vorhanden. Bitte initialisieren Sie ein Modell." 
                    : "Keine Prognosedaten verfügbar."}
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Initialisiere Prognosemodell...",
                        description: "Das kann einige Minuten dauern.",
                      });
                      const result = await initializeDefaultForecastModel();
                      if (result.success) {
                        toast({
                          title: "Prognosemodell initialisiert",
                          description: "Die Prognosen werden in Kürze verfügbar sein.",
                        });
                        await queryClient.invalidateQueries({ queryKey: ['/api/forecast/dashboard'] });
                      } else {
                        toast({
                          title: "Hinweis",
                          description: result.message || "Die Initialisierung wurde gestartet.",
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Fehler",
                        description: "Fehler bei der Initialisierung des Prognosemodells.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Automatisch erstellen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zahlungsmethoden nach Standort und Datenbankstatistiken nebeneinander */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Zahlungsmethoden nach Standort */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Zahlungsmethoden nach Standort
            </CardTitle>
            <CardDescription>Standorte mit niedrigstem Anteil kontaktloser Zahlung</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(locationPaymentMethods).length > 0 ? (
              <div className="space-y-6">
                {/* Sortieren nach niedrigstem Anteil an kontaktlosen Zahlungen und Filterung */}
                {Object.values(locationPaymentMethods)
                  .filter(stats => stats.total >= 5) // nur Standorte mit mindestens 5 Transaktionen
                  .sort((a, b) => a.cashlessPercentage - b.cashlessPercentage)
                  .slice(0, 5)
                  .map((machine, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate max-w-[70%]" title={machine.machineName}>
                          {machine.machineName}
                        </span>
                        <span className="font-medium">
                          {machine.cashlessPercentage.toFixed(1)}% kontaktlos
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div 
                          className="bg-blue-500 h-2.5 rounded-full" 
                          style={{ width: `${machine.cashlessPercentage}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{machine.cash} bar / {machine.cashless} kontaktlos</span>
                        <span>{machine.total} trans. gesamt</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Keine Daten verfügbar oder nicht genügend Daten für eine Analyse
              </div>
            )}
          </CardContent>
        </Card>

        {/* Datenbankstatistiken */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Database className="h-5 w-5 mr-2 text-primary" />
              Datenbankstatistiken
            </CardTitle>
            <CardDescription>
              Anzahl der Datensätze in den wichtigsten Tabellen
              {databaseStats && (
                <span className="text-xs ml-2">
                  (Letzte Aktualisierung: {formatDateTime(databaseStats.lastUpdated)})
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDatabaseStats ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : databaseStats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Transaktionen</div>
                  <div className="text-xl font-bold">{databaseStats.transactions?.toLocaleString('de-DE')}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Refills</div>
                  <div className="text-xl font-bold">{syncStatus?.refills?.count?.toLocaleString('de-DE') || "0"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Ereignisse</div>
                  <div className="text-xl font-bold">{syncStatus?.events?.count?.toLocaleString('de-DE') || "0"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Automaten</div>
                  <div className="text-xl font-bold">{databaseStats.machines?.toLocaleString('de-DE')}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Produkte</div>
                  <div className="text-xl font-bold">{databaseStats.products?.toLocaleString('de-DE')}</div>
                </div>
                <div className="col-span-1 md:col-span-3 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setLocation('/synchro')}
                  >
                    Synchronisation verwalten
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Keine Datenbankstatistiken verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Produkte */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <ShoppingBag className="h-5 w-5 mr-2 text-primary" />
            Top 10 Produkte
          </CardTitle>
          <CardDescription>Nach Verkaufszahlen sortiert</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(topProducts).length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-full bg-white border rounded-md">
                {/* Tabellenkopf */}
                <div className="grid grid-cols-4 border-b text-xs font-medium">
                  <div className="px-3 py-2">Produkt</div>
                  <div className="px-3 py-2 text-right">Trans.</div>
                  <div className="px-3 py-2 text-right">Umsatz</div>
                  <div className="px-3 py-2 text-right">Ergebnis</div>
                </div>
                
                {/* Tabelleninhalt */}
                <div className="max-h-[260px] overflow-y-auto">
                  {Object.entries(topProducts)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 10)
                    .map(([name, stats], index) => {
                      // Ergebnis berechnen (30% des Umsatzes als Beispiel)
                      const profit = stats.revenue * 0.3;
                      
                      return (
                        <div key={index} className="grid grid-cols-4 text-xs border-b hover:bg-muted/20">
                          <div className="px-3 py-2 font-medium truncate" title={name}>{name}</div>
                          <div className="px-3 py-2 text-right">{stats.count}</div>
                          <div className="px-3 py-2 text-right">{stats.revenue.toFixed(2)} €</div>
                          <div className="px-3 py-2 text-right text-green-600">{profit.toFixed(2)} €</div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Keine Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Top Automaten nach Umsatz */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-primary" />
            Top Automaten nach Umsatz
          </CardTitle>
          <CardDescription>Mit Transaktionen und Ergebnis</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(machineTransactions).length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-full bg-white border rounded-md">
                {/* Tabellenkopf */}
                <div className="grid grid-cols-4 border-b text-xs font-medium">
                  <div className="px-3 py-2">Automat</div>
                  <div className="px-3 py-2 text-right">Trans.</div>
                  <div className="px-3 py-2 text-right">Umsatz</div>
                  <div className="px-3 py-2 text-right">Ergebnis</div>
                </div>
                
                {/* Tabelleninhalt */}
                <div className="max-h-[260px] overflow-y-auto">
                  {Object.entries(machineTransactions)
                    .sort((a, b) => b[1].revenue - a[1].revenue)
                    .slice(0, 10)
                    .map(([name, stats], index) => {
                      // Ergebnis berechnen (30% des Umsatzes als Beispiel)
                      const profit = stats.revenue * 0.3;
                      
                      return (
                        <div key={index} className="grid grid-cols-4 text-xs border-b hover:bg-muted/20">
                          <div className="px-3 py-2 font-medium truncate" title={name}>{name}</div>
                          <div className="px-3 py-2 text-right">{stats.count}</div>
                          <div className="px-3 py-2 text-right">{stats.revenue.toFixed(2)} €</div>
                          <div className="px-3 py-2 text-right text-green-600">{profit.toFixed(2)} €</div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Keine Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Top 5 Entnommene Waren (Refill Removed) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <ShoppingBag className="h-5 w-5 mr-2 text-orange-500" />
            Top 5 Entnommene Waren
          </CardTitle>
          <CardDescription>Aus Nachfüllungen (Refills) mit Einkaufspreis</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRemovedProducts ? (
            <div className="text-center py-4 flex flex-col items-center">
              <div className="text-primary mb-2">
                <RefreshCw className="h-8 w-8 animate-spin opacity-50" />
              </div>
              <p className="text-sm text-muted-foreground">
                Lade Daten der entnommenen Waren...
              </p>
            </div>
          ) : Object.keys(refillRemovedItems).length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-full bg-white border rounded-md">
                {/* Tabellenkopf */}
                <div className="grid grid-cols-3 border-b text-xs font-medium">
                  <div className="px-3 py-2">Produkt</div>
                  <div className="px-3 py-2 text-right">Anzahl</div>
                  <div className="px-3 py-2 text-right">Einkaufspreis (ca.)</div>
                </div>
                
                {/* Tabelleninhalt */}
                <div className="max-h-[260px] overflow-y-auto">
                  {Object.entries(refillRemovedItems)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, count], index) => {
                      // Einkaufspreis schätzen (ca. 70% des Verkaufspreises)
                      const estimatedCost = (() => {
                        const matchingProduct = Object.entries(topProducts).find(([prodName]) => 
                          prodName.toLowerCase().includes(name.toLowerCase()) ||
                          name.toLowerCase().includes(prodName.toLowerCase())
                        );
                        
                        if (matchingProduct && matchingProduct[1]) {
                          const avgPrice = matchingProduct[1].revenue / matchingProduct[1].count;
                          return avgPrice * 0.7 * count;
                        }
                        return null;
                      })();
                      
                      return (
                        <div key={index} className="grid grid-cols-3 text-xs border-b hover:bg-muted/20">
                          <div className="px-3 py-2 font-medium truncate" title={name}>{name}</div>
                          <div className="px-3 py-2 text-right">{count.toString()}</div>
                          <div className="px-3 py-2 text-right">
                            {estimatedCost !== null 
                              ? `${estimatedCost.toFixed(2)} €` 
                              : "k.A."}
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Keine entnommenen Produkte in den Refill-Daten gefunden
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Neueste Transaktionen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Neueste Transaktionen
          </CardTitle>
          <CardDescription>Die letzten 10 Transaktionen im System</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium px-4 py-2">Datum & Zeit</th>
                    <th className="text-left font-medium px-4 py-2">Automat</th>
                    <th className="text-left font-medium px-4 py-2">Produkt</th>
                    <th className="text-right font-medium px-4 py-2">Preis</th>
                    <th className="text-right font-medium px-4 py-2">Zahlungsart</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions
                    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
                    .slice(0, 10)
                    .map((tx, index) => (
                    <tr key={index} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-2">{formatDateTime(tx.datetime)}</td>
                      <td className="px-4 py-2 truncate max-w-[160px]" title={tx.machineName}>
                        {tx.machineName}
                      </td>
                      <td className="px-4 py-2 truncate max-w-[180px]" title={tx.productName}>
                        {tx.productName}
                      </td>
                      <td className="px-4 py-2 text-right">{tx.price?.toFixed(2)} €</td>
                      <td className="px-4 py-2 text-right">
                        <Badge variant={tx.paymentMethod === 'CASH' ? 'outline' : 'secondary'}>
                          {tx.paymentMethod === 'CASH' ? 'Bar' : 'Karte'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Keine Transaktionen verfügbar
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={() => setLocation('/transactions')} 
              variant="outline" 
              size="sm"
              className="gap-1"
            >
              <ArrowUpRight className="h-4 w-4" />
              Alle Transaktionen anzeigen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
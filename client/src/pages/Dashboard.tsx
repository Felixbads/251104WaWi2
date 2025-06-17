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
  ArrowUpRight,
  AlertTriangle,
  Coffee
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import WeatherWidget from "@/components/weather/WeatherWidget";
import { SyncStatusWidget } from "@/components/SyncStatusWidget";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
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
import TopRemovedProductsTile from "@/components/TopRemovedProductsTile";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  // Wenn nicht authentifiziert, zeigen wir stattdessen die Login-Komponente an
  if (!isAuthenticated) {
    return <Login />;
  }

  // Fetch data for metrics
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(500),
  });

  // Debug: Log transaction data structure
  React.useEffect(() => {
    if (transactions) {
      console.log('Dashboard transactions data:', {
        type: typeof transactions,
        isArray: Array.isArray(transactions),
        length: Array.isArray(transactions) ? transactions.length : 'not array',
        firstItem: Array.isArray(transactions) && transactions.length > 0 ? transactions[0] : null
      });
    }
  }, [transactions]);

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

  // Verschickte aber noch nicht gelieferte Bestellungen für die Dashboard-Ansicht
  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000 // Jede Minute aktualisieren
  });

  // Kritische Automaten mit Warnungen oder Fehlern vom Standort-Status
  const { data: locationStatus, isLoading: isLoadingLocationStatus } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: async () => {
      const response = await fetch('/api/location-status');
      if (!response.ok) {
        throw new Error('Failed to fetch machine status data');
      }
      return response.json();
    },
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren für aktuelle Daten
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

  // Kritische Bestände für das Dashboard
  const { data: criticalInventory, isLoading: isLoadingCriticalInventory } = useQuery({
    queryKey: ['/api/critical-inventory/dashboard-summary'],
    queryFn: async () => {
      const response = await fetch('/api/critical-inventory/dashboard-summary');
      if (!response.ok) throw new Error('Fehler beim Laden der kritischen Bestände');
      return response.json();
    },
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
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
    const productName = tx.productName || 'Unbekanntes Produkt';
    if (!acc[productName]) {
      acc[productName] = { count: 0, revenue: 0 };
    }
    acc[productName].count += 1;
    acc[productName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};

  // Debug Top Products
  React.useEffect(() => {
    console.log('Top Products check:', {
      hasTopProducts: !!topProducts,
      keyCount: Object.keys(topProducts).length,
      isObject: typeof topProducts === 'object',
      firstProduct: Object.entries(topProducts)[0]
    });
    if (Object.keys(topProducts).length > 0) {
      console.log('Top Products calculated:', Object.keys(topProducts).length, 'products');
      console.log('First 3 products:', Object.entries(topProducts).slice(0, 3));
    }
  }, [topProducts]);

  // Debug Transactions
  React.useEffect(() => {
    console.log('Transactions check:', {
      hasTransactions: !!transactions,
      isArray: Array.isArray(transactions),
      length: transactions?.length,
      isLoading: isLoadingTransactions,
      firstTransaction: transactions?.[0]
    });
  }, [transactions, isLoadingTransactions]);

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

  // Top 5 verkaufte Waren - aus Transaktionsdaten (letzte 7 Tage)
  const refillRemovedItems = React.useMemo<Record<string, number>>(() => {
    if (!transactions || !Array.isArray(transactions)) return {};

    // Filter transactions from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentTransactions = transactions.filter((tx: any) => {
      const txDate = new Date(tx.datetime);
      return txDate >= sevenDaysAgo && tx.productName;
    });

    // Count products sold
    const productCounts: Record<string, number> = {};
    recentTransactions.forEach((tx: any) => {
      if (tx.productName) {
        productCounts[tx.productName] = (productCounts[tx.productName] || 0) + (tx.quantity || 1);
      }
    });

    return productCounts;
  }, [transactions]);

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
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Nichts oder Datum */}
        <div className="flex-grow flex items-center">
          {isSyncRunning && (
            <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1 rounded-md h-9">
              <div className="animate-spin h-3 w-3 mr-2 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              <span className="text-xs">Synchronisierung läuft...</span>
            </div>
          )}
        </div>

        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-9"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

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

        {/* Kachel 2: Verschickte aber noch nicht gelieferte Bestellungen */}
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
                <div className="mt-2 space-y-2">
                  {openOrders.slice(0, 3).map((order, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2 rounded border hover:bg-gray-50 cursor-pointer"
                      onClick={() => setLocation(`/wareneingang/${order.id}`)}
                    >
                      <div className="flex flex-col text-xs">
                        <span className="font-medium">{order.orderNumber}</span>
                        <span className="text-muted-foreground">{order.supplierName}</span>
                      </div>
                      <div className="text-xs text-right">
                        <div className="font-medium">
                          {order.expectedDeliveryDate ? 
                            formatDateTime(order.expectedDeliveryDate, 'date') : 'Offen'}
                        </div>
                        <div className="text-muted-foreground">
                          {order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {openOrders.length > 3 && (
                    <div className="text-center pt-1">
                      <button 
                        onClick={() => setLocation("/bestellungen/neu-v2")}
                        className="text-xs text-primary hover:underline"
                      >
                        Alle {openOrders.length} Lieferungen anzeigen
                      </button>
                    </div>
                  )}
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
            {locationStatus && locationStatus.filter(m => m.status === "warning" || m.status === "error").length > 0 ? (
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {locationStatus.filter(m => m.status === "warning" || m.status === "error").slice(0, 5).map((machine, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between rounded-md border p-2 cursor-pointer hover:bg-gray-50"
                    onClick={() => setLocation(`/automaten/${machine.id}`)}
                  >
                    <div className="font-medium truncate" title={machine.machineName}>
                      {machine.machineName}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className={machine.status === "error" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}>
                        {machine.status === "error" ? "Fehler" : "Warnung"}
                      </Badge>
                      {machine.warnings && machine.warnings.length > 0 && (
                        <span className="text-xs text-muted-foreground" title={machine.warnings.join(", ")}>
                          {machine.warnings[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {locationStatus.filter(m => m.status === "warning" || m.status === "error").length > 5 && (
                  <div className="text-center pt-2">
                    <button 
                      onClick={() => setLocation("/standort-status")}
                      className="text-sm text-primary hover:underline"
                    >
                      Alle {locationStatus.filter(m => m.status === "warning" || m.status === "error").length} kritischen Automaten anzeigen
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px]">
                <div className="text-lg font-medium text-green-600">Alle Automaten OK</div>
                <div className="text-sm text-muted-foreground">Keine Warnungen oder Fehler</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kachel 4: Kritische Bestände */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-orange-500" />
              Kritische Lagerbestände
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCriticalInventory ? (
              <div className="flex items-center justify-center h-[120px]">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : criticalInventory && (criticalInventory.totalCritical > 0 || criticalInventory.totalCriticalItems > 0) ? (
              <div className="space-y-2">
                <div className="text-3xl font-bold text-orange-600">
                  {criticalInventory.totalCriticalItems || criticalInventory.totalCritical || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Produkte benötigen Nachbestellung
                </div>
                {criticalInventory.byWarehouse && criticalInventory.byWarehouse.length > 0 && (
                  <div className="space-y-1 max-h-[80px] overflow-y-auto">
                    {criticalInventory.byWarehouse.slice(0, 3).map((warehouse: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{warehouse.warehouseName}</span>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700">
                          {warehouse.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => setLocation("/kritische-bestaende")}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    Details anzeigen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px]">
                <div className="text-lg font-medium text-green-600">Alle Bestände OK</div>
                <div className="text-sm text-muted-foreground">Keine kritischen Bestände</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kachel 5: Häufigste Entnahmen */}
        <TopRemovedProductsTile />
      </div>

      {/* Wetter und Prognosen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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
                <div className="border rounded-md overflow-hidden p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-sm font-medium">14-Tage Prognose</h4>
                      <p className="text-xs text-muted-foreground">Voraussichtliche Verkäufe für die nächsten 14 Tage</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-1"
                      onClick={() => location.href = "/forecast-detail"}
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Detailanalyse</span>
                    </Button>
                  </div>
                  <div className="h-48 cursor-pointer" onClick={() => location.href = "/forecast-detail"}>
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
          {!isLoadingTransactions && transactions && transactions.length > 0 && topProducts && Object.keys(topProducts).length > 0 ? (
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
            Top 5 verkaufte Waren (letzte 7 Tage)
          </CardTitle>
          <CardDescription>Aus Verkaufsdaten mit geschätztem Einkaufspreis</CardDescription>
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
              Keine Verkaufsdaten in den letzten 7 Tagen gefunden
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aktive Automaten (letzte 7 Tage) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Coffee className="h-5 w-5 mr-2 text-blue-500" />
            Aktive Automaten (letzte 7 Tage)
          </CardTitle>
          <CardDescription>Automaten mit Produktentnahmen und Anzahl der verkauften Produkte</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : (() => {
            // Calculate machines with removals in last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const machineActivity = transactions
              ?.filter((tx: any) => {
                const txDate = new Date(tx.datetime);
                return txDate >= sevenDaysAgo && tx.productName && tx.machineName;
              })
              .reduce((acc: Record<string, { machineId: number; machineName: string; count: number; revenue: number; products: Set<string> }>, tx: any) => {
                const key = tx.machineName;
                if (!acc[key]) {
                  acc[key] = {
                    machineId: tx.machineId,
                    machineName: tx.machineName,
                    count: 0,
                    revenue: 0,
                    products: new Set()
                  };
                }
                acc[key].count += tx.quantity || 1;
                acc[key].revenue += tx.price || 0;
                acc[key].products.add(tx.productName);
                return acc;
              }, {}) || {};

            const activeMachines = Object.values(machineActivity)
              .sort((a, b) => b.count - a.count);

            return activeMachines.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-full bg-white border rounded-md">
                  {/* Header */}
                  <div className="grid grid-cols-4 border-b text-xs font-medium">
                    <div className="px-3 py-2">Automat</div>
                    <div className="px-3 py-2 text-right">Verkäufe</div>
                    <div className="px-3 py-2 text-right">Produktarten</div>
                    <div className="px-3 py-2 text-right">Umsatz</div>
                  </div>

                  {/* Content */}
                  <div className="max-h-[300px] overflow-y-auto">
                    {activeMachines.map((machine, index) => (
                      <div 
                        key={index} 
                        className="grid grid-cols-4 text-xs border-b hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => {
                          // Navigate to machine detail view with machine ID
                          window.location.href = `/machines/${machine.machineId}`;
                        }}
                        title={`Klicken um Details zu ${machine.machineName} anzuzeigen`}
                      >
                        <div className="px-3 py-2 font-medium truncate">{machine.machineName}</div>
                        <div className="px-3 py-2 text-right">{machine.count}</div>
                        <div className="px-3 py-2 text-right">{machine.products.size}</div>
                        <div className="px-3 py-2 text-right">{machine.revenue.toFixed(2)} €</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Keine aktiven Automaten in den letzten 7 Tagen
              </div>
            );
          })()}
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
          ) : transactions && Array.isArray(transactions) && transactions.length > 0 ? (
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

      {/* Sync- und Datenbankstatistiken am Ende */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Synchronisierungsstatus */}
        <div>
          <SyncStatusWidget />
        </div>
        
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
    </div>
  );
}
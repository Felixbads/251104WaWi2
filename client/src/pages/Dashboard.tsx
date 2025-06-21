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

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(500),
    enabled: isAuthenticated,
  });

  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
    enabled: isAuthenticated,
  });

  const { data: events, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['/api/events'],
    queryFn: () => getEvents(10),
    enabled: isAuthenticated,
  });

  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: () => getSyncStatus(),
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000,
    enabled: isAuthenticated,
  });

  const { data: locationStatus, isLoading: isLoadingLocationStatus } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: async () => {
      const response = await fetch('/api/location-status');
      if (!response.ok) {
        throw new Error('Failed to fetch machine status data');
      }
      return response.json();
    },
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { data: forecastModels, isLoading: isLoadingForecastModels } = useQuery({
    queryKey: ['/api/forecast/models'],
    queryFn: () => getForecastModels(),
    refetchInterval: 300000,
    enabled: isAuthenticated,
  });

  const { data: dashboardForecasts, isLoading: isLoadingDashboardForecasts } = useQuery({
    queryKey: ['/api/forecast/dashboard'],
    queryFn: () => getDashboardForecasts(),
    refetchInterval: 300000,
    enabled: isAuthenticated,
  });

  const { data: databaseStats, isLoading: isLoadingDatabaseStats } = useQuery({
    queryKey: ['/api/statistics/database'],
    queryFn: () => getDatabaseStatistics(),
    refetchInterval: 60000,
    enabled: isAuthenticated,
  });

  const { data: refillData, isLoading: isLoadingRefills } = useQuery({
    queryKey: ['/api/refills'],
    queryFn: () => getRefills({ 
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      limit: 100
    }),
    enabled: isAuthenticated,
  });

  const { data: criticalInventory, isLoading: isLoadingCriticalInventory } = useQuery({
    queryKey: ['/api/critical-inventory/dashboard-summary'],
    queryFn: async () => {
      const response = await fetch('/api/critical-inventory/dashboard-summary');
      if (!response.ok) throw new Error('Fehler beim Laden der kritischen Bestände');
      return response.json();
    },
    refetchInterval: 300000,
    enabled: isAuthenticated,
  });

  const { data: removedProductsData, isLoading: isLoadingRemovedProducts } = useQuery({
    queryKey: ['/api/removed-products'],
    queryFn: () => fetch('/api/removed-products').then(res => res.json()),
    refetchInterval: 300000,
    enabled: isAuthenticated,
  });

  // Wenn nicht authentifiziert, zeigen wir stattdessen die Login-Komponente an
  if (!isAuthenticated) {
    return <Login />;
  }

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

  // Synchronisationsstatus
  const getLatestSyncTime = () => {
    if (!syncStatus) return null;

    const timestamps = [
      syncStatus.machines?.lastSync,
      syncStatus.transactions?.lastSync,
      syncStatus.products?.lastSync,
      syncStatus.events?.lastSync
    ].filter(Boolean);

    if (timestamps.length === 0) return null;

    return new Date(Math.max(...timestamps.map(t => new Date(t).getTime())));
  };

  const latestSync = getLatestSyncTime();

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Dashboard" 
        description="Überblick über Ihre Verkaufsautomaten und wichtige Kennzahlen"
      />

      {/* Metriken-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tageseinnahmen */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heutige Einnahmen</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dailyRevenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
            <p className="text-xs text-muted-foreground">
              {revenueTrend > 0 ? '+' : ''}{revenueTrend.toFixed(1)}% vs. gestern
            </p>
          </CardContent>
        </Card>

        {/* Aktive Maschinen */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktive Automaten</CardTitle>
            <Coffee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMachines}</div>
            <p className="text-xs text-muted-foreground">
              von {totalMachines} Automaten
            </p>
          </CardContent>
        </Card>

        {/* Offene Bestellungen */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Bestellungen</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openOrders?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Wartend auf Lieferung
            </p>
          </CardContent>
        </Card>

        {/* Letzte Synchronisation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Letzte Synchronisation</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestSync ? formatDateTime(latestSync) : 'Unbekannt'}
            </div>
            <p className="text-xs text-muted-foreground">
              Daten-Update
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <WeatherWidget />
        <SyncStatusWidget />
        
        {/* Kritische Bestände */}
        {criticalInventory && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Kritische Bestände
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {criticalInventory.items?.slice(0, 5).map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm">{item.productName}</span>
                    <span className="text-sm font-medium text-orange-600">
                      {item.currentStock} / {item.minStock}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weitere Dashboard-Komponenten können hier hinzugefügt werden */}
    </div>
  );
}
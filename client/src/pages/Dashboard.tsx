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
  Coffee,
  Users,
  DollarSign
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import WeatherWidget from "@/components/weather/WeatherWidget";
import { SyncStatusWidget } from "@/components/SyncStatusWidget";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import TransactionsTable from "@/components/tables/TransactionsTable";
import TopRemovedProductsTile from "@/components/TopRemovedProductsTile";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";

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

  // Top Produkte berechnen
  const topProducts = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    const productName = tx.productName || 'Unbekannt';
    if (!acc[productName]) {
      acc[productName] = { count: 0, revenue: 0 };
    }
    acc[productName].count += 1;
    acc[productName].revenue += tx.price || 0;
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
    const key = tx.machineName || 'Unbekannt';
    if (!acc[key]) {
      acc[key] = { machineName: key, cash: 0, cashless: 0, total: 0, cashlessPercentage: 0 };
    }
    
    acc[key].total += 1;
    if (tx.paymentMethod === 'cash') {
      acc[key].cash += 1;
    } else {
      acc[key].cashless += 1;
    }
    
    acc[key].cashlessPercentage = acc[key].total > 0 ? (acc[key].cashless / acc[key].total) * 100 : 0;
    return acc;


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

  // Datenaufbereitung für Charts
  const chartData = Object.entries(topProducts)
    .sort(([,a], [,b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([name, data]) => ({
      name: name.length > 20 ? name.substring(0, 20) + '...' : name,
      umsatz: data.revenue,
      verkäufe: data.count
    }));

  const machineChartData = Object.entries(machineTransactions)
    .sort(([,a], [,b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([name, data]) => ({
      name: name.length > 15 ? name.substring(0, 15) + '...' : name,
      umsatz: data.revenue,
      transaktionen: data.count
    }));

  const paymentMethodData = Object.values(locationPaymentMethods)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map(location => ({
      name: location.machineName.length > 15 ? location.machineName.substring(0, 15) + '...' : location.machineName,
      bargeld: location.cash,
      kartenzahlung: location.cashless,
      kartenzahlungAnteil: location.cashlessPercentage
    }));

  // Kritische Automaten mit Warnungen
  const criticalMachines = locationStatus?.filter((machine: any) => 
    machine.warnings && machine.warnings.length > 0
  ) || [];

  return (
    <div className="space-y-6">

      {/* Metriken-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tageseinnahmen */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heutige Einnahmen</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
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
            <div className="text-sm font-medium">
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

      {/* Charts und Detailanalysen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Produkte Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Produkte nach Umsatz</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="umsatz" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Maschinen Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Automaten nach Umsatz</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={machineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="umsatz" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weitere Dashboard-Komponenten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kritische Automaten */}
        {criticalMachines.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Automaten mit Warnungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {criticalMachines.slice(0, 5).map((machine: any) => (
                  <div key={machine.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{machine.machineName}</div>
                      <div className="text-sm text-gray-600">
                        {machine.warnings.length} Warnung(en)
                      </div>
                    </div>
                    <Badge variant="outline" className="text-red-600">
                      {machine.warnings[0]?.type || 'Warnung'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Entfernte Produkte */}
        <TopRemovedProductsTile />
      </div>

      {/* Letzte Transaktionen */}
      <Card>
        <CardHeader>
          <CardTitle>Letzte Transaktionen</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsTable 
            transactions={transactions?.slice(0, 10) || []} 
            isLoading={isLoadingTransactions}
            showPagination={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, 
  Package, 
  DollarSign, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard,
  BarChart3,
  Percent,
  Truck,
  ArrowUpRight,
  Clock,
  Cloud
} from "lucide-react";
import SyncStatusCard from "@/components/dashboard/SyncStatusCard";
import MetricCard from "@/components/dashboard/MetricCard";
import MetricsTimeRangeCard from "@/components/dashboard/MetricsTimeRangeCard";
import TimeRangeFilter from "@/components/dashboard/TimeRangeFilter";
import TransactionsTable from "@/components/tables/TransactionsTable";
import SyncLogTable from "@/components/tables/SyncLogTable";
import SystemAlerts from "@/components/notifications/SystemAlerts";
import WeatherWidget from "@/components/weather/WeatherWidget";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTransactions, getMachines, getEvents, getSyncStatus, getOpenOrders, formatDateTime, getForecastModels } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch data for metrics
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(50),
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
    refetchInterval: 30000, // Alle 30 Sekunden aktualisieren
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
    queryFn: () => fetch('/api/forecast/models').then(res => res.json()),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });

  // Handle settings click
  const handleSettingsClick = () => {
    setLocation("/settings");
  };

  // Handle view errors click
  const handleViewErrorsClick = () => {
    setLocation("/events");
  };

  // Berechne aktuelle Metriken aus realen Daten
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  // Transaktionen
  const totalTransactions = transactions?.length || 0;
  
  // Maschinen-Statistiken
  const activeMachines = machines?.filter(m => m.status === "active").length || 0;
  const totalMachines = machines?.length || 0;
  const machineStatuses = machines?.reduce((acc: Record<string, number>, machine) => {
    acc[machine.status] = (acc[machine.status] || 0) + 1;
    return acc;
  }, {}) || {};

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

  // Offene Fehler/Warnungen
  const openErrors = events?.filter(e => 
    e.status === "open" && 
    (e.severity === "error" || e.severity === "warning")
  ).length || 0;
  
  // Zahlungsmethoden
  const paymentMethods = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.paymentMethod]) {
      acc[tx.paymentMethod] = { count: 0, revenue: 0 };
    }
    acc[tx.paymentMethod].count += 1;
    acc[tx.paymentMethod].revenue += tx.price || 0;
    return acc;
  }, {}) || {};
  
  // Top Produkte
  const topProducts = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.productName]) {
      acc[tx.productName] = { count: 0, revenue: 0 };
    }
    acc[tx.productName].count += 1;
    acc[tx.productName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};
  
  // Top 5 Produkte nach Anzahl
  const topProductsList = Object.entries(topProducts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      revenue: stats.revenue
    }));
  
  // Top 5 Maschinen nach Transaktionen
  const machineTransactions = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.machineName]) {
      acc[tx.machineName] = { count: 0, revenue: 0 };
    }
    acc[tx.machineName].count += 1;
    acc[tx.machineName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};
  
  const topMachinesList = Object.entries(machineTransactions)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      revenue: stats.revenue
    }));

  // Gesamtumsatz
  const totalRevenue = transactions?.reduce((sum, tx) => sum + (tx.price || 0), 0) || 0;
  
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500">
            Übersicht aller Automaten und Transaktionen
            {latestSyncTime && (
              <span className="text-xs ml-2">
                (Letzte Aktualisierung: {formatDateTime(latestSyncTime)})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {isSyncRunning && (
            <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1 rounded-md">
              <div className="animate-spin h-3 w-3 mr-2 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              <span>Synchronisierung läuft...</span>
            </div>
          )}
        </div>
      </div>

      {/* Metriken mit Zeitraumfilter */}
      <MetricsTimeRangeCard 
        transactions={transactions || []} 
        isLoading={isLoadingTransactions}
        className="mb-4"
      />
        
      {/* Top-Level Metriken */}
      <div className="kpi-grid">
        {/* Umsatz KPI */}
        <div className="kpi-card umsatz">
          <div className="kpi-label">Umsatz</div>
          <div className="kpi-value">{totalRevenue.toFixed(0)} €</div>
        </div>

        {/* Transaktionen KPI */}
        <div className="kpi-card transaktionen">
          <div className="kpi-label">Transaktionen</div>
          <div className="kpi-value">{totalTransactions}</div>
        </div>

        {/* Durchschnitt KPI */}
        <div className="kpi-card durchschnitt">
          <div className="kpi-label">Durchschnitt</div>
          <div className="kpi-value">
            {totalTransactions > 0 
              ? (totalRevenue / totalTransactions).toFixed(2)
              : "0.00"} €
          </div>
        </div>

        {/* Automaten KPI */}
        <div className="kpi-card statistik">
          <div className="kpi-label">Aktive Automaten</div>
          <div className="kpi-value">{activeMachines} / {totalMachines}</div>
        </div>
      </div>

      {/* Tabs für verschiedene Ansichten */}
      <Tabs defaultValue="overview" className="mt-6">
        <div className="border-b border-[var(--border-light)]">
          <TabsList className="bg-transparent">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-[var(--proviant-rot)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--proviant-rot)] data-[state=active]:shadow-none rounded-none px-4 py-2">Übersicht</TabsTrigger>
            <TabsTrigger value="sales" className="data-[state=active]:bg-white data-[state=active]:text-[var(--proviant-rot)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--proviant-rot)] data-[state=active]:shadow-none rounded-none px-4 py-2">Verkäufe</TabsTrigger>
            <TabsTrigger value="machines" className="data-[state=active]:bg-white data-[state=active]:text-[var(--proviant-rot)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--proviant-rot)] data-[state=active]:shadow-none rounded-none px-4 py-2">Automaten</TabsTrigger>
            <TabsTrigger value="system" className="data-[state=active]:bg-white data-[state=active]:text-[var(--proviant-rot)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--proviant-rot)] data-[state=active]:shadow-none rounded-none px-4 py-2">System</TabsTrigger>
          </TabsList>
        </div>
        
        {/* Übersichts-Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top-Produkte nach Verkaufszahlen */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <ShoppingBag className="h-5 w-5 mr-2 text-primary" />
                  Top Produkte
                </CardTitle>
                <CardDescription>Die 5 meistverkauften Produkte</CardDescription>
              </CardHeader>
              <CardContent>
                {topProductsList.length > 0 ? (
                  <div className="space-y-4">
                    {topProductsList.map((product, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium truncate" title={product.name}>
                            {product.name}
                          </span>
                          <span className="font-medium">{product.count}x</span>
                        </div>
                        <Progress value={product.count / topProductsList[0].count * 100} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    Keine Daten verfügbar
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Top-Automaten nach Umsatz */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-primary" />
                  Top Automaten
                </CardTitle>
                <CardDescription>Die 5 umsatzstärksten Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                {topMachinesList.length > 0 ? (
                  <div className="space-y-4">
                    {topMachinesList.map((machine, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium truncate" title={machine.name}>
                            {machine.name}
                          </span>
                          <span className="font-medium">{machine.revenue.toFixed(2)} €</span>
                        </div>
                        <Progress value={machine.revenue / topMachinesList[0].revenue * 100} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    Keine Daten verfügbar
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Wettervorhersage */}
            <div className="md:col-span-1">
              <WeatherWidget className="h-full" forecastDays={7} />
            </div>
          </div>
          
          {/* Anstehende Lieferungen */}
          <div className="bg-[var(--section-bg)] rounded-xl p-6 shadow-sm border border-[var(--border-light)]">
            <div className="flex items-center mb-4">
              <div className="bg-[var(--proviant-rot)] p-2 rounded-lg mr-3">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-schwarz)]">Anstehende Lieferungen</h2>
                <p className="text-[var(--text-grau)] text-sm">Offene Bestellungen mit erwartetem Liefertermin</p>
              </div>
            </div>
            
            <div className="mt-4">
              {openOrders && openOrders.length > 0 ? (
                <div className="space-y-5">
                  {openOrders.map((order) => (
                    <div key={order.id} className="border border-[var(--kachel-beige)] rounded-lg p-4 space-y-3 hover:bg-[var(--hintergrund)]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-[var(--text-schwarz)]">{order.orderNumber}</div>
                          <div className="text-sm text-[var(--text-grau)]">{order.supplierName}</div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          order.status === "open" ? "bg-[var(--kachel-beige)] text-[var(--text-schwarz)]" :
                          order.status === "ordered" ? "bg-[var(--kachel-rot)] text-[var(--weiss)]" :
                          order.status === "partial" ? "bg-[var(--kachel-orange)] text-[var(--weiss)]" :
                          order.status === "delivered" ? "bg-[var(--kachel-gruen)] text-[var(--weiss)]" :
                          "bg-[var(--kachel-beige)] text-[var(--text-schwarz)]"
                        }`}>
                          {order.status === "open" ? "Offen" :
                           order.status === "ordered" ? "Bestellt" :
                           order.status === "partial" ? "Teilgeliefert" :
                           order.status === "delivered" ? "Geliefert" :
                           order.status}
                        </div>
                      </div>
                      
                      <div className="text-sm text-[var(--text-grau)]">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>
                            Erwartete Lieferung: {order.expectedDeliveryDate ? 
                              formatDateTime(order.expectedDeliveryDate, 'date') : 'Nicht angegeben'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Package className="h-4 w-4" />
                          <span>Positionen: {order.itemCount || 0}</span>
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-2">
                        <button 
                          className="button text-sm flex items-center gap-1"
                          onClick={() => setLocation(`/bestellungen/${order.id}/wareneingang`)}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          Warenannahme starten
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--text-grau)]">
                  Keine anstehenden Lieferungen
                </div>
              )}
            </div>
          </div>

          {/* Zahlungsmethoden nach Standort */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-[var(--border-light)]">
            <div className="flex items-center mb-4">
              <div className="bg-[var(--kachel-transaktionen)] p-2 rounded-lg mr-3">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-schwarz)]">Zahlungsmethoden nach Standort</h2>
                <p className="text-[var(--text-grau)] text-sm">Standorte mit niedrigstem Anteil kontaktloser Zahlung</p>
              </div>
            </div>
            
            <div className="mt-4">
              {Object.keys(paymentMethods).length > 0 ? (
                <div className="space-y-6">
                  {/* Analyse der Zahlungsmethoden nach Maschine/Standort */}
                  {(() => {
                    // Berechne die Zahlungsmethoden pro Standort
                    const machinePaymentStats = transactions?.reduce((acc: Record<string, {
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
                      
                      return acc;
                    }, {}) || {};
                    
                    // Berechne den Prozentsatz für kontaktlose Zahlung
                    Object.values(machinePaymentStats).forEach(stats => {
                      stats.cashlessPercentage = stats.total > 0 
                        ? (stats.cashless / stats.total) * 100 
                        : 0;
                    });
                    
                    // Sortiere nach niedrigstem Anteil an kontaktlosen Zahlungen
                    // und filtere Standorte mit mindestens 5 Transaktionen
                    const sortedMachines = Object.values(machinePaymentStats)
                      .filter(stats => stats.total >= 5)
                      .sort((a, b) => a.cashlessPercentage - b.cashlessPercentage)
                      .slice(0, 5);
                    
                    return sortedMachines.length > 0 ? (
                      sortedMachines.map((machine, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium truncate max-w-[70%] text-[var(--text-schwarz)]" title={machine.machineName}>
                              {machine.machineName}
                            </span>
                            <span className="font-semibold text-sm text-[var(--kachel-orange)]">
                              {machine.cashlessPercentage.toFixed(1)}% kontaktlos
                            </span>
                          </div>
                          <div className="w-full bg-[var(--hintergrund)] rounded-full h-2.5">
                            <div 
                              className="bg-[var(--kachel-orange)] h-2.5 rounded-full" 
                              style={{ width: `${machine.cashlessPercentage}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-[var(--text-grau)] mt-1">
                            <span>{machine.cash} bar / {machine.cashless} kontaktlos</span>
                            <span>{machine.total} trans. gesamt</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-[var(--text-grau)]">
                        Nicht genügend Daten für eine Analyse
                      </div>
                    );
                  })()}
                  
                  {/* Zusammenfassung der Zahlungsmethoden insgesamt */}
                  <div className="mt-6 pt-4 border-t border-[var(--kachel-beige)]">
                    <div className="font-semibold mb-3 text-[var(--text-schwarz)]">Gesamtverteilung Zahlungsmethoden</div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {Object.entries(paymentMethods).map(([method, stats], index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-[var(--text-schwarz)]">
                              {method === "CASH" ? "Bargeld" : 
                               method === "CASHLESS" ? "Kartenzahlung" :
                               method}
                            </span>
                            <span className="font-semibold text-sm text-[var(--kachel-rot)]">
                              {(stats.count / totalTransactions * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-[var(--hintergrund)] rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${method === "CASH" ? "bg-[var(--kachel-rot)]" : "bg-[var(--kachel-gruen)]"}`}
                              style={{ width: `${stats.count / totalTransactions * 100}%` }}
                            ></div>
                          </div>
                          <div className="text-right text-xs text-[var(--text-grau)]">
                            {stats.count} Trans. / {stats.revenue.toFixed(2)} €
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--text-grau)]">
                  Keine Daten verfügbar
                </div>
              )}
            </div>
          </div>
          
          {/* Verkaufsprognosen */}
          <div className="bg-[var(--section-bg)] rounded-xl p-6 shadow-sm border border-[var(--border-light)]">
            <div className="flex items-center mb-4">
              <div className="bg-[var(--kachel-durchschnitt)] p-2 rounded-lg mr-3">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-schwarz)]">Verkaufsprognosen</h2>
                <p className="text-[var(--text-grau)] text-sm">Status der Prognosemodelle und aktuelle Vorhersagen</p>
              </div>
            </div>
            <div className="mt-4">
              {isLoadingForecastModels ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-[var(--proviant-rot)] border-t-transparent rounded-full"></div>
                </div>
              ) : forecastModels && Array.isArray(forecastModels) && forecastModels.length > 0 ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {forecastModels
                      .filter((model: any) => model.status === 'ready')
                      .slice(0, 2)
                      .map((model: any, index: number) => (
                        <div key={index} className="border-[var(--kachel-beige)] border bg-[var(--weiss)] rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-[var(--text-schwarz)]">{model.name}</h4>
                            <div className="px-3 py-1 rounded-full bg-[var(--kachel-gruen)] text-[var(--weiss)] text-xs font-semibold">
                              {(model.accuracy * 100).toFixed(1)}% Genauigkeit
                            </div>
                          </div>
                          <div className="text-sm text-[var(--text-grau)]">
                            Letzte Aktualisierung: {formatDateTime(model.updatedAt)}
                          </div>
                          <div className="flex gap-3 mt-3">
                            <button 
                              className="button secondary text-sm"
                              onClick={() => setLocation(`/forecast?modelId=${model.id}`)}
                            >
                              Details anzeigen
                            </button>
                            <button 
                              className="button text-sm"
                              onClick={() => setLocation(`/bestellungen/neu?mode=forecast&modelId=${model.id}`)}
                            >
                              Bestellung erstellen
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="flex justify-end mt-3">
                    <button 
                      className="flex items-center text-[var(--proviant-rot)] font-medium text-sm gap-1 hover:underline"
                      onClick={() => setLocation('/forecast')}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      Alle Prognosemodelle anzeigen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-[var(--text-grau)]">Keine aktiven Prognosemodelle</p>
                  <button 
                    className="button mt-3"
                    onClick={() => setLocation('/forecast')}
                  >
                    Prognosemodell erstellen
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Letzte Transaktionen */}
          <TransactionsTable />
        </TabsContent>
        
        {/* Verkaufs-Tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-primary" />
                  Transaktionen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalTransactions}</div>
                <p className="text-sm text-gray-500 mt-1">Gesamt</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-primary" />
                  Umsatz
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalRevenue.toFixed(2)} €</div>
                <p className="text-sm text-gray-500 mt-1">Gesamt</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Percent className="h-5 w-5 mr-2 text-primary" />
                  Durchschnitt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {totalTransactions > 0 
                    ? (totalRevenue / totalTransactions).toFixed(2) 
                    : "0.00"} €
                </div>
                <p className="text-sm text-gray-500 mt-1">Pro Transaktion</p>
              </CardContent>
            </Card>
          </div>
          
          <TransactionsTable />
        </TabsContent>
        
        {/* Automaten-Tab */}
        <TabsContent value="machines" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Package className="h-5 w-5 mr-2 text-primary" />
                  Automaten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalMachines}</div>
                <p className="text-sm text-gray-500 mt-1">Gesamt</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
                  Aktiv
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-500">{activeMachines}</div>
                <p className="text-sm text-gray-500 mt-1">
                  {totalMachines > 0 
                    ? `${(activeMachines / totalMachines * 100).toFixed(0)}% aller Automaten`
                    : "Keine Automaten vorhanden"}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2 text-amber-500" />
                  Inaktiv
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-500">{totalMachines - activeMachines}</div>
                <p className="text-sm text-gray-500 mt-1">
                  {totalMachines > 0 
                    ? `${((totalMachines - activeMachines) / totalMachines * 100).toFixed(0)}% aller Automaten`
                    : "Keine Automaten vorhanden"}
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Top-Automaten nach Umsatz */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-primary" />
                Top Automaten nach Umsatz
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topMachinesList.length > 0 ? (
                <div className="space-y-4">
                  {topMachinesList.map((machine, index) => (
                    <div key={index}>
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">{machine.name}</span>
                        <span>{machine.revenue.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>{machine.count} Transaktionen</span>
                        <span>∅ {(machine.revenue / machine.count).toFixed(2)} €</span>
                      </div>
                      <Progress 
                        value={machine.revenue / topMachinesList[0].revenue * 100} 
                        className="mt-2"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  Keine Daten verfügbar
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* System-Tab */}
        <TabsContent value="system" className="space-y-4">
          {/* Synchronisationsstatus */}
          <SyncStatusCard onSettingsClick={handleSettingsClick} />
          
          {/* Recent Sync Activity */}
          <SyncLogTable />
          
          {/* System Alerts */}
          <SystemAlerts />
        </TabsContent>
      </Tabs>
    </div>
  );
}

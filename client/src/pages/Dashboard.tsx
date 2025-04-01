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
import { getTransactions, getMachines, getEvents, getSyncStatus, getOpenOrders, formatDateTime } from "@/lib/api";
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Automaten-Status */}
        <MetricCard
          title="Aktive Automaten"
          value={`${activeMachines} / ${totalMachines}`}
          icon={<Package />}
          iconBgColor="bg-violet-100"
          iconColor="text-violet-600"
        />

        {/* Tagesumsatz - behalten wir bei */}
        <MetricCard
          title="Tagesumsatz"
          value={`${dailyRevenue.toFixed(2)} €`}
          icon={<Calendar />}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
          trend={{
            value: `${Math.abs(revenueTrend).toFixed(1)}%`,
            label: "vs. gestern",
            isPositive: revenueTrend >= 0,
          }}
        />

        {/* Offene Fehler */}
        <MetricCard
          title="Offene Fehler"
          value={openErrors}
          icon={<AlertCircle />}
          iconBgColor="bg-red-100"
          iconColor="text-red-600"
          action={{
            label: "Fehler ansehen",
            onClick: handleViewErrorsClick,
          }}
        />
        
        {/* Offene Bestellungen */}
        <MetricCard
          title="Offene Bestellungen"
          value={openOrders?.length || 0}
          icon={<Truck />}
          iconBgColor="bg-amber-100"
          iconColor="text-amber-600"
          action={{
            label: "Bestellungen",
            onClick: () => setLocation("/bestellungen"),
          }}
        />
      </div>

      {/* Tabs für verschiedene Ansichten */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="sales">Verkäufe</TabsTrigger>
          <TabsTrigger value="machines">Automaten</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>
        
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Truck className="h-5 w-5 mr-2 text-primary" />
                Anstehende Lieferungen
              </CardTitle>
              <CardDescription>Offene Bestellungen mit erwartetem Liefertermin</CardDescription>
            </CardHeader>
            <CardContent>
              {openOrders && openOrders.length > 0 ? (
                <div className="space-y-4">
                  {openOrders.map((order) => (
                    <div key={order.id} className="border rounded-md p-4 space-y-2 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{order.orderNumber}</div>
                          <div className="text-sm text-gray-500">{order.supplierName}</div>
                        </div>
                        <Badge className={
                          order.status === "open" ? "bg-gray-100 text-gray-800" :
                          order.status === "ordered" ? "bg-blue-100 text-blue-800" :
                          order.status === "partial" ? "bg-amber-100 text-amber-800" :
                          order.status === "delivered" ? "bg-green-100 text-green-800" :
                          "bg-gray-100 text-gray-800"
                        }>
                          {order.status === "open" ? "Offen" :
                           order.status === "ordered" ? "Bestellt" :
                           order.status === "partial" ? "Teilgeliefert" :
                           order.status === "delivered" ? "Geliefert" :
                           order.status}
                        </Badge>
                      </div>
                      
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>
                            Erwartete Lieferung: {order.expectedDeliveryDate ? 
                              formatDateTime(order.expectedDeliveryDate, 'date') : 'Nicht angegeben'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>Positionen: {order.itemCount || 0}</span>
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-1"
                          onClick={() => setLocation(`/bestellungen/${order.id}/wareneingang`)}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          Warenannahme starten
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  Keine anstehenden Lieferungen
                </div>
              )}
            </CardContent>
          </Card>

          {/* Zahlungsmethoden nach Standort */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-primary" />
                Zahlungsmethoden nach Standort
              </CardTitle>
              <CardDescription>Standorte mit niedrigstem Anteil kontaktloser Zahlung</CardDescription>
            </CardHeader>
            <CardContent>
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
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        Nicht genügend Daten für eine Analyse
                      </div>
                    );
                  })()}
                  
                  {/* Zusammenfassung der Zahlungsmethoden insgesamt */}
                  <div className="mt-6 pt-4 border-t">
                    <div className="font-medium mb-3">Gesamtverteilung Zahlungsmethoden</div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {Object.entries(paymentMethods).map(([method, stats], index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {method === "CASH" ? "Bargeld" : 
                               method === "CASHLESS" ? "Kartenzahlung" :
                               method}
                            </span>
                            <span className="font-medium">
                              {(stats.count / totalTransactions * 100).toFixed(1)}%
                            </span>
                          </div>
                          <Progress 
                            value={stats.count / totalTransactions * 100} 
                            className={method === "CASH" ? "bg-blue-100" : "bg-green-100"}
                          />
                          <div className="text-right text-sm text-gray-500">
                            {stats.count} Trans. / {stats.revenue.toFixed(2)} €
                          </div>
                        </div>
                      ))}
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

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
  Percent
} from "lucide-react";
import SyncStatusCard from "@/components/dashboard/SyncStatusCard";
import MetricCard from "@/components/dashboard/MetricCard";
import TransactionsTable from "@/components/tables/TransactionsTable";
import SyncLogTable from "@/components/tables/SyncLogTable";
import SystemAlerts from "@/components/notifications/SystemAlerts";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDashboardSummary, getSyncStatus } from "@/lib/api";
import { formatDateTime } from "@/lib/api";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch summary data from database (not direct API)
  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['/api/transactions/summary'],
    queryFn: () => getDashboardSummary(),
    refetchInterval: 60000, // Jede Minute aktualisieren
  });
  
  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: () => getSyncStatus(),
    refetchInterval: 30000, // Alle 30 Sekunden aktualisieren
  });

  // Handle settings click
  const handleSettingsClick = () => {
    setLocation("/settings");
  };

  // Handle view errors click
  const handleViewErrorsClick = () => {
    setLocation("/events");
  };

  // Extrahiere Werte aus der Zusammenfassung oder verwende Standardwerte
  const totalTransactions = summary?.totalTransactions || 0;
  const totalRevenue = summary?.totalRevenue || 0;
  const activeMachines = summary?.activeMachines || 0;
  const totalMachines = summary?.totalMachines || 0;
  const dailyRevenue = summary?.todayRevenue || 0;
  const revenueTrend = summary?.trendDaily || 0;
  const openErrors = summary?.recentIssues || 0;
  
  // Top Produkte aus der Zusammenfassung
  const topProductsList = summary?.popularProducts || [];
  
  // Top 5 Maschinen nach Transaktionen (falls implementiert in API)
  const topMachinesList = summary?.topMachines || [];
  
  // Zahlungsmethoden
  const paymentMethodsArray = summary?.paymentMethods || [];
  
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

      {/* Top-Level Metriken */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gesamtumsatz */}
        <MetricCard
          title="Gesamtumsatz"
          value={`${totalRevenue.toFixed(2)} €`}
          icon={<DollarSign />}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
        />

        {/* Tagesumsatz */}
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

        {/* Automaten-Status */}
        <MetricCard
          title="Aktive Automaten"
          value={`${activeMachines} / ${totalMachines}`}
          icon={<Package />}
          iconBgColor="bg-violet-100"
          iconColor="text-violet-600"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top-Produkte nach Verkaufszahlen */}
            <Card>
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
                          <span className="font-medium truncate" title={product.productName}>
                            {product.productName}
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
            <Card>
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
                          <span className="font-medium truncate" title={machine.machineName || machine.name}>
                            {machine.machineName || machine.name}
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
          </div>
          
          {/* Zahlungsmethoden */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-primary" />
                Zahlungsmethoden
              </CardTitle>
              <CardDescription>Verteilung nach Zahlungsart</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentMethodsArray.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {paymentMethodsArray.map((payment, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {payment.method === "CASH" ? "Bargeld" : 
                           payment.method === "CASHLESS" ? "Kartenzahlung" :
                           payment.method}
                        </span>
                        <span className="font-medium">{payment.count} Transaktionen</span>
                      </div>
                      <Progress 
                        value={payment.count / totalTransactions * 100} 
                        className={payment.method === "CASH" ? "bg-blue-100" : "bg-green-100"}
                      />
                      <div className="text-right text-sm text-gray-500">
                        {payment.revenue.toFixed(2)} € ({(payment.revenue / totalRevenue * 100).toFixed(1)}%)
                      </div>
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
                        <span className="font-medium">{machine.machineName || machine.name}</span>
                        <span>{machine.revenue.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>{machine.transactions} Transaktionen</span>
                        <span>∅ {(machine.revenue / machine.transactions).toFixed(2)} €</span>
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

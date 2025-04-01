import { useQuery } from "@tanstack/react-query";
import { 
  FileText, 
  Package, 
  DollarSign, 
  ArrowRight,
  BarChart2, 
  ShoppingBag, 
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { StatCard } from "@/components/dashboard/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTransactions, getMachines, getEvents, getSyncStatus, getOpenOrders, formatDateTime } from "@/lib/api";

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
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Open orders for the dashboard view
  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000 // Update every minute
  });

  // Calculate current metrics from real data
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  // Transactions
  const totalTransactions = transactions?.length || 0;
  
  // Machine statistics
  const activeMachines = machines?.filter(m => m.status === "active").length || 0;
  const totalMachines = machines?.length || 0;

  // Daily revenue
  const dailyRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate.toDateString() === today.toDateString()) {
      return sum + (tx.price || 0);
    }
    return sum;
  }, 0) || 0;
  
  // Yesterday's revenue (for comparison)
  const yesterdayRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate.toDateString() === yesterday.toDateString()) {
      return sum + (tx.price || 0);
    }
    return sum;
  }, 0) || 0;
  
  // Total revenue
  const totalRevenue = transactions?.reduce((sum, tx) => sum + (tx.price || 0), 0) || 0;
  
  // Average transaction value
  const averageTransaction = totalTransactions > 0 
    ? (totalRevenue / totalTransactions).toFixed(2)
    : "0.00";

  // Top products by count
  const topProducts = transactions?.reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
    if (!acc[tx.productName]) {
      acc[tx.productName] = { count: 0, revenue: 0 };
    }
    acc[tx.productName].count += 1;
    acc[tx.productName].revenue += tx.price || 0;
    return acc;
  }, {}) || {};
  
  // Top 5 products by count
  const topProductsList = Object.entries(topProducts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      revenue: stats.revenue
    }));
  
  // Top 5 machines by transactions
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

  return (
    <div className="space-y-6">
      {/* Dashboard KPI Cards */}
      <KpiGrid>
        <KpiCard
          title="Umsatz"
          value={totalRevenue > 0 ? `${totalRevenue.toFixed(0)} €` : "0 €"}
          variant="orange"
          icon={<DollarSign className="h-5 w-5" />}
          isLoading={isLoadingTransactions}
        />
        <KpiCard
          title="Transaktionen"
          value={totalTransactions}
          variant="blue"
          icon={<FileText className="h-5 w-5" />}
          isLoading={isLoadingTransactions}
        />
        <KpiCard
          title="Durchschnitt"
          value={`${averageTransaction} €`}
          variant="green"
          icon={<BarChart2 className="h-5 w-5" />}
          isLoading={isLoadingTransactions}
        />
        <KpiCard
          title="Automaten"
          value={`${activeMachines} / ${totalMachines}`}
          variant="teal"
          icon={<Package className="h-5 w-5" />}
          isLoading={isLoadingMachines}
        />
      </KpiGrid>

      {/* Recent transactions and top products section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Main chart area - 8 columns on desktop */}
        <Card className="md:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-xl font-bold">Grafik</CardTitle>
              <CardDescription>Umsatz nach Zeitraum</CardDescription>
            </div>
            <div>
              <Tabs defaultValue="7days" className="w-full">
                <TabsList>
                  <TabsTrigger value="7days">7 Tage</TabsTrigger>
                  <TabsTrigger value="30days">30 Tage</TabsTrigger>
                  <TabsTrigger value="quarter">Quartal</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground">
              Umsatzdaten werden geladen...
            </div>
          </CardContent>
        </Card>

        {/* Sidebar with top products - 4 columns on desktop */}
        <div className="md:col-span-4 grid grid-cols-1 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Top Produkte</CardTitle>
              <CardDescription>Nach Verkaufsmenge</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
                      <div className="h-4 bg-muted rounded w-10 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : topProductsList.length > 0 ? (
                <div className="space-y-2">
                  {topProductsList.map((product, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="font-medium truncate max-w-[180px]" title={product.name}>
                        {product.name}
                      </span>
                      <span className="text-muted-foreground">{product.count}x</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-3 text-center text-muted-foreground">
                  Keine Daten verfügbar
                </div>
              )}

              <button
                onClick={() => setLocation("/produkte")}
                className="w-full mt-4 flex items-center justify-center text-xs text-primary hover:underline"
              >
                Alle Produkte anzeigen <ArrowRight className="h-3 w-3 ml-1" />
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Top Automaten</CardTitle>
              <CardDescription>Nach Umsatz</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
                      <div className="h-4 bg-muted rounded w-16 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : topMachinesList.length > 0 ? (
                <div className="space-y-2">
                  {topMachinesList.map((machine, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="font-medium truncate max-w-[180px]" title={machine.name}>
                        {machine.name}
                      </span>
                      <span className="text-muted-foreground">{machine.revenue.toFixed(0)} €</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-3 text-center text-muted-foreground">
                  Keine Daten verfügbar
                </div>
              )}

              <button
                onClick={() => setLocation("/automaten")}
                className="w-full mt-4 flex items-center justify-center text-xs text-primary hover:underline"
              >
                Alle Automaten anzeigen <ArrowRight className="h-3 w-3 ml-1" />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Secondary statistics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Umsatz"
          value={`${dailyRevenue.toFixed(0)} €`}
          variant="primary"
        />
        <StatCard
          title="Transaktionen"
          value={totalTransactions}
          variant="secondary"
        />
        <StatCard
          title="Durchschnitt"
          value={`${averageTransaction} €`}
          variant="accent"
        />
        <StatCard
          title="Letzte Synchronisation"
          value={syncStatus?.lastSync ? formatDateTime(new Date(syncStatus.lastSync)) : "Nie"}
          variant="muted"
        />
      </div>

      {/* Bottom row with data table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Letzte Transaktionen</CardTitle>
          <CardDescription>
            Die neuesten Verkäufe aus allen Automaten
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex space-x-4 py-2">
                  <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
                  <div className="h-4 bg-muted rounded w-40 animate-pulse"></div>
                  <div className="h-4 bg-muted rounded w-20 animate-pulse"></div>
                  <div className="h-4 bg-muted rounded w-16 animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Datum</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Automat</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Produkt</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 5).map((tx, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="py-2 px-4">{formatDateTime(new Date(tx.datetime))}</td>
                        <td className="py-2 px-4">{tx.machineName || "-"}</td>
                        <td className="py-2 px-4">{tx.productName || "-"}</td>
                        <td className="py-2 px-4 font-medium">{tx.price?.toFixed(2) || "0.00"} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-center py-2 border-t">
                <button
                  onClick={() => setLocation("/transactions")}
                  className="text-xs text-primary flex items-center hover:underline"
                >
                  Alle Transaktionen anzeigen
                  <ArrowRight className="ml-1 h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <ShoppingBag className="mx-auto h-12 w-12 opacity-20 mb-2" />
              <p>Keine Transaktionen gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
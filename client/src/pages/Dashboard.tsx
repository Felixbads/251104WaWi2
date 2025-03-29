import { useQuery } from "@tanstack/react-query";
import { FileText, Package, DollarSign, AlertCircle } from "lucide-react";
import SyncStatusCard from "@/components/dashboard/SyncStatusCard";
import MetricCard from "@/components/dashboard/MetricCard";
import TransactionsTable from "@/components/tables/TransactionsTable";
import SyncLogTable from "@/components/tables/SyncLogTable";
import SystemAlerts from "@/components/notifications/SystemAlerts";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getTransactions, getMachines } from "@/lib/api";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch data for metrics
  const { data: transactions } = useQuery({
    queryKey: ['/api/transactions?limit=100'],
    queryFn: () => getTransactions(100),
  });

  const { data: machines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  // Handle settings click
  const handleSettingsClick = () => {
    setLocation("/settings");
  };

  // Handle view errors click
  const handleViewErrorsClick = () => {
    toast({
      title: "Fehler anzeigen",
      description: "Diese Funktion wird in Kürze verfügbar sein.",
    });
  };

  // Calculate metrics
  const totalTransactions = transactions?.length || 0;
  const activeMachines = machines?.filter((m: any) => m.status === "active").length || 0;
  const totalMachines = machines?.length || 0;
  const dailyRevenue = transactions?.reduce((sum: number, transaction: any) => {
    const today = new Date();
    const txDate = new Date(transaction.datetime);
    if (txDate.toDateString() === today.toDateString()) {
      return sum + (transaction.price || 0);
    }
    return sum;
  }, 0) || 0;
  const openErrors = 6; // This would normally come from the API

  return (
    <>
      {/* Synchronization Status Card */}
      <SyncStatusCard onSettingsClick={handleSettingsClick} />

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Transactions Card */}
        <MetricCard
          title="Transaktionen Gesamt"
          value={totalTransactions.toLocaleString()}
          icon={<FileText />}
          iconBgColor="bg-primary-100"
          iconColor="text-primary-600"
          trend={{
            value: "+2.5%",
            label: "vs. Vorwoche",
            isPositive: true,
          }}
        />

        {/* Active Machines */}
        <MetricCard
          title="Aktive Maschinen"
          value={`${activeMachines} / ${totalMachines}`}
          icon={<Package />}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
          trend={{
            value: "-3",
            label: "vs. gestern",
            isPositive: false,
          }}
        />

        {/* Daily Revenue */}
        <MetricCard
          title="Tagesumsatz"
          value={`${dailyRevenue.toFixed(2)} €`}
          icon={<DollarSign />}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
          trend={{
            value: "+4.3%",
            label: "vs. gestern",
            isPositive: true,
          }}
        />

        {/* Errors */}
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

      {/* Recent Sync Activity */}
      <SyncLogTable />

      {/* Two-column layout for desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Transactions (2/3 width) */}
        <TransactionsTable />

        {/* System Alerts (1/3 width) */}
        <SystemAlerts />
      </div>
    </>
  );
}

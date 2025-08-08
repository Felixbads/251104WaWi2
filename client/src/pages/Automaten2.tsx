import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Clock, 
  Euro, 
  ShoppingCart, 
  CreditCard, 
  Wine, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, getMachines, Machine } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Erweiterte Maschinenschnittstelle mit den zusätzlichen KPIs
interface EnhancedMachine extends Machine {
  todayTransactions?: number;
  todayRevenue?: number;
  lastSale?: string;
  lastAlcoholSale?: string;
  lastCashlessSale?: string;
  cashlessStatus?: 'ok' | 'warning' | 'error';
  alcoholStatus?: 'ok' | 'warning' | 'error';
}

export default function Automaten2() {
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Optimized data fetching with parallel requests
  const { data: machines, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: async () => {
      console.log('Fetching machines and stats...');
      
      // Get only the first 18 real machines
      const machinesData = await getMachines();
      console.log(`Loaded ${machinesData.length} machines`);

      // Filter to only show machines with IDs 1-18 (excluding demo machine ID 1)
      const validMachines = machinesData.filter(machine => 
        machine.id && machine.id >= 2 && machine.id <= 18
      ).slice(0, 18);

      // Create parallel requests for all machine stats
      const statsPromises = validMachines.map(async (machine) => {
        try {
          const response = await fetch(`/api/machines/${machine.id}/daily-stats`);
          
          if (!response.ok) {
            console.warn(`Failed to fetch stats for machine ${machine.id}: ${response.status}`);
            return null;
          }
          
          const stats = await response.json();
          return { machineId: machine.id, stats };
        } catch (error) {
          console.error(`Error fetching stats for machine ${machine.id}:`, error);
          return null;
        }
      });

      // Wait for all stats requests to complete (or fail)
      const statsResults = await Promise.allSettled(statsPromises);
      
      // Create a map of machine stats for fast lookup
      const statsMap = new Map<number, any>();
      statsResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const { machineId, stats } = result.value;
          statsMap.set(machineId, stats);
        }
      });

      console.log(`Successfully loaded stats for ${statsMap.size}/${validMachines.length} machines`);

      // Helper function to process sale data
      const processSaleData = (sale: any): string | undefined => {
        if (!sale) return undefined;
        try {
          const datetime = sale.datetime || sale;
          return new Date(datetime).toISOString();
        } catch (error) {
          console.error('Date formatting error:', error);
          return undefined;
        }
      };

      // Helper function to calculate status based on days since last activity
      const calculateStatus = (datetime?: string): 'ok' | 'warning' | 'error' => {
        if (!datetime) return 'error';
        try {
          const lastDate = new Date(datetime);
          const now = new Date();
          const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysSince <= 14 ? 'ok' : 'warning';
        } catch (error) {
          return 'error';
        }
      };

      // Combine machines with their stats
      const enhancedMachines: EnhancedMachine[] = validMachines.map(machine => {
        const stats = statsMap.get(machine.id);
        
        if (!stats) {
          // Default values when stats are not available
          return {
            ...machine,
            todayTransactions: 0,
            todayRevenue: 0,
            cashlessStatus: 'error' as const,
            alcoholStatus: 'error' as const
          };
        }

        // Process sale data
        const lastSale = processSaleData(stats.lastSale);
        const lastCashlessSale = processSaleData(stats.lastCashlessSale);
        const lastAlcoholSale = processSaleData(stats.lastAlcoholSale);

        return {
          ...machine,
          todayTransactions: stats.todayTransactions || 0,
          todayRevenue: stats.todayRevenue || 0,
          lastSale,
          lastCashlessSale,
          lastAlcoholSale,
          cashlessStatus: calculateStatus(lastCashlessSale),
          alcoholStatus: calculateStatus(lastAlcoholSale)
        };
      });

      console.log('Enhanced machines data processed successfully');
      return enhancedMachines;
    },
    // Refetch every 5 minutes for fresh data
    refetchInterval: 5 * 60 * 1000,
    // Keep data fresh but don't refetch on every window focus
    staleTime: 2 * 60 * 1000,
  });

  // Filter- und Suchfunktionen
  const filteredMachines = machines?.filter((machine: EnhancedMachine) => {
    // Demo-Automaten mit ID 1 ausschließen
    if (!machine || !machine.machineName || machine.id === 1) return false;

    const matchesSearch = machine.machineName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || statusFilter === 'all' || machine.status === statusFilter;

    return matchesSearch && matchesStatus;
  }) || [];

  // Refreshen der Daten
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
  };

  // Zeitraum seit dem letzten Verkauf formatieren
  const formatTimeSince = (dateString?: string): string => {
    if (!dateString) return 'Keine Daten';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Ungültiges Datum';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins} Min.`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} Std.`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} Tagen`;
  };

  // Status-Indikator für Alkohol/Cashless
  const StatusIndicator = ({ status, label }: { status: 'ok' | 'warning' | 'error', label: string }) => {
    const color = status === 'ok' ? 'bg-green-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500';
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full ${color} mr-1`}></div>
              <span className="text-xs">{label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {status === 'ok' ? 'Letzte 14 Tage aktiv' : 
             status === 'warning' ? 'Älter als 14 Tage' : 
             'Keine Daten verfügbar'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md text-red-600">
        <p className="font-medium">Fehler beim Laden der Automaten</p>
        <p className="text-sm mt-1">{String(error)}</p>
        <Button 
          variant="outline" 
          className="mt-2" 
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Automaten 2</h1>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Automaten suchen..."
              className="pl-9 w-full sm:w-[200px] lg:w-[300px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <Select value={statusFilter ?? 'all'} onValueChange={(value) => setStatusFilter(value)}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <div className="flex items-center">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <span>
                  {!statusFilter || statusFilter === 'all' ? 'Status: Alle' : 
                   statusFilter === 'active' ? 'Status: Aktiv' : 
                   statusFilter === 'inactive' ? 'Status: Inaktiv' : 
                   statusFilter}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
              <SelectItem value="error">Fehler</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefresh}
            title="Daten aktualisieren"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {filteredMachines.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-gray-50 rounded-md p-8">
          <p className="text-gray-500 mb-2">Keine Automaten gefunden</p>
          <p className="text-sm text-gray-400">Versuchen Sie andere Suchkriterien oder überprüfen Sie die Filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMachines.map((machine) => (
            <Card
              key={machine.id}
              className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setLocation(`/automaten/${machine.id}`)}
            >
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-lg truncate pr-2">{machine.machineName}</h3>
                  <StatusBadge status={machine.status} />
                </div>
                
                <div className="text-xs text-gray-500 mb-3">
                  ID: {machine.vendonId}
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="flex items-center text-gray-500 text-xs mb-1">
                      <Clock className="h-3 w-3 mr-1" /> Letzter Verkauf
                    </div>
                    <div className="font-medium text-sm">
                      {machine.lastSale 
                        ? formatDateTime(machine.lastSale, 'datetime')
                        : '–'}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center text-gray-500 text-xs mb-1">
                      <ShoppingCart className="h-3 w-3 mr-1" /> Transaktionen heute
                    </div>
                    <div className="font-medium text-sm">
                      {machine.todayTransactions || 0}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center text-gray-500 text-xs mb-1">
                      <Euro className="h-3 w-3 mr-1" /> Umsatz heute
                    </div>
                    <div className="font-medium text-sm">
                      {machine.todayRevenue?.toFixed(2) || '0.00'} €
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center text-gray-500 text-xs mb-1">
                      <Clock className="h-3 w-3 mr-1" /> Vor
                    </div>
                    <div className="font-medium text-sm">
                      {machine.lastSale ? formatTimeSince(machine.lastSale) : '–'}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center border-t pt-2">
                  <StatusIndicator 
                    status={machine.alcoholStatus || 'error'} 
                    label="Alkohol" 
                  />
                  <StatusIndicator 
                    status={machine.cashlessStatus || 'error'} 
                    label="Cashless" 
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Status-Badge-Komponente
const StatusBadge = ({ status }: { status: string }) => {
  let variant: 
    | "default"
    | "outline"
    | "secondary"
    | "destructive" = "default";
  let icon = null;
  let className = "";

  switch (status) {
    case "active":
      variant = "default";
      className = "bg-green-500 hover:bg-green-700";
      icon = <CheckCircle className="h-3 w-3 mr-1" />;
      break;
    case "inactive":
      variant = "secondary";
      break;
    case "error":
      variant = "destructive";
      icon = <AlertTriangle className="h-3 w-3 mr-1" />;
      break;
    default:
      variant = "outline";
  }

  return (
    <Badge variant={variant} className={`flex items-center ${className}`}>
      {icon}
      {status === "active" ? "Aktiv" : 
       status === "inactive" ? "Inaktiv" : 
       status === "error" ? "Fehler" : status}
    </Badge>
  );
};
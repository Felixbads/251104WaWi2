import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Package, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Euro,
  ShoppingCart,
  CreditCard,
  Tag,
  MapPin,
  Map,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  Grid,
  List,
  Plus,
  SlidersHorizontal,
  BarChart3,
  Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, getMachines, Machine } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import StandortAnalyse from "@/pages/StandortAnalyse";

// Erweiterte Maschinenschnittstelle mit den zusätzlichen KPIs
interface EnhancedMachine extends Machine {
  todayTransactions?: number;
  todayRevenue?: number;
  lastSale?: string;
  cashlessStatus?: 'ok' | 'warning' | 'error';
  ageVerificationStatus?: 'ok' | 'warning' | 'error';
}

export default function Automaten() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid");
  const [, setLocation] = useLocation();
  const [locationFilter, setLocationFilter] = useState<string>("alle");
  const [machineTypeFilter, setMachineTypeFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("automaten");

  // Optimized data fetching with parallel requests and correct API calls
  const { data: machines, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: async () => {
      console.log('Fetching machines and stats...');
      
      // First get all machines
      const machinesData = await getMachines();
      console.log(`Loaded ${machinesData.length} machines`);

      // Filter out demo machine (ID 1) early
      const validMachines = machinesData.filter(machine => machine.id !== 1);

      // Optimized bulk fetch for all machine stats in one request
      let statsMap = new Map();
      
      if (validMachines.length > 0) {
        try {
          const machineIds = validMachines.map(m => m.id).join(',');
          console.log(`Fetching bulk stats for ${validMachines.length} machines...`);
          
          const response = await fetch(`/api/machines/daily-stats?machineIds=${machineIds}`);
          
          if (response.ok) {
            const bulkStats = await response.json();
            
            // Create map from bulk response
            bulkStats.forEach((stat: any) => {
              if (stat.machineId) {
                statsMap.set(stat.machineId, stat);
              }
            });
            
            console.log(`Successfully loaded bulk stats for ${statsMap.size}/${validMachines.length} machines`);
          } else {
            console.warn(`Bulk stats fetch failed: ${response.status}, falling back to individual calls`);
            
            // Fallback to individual calls if bulk fails
            const statsPromises = validMachines.map(async (machine) => {
              try {
                const response = await fetch(`/api/machines/${machine.id}/daily-stats`);
                if (!response.ok) return null;
                const stats = await response.json();
                return { machineId: machine.id, stats };
              } catch (error) {
                console.error(`Error fetching stats for machine ${machine.id}:`, error);
                return null;
              }
            });

            const statsResults = await Promise.allSettled(statsPromises);
            statsResults.forEach((result) => {
              if (result.status === 'fulfilled' && result.value) {
                const { machineId, stats } = result.value;
                statsMap.set(machineId, stats);
              }
            });
          }
        } catch (error) {
          console.error('Error in bulk stats fetch:', error);
        }
      }

      // Helper function to process sale data from persistent schema
      const processSaleData = (datetime: string | null): string | undefined => {
        if (!datetime) return undefined;
        try {
          return new Date(datetime).toISOString();
        } catch (error) {
          console.error('Date formatting error:', error);
          return undefined;
        }
      };

      // Helper function to calculate cashless status
      const calculateCashlessStatus = (datetime?: string | null): 'ok' | 'warning' | 'error' => {
        if (!datetime) return 'error';
        try {
          const lastDate = new Date(datetime);
          const now = new Date();
          const hoursSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
          
          if (hoursSince < 1) return 'ok';
          if (hoursSince < 4) return 'warning';
          return 'error';
        } catch (error) {
          return 'error';
        }
      };

      // Helper function to calculate alcohol verification status
      const calculateAlcoholStatus = (alcoholSales?: { today: number, monthAvg: number }): 'ok' | 'warning' | 'error' => {
        if (!alcoholSales || alcoholSales.monthAvg === 0) return 'ok';
        
        const { today, monthAvg } = alcoholSales;
        if (today <= monthAvg * 1.2 && today >= monthAvg * 0.8) {
          return 'ok'; // Normal range
        } else if (today > monthAvg * 1.5 || today < monthAvg * 0.5) {
          return 'error'; // Strong deviation
        } else {
          return 'warning'; // Slight deviation
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
            cashlessStatus: machine.status === 'online' ? 'warning' : 'error',
            ageVerificationStatus: 'ok'
          };
        }

        // Process sale data using persistent schema field names
        const lastSale = processSaleData(stats.lastSaleDatetime);
        const lastCashlessSale = processSaleData(stats.lastCashlessSaleDatetime);

        return {
          ...machine,
          todayTransactions: stats.todayTransactions || 0,
          todayRevenue: stats.todayRevenue || 0,
          lastSale,
          cashlessStatus: calculateCashlessStatus(lastCashlessSale) || stats.cashlessStatus || 'unknown',
          ageVerificationStatus: calculateAlcoholStatus({
            today: stats.alcoholTransactions || 0,
            monthAvg: stats.monthlyAvgTransactions || 0
          })
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

  // Extrahiere verfügbare Standorte und Maschinentypen für die Filter
  const locations = machines ? Array.from(new Set(machines.map(m => m.location).filter(Boolean))) : [];
  const machineTypes = ['Snackautomat', 'Getränkeautomat', 'Kombi-Automat', 'Kaffeeautomat'];

  // Filter- und Suchfunktionen
  const filteredMachines = machines?.filter((machine: EnhancedMachine) => {
    // Demo-Automaten mit ID 1 ausschließen
    if (!machine || !machine.machineName || machine.id === 1) return false;

    const matchesSearch = machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (machine.location?.toLowerCase().includes(searchTerm.toLowerCase()) || false);

    const matchesLocation = locationFilter === 'alle' || machine.location === locationFilter;

    // In einem echten Szenario würde machine.type existieren - hier nehmen wir eine zufällige Zuordnung vor
    const matchesMachineType = machineTypeFilter === 'alle' || 
                              (machine.vendonId?.length || 0) % machineTypes.length === machineTypes.indexOf(machineTypeFilter);

    const matchesStatus = !statusFilter || machine.status === statusFilter;

    return matchesSearch && matchesLocation && matchesMachineType && matchesStatus;
  }) || [];

  // Refreshen der Daten
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
  };

  // AutomatenKarte Komponente mit erweiterten KPIs
  const AutomatenKarte = ({ machine }: { machine: EnhancedMachine }) => {
    return (
      <Card 
        className="overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer"
        onClick={() => setLocation(`/automaten/${machine.id}`)}
      >
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg truncate">{machine.machineName}</CardTitle>
          </div>
          {/* Standort ausgeblendet, wie vom Benutzer gewünscht */}
          <CardDescription className="text-xs text-gray-500">
            Vendon ID: {machine.vendonId}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2 space-y-4">
          {/* KPI-Bereich */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Letzter Verkauf
              </div>
              <div className="font-medium">
                {machine.lastSale 
                  ? formatDateTime(machine.lastSale, 'datetime')
                  : '–'}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> Transaktionen heute
              </div>
              <div className="font-medium">
                {machine.todayTransactions || 0}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <Euro className="h-3 w-3" /> Umsatz heute
              </div>
              <div className="font-medium">
                {machine.todayRevenue?.toFixed(2) || '0.00'} €
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Cashless-Status
              </div>
              <div>
                <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
              </div>
            </div>
          </div>

          {/* Altersverifikation (falls vorhanden) */}
          <div className="flex items-center justify-between">
            <div className="text-gray-500 text-xs flex items-center gap-1">
              <Tag className="h-3 w-3" /> Altersverifikation
            </div>
            <AgeVerificationIndicator status={machine.ageVerificationStatus || 'error'} />
          </div>
        </CardContent>
        {/* CardFooter entfernt */}
      </Card>
    );
  };

  // Automaten-Listeneintrag mit erweiterten KPIs
  const AutomatenListenEintrag = ({ machine }: { machine: EnhancedMachine }) => {
    return (
      <div 
        className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setLocation(`/automaten/${machine.id}`)}
      >
        <div className="flex-grow mr-4">
          <div className="flex items-center mb-1">
            <h3 className="font-medium truncate mr-2">{machine.machineName}</h3>
            <StatusBadge status={machine.status} />
          </div>
          <div className="flex items-center text-xs text-gray-600 gap-2">
            {/* Standort ausgeblendet, wie vom Benutzer gewünscht */}
            <span>ID: {machine.vendonId}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <Clock className="h-3 w-3 mr-1" /> Letzter Verkauf
            </p>
            <p className="font-medium">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'time')
                : '–'}
            </p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <ShoppingCart className="h-3 w-3 mr-1" /> Heute
            </p>
            <p className="font-medium">{machine.todayTransactions || 0}</p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <Euro className="h-3 w-3 mr-1" /> Umsatz
            </p>
            <p className="font-medium">{machine.todayRevenue?.toFixed(2) || '0.00'} €</p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <CreditCard className="h-3 w-3 mr-1" /> Cashless
            </p>
            <div className="flex justify-center">
              <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
            </div>
          </div>

          {/* Aktualisierungs-Button entfernt */}
        </div>
      </div>
    );
  };

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

  // Cashless Status Indikator
  const CashlessStatusIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let statusText = '';
    let tooltip = '';

    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        statusText = 'OK';
        tooltip = 'Letzte Cashless-Transaktion vor weniger als 1 Stunde';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        statusText = 'Prüfen';
        tooltip = 'Letzte Cashless-Transaktion vor mehr als 4 Stunden';
        break;
      case 'error':
        statusColor = 'text-red-500';
        statusText = 'Problem';
        tooltip = 'Keine Cashless-Transaktionen in den letzten 24 Stunden';
        break;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor} font-medium`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4 mr-1" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4 mr-1" /> : 
               <AlertTriangle className="h-4 w-4 mr-1" />}
              <span className="text-xs">{statusText}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Altersverifikations-Indikator
  const AgeVerificationIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let tooltip = '';

    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        tooltip = 'Alle Altersverifizierungen erfolgreich';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        tooltip = 'Einige Altersverifizierungen fehlgeschlagen';
        break;
      case 'error':
        statusColor = 'text-red-500';
        tooltip = 'Mehrere Altersverifizierungen fehlgeschlagen';
        break;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor}`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4" /> : 
               <AlertTriangle className="h-4 w-4" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto py-1">
          <TabsTrigger value="automaten" className="flex items-center">
            <Monitor className="mr-2 h-4 w-4" />
            Automaten-Übersicht
          </TabsTrigger>
          <TabsTrigger value="standort-analyse" className="flex items-center">
            <BarChart3 className="mr-2 h-4 w-4" />
            Standort-Analyse
          </TabsTrigger>
        </TabsList>

        {/* Automaten Tab Content */}
        <TabsContent value="automaten" className="space-y-6">
          {/* Einheitliche Filter- und Aktionsleiste */}
          <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Suchfeld und Filter-Dropdowns */}
        <div className="flex-grow flex flex-col sm:flex-row gap-2">
          {/* Suchfeld */}
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              placeholder="Automaten suchen..."
              className="pl-8 h-9 w-full"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter-Dropdowns */}
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder="Standort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Standorte</SelectItem>
              {locations.map(location => (
                <SelectItem key={location} value={location}>{location}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={machineTypeFilter} onValueChange={setMachineTypeFilter}>
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder="Maschinentyp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Typen</SelectItem>
              {machineTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            {/* Ansichts-Schalter */}
            <div className="border rounded-md p-0.5 flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kachelansicht</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Listenansicht</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "map" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("map")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <Map className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kartenansicht</TooltipContent>
              </Tooltip>
            </div>

            {/* Aktualisieren Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Aktualisieren</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Status Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          Alle
        </Button>
        <Button
          variant={statusFilter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("active")}
        >
          Aktiv
        </Button>
        <Button
          variant={statusFilter === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("inactive")}
        >
          Inaktiv
        </Button>
        <Button
          variant={statusFilter === "error" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("error")}
        >
          Fehler
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden der Automaten: {String(error)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {!isLoading && !error && (
        <p className="text-sm text-gray-500">
          {filteredMachines.length} {filteredMachines.length === 1 ? 'Automat' : 'Automaten'} gefunden
        </p>
      )}

      {/* Machines Grid/List View */}
      {!isLoading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMachines.map((machine: EnhancedMachine) => (
            <AutomatenKarte key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "list" && (
        <div className="border rounded-md divide-y">
          {filteredMachines.map((machine: EnhancedMachine) => (
            <AutomatenListenEintrag key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "map" && (
        <Card className="h-[500px] flex items-center justify-center">
          <CardContent className="text-center">
            <Map className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Kartenansicht</h3>
            <p className="text-gray-500 max-w-md">
              Die Kartenansicht mit den genauen Standorten aller Automaten wird in einem kommenden Update verfügbar sein. Wir arbeiten daran!
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {!isLoading && !error && filteredMachines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium">Keine Automaten gefunden</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? `Keine Ergebnisse für "${searchTerm}"`
              : "Es wurden keine Automaten gefunden, die den Filterkriterien entsprechen"}
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setSearchTerm("");
              setStatusFilter(null);
              setLocationFilter("alle");
              setMachineTypeFilter("alle");
            }}
          >
            Filter zurücksetzen
          </Button>
        </div>
      )}
        </TabsContent>

        {/* Standort-Analyse Tab Content */}
        <TabsContent value="standort-analyse" className="space-y-6">
          <StandortAnalyse />
        </TabsContent>
      </Tabs>
    </div>
  );
}
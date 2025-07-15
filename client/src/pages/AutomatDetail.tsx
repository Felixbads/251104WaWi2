import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { 
  Package, 
  ChevronLeft, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Euro,
  ShoppingCart,
  CreditCard,
  Settings,
  FileText,
  History,
  Download,
  Info,
  MapPin,
  PackagePlus,
  Filter,
  Droplet,
  Wind,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  ClipboardCheck,
  Plus,
  Edit3,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Home,
  Radio,
  Shield,
  Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { 
  getMachine, 
  getTransactionsByMachine,
  getRefillsByMachine,
  getMachineAnalytics,
  MachineAnalytics,
  Machine, 
  Transaction,
  Refill,
  RefillDetail,
  formatDateTime,
  getMachineMHDData,
  updateMachineMHD,
  MachineInventoryWithMHD,
  BatchInfo
} from "@/lib/api";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LocationCostsTab, LocationProfitabilityTab } from "./LocationDetail";
import { 
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";
import RemovedProductsMachineTab from "@/components/machines/RemovedProductsMachineTab";

// Erweiterte Maschinenschnittstelle mit den zusätzlichen KPIs
interface EnhancedMachine extends Machine {
  todayTransactions?: number;
  todayRevenue?: number;
  cashlessStatus?: 'ok' | 'warning' | 'error';
  ageVerificationStatus?: 'ok' | 'warning' | 'error';
  lastMaintenanceDate?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  machineType?: string;
  installationDate?: string;
}

// Hilfsfunktion: Gruppiert Daten nach Wochen für die Auswertung
function groupDataByWeek(data: { date: string; count: number; revenue: number }[] = []) {
  if (!data || data.length === 0) return [];
  
  const weekMap = new Map();
  
  data.forEach(item => {
    const date = new Date(item.date);
    const year = date.getFullYear();
    const weekNumber = getWeekNumber(date);
    const weekKey = `${year}-W${weekNumber}`;
    
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekKey,
        weekLabel: `KW ${weekNumber}`,
        count: 0,
        revenue: 0
      });
    }
    
    const week = weekMap.get(weekKey);
    week.count += item.count;
    week.revenue += item.revenue;
  });
  
  return Array.from(weekMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

// Hilfsfunktion: Ermittelt die Kalenderwoche
function getWeekNumber(date: Date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Hilfsfunktion: Gruppiert Daten nach Monaten für die Auswertung
function groupDataByMonth(data: { date: string; count: number; revenue: number }[] = []) {
  if (!data || data.length === 0) return [];
  
  const monthMap = new Map();
  const monthNames = [
    'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
  ];
  
  data.forEach(item => {
    const date = new Date(item.date);
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${month+1}`;
    
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        monthKey,
        monthLabel: `${monthNames[month]} ${year}`,
        count: 0,
        revenue: 0
      });
    }
    
    const monthData = monthMap.get(monthKey);
    monthData.count += item.count;
    monthData.revenue += item.revenue;
  });
  
  return Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// Hilfsfunktion: Erstellt eine stündliche Verteilung der Verkäufe
function getHourlyDistribution(machineAnalytics?: MachineAnalytics) {
  if (!machineAnalytics?.timeSeries || machineAnalytics.timeSeries.length === 0) {
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  }
  
  // Stundenzähler initialisieren
  const hourCounts = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  
  // Transaktionen aus den Zeitreihen-Daten verarbeiten
  machineAnalytics.timeSeries.forEach(item => {
    // Wenn wir einzelne Transaktionen haben, könnten wir hier mehr Details extrahieren
    const date = new Date(item.date);
    const hour = date.getHours();
    hourCounts[hour].count += item.count;
  });
  
  return hourCounts;
}

// Hilfsfunktion: Bestimmt die am häufigsten entfernten Produkte bei Auffüllungen
function getTopRemovedProducts(refills: Refill[] = []) {
  if (!refills || refills.length === 0) return [];
  
  const productCounts = new Map();
  
  refills.forEach(refill => {
    if (refill.details) {
      refill.details.forEach((detail: RefillDetail) => {
        if (detail.removedQuantity && detail.removedQuantity > 0) {
          const productName = detail.productName;
          
          if (!productCounts.has(productName)) {
            productCounts.set(productName, {
              productName,
              removedCount: 0
            });
          }
          
          const product = productCounts.get(productName);
          product.removedCount += detail.removedQuantity;
        }
      });
    }
  });
  
  return Array.from(productCounts.values())
    .sort((a, b) => b.removedCount - a.removedCount)
    .slice(0, 5);
}

export default function AutomatDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = params?.id;
  const [activeTab, setActiveTab] = useState("allgemein");

  // Maschine abrufen
  const { 
    data: machine, 
    isLoading: machineLoading, 
    error: machineError,
    refetch: refetchMachine
  } = useQuery({
    queryKey: ['/api/machines', id],
    queryFn: async () => {
      // Grundlegende Maschinendaten abrufen
      const machineData = await getMachine(id);
      
      // Leer KPIs für die zu erweiternde Maschine
      const enhancedMachine: EnhancedMachine = {
        ...machineData,
        todayTransactions: 0,
        todayRevenue: 0,
        cashlessStatus: 'error',
        ageVerificationStatus: 'ok',
        lastMaintenanceDate: machineData.lastSync || new Date().toISOString(),
        firmwareVersion: "v1.0",
        serialNumber: machineData.vendonId || "Unbekannt",
        machineType: "Snackautomat",
        installationDate: machineData.createdAt || new Date().toISOString()
      };
      
      try {
        // Tägliche Stats über die API abrufen - mit interner Maschinen-ID
        console.log(`Hole KPIs für Automat mit ID ${id}`);
        const response = await fetch(`/api/machines/${id}/daily-stats`);
        
        if (response.ok) {
          const stats = await response.json();
          console.log(`Erhaltene KPIs:`, stats);
          
          // Daten aus der API verwenden
          if (stats.todayTransactions) enhancedMachine.todayTransactions = stats.todayTransactions;
          if (stats.todayRevenue) enhancedMachine.todayRevenue = stats.todayRevenue;
          
          // Letzter Verkauf verarbeiten
          if (stats.lastSale && stats.lastSale.datetime) {
            enhancedMachine.lastSale = new Date(stats.lastSale.datetime).toISOString();
          }
          
          // Cashless-Status auswerten
          if (stats.lastCashlessSale) {
            const now = new Date();
            const lastCashlessDate = new Date(stats.lastCashlessSale.datetime);
            const hoursSinceLastCashless = (now.getTime() - lastCashlessDate.getTime()) / (1000 * 60 * 60);
            
            if (hoursSinceLastCashless < 1) {
              enhancedMachine.cashlessStatus = 'ok';
            } else if (hoursSinceLastCashless < 4) {
              enhancedMachine.cashlessStatus = 'warning';
            } else {
              enhancedMachine.cashlessStatus = 'error';
            }
          }
          
          // Alkoholverkaufs-Status
          if (stats.alcoholSales) {
            const { today, weekAvg, monthAvg } = stats.alcoholSales;
            
            if (today <= monthAvg * 1.2 && today >= monthAvg * 0.8) {
              enhancedMachine.ageVerificationStatus = 'ok';
            } else if (today > monthAvg * 1.5 || today < monthAvg * 0.5) {
              enhancedMachine.ageVerificationStatus = 'error';
            } else {
              enhancedMachine.ageVerificationStatus = 'warning';
            }
          }
        } else {
          console.error(`Fehler beim Abrufen der KPIs: ${response.status}`);
        }
      } catch (error) {
        console.error("Fehler beim Abrufen der Maschinen-KPIs:", error);
      }
      
      return enhancedMachine;
    },
    enabled: !!id
  });

  // Transaktionen für diese Maschine abrufen
  const { 
    data: transactions, 
    isLoading: transactionsLoading
  } = useQuery({
    queryKey: ['/api/machines', id, 'transactions'],
    queryFn: () => getTransactionsByMachine(id, 20),
    enabled: !!id && activeTab === "transaktionen"
  });

  // Auffüllungen für diese Maschine abrufen
  const {
    data: refills,
    isLoading: refillsLoading
  } = useQuery({
    queryKey: ['/api/machines', id, 'refills'],
    queryFn: () => getRefillsByMachine(id, 20),
    enabled: !!id && activeTab === "auffullungen"
  });
  
  // Machine Analytics abrufen
  const {
    data: machineAnalytics,
    isLoading: analyticsLoading,
    error: analyticsError
  } = useQuery({
    queryKey: ['/statistics/machines', id, 'analytics'],
    queryFn: () => getMachineAnalytics(id),
    enabled: !!id && (activeTab === "analysen" || activeTab === "auswertung")
  });

  // Maschine aktualisieren
  const handleRefresh = () => {
    refetchMachine();
    if (activeTab === "transaktionen") {
      queryClient.invalidateQueries({ queryKey: ['/api/machines', id, 'transactions'] });
    }
    if (activeTab === "auffullungen") {
      queryClient.invalidateQueries({ queryKey: ['/api/machines', id, 'refills'] });
    }
    if (activeTab === "analysen" || activeTab === "auswertung") {
      queryClient.invalidateQueries({ queryKey: ['/statistics/machines', id, 'analytics'] });
    }
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
              <span>{statusText}</span>
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
    let statusText = '';
    let tooltip = '';
    
    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        statusText = 'OK';
        tooltip = 'Alle Altersverifizierungen erfolgreich';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        statusText = 'Prüfen';
        tooltip = 'Einige Altersverifizierungen fehlgeschlagen';
        break;
      case 'error':
        statusColor = 'text-red-500';
        statusText = 'Problem';
        tooltip = 'Mehrere Altersverifizierungen fehlgeschlagen';
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
              <span>{statusText}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (machineLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (machineError || !machine) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            className="-ml-2" 
            onClick={() => setLocation("/automaten")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
        </div>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden des Automaten: {String(machineError || "Automat nicht gefunden")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Funktionsleiste */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/automaten")}
          className="-ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Zurück zur Übersicht
        </Button>
        
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Bearbeiten</span>
          </Button>
          <Button variant="default" size="sm" className="gap-2">
            <PackagePlus className="h-4 w-4" />
            <span className="hidden sm:inline">Auffüllen</span>
          </Button>
        </div>
      </div>

      {/* Automaten-Header mit Infos */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">{machine.machineName}</h1>
          <StatusBadge status={machine.status} />
        </div>
        <p className="text-gray-600 flex items-center gap-2">
          <span>Vendon ID: {machine.vendonId}</span>
          {machine.serialNumber && (
            <>
              <span className="text-gray-400">|</span>
              <span>Seriennummer: {machine.serialNumber}</span>
            </>
          )}
          {machine.machineType && (
            <>
              <span className="text-gray-400">|</span>
              <span>Typ: {machine.machineType}</span>
            </>
          )}
        </p>
        <p className="text-gray-600">Standort: {machine.location || "Nicht angegeben"}</p>
        <p className="text-gray-500 text-sm mt-1">
          Letzter Sync: {machine.lastSync ? formatDateTime(machine.lastSync, 'datetime') : 'Nie'} 
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 ml-1 inline text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Zeitpunkt der letzten Synchronisation mit dem Vendon-System</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
      </div>

      <Separator />

      {/* KPI Bereich */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Letzter Verkauf */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Letzter Verkauf
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'time')
                : '–'}
            </div>
            <p className="text-sm text-gray-500">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'date')
                : 'Kein Verkauf aufgezeichnet'}
            </p>
          </CardContent>
        </Card>

        {/* Transaktionen heute */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Transaktionen heute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.todayTransactions || 0}
            </div>
            <p className="text-sm text-gray-500">
              {machine.todayTransactions && machine.todayTransactions > 0 
                ? 'Heute aktiv' 
                : 'Keine Transaktionen heute'}
            </p>
          </CardContent>
        </Card>

        {/* Umsatz heute */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Euro className="h-4 w-4 mr-2" />
              Umsatz heute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {machine.todayRevenue?.toFixed(2) || '0.00'} €
            </div>
            <p className="text-sm text-gray-500">
              {machine.todayRevenue && machine.todayRevenue > 0 
                ? `Bei ${machine.todayTransactions || 0} Transaktionen` 
                : 'Kein Umsatz heute'}
            </p>
          </CardContent>
        </Card>

        {/* Cashless Status */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <CreditCard className="h-4 w-4 mr-2" />
              Cashless Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
            </div>
            <p className="text-sm text-gray-500 mt-1.5">
              Altersverifizierung: <AgeVerificationIndicator status={machine.ageVerificationStatus || 'error'} />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Tabs */}
      <Tabs 
        defaultValue="allgemein" 
        className="w-full"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full">
            <TabsTrigger value="allgemein" className="whitespace-nowrap flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <span>Allgemein</span>
            </TabsTrigger>
            <TabsTrigger value="transaktionen" className="whitespace-nowrap flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" />
              <span>Transaktionen</span>
            </TabsTrigger>
            <TabsTrigger value="analysen" className="whitespace-nowrap flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              <span>Analysen</span>
            </TabsTrigger>
            <TabsTrigger value="auswertung" className="whitespace-nowrap flex items-center">
              <BarChartIcon className="h-4 w-4 mr-2" />
              <span>Auswertung</span>
            </TabsTrigger>
            <TabsTrigger value="auffullungen" className="whitespace-nowrap flex items-center">
              <PackagePlus className="h-4 w-4 mr-2" />
              <span>Auffüllungen</span>
            </TabsTrigger>
            <TabsTrigger value="mhd" className="whitespace-nowrap flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              <span>MHD</span>
            </TabsTrigger>
            <TabsTrigger value="entnommene-produkte" className="whitespace-nowrap flex items-center">
              <Package className="h-4 w-4 mr-2 text-red-500" />
              <span>Entnommene Produkte</span>
            </TabsTrigger>
            <TabsTrigger value="kosten" className="whitespace-nowrap flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              <span>Kosten</span>
            </TabsTrigger>
            <TabsTrigger value="wirtschaftlichkeit" className="whitespace-nowrap flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              <span>Wirtschaftlichkeit</span>
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Allgemeine Informationen Tab */}
        <TabsContent value="allgemein" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stammdaten</CardTitle>
                <CardDescription>Grundlegende Informationen zum Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Name des Automaten</p>
                    <p>{machine.machineName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Vendon ID</p>
                    <p>{machine.vendonId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Seriennummer</p>
                    <p>{machine.serialNumber || 'Nicht hinterlegt'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Typ</p>
                    <p>{machine.machineType || 'Nicht kategorisiert'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Installationsdatum</p>
                    <p>{machine.installationDate ? formatDateTime(machine.installationDate, 'date') : 'Nicht bekannt'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Standortinformationen</CardTitle>
                <CardDescription>Details zum Aufstellort des Automaten</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Standortname</p>
                    <p>{machine.location || 'Nicht hinterlegt'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Adresse</p>
                    <p>{machine.address || 'Nicht hinterlegt'}</p>
                  </div>
                  {/* Weitere Standortinformationen könnten hier hinzugefügt werden */}
                  <div className="pt-4">
                    <Button variant="outline" className="w-full">
                      <MapPin className="h-4 w-4 mr-2" />
                      Auf Karte anzeigen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Umsatzentwicklung</CardTitle>
                <CardDescription>Verkäufe und Umsatz der letzten 7 Tage</CardDescription>
              </CardHeader>
              <CardContent className="h-64 flex items-center justify-center">
                <p className="text-gray-500">Diagramm wird in Kürze verfügbar sein</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Transaktionshistorie Tab */}
        <TabsContent value="transaktionen" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Transaktionshistorie</CardTitle>
                <CardDescription>Die letzten Verkäufe an diesem Automaten</CardDescription>
              </div>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Exportieren
              </Button>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead className="text-right">Preis</TableHead>
                      <TableHead>Zahlungsart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction: Transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDateTime(transaction.datetime, 'datetime')}</TableCell>
                        <TableCell>{transaction.productName}</TableCell>
                        <TableCell>{transaction.quantity}x</TableCell>
                        <TableCell className="text-right">{transaction.price.toFixed(2)} {transaction.currency}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {transaction.paymentMethod === 'CASH' ? 'Bar' : 
                             transaction.paymentMethod === 'CASHLESS' ? 'Cashless' : 
                             transaction.paymentMethod}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Keine Transaktionen gefunden</p>
                </div>
              )}
            </CardContent>
            {transactions && transactions.length > 0 && (
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" disabled>
                  Vorherige
                </Button>
                <div className="text-sm text-gray-500">
                  Seite 1 von 1
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Nächste
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
        
        {/* Analysen Tab */}
        <TabsContent value="analysen" className="mt-4">
          {analyticsLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : analyticsError ? (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center text-red-600">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  <p>Fehler beim Laden der Analysen: {String(analyticsError)}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* KPI-Übersicht */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-lg">
                    <BarChartIcon className="h-5 w-5 mr-2" />
                    Leistungskennzahlen
                  </CardTitle>
                  <CardDescription>Wichtige Kennzahlen auf einen Blick</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Gesamt-Verkäufe</div>
                      <div className="text-2xl font-medium">{machineAnalytics?.periodAnalysis?.transactionStats?.count || 0}</div>
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Umsatz</div>
                      <div className="text-2xl font-medium">{(machineAnalytics?.periodAnalysis?.transactionStats?.totalRevenue || 0).toFixed(2)} €</div>
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Auffüllungen</div>
                      <div className="text-2xl font-medium">{machineAnalytics?.periodAnalysis?.refillStats?.count || 0}</div>
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Durchschnittlicher Verkauf</div>
                      <div className="text-2xl font-medium">{(machineAnalytics?.periodAnalysis?.transactionStats?.avgPrice || 0).toFixed(2)} €</div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground">
                  Zeitraum: {machineAnalytics?.periodAnalysis?.startDate ? formatDateTime(machineAnalytics.periodAnalysis.startDate, 'date') : 'Nicht verfügbar'} - {machineAnalytics?.periodAnalysis?.endDate ? formatDateTime(machineAnalytics.periodAnalysis.endDate, 'date') : 'Nicht verfügbar'}
                </CardFooter>
              </Card>

              {/* Verkaufstrend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-lg">
                    <LineChart className="h-5 w-5 mr-2" />
                    Verkaufstrend
                  </CardTitle>
                  <CardDescription>Entwicklung der Verkäufe im Zeitverlauf</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={machineAnalytics?.timeSeries || []}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis />
                        <RechartTooltip 
                          formatter={(value: any, name: any) => {
                            if (name === 'revenue') return [`${value.toFixed(2)} €`, 'Umsatz'];
                            if (name === 'count') return [value, 'Anzahl'];
                            return [value, name];
                          }}
                          labelFormatter={(label) => new Date(label).toLocaleDateString('de-DE')}
                        />
                        <Legend payload={[
                          { value: 'Anzahl', type: 'line', color: '#8884d8' },
                          { value: 'Umsatz (€)', type: 'line', color: '#82ca9d' }
                        ]} />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} name="count" />
                        <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="revenue" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Produkte */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-lg">
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Top Produkte
                  </CardTitle>
                  <CardDescription>Die beliebtesten Produkte nach Verkaufsvolumen</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={machineAnalytics?.productPerformance || []}
                        margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="productName"
                          angle={-45}
                          textAnchor="end"
                          height={70}
                          interval={0}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis />
                        <RechartTooltip 
                          formatter={(value: any, name: any) => {
                            if (name === 'revenue') return [`${value.toFixed(2)} €`, 'Umsatz'];
                            if (name === 'count') return [value, 'Anzahl'];
                            return [value, name];
                          }}
                        />
                        <Legend payload={[
                          { value: 'Anzahl', type: 'rect', color: '#8884d8' },
                          { value: 'Umsatz (€)', type: 'rect', color: '#82ca9d' }
                        ]} />
                        <Bar dataKey="count" fill="#8884d8" name="count" />
                        <Bar dataKey="revenue" fill="#82ca9d" name="revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Zahlungsmethoden */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-lg">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Zahlungsmethoden
                  </CardTitle>
                  <CardDescription>Verteilung der verwendeten Zahlungsmethoden</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={machineAnalytics?.paymentMethodDistribution?.map(pm => ({
                            name: pm.paymentMethod,
                            value: pm.count
                          })) || []}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {machineAnalytics?.paymentMethodDistribution?.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A4DE6C'][index % 5]} />
                          ))}
                        </Pie>
                        <RechartTooltip formatter={(value) => [value, 'Transaktionen']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Wetter-Korrelation, falls Daten vorhanden */}
              {machineAnalytics?.weatherData && machineAnalytics?.weatherData.length > 0 && machineAnalytics?.timeSeries && (
                <Card className="col-span-1 lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center text-lg">
                      <Droplet className="h-5 w-5 mr-2" />
                      Wetter & Verkäufe
                    </CardTitle>
                    <CardDescription>Korrelation zwischen Wetter und Verkäufen</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={machineAnalytics.timeSeries.map(ts => {
                            const weatherForDay = machineAnalytics.weatherData?.find(
                              w => new Date(w.date).toISOString().split('T')[0] === new Date(ts.date).toISOString().split('T')[0]
                            );
                            return {
                              date: ts.date,
                              sales: ts.count,
                              revenue: ts.revenue,
                              temperature: weatherForDay?.avgTemperature || null,
                              conditions: weatherForDay?.conditions || null
                            };
                          }).filter(d => d.temperature !== null)}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          />
                          <YAxis yAxisId="left" orientation="left" />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 40]} />
                          <RechartTooltip 
                            formatter={(value: any, name: any) => {
                              if (name === 'revenue') return [`${value.toFixed(2)} €`, 'Umsatz'];
                              if (name === 'sales') return [value, 'Verkäufe'];
                              if (name === 'temperature') return [`${value.toFixed(1)} °C`, 'Temperatur'];
                              return [value, name];
                            }}
                            labelFormatter={(label) => new Date(label).toLocaleDateString('de-DE')}
                          />
                          <Legend />
                          <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#8884d8" name="Verkäufe" />
                          <Line yAxisId="right" type="monotone" dataKey="temperature" stroke="#ff7300" name="Temperatur (°C)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ereignis-Analyse */}
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Ereignis-Analyse
                  </CardTitle>
                  <CardDescription>Verteilung der Ereignistypen und Häufigkeit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={machineAnalytics?.periodAnalysis?.eventCounts?.map(event => ({
                              name: event.eventType,
                              value: event.count
                            })) || []}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {machineAnalytics?.periodAnalysis?.eventCounts?.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A4DE6C'][index % 5]} />
                            ))}
                          </Pie>
                          <RechartTooltip formatter={(value) => [value, 'Ereignisse']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Ereignisübersicht</h4>
                      <div className="space-y-2">
                        {!machineAnalytics?.periodAnalysis?.eventCounts || machineAnalytics.periodAnalysis.eventCounts.length === 0 ? (
                          <p className="text-muted-foreground text-sm">Keine Ereignisse im gewählten Zeitraum.</p>
                        ) : (
                          machineAnalytics?.periodAnalysis?.eventCounts?.map((event, index) => (
                            <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                              <span>{event.eventType}</span>
                              <Badge variant={
                                event.eventType.toLowerCase().includes('error') ? 'destructive' : 
                                event.eventType.toLowerCase().includes('warning') ? 'warning' : 
                                'secondary'
                              }>
                                {event.count}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        
        {/* Auffüllungen Tab */}
        <TabsContent value="auffullungen" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Auffüllungen</CardTitle>
                <CardDescription>Protokoll der Auffüllungen und Warennachschübe</CardDescription>
              </div>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Exportieren
              </Button>
            </CardHeader>
            <CardContent>
              {refillsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : refills && refills.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notizen</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refills.map((refill: Refill) => (
                      <TableRow key={refill.id}>
                        <TableCell>{formatDateTime(refill.datetime, 'datetime')}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={refill.status === 'completed' ? 'default' : 'secondary'}
                            className={refill.status === 'completed' ? 'bg-green-500 hover:bg-green-700' : ''}
                          >
                            {refill.status === 'completed' ? 'Abgeschlossen' : 
                             refill.status === 'in_progress' ? 'In Bearbeitung' : 
                             refill.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {refill.notes || '–'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              // Hier zur Detailseite navigieren
                              setLocation(`/automaten/${id}/refills/${refill.id}`);
                            }}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Keine Auffüllungen gefunden</p>
                </div>
              )}
            </CardContent>
            {refills && refills.length > 0 && (
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" disabled>
                  Vorherige
                </Button>
                <div className="text-sm text-gray-500">
                  Seite 1 von 1
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Nächste
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
        
        {/* Auswertung Tab */}
        <TabsContent value="auswertung" className="mt-4">
          {analyticsLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : analyticsError ? (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center text-red-600">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  <p>Fehler beim Laden der Auswertung: {String(analyticsError)}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Filter und Zeitraum Auswahl */}
              <div className="flex flex-col sm:flex-row gap-2 justify-between bg-muted rounded-lg p-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Verkaufsauswertung</h3>
                  <p className="text-sm text-muted-foreground">
                    Detaillierte Verkaufsanalyse für {machine.machineName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select defaultValue="month">
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Zeitraum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Heute</SelectItem>
                      <SelectItem value="week">Diese Woche</SelectItem>
                      <SelectItem value="month">Dieser Monat</SelectItem>
                      <SelectItem value="year">Dieses Jahr</SelectItem>
                      <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Exportieren
                  </Button>
                </div>
              </div>

              {/* Wöchentlicher und monatlicher Ertrag (Grafisch) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center text-lg">
                      <BarChartIcon className="h-5 w-5 mr-2" />
                      Wöchentlicher Ertrag
                    </CardTitle>
                    <CardDescription>Umsatz pro Woche im ausgewählten Zeitraum</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={machineAnalytics?.timeSeries ? groupDataByWeek(machineAnalytics.timeSeries) : []}
                          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="weekLabel" 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis
                            tickFormatter={(value) => `${value} €`}
                          />
                          <RechartTooltip
                            formatter={(value: any) => [`${value.toFixed(2)} €`, 'Umsatz']}
                          />
                          <Bar 
                            dataKey="revenue" 
                            fill="#8884d8" 
                            name="Umsatz" 
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center text-lg">
                      <LineChart className="h-5 w-5 mr-2" />
                      Monatlicher Ertrag
                    </CardTitle>
                    <CardDescription>Umsatzentwicklung pro Monat</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={machineAnalytics?.timeSeries ? groupDataByMonth(machineAnalytics.timeSeries) : []}
                          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="monthLabel" />
                          <YAxis
                            tickFormatter={(value) => `${value} €`}
                          />
                          <RechartTooltip
                            formatter={(value: any) => [`${value.toFixed(2)} €`, 'Umsatz']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="revenue" 
                            stroke="#82ca9d" 
                            activeDot={{ r: 8 }} 
                            name="Umsatz"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Verkaufte Produkte - Zeitliche Analyse */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-lg">
                    <Clock className="h-5 w-5 mr-2" />
                    Verkaufszeiten
                  </CardTitle>
                  <CardDescription>Wann werden Produkte am häufigsten verkauft?</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={getHourlyDistribution(machineAnalytics)}
                        margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <RechartTooltip
                          formatter={(value: any) => [value, 'Verkäufe']}
                          labelFormatter={(hour) => `${hour}:00 - ${hour}:59 Uhr`}
                        />
                        <Bar 
                          dataKey="count" 
                          fill="#4f46e5" 
                          name="Anzahl"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top verkaufte und entfernte Produkte */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center text-lg">
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Top Verkaufte Produkte
                    </CardTitle>
                    <CardDescription>Am häufigsten verkaufte Artikel</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {machineAnalytics?.productPerformance && machineAnalytics.productPerformance.length > 0 ? (
                        machineAnalytics.productPerformance.slice(0, 5).map((product, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="font-medium truncate mr-2" title={product.productName}>
                                {product.productName.length > 30 
                                  ? product.productName.substring(0, 30) + '...' 
                                  : product.productName}
                              </div>
                              <div className="flex items-center">
                                <span className="text-muted-foreground text-sm mr-2">{product.count}x</span>
                                <span className="font-bold">{product.revenue.toFixed(2)} €</span>
                              </div>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-2.5">
                              <div 
                                className="bg-primary h-2.5 rounded-full" 
                                style={{ 
                                  width: `${(product.count / (machineAnalytics.productPerformance[0]?.count || 1)) * 100}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Keine Produktverkäufe gefunden</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center text-lg">
                      <PackagePlus className="h-5 w-5 mr-2" />
                      Top Entfernte Produkte
                    </CardTitle>
                    <CardDescription>Bei Auffüllungen am häufigsten entfernte Produkte</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {refills && refills.length > 0 ? (
                      <div className="space-y-4">
                        {getTopRemovedProducts(refills).map((product, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="font-medium truncate mr-2" title={product.productName}>
                                {product.productName.length > 30 
                                  ? product.productName.substring(0, 30) + '...' 
                                  : product.productName}
                              </div>
                              <span className="font-bold">{product.removedCount}x</span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-2.5">
                              <div 
                                className="bg-amber-500 h-2.5 rounded-full" 
                                style={{ 
                                  width: `${(product.removedCount / (getTopRemovedProducts(refills)[0]?.removedCount || 1)) * 100}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Keine Auffüllungsdaten gefunden</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        
        {/* Inventur Tab */}
        <TabsContent value="inventur" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Inventurbestand</CardTitle>
                <CardDescription>Aktuelle Bestände im Automaten</CardDescription>
              </div>
              <Button variant="default" className="gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Inventur starten
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-center py-6">
                <div className="flex justify-center">
                  <ClipboardCheck className="h-16 w-16 text-gray-300 mb-2" />
                </div>
                <h3 className="text-lg font-medium">Inventurbestand</h3>
                <p className="text-gray-500 text-sm">
                  Hier können Sie eine Inventur für diesen Automaten durchführen und den aktuellen Bestand prüfen.
                </p>
                <div className="pt-4">
                  <Button variant="outline" className="mr-2">
                    <Plus className="h-4 w-4 mr-2" />
                    Produkt hinzufügen
                  </Button>
                  <Button variant="default">
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Inventur starten
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MHD Tab */}
        <TabsContent value="mhd" className="mt-4">
          <MHDTab machineId={parseInt(params.id)} />
        </TabsContent>

        {/* Entnommene Produkte Tab */}
        <TabsContent value="entnommene-produkte" className="mt-4">
          <RemovedProductsMachineTab machineId={parseInt(params.id)} />
        </TabsContent>

        {/* Kosten Tab */}
        <TabsContent value="kosten" className="mt-4">
          <LocationCostsTab machineId={parseInt(params.id)} />
        </TabsContent>

        {/* Wirtschaftlichkeit Tab */}
        <TabsContent value="wirtschaftlichkeit" className="mt-4">
          <LocationProfitabilityTab machineId={parseInt(params.id)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// MHD Tab Component
function MHDTab({ machineId }: { machineId: number }) {
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ [key: string]: { expiryDate: string; batchId: string } }>({});

  // Fetch MHD data for the machine
  const { data: mhdData, isLoading, refetch } = useQuery({
    queryKey: [`/api/machines/${machineId}/mhd`],
    enabled: !!machineId,
    select: (data) => {
      console.log('MHD API Response:', data);
      return data;
    }
  });

  // Update MHD mutation
  const updateMhdMutation = useMutation({
    mutationFn: async ({ batchId, expiryDate }: { batchId: string; expiryDate: string }) => {
      return apiRequest(`/api/machines/${machineId}/mhd/${batchId}`, {
        method: 'PATCH',
        body: { expiryDate }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machineId}/mhd`] });
      setEditingItem(null);
      setEditData({});
    }
  });

  // Helper function to get expiry status color
  const getExpiryStatusColor = (expiryDate: string) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'bg-red-100 text-red-800 border-red-200'; // Expired
    if (daysUntilExpiry <= 7) return 'bg-yellow-100 text-yellow-800 border-yellow-200'; // Soon to expire
    return 'bg-green-100 text-green-800 border-green-200'; // Good
  };

  // Helper function to format expiry status
  const getExpiryStatus = (expiryDate: string) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return `Abgelaufen vor ${Math.abs(daysUntilExpiry)} Tagen`;
    if (daysUntilExpiry === 0) return 'Läuft heute ab';
    if (daysUntilExpiry <= 7) return `Läuft in ${daysUntilExpiry} Tagen ab`;
    return `Noch ${daysUntilExpiry} Tage`;
  };

  const handleEdit = (productId: string, batchId: string, currentExpiryDate: string) => {
    const key = `${productId}-${batchId}`;
    setEditingItem(key);
    setEditData({
      [key]: {
        expiryDate: currentExpiryDate ? new Date(currentExpiryDate).toISOString().split('T')[0] : '',
        batchId: batchId || ''
      }
    });
  };

  const handleSave = async (productId: string, batchId: string) => {
    const key = `${productId}-${batchId}`;
    const data = editData[key];
    if (data) {
      await updateMhdMutation.mutateAsync({
        batchId: data.batchId,
        expiryDate: data.expiryDate
      });
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    setEditData({});
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Calendar className="h-5 w-5 mr-2" />
            MHD Verwaltung
          </CardTitle>
          <CardDescription>Mindesthaltbarkeitsdaten der Produkte in diesem Automaten</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Lade MHD-Daten...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center text-lg">
              <Calendar className="h-5 w-5 mr-2" />
              MHD Verwaltung
            </CardTitle>
            <CardDescription>Mindesthaltbarkeitsdaten der Produkte in diesem Automaten</CardDescription>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mhdData && Array.isArray(mhdData) && mhdData.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {mhdData.map((item: any, itemIndex: number) => {
                console.log('Rendering MHD item:', item);
                const productKey = `product-${item.productId}-${itemIndex}`;
                
                return (
                  <Card key={productKey} className="relative">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Product Name */}
                        <div>
                          <h3 className="font-medium text-sm leading-tight">{item.productName || 'Unbekanntes Produkt'}</h3>
                          <p className="text-xs text-muted-foreground mt-1">Bestand: {item.currentStock || item.totalQuantity || 0} Stück</p>
                        </div>

                        {/* Batches */}
                        {item.batches && item.batches.length > 0 ? (
                          <div className="space-y-2">
                            {item.batches.map((batch: any, batchIndex: number) => {
                              const batchKey = `${item.productId}-${batch.batchId || batchIndex}`;
                              const isEditing = editingItem === batchKey;
                              
                              return (
                                <div key={`batch-${batch.batchId || batchIndex}-${item.productId}`} className="space-y-2">
                                  {isEditing ? (
                                  // Edit Mode
                                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium">Ablaufdatum:</label>
                                      <input
                                        type="date"
                                        value={editData[batchKey]?.expiryDate || ''}
                                        onChange={(e) => setEditData({
                                          ...editData,
                                          [batchKey]: { ...editData[batchKey], expiryDate: e.target.value }
                                        })}
                                        className="w-full px-2 py-1 text-xs border rounded"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium">Batch-ID:</label>
                                      <input
                                        type="text"
                                        value={editData[batchKey]?.batchId || ''}
                                        onChange={(e) => setEditData({
                                          ...editData,
                                          [batchKey]: { ...editData[batchKey], batchId: e.target.value }
                                        })}
                                        className="w-full px-2 py-1 text-xs border rounded"
                                        placeholder="Optional"
                                      />
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleSave(item.productId, batch.batchId)}
                                        disabled={updateMhdMutation.isPending}
                                      >
                                        <Save className="h-3 w-3 mr-1" />
                                        Speichern
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCancel}
                                      >
                                        <X className="h-3 w-3 mr-1" />
                                        Abbrechen
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  // Display Mode
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1 flex-1">
                                        {batch.expiryDate && (
                                          <div className={`inline-block px-2 py-1 rounded-md text-xs border ${getExpiryStatusColor(batch.expiryDate)}`}>
                                            MHD: {new Date(batch.expiryDate).toLocaleDateString('de-DE')}
                                          </div>
                                        )}
                                        {batch.batchId && (
                                          <div className="text-xs text-muted-foreground">
                                            Batch: {batch.batchId}
                                          </div>
                                        )}
                                        <div className="text-xs text-muted-foreground">
                                          {batch.quantity || 0} Stück
                                        </div>
                                        {batch.expiryDate && (
                                          <div className="text-xs font-medium">
                                            {getExpiryStatus(batch.expiryDate)}
                                          </div>
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleEdit(item.productId, batch.batchId, batch.expiryDate)}
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">Keine Batch-Informationen verfügbar</div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(item.productId, '', '')}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              MHD hinzufügen
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine MHD-Daten verfügbar</h3>
            <p className="text-muted-foreground text-sm">
              Für diesen Automaten sind noch keine Mindesthaltbarkeitsdaten erfasst.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
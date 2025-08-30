import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { 
  ArrowLeft, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  MapPin,
  Calendar,
  User,
  Package,
  TrendingUp,
  BarChart3,
  Clock,
  Euro,
  AlertCircle,
  Trash2,
  Edit,
  Plus,
  Download,
  Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears } from "date-fns";
import { de } from "date-fns/locale";
import { 
  LineChart, 
  Line, 
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
  Cell
} from 'recharts';

// Types based on the specification
interface MachineData {
  id: number;
  machineName: string;
  vendonId: string;
  serialNumber?: string;
  machineType?: string;
  installationDate?: string;
  location?: string;
  address?: string;
  status: 'active' | 'inactive' | 'error';
}

interface TransactionData {
  id: number;
  datetime: string;
  productName: string;
  quantity: number;
  price: number;
  paymentMethod: 'CASH' | 'CASHLESS';
}

interface RefillData {
  id: number;
  datetime: string;
  status: 'completed' | 'in_progress';
  operator: string;
  notes: string;
}

interface KPIData {
  transactionCount: number;
  totalRevenue: number;
  refillCount: number;
  avgPrice: number;
}

interface SalesTimeSeries {
  date: string;
  count: number;
  revenue: number;
}

interface ProductPerformance {
  productName: string;
  count: number;
  revenue: number;
}

interface RemovedProduct {
  id: number;
  datetime: string;
  productName: string;
  removedQuantity: number;
  operator?: string;
  position?: string;
}

interface MachineCost {
  id: number;
  costType: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'quarterly' | 'weekly' | 'once';
  description: string;
  validFrom: string;
}

interface MachineStock {
  id: number;
  productName: string;
  currentQuantity: number;
  maxQuantity: number;
  lastRefill?: string;
  status: 'good' | 'warning' | 'critical';
  expiryDate?: string;
  batchId?: number;
  batchNumber?: string;
  mhdStatus?: 'ok' | 'warning' | 'expired';
}

interface MHDEntry {
  id: number;
  productName: string;
  expiryDate: string;
  quantity: number;
  status: 'good' | 'attention' | 'warning' | 'expired';
}

interface ProfitabilityData {
  grossRevenue: number;
  netRevenueWithoutDeposit: number;
  costOfGoods: number;
  locationCosts: number;
  result: number;
  margin: number;
  period: string;
}

// Helper function to calculate date ranges for time filters
function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  
  switch (period) {
    case 'heute':
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(now)
      };
    case 'gestern':
      const yesterday = subDays(now, 1);
      return {
        startDate: startOfDay(yesterday),
        endDate: endOfDay(yesterday)
      };
    case 'diese-woche':
      return {
        startDate: startOfWeek(now, { weekStartsOn: 1 }), // Monday
        endDate: endOfWeek(now, { weekStartsOn: 1 })
      };
    case 'letzte-woche':
      const lastWeek = subWeeks(now, 1);
      return {
        startDate: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        endDate: endOfWeek(lastWeek, { weekStartsOn: 1 })
      };
    case 'dieser-monat':
      return {
        startDate: startOfMonth(now),
        endDate: endOfMonth(now)
      };
    case 'letzter-monat':
      const lastMonth = subMonths(now, 1);
      return {
        startDate: startOfMonth(lastMonth),
        endDate: endOfMonth(lastMonth)
      };
    case 'dieses-jahr':
      return {
        startDate: startOfYear(now),
        endDate: endOfYear(now)
      };
    case 'letztes-jahr':
      const lastYear = subYears(now, 1);
      return {
        startDate: startOfYear(lastYear),
        endDate: endOfYear(lastYear)
      };
    default:
      return {
        startDate: startOfMonth(now),
        endDate: endOfMonth(now)
      };
  }
}

export default function AutomatDetail() {
  const [match, params] = useRoute("/automaten/:id");
  const [activeTab, setActiveTab] = useState("allgemein");
  const [editingMHD, setEditingMHD] = useState<number | null>(null);
  const [removedProductsFilter, setRemovedProductsFilter] = useState("30"); // days
  const [newCost, setNewCost] = useState({
    costType: '',
    amount: '',
    frequency: 'monthly' as const,
    description: ''
  });
  const [profitabilityPeriod, setProfitabilityPeriod] = useState('dieser-monat');
  const [stockFilter, setStockFilter] = useState('all'); // all, critical, warning, good
  const [stockSortBy, setStockSortBy] = useState('fillLevel'); // fillLevel, productName, currentQuantity
  const [stockSortOrder, setStockSortOrder] = useState('asc'); // asc, desc
  const { toast } = useToast();

  const machineId = params?.id;

  // Fetch machine basic data
  const { data: machine, isLoading: machineLoading, error: machineError, refetch: refetchMachine } = useQuery<MachineData>({
    queryKey: [`/api/machines/${machineId}`],
    enabled: !!machineId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery<TransactionData[]>({
    queryKey: [`/api/machines/${machineId}/transactions`],
    enabled: !!machineId && (activeTab === 'transaktionen' || activeTab === 'allgemein' || activeTab === 'analysen' || activeTab === 'auswertung'),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch refills
  const { data: refills, isLoading: refillsLoading } = useQuery<RefillData[]>({
    queryKey: [`/api/machines/${machineId}/refills`],
    enabled: !!machineId && activeTab === 'auffullungen',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<{
    kpis: KPIData;
    salesTimeSeries: SalesTimeSeries[];
    eventCounts: { eventType: string; count: number }[];
    productPerformance: ProductPerformance[];
    hourlyDistribution: { hour: number; count: number }[];
    weeklyRevenue: { week: string; revenue: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
  }>({
    queryKey: [`/api/machines/${machineId}/analytics`],
    enabled: !!machineId && (activeTab === 'analysen' || activeTab === 'auswertung'),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch removed products - API returns object with items array
  const { data: removedProductsResponse, isLoading: removedProductsLoading } = useQuery<{
    items: RemovedProduct[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: [`/api/machines/${machineId}/removed-products?filter=${removedProductsFilter}`],
    enabled: !!machineId && activeTab === 'entnommene-produkte',
    staleTime: 5 * 60 * 1000,
  });

  // Extract items array for frontend compatibility
  const removedProducts = removedProductsResponse?.items || [];

  // Fetch machine costs
  const { data: machineCosts, isLoading: costsLoading, refetch: refetchCosts } = useQuery<MachineCost[]>({
    queryKey: [`/api/machines/${machineId}/costs`],
    enabled: !!machineId && activeTab === 'kosten',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch current stock (Warenbestand) with enhanced error handling
  const { data: machineStock, isLoading: stockLoading, error: stockError, refetch: refetchStock } = useQuery<MachineStock[]>({
    queryKey: [`/api/machines/${machineId}/stock`],
    enabled: !!machineId && activeTab === 'warenbestand',
    staleTime: 2 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Fetch MHD entries
  const { data: mhdEntries, isLoading: mhdLoading, refetch: refetchMHD } = useQuery<MHDEntry[]>({
    queryKey: [`/api/machines/${machineId}/mhd`],
    enabled: !!machineId && activeTab === 'mhd',
    staleTime: 5 * 60 * 1000,
  });

  // Stock summary calculation with aggregation
  const stockSummary = useMemo(() => {
    if (!machineStock) return null;
    const validSlots = machineStock.filter(s => s.maxQuantity > 0);
    const totalQuantity = validSlots.reduce((sum, slot) => sum + slot.currentQuantity, 0);
    const totalCapacity = validSlots.reduce((sum, slot) => sum + slot.maxQuantity, 0);
    const fillLevel = totalCapacity > 0 ? Math.round((totalQuantity / totalCapacity) * 100) : null;
    
    // Find latest refill date
    const latestRefill = validSlots
      .filter(s => s.lastRefill)
      .map(s => new Date(s.lastRefill!))
      .sort((a, b) => b.getTime() - a.getTime())[0];
      
    return {
      totalQuantity,
      totalCapacity,
      fillLevel,
      latestRefill: latestRefill?.toISOString(),
      validSlots: validSlots.length,
      totalSlots: machineStock.length,
      invalidSlots: machineStock.filter(s => s.maxQuantity === 0 || !s.maxQuantity)
    };
  }, [machineStock]);

  // Helper function for status determination based on fill levels
  const getStatusFromFillLevel = (currentQuantity: number, maxQuantity: number): 'good' | 'warning' | 'critical' => {
    if (maxQuantity === 0 || currentQuantity === 0) return 'critical';
    const fillPercentage = (currentQuantity / maxQuantity) * 100;
    if (fillPercentage >= 70) return 'good';
    if (fillPercentage >= 40) return 'warning';
    return 'critical';
  };

  // Helper function for status badge colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary'; 
      case 'good': return 'default';
      default: return 'outline';
    }
  };

  // Filtered and sorted stock data
  const filteredAndSortedStock = useMemo(() => {
    if (!machineStock) return [];
    
    // Filter out slots with zero capacity and apply status filter
    let filtered = machineStock.filter(stock => stock.maxQuantity > 0);
    
    if (stockFilter !== 'all') {
      filtered = filtered.filter(stock => {
        const status = getStatusFromFillLevel(stock.currentQuantity, stock.maxQuantity);
        return status === stockFilter;
      });
    }
    
    // Sort data
    return filtered.sort((a, b) => {
      const aFillLevel = a.maxQuantity > 0 ? (a.currentQuantity / a.maxQuantity) * 100 : 0;
      const bFillLevel = b.maxQuantity > 0 ? (b.currentQuantity / b.maxQuantity) * 100 : 0;
      
      let comparison = 0;
      
      switch (stockSortBy) {
        case 'fillLevel':
          comparison = aFillLevel - bFillLevel;
          break;
        case 'productName':
          comparison = (a.productName || '').localeCompare(b.productName || '');
          break;
        case 'currentQuantity':
          comparison = a.currentQuantity - b.currentQuantity;
          break;
        default:
          comparison = aFillLevel - bFillLevel;
      }
      
      return stockSortOrder === 'desc' ? -comparison : comparison;
    });
  }, [machineStock, stockFilter, stockSortBy, stockSortOrder]);

  // Calculate date range for profitability analysis
  const dateRange = useMemo(() => getDateRange(profitabilityPeriod), [profitabilityPeriod]);

  // Fetch profitability data
  const { data: profitabilityData, isLoading: profitabilityLoading } = useQuery<ProfitabilityData>({
    queryKey: [`/api/machines/${machineId}/profitability`, profitabilityPeriod, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        period: profitabilityPeriod
      });
      
      const response = await fetch(`/api/machines/${machineId}/profitability?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    enabled: !!machineId && activeTab === 'wirtschaftlichkeit',
    staleTime: 2 * 60 * 1000,
  });

  // Mutations for costs
  const addCostMutation = useMutation({
    mutationFn: async (newCost: Omit<MachineCost, 'id' | 'validFrom'>) => {
      const response = await fetch(`/api/machines/${machineId}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCost),
      });
      if (!response.ok) throw new Error('Fehler beim Hinzufügen der Kosten');
      return response.json();
    },
    onSuccess: () => {
      refetchCosts();
      setNewCost({ costType: '', amount: '', frequency: 'monthly', description: '' });
      toast({ title: "Kosten hinzugefügt", description: "Die Kosten wurden erfolgreich hinzugefügt." });
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: async (costId: number) => {
      const response = await fetch(`/api/machines/${machineId}/costs/${costId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Kosten');
    },
    onSuccess: () => {
      refetchCosts();
      toast({ title: "Kosten gelöscht", description: "Die Kosten wurden erfolgreich gelöscht." });
    },
  });

  // Format functions
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Unbekannt';
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch (error) {
      console.warn('Invalid date string:', dateString);
      return 'Ungültiges Datum';
    }
  };

  const formatDateOnly = (dateString?: string | null) => {
    if (!dateString) return 'Unbekannt';
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy', { locale: de });
    } catch (error) {
      console.warn('Invalid date string:', dateString);
      return 'Ungültiges Datum';
    }
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      active: { color: 'bg-green-500', text: 'Aktiv', icon: CheckCircle },
      inactive: { color: 'bg-yellow-500', text: 'Inaktiv', icon: AlertTriangle },
      error: { color: 'bg-red-500', text: 'Fehler', icon: XCircle },
    };
    
    const { color, text, icon: Icon } = config[status as keyof typeof config] || config.inactive;
    
    return (
      <Badge className={`${color} text-white`}>
        <Icon className="h-3 w-3 mr-1" />
        {text}
      </Badge>
    );
  };

  // Loading state
  if (machineLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (machineError || !machine) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Automat nicht gefunden</h2>
          <p className="text-muted-foreground mb-4">
            Der Automat mit der ID {machineId} konnte nicht geladen werden.
          </p>
          <Button onClick={() => window.history.back()} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>
      </div>
    );
  }

  const handleRefreshAll = () => {
    refetchMachine();
    queryClient.invalidateQueries({ queryKey: [`/api/machines/${machineId}`] });
    toast({ title: "Daten aktualisiert", description: "Alle Daten wurden neu geladen." });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-optimized Header */}
      <div className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              onClick={() => window.history.back()}
              variant="ghost"
              size="sm"
              className="p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold truncate max-w-[200px] sm:max-w-none sm:text-2xl">{machine.machineName}</h1>
              <StatusBadge status={machine.status} />
            </div>
          </div>
          <Button onClick={handleRefreshAll} variant="ghost" size="sm" className="p-2">
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile-optimized Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="sticky top-[73px] z-40 bg-background border-b">
          <div className="overflow-x-auto tab-scroll">
            <TabsList className="inline-flex h-12 items-center justify-start rounded-none bg-transparent p-0 gap-0 min-w-max">
              <TabsTrigger 
                value="allgemein" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Allgemein
              </TabsTrigger>
              <TabsTrigger 
                value="transaktionen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Transaktionen
              </TabsTrigger>
              <TabsTrigger 
                value="analysen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Analysen
              </TabsTrigger>
              <TabsTrigger 
                value="auswertung"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Auswertung
              </TabsTrigger>
              <TabsTrigger 
                value="auffullungen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Auffüllungen
              </TabsTrigger>
              <TabsTrigger 
                value="mhd"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                MHD
              </TabsTrigger>
              <TabsTrigger 
                value="entnommene-produkte"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[140px] h-12"
              >
                Entfernte Produkte
              </TabsTrigger>
              <TabsTrigger 
                value="kosten"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                Kosten
              </TabsTrigger>
              <TabsTrigger 
                value="wirtschaftlichkeit"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[140px] h-12"
              >
                Wirtschaftlichkeit
              </TabsTrigger>
              <TabsTrigger 
                value="warenbestand"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[120px] h-12"
              >
                Warenbestand
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Content with proper mobile spacing */}
        <div className="px-4 py-6">
        
        {/* Allgemein Tab */}
        <TabsContent value="allgemein" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stammdaten Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Stammdaten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Name des Automaten</Label>
                  <p className="font-medium">{machine.machineName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Vendon ID</Label>
                  <p className="font-medium">{machine.vendonId}</p>
                </div>
                {machine.serialNumber && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Seriennummer</Label>
                    <p className="font-medium">{machine.serialNumber}</p>
                  </div>
                )}
                {machine.machineType && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Typ</Label>
                    <p className="font-medium">{machine.machineType}</p>
                  </div>
                )}
                {machine.installationDate && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Installationsdatum</Label>
                    <p className="font-medium">{formatDateOnly(machine.installationDate)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Standort Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Standortinformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {machine.location && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Standortname</Label>
                    <p className="font-medium">{machine.location}</p>
                  </div>
                )}
                {machine.address && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Adresse</Label>
                    <p className="font-medium">{machine.address}</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full">
                  <MapPin className="h-4 w-4 mr-2" />
                  Auf Karte anzeigen
                </Button>
              </CardContent>
            </Card>

            {/* KPI Overview (if analytics loaded) */}
            {analytics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Leistungskennzahlen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Verkäufe heute</Label>
                    <p className="text-2xl font-bold">{analytics?.kpis?.transactionCount || 0}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Umsatz heute</Label>
                    <p className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.totalRevenue || 0)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Durchschnittspreis</Label>
                    <p className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.avgPrice || 0)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Umsatzentwicklung Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Umsatzentwicklung (letzte 30 Tage)</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : analytics?.salesTimeSeries?.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.salesTimeSeries || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                      formatter={(value, name) => [
                        name === 'revenue' ? formatCurrency(Number(value)) : value,
                        name === 'revenue' ? 'Umsatz' : 'Verkäufe'
                      ]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" name="Verkäufe" strokeWidth={2} />
                    <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Umsatz" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                  Keine Umsatzdaten für den gewählten Zeitraum
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaktionen Tab */}
        <TabsContent value="transaktionen" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Transaktionshistorie</h2>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
          </div>

          {transactionsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Preis</TableHead>
                      <TableHead>Zahlungsart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDate(transaction.datetime)}</TableCell>
                        <TableCell>{transaction.productName}</TableCell>
                        <TableCell>{transaction.quantity}x</TableCell>
                        <TableCell>{formatCurrency(transaction.price)}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.paymentMethod === 'CASH' ? 'secondary' : 'default'}>
                            {transaction.paymentMethod === 'CASH' ? 'Bar' : 'Cashless'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine Transaktionen gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analysen Tab */}
        <TabsContent value="analysen" className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Verkäufe</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.kpis?.transactionCount || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Umsatz</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.totalRevenue || 0)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Auffüllungen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.kpis?.refillCount || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Durchschnittspreis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.avgPrice || 0)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Sales Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Verkaufstrend</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics?.salesTimeSeries?.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analytics.salesTimeSeries}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" name="Verkäufe" />
                        <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Umsatz" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                      Keine Verkaufstrend-Daten verfügbar
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Event Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>Ereignis-Analyse</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.eventCounts?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.eventCounts}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ eventType, count }) => `${eventType}: ${count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {analytics.eventCounts.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={["#8884d8","#82ca9d","#ffc658","#ff7300","#00ff00"][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                      Keine Ereignis-Daten verfügbar
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Keine Analyse-Daten verfügbar
            </div>
          )}
        </TabsContent>

        {/* Auswertung Tab */}
        <TabsContent value="auswertung" className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Weekly Revenue */}
                <Card>
                  <CardHeader>
                    <CardTitle>Wöchentlicher Ertrag</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.weeklyRevenue?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analytics.weeklyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Bar dataKey="revenue" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine wöchentlichen Ertragsdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Monthly Revenue */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monatlicher Ertrag</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.monthlyRevenue?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={analytics.monthlyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Line type="monotone" dataKey="revenue" stroke="#82ca9d" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine monatlichen Ertragsdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Hourly Sales Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Verkaufszeiten</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.hourlyDistribution?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analytics.hourlyDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#ffc658" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine Verkaufszeitdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top Products */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Verkaufte Produkte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.productPerformance?.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.productPerformance.slice(0, 5).map((product, index) => (
                          <div key={product.productName} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                              <span className="font-medium">{product.productName}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{product.count}x</div>
                              <div className="text-sm text-muted-foreground">{formatCurrency(product.revenue)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine Produktperformance-Daten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Keine Auswertungsdaten verfügbar
            </div>
          )}
        </TabsContent>

        {/* Auffüllungen Tab */}
        <TabsContent value="auffullungen" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Auffüllungshistorie</h2>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
          </div>

          {refillsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Notizen</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refills?.map((refill) => (
                      <TableRow key={refill.id}>
                        <TableCell>{formatDate(refill.datetime)}</TableCell>
                        <TableCell>
                          <Badge variant={refill.status === 'completed' ? 'default' : 'secondary'}>
                            {refill.status === 'completed' ? 'Abgeschlossen' : 'In Bearbeitung'}
                          </Badge>
                        </TableCell>
                        <TableCell>{refill.operator}</TableCell>
                        <TableCell>{refill.notes}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine Auffüllungen gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MHD Tab */}
        <TabsContent value="mhd" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Mindesthaltbarkeitsdaten</h2>
          </div>

          {mhdLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>MHD</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mhdEntries?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.productName}</TableCell>
                        <TableCell>{formatDateOnly(entry.expiryDate)}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              entry.status === 'expired' ? 'destructive' :
                              entry.status === 'warning' ? 'secondary' :
                              entry.status === 'attention' ? 'outline' : 'default'
                            }
                          >
                            {entry.status === 'expired' ? 'Abgelaufen' :
                             entry.status === 'warning' ? 'Warnung' :
                             entry.status === 'attention' ? 'Aufmerksamkeit' : 'Gut'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingMHD(entry.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine MHD-Einträge gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Entfernte Produkte Tab */}
        <TabsContent value="entnommene-produkte" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Entnommene Produkte</h2>
            <div className="flex items-center space-x-2">
              <Select value={removedProductsFilter} onValueChange={setRemovedProductsFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Tage</SelectItem>
                  <SelectItem value="30">30 Tage</SelectItem>
                  <SelectItem value="90">90 Tage</SelectItem>
                  <SelectItem value="365">1 Jahr</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportieren
              </Button>
            </div>
          </div>

          {removedProductsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Entfernte Anzahl</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {removedProducts?.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{formatDate(product.datetime)}</TableCell>
                        <TableCell>{product.productName}</TableCell>
                        <TableCell>{product.removedQuantity}</TableCell>
                        <TableCell>{product.operator || '-'}</TableCell>
                        <TableCell>{product.position || '-'}</TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine entnommenen Produkte gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Kosten Tab */}
        <TabsContent value="kosten" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Laufende Kosten</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Kosten hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue Kosten hinzufügen</DialogTitle>
                  <DialogDescription>
                    Fügen Sie neue laufende Kosten für diesen Automaten hinzu.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!newCost.costType.trim() || !newCost.amount.trim()) {
                    toast({
                      title: "Validierungsfehler",
                      description: "Kostenart und Betrag sind erforderlich.",
                      variant: "destructive"
                    });
                    return;
                  }
                  addCostMutation.mutate({
                    costType: newCost.costType,
                    amount: parseFloat(newCost.amount),
                    frequency: newCost.frequency,
                    description: newCost.description
                  });
                }} className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="costType">Kostenart *</Label>
                      <Input 
                        id="costType" 
                        value={newCost.costType}
                        onChange={(e) => setNewCost(prev => ({ ...prev, costType: e.target.value }))}
                        placeholder="z.B. Miete, Strom, Wartung"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="amount">Betrag (€) *</Label>
                      <Input 
                        id="amount" 
                        type="number" 
                        step="0.01"
                        value={newCost.amount}
                        onChange={(e) => setNewCost(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="frequency">Häufigkeit</Label>
                      <Select value={newCost.frequency} onValueChange={(value) => setNewCost(prev => ({ ...prev, frequency: value as any }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monatlich</SelectItem>
                          <SelectItem value="yearly">Jährlich</SelectItem>
                          <SelectItem value="quarterly">Vierteljährlich</SelectItem>
                          <SelectItem value="weekly">Wöchentlich</SelectItem>
                          <SelectItem value="once">Einmalig</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="description">Beschreibung</Label>
                      <Input 
                        id="description" 
                        value={newCost.description}
                        onChange={(e) => setNewCost(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Weitere Details (optional)"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setNewCost({ costType: '', amount: '', frequency: 'monthly', description: '' });
                      }}
                    >
                      Zurücksetzen
                    </Button>
                    <Button type="submit" disabled={addCostMutation.isPending}>
                      {addCostMutation.isPending ? 'Speichern...' : 'Hinzufügen'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {costsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostenart</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Häufigkeit</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Gültig ab</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machineCosts?.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell>{cost.costType}</TableCell>
                        <TableCell>{formatCurrency(cost.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cost.frequency === 'monthly' ? 'Monatlich' :
                             cost.frequency === 'yearly' ? 'Jährlich' :
                             cost.frequency === 'quarterly' ? 'Quartalsweise' :
                             cost.frequency === 'weekly' ? 'Wöchentlich' : 'Einmalig'}
                          </Badge>
                        </TableCell>
                        <TableCell>{cost.description}</TableCell>
                        <TableCell>{formatDateOnly(cost.validFrom)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => deleteCostMutation.mutate(cost.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Keine Kosten definiert
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Wirtschaftlichkeit Tab */}
        <TabsContent value="wirtschaftlichkeit" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Rentabilitätsanalyse</h2>
            <div className="flex items-center space-x-2">
              <Select value={profitabilityPeriod} onValueChange={setProfitabilityPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Zeitraum wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="heute">Heute</SelectItem>
                  <SelectItem value="gestern">Gestern</SelectItem>
                  <SelectItem value="diese-woche">Diese Woche</SelectItem>
                  <SelectItem value="letzte-woche">Letzte Woche</SelectItem>
                  <SelectItem value="dieser-monat">Dieser Monat</SelectItem>
                  <SelectItem value="letzter-monat">Letzter Monat</SelectItem>
                  <SelectItem value="dieses-jahr">Dieses Jahr</SelectItem>
                  <SelectItem value="letztes-jahr">Letztes Jahr</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {profitabilityLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : profitabilityData ? (
            <>
              {/* Profitability Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Umsatz Brutto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(profitabilityData.grossRevenue)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Umsatz Netto ohne Pfand</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-cyan-600">
                      {formatCurrency(profitabilityData.netRevenueWithoutDeposit)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Wareneinsatz</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {formatCurrency(profitabilityData.costOfGoods)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Standort-Kosten (Netto)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(profitabilityData.locationCosts)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Ergebnis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${
                      profitabilityData.result >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(profitabilityData.result)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {profitabilityData.margin.toFixed(1)}% Marge
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Profitability Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Rentabilitätsübersicht - {profitabilityData.period}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        {
                          name: 'Umsatz Brutto',
                          value: profitabilityData.grossRevenue,
                          color: '#3B82F6'
                        },
                        {
                          name: 'Umsatz Netto',
                          value: profitabilityData.netRevenueWithoutDeposit,
                          color: '#06B6D4'
                        },
                        {
                          name: 'Wareneinsatz',
                          value: -profitabilityData.costOfGoods,
                          color: '#F97316'
                        },
                        {
                          name: 'Standort-Kosten',
                          value: -profitabilityData.locationCosts,
                          color: '#EF4444'
                        },
                        {
                          name: 'Ergebnis',
                          value: profitabilityData.result,
                          color: profitabilityData.result >= 0 ? '#10B981' : '#EF4444'
                        }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis 
                          tickFormatter={(value) => formatCurrency(value)}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(Math.abs(value)), '']}
                          labelStyle={{ color: '#000' }}
                        />
                        <Bar dataKey="value">
                          {[
                            { name: 'Umsatz Brutto', value: profitabilityData.grossRevenue, color: '#3B82F6' },
                            { name: 'Umsatz Netto', value: profitabilityData.netRevenueWithoutDeposit, color: '#06B6D4' },
                            { name: 'Wareneinsatz', value: -profitabilityData.costOfGoods, color: '#F97316' },
                            { name: 'Standort-Kosten', value: -profitabilityData.locationCosts, color: '#EF4444' },
                            { name: 'Ergebnis', value: profitabilityData.result, color: profitabilityData.result >= 0 ? '#10B981' : '#EF4444' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Summary and Analysis */}
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Analyse für {profitabilityData.period}:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p><strong>Umsatzrentabilität:</strong> {profitabilityData.margin.toFixed(1)}%</p>
                        <p><strong>Deckungsbeitrag:</strong> {formatCurrency(profitabilityData.netRevenueWithoutDeposit - profitabilityData.costOfGoods)}</p>
                      </div>
                      <div>
                        <p><strong>Kostenverhältnis:</strong> {((profitabilityData.locationCosts + profitabilityData.costOfGoods) / profitabilityData.grossRevenue * 100).toFixed(1)}%</p>
                        <p className={`font-medium ${
                          profitabilityData.result >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <strong>Status:</strong> {profitabilityData.result >= 0 ? 'Gewinnbringend' : 'Verlustbringend'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Keine Rentabilitätsdaten für den ausgewählten Zeitraum verfügbar.</p>
                  <p className="text-sm mt-2">Wählen Sie einen anderen Zeitraum oder prüfen Sie die Datenverfügbarkeit.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Enhanced Warenbestand Tab */}
        <TabsContent value="warenbestand" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-semibold">Aktueller Warenbestand</h2>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetchStock()}
                disabled={stockLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${stockLoading ? 'animate-spin' : ''}`} />
                Bestand synchronisieren
              </Button>
            </div>
          </div>

          {/* Error State */}
          {stockError && (
            <Card className="border-red-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Fehler beim Laden der Bestandsdaten</p>
                    <p className="text-sm text-red-500 mt-1">
                      {stockError instanceof Error ? stockError.message : 'Unbekannter Fehler'}
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetchStock()}
                    className="ml-auto"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Wiederholen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {stockLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" /> {/* Summary card skeleton */}
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : stockSummary && (
            <>
              {/* Stock Overview Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Bestandsübersicht - {machine?.machineName || 'Unbekannter Automat'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Gesamtbestand</p>
                      <p className="text-2xl font-bold">{stockSummary.totalQuantity}</p>
                      <p className="text-xs text-muted-foreground">Stück</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Gesamtkapazität</p>
                      <p className="text-2xl font-bold">{stockSummary.totalCapacity}</p>
                      <p className="text-xs text-muted-foreground">Stück</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Füllstand</p>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl font-bold">
                          {stockSummary.fillLevel !== null ? `${stockSummary.fillLevel}%` : 'n/a'}
                        </p>
                        {stockSummary.fillLevel !== null && (
                          <div 
                            className={`h-3 w-3 rounded-full ${
                              stockSummary.fillLevel >= 70 ? 'bg-green-500' :
                              stockSummary.fillLevel >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} 
                          />
                        )}
                      </div>
                      {stockSummary.fillLevel !== null && (
                        <Progress 
                          value={stockSummary.fillLevel} 
                          className="h-2" 
                          aria-label={`Füllstand ${stockSummary.fillLevel}%`}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Letzte Auffüllung</p>
                      <p className="text-lg font-semibold">
                        {stockSummary.latestRefill ? formatDate(stockSummary.latestRefill) : '-'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stockSummary.validSlots} von {stockSummary.totalSlots} Slots aktiv
                      </p>
                    </div>
                  </div>

                  {/* Warning for invalid slots */}
                  {stockSummary.invalidSlots.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {stockSummary.invalidSlots.length} Slots ohne Kapazitätsinformation werden nicht angezeigt
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Controls and Filters */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <Select value={stockFilter} onValueChange={setStockFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status filtern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle anzeigen</SelectItem>
                      <SelectItem value="critical">Kritisch</SelectItem>
                      <SelectItem value="warning">Niedrig</SelectItem>
                      <SelectItem value="good">Gut</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={stockSortBy} onValueChange={setStockSortBy}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sortieren nach" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fillLevel">Füllstand</SelectItem>
                      <SelectItem value="productName">Produktname</SelectItem>
                      <SelectItem value="currentQuantity">Bestand</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStockSortOrder(stockSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    {stockSortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>

              {/* Enhanced Stock Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead className="text-right">Bestand</TableHead>
                          <TableHead className="text-right">Max. Kapazität</TableHead>
                          <TableHead>Füllstand</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>MHD</TableHead>
                          <TableHead>Letzte Auffüllung</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSortedStock.length > 0 ? (
                          filteredAndSortedStock.map((stock) => {
                            const fillPercentage = stock.maxQuantity > 0 
                              ? Math.round((stock.currentQuantity / stock.maxQuantity) * 100) 
                              : 0;
                            const status = getStatusFromFillLevel(stock.currentQuantity, stock.maxQuantity);
                            
                            return (
                              <TableRow key={stock.id}>
                                <TableCell className="font-medium">
                                  {stock.productName || 'Unbekanntes Produkt'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={fillPercentage < 20 ? 'font-semibold text-red-600' : ''}>
                                    {stock.currentQuantity}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">{stock.maxQuantity}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="w-16 bg-gray-200 rounded-full h-2">
                                      <div 
                                        className={`h-2 rounded-full transition-all ${
                                          status === 'good' ? 'bg-green-500' :
                                          status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(fillPercentage, 100)}%` }}
                                      />
                                    </div>
                                    <span className={`text-sm font-medium ${
                                      status === 'critical' ? 'text-red-600' : 
                                      status === 'warning' ? 'text-yellow-600' : 'text-green-600'
                                    }`}>
                                      {fillPercentage}%
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={getStatusColor(status) as any}>
                                    {status === 'critical' ? 'Kritisch' :
                                     status === 'warning' ? 'Niedrig' : 'Gut'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {stock.expiryDate ? (
                                    <div className="flex items-center gap-1">
                                      <span className={
                                        stock.mhdStatus === 'expired' ? 'text-red-600 font-semibold' :
                                        stock.mhdStatus === 'warning' ? 'text-yellow-600 font-medium' : 
                                        'text-gray-600'
                                      }>
                                        {formatDateOnly(stock.expiryDate)}
                                      </span>
                                      {stock.mhdStatus === 'expired' && (
                                        <Badge variant="destructive" className="text-xs">ABGELAUFEN</Badge>
                                      )}
                                      {stock.mhdStatus === 'warning' && (
                                        <Badge variant="outline" className="text-xs text-yellow-600">BALD</Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">–</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {stock.lastRefill ? formatDate(stock.lastRefill) : '–'}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              <div className="flex flex-col items-center gap-2">
                                <Package className="h-8 w-8 opacity-50" />
                                <p>Keine Bestandsdaten verfügbar</p>
                                <p className="text-sm">
                                  {stockFilter === 'all' 
                                    ? 'Überprüfen Sie die Datenverfügbarkeit oder synchronisieren Sie den Bestand.' 
                                    : `Keine Produkte mit Status "${stockFilter}" gefunden.`}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        
        </div> {/* Close content wrapper */}
      </Tabs>
    </div>
  );
}
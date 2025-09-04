import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { 
  Activity,
  AlertCircle,
  AlertTriangle, 
  ArrowLeft, 
  BarChart3,
  Battery,
  Calendar,
  CheckCircle, 
  Clock,
  Copy,
  Download,
  Edit,
  Euro,
  Eye,
  EyeOff,
  Filter,
  Info,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw, 
  Save,
  Settings,
  Share,
  Thermometer,
  Trash2,
  TrendingUp,
  User,
  Wifi,
  XCircle
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

interface RefillTemplate {
  id: number;
  name: string;
  machineId: number;
  machineName: string;
  vendonId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  products: RefillTemplateProduct[];
}

interface RefillTemplateProduct {
  productId: number;
  productName: string;
  quantity: number;
  minRefill: number;
  maxCapacity: number;
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
  const [activeTab, setActiveTab] = useState("status");
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
  const [refillTemplateFilter, setRefillTemplateFilter] = useState('all'); // all, default, custom
  const [refillTemplateSearch, setRefillTemplateSearch] = useState('');
  const [newRefillTemplate, setNewRefillTemplate] = useState({
    name: '',
    description: ''
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<number>>(new Set());
  const [editingProduct, setEditingProduct] = useState<{ templateId: number; productId: number } | null>(null);
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
    enabled: !!machineId && (activeTab === 'transaktionen' || activeTab === 'status' || activeTab === 'analysen' || activeTab === 'auswertung'),
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
    enabled: !!machineId && (activeTab === 'status' || activeTab === 'analysen' || activeTab === 'auswertung'),
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

  // Fetch refill templates
  const { data: refillTemplates, isLoading: refillTemplatesLoading, refetch: refetchRefillTemplates } = useQuery<RefillTemplate[]>({
    queryKey: [`/api/machines/${machineId}/refilltemplates`],
    enabled: !!machineId && activeTab === 'refill-vorlagen',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch cash data
  const { data: cashData, isLoading: cashLoading, refetch: refetchCash } = useQuery<any>({
    queryKey: [`/api/machines/${machineId}/cash`],
    enabled: !!machineId && activeTab === 'cash',
    staleTime: 2 * 60 * 1000, // 2 minutes stale time for cash data
  });

  // Fetch status data
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<any>({
    queryKey: [`/api/machines/${machineId}/status`],
    enabled: !!machineId && activeTab === 'status',
    staleTime: 1 * 60 * 1000, // 1 minute stale time for status data
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

  // Filtered and sorted refill templates
  const filteredRefillTemplates = useMemo(() => {
    if (!refillTemplates) return [];
    
    let filtered = refillTemplates;
    
    // Apply filter
    if (refillTemplateFilter === 'default') {
      filtered = filtered.filter(template => template.isDefault);
    } else if (refillTemplateFilter === 'custom') {
      filtered = filtered.filter(template => !template.isDefault);
    }
    
    // Apply search
    if (refillTemplateSearch) {
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(refillTemplateSearch.toLowerCase())
      );
    }
    
    return filtered;
  }, [refillTemplates, refillTemplateFilter, refillTemplateSearch]);

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

  // Mutations for refill templates
  const addRefillTemplateMutation = useMutation({
    mutationFn: async (template: { name: string; description?: string }) => {
      const response = await fetch(`/api/machines/${machineId}/refilltemplates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      if (!response.ok) throw new Error('Fehler beim Erstellen der Refill-Vorlage');
      return response.json();
    },
    onSuccess: () => {
      refetchRefillTemplates();
      setNewRefillTemplate({ name: '', description: '' });
      toast({ title: "Refill-Vorlage erstellt", description: "Die Refill-Vorlage wurde erfolgreich erstellt." });
    },
  });

  const deleteRefillTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/machines/${machineId}/refilltemplates/${templateId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Refill-Vorlage');
    },
    onSuccess: () => {
      refetchRefillTemplates();
      toast({ title: "Refill-Vorlage gelöscht", description: "Die Refill-Vorlage wurde erfolgreich gelöscht." });
    },
  });

  const setDefaultTemplateMutation = useMutation({
    mutationFn: async ({ templateId, isDefault }: { templateId: number; isDefault: boolean }) => {
      const response = await fetch(`/api/machines/${machineId}/refilltemplates/${templateId}/default`, {
        method: isDefault ? 'POST' : 'DELETE',
      });
      if (!response.ok) throw new Error('Fehler beim Setzen der Standard-Vorlage');
    },
    onSuccess: () => {
      refetchRefillTemplates();
      toast({ title: "Standard-Vorlage aktualisiert", description: "Die Standard-Vorlage wurde erfolgreich geändert." });
    },
  });

  const updateProductQuantityMutation = useMutation({
    mutationFn: async ({ templateId, productId, quantity }: { templateId: number; productId: number; quantity: number }) => {
      console.log('Updating product quantity:', { templateId, productId, quantity });
      const response = await fetch(`/api/machines/${machineId}/refill-templates/${templateId}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      if (!response.ok) throw new Error('Fehler beim Aktualisieren der Produktmenge');
      const result = await response.json();
      console.log('Product quantity update result:', result);
      return result;
    },
    onSuccess: () => {
      console.log('Product quantity update successful, invalidating cache');
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machineId}/refilltemplates`] });
    },
    onError: (error) => {
      console.error('Product quantity update error:', error);
      toast({ title: "Fehler", description: "Die Produktmenge konnte nicht aktualisiert werden.", variant: "destructive" });
    },
  });

  const syncWithVendonMutation = useMutation({
    mutationFn: async (templateId: number) => {
      console.log('Syncing template to Vendon:', { templateId, machineId });
      const response = await fetch(`/api/machines/${machineId}/refill-templates/${templateId}/sync-to-vendon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fehler beim Synchronisieren mit Vendon');
      }
      const result = await response.json();
      console.log('Vendon sync result:', result);
      return result;
    },
    onSuccess: () => {
      console.log('Vendon sync successful, refreshing templates');
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machineId}/refilltemplates`] });
      toast({ title: "Mit Vendon synchronisiert", description: "Die Vorlage wurde erfolgreich mit Vendon synchronisiert." });
    },
    onError: (error) => {
      console.error('Vendon sync error:', error);
      toast({ title: "Sync-Fehler", description: error.message || "Fehler beim Synchronisieren mit Vendon", variant: "destructive" });
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
                value="status"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                Status
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
              <TabsTrigger 
                value="refill-vorlagen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[120px] h-12"
              >
                Refill-Vorlagen
              </TabsTrigger>
              <TabsTrigger 
                value="cash"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                Cash
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Content with proper mobile spacing */}
        <div className="px-4 py-6">
        

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

        {/* Refill-Vorlagen Tab */}
        <TabsContent value="refill-vorlagen" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h2 className="text-xl font-semibold">Refill-Vorlagen</h2>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Vorlagen suchen..."
                value={refillTemplateSearch}
                onChange={(e) => setRefillTemplateSearch(e.target.value)}
                className="w-48"
              />
              <Select value={refillTemplateFilter} onValueChange={setRefillTemplateFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="default">Standard</SelectItem>
                  <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                </SelectContent>
              </Select>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Neue Vorlage
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neue Refill-Vorlage erstellen</DialogTitle>
                    <DialogDescription>
                      Erstellen Sie eine neue Refill-Vorlage für diesen Automaten.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (!newRefillTemplate.name.trim()) {
                      toast({
                        title: "Validierungsfehler",
                        description: "Name der Vorlage ist erforderlich.",
                        variant: "destructive"
                      });
                      return;
                    }
                    addRefillTemplateMutation.mutate(newRefillTemplate);
                  }} className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="templateName">Vorlagen-Name *</Label>
                        <Input 
                          id="templateName" 
                          value={newRefillTemplate.name}
                          onChange={(e) => setNewRefillTemplate(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="z.B. Standard-Auffüllung, Wochenende-Mix"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="templateDescription">Beschreibung</Label>
                        <Input 
                          id="templateDescription" 
                          value={newRefillTemplate.description}
                          onChange={(e) => setNewRefillTemplate(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Beschreibung der Vorlage (optional)"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setNewRefillTemplate({ name: '', description: '' });
                        }}
                      >
                        Zurücksetzen
                      </Button>
                      <Button type="submit" disabled={addRefillTemplateMutation.isPending}>
                        {addRefillTemplateMutation.isPending ? 'Erstellen...' : 'Erstellen'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {refillTemplatesLoading ? (
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
                      <TableHead>Name der Vorlage</TableHead>
                      <TableHead>Standard</TableHead>
                      <TableHead>Produkte</TableHead>
                      <TableHead>Erstellt am</TableHead>
                      <TableHead>Aktualisiert am</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefillTemplates?.map((template: RefillTemplate) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{template.name}</div>
                            {template.products?.length > 0 && (
                              <div className="text-sm text-muted-foreground">
                                {template.products.length} Produkte konfiguriert
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Badge variant={template.isDefault ? 'default' : 'outline'}>
                              {template.isDefault ? 'Standard' : 'Benutzerdefiniert'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDefaultTemplateMutation.mutate({
                                templateId: template.id,
                                isDefault: !template.isDefault
                              })}
                              disabled={setDefaultTemplateMutation.isPending}
                            >
                              {template.isDefault ? 'Entfernen' : 'Als Standard setzen'}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {template.products?.length || 0} Produkte
                        </TableCell>
                        <TableCell>{formatDate(template.createdAt)}</TableCell>
                        <TableCell>{formatDate(template.updatedAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const isExpanded = expandedTemplates.has(template.id);
                                const newExpanded = new Set(expandedTemplates);
                                if (isExpanded) {
                                  newExpanded.delete(template.id);
                                } else {
                                  newExpanded.add(template.id);
                                }
                                setExpandedTemplates(newExpanded);
                              }}
                            >
                              {expandedTemplates.has(template.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => syncWithVendonMutation.mutate(template.id)}
                              disabled={syncWithVendonMutation.isPending}
                            >
                              <Share className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                if (confirm('Sind Sie sicher, dass Sie diese Refill-Vorlage löschen möchten?')) {
                                  deleteRefillTemplateMutation.mutate(template.id);
                                }
                              }}
                              disabled={deleteRefillTemplateMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          {refillTemplateSearch ? 
                            'Keine Refill-Vorlagen gefunden, die Ihrer Suche entsprechen' :
                            'Noch keine Refill-Vorlagen erstellt'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Enhanced Template Product Details with +/- Controls */}
          {filteredRefillTemplates?.length > 0 && (
            <div className="grid gap-6">
              {filteredRefillTemplates.map((template: RefillTemplate) => (
                expandedTemplates.has(template.id) && template.products?.length > 0 && (
                  <Card key={`enhanced-${template.id}`} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Package className="h-5 w-5" />
                          {template.name}
                          {template.isDefault && (
                            <Badge variant="default">Standard-Vorlage</Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => syncWithVendonMutation.mutate(template.id)}
                            disabled={syncWithVendonMutation.isPending}
                          >
                            <Share className="h-4 w-4 mr-2" />
                            Mit Vendon sync
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const newExpanded = new Set(expandedTemplates);
                              newExpanded.delete(template.id);
                              setExpandedTemplates(newExpanded);
                            }}
                          >
                            <EyeOff className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {template.products.map((product: RefillTemplateProduct, index: number) => (
                          <Card key={`${template.id}-enhanced-${index}`} className="border shadow-sm hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <h4 className="font-medium text-lg leading-tight">{product.productName}</h4>
                                
                                {/* Quantity Controls */}
                                <div className="bg-blue-50 p-3 rounded-lg">
                                  <label className="text-sm font-medium text-blue-900 block mb-2">
                                    Auffüll-Menge
                                  </label>
                                  <div className="flex items-center justify-center space-x-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 bg-white hover:bg-blue-100"
                                      onClick={() => {
                                        const newQuantity = Math.max(0, product.quantity - 1);
                                        updateProductQuantityMutation.mutate({
                                          templateId: template.id,
                                          productId: product.id,
                                          quantity: newQuantity
                                        });
                                      }}
                                      disabled={updateProductQuantityMutation.isPending || product.quantity <= 0}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    
                                    <Input
                                      type="number"
                                      min="0"
                                      value={product.quantity}
                                      className="bg-white font-bold text-lg text-center w-[80px] h-10"
                                      onChange={(e) => {
                                        const newQuantity = parseInt(e.target.value) || 0;
                                        updateProductQuantityMutation.mutate({
                                          templateId: template.id,
                                          productId: product.id,
                                          quantity: newQuantity
                                        });
                                      }}
                                      onBlur={(e) => {
                                        const newQuantity = parseInt(e.target.value) || 0;
                                        if (newQuantity !== product.quantity) {
                                          updateProductQuantityMutation.mutate({
                                            templateId: template.id,
                                            productId: product.id,
                                            quantity: newQuantity
                                          });
                                        }
                                      }}
                                      disabled={updateProductQuantityMutation.isPending}
                                    />
                                    
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 bg-white hover:bg-blue-100"
                                      onClick={() => {
                                        const newQuantity = product.quantity + 1;
                                        updateProductQuantityMutation.mutate({
                                          templateId: template.id,
                                          productId: product.id,
                                          quantity: newQuantity
                                        });
                                      }}
                                      disabled={updateProductQuantityMutation.isPending}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Product Details */}
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                    <span className="text-gray-600">Min. Auffüllung:</span>
                                    <span className="font-medium">{product.minRefill}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                    <span className="text-gray-600">Max. Kapazität:</span>
                                    <span className="font-medium">{product.maxCapacity}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                                    <span className="text-green-700 font-medium">Füllgrad:</span>
                                    <span className="font-bold text-green-800">
                                      {product.maxCapacity > 0 ? Math.round((product.quantity / product.maxCapacity) * 100) : 0}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                      
                      {/* Template Summary */}
                      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium mb-2">Vorlagen-Zusammenfassung</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Produkte:</span>
                            <div className="font-medium">{template.products.length}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Gesamt-Menge:</span>
                            <div className="font-medium">
                              {template.products.reduce((sum, p) => sum + p.quantity, 0)}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Erstellt:</span>
                            <div className="font-medium">{formatDateOnly(template.createdAt)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Aktualisiert:</span>
                            <div className="font-medium">{formatDateOnly(template.updatedAt)}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          )}
        </TabsContent>

        {/* Cash Tab */}
        <TabsContent value="cash" className="space-y-6 mt-0">
          {cashLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : cashData?.success ? (
            <div className="space-y-6">
              {/* Low Stock Alert */}
              {cashData.data?.coins_per_tube && (
                (() => {
                  const lowStockTubes = cashData.data.coins_per_tube.filter((tube: any) => tube.count < 5);
                  return lowStockTubes.length > 0 ? (
                    <Card className="border-red-500 bg-red-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="h-5 w-5" />
                          Münzstand-Warnung
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-red-800 mb-2">
                          {lowStockTubes.length} Münzröhre{lowStockTubes.length > 1 ? 'n haben' : ' hat'} weniger als 5 Münzen:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {lowStockTubes.map((tube: any) => (
                            <Badge key={tube.tube} variant="destructive" className="text-xs">
                              {formatCurrency(tube.value / 100)}: {tube.count} Münzen
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()
              )}
              
              {/* Cash Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Euro className="h-5 w-5 text-green-600" />
                      Cash Box
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {formatCurrency(cashData.data?.cash_box || 0)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Bargeld im Automaten</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Euro className="h-5 w-5 text-blue-600" />
                      Scheine
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {formatCurrency(cashData.data?.bill_stacker || 0)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Scheine im Stapel</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Euro className="h-5 w-5 text-purple-600" />
                      Gesamt
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">
                      {formatCurrency((cashData.data?.cash_box || 0) + (cashData.data?.bill_stacker || 0))}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Gesamtes Bargeld</p>
                  </CardContent>
                </Card>
              </div>

              {/* Coin Tubes */}
              {cashData.data?.coins_per_tube && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Münzröhren
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                      {cashData.data.coins_per_tube.map((tube: any, index: number) => {
                        const isLowStock = tube.count < 5;
                        return (
                          <Card key={tube.tube || index} className={`border-2 ${isLowStock ? 'border-red-500 bg-red-50' : ''}`}>
                            <CardContent className="p-4 text-center">
                              <div className="space-y-2">
                                <div className="text-lg font-bold text-primary">
                                  {formatCurrency(tube.value / 100)} Münzen
                                </div>
                                <div className={`text-2xl font-bold ${isLowStock ? 'text-red-600' : ''}`}>
                                  {tube.count}
                                  {isLowStock && (
                                    <AlertTriangle className="h-5 w-5 text-red-600 inline ml-2" />
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Röhre {tube.tube}
                                </div>
                                <div className="text-xs font-medium text-green-600">
                                  Wert: {formatCurrency((tube.value * tube.count) / 100)}
                                </div>
                                {isLowStock && (
                                  <Badge variant="destructive" className="text-xs">
                                    ⚠️ Weniger als 5 Münzen!
                                  </Badge>
                                )}
                                {tube.critical > 0 && !isLowStock && (
                                  <Badge variant="secondary" className="text-xs">
                                    Kritisch bei {tube.critical}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bills in Stacker Details */}
              {cashData.data?.bills_in_stacker && cashData.data.bills_in_stacker.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Euro className="h-5 w-5" />
                      Scheine im Stapel
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {cashData.data.bills_in_stacker.map((bill: any, index: number) => (
                        <Card key={index} className="border">
                          <CardContent className="p-4 text-center">
                            <div className="space-y-2">
                              <div className="text-lg font-bold text-primary">
                                {formatCurrency(bill.value)} Scheine
                              </div>
                              <div className="text-2xl font-bold">
                                {bill.count}
                              </div>
                              <div className="text-xs font-medium text-blue-600">
                                Wert: {formatCurrency(bill.value * bill.count)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Coins in Cashbox */}
              {cashData.data?.coins_in_cashbox && cashData.data.coins_in_cashbox.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Münzen in der Cashbox
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                      {cashData.data.coins_in_cashbox
                        .filter((coin: any) => coin.count > 0)
                        .map((coin: any, index: number) => (
                        <Card key={index} className="border">
                          <CardContent className="p-3 text-center">
                            <div className="space-y-1">
                              <div className="text-sm font-bold text-primary">
                                {formatCurrency(coin.value)}
                              </div>
                              <div className="text-xl font-bold">
                                {coin.count}
                              </div>
                              <div className="text-xs font-medium text-green-600">
                                {formatCurrency(coin.value * coin.count)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Additional Cash Info */}
              {(cashData.data?.overpay || cashData.data?.tokens || cashData.data?.value_of_tubes || cashData.data?.value_of_refill) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Zusätzliche Informationen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {cashData.data.overpay !== undefined && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Überzahlung</Label>
                          <div className="text-xl font-bold">{formatCurrency(cashData.data.overpay)}</div>
                        </div>
                      )}
                      {cashData.data.tokens && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Token</Label>
                          <div className="text-xl font-bold">{cashData.data.tokens}</div>
                          {cashData.data.tokens_value && (
                            <div className="text-sm text-muted-foreground">
                              Wert: {formatCurrency(cashData.data.tokens_value)}
                            </div>
                          )}
                        </div>
                      )}
                      {cashData.data.value_of_tubes !== undefined && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Wert Münzröhren</Label>
                          <div className="text-xl font-bold">{formatCurrency(cashData.data.value_of_tubes)}</div>
                        </div>
                      )}
                      {cashData.data.value_of_refill !== undefined && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-muted-foreground">Nachfüllwert</Label>
                          <div className="text-xl font-bold">{formatCurrency(cashData.data.value_of_refill)}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Cash Summary Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Münzverteilung</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cashData.data?.coins_per_tube?.map((tube: any) => ({
                        name: `${formatCurrency(tube.value / 100)}`,
                        anzahl: tube.count,
                        wert: (tube.value * tube.count) / 100,
                        tube: tube.tube
                      })) || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" orientation="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip 
                          formatter={(value, name) => [
                            name === 'anzahl' ? `${value} Münzen` : formatCurrency(Number(value)),
                            name === 'anzahl' ? 'Anzahl' : 'Gesamtwert'
                          ]}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="anzahl" name="Anzahl" fill="#3b82f6" />
                        <Bar yAxisId="right" dataKey="wert" name="Wert (€)" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Cash-Daten nicht verfügbar</h3>
                <p className="text-muted-foreground">
                  Die Cash-Daten für diese Maschine konnten nicht geladen werden.
                </p>
                <Button onClick={() => refetchCash()} className="mt-4" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Erneut versuchen
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Status Tab */}
        <TabsContent value="status" className="space-y-6 mt-0">
          {statusLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : statusData?.success ? (
            <div className="space-y-6">
              {/* System Status Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Activity className="h-5 w-5 text-green-600" />
                      System
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Power</span>
                        <Badge variant={statusData.data.power ? 'default' : 'destructive'}>
                          {statusData.data.power ? 'Ein' : 'Aus'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Power Status</span>
                        <Badge variant={statusData.data.power_status === 'ON' ? 'default' : 'secondary'}>
                          {statusData.data.power_status || 'Unbekannt'}
                        </Badge>
                      </div>
                      {statusData.data.last_updated_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Zuletzt aktualisiert</span>
                          <span className="text-sm font-medium">
                            {format(new Date(statusData.data.last_updated_at * 1000), 'dd.MM.yy HH:mm', { locale: de })}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Wifi className="h-5 w-5 text-blue-600" />
                      Telemetrie
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Online</span>
                        <Badge variant={statusData.data.telemetry_unit_online ? 'default' : 'destructive'}>
                          {statusData.data.telemetry_unit_online ? 'Ja' : 'Nein'}
                        </Badge>
                      </div>
                      {statusData.data.telemetry_unit_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Unit ID</span>
                          <span className="text-sm font-medium">{statusData.data.telemetry_unit_id}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">SIM Status</span>
                        <Badge variant={statusData.data.sim_status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {statusData.data.sim_status || 'Unbekannt'}
                        </Badge>
                      </div>
                      {statusData.data.signal && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Signal</span>
                          <span className="text-sm font-medium">{statusData.data.signal}/31</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Package className="h-5 w-5 text-green-600" />
                      Warenbestand
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {statusData.data.stock_level !== undefined && (
                        <div className="text-2xl font-bold text-green-600">
                          {statusData.data.stock_level}%
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">Füllstand</div>
                      {statusData.data.stock_level !== undefined && (
                        <Progress value={statusData.data.stock_level} className="w-full" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5 text-orange-600" />
                      Aktivität
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {statusData.data.last_purchase_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Letzter Kauf</span>
                          <span className="text-sm font-medium">
                            {format(new Date(statusData.data.last_purchase_at * 1000), 'dd.MM.yy HH:mm', { locale: de })}
                          </span>
                        </div>
                      )}
                      {statusData.data.last_refill && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Letzte Befüllung</span>
                          <span className="text-sm font-medium">
                            {format(new Date(statusData.data.last_refill * 1000), 'dd.MM.yy HH:mm', { locale: de })}
                          </span>
                        </div>
                      )}
                      {statusData.data.last_cash_collection && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Letzte Entleerung</span>
                          <span className="text-sm font-medium">
                            {format(new Date(statusData.data.last_cash_collection * 1000), 'dd.MM.yy HH:mm', { locale: de })}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Peripheral Devices */}
              {statusData.data.peripheral_devices && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Peripheriegeräte
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(statusData.data.peripheral_devices).map(([deviceType, device]: [string, any]) => {
                        const getDeviceName = (type: string) => {
                          switch (type) {
                            case 'coin_changer': return 'Münzwechsler';
                            case 'cashless': return 'Kartenzahlung';
                            case 'bill_validator': return 'Scheinprüfer';
                            case 'age_verification': return 'Altersprüfung';
                            case 'comm_gateway': return 'Kommunikationsgateway';
                            default: return type.replace(/_/g, ' ');
                          }
                        };
                        
                        const getStatusColor = (status: number) => {
                          switch (status) {
                            case 1: return 'default'; // OK
                            case 2: return 'secondary'; // Warning
                            case 3: return 'destructive'; // Error
                            default: return 'outline';
                          }
                        };
                        
                        const getStatusText = (status: number) => {
                          switch (status) {
                            case 1: return 'OK';
                            case 2: return 'Warnung';
                            case 3: return 'Fehler';
                            default: return 'Unbekannt';
                          }
                        };
                        
                        return (
                          <div key={deviceType} className="space-y-2 p-3 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">{getDeviceName(deviceType)}</Label>
                              <Badge variant={getStatusColor(device.status)}>
                                {getStatusText(device.status)}
                              </Badge>
                            </div>
                            {device.serial_number && (
                              <div className="text-xs text-muted-foreground">
                                SN: {device.serial_number}
                              </div>
                            )}
                            {device.manufacturer_id && (
                              <div className="text-xs text-muted-foreground">
                                MFG: {device.manufacturer_id}
                              </div>
                            )}
                            {device.status_updated_at && (
                              <div className="text-xs text-muted-foreground">
                                Status: {format(new Date(device.status_updated_at * 1000), 'dd.MM.yy HH:mm', { locale: de })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Machine Basic Information (moved from Allgemein) */}
              {machine && (
                <>
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
                </>
              )}

              {/* Additional Status Information */}
              {statusData.data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-5 w-5" />
                      Zusätzliche Informationen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {statusData.data.has_audit !== undefined && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">Audit verfügbar</Label>
                          <Badge variant={statusData.data.has_audit ? 'default' : 'secondary'}>
                            {statusData.data.has_audit ? 'Ja' : 'Nein'}
                          </Badge>
                        </div>
                      )}
                      {statusData.data.audit_status && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">Audit Status</Label>
                          <div className="text-sm font-medium">{statusData.data.audit_status}</div>
                        </div>
                      )}
                      {statusData.data.peripheral_communication !== undefined && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">Peripheriekommunikation</Label>
                          <Badge variant={statusData.data.peripheral_communication ? 'default' : 'destructive'}>
                            {statusData.data.peripheral_communication ? 'OK' : 'Fehler'}
                          </Badge>
                        </div>
                      )}
                      {statusData.data.has_unresolved_events !== undefined && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">Ungelöste Ereignisse</Label>
                          <Badge variant={statusData.data.has_unresolved_events ? 'secondary' : 'default'}>
                            {statusData.data.has_unresolved_events ? 'Ja' : 'Keine'}
                          </Badge>
                        </div>
                      )}
                      {statusData.data.active_task && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">Aktive Aufgabe</Label>
                          <div className="text-sm font-medium">{statusData.data.active_task}</div>
                        </div>
                      )}
                      {statusData.data.in_route && (
                        <div className="space-y-1">
                          <Label className="text-sm font-medium text-muted-foreground">In Route</Label>
                          <div className="text-sm font-medium">{statusData.data.in_route}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Machine Health Indicators */}
              {(statusData.data.result?.alerts || statusData.data.result?.warnings || statusData.data.result?.errors) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Meldungen & Warnungen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {statusData.data.result.errors && statusData.data.result.errors.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-red-600 mb-2 block">Fehler</Label>
                          <div className="space-y-2">
                            {statusData.data.result.errors.map((error: any, index: number) => (
                              <div key={index} className="flex items-center gap-2 p-2 bg-red-50 rounded">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <span className="text-sm">{error.message || error}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {statusData.data.result.warnings && statusData.data.result.warnings.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-orange-600 mb-2 block">Warnungen</Label>
                          <div className="space-y-2">
                            {statusData.data.result.warnings.map((warning: any, index: number) => (
                              <div key={index} className="flex items-center gap-2 p-2 bg-orange-50 rounded">
                                <AlertTriangle className="h-4 w-4 text-orange-600" />
                                <span className="text-sm">{warning.message || warning}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {statusData.data.result.alerts && statusData.data.result.alerts.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium text-blue-600 mb-2 block">Hinweise</Label>
                          <div className="space-y-2">
                            {statusData.data.result.alerts.map((alert: any, index: number) => (
                              <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                                <Info className="h-4 w-4 text-blue-600" />
                                <span className="text-sm">{alert.message || alert}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Status-Daten nicht verfügbar</h3>
                <p className="text-muted-foreground">
                  Die Status-Daten für diese Maschine konnten nicht geladen werden.
                </p>
                <Button onClick={() => refetchStatus()} className="mt-4" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Erneut versuchen
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        </div> {/* Close content wrapper */}
      </Tabs>
    </div>
  );
}
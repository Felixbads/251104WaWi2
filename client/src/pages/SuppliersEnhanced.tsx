import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Truck, 
  Search, 
  Plus, 
  Filter, 
  Grid, 
  List, 
  AlertTriangle, 
  ExternalLink,
  Mail,
  Phone,
  Globe,
  ShoppingBag,
  Clipboard,
  Tag,
  Download,
  RefreshCw,
  Info as InfoIcon,
  MapPin,
  CalendarClock,
  X,
  CheckCircle,
  PackageCheck,
  Edit,
  Trash2,
  FileSpreadsheet,
  Upload,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Package,
  Calendar,
  BarChart3,
  Users,
  Eye
} from "lucide-react";
import { ExportImportButtons } from "@/components/ExportImportButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogClose 
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier, Supplier } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

// Types for enhanced supplier data
interface SupplierAnalytics {
  productsCount: number;
  currentYearSales: number;
  currentYearRevenue: number;
  lastYearSales: number;
  lastYearRevenue: number;
  salesGrowth: number;
  revenueGrowth: number;
  recentSales: number;
  recentRevenue: number;
  activeProducts: number;
  lowStockCount: number;
  topProducts: Array<{
    product_name: string;
    sales_count: number;
    revenue: number;
  }>;
}

interface EnhancedSupplier extends Supplier {
  analytics?: SupplierAnalytics;
}

// Filter and sort types
interface FilterState {
  status: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  stockLevel: string | null;
  salesRange: string | null;
}

const defaultFilters: FilterState = {
  status: null,
  sortBy: 'currentYearRevenue',
  sortOrder: 'desc',
  stockLevel: null,
  salesRange: null,
};

// Enhanced supplier card component with analytics
const EnhancedSupplierCard = ({ 
  supplier, 
  onEdit, 
  onDelete 
}: { 
  supplier: EnhancedSupplier; 
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}) => {
  const navigate = useLocation()[1];
  
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isClickableElement = 
      target.tagName === 'A' || 
      target.tagName === 'BUTTON' ||
      target.closest('a') || 
      target.closest('button');
    
    if (!isClickableElement) {
      navigate(`/lieferanten/${supplier.id}`);
    }
  };

  const analytics = supplier.analytics;
  const hasLowStock = analytics && analytics.lowStockCount > 0;
  const hasGrowth = analytics && analytics.salesGrowth > 0;
  
  return (
    <Card className={`hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 ${
      hasLowStock ? 'border-l-red-500' : hasGrowth ? 'border-l-green-500' : 'border-l-blue-500'
    }`} onClick={handleCardClick}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">{supplier.name}</CardTitle>
            {supplier.city && (
              <CardDescription className="flex items-center text-sm text-gray-600 mt-1">
                <MapPin className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                {supplier.city}
              </CardDescription>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={supplier.status} />
            {hasLowStock && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Niedriger Bestand
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 pb-3">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 flex items-center">
                <Package className="h-3 w-3 mr-1" />
                Produkte
              </span>
              {hasLowStock && (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              )}
            </div>
            <div className="text-lg font-semibold">{analytics?.productsCount || 0}</div>
            {hasLowStock && (
              <div className="text-xs text-red-600">{analytics?.lowStockCount} niedrig</div>
            )}
          </div>
          
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-blue-600 flex items-center mb-1">
              <DollarSign className="h-3 w-3 mr-1" />
              Jahresumsatz
            </div>
            <div className="text-lg font-semibold text-blue-700">
              €{analytics?.currentYearRevenue?.toLocaleString() || '0'}
            </div>
            {analytics?.revenueGrowth !== undefined && (
              <div className={`text-xs flex items-center ${
                analytics.revenueGrowth > 0 ? 'text-green-600' : 
                analytics.revenueGrowth < 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                {analytics.revenueGrowth > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> :
                 analytics.revenueGrowth < 0 ? <TrendingDown className="h-3 w-3 mr-1" /> :
                 <Minus className="h-3 w-3 mr-1" />}
                {analytics.revenueGrowth > 0 ? '+' : ''}{analytics.revenueGrowth}%
              </div>
            )}
          </div>
        </div>

        {/* Recent Performance */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">30-Tage Verkäufe</div>
            <div className="text-sm font-medium">{analytics?.recentSales || 0}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">30-Tage Umsatz</div>
            <div className="text-sm font-medium">€{analytics?.recentRevenue?.toLocaleString() || '0'}</div>
          </div>
        </div>

        {/* Top Products Preview */}
        {analytics?.topProducts && analytics.topProducts.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs text-gray-600 mb-2 flex items-center">
              <BarChart3 className="h-3 w-3 mr-1" />
              Top-Produkte (90 Tage)
            </div>
            <div className="space-y-1">
              {analytics.topProducts.slice(0, 2).map((product, index) => (
                <div key={index} className="flex justify-between text-xs">
                  <span className="truncate flex-1 mr-2">{product.product_name}</span>
                  <span className="text-gray-600">{product.sales_count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="pt-2 border-t">
        <div className="flex gap-2 w-full">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/lieferanten/${supplier.id}`);
            }}
          >
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(supplier);
            }}
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(supplier);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  let variant: "default" | "outline" | "secondary" | "destructive" = "default";
  let className = "";

  switch (status) {
    case "active":
      variant = "default";
      className = "bg-green-500 hover:bg-green-700 text-white";
      break;
    case "inactive":
      variant = "secondary";
      break;
    default:
      variant = "outline";
  }

  return (
    <Badge variant={variant} className={className}>
      {status === "active" ? "Aktiv" : 
       status === "inactive" ? "Inaktiv" : status}
    </Badge>
  );
};

// Enhanced filter dialog
const EnhancedFilterDialog = ({ 
  isOpen, 
  onOpenChange, 
  onApplyFilters, 
  currentFilters 
}: { 
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: FilterState) => void;
  currentFilters: FilterState;
}) => {
  const [filters, setFilters] = useState<FilterState>(currentFilters);

  const applyFilters = () => {
    onApplyFilters(filters);
    onOpenChange(false);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Erweiterte Filter</DialogTitle>
          <DialogDescription>
            Filtern und sortieren Sie Lieferanten nach verschiedenen Kriterien und Leistungsmetriken.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={filters.status || 'alle'} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, status: value === 'alle' ? null : value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Lagerbestand</label>
              <Select value={filters.stockLevel || 'alle'} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, stockLevel: value === 'alle' ? null : value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="low">Niedriger Bestand</SelectItem>
                  <SelectItem value="normal">Normaler Bestand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Sortieren nach</label>
            <Select value={filters.sortBy} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, sortBy: value }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="currentYearRevenue">Jahresumsatz</SelectItem>
                <SelectItem value="currentYearSales">Jahresverkäufe</SelectItem>
                <SelectItem value="revenueGrowth">Umsatzwachstum</SelectItem>
                <SelectItem value="productsCount">Anzahl Produkte</SelectItem>
                <SelectItem value="recentSales">Aktuelle Verkäufe</SelectItem>
                <SelectItem value="city">Stadt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Reihenfolge</label>
            <Select value={filters.sortOrder} onValueChange={(value: 'asc' | 'desc') => 
              setFilters(prev => ({ ...prev, sortOrder: value }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Aufsteigend</SelectItem>
                <SelectItem value="desc">Absteigend</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={resetFilters}>Zurücksetzen</Button>
          <Button onClick={applyFilters}>Filter anwenden</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Enhanced grid skeleton
const EnhancedSupplierGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-5 w-1/2" />
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div>
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <div className="flex gap-2 w-full">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 w-10" />
              <Skeleton className="h-8 w-10" />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

// Main enhanced suppliers page
export default function SuppliersEnhanced() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentFilters, setCurrentFilters] = useState<FilterState>(defaultFilters);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'delete'>('create');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch suppliers with analytics
  const { data: suppliersData, isLoading, error } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: 30000, // 30 seconds
  });

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    // Handle different API response formats
    const suppliers = Array.isArray(suppliersData) ? suppliersData : 
                     (suppliersData?.data && Array.isArray(suppliersData.data)) ? suppliersData.data : [];
    
    if (suppliers.length === 0) return [];
    
    let filtered = suppliers.filter((supplier: EnhancedSupplier) => {
      // Text search
      const matchesSearch = !searchTerm || [
        supplier.name,
        supplier.city,
        supplier.email,
        supplier.contactPerson
      ].some(field => 
        field?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      // Status filter
      const matchesStatus = !currentFilters.status || supplier.status === currentFilters.status;
      
      // Stock level filter
      const matchesStockLevel = !currentFilters.stockLevel || 
        (currentFilters.stockLevel === 'low' && supplier.lowStockCount > 0) ||
        (currentFilters.stockLevel === 'normal' && (!supplier.lowStockCount || supplier.lowStockCount === 0));
      
      return matchesSearch && matchesStatus && matchesStockLevel;
    });

    // Sort suppliers
    filtered.sort((a: EnhancedSupplier, b: EnhancedSupplier) => {
      let aValue: any, bValue: any;
      
      switch (currentFilters.sortBy) {
        case 'currentYearRevenue':
          aValue = a.currentYearRevenue || 0;
          bValue = b.currentYearRevenue || 0;
          break;
        case 'currentYearSales':
          aValue = a.currentYearSales || 0;
          bValue = b.currentYearSales || 0;
          break;
        case 'revenueGrowth':
          aValue = a.revenueGrowth || 0;
          bValue = b.revenueGrowth || 0;
          break;
        case 'productsCount':
          aValue = a.productsCount || 0;
          bValue = b.productsCount || 0;
          break;
        case 'recentSales':
          aValue = a.recentSales || 0;
          bValue = b.recentSales || 0;
          break;
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'city':
          aValue = a.city?.toLowerCase() || '';
          bValue = b.city?.toLowerCase() || '';
          break;
        default:
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
      }
      
      if (typeof aValue === 'string') {
        return currentFilters.sortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return currentFilters.sortOrder === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
    });
    
    return filtered;
  }, [suppliersData?.data, searchTerm, currentFilters]);

  const handleCreateSupplier = () => {
    setSelectedSupplier(null);
    setDialogMode('create');
    setIsFormDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setDialogMode('edit');
    setIsFormDialogOpen(true);
  };

  const handleDeleteSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDeleteDialogOpen(true);
  };

  const handleApplyFilters = (filters: FilterState) => {
    setCurrentFilters(filters);
  };

  // Summary statistics
  const stats = useMemo(() => {
    if (!suppliersData?.data) return null;
    
    const suppliers = suppliersData.data;
    const totalRevenue = suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.currentYearRevenue || 0), 0);
    const totalSales = suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.currentYearSales || 0), 0);
    const lowStockSuppliers = suppliers.filter((s: EnhancedSupplier) => s.lowStockCount > 0).length;
    const activeSuppliers = suppliers.filter((s: EnhancedSupplier) => s.status === 'active').length;
    
    return {
      totalSuppliers: suppliers.length,
      activeSuppliers,
      totalRevenue,
      totalSales,
      lowStockSuppliers,
      averageProductsPerSupplier: suppliers.length > 0 ? 
        suppliers.reduce((sum: number, s: EnhancedSupplier) => sum + (s.productsCount || 0), 0) / suppliers.length : 0
    };
  }, [suppliersData?.data]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header with summary stats */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lieferanten</h1>
            <p className="text-gray-600 mt-1">
              Verwalten Sie Ihre Lieferanten mit umfassenden Analysen und Leistungsmetriken
            </p>
          </div>
          <div className="flex gap-2">
            <ExportImportButtons 
              exportEndpoint="/api/suppliers/export"
              importEndpoint="/api/suppliers/import"
              entityName="Lieferanten"
            />
            <Button onClick={handleCreateSupplier}>
              <Plus className="h-4 w-4 mr-2" />
              Lieferant hinzufügen
            </Button>
          </div>
        </div>

        {/* Summary Statistics */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.totalSuppliers}</div>
                  <div className="text-xs text-gray-600">Gesamt</div>
                </div>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-green-600">{stats.activeSuppliers}</div>
                  <div className="text-xs text-gray-600">Aktiv</div>
                </div>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold">€{stats.totalRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Jahresumsatz</div>
                </div>
                <DollarSign className="h-4 w-4 text-blue-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold">{stats.totalSales.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Jahresverkäufe</div>
                </div>
                <BarChart3 className="h-4 w-4 text-green-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold text-red-600">{stats.lowStockSuppliers}</div>
                  <div className="text-xs text-gray-600">Niedriger Bestand</div>
                </div>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold">{Math.round(stats.averageProductsPerSupplier)}</div>
                  <div className="text-xs text-gray-600">⌀ Produkte</div>
                </div>
                <Package className="h-4 w-4 text-purple-500" />
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Lieferanten durchsuchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsFilterDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filter
            {(currentFilters.status || currentFilters.stockLevel || currentFilters.sortBy !== 'currentYearRevenue') && (
              <Badge variant="secondary" className="ml-1">1</Badge>
            )}
          </Button>
          
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
            <TabsList>
              <TabsTrigger value="grid" className="flex items-center gap-1">
                <Grid className="h-4 w-4" />
                Kacheln
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1">
                <List className="h-4 w-4" />
                Liste
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <EnhancedSupplierGridSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-red-300 mb-4" />
          <h3 className="text-lg font-medium mb-1">Fehler beim Laden</h3>
          <p className="text-gray-500 mb-4">
            Die Lieferantendaten konnten nicht geladen werden.
          </p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/suppliers/overview'] })}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Erneut versuchen
          </Button>
        </div>
      ) : !filteredSuppliers || filteredSuppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium mb-1">Keine Lieferanten gefunden</h3>
          {searchTerm ? (
            <p className="text-gray-500 mb-4">
              Es wurden keine Lieferanten gefunden, die "{searchTerm}" enthalten.
            </p>
          ) : (
            <p className="text-gray-500 mb-4">
              Derzeit sind keine Lieferanten im System vorhanden.
            </p>
          )}
          <Button onClick={handleCreateSupplier}>
            <Plus className="h-4 w-4 mr-2" />
            Ersten Lieferanten hinzufügen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSuppliers.map((supplier) => (
            <EnhancedSupplierCard
              key={supplier.id}
              supplier={supplier}
              onEdit={handleEditSupplier}
              onDelete={handleDeleteSupplier}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <EnhancedFilterDialog
        isOpen={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        onApplyFilters={handleApplyFilters}
        currentFilters={currentFilters}
      />
    </div>
  );
}
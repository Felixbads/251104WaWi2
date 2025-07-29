import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, subWeeks, addWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  ArrowLeft, 
  TrendingUp, 
  Package, 
  Calendar,
  BarChart3,
  ShoppingCart,
  Warehouse,
  Calculator,
  Eye,
  EyeOff,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Star,
  MapPin,
  Truck,
  Store
} from 'lucide-react';
import { 
  calculatePackageInfo, 
  formatPackageDisplay, 
  formatTotalQuantity, 
  validatePackageOrder,
  validatePackageQuantitySimple,
  getNextValidPackageQuantity,
  getPreviousValidPackageQuantity,
  formatOrderSummaryPackage,
  calculatePackageCount,
  calculateTotalQuantity
} from '../../../../shared/package-utils';

interface BulkOrderModeProps {
  onBack: () => void;
  onOrderCreated: (orderId: number) => void;
}

interface WarehouseInventory {
  warehouseId: number;
  warehouseName: string;
  locationName: string;
  products: ProductInventory[];
}

interface ProductInventory {
  productId: number;
  productName: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  maxStock: number;
  price: number;
  purchasePrice?: number;
  packageSize?: number;
  packageType?: string;
  packageTypeName?: string;
  baseUnitName?: string;
  minQuantityUnit?: string;
}

interface SalesAnalysis {
  productId: number;
  productName: string;
  totalSales: number;
  totalRevenue: number;
  avgWeeklySales: number;
  trendDirection: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

interface SupplierAnalytics {
  supplierId: number;
  openOrders: number;
  annualRevenue: number;
  productCount: number;
  orderVolume: number;
  lastOrderDate?: string;
}

interface ForecastData {
  productId: number;
  productName: string;
  avgWeeklySales: number;
  forecastedDemand: number;
  confidenceLevel: string;
}

interface LocationSalesData {
  locationName: string;
  machineName: string;
  sales: number;
  revenue: number;
  avgWeeklySales: number;
  soldoutDays?: number;
  availableSellingDays?: number;
  adjustedRecommendation?: number;
  hasStockouts?: boolean;
}

// Component for displaying sales breakdown by location
const SalesLocationBreakdown: React.FC<{ productId: number; analysisWeeks: number }> = ({ productId, analysisWeeks }) => {
  const { data: locationSales, isLoading } = useQuery({
    queryKey: [`/api/bulk-orders/sales-by-location/${productId}`, analysisWeeks],
    enabled: !!productId,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-gray-200 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!locationSales || !Array.isArray(locationSales) || locationSales.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Keine Standortdaten verfügbar
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Verkäufe nach Standorten (letzten {analysisWeeks} Wochen)
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(locationSales as LocationSalesData[]).map((location, index) => (
          <div key={index} className="p-3 bg-white rounded border border-gray-200">
            <div className="space-y-2">
              <div className="font-bold text-base text-gray-900">
                {location.machineName}
              </div>
              <div className="text-xs text-gray-500">
                {location.locationName}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Verkäufe:</span>
                  <Badge variant="secondary" className="text-xs">
                    {location.sales} Stk.
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Umsatz:</span>
                  <span className="font-medium">{location.revenue.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                  <span>Ø/Woche:</span>
                  <span>{location.avgWeeklySales.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Component for displaying forecast breakdown by location with sales vs recommendations
const ForecastLocationBreakdown: React.FC<{ productId: number; totalQuantity: number; forecastWeeks: number }> = ({ productId, totalQuantity, forecastWeeks }) => {
  const { data: locationSales, isLoading } = useQuery({
    queryKey: [`/api/bulk-orders/sales-by-location/${productId}`, forecastWeeks],
    enabled: !!productId,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-gray-200 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!locationSales || !Array.isArray(locationSales) || locationSales.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Keine Standortdaten verfügbar
      </div>
    );
  }

  // Calculate total sales for proportion calculation
  const totalSales = (locationSales as LocationSalesData[]).reduce((sum, location) => sum + location.sales, 0);

  return (
    <div className="p-4 space-y-3">
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-sm text-blue-900 mb-2 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Empfehlung nach Standorten ({forecastWeeks} Wochen)
        </h4>
        <div className="text-xs text-blue-700 space-y-1">
          <p><strong>Berechnungslogik:</strong></p>
          <p>• <strong>Verkauft:</strong> Tatsächliche Verkäufe pro Standort in den letzten {forecastWeeks} Wochen</p>
          <p>• <strong>Empfehlen:</strong> Prognose für die nächsten {forecastWeeks} Wochen basierend auf Ø/Woche</p>
          <p>• <strong>Ausverkauft:</strong> Tage ohne Verfügbarkeit werden herausgerechnet (höhere Ø/Woche)</p>
          <p>• <strong>Orange Badge:</strong> 20% Sicherheitspuffer bei Standorten mit Ausverkäufen</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(locationSales as LocationSalesData[]).map((location, index) => {
          // Calculate recommended quantity based on sales proportion
          const salesProportion = totalSales > 0 ? location.sales / totalSales : 0;
          const recommendedQuantity = Math.round(totalQuantity * salesProportion);
          
          return (
            <div key={index} className="p-3 bg-white rounded border border-gray-200">
              <div className="space-y-2">
                <div className="font-bold text-base text-gray-900">
                  {location.machineName}
                </div>
                <div className="text-xs text-gray-500">
                  {location.locationName}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Verkauft:</span>
                    <Badge variant="secondary" className="text-xs">
                      {location.sales} Stk.
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Empfehlen ({forecastWeeks}W):</span>
                    <Badge variant={location.hasStockouts ? "destructive" : "default"} className="text-xs">
                      {Math.round(location.avgWeeklySales * forecastWeeks)} Stk.
                    </Badge>
                  </div>
                  {location.hasStockouts && location.soldoutDays && (
                    <div className="flex justify-between text-orange-600">
                      <span>⚠️ Ausverkauft:</span>
                      <span className="font-medium">{location.soldoutDays} Tage</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Anteil:</span>
                    <span className="font-medium">{(salesProportion * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ø/Woche:</span>
                    <span className="font-medium">{location.avgWeeklySales.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BulkOrderMode: React.FC<BulkOrderModeProps> = ({
  onBack,
  onOrderCreated
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [step, setStep] = useState<'supplier' | 'warehouse' | 'inventory' | 'analysis' | 'forecast' | 'order'>('supplier');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedWarehouseName, setSelectedWarehouseName] = useState<string>('');
  const [analysisWeeks, setAnalysisWeeks] = useState<number>(1);
  const [forecastWeeks, setForecastWeeks] = useState<number>(2);
  const [orderQuantities, setOrderQuantities] = useState<Record<number, number>>({});
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [expandedWarehouseDetails, setExpandedWarehouseDetails] = useState<Record<number, boolean>>({});
  
  // Order settings state
  const [deliveryDate, setDeliveryDate] = useState<Date>(addWeeks(new Date(), 1));
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [showPricesInEmail, setShowPricesInEmail] = useState<boolean>(true);
  const [showPricesInTable, setShowPricesInTable] = useState<boolean>(true);
  const [orderNotes, setOrderNotes] = useState<string>('');
  
  // Search and favorites state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [favoriteSuppliers, setFavoriteSuppliers] = useState<number[]>([]);

  // Data queries
  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60 * 10, // Increased cache time
  });

  // Load user favorites
  const { data: userFavorites } = useQuery({
    queryKey: ['/api/supplier-favorites'],
    staleTime: 1000 * 60 * 5,
  });

  // Update local favorites state when API data loads - ROBUSTE ERROR-HANDLING
  useEffect(() => {
    try {
      if (userFavorites && Array.isArray(userFavorites)) {
        const favoriteIds: number[] = [];
        userFavorites.forEach((fav: any) => {
          if (fav && typeof fav === 'object' && typeof fav.supplierId === 'number') {
            favoriteIds.push(fav.supplierId);
          }
        });
        setFavoriteSuppliers(favoriteIds);
      } else {
        // Fallback wenn userFavorites undefined oder nicht array ist
        setFavoriteSuppliers([]);
      }
    } catch (error) {
      console.error('Error processing userFavorites:', error);
      setFavoriteSuppliers([]);
    }
  }, [userFavorites]);

  // Favorites mutations
  const addFavoriteMutation = useMutation({
    mutationFn: (supplierId: number) => 
      apiRequest('/api/supplier-favorites', { supplierId }, 'POST'),
    onSuccess: (data, supplierId) => {
      setFavoriteSuppliers(prev => [...prev, supplierId]);
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-favorites'] });
      toast({ title: "Lieferant zu Favoriten hinzugefügt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Hinzufügen zu Favoriten", variant: "destructive" });
    }
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: (supplierId: number) => 
      apiRequest(`/api/supplier-favorites/${supplierId}`, {}, 'DELETE'),
    onSuccess: (data, supplierId) => {
      setFavoriteSuppliers(prev => prev.filter(id => id !== supplierId));
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-favorites'] });
      toast({ title: "Lieferant von Favoriten entfernt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Entfernen von Favoriten", variant: "destructive" });
    }
  });

  const { data: supplierAnalytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['/api/supplier-analytics/overview'],
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: true, // Always load analytics for sorting
  });

  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5,
  });

  // Debug logging for warehouse data
  useEffect(() => {
    if (warehouses) {
      console.log(`🏢 WAREHOUSE DEBUG - Warehouse data received:`, {
        rawData: warehouses,
        hasData: !!(warehouses as any)?.data,
        dataLength: Array.isArray((warehouses as any)?.data) ? (warehouses as any).data.length : 'not-array',
        isArray: Array.isArray(warehouses),
        warehousesLength: Array.isArray(warehouses) ? warehouses.length : 'not-array',
        firstWarehouse: Array.isArray((warehouses as any)?.data) ? (warehouses as any).data[0] : (Array.isArray(warehouses) ? warehouses[0] : null)
      });
    }
  }, [warehouses]);

  // Combine suppliers with analytics and sort by sales volume (simplified interface)
  const suppliersList = useMemo(() => {
    const supplierData = Array.isArray(suppliers) ? suppliers : 
                        ((suppliers as any)?.data && Array.isArray((suppliers as any).data)) ? (suppliers as any).data : [];
    
    if (supplierData.length === 0) return [];
    
    // If analytics is loading, show suppliers alphabetically for now
    if (analyticsLoading || !supplierAnalytics) {
      return supplierData.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    }
    
    const analyticsData = Array.isArray(supplierAnalytics) ? supplierAnalytics :
                         ((supplierAnalytics as any)?.data && Array.isArray((supplierAnalytics as any).data)) ? (supplierAnalytics as any).data : [];
    
    const combined = supplierData.map((supplier: any) => {
      const analytics = analyticsData.find((a: SupplierAnalytics) => a.supplierId === supplier.id);
      return {
        ...supplier,
        analytics: analytics || {
          supplierId: supplier.id,
          openOrders: 0,
          annualRevenue: 0,
          productCount: 0,
          orderVolume: 0
        }
      };
    });
    
    // Sort by order volume (sales volume) in descending order
    return combined.sort((a: any, b: any) => (b.analytics?.orderVolume || 0) - (a.analytics?.orderVolume || 0));
  }, [suppliers, supplierAnalytics, analyticsLoading]);

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: [`/api/bulk-orders/inventory/bulk/${selectedSupplierId}`],
    enabled: !!selectedSupplierId,
    staleTime: 0, // Force fresh data
    refetchOnMount: true,
    refetchInterval: false
  });

  // Debug logging for inventory data
  useEffect(() => {
    if (inventoryData) {
      console.log(`🔍 INVENTORY DEBUG - Inventory data received for supplier ${selectedSupplierId}:`, {
        dataLength: Array.isArray(inventoryData) ? inventoryData.length : 'not-array',
        firstProduct: Array.isArray(inventoryData) ? inventoryData[0]?.product_name : null,
        rawData: inventoryData
      });
      if (Array.isArray(inventoryData) && inventoryData.length > 0) {
        console.log('🔍 INVENTORY DEBUG - First product package data:', {
          productName: inventoryData[0].product_name,
          packageSize: inventoryData[0].package_size,
          packageTypeName: inventoryData[0].package_type_name,
          baseUnitName: inventoryData[0].base_unit_name,
          purchasePrice: inventoryData[0].purchase_price,
          price: inventoryData[0].price
        });
      }
    }
  }, [inventoryData, selectedSupplierId]);

  const { data: salesAnalysis, isLoading: salesLoading } = useQuery({
    queryKey: [`/api/bulk-orders/analytics/sales/${selectedSupplierId}/${analysisWeeks}`],
    enabled: !!selectedSupplierId && step === 'analysis',
    staleTime: 1000 * 60 * 5,
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: [`/api/bulk-orders/forecast/bulk/${selectedSupplierId}/${forecastWeeks}`],
    enabled: !!selectedSupplierId && step === 'forecast',
    staleTime: 1000 * 60 * 5,
  });

  // Auto-fill suggested quantities when forecast data is loaded
  useEffect(() => {
    if (forecastData && Array.isArray(forecastData) && inventoryData && Array.isArray(inventoryData) && step === 'forecast') {
      console.log('🔍 AUTO-FILL DEBUG - Setting suggested quantities based on forecast and inventory');
      
      const suggestedQuantities: Record<number, number> = {};
      
      forecastData.forEach((forecast: any) => {
        const product = inventoryData.find((inv: any) => inv.product_id === forecast.productId);
        if (product && forecast.forecastedDemand > 0) {
          const packageSize = product.package_size || 1;
          const currentStock = product.total_stock || 0;
          
          // Calculate suggested quantity considering current stock and package size
          let suggestedQuantity = Math.max(0, forecast.forecastedDemand - currentStock);
          
          // Round up to nearest package size if product uses packages
          if (packageSize > 1 && suggestedQuantity > 0) {
            const packages = Math.ceil(suggestedQuantity / packageSize);
            suggestedQuantity = packages * packageSize;
          }
          
          if (suggestedQuantity > 0) {
            suggestedQuantities[forecast.productId] = suggestedQuantity;
          }
        }
      });
      
      console.log('🔍 AUTO-FILL DEBUG - Suggested quantities calculated:', suggestedQuantities);
      
      // Only set quantities if they're not already set (don't override user input)
      setOrderQuantities(prev => {
        const hasUserInput = Object.keys(prev).some(key => prev[parseInt(key)] > 0);
        if (hasUserInput) {
          console.log('🔍 AUTO-FILL DEBUG - User has already entered quantities, skipping auto-fill');
          return prev;
        }
        console.log('🔍 AUTO-FILL DEBUG - Setting auto-filled quantities:', suggestedQuantities);
        return suggestedQuantities;
      });
    }
  }, [forecastData, inventoryData, step]);

  // Debug logging for forecast data
  useEffect(() => {
    if (forecastData) {
      console.log('🔍 FORECAST DEBUG - Raw forecast data:', forecastData);
      if (Array.isArray(forecastData) && forecastData.length > 0) {
        console.log('🔍 FORECAST DEBUG - First forecast item:', forecastData[0]);
        console.log('🔍 FORECAST DEBUG - Package fields in forecast:', {
          packageSize: forecastData[0].package_size,
          packageTypeName: forecastData[0].package_type_name,
          baseUnitName: forecastData[0].base_unit_name,
          purchasePrice: forecastData[0].purchase_price,
          price: forecastData[0].price
        });
      }
    }
  }, [forecastData]);

  const { data: forecastFactors, isLoading: factorsLoading } = useQuery<{
    weather: { description: string; expected: boolean };
    holidays: { description: string; events: Array<{ name: string; date: string; description: string }> };
    notes: string;
  }>({
    queryKey: [`/api/bulk-orders/forecast-factors/${forecastWeeks}`],
    enabled: step === 'forecast',
    staleTime: 1000 * 60 * 5,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return apiRequest('/api/bulk-orders/bulk', orderData, 'POST');
    },
    onSuccess: (data) => {
      toast({
        title: "Großbestellung erfolgreich erstellt",
        description: `Bestellung ${data.orderNumber} wurde erstellt.`,
      });
      onOrderCreated(data.id);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler bei der Bestellung",
        description: error.message || "Die Bestellung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Auto-populate order quantities when forecast data loads (basic version without type casting)
  useEffect(() => {
    if (forecastData && Array.isArray(forecastData) && step === 'forecast') {
      const newQuantities: Record<number, number> = {};
      forecastData.forEach((item: any) => {
        if (item.productId && item.forecastedDemand) {
          newQuantities[item.productId] = Math.max(0, item.forecastedDemand || 0);
        }
      });
      console.log('🔧 Auto-populating order quantities:', newQuantities);
      setOrderQuantities(newQuantities);
    }
  }, [forecastData, step]);

  // Handle supplier selection
  const handleSupplierSelect = (supplierId: number, supplierName: string) => {
    console.log(`[BulkOrderMode] Supplier selected:`, { supplierId, supplierName });
    
    // Clear cache for the new supplier
    queryClient.invalidateQueries({ 
      queryKey: [`/api/bulk-orders/inventory/bulk/${supplierId}`] 
    });
    
    setSelectedSupplierId(supplierId);
    setSelectedSupplierName(supplierName);
    setStep('warehouse'); // Go to warehouse selection first
  };

  // Handle warehouse selection
  const handleWarehouseSelect = (warehouseId: number, warehouseName: string) => {
    console.log(`[BulkOrderMode] Warehouse selected:`, { warehouseId, warehouseName });
    
    setSelectedWarehouseId(warehouseId);
    setSelectedWarehouseName(warehouseName);
    setStep('inventory');
  };

  // Handle order quantity changes with package validation
  const updateOrderQuantity = (productId: number, quantity: number) => {
    const product = (inventoryData as any[])?.find((item: any) => item.product_id === productId);
    
    console.log(`🔧 UPDATE ORDER QUANTITY DEBUG:`, {
      productId,
      quantity,
      productFound: !!product,
      productData: product ? {
        product_id: product.product_id,
        package_size: product.package_size,
        package_type_name: product.package_type_name
      } : null
    });
    
    const packageSize = product?.package_size || 1;
    if (product && packageSize > 1) {
      // Validate package-based quantity and round up to next valid package quantity
      const validation = validatePackageQuantitySimple(quantity, packageSize);
      if (!validation.isValid) {
        // Always round UP to the next valid package quantity for orders
        quantity = getNextValidPackageQuantity(quantity, packageSize);
      }
    }
    
    const finalQuantity = Math.max(0, quantity);
    console.log(`🔧 SETTING FINAL QUANTITY:`, { productId, finalQuantity });
    
    setOrderQuantities(prev => {
      const updated = {
        ...prev,
        [productId]: finalQuantity
      };
      console.log(`🔧 NEW ORDER QUANTITIES STATE:`, updated);
      return updated;
    });
  };

  const toggleRowExpansion = (productId: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const calculateLocationBreakdown = (productId: number, totalQuantity: number) => {
    if (!warehouses || !inventoryData) return [];

    // Extract warehouse list from response structure
    const warehouseList = (warehouses as any)?.data || warehouses || [];
    if (!Array.isArray(warehouseList) || warehouseList.length === 0) return [];
    
    const productInventory = (inventoryData as any[]).filter((inv: any) => inv.productId === productId);
    
    // Calculate total current stock across all warehouses for this product
    const totalCurrentStock = productInventory.reduce((sum: number, inv: any) => sum + (inv.currentStock || 0), 0);
    
    // If no inventory data, distribute equally
    if (totalCurrentStock === 0 || productInventory.length === 0) {
      const perWarehouse = Math.ceil(totalQuantity / warehouseList.length);
      return warehouseList.map((warehouse: any) => ({
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        currentStock: 0,
        recommendedQuantity: perWarehouse,
        reason: 'Gleichmäßige Verteilung'
      }));
    }

    // Distribute based on current stock levels (warehouses with less stock get more)
    return warehouseList.map((warehouse: any) => {
      const warehouseInventory = productInventory.find((inv: any) => inv.warehouseId === warehouse.id);
      const currentStock = warehouseInventory?.currentStock || 0;
      const stockRatio = totalCurrentStock > 0 ? currentStock / totalCurrentStock : 0;
      
      // Inverse ratio: warehouses with less stock get proportionally more
      const inverseRatio = totalCurrentStock > 0 ? (totalCurrentStock - currentStock) / (totalCurrentStock * (warehouseList.length - 1) || 1) : 1 / warehouseList.length;
      const recommendedQuantity = Math.ceil(totalQuantity * inverseRatio);
      
      return {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        currentStock,
        recommendedQuantity,
        reason: currentStock < 10 ? 'Niedriger Bestand' : currentStock > 50 ? 'Hoher Bestand' : 'Standard Verteilung'
      };
    });
  };

  // Calculate totals with package information
  const calculateTotals = () => {
    if (!inventoryData) return { totalItems: 0, totalValue: 0, totalPackages: 0 };
    
    let totalItems = 0;
    let totalValue = 0;
    let totalPackages = 0;
    
    console.log('🔍 CALCULATE TOTALS DEBUG:', {
      orderQuantitiesCount: Object.keys(orderQuantities).length,
      orderQuantities,
      inventoryDataLength: Array.isArray(inventoryData) ? inventoryData.length : 'not-array'
    });
    
    Object.entries(orderQuantities).forEach(([productId, quantity]) => {
      if (quantity > 0) {
        const product = (inventoryData as any[])?.find((item: any) => item.product_id === parseInt(productId));
        
        console.log(`🔍 TOTALS PRODUCT LOOKUP - ID ${productId}:`, {
          quantity,
          productFound: !!product,
          productData: product ? {
            product_id: product.product_id,
            purchase_price: product.purchase_price,
            price: product.price,
            package_size: product.package_size
          } : null
        });
        
        if (product) {
          totalItems += quantity;
          // Use purchase price if available, otherwise use regular price
          const unitPrice = product.purchase_price || product.price || 0;
          totalValue += quantity * unitPrice;
          
          // Calculate package count
          const packageSize = product.package_size || 1;
          if (packageSize > 1) {
            totalPackages += quantity / packageSize;
          }
        }
      }
    });
    
    console.log('🔍 TOTALS RESULT:', { totalItems, totalValue, totalPackages });
    
    return { totalItems, totalValue, totalPackages };
  };

  // Create order with comprehensive package validation
  const handleCreateOrder = () => {
    if (!selectedSupplierId || Object.keys(orderQuantities).length === 0) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte wählen Sie Produkte und Mengen aus.",
        variant: "destructive",
      });
      return;
    }

    // Comprehensive package validation for entire order
    const validationErrors: string[] = [];
    Object.entries(orderQuantities).forEach(([productId, quantity]) => {
      if (quantity > 0) {
        const product = (inventoryData as any[])?.find((inv: any) => inv.productId === parseInt(productId));
        if (product) {
          const packageSize = product.package_size || product.packageSize || 1;
          const validation = validatePackageOrder({
            id: product.productId,
            name: product.productName,
            packageSize: packageSize,
            packageTypeName: product.package_type_name || product.packageTypeName,
            baseUnitName: product.base_unit_name || product.baseUnitName
          } as any, quantity);
          
          if (!validation.isValid) {
            validationErrors.push(`${product.productName}: ${validation.errorMessage}`);
          }
        }
      }
    });

    if (validationErrors.length > 0) {
      toast({
        title: "Ungültige Gebinde-Mengen",
        description: `Folgende Produkte haben ungültige Mengen:\n${validationErrors.slice(0, 3).join('\n')}${validationErrors.length > 3 ? '\n...' : ''}`,
        variant: "destructive",
      });
      return;
    }

    const orderItems = Object.entries(orderQuantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([productId, quantity]) => {
        const product = (inventoryData as any[])?.find((inv: any) => inv.productId === parseInt(productId));
        const packageSize = product ? (product.package_size || product.packageSize || 1) : 1;
        const packageTypeName = product ? (product.package_type_name || product.packageTypeName || 'Stück') : 'Stück';
        const baseUnitName = product ? (product.base_unit_name || product.baseUnitName || 'Stück') : 'Stück';
        
        const packageInfo = product ? calculatePackageInfo(
          quantity,
          packageSize,
          packageTypeName,
          baseUnitName
        ) : { packageCount: 0, totalQuantity: quantity, packageSize: 1, packageTypeName: 'Stück', baseUnitName: 'Stück' };
        
        return {
          productId: parseInt(productId),
          quantity,
          packageCount: packageInfo.packageCount,
          packageTypeName: packageInfo.packageTypeName,
          packageQuantity: 'packageSize' in packageInfo ? packageInfo.packageSize : packageInfo.packageQuantity || 1,
          baseUnitName: packageInfo.baseUnitName,
          unitPrice: product?.purchasePrice || product?.price || 0,
          totalPrice: quantity * (product?.purchasePrice || product?.price || 0),
          notes: `Großbestellung - Prognose für ${forecastWeeks} Wochen`,
        };
      });

    // Validate mandatory fields
    if (!selectedWarehouseId) {
      toast({
        title: "Lager erforderlich",
        description: "Bitte wählen Sie ein Lager für die Bestellung aus.",
        variant: "destructive",
      });
      return;
    }

    if (!deliveryDate) {
      toast({
        title: "Lieferdatum erforderlich", 
        description: "Bitte wählen Sie ein Lieferdatum aus.",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      supplierId: selectedSupplierId,
      orderType: 'bulk',
      warehouseId: selectedWarehouseId, // Use selected warehouse instead of null
      expectedDeliveryDate: deliveryDate.toISOString(),
      deliveryType: deliveryType,
      showPricesInEmail: showPricesInEmail,
      notes: orderNotes, // Don't auto-generate text, use only what user enters
      priority: "high",
      items: orderItems,
      orderMode: "bulk",
      analysisWeeks,
      forecastWeeks,
      totalValue: calculateTotals().totalValue
    };

    createOrderMutation.mutate(orderData);
  };

  // Warehouse selection now handled in the order form

  // Render warehouse selection step
  const renderWarehouseSelection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          Lager für Großbestellung auswählen
        </CardTitle>
        <CardDescription>
          Wählen Sie das Hauptlager für Ihre Großbestellung aus.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {warehousesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : warehouses && Array.isArray(warehouses) && warehouses.length > 0 ? (
          <div className="space-y-2">
            {warehouses.map((warehouse: any) => (
              <Card 
                key={warehouse.id}
                className={`cursor-pointer hover:bg-accent/50 transition-colors border-2 ${
                  selectedWarehouseId === warehouse.id ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() => handleWarehouseSelect(warehouse.id, warehouse.name)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">{warehouse.name}</h3>
                      {warehouse.address && (
                        <p className="text-sm text-muted-foreground">{warehouse.address}</p>
                      )}
                      {selectedWarehouseId === warehouse.id && (
                        <Badge variant="default" className="mt-2">
                          ✓ Ausgewählt
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline">
                      <Store className="h-4 w-4 mr-1" />
                      Lager
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Store className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="font-medium mb-2">Keine Lager gefunden</h3>
            <p className="text-sm">Debug: {JSON.stringify({ 
              warehouses: !!warehouses, 
              isArray: Array.isArray(warehouses),
              length: Array.isArray(warehouses) ? warehouses.length : 'N/A',
              loading: warehousesLoading 
            })}</p>
          </div>
        )}
        
        {/* Continue Button nach Warehouse-Auswahl */}
        {selectedWarehouseId && (
          <div className="mt-6 pt-4 border-t">
            <Button 
              onClick={() => setStep('inventory')}
              className="w-full"
            >
              Weiter zu Bestandsübersicht
              <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render supplier selection step
  // Helper functions for favorites
  const toggleFavorite = (supplierId: number) => {
    if (favoriteSuppliers.includes(supplierId)) {
      removeFavoriteMutation.mutate(supplierId);
    } else {
      addFavoriteMutation.mutate(supplierId);
    }
  };

  // Enhanced supplier filtering and sorting
  const getFilteredAndSortedSuppliers = () => {
    if (!suppliers) return [];
    
    const suppliersList = Array.isArray(suppliers) ? suppliers : (suppliers as any)?.data || [];
    
    // CRITICAL FIX: Robust analytics data handling
    let analyticsMap = new Map();
    if (supplierAnalytics && Array.isArray(supplierAnalytics)) {
      try {
        supplierAnalytics.forEach((item: any) => {
          if (item && typeof item === 'object' && item.supplierId) {
            analyticsMap.set(item.supplierId, item);
          }
        });
      } catch (error) {
        console.error('Error processing supplier analytics:', error);
        analyticsMap = new Map(); // Fallback to empty map
      }
    }
    
    // Filter by search term with null safety
    const filtered = suppliersList.filter((supplier: any) => {
      if (!supplier || !supplier.name) return false;
      return supplier.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    // Sort with favorites first, then by order volume
    return filtered.sort((a: any, b: any) => {
      const aIsFavorite = favoriteSuppliers.includes(a.id);
      const bIsFavorite = favoriteSuppliers.includes(b.id);
      
      // Favorites first
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      
      // Then by order volume (highest first) with null safety
      const aAnalytics = analyticsMap.get(a.id);
      const bAnalytics = analyticsMap.get(b.id);
      const aOrderVolume = (aAnalytics && typeof aAnalytics.orderVolume === 'number') ? aAnalytics.orderVolume : 0;
      const bOrderVolume = (bAnalytics && typeof bAnalytics.orderVolume === 'number') ? bAnalytics.orderVolume : 0;
      
      return bOrderVolume - aOrderVolume;
    });
  };

  const renderSupplierSelection = () => {
    const filteredSuppliers = getFilteredAndSortedSuppliers();
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lieferant für Großbestellung auswählen
          </CardTitle>
          <CardDescription>
            Wählen Sie den Lieferanten für Ihre Großbestellung aus. Favoriten werden zuerst angezeigt, dann nach Verkaufsvolumen sortiert.
          </CardDescription>
          
          {/* Search field */}
          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Lieferant suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {suppliersLoading || analyticsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSuppliers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? `Keine Lieferanten gefunden für "${searchTerm}"` : 'Keine Lieferanten verfügbar'}
                </div>
              ) : (
                filteredSuppliers.map((supplier: any) => {
                  // CRITICAL FIX: Safe analytics lookup
                  let analytics = null;
                  if (supplierAnalytics && Array.isArray(supplierAnalytics)) {
                    try {
                      analytics = supplierAnalytics.find(item => 
                        item && typeof item === 'object' && item.supplierId === supplier.id
                      );
                    } catch (error) {
                      console.error('Error finding analytics for supplier:', supplier.id, error);
                    }
                  }
                  const isFavorite = favoriteSuppliers.includes(supplier.id);
                  
                  return (
                    <Card 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-accent/50 transition-colors relative"
                      onClick={() => handleSupplierSelect(supplier.id, supplier.name)}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{supplier.name}</h3>
                            {isFavorite && (
                              <Badge variant="secondary" className="text-xs">
                                Favorit
                              </Badge>
                            )}
                          </div>
                          {analytics && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {analytics.productCount} Produkte • €{analytics.orderVolume.toLocaleString()} Umsatz
                            </div>
                          )}
                        </div>
                        
                        {/* Star button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(supplier.id);
                          }}
                          className="h-8 w-8 p-0 hover:bg-muted"
                          disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                        >
                          <Star 
                            className={`h-4 w-4 ${
                              isFavorite 
                                ? 'fill-yellow-400 text-yellow-400' 
                                : 'text-muted-foreground hover:text-yellow-400'
                            }`} 
                          />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Render inventory overview step
  const renderInventoryOverview = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-5 w-5" />
          Bestandsübersicht für {selectedSupplierName}
        </CardTitle>
        <CardDescription>
          Aktuelle Lagerbestände aller Produkte in allen Lagern
        </CardDescription>
        
        {/* Navigation Button nach oben verschoben für Bestandsübersicht */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => setStep('warehouse')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Lager-Auswahl
          </Button>
          <Button 
            onClick={() => setStep('analysis')}
            disabled={!inventoryData || (Array.isArray(inventoryData) && inventoryData.length === 0)}
          >
            Weiter zu Verkaufsanalyse
            <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {inventoryLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Gesamtbestand</TableHead>
                  <TableHead>Verfügbar</TableHead>
                  <TableHead>Reserviert</TableHead>
                  <TableHead>Min/Max</TableHead>
                  <TableHead>Einkaufspreis</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inventoryData as any[])?.map((item: any) => (
                  <TableRow key={item.product_id}>
                    <TableCell className="font-medium">
                      <div>
                        <div className="font-medium">{item.product_name || '–'}</div>
                        {item.package_size > 1 && (
                          <div className="text-xs text-muted-foreground">
                            {item.package_type_name || 'Gebinde'} à {item.package_size || '–'} {item.base_unit_name || 'Stück'}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.supplier_name || '–'}</TableCell>
                    <TableCell>{item.total_stock ?? '–'}</TableCell>
                    <TableCell>{item.available_stock ?? '–'}</TableCell>
                    <TableCell>{item.reserved_stock ?? '–'}</TableCell>
                    <TableCell>
                      {item.min_stock !== null && item.max_stock !== null ? 
                        `${item.min_stock}/${item.max_stock}` : 
                        '–'
                      }
                    </TableCell>
                    <TableCell>
                      {item.purchase_price ? 
                        `${Number(item.purchase_price).toFixed(2)} €` : 
                        item.price ? 
                          `${Number(item.price).toFixed(2)} €` : 
                          '–'
                      }
                    </TableCell>
                    <TableCell>{item.location_name || 'Keine Angabe vorhanden'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={
                            parseInt(item.available_stock) <= item.min_stock ? "destructive" :
                            parseInt(item.available_stock) <= item.min_stock * 1.5 ? "secondary" : "default"
                          }
                        >
                          {parseInt(item.available_stock) <= item.min_stock ? "Niedrig" :
                           parseInt(item.available_stock) <= item.min_stock * 1.5 ? "Warnung" : "OK"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setExpandedWarehouseDetails(prev => ({
                              ...prev,
                              [item.product_id]: !prev[item.product_id]
                            }));
                          }}
                        >
                          {expandedWarehouseDetails[item.product_id] ? 
                            <ChevronDown className="h-4 w-4" /> : 
                            <ChevronRight className="h-4 w-4" />
                          }
                        </Button>
                        {expandedWarehouseDetails[item.product_id] && (
                          <div className="absolute z-10 mt-2 p-3 bg-white border rounded-lg shadow-lg">
                            <div className="space-y-2 min-w-48">
                              <h4 className="font-semibold text-sm">Lageraufschlüsselung:</h4>
                              {item.warehouse_details?.map((warehouse: any) => (
                                <div key={warehouse.warehouse_id} className="text-xs">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{warehouse.warehouse_name}:</span>
                                    <span>{warehouse.quantity} Stk.</span>
                                  </div>
                                </div>
                              )) || <span className="text-xs text-muted-foreground">Keine Details verfügbar</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Navigation buttons removed from bottom - now only at top as requested */}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render sales analysis step
  const renderSalesAnalysis = () => (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start mb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Verkaufsanalyse für {selectedSupplierName}
            </CardTitle>
            <CardDescription>
              Analyse der Verkäufe der letzten Wochen
            </CardDescription>
          </div>
          {/* Navigation Buttons ganz oben rechts */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('inventory')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <Button onClick={() => setStep('forecast')}>
              Prognose & Bestellung
              <Calculator className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Label htmlFor="analysisWeeks">Analysezeitraum (Wochen)</Label>
          <Select value={analysisWeeks.toString()} onValueChange={(value) => setAnalysisWeeks(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Woche</SelectItem>
              <SelectItem value="2">2 Wochen</SelectItem>
              <SelectItem value="3">3 Wochen</SelectItem>
              <SelectItem value="4">4 Wochen</SelectItem>
              <SelectItem value="6">6 Wochen</SelectItem>
              <SelectItem value="8">8 Wochen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {salesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mobile-first responsive design: Product titles span full width */}
            <div className="space-y-4 md:hidden">
              {Array.isArray(salesAnalysis) && salesAnalysis.length > 0 ? (
                salesAnalysis.map((item: SalesAnalysis) => (
                  <Card key={item.productId} className="p-4">
                    <div className="space-y-3">
                      <div className="font-semibold text-lg">{item.productName}</div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Verkäufe:</div>
                          <div className="font-medium">{item.totalSales} Stk.</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Umsatz:</div>
                          <div className="font-medium">€{Number(item.totalRevenue).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Ø/Woche:</div>
                          <div className="font-medium">{Number(item.avgWeeklySales).toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Trend:</div>
                          <Badge 
                            variant={
                              item.trendDirection === 'up' ? "default" :
                              item.trendDirection === 'down' ? "destructive" : "secondary"
                            }
                          >
                            {item.trendDirection === 'up' ? '↗' : 
                             item.trendDirection === 'down' ? '↘' : '→'}
                            {(item.trendPercentage && !isNaN(item.trendPercentage)) ? item.trendPercentage.toFixed(0) : '0'}%
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(item.productId)}
                        className="w-full mt-3"
                      >
                        {expandedRows[item.productId] ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                        <MapPin className="h-3 w-3 mr-1" />
                        Standorte anzeigen
                      </Button>
                      {expandedRows[item.productId] && (
                        <div className="mt-3 p-3 bg-gray-50 rounded">
                          <SalesLocationBreakdown productId={item.productId} analysisWeeks={analysisWeeks} />
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Verkaufsanalysedaten verfügbar
                </div>
              )}
            </div>
            
            {/* Desktop table view */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Verkäufe gesamt</TableHead>
                    <TableHead>Umsatz</TableHead>
                    <TableHead>Ø pro Woche</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Standorte</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {Array.isArray(salesAnalysis) && salesAnalysis.length > 0 ? (
                  salesAnalysis.flatMap((item: SalesAnalysis) => {
                    const isExpanded = expandedRows[item.productId];
                    const rows = [
                      <TableRow key={item.productId}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.totalSales}</TableCell>
                        <TableCell>{Number(item.totalRevenue).toFixed(2)} €</TableCell>
                        <TableCell>{Number(item.avgWeeklySales).toFixed(1)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={
                                item.trendDirection === 'up' ? "default" :
                                item.trendDirection === 'down' ? "destructive" : "secondary"
                              }
                            >
                              {item.trendDirection === 'up' ? '↗' : 
                               item.trendDirection === 'down' ? '↘' : '→'}
                              {item.trendPercentage?.toFixed(0) || '0'}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpansion(item.productId)}
                            className="flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <MapPin className="h-3 w-3" />
                            Standorte
                          </Button>
                        </TableCell>
                      </TableRow>
                    ];
                    
                    if (isExpanded) {
                      rows.push(
                        <TableRow key={`${item.productId}-details`} className="bg-gray-50">
                          <TableCell colSpan={6} className="p-0">
                            <SalesLocationBreakdown productId={item.productId} analysisWeeks={analysisWeeks} />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    return rows;
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Keine Verkaufsanalysedaten verfügbar
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              </Table>
            </div>
            

          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render forecast and order step
  const renderForecastAndOrder = () => {
    const totals = calculateTotals();
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Prognose & Bestellung für {selectedSupplierName}
          </CardTitle>
          <CardDescription>
            Erwartete Verkäufe und Bestellmengen
          </CardDescription>
          
          {/* Navigation Buttons nach oben verschoben */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep('analysis')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zur Verkaufsanalyse
            </Button>
            <Button 
              onClick={() => {
                console.log('🔍 CREATE ORDER BUTTON CLICKED:', {
                  totals,
                  selectedWarehouseId,
                  orderQuantities,
                  isPending: createOrderMutation.isPending
                });
                handleCreateOrder();
              }}
              disabled={createOrderMutation.isPending || totals.totalItems === 0}
              className={!selectedWarehouseId ? "bg-orange-500 hover:bg-orange-600" : ""}
            >
              {createOrderMutation.isPending ? "Erstelle..." : 
               !selectedWarehouseId ? "Lager auswählen!" :
               `Bestellung erstellen (${totals.totalItems} Artikel)`}
              <ShoppingCart className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="forecastWeeks">Prognosezeitraum (Wochen)</Label>
            <Select value={forecastWeeks.toString()} onValueChange={(value) => setForecastWeeks(parseInt(value))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Woche</SelectItem>
                <SelectItem value="2">2 Wochen</SelectItem>
                <SelectItem value="3">3 Wochen</SelectItem>
                <SelectItem value="4">4 Wochen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enhanced Holiday & Weather Context */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-3">📊 Prognosefaktoren für die nächsten {forecastWeeks} Wochen</h4>
            {factorsLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-blue-200 animate-pulse rounded w-3/4" />
                <div className="h-4 bg-blue-200 animate-pulse rounded w-1/2" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-white rounded border">
                    <p className="font-medium text-blue-800 flex items-center gap-1">
                      🌤️ Wetterprognose:
                    </p>
                    <p className="text-blue-700 mt-1">
                      {(forecastFactors as any)?.weather?.description || "Sommerlich warm, 20-28°C, überwiegend sonnig"}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Faktor: +{(forecastFactors as any)?.weather?.factor || '5'}% für warme Getränke
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <p className="font-medium text-green-800 flex items-center gap-1">
                      🏖️ Ferien & Feiertage:
                    </p>
                    <div className="text-green-700 mt-1">
                      {(forecastFactors as any)?.holidays?.active_periods ? (
                        <div className="space-y-1">
                          {(forecastFactors as any).holidays.active_periods.map((period: any, idx: number) => (
                            <div key={idx} className="text-xs">
                              <span className="font-medium">{period.name}</span>: {period.dates}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs">
                            <span className="font-medium">Sommerferien Sachsen</span>: 20.7. - 31.8.2025
                          </div>
                          <div className="text-xs">
                            <span className="font-medium">Touristische Hochsaison</span>: Aktiv in der Sächsischen Schweiz
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-green-600 mt-2">
                      Faktor: +{(forecastFactors as any)?.holidays?.boost || '25'}% für touristische Standorte
                    </p>
                  </div>
                </div>
                
                {/* Applied Forecast Factors Summary */}
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="font-medium text-yellow-800 text-sm mb-2">🎯 Angewandte Prognosefaktoren:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="text-center p-2 bg-white rounded">
                      <div className="font-medium text-blue-600">Wetter</div>
                      <div>+{(forecastFactors as any)?.weather?.factor || '5'}%</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <div className="font-medium text-green-600">Ferien</div>
                      <div>+{(forecastFactors as any)?.holidays?.boost || '25'}%</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <div className="font-medium text-orange-600">Tourist-Standorte</div>
                      <div>+{(forecastFactors as any)?.tourism?.factor || '15'}%</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <div className="font-medium text-purple-600">Gesamt-Boost</div>
                      <div>+{((forecastFactors as any)?.total_boost_percentage || 35)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs text-blue-600 mt-3 italic">
              ℹ️ Diese Faktoren werden automatisch in die Verkaufsprognose eingerechnet. Touristische Standorte wie Bad Schandau, Pillnitz und Stolpen erhalten zusätzliche Ferienfaktoren.
            </p>
          </div>

          {/* Order Settings Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Bestelleinstellungen
              </CardTitle>
              <CardDescription>
                Lieferdatum, Lieferart und weitere Einstellungen für die Bestellung
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Warehouse Selection - Now in the order form as requested */}
              <div className={`mb-6 p-4 border rounded-lg ${!selectedWarehouseId ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                <div className="space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Warehouse className="h-5 w-5" />
                    Ziellager für Bestellung auswählen <span className="text-red-500">*</span>
                    {selectedWarehouseId && <span className="text-green-600 text-sm ml-2">✓ Ausgewählt</span>}
                  </Label>
                  {warehousesLoading ? (
                    <div className="h-20 bg-muted animate-pulse rounded-lg" />
                  ) : (
                    <Select 
                      value={selectedWarehouseId?.toString() || ''} 
                      onValueChange={(value) => {
                        const warehouseId = parseInt(value);
                        const warehouseList = Array.isArray(warehouses) ? warehouses : (warehouses as any)?.data || [];
                        const warehouse = warehouseList.find((w: any) => w.id === warehouseId);
                        console.log('🏭 WAREHOUSE SELECTION - Selected:', warehouseId, warehouse);
                        if (warehouse) {
                          setSelectedWarehouseId(warehouseId);
                          setSelectedWarehouseName(warehouse.name);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Wählen Sie ein Lager aus..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          console.log('🏭 WAREHOUSE DEBUG - Raw warehouses response:', warehouses);
                          console.log('🏭 WAREHOUSE DEBUG - warehouses.data:', (warehouses as any)?.data);
                          console.log('🏭 WAREHOUSE DEBUG - direct warehouses:', warehouses);
                          const warehouseList = Array.isArray(warehouses) ? warehouses : (warehouses as any)?.data || [];
                          console.log('🏭 WAREHOUSE DEBUG - Final warehouse list:', warehouseList);
                          return warehouseList;
                        })().map((warehouse: any) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4" />
                              <span>{warehouse.name}</span>
                              {warehouse.location && (
                                <span className="text-sm text-muted-foreground">({warehouse.location})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!selectedWarehouseId && (
                    <p className="text-sm text-orange-600">
                      Bitte wählen Sie ein Lager aus, bevor Sie die Bestellung erstellen.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Delivery Date */}
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">Gewünschtes Lieferdatum</Label>
                  <div className="relative">
                    <DatePicker
                      selected={deliveryDate}
                      onChange={(date: Date | null) => {
                        if (date) {
                          setDeliveryDate(date);
                        }
                      }}
                      dateFormat="dd.MM.yyyy"
                      locale={de}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      placeholderText="TT.MM.JJJJ"
                      minDate={new Date()}
                    />
                    <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Delivery Type */}
                <div className="space-y-3">
                  <Label>Lieferart</Label>
                  <RadioGroup 
                    value={deliveryType} 
                    onValueChange={(value: 'delivery' | 'pickup') => setDeliveryType(value)}
                    className="flex flex-col space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="delivery" id="delivery" />
                      <Label htmlFor="delivery" className="flex items-center gap-2 cursor-pointer">
                        <Truck className="h-4 w-4" />
                        Anlieferung
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pickup" id="pickup" />
                      <Label htmlFor="pickup" className="flex items-center gap-2 cursor-pointer">
                        <Store className="h-4 w-4" />
                        Abholung
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Price Settings */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label>Preisanzeige</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="showPricesInTable"
                          checked={showPricesInTable}
                          onCheckedChange={setShowPricesInTable}
                        />
                        <Label htmlFor="showPricesInTable" className="flex items-center gap-2 cursor-pointer">
                          {showPricesInTable ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          Preise in Tabelle anzeigen
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="showPricesInEmail"
                          checked={showPricesInEmail}
                          onCheckedChange={setShowPricesInEmail}
                        />
                        <Label htmlFor="showPricesInEmail" className="flex items-center gap-2 cursor-pointer">
                          {showPricesInEmail ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          Preise in E-Mail anzeigen
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Notes */}
              <div className="mt-6 space-y-2">
                <Label htmlFor="orderNotes">Zusätzliche Notizen zur Bestellung</Label>
                <textarea
                  id="orderNotes"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Besondere Anweisungen, Lieferzeiten, oder andere wichtige Informationen..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[80px] resize-y"
                />
              </div>
            </CardContent>
          </Card>

          {forecastLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Prognose {forecastWeeks}W</TableHead>
                    <TableHead>Empfehlung</TableHead>
                    <TableHead>Bestellmenge</TableHead>
                    {showPricesInTable && <TableHead>Einkaufspreis</TableHead>}
                    <TableHead>Standorte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(forecastData) ? (forecastData as ForecastData[]).map((item: ForecastData) => {
                    const quantity = orderQuantities[item.productId] || 0;
                    const product = (inventoryData as any[])?.find((inv: any) => inv.product_id === item.productId);
                    const purchasePrice = product?.purchase_price || product?.price || 0;
                    const totalCost = quantity * purchasePrice;
                    const isExpanded = expandedRows[item.productId];
                    
                    // DEBUG: Log the product lookup and data
                    console.log(`🔍 PRODUCT LOOKUP DEBUG - ${item.productName}:`, {
                      productId: item.productId,
                      productFound: !!product,
                      productData: product,
                      inventoryDataType: typeof inventoryData,
                      inventoryDataLength: Array.isArray(inventoryData) ? inventoryData.length : 'not-array'
                    });
                    
                    // Calculate package information
                    const packageSize = product ? (product.package_size || 1) : 1;
                    const packageTypeName = product ? (product.package_type_name || 'Stück') : 'Stück';
                    const baseUnitName = product ? (product.base_unit_name || 'Stück') : 'Stück';
                    
                    // DEBUG: Log package calculation inputs
                    console.log(`🔍 PACKAGE CALC DEBUG - ${item.productName}:`, {
                      packageSize,
                      packageTypeName,
                      baseUnitName,
                      quantity,
                      productPackageFields: product ? {
                        package_size: product.package_size,
                        packageSize: product.packageSize,
                        package_type_name: product.package_type_name,
                        packageTypeName: product.packageTypeName,
                        base_unit_name: product.base_unit_name,
                        baseUnitName: product.baseUnitName
                      } : 'no-product'
                    });
                    
                    const packageInfo = product ? calculatePackageInfo(
                      quantity,
                      packageSize,
                      packageTypeName,
                      baseUnitName
                    ) : { packageCount: 0, totalQuantity: quantity, packageQuantity: 1, packageTypeName: 'Stück', baseUnitName: 'Stück' };
                    
                    console.log(`🔍 QUANTITY DEBUG - ${item.productName}:`, {
                      productId: item.productId,
                      quantity,
                      packageSize,
                      packageTypeName,
                      packageInfo,
                      orderQuantitiesCount: Object.keys(orderQuantities).length
                    });
                    
                    // Apply holiday and tourism factors to forecasted demand
                    const holidayBoost = (forecastFactors as any)?.holidays?.boost || 25;
                    const weatherFactor = (forecastFactors as any)?.weather?.factor || 5;
                    const tourismFactor = (forecastFactors as any)?.tourism?.factor || 15;
                    
                    // Determine if this is a tourist location
                    const touristLocations = ['Bad Schandau', 'Pillnitz', 'Stolpen', 'Bahnhof'];
                    const warehouseData = (inventoryData as any[])?.filter((inv: any) => inv.productId === item.productId);
                    const isTouristLocation = warehouseData?.some((inv: any) => 
                      touristLocations.some(location => 
                        inv.location_name?.toLowerCase().includes(location.toLowerCase())
                      )
                    );
                    
                    // Calculate enhanced forecast with factors
                    let enhancedForecast = item.forecastedDemand;
                    if (isTouristLocation) {
                      enhancedForecast = enhancedForecast * (1 + (holidayBoost + tourismFactor) / 100);
                    } else {
                      enhancedForecast = enhancedForecast * (1 + weatherFactor / 100);
                    }
                    enhancedForecast = Math.round(enhancedForecast);
                    
                    // Calculate package counts for enhanced forecast and recommendation
                    const forecastPackageInfo = product ? calculatePackageInfo(
                      enhancedForecast,
                      packageSize,
                      packageTypeName,
                      baseUnitName
                    ) : { packageCount: 0, totalQuantity: enhancedForecast, packageQuantity: 1, packageTypeName: 'Stück', baseUnitName: 'Stück' };
                    
                    const rows = [
                      <TableRow key={item.productId}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{item.productName}</div>
                            {product && packageSize > 1 && (
                              <div className="text-xs text-muted-foreground">
                                {packageTypeName} à {packageSize} {baseUnitName}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {product && packageSize > 1 ? 
                              `${Math.ceil(enhancedForecast / packageSize)} ${packageTypeName} erwartet` :
                              `${enhancedForecast} Stück erwartet`
                            }
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {product && packageSize > 1 ? 
                              `${Math.ceil(enhancedForecast / packageSize)} ${packageTypeName} bestellen` :
                              `${enhancedForecast} Stück bestellen`
                            }
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  console.log('🔍 MINUS BUTTON CLICKED:', {
                                    productId: item.productId,
                                    currentQuantity: quantity,
                                    packageSize
                                  });
                                  const newQuantity = product && packageSize > 1 ? 
                                    getPreviousValidPackageQuantity(quantity, packageSize) : 
                                    quantity - 1;
                                  updateOrderQuantity(item.productId, newQuantity);
                                }}
                                disabled={quantity <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <div className="relative">
                                <Input
                                  type="number"
                                  value={product && packageSize > 1 ? packageInfo.packageCount : quantity}
                                  onChange={(e) => {
                                    const inputValue = parseInt(e.target.value) || 0;
                                    const newQuantity = product && packageSize > 1 ? 
                                      inputValue * packageSize : 
                                      inputValue;
                                    updateOrderQuantity(item.productId, newQuantity);
                                  }}
                                  className="w-20 text-center pr-8"
                                  min="0"
                                  step={packageSize > 1 ? 1 : 1}
                                />
                                {product && packageSize > 1 && (
                                  <div className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                    {packageTypeName.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  console.log('🔍 PLUS BUTTON CLICKED:', {
                                    productId: item.productId,
                                    currentQuantity: quantity,
                                    packageSize
                                  });
                                  const newQuantity = product && packageSize > 1 ? 
                                    getNextValidPackageQuantity(quantity, packageSize) : 
                                    quantity + 1;
                                  updateOrderQuantity(item.productId, newQuantity);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  console.log('🔍 ZERO BUTTON CLICKED:', {
                                    productId: item.productId,
                                    currentQuantity: quantity
                                  });
                                  updateOrderQuantity(item.productId, 0);
                                }}
                                className="text-red-600 hover:text-red-700 min-w-[32px]"
                                title="Menge auf 0 setzen"
                              >
                                0
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  // Enhanced forecast with proper package rounding - matches exactly with user order quantity
                                  console.log('🔍 EMPFEHLUNG BUTTON CLICKED:', {
                                    productId: item.productId,
                                    enhancedForecast,
                                    packageSize,
                                    productName: item.productName
                                  });
                                  
                                  let recommendedQuantity = enhancedForecast;
                                  
                                  // Package-based rounding only if packageSize > 1
                                  if (product && packageSize > 1) {
                                    const packages = Math.ceil(enhancedForecast / packageSize);
                                    recommendedQuantity = packages * packageSize;
                                    console.log('🔍 PACKAGE CALCULATION:', {
                                      enhancedForecast,
                                      packageSize,
                                      packages,
                                      recommendedQuantity
                                    });
                                  }
                                  
                                  setOrderQuantities(prev => ({ 
                                    ...prev, 
                                    [item.productId]: recommendedQuantity 
                                  }));
                                  
                                  console.log('🔍 ORDER QUANTITIES UPDATED:', {
                                    productId: item.productId,
                                    oldQuantity: orderQuantities[item.productId] || 0,
                                    newQuantity: recommendedQuantity
                                  });
                                }}
                                className="text-green-600 hover:text-green-700"
                              >
                                {isTouristLocation ? '🏖️ Ferien-Boost' : '📈 Empfehlung'}
                              </Button>
                            </div>
                            {quantity > 0 && (
                              <div className="text-xs font-medium text-center">
                                {product && packageSize > 1 ? (
                                  <div className="bg-blue-50 p-2 rounded border text-primary">
                                    <div className="font-bold text-sm">
                                      {packageInfo.packageCount} {packageTypeName} bestellen
                                    </div>
                                    {/* Removed small package calculation display per user request - no "36 i" numbers */}
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground">
                                    {quantity} {baseUnitName}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {showPricesInTable && (
                          <TableCell>
                            <div className="text-right">
                              <div className="font-medium">{totalCost.toFixed(2)} €</div>
                              {quantity > 0 && product && packageSize > 1 && (
                                <div className="text-xs text-muted-foreground">
                                  {packageInfo.packageCount} × {(purchasePrice * packageSize).toFixed(2)} €
                                </div>
                              )}
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpansion(item.productId)}
                            disabled={quantity === 0}
                            className="flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <MapPin className="h-3 w-3" />
                            Standorte
                          </Button>
                        </TableCell>
                      </TableRow>
                    ];
                    
                    if (isExpanded && quantity > 0) {
                      rows.push(
                        <TableRow key={`${item.productId}-details`} className="bg-gray-50">
                          <TableCell colSpan={showPricesInTable ? 6 : 5} className="p-0">
                            <ForecastLocationBreakdown 
                              productId={item.productId} 
                              totalQuantity={quantity} 
                              forecastWeeks={forecastWeeks} 
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    return rows;
                  }) : (
                    <TableRow>
                      <TableCell colSpan={showPricesInTable ? 6 : 5} className="text-center py-8 text-muted-foreground">
                        Keine Prognosedaten verfügbar
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              <Separator />
              
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Gesamtmenge: {totals.totalItems} Artikel{totals.totalPackages > 0 && ` (${totals.totalPackages} Pakete)`}
                  </p>
                  <p className="text-lg font-semibold">
                    Gesamtwert: {totals.totalValue.toFixed(2)} €
                  </p>
                </div>
                
                {/* BESTELLUNG ERSTELLEN Button auch unten hinzugefügt - alle 7 Probleme gelöst */}
                <Button 
                  onClick={() => {
                    console.log('🔍 CREATE ORDER BUTTON UNTEN CLICKED (Final Implementation):', {
                      totals,
                      selectedWarehouseId,
                      orderQuantities,
                      isPending: createOrderMutation.isPending
                    });
                    handleCreateOrder();
                  }}
                  disabled={createOrderMutation.isPending || totals.totalItems === 0}
                  className={!selectedWarehouseId ? "bg-orange-500 hover:bg-orange-600" : "bg-green-600 hover:bg-green-700"}
                  size="lg"
                >
                  {createOrderMutation.isPending ? "Erstelle..." : 
                   !selectedWarehouseId ? "Lager auswählen!" :
                   `Bestellung erstellen (${totals.totalItems} Artikel)`}
                  <ShoppingCart className="ml-2 h-4 w-4" />
                </Button>

              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Großbestellung für alle Lager</h1>
          <p className="text-muted-foreground">
            Erstellen Sie eine umfassende Bestellung basierend auf Bestandsanalyse und Verkaufsprognosen
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
      </div>

      <div className="flex justify-center mb-6">
        <div className="flex items-center space-x-4">
          {[
            { key: 'supplier', label: 'Lieferant', icon: Package },
            { key: 'warehouse', label: 'Lager', icon: Store },
            { key: 'inventory', label: 'Bestand', icon: Warehouse },
            { key: 'analysis', label: 'Analyse', icon: BarChart3 },
            { key: 'forecast', label: 'Prognose', icon: Calculator },
            { key: 'order', label: 'Bestellung', icon: ShoppingCart },
          ].map(({ key, label, icon: Icon }, index) => (
            <div key={key} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step === key ? 'bg-primary text-primary-foreground' : 
                ['supplier', 'warehouse', 'inventory', 'analysis', 'forecast', 'order'].indexOf(step) > index ? 'bg-green-500 text-white' : 'bg-muted'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`ml-2 text-sm ${step === key ? 'font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {index < 5 && <div className="w-8 h-px bg-border ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {step === 'supplier' && renderSupplierSelection()}
      {step === 'warehouse' && renderWarehouseSelection()}
      {step === 'inventory' && renderInventoryOverview()}
      {step === 'analysis' && renderSalesAnalysis()}
      {step === 'forecast' && renderForecastAndOrder()}
    </div>
  );
};

export default BulkOrderMode;
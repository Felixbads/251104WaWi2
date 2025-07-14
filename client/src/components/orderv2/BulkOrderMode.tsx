import React, { useState, useEffect } from 'react';
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
  MapPin,
  Truck,
  Store
} from 'lucide-react';

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
  const [analysisWeeks, setAnalysisWeeks] = useState<number>(4);
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

  // Data queries
  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60 * 5,
  });

  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5,
  });

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: [`/api/bulk-orders/inventory/bulk/${selectedSupplierId}`],
    enabled: !!selectedSupplierId,
    staleTime: 0, // Force fresh data
  });

  // Debug logging for inventory data
  useEffect(() => {
    if (inventoryData) {
      console.log(`[BulkOrderMode] Inventory data received for supplier ${selectedSupplierId}:`, {
        dataLength: Array.isArray(inventoryData) ? inventoryData.length : 'not-array',
        firstProduct: Array.isArray(inventoryData) ? inventoryData[0]?.product_name : null,
        rawData: inventoryData
      });
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

  // Auto-populate order quantities when forecast data loads
  useEffect(() => {
    if (forecastData && Array.isArray(forecastData) && step === 'forecast') {
      const newQuantities: Record<number, number> = {};
      (forecastData as ForecastData[]).forEach((item: ForecastData) => {
        newQuantities[item.productId] = Math.max(0, item.forecastedDemand || 0);
      });
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
    setStep('warehouse');
  };

  // Handle warehouse selection
  const handleWarehouseSelect = (warehouseId: number, warehouseName: string) => {
    console.log(`[BulkOrderMode] Warehouse selected:`, { warehouseId, warehouseName });
    
    setSelectedWarehouseId(warehouseId);
    setSelectedWarehouseName(warehouseName);
    setStep('inventory');
  };

  // Handle order quantity changes
  const updateOrderQuantity = (productId: number, quantity: number) => {
    setOrderQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, quantity)
    }));
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

  // Calculate totals
  const calculateTotals = () => {
    if (!inventoryData) return { totalItems: 0, totalValue: 0 };
    
    let totalItems = 0;
    let totalValue = 0;
    
    Object.entries(orderQuantities).forEach(([productId, quantity]) => {
      if (quantity > 0) {
        totalItems += quantity;
        const product = (inventoryData as any[])?.find((item: any) => item.productId === parseInt(productId));
        if (product) {
          totalValue += quantity * product.price;
        }
      }
    });
    
    return { totalItems, totalValue };
  };

  // Create order
  const handleCreateOrder = () => {
    if (!selectedSupplierId || Object.keys(orderQuantities).length === 0) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte wählen Sie Produkte und Mengen aus.",
        variant: "destructive",
      });
      return;
    }

    const orderItems = Object.entries(orderQuantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId: parseInt(productId),
        quantity,
        notes: `Großbestellung - Prognose für ${forecastWeeks} Wochen`,
      }));

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
      notes: orderNotes || `Großbestellung für ${selectedWarehouseName || 'Lager'} - Analyse: ${analysisWeeks} Wochen, Prognose: ${forecastWeeks} Wochen`,
      priority: "high",
      items: orderItems,
      orderMode: "bulk",
      analysisWeeks,
      forecastWeeks,
      totalValue: calculateTotals().totalValue
    };

    createOrderMutation.mutate(orderData);
  };

  // Render warehouse selection step
  const renderWarehouseSelection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-5 w-5" />
          Lager für Bestellung auswählen <span className="text-red-500">*</span>
        </CardTitle>
        <CardDescription>
          Wählen Sie das Lager aus, das die Bestellung erhalten soll
        </CardDescription>
      </CardHeader>
      <CardContent>
        {warehousesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(warehouses as any)?.data?.map((warehouse: any) => (
                <Card 
                  key={warehouse.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedWarehouseId === warehouse.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleWarehouseSelect(warehouse.id, warehouse.name)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedWarehouseId === warehouse.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        <Store className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{warehouse.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {warehouse.location || 'Standort nicht angegeben'}
                        </p>
                        {warehouse.address && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {warehouse.address}
                          </p>
                        )}
                      </div>
                      {selectedWarehouseId === warehouse.id && (
                        <div className="text-primary">
                          ✓
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )) || []}
            </div>
            

            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('supplier')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
              <Button 
                onClick={() => setStep('inventory')}
                disabled={!selectedWarehouseId}
                className={!selectedWarehouseId ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Weiter zu Bestandsübersicht
                <Warehouse className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render supplier selection step
  const renderSupplierSelection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Lieferant für Großbestellung auswählen
        </CardTitle>
        <CardDescription>
          Wählen Sie den Lieferanten für Ihre Großbestellung an alle Lager aus.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {suppliersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(suppliers as any)?.data?.map((supplier: any) => (
              <Card 
                key={supplier.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleSupplierSelect(supplier.id, supplier.name)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">{supplier.name}</h3>
                      {supplier.email && (
                        <p className="text-sm text-muted-foreground">{supplier.email}</p>
                      )}
                    </div>
                    <Badge variant="outline">
                      {supplier.productCount || 0} Produkte
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

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
                  <TableHead>Gesamtbestand</TableHead>
                  <TableHead>Verfügbar</TableHead>
                  <TableHead>Reserviert</TableHead>
                  <TableHead>Min/Max</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inventoryData as any[])?.map((item: any) => (
                  <TableRow key={item.product_id}>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>{item.total_stock}</TableCell>
                    <TableCell>{item.available_stock}</TableCell>
                    <TableCell>{item.reserved_stock}</TableCell>
                    <TableCell>{item.min_stock}/{item.max_stock}</TableCell>
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
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('warehouse')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
              <Button onClick={() => setStep('analysis')}>
                Verkaufsanalyse
                <BarChart3 className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render sales analysis step
  const renderSalesAnalysis = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Verkaufsanalyse für {selectedSupplierName}
        </CardTitle>
        <CardDescription>
          Analyse der Verkäufe der letzten Wochen
        </CardDescription>
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
                  salesAnalysis.map((item: SalesAnalysis) => {
                    const isExpanded = expandedRows[item.productId];
                    return (
                      <React.Fragment key={item.productId}>
                        <TableRow>
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
                        
                        {isExpanded && (
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={6} className="p-0">
                              <SalesLocationBreakdown productId={item.productId} analysisWeeks={analysisWeeks} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
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
            
            <div className="flex justify-between">
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

          {/* Weather and Holiday Context */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Prognosefaktoren für die nächsten {forecastWeeks} Wochen</h4>
            {factorsLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-blue-200 animate-pulse rounded w-3/4" />
                <div className="h-4 bg-blue-200 animate-pulse rounded w-1/2" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-blue-800">🌤️ Wetter erwartet:</p>
                  <p className="text-blue-700">
                    {(forecastFactors as any)?.weather?.description || "Wechselhaft, 15-25°C, vereinzelt Regen"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-blue-800">🏖️ Feiertage & Urlaub:</p>
                  <p className="text-blue-700">
                    {(forecastFactors as any)?.holidays?.description || "Keine besonderen Ereignisse"}
                  </p>
                </div>
              </div>
            )}
            <p className="text-xs text-blue-600 mt-2">
              ℹ️ {(forecastFactors as any)?.notes || "Diese Faktoren werden in der automatischen Prognose berücksichtigt"}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Delivery Date */}
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">Gewünschtes Lieferdatum</Label>
                  <div className="relative">
                    <DatePicker
                      selected={deliveryDate}
                      onChange={(date: Date) => setDeliveryDate(date)}
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
                    {showPricesInTable && <TableHead>Gesamt</TableHead>}
                    <TableHead>Standorte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(forecastData) ? (forecastData as ForecastData[]).map((item: ForecastData) => {
                    const quantity = orderQuantities[item.productId] || 0;
                    const product = (inventoryData as any[])?.find((inv: any) => inv.productId === item.productId);
                    const totalCost = quantity * (product?.price || 0);
                    const isExpanded = expandedRows[item.productId];
                    
                    return (
                      <React.Fragment key={item.productId}>
                        <TableRow>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {item.forecastedDemand} erwartet
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {/* Show forecasted demand as recommendation */}
                              {item.forecastedDemand} bestellen
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateOrderQuantity(item.productId, quantity - 1)}
                                disabled={quantity <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => updateOrderQuantity(item.productId, parseInt(e.target.value) || 0)}
                                className="w-20 text-center"
                                min="0"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateOrderQuantity(item.productId, quantity + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setOrderQuantities(prev => ({ ...prev, [item.productId]: item.forecastedDemand }))}
                              >
                                Empfehlung
                              </Button>
                            </div>
                          </TableCell>
                          {showPricesInTable && <TableCell>{totalCost.toFixed(2)} €</TableCell>}
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
                        
                        {isExpanded && quantity > 0 && (
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={showPricesInTable ? 6 : 5} className="p-0">
                              <ForecastLocationBreakdown 
                                productId={item.productId} 
                                totalQuantity={quantity} 
                                forecastWeeks={forecastWeeks} 
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
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
                    Gesamtmenge: {totals.totalItems} Artikel
                  </p>
                  <p className="text-lg font-semibold">
                    Gesamtwert: {totals.totalValue.toFixed(2)} €
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('analysis')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button 
                    onClick={handleCreateOrder}
                    disabled={createOrderMutation.isPending || totals.totalItems === 0}
                  >
                    {createOrderMutation.isPending ? "Erstelle..." : "Bestellung erstellen"}
                    <ShoppingCart className="ml-2 h-4 w-4" />
                  </Button>
                </div>
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
          ].map(({ key, label, icon: Icon }, index) => (
            <div key={key} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step === key ? 'bg-primary text-primary-foreground' : 
                ['supplier', 'warehouse', 'inventory', 'analysis', 'forecast'].indexOf(step) > index ? 'bg-green-500 text-white' : 'bg-muted'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`ml-2 text-sm ${step === key ? 'font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {index < 4 && <div className="w-8 h-px bg-border ml-4" />}
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
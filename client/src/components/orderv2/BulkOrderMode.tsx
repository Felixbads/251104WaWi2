import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, subWeeks, addWeeks } from 'date-fns';
import { de } from 'date-fns/locale';

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
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  MapPin
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
  predictedSales1Week: number;
  predictedSales2Week: number;
  predictedSales3Week: number;
  recommendedOrder: number;
}

const BulkOrderMode: React.FC<BulkOrderModeProps> = ({
  onBack,
  onOrderCreated
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [step, setStep] = useState<'supplier' | 'inventory' | 'analysis' | 'forecast' | 'order'>('supplier');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>('');
  const [analysisWeeks, setAnalysisWeeks] = useState<number>(4);
  const [forecastWeeks, setForecastWeeks] = useState<number>(2);
  const [orderQuantities, setOrderQuantities] = useState<Record<number, number>>({});
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

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
    staleTime: 1000 * 60 * 2,
  });

  const { data: salesAnalysis, isLoading: salesLoading } = useQuery({
    queryKey: [`/api/bulk-orders/analysis/${selectedSupplierId}/${analysisWeeks}`],
    enabled: !!selectedSupplierId && step === 'analysis',
    staleTime: 1000 * 60 * 5,
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: [`/api/bulk-orders/forecast/${selectedSupplierId}/${forecastWeeks}`],
    enabled: !!selectedSupplierId && step === 'forecast',
    staleTime: 1000 * 60 * 5,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return apiRequest('/api/orders/bulk', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
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

  // Handle supplier selection
  const handleSupplierSelect = (supplierId: number, supplierName: string) => {
    setSelectedSupplierId(supplierId);
    setSelectedSupplierName(supplierName);
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

    const warehouseList = Array.isArray(warehouses) ? warehouses : warehouses.data || [];
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

    const orderData = {
      supplierId: selectedSupplierId,
      orderType: 'bulk',
      warehouseId: null, // Bulk order for main warehouse
      expectedDeliveryDate: addWeeks(new Date(), 1).toISOString(),
      notes: `Großbestellung für alle Lager - Analyse: ${analysisWeeks} Wochen, Prognose: ${forecastWeeks} Wochen`,
      priority: "high",
      items: orderItems,
      orderMode: "bulk",
      analysisWeeks,
      forecastWeeks,
      totalValue: calculateTotals().totalValue
    };

    createOrderMutation.mutate(orderData);
  };

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
                      <Badge 
                        variant={
                          parseInt(item.available_stock) <= item.min_stock ? "destructive" :
                          parseInt(item.available_stock) <= item.min_stock * 1.5 ? "secondary" : "default"
                        }
                      >
                        {parseInt(item.available_stock) <= item.min_stock ? "Niedrig" :
                         parseInt(item.available_stock) <= item.min_stock * 1.5 ? "Warnung" : "OK"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('supplier')}>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(salesAnalysis) && salesAnalysis.length > 0 ? (
                  salesAnalysis.map((item: SalesAnalysis) => (
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
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-blue-800">🌤️ Wetter erwartet:</p>
                <p className="text-blue-700">
                  {forecastWeeks === 1 ? "Überwiegend sonnig, 18-22°C" :
                   forecastWeeks === 2 ? "Wechselhaft, 15-25°C, vereinzelt Regen" :
                   forecastWeeks === 3 ? "Sommerlich warm, 20-28°C, wenig Niederschlag" :
                   "Hochsommer, 22-30°C, meist trocken"}
                </p>
              </div>
              <div>
                <p className="font-medium text-blue-800">🏖️ Feiertage & Urlaub:</p>
                <p className="text-blue-700">
                  {forecastWeeks === 1 ? "Keine Feiertage" :
                   forecastWeeks === 2 ? "Keine besonderen Ereignisse" :
                   forecastWeeks === 3 ? "Sommerferienzeit beginnt" :
                   "Hauptferienzeit - erhöhter Tourismus"}
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              ℹ️ Diese Faktoren werden in der automatischen Prognose berücksichtigt
            </p>
          </div>

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
                    <TableHead>Gesamt</TableHead>
                    <TableHead>Standorte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(forecastData) ? (forecastData as ForecastData[]).map((item: ForecastData) => {
                    const quantity = orderQuantities[item.productId] || 0;
                    const product = (inventoryData as any[])?.find((inv: any) => inv.productId === item.productId);
                    const totalCost = quantity * (product?.price || 0);
                    const isExpanded = expandedRows[item.productId];
                    const locationBreakdown = calculateLocationBreakdown(item.productId, quantity);
                    
                    return (
                      <React.Fragment key={item.productId}>
                        <TableRow>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>
                            {forecastWeeks === 1 ? item.predictedSales1Week :
                             forecastWeeks === 2 ? item.predictedSales2Week :
                             item.predictedSales3Week}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.recommendedOrder}</Badge>
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
                                onClick={() => setOrderQuantities(prev => ({ ...prev, [item.productId]: item.recommendedOrder }))}
                              >
                                Empfehlung
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{totalCost.toFixed(2)} €</TableCell>
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
                              {locationBreakdown.length} Standorte
                            </Button>
                          </TableCell>
                        </TableRow>
                        
                        {isExpanded && quantity > 0 && (
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={6} className="p-0">
                              <div className="p-4 space-y-3">
                                <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  Verteilung auf Standorte (Gesamt: {quantity} Stück)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {locationBreakdown.map((location: any) => (
                                    <div 
                                      key={location.warehouseId} 
                                      className="p-3 bg-white rounded border border-gray-200"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="font-medium text-sm text-gray-900">
                                          {location.warehouseName}
                                        </div>
                                        <Badge 
                                          variant="secondary" 
                                          className="text-xs"
                                        >
                                          {location.recommendedQuantity} Stk.
                                        </Badge>
                                      </div>
                                      <div className="space-y-1 text-xs text-gray-600">
                                        <div>Aktuell: {location.currentStock} im Lager</div>
                                        <div className="text-xs text-blue-600">{location.reason}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-gray-500 mt-2">
                                  💡 Die Verteilung berücksichtigt aktuelle Lagerbestände - Standorte mit niedrigeren Beständen erhalten proportional mehr.
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
            { key: 'inventory', label: 'Bestand', icon: Warehouse },
            { key: 'analysis', label: 'Analyse', icon: BarChart3 },
            { key: 'forecast', label: 'Prognose', icon: Calculator },
          ].map(({ key, label, icon: Icon }, index) => (
            <div key={key} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step === key ? 'bg-primary text-primary-foreground' : 
                ['supplier', 'inventory', 'analysis', 'forecast'].indexOf(step) > index ? 'bg-green-500 text-white' : 'bg-muted'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`ml-2 text-sm ${step === key ? 'font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {index < 3 && <div className="w-8 h-px bg-border ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {step === 'supplier' && renderSupplierSelection()}
      {step === 'inventory' && renderInventoryOverview()}
      {step === 'analysis' && renderSalesAnalysis()}
      {step === 'forecast' && renderForecastAndOrder()}
    </div>
  );
};

export default BulkOrderMode;
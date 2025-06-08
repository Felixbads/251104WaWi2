import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, addDays } from 'date-fns';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Icons
import { 
  BarChart4, 
  ArrowLeft, 
  Loader2, 
  TrendingUp, 
  Package,
  Calendar,
  Euro,
  MapPin,
  Truck,
  AlertTriangle,
  CheckCircle,
  ShoppingCart,
  Building2,
  Target,
  ChevronRight
} from 'lucide-react';

interface ForecastOrderModeProps {
  onBack: () => void;
  onOrderCreated: (orderId: number) => void;
}

interface SupplierForecastData {
  supplierId: number;
  supplierName: string;
  totalOrderValue: number;
  forecastPeriod: {
    weeksAhead: number;
    startDate: string;
    endDate: string;
  };
  warehouseAllocations: WarehouseAllocation[];
  consolidatedProducts: ConsolidatedProduct[];
  deliveryOptimization: DeliveryPlan;
  summary: {
    totalWarehouses: number;
    totalProducts: number;
    estimatedSavings: number;
    weatherImpact: string;
    holidayImpact: string;
  };
}

interface WarehouseAllocation {
  warehouseId: number;
  warehouseName: string;
  locationName: string;
  products: ProductAllocation[];
  deliveryPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedDeliveryDate: string;
  totalValue: number;
  urgencyScore: number;
}

interface ProductAllocation {
  productId: number;
  productName: string;
  currentStock: number;
  predictedSales: number;
  suggestedQuantity: number;
  unitPrice: number;
  totalCost: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ConsolidatedProduct {
  productId: number;
  productName: string;
  sku: string;
  totalDemand: number;
  warehouseBreakdown: any[];
  weatherImpact: number;
  holidayImpact: number;
  consolidatedOrderQuantity: number;
  unitPrice: number;
  totalValue: number;
  minOrderQuantity: number;
  volumeDiscount: number;
}

interface DeliveryPlan {
  routes: any[];
  totalDistance: number;
  estimatedCost: number;
  deliveryDays: number;
  optimization: string;
}

export default function ForecastOrderMode({ onBack, onOrderCreated }: ForecastOrderModeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [step, setStep] = useState<'config' | 'supplier' | 'analysis' | 'review'>('config');
  const [weeksAhead, setWeeksAhead] = useState(2);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [includeHolidays, setIncludeHolidays] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [forecastData, setForecastData] = useState<SupplierForecastData | null>(null);
  const [notes, setNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date>(addDays(new Date(), 7));

  // Queries
  const { data: availableSuppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['/api/forecast/available-suppliers'],
    enabled: step === 'supplier',
  });

  const { data: supplierAnalysis, isLoading: loadingAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: [`/api/forecast/supplier-analysis?supplierId=${selectedSupplierId}&weeksAhead=${weeksAhead}&includeWeather=${includeWeather}&includeHolidays=${includeHolidays}`],
    enabled: false,
  });

  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return apiRequest('/api/orders/forecast-based', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Prognosebasierte Bestellung erstellt",
        description: `Bestellung wurde erfolgreich für ${forecastData?.summary.totalWarehouses} Lager erstellt.`,
      });
      onOrderCreated(data.orderId);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen der Bestellung",
        description: error.message || "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });

  // Generate forecast analysis
  const handleAnalyzeSupplier = async () => {
    if (!selectedSupplierId) return;
    
    try {
      const result = await refetchAnalysis();
      if (result.data) {
        setForecastData(result.data as SupplierForecastData);
        setStep('analysis');
      }
    } catch (error) {
      toast({
        title: "Fehler bei der Analyse",
        description: "Die Prognose-Analyse konnte nicht durchgeführt werden.",
        variant: "destructive",
      });
    }
  };

  // Create consolidated order
  const handleCreateOrder = () => {
    if (!forecastData) return;

    const orderData = {
      mode: 'forecast',
      supplierId: selectedSupplierId,
      forecastPeriod: forecastData.forecastPeriod,
      warehouseAllocations: forecastData.warehouseAllocations,
      consolidatedProducts: forecastData.consolidatedProducts,
      deliveryOptimization: forecastData.deliveryOptimization,
      notes,
      expectedDeliveryDate: format(deliveryDate, 'yyyy-MM-dd'),
      weatherIncluded: includeWeather,
      holidaysIncluded: includeHolidays
    };

    createOrderMutation.mutate(orderData);
  };

  const getPriorityBadge = (priority: 'HIGH' | 'MEDIUM' | 'LOW') => {
    const colors = {
      HIGH: 'bg-red-500',
      MEDIUM: 'bg-yellow-500', 
      LOW: 'bg-green-500'
    };
    return <Badge className={`${colors[priority]} text-white`}>{priority}</Badge>;
  };

  if (step === 'config') {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart4 className="h-5 w-5" />
            Prognosebasierte Bestellung konfigurieren
          </CardTitle>
          <CardDescription>
            Erstellen Sie eine optimierte Bestellung basierend auf Verkaufsprognosen für mehrere Lager
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prognosezeitraum</Label>
              <Select value={weeksAhead.toString()} onValueChange={(value) => setWeeksAhead(parseInt(value))}>
                <SelectTrigger>
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
            
            <div className="space-y-2">
              <Label>Liefertermin</Label>
              <Input
                type="date"
                value={format(deliveryDate, 'yyyy-MM-dd')}
                onChange={(e) => setDeliveryDate(new Date(e.target.value))}
              />
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium mb-3">Prognose-Faktoren</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeWeather"
                  checked={includeWeather}
                  onChange={(e) => setIncludeWeather(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="includeWeather" className="text-sm">
                  Wetterdaten berücksichtigen
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeHolidays"
                  checked={includeHolidays}
                  onChange={(e) => setIncludeHolidays(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="includeHolidays" className="text-sm">
                  Feiertage berücksichtigen
                </Label>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <Button onClick={() => setStep('supplier')}>
              Weiter zu Lieferantenauswahl
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'supplier') {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Lieferant für Prognose-Analyse auswählen
          </CardTitle>
          <CardDescription>
            Wählen Sie einen Lieferanten für die bedarfsbasierte Bestellungsanalyse
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {loadingSuppliers ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {availableSuppliers?.suppliers?.map((supplier: any) => (
                <Card 
                  key={supplier.id} 
                  className={`cursor-pointer transition-colors ${
                    selectedSupplierId === supplier.id ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedSupplierId(supplier.id)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      {/* Supplier Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-lg">{supplier.name}</h3>
                          <p className="text-sm text-gray-600">
                            {supplier.warehouse_count} Lager • {supplier.product_count} Produkte
                          </p>
                          <p className="text-sm text-gray-500">
                            Gesamtbestand: {supplier.total_inventory} Einheiten
                          </p>
                        </div>
                        <div className="text-right">
                          {supplier.minimum_order_value && (
                            <p className="text-sm text-gray-600">
                              Min. Bestellwert: €{supplier.minimum_order_value}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Warehouse Inventory Details */}
                      {supplier.warehouse_details && supplier.warehouse_details.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-gray-700">Lagerbestände:</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {supplier.warehouse_details.map((warehouse: any) => (
                              <div key={warehouse.warehouse_id} className="bg-gray-50 p-2 rounded text-xs">
                                <div className="font-medium">{warehouse.warehouse_name}</div>
                                <div className="text-gray-600">{warehouse.warehouse_location}</div>
                                <div className="flex justify-between mt-1">
                                  <span>Bestand: {warehouse.total_stock}</span>
                                  <span className="text-gray-500">{warehouse.product_count} Produkte</span>
                                </div>
                                {warehouse.low_stock_products > 0 && (
                                  <div className="text-orange-600 mt-1">
                                    {warehouse.low_stock_products} niedrige Bestände
                                  </div>
                                )}
                                {warehouse.out_of_stock_products > 0 && (
                                  <div className="text-red-600 mt-1">
                                    {warehouse.out_of_stock_products} ausverkauft
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top Products Preview */}
                      {supplier.top_products && supplier.top_products.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-gray-700">Top-Produkte:</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {supplier.top_products.slice(0, 4).map((product: any) => (
                              <div key={product.id} className="bg-blue-50 p-2 rounded text-xs">
                                <div className="font-medium truncate">{product.product_name}</div>
                                <div className="flex justify-between text-gray-600">
                                  <span>Gesamt: {product.total_stock_all_warehouses}</span>
                                  <span>{product.warehouses_with_stock} Lager</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('config')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <Button 
              onClick={handleAnalyzeSupplier}
              disabled={!selectedSupplierId || loadingAnalysis}
            >
              {loadingAnalysis ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Prognose-Analyse starten
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'analysis' && forecastData) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Prognose-Analyse: {forecastData.supplierName}
            </CardTitle>
            <CardDescription>
              {forecastData.forecastPeriod.weeksAhead} Wochen Vorhersage 
              ({format(new Date(forecastData.forecastPeriod.startDate), 'dd.MM.yyyy')} - 
              {format(new Date(forecastData.forecastPeriod.endDate), 'dd.MM.yyyy')})
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {forecastData.summary.totalWarehouses}
                </div>
                <div className="text-sm text-gray-600">Lager betroffen</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {forecastData.summary.totalProducts}
                </div>
                <div className="text-sm text-gray-600">Produkte</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  €{forecastData.totalOrderValue.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Gesamtwert</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  €{forecastData.summary.estimatedSavings.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Geschätzte Einsparungen</div>
              </div>
            </div>
            
            <Separator className="my-4" />
            
            <div className="flex justify-between text-sm">
              <span>Wetterimpact: {forecastData.summary.weatherImpact}</span>
              <span>Feiertagsimpact: {forecastData.summary.holidayImpact}</span>
            </div>
          </CardContent>
        </Card>

        {/* Warehouse Allocations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Lager-Zuordnungen
            </CardTitle>
          </CardHeader>
          
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lager</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>Produkte</TableHead>
                  <TableHead>Priorität</TableHead>
                  <TableHead>Liefertermin</TableHead>
                  <TableHead className="text-right">Wert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecastData.warehouseAllocations.map((allocation) => (
                  <TableRow key={allocation.warehouseId}>
                    <TableCell className="font-medium">{allocation.warehouseName}</TableCell>
                    <TableCell>{allocation.locationName}</TableCell>
                    <TableCell>{allocation.products.length}</TableCell>
                    <TableCell>{getPriorityBadge(allocation.deliveryPriority)}</TableCell>
                    <TableCell>{format(new Date(allocation.suggestedDeliveryDate), 'dd.MM.yyyy')}</TableCell>
                    <TableCell className="text-right">€{allocation.totalValue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Consolidated Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Konsolidierte Produktbestellung
            </CardTitle>
          </CardHeader>
          
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Gesamtbedarf</TableHead>
                  <TableHead className="text-right">Bestellmenge</TableHead>
                  <TableHead className="text-right">Einzelpreis</TableHead>
                  <TableHead className="text-right">Gesamtwert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecastData.consolidatedProducts.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell className="text-right">{product.totalDemand}</TableCell>
                    <TableCell className="text-right">{product.consolidatedOrderQuantity}</TableCell>
                    <TableCell className="text-right">€{product.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">€{product.totalValue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('supplier')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          <Button onClick={() => setStep('review')}>
            Zur Bestellungsübersicht
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'review' && forecastData) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Bestellung bestätigen
          </CardTitle>
          <CardDescription>
            Überprüfen Sie die prognosebasierte Bestellung vor der Erstellung
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Diese Bestellung wird für {forecastData.summary.totalWarehouses} Lager mit {forecastData.summary.totalProducts} verschiedenen Produkten erstellt.
              Gesamtwert: €{forecastData.totalOrderValue.toFixed(2)}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="notes">Zusätzliche Notizen</Label>
            <Textarea
              id="notes"
              placeholder="Besondere Anweisungen für diese Bestellung..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('analysis')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zur Analyse
            </Button>
            <Button 
              onClick={handleCreateOrder}
              disabled={createOrderMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Erstelle Bestellung...
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Bestellung erstellen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  Warehouse, 
  BarChart3, 
  Calculator, 
  ArrowLeft, 
  ChevronDown, 
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  EyeOff
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

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

const SalesLocationBreakdown: React.FC<{
  productId: number;
  analysisWeeks: number;
}> = ({ productId, analysisWeeks }) => {
  const { data: locationSales, isLoading } = useQuery({
    queryKey: [`/api/bulk-orders/sales-analysis/locations/${productId}`, analysisWeeks],
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Lade Standortdaten...</div>;
  }

  if (!locationSales || !Array.isArray(locationSales) || locationSales.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">Keine Standortdaten verfügbar</div>;
  }

  return (
    <div className="p-4 bg-gray-50">
      <h4 className="font-medium mb-3 text-sm">Verkäufe nach Standort (letzte {analysisWeeks} Wochen)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {locationSales.map((location: LocationSalesData, index: number) => (
          <div key={`location-${index}`} className="bg-white p-3 rounded border">
            <div className="font-medium text-sm">{location.locationName}</div>
            <div className="text-xs text-muted-foreground">{location.machineName}</div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Verkäufe:</span>
                <span className="font-medium">{location.sales}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Umsatz:</span>
                <span className="font-medium">€{location.revenue?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Ø pro Woche:</span>
                <span className="font-medium">{location.avgWeeklySales?.toFixed(1) || '0.0'}</span>
              </div>
              {location.hasStockouts && (
                <div className="text-xs text-amber-600">
                  Ausverkauft: {location.soldoutDays} Tage
                </div>
              )}
            </div>
          </div>
        ))}
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

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: [`/api/bulk-orders/inventory/bulk/${selectedSupplierId}`],
    enabled: !!selectedSupplierId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: salesAnalysis, isLoading: salesLoading } = useQuery({
    queryKey: [`/api/bulk-orders/sales-analysis/${selectedSupplierId}`, analysisWeeks],
    enabled: !!selectedSupplierId && step === 'analysis',
    staleTime: 1000 * 60 * 5,
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: [`/api/bulk-orders/forecast/${selectedSupplierId}`, forecastWeeks, analysisWeeks],
    enabled: !!selectedSupplierId && step === 'forecast',
    staleTime: 1000 * 60 * 5,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => apiRequest('/api/bulk-orders', 'POST', orderData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: "Großbestellung erfolgreich erstellt",
        description: `Bestellnummer: ${data.orderNumber}`,
      });
      onOrderCreated(data.id);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen der Bestellung",
        description: error.message || "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive",
      });
    },
  });

  const handleCreateOrder = () => {
    if (!selectedSupplierId) return;

    const orderItems = Object.entries(orderQuantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([productId, quantity]) => {
        const product = (inventoryData as any[])?.find((inv: any) => inv.productId === parseInt(productId));
        return {
          productId: parseInt(productId),
          quantity,
          unitPrice: product?.price || 0,
        };
      });

    if (orderItems.length === 0) {
      toast({
        title: "Keine Produkte ausgewählt",
        description: "Bitte wählen Sie mindestens ein Produkt mit Menge > 0 aus.",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      supplierId: selectedSupplierId,
      items: orderItems,
      notes: `Großbestellung basierend auf ${forecastWeeks}-Wochen-Prognose (Analyse: ${analysisWeeks} Wochen)`,
      type: 'bulk',
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
      </CardHeader>
      <CardContent>
        {suppliersLoading ? (
          <div className="text-center py-8">Lade Lieferanten...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers?.map((supplier: any) => (
              <Card 
                key={supplier.id} 
                className={`cursor-pointer transition-colors ${
                  selectedSupplierId === supplier.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  setSelectedSupplierId(supplier.id);
                  setSelectedSupplierName(supplier.name);
                }}
              >
                <CardContent className="p-4">
                  <h3 className="font-medium">{supplier.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {supplier.city && `${supplier.city}, `}{supplier.country}
                  </p>
                  {supplier.email && (
                    <p className="text-xs text-muted-foreground mt-1">{supplier.email}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {selectedSupplierId && (
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setStep('inventory')}>
              Weiter zu Bestandsübersicht
            </Button>
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
          Bestandsübersicht - {selectedSupplierName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {inventoryLoading ? (
          <div className="text-center py-8">Lade Bestandsdaten...</div>
        ) : inventoryData && Array.isArray(inventoryData) && inventoryData.length > 0 ? (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Aktueller Bestand</TableHead>
                  <TableHead>Verfügbar</TableHead>
                  <TableHead>Min/Max</TableHead>
                  <TableHead>Preis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryData.map((item: any) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.currentStock}</TableCell>
                    <TableCell>
                      <Badge variant={item.availableStock < item.minStock ? "destructive" : "secondary"}>
                        {item.availableStock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.minStock} / {item.maxStock}
                    </TableCell>
                    <TableCell>€{item.price?.toFixed(2) || '0.00'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('supplier')}>
                Zurück
              </Button>
              <Button onClick={() => setStep('analysis')}>
                Weiter zur Verkaufsanalyse
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Keine Bestandsdaten für diesen Lieferanten verfügbar
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
          <BarChart3 className="h-5 w-5" />
          Verkaufsanalyse - {selectedSupplierName}
        </CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Analyse-Zeitraum:</label>
            <Input
              type="number"
              min="1"
              max="12"
              value={analysisWeeks}
              onChange={(e) => setAnalysisWeeks(parseInt(e.target.value) || 4)}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">Wochen</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {salesLoading ? (
          <div className="text-center py-8">Lade Verkaufsdaten...</div>
        ) : salesAnalysis && Array.isArray(salesAnalysis) && salesAnalysis.length > 0 ? (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Verkäufe</TableHead>
                  <TableHead>Umsatz</TableHead>
                  <TableHead>Ø pro Woche</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesAnalysis.map((item: SalesAnalysis) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.totalSales}</TableCell>
                    <TableCell>€{item.totalRevenue.toFixed(2)}</TableCell>
                    <TableCell>{item.avgWeeklySales.toFixed(1)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.trendDirection === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {item.trendDirection === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        {item.trendDirection === 'stable' && <Minus className="h-4 w-4 text-gray-500" />}
                        <span className="text-sm">{item.trendPercentage.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('inventory')}>
                Zurück
              </Button>
              <Button onClick={() => setStep('forecast')}>
                Weiter zur Prognose
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Keine Verkaufsdaten für diesen Lieferanten verfügbar
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render forecast step with order creation
  const renderForecastAndOrder = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Bestellprognose - {selectedSupplierName}
        </CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Prognose-Zeitraum:</label>
            <Input
              type="number"
              min="1"
              max="8"
              value={forecastWeeks}
              onChange={(e) => setForecastWeeks(parseInt(e.target.value) || 2)}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">Wochen</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {forecastLoading ? (
          <div className="text-center py-8">Berechne Prognose...</div>
        ) : forecastData && Array.isArray(forecastData) && forecastData.length > 0 ? (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Prognose</TableHead>
                  <TableHead>Empfehlung</TableHead>
                  <TableHead>Konfidenz</TableHead>
                  <TableHead>Bestellmenge</TableHead>
                  <TableHead>Kosten</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(forecastData as ForecastData[]).map((item: ForecastData) => {
                  const quantity = orderQuantities[item.productId] || item.forecastedDemand;
                  const product = (inventoryData as any[])?.find((inv: any) => inv.productId === item.productId);
                  const totalCost = quantity * (product?.price || 0);
                  const isExpanded = expandedRows[item.productId];
                  
                  const rows = [
                    <TableRow key={`row-${item.productId}`}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {item.forecastedDemand} erwartet
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          Empfohlen: {item.forecastedDemand}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.confidenceLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={quantity}
                          onChange={(e) => setOrderQuantities(prev => ({
                            ...prev,
                            [item.productId]: parseInt(e.target.value) || 0
                          }))}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{totalCost.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedRows(prev => ({
                            ...prev,
                            [item.productId]: !prev[item.productId]
                          }))}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ];
                  
                  if (isExpanded) {
                    rows.push(
                      <TableRow key={`expanded-${item.productId}`} className="bg-gray-50">
                        <TableCell colSpan={7} className="p-0">
                          <SalesLocationBreakdown productId={item.productId} analysisWeeks={analysisWeeks} />
                        </TableCell>
                      </TableRow>
                    );
                  }
                  
                  return rows;
                }).flat()}
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => setStep('analysis')}>
                Zurück
              </Button>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Gesamtkosten:</div>
                  <div className="text-lg font-semibold">
                    €{Object.entries(orderQuantities)
                      .reduce((total, [productId, quantity]) => {
                        const product = (inventoryData as any[])?.find((inv: any) => inv.productId === parseInt(productId));
                        return total + (quantity * (product?.price || 0));
                      }, 0)
                      .toFixed(2)}
                  </div>
                </div>
                <Button 
                  onClick={handleCreateOrder}
                  disabled={createOrderMutation.isPending}
                  className="min-w-[120px]"
                >
                  {createOrderMutation.isPending ? "Erstelle..." : "Bestellung erstellen"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Keine Prognosedaten verfügbar
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
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
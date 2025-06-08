import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Icons
import { 
  BarChart4, 
  ArrowLeft, 
  Loader2, 
  TrendingUp, 
  Package,
  Calendar,
  Euro,
  AlertTriangle,
  CheckCircle,
  ShoppingCart
} from "lucide-react";

interface ForecastOrderFormProps {
  warehouseId: number;
  onBack: () => void;
}

export function ForecastOrderForm({ warehouseId, onBack }: ForecastOrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [weeksAhead, setWeeksAhead] = useState(2);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [includeHolidays, setIncludeHolidays] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [notes, setNotes] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  
  // Queries
  const { data: warehouse } = useQuery({
    queryKey: [`/api/warehouses/${warehouseId}`],
  });
  
  const { data: suppliers } = useQuery({
    queryKey: ['/api/suppliers'],
  });
  
  const { data: orderSuggestions, isLoading: isLoadingSuggestions, refetch: refetchSuggestions } = useQuery({
    queryKey: [`/api/forecast/enhanced-order-suggestions?warehouseId=${warehouseId}&weeksAhead=${weeksAhead}&includeWeather=${includeWeather}&includeHolidays=${includeHolidays}`],
    enabled: false, // Only fetch when explicitly triggered
  });
  
  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Bestellung erfolgreich erstellt",
        description: `Bestellung #${data.orderNumber} wurde erfolgreich angelegt.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      // Navigate to order details or back to overview
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen der Bestellung",
        description: error.message || "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });
  
  // Generate forecast-based suggestions
  const handleGenerateSuggestions = async () => {
    try {
      await refetchSuggestions();
    } catch (error) {
      toast({
        title: "Fehler beim Laden der Prognose",
        description: "Die Prognosen konnten nicht geladen werden.",
        variant: "destructive",
      });
    }
  };
  
  // Update product selection from suggestions
  useEffect(() => {
    if (orderSuggestions?.suggestions) {
      const filteredSuggestions = selectedSupplierId 
        ? orderSuggestions.suggestions.filter((item: any) => item.supplier_id === selectedSupplierId)
        : orderSuggestions.suggestions;
      
      setSelectedProducts(filteredSuggestions.map((item: any) => ({
        productId: parseInt(item.product_id),
        productName: item.product_name,
        currentStock: item.current_stock,
        predictedSales: item.total_predicted_sales,
        recommendedQuantity: item.recommended_order_quantity,
        price: item.price,
        confidence: item.avg_confidence,
        expectedRevenue: item.expected_revenue,
        orderQuantity: item.recommended_order_quantity
      })));
    }
  }, [orderSuggestions, selectedSupplierId]);
  
  // Create order
  const handleCreateOrder = () => {
    if (!selectedSupplierId || selectedProducts.length === 0) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte wählen Sie einen Lieferanten aus und stellen Sie sicher, dass Produkte ausgewählt sind.",
        variant: "destructive",
      });
      return;
    }
    
    const orderData = {
      supplierId: selectedSupplierId,
      warehouseId,
      expectedDeliveryDate: deliveryDate.toISOString(),
      notes: notes,
      priority: "normal",
      items: selectedProducts
        .filter(p => p.orderQuantity > 0)
        .map(item => ({
          productId: item.productId,
          quantity: item.orderQuantity,
          notes: `Prognose: ${item.predictedSales} Verkäufe für ${weeksAhead} Wochen`,
        })),
      orderMode: "forecast",
      forecastWeeks: weeksAhead
    };
    
    createOrderMutation.mutate(orderData);
  };
  
  // Update quantity for a product
  const updateQuantity = (productId: number, quantity: number) => {
    setSelectedProducts(prev => 
      prev.map(p => p.productId === productId ? { ...p, orderQuantity: quantity } : p)
    );
  };
  
  const totalAmount = selectedProducts.reduce((sum, p) => sum + (p.orderQuantity * p.price), 0);
  const selectedProductsCount = selectedProducts.filter(p => p.orderQuantity > 0).length;
  
  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart4 className="h-5 w-5" />
          Prognosebasierte Bestellung
        </CardTitle>
        <CardDescription>
          Erstellen Sie eine Bestellung basierend auf Verkaufsprognosen für {warehouse?.name}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Configuration Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="weeksAhead">Vorrat für Wochen</Label>
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
            <Label htmlFor="supplier">Lieferant</Label>
            <Select value={selectedSupplierId?.toString() || ""} onValueChange={(value) => setSelectedSupplierId(parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Lieferant wählen" />
              </SelectTrigger>
              <SelectContent>
                {suppliers?.data?.map((supplier: any) => (
                  <SelectItem key={supplier.id} value={supplier.id.toString()}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="deliveryDate">Liefertermin</Label>
            <Input
              type="date"
              value={format(deliveryDate, 'yyyy-MM-dd')}
              onChange={(e) => setDeliveryDate(new Date(e.target.value))}
            />
          </div>
        </div>

        {/* Weather and Holiday Integration Options */}
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
          <p className="text-xs text-gray-600 mt-2">
            Diese Faktoren beeinflussen die Prognose für höhere Genauigkeit bei besonderen Wetterbedingungen und Feiertagen.
          </p>
        </div>
        
        {/* Generate Suggestions Button */}
        <div className="flex justify-center">
          <Button 
            onClick={handleGenerateSuggestions}
            disabled={isLoadingSuggestions}
            size="lg"
            className="min-w-[300px]"
          >
            {isLoadingSuggestions ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Prognose wird erstellt...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 h-4 w-4" />
                Bestellvorschläge generieren ({weeksAhead} Wochen)
              </>
            )}
          </Button>
        </div>
        
        {/* Forecast Results */}
        {orderSuggestions && (
          <>
            <Separator />
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Produkte</span>
                  </div>
                  <div className="text-2xl font-bold">{selectedProductsCount}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Zeitraum</span>
                  </div>
                  <div className="text-2xl font-bold">{weeksAhead}W</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(orderSuggestions.periodStart), 'dd.MM.', { locale: de })} - {format(new Date(orderSuggestions.periodEnd), 'dd.MM.yy', { locale: de })}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Erw. Verkäufe</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {selectedProducts.reduce((sum, p) => sum + p.predictedSales, 0)}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Bestellwert</span>
                  </div>
                  <div className="text-2xl font-bold">
                    €{totalAmount.toFixed(0)}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Products Table */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Bestellvorschläge</h3>
              
              {selectedProducts.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="text-center">Aktueller Bestand</TableHead>
                        <TableHead className="text-center">Prognostizierte Verkäufe</TableHead>
                        <TableHead className="text-center">Empfohlene Menge</TableHead>
                        <TableHead className="text-center">Bestellmenge</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((product) => (
                        <TableRow key={product.productId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{product.productName}</div>
                              <div className="text-sm text-muted-foreground">
                                Vertrauen: {(product.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={product.currentStock < product.predictedSales ? "destructive" : "secondary"}>
                              {product.currentStock}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {product.predictedSales}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={product.recommendedQuantity > 0 ? "default" : "secondary"}>
                              {product.recommendedQuantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                              value={product.orderQuantity}
                              onChange={(e) => updateQuantity(product.productId, parseInt(e.target.value) || 0)}
                              className="w-20 text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            €{(product.orderQuantity * product.price).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={5} className="text-right font-medium">
                          Gesamtsumme:
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          €{totalAmount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>Keine Bestellvorschläge verfügbar</p>
                  <p className="text-sm">Versuchen Sie andere Einstellungen oder prüfen Sie die Prognosedaten.</p>
                </div>
              )}
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notizen zur Bestellung</Label>
              <Textarea
                id="notes"
                placeholder="Zusätzliche Notizen zur Bestellung..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
              
              <Button 
                onClick={handleCreateOrder}
                disabled={selectedProductsCount === 0 || !selectedSupplierId || createOrderMutation.isPending}
              >
                {createOrderMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bestellung wird erstellt...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Bestellung erstellen ({selectedProductsCount} Produkte)
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  Calendar, 
  MapPin, 
  Mail, 
  Plus, 
  Minus, 
  Trash2,
  Eye,
  Send,
  Archive,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Types for enhanced ordering
interface CartItem {
  productId: number;
  productName: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit: string;
  currentStock?: number;
  forecastQuantity?: number;
  comment?: string;
  expectedMHD?: string;
}

interface OrderingState {
  selectedWarehouse: number | null;
  selectedSupplier: number | null;
  orderMode: 'standard' | 'forecast' | 'copy';
  cart: CartItem[];
  deliveryLocation: string;
  notes: string;
  expectedDeliveryDate: string;
  showPricesInEmail: boolean;
  forecastPeriodDays: number;
}

interface Warehouse {
  id: number;
  name: string;
  location: string;
  currentStock: number;
}

interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  deliveryTerms: string;
  paymentTerms: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  supplierSku: string;
  unit: string;
  unitPrice: number;
  currentStock: number;
  forecastQuantity: number;
  reorderPoint: number;
  category: string;
}

export default function EnhancedOrderingProcess() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [orderingState, setOrderingState] = useState<OrderingState>({
    selectedWarehouse: null,
    selectedSupplier: null,
    orderMode: 'standard',
    cart: [],
    deliveryLocation: '',
    notes: '',
    expectedDeliveryDate: '',
    showPricesInEmail: true,
    forecastPeriodDays: 7
  });

  const [currentStep, setCurrentStep] = useState<'warehouse' | 'supplier' | 'products' | 'cart' | 'review' | 'send'>('warehouse');

  // Fetch warehouses
  const { data: warehouses, isLoading: warehousesLoading } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    enabled: true
  });

  // Fetch suppliers
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers'],
    enabled: orderingState.selectedWarehouse !== null
  });

  // Fetch products for selected supplier
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/suppliers', orderingState.selectedSupplier, 'products'],
    enabled: orderingState.selectedSupplier !== null
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return apiRequest('/api/orders/enhanced', {
        method: 'POST',
        body: JSON.stringify(orderData)
      });
    },
    onSuccess: () => {
      toast({
        title: "Bestellung erfolgreich erstellt",
        description: "Die Bestellung wurde erfolgreich angelegt und kann jetzt versendet werden."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      // Reset state
      setOrderingState({
        selectedWarehouse: null,
        selectedSupplier: null,
        orderMode: 'standard',
        cart: [],
        deliveryLocation: '',
        notes: '',
        expectedDeliveryDate: '',
        showPricesInEmail: true,
        forecastPeriodDays: 7
      });
      setCurrentStep('warehouse');
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen der Bestellung",
        description: error.message || "Ein unbekannter Fehler ist aufgetreten",
        variant: "destructive"
      });
    }
  });

  // Add item to cart
  const addToCart = (product: Product, quantity: number, comment?: string) => {
    const existingItem = orderingState.cart.find(item => item.productId === product.id);
    
    if (existingItem) {
      setOrderingState(prev => ({
        ...prev,
        cart: prev.cart.map(item =>
          item.productId === product.id
            ? { 
                ...item, 
                quantity: item.quantity + quantity,
                totalPrice: (item.quantity + quantity) * item.unitPrice,
                comment: comment || item.comment
              }
            : item
        )
      }));
    } else {
      const cartItem: CartItem = {
        productId: product.id,
        productName: product.name,
        supplierName: suppliers?.find(s => s.id === orderingState.selectedSupplier)?.name || '',
        quantity,
        unitPrice: product.unitPrice,
        totalPrice: quantity * product.unitPrice,
        unit: product.unit,
        currentStock: product.currentStock,
        forecastQuantity: product.forecastQuantity,
        comment
      };
      
      setOrderingState(prev => ({
        ...prev,
        cart: [...prev.cart, cartItem]
      }));
    }
    
    toast({
      title: "Produkt hinzugefügt",
      description: `${quantity} ${product.unit} ${product.name} zum Warenkorb hinzugefügt`
    });
  };

  // Remove item from cart
  const removeFromCart = (productId: number) => {
    setOrderingState(prev => ({
      ...prev,
      cart: prev.cart.filter(item => item.productId !== productId)
    }));
  };

  // Update cart item quantity
  const updateCartQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    setOrderingState(prev => ({
      ...prev,
      cart: prev.cart.map(item =>
        item.productId === productId
          ? { 
              ...item, 
              quantity: newQuantity,
              totalPrice: newQuantity * item.unitPrice
            }
          : item
      )
    }));
  };

  // Calculate total order value
  const orderTotal = orderingState.cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // Get step progress
  const getStepProgress = () => {
    const steps = ['warehouse', 'supplier', 'products', 'cart', 'review', 'send'];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  };

  // Handle order submission
  const handleSubmitOrder = () => {
    const orderData = {
      warehouseId: orderingState.selectedWarehouse,
      supplierId: orderingState.selectedSupplier,
      orderMode: orderingState.orderMode,
      deliveryLocation: orderingState.deliveryLocation,
      notes: orderingState.notes,
      expectedDeliveryDate: orderingState.expectedDeliveryDate,
      showPricesInEmail: orderingState.showPricesInEmail,
      forecastPeriodDays: orderingState.forecastPeriodDays,
      cartData: JSON.stringify(orderingState.cart),
      items: orderingState.cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        unit: item.unit,
        itemComment: item.comment,
        expectedMHD: item.expectedMHD
      })),
      totalAmount: orderTotal
    };
    
    createOrderMutation.mutate(orderData);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Erweiterte Bestellabwicklung</h1>
          <p className="text-muted-foreground">
            Intelligenter Warenkorb mit Prognose-Integration und MHD-Tracking
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            {orderingState.cart.length} Artikel
          </Badge>
          <Badge variant="outline">
            €{orderTotal.toFixed(2)}
          </Badge>
        </div>
      </div>

      {/* Progress indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Bestellfortschritt</span>
              <span>{Math.round(getStepProgress())}%</span>
            </div>
            <Progress value={getStepProgress()} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Lager wählen</span>
              <span>Lieferant wählen</span>
              <span>Produkte</span>
              <span>Warenkorb</span>
              <span>Prüfung</span>
              <span>Versenden</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <Tabs value={currentStep} onValueChange={(value) => setCurrentStep(value as any)}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="warehouse" className="text-xs">Lager</TabsTrigger>
              <TabsTrigger value="supplier" disabled={!orderingState.selectedWarehouse} className="text-xs">Lieferant</TabsTrigger>
              <TabsTrigger value="products" disabled={!orderingState.selectedSupplier} className="text-xs">Produkte</TabsTrigger>
              <TabsTrigger value="cart" disabled={orderingState.cart.length === 0} className="text-xs">Warenkorb</TabsTrigger>
              <TabsTrigger value="review" disabled={orderingState.cart.length === 0} className="text-xs">Prüfung</TabsTrigger>
              <TabsTrigger value="send" disabled={orderingState.cart.length === 0} className="text-xs">Versenden</TabsTrigger>
            </TabsList>

            {/* Warehouse Selection */}
            <TabsContent value="warehouse" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Lager auswählen
                  </CardTitle>
                  <CardDescription>
                    Wählen Sie das Ziellager für diese Bestellung aus
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {warehousesLoading ? (
                    <div className="text-center py-8">Lade Lager...</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {warehouses?.map((warehouse) => (
                        <Card 
                          key={warehouse.id}
                          className={`cursor-pointer transition-all ${
                            orderingState.selectedWarehouse === warehouse.id 
                              ? 'ring-2 ring-primary' 
                              : 'hover:shadow-md'
                          }`}
                          onClick={() => {
                            setOrderingState(prev => ({ ...prev, selectedWarehouse: warehouse.id }));
                            setCurrentStep('supplier');
                          }}
                        >
                          <CardContent className="p-4">
                            <h3 className="font-semibold">{warehouse.name}</h3>
                            <p className="text-sm text-muted-foreground">{warehouse.location}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <Badge variant="outline">
                                {warehouse.currentStock} Artikel
                              </Badge>
                              {orderingState.selectedWarehouse === warehouse.id && (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Supplier Selection */}
            <TabsContent value="supplier" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lieferant auswählen</CardTitle>
                  <CardDescription>
                    Wählen Sie den Lieferanten für diese Bestellung aus
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Order Mode Selection */}
                  <div className="space-y-2">
                    <Label>Bestellmodus</Label>
                    <Select 
                      value={orderingState.orderMode} 
                      onValueChange={(value) => 
                        setOrderingState(prev => ({ ...prev, orderMode: value as any }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard-Bestellung</SelectItem>
                        <SelectItem value="forecast">Prognose-basierte Bestellung</SelectItem>
                        <SelectItem value="copy">Bestellung kopieren</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Forecast Period for forecast mode */}
                  {orderingState.orderMode === 'forecast' && (
                    <div className="space-y-2">
                      <Label>Prognosezeitraum (Tage)</Label>
                      <Input
                        type="number"
                        value={orderingState.forecastPeriodDays}
                        onChange={(e) => 
                          setOrderingState(prev => ({ 
                            ...prev, 
                            forecastPeriodDays: parseInt(e.target.value) || 7 
                          }))
                        }
                        min="1"
                        max="30"
                      />
                    </div>
                  )}

                  {suppliersLoading ? (
                    <div className="text-center py-8">Lade Lieferanten...</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {suppliers?.map((supplier) => (
                        <Card 
                          key={supplier.id}
                          className={`cursor-pointer transition-all ${
                            orderingState.selectedSupplier === supplier.id 
                              ? 'ring-2 ring-primary' 
                              : 'hover:shadow-md'
                          }`}
                          onClick={() => {
                            setOrderingState(prev => ({ ...prev, selectedSupplier: supplier.id }));
                            setCurrentStep('products');
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold">{supplier.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {supplier.contactPerson}
                                </p>
                                <div className="mt-2 space-y-1">
                                  <Badge variant="outline" className="text-xs">
                                    {supplier.deliveryTerms}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {supplier.paymentTerms}
                                  </Badge>
                                </div>
                              </div>
                              {orderingState.selectedSupplier === supplier.id && (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Products Selection */}
            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Produktauswahl
                    {orderingState.orderMode === 'forecast' && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Prognose-Modus
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Wählen Sie die Produkte für Ihre Bestellung aus
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {productsLoading ? (
                    <div className="text-center py-8">Lade Produkte...</div>
                  ) : (
                    <div className="space-y-4">
                      {products?.map((product) => (
                        <ProductItem
                          key={product.id}
                          product={product}
                          orderMode={orderingState.orderMode}
                          onAddToCart={addToCart}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Cart Review */}
            <TabsContent value="cart" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Warenkorb
                  </CardTitle>
                  <CardDescription>
                    Überprüfen und bearbeiten Sie Ihre Bestellung
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {orderingState.cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Ihr Warenkorb ist leer
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orderingState.cart.map((item) => (
                        <CartItemComponent
                          key={item.productId}
                          item={item}
                          onUpdateQuantity={updateCartQuantity}
                          onRemove={removeFromCart}
                        />
                      ))}
                      <Separator />
                      <div className="flex justify-between items-center text-lg font-semibold">
                        <span>Gesamtsumme:</span>
                        <span>€{orderTotal.toFixed(2)}</span>
                      </div>
                      <Button 
                        onClick={() => setCurrentStep('review')}
                        className="w-full"
                      >
                        Zur Bestellprüfung
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Order Review */}
            <TabsContent value="review" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Bestellprüfung
                  </CardTitle>
                  <CardDescription>
                    Überprüfen Sie alle Details vor dem Versenden
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Delivery details */}
                  <div className="space-y-2">
                    <Label>Lieferadresse</Label>
                    <Textarea
                      value={orderingState.deliveryLocation}
                      onChange={(e) => 
                        setOrderingState(prev => ({ ...prev, deliveryLocation: e.target.value }))
                      }
                      placeholder="Lieferadresse eingeben..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Gewünschter Liefertermin</Label>
                    <Input
                      type="date"
                      value={orderingState.expectedDeliveryDate}
                      onChange={(e) => 
                        setOrderingState(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Bemerkungen zur Bestellung</Label>
                    <Textarea
                      value={orderingState.notes}
                      onChange={(e) => 
                        setOrderingState(prev => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Zusätzliche Bemerkungen..."
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="showPrices"
                      checked={orderingState.showPricesInEmail}
                      onChange={(e) => 
                        setOrderingState(prev => ({ ...prev, showPricesInEmail: e.target.checked }))
                      }
                    />
                    <Label htmlFor="showPrices">
                      Preise in E-Mail anzeigen
                    </Label>
                  </div>

                  <Button 
                    onClick={() => setCurrentStep('send')}
                    className="w-full"
                  >
                    Zur E-Mail-Vorschau
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Send Order */}
            <TabsContent value="send" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="w-5 h-5" />
                    Bestellung versenden
                  </CardTitle>
                  <CardDescription>
                    E-Mail-Vorschau und finaler Versand
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">E-Mail-Vorschau</h4>
                    <div className="text-sm space-y-2">
                      <p><strong>An:</strong> {suppliers?.find(s => s.id === orderingState.selectedSupplier)?.name}</p>
                      <p><strong>Betreff:</strong> Neue Bestellung - {new Date().toLocaleDateString()}</p>
                      <p><strong>Artikel:</strong> {orderingState.cart.length}</p>
                      <p><strong>Gesamtwert:</strong> €{orderTotal.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={handleSubmitOrder}
                      disabled={createOrderMutation.isPending}
                      className="flex-1"
                    >
                      {createOrderMutation.isPending ? 'Wird erstellt...' : 'Bestellung erstellen'}
                    </Button>
                    <Button variant="outline">
                      Als Entwurf speichern
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar with cart summary */}
        <div className="space-y-6">
          <CartSummary 
            cart={orderingState.cart}
            warehouse={warehouses?.find(w => w.id === orderingState.selectedWarehouse)}
            supplier={suppliers?.find(s => s.id === orderingState.selectedSupplier)}
            orderMode={orderingState.orderMode}
          />
        </div>
      </div>
    </div>
  );
}

// Product Item Component
interface ProductItemProps {
  product: Product;
  orderMode: 'standard' | 'forecast' | 'copy';
  onAddToCart: (product: Product, quantity: number, comment?: string) => void;
}

function ProductItem({ product, orderMode, onAddToCart }: ProductItemProps) {
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState('');

  const needsReorder = product.currentStock <= product.reorderPoint;
  const suggestedQuantity = orderMode === 'forecast' ? product.forecastQuantity : 
                           needsReorder ? Math.max(1, product.reorderPoint - product.currentStock) : 1;

  return (
    <Card className={`${needsReorder ? 'border-orange-200 bg-orange-50' : ''}`}>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h4 className="font-semibold">{product.name}</h4>
            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
            <div className="flex gap-2">
              <Badge variant={needsReorder ? "destructive" : "outline"}>
                Lagerbestand: {product.currentStock} {product.unit}
              </Badge>
              {orderMode === 'forecast' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Prognose: {product.forecastQuantity}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Menge:</Label>
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center"
                  min="1"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <span className="text-sm text-muted-foreground">{product.unit}</span>
            </div>
            {suggestedQuantity !== quantity && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setQuantity(suggestedQuantity)}
                className="text-xs"
              >
                Vorgeschlagen: {suggestedQuantity} {product.unit}
              </Button>
            )}
            <Input
              placeholder="Kommentar (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="text-right">
              <p className="text-lg font-semibold">€{product.unitPrice.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">pro {product.unit}</p>
              <p className="text-sm font-medium">
                Gesamt: €{(quantity * product.unitPrice).toFixed(2)}
              </p>
            </div>
            <Button 
              onClick={() => onAddToCart(product, quantity, comment)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Hinzufügen
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Cart Item Component
interface CartItemComponentProps {
  item: CartItem;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
}

function CartItemComponent({ item, onUpdateQuantity, onRemove }: CartItemComponentProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-medium">{item.productName}</h4>
            <p className="text-sm text-muted-foreground">{item.supplierName}</p>
            {item.comment && (
              <p className="text-xs text-blue-600 mt-1">Kommentar: {item.comment}</p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="w-12 text-center">{item.quantity}</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
              >
                <Plus className="w-3 h-3" />
              </Button>
              <span className="text-sm text-muted-foreground ml-2">{item.unit}</span>
            </div>
            
            <div className="text-right">
              <p className="font-medium">€{item.totalPrice.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">
                €{item.unitPrice.toFixed(2)} / {item.unit}
              </p>
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onRemove(item.productId)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Cart Summary Component
interface CartSummaryProps {
  cart: CartItem[];
  warehouse?: Warehouse;
  supplier?: Supplier;
  orderMode: string;
}

function CartSummary({ cart, warehouse, supplier, orderMode }: CartSummaryProps) {
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = subtotal * 0.19; // 19% MwSt
  const total = subtotal + tax;

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="text-lg">Bestellübersicht</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {warehouse && (
          <div>
            <h4 className="font-medium text-sm">Ziellager</h4>
            <p className="text-sm text-muted-foreground">{warehouse.name}</p>
          </div>
        )}
        
        {supplier && (
          <div>
            <h4 className="font-medium text-sm">Lieferant</h4>
            <p className="text-sm text-muted-foreground">{supplier.name}</p>
          </div>
        )}

        <div>
          <h4 className="font-medium text-sm">Bestellmodus</h4>
          <Badge variant="outline">
            {orderMode === 'standard' && 'Standard'}
            {orderMode === 'forecast' && 'Prognose-basiert'}
            {orderMode === 'copy' && 'Kopiert'}
          </Badge>
        </div>

        <Separator />
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Zwischensumme:</span>
            <span>€{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>MwSt (19%):</span>
            <span>€{tax.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Gesamtsumme:</span>
            <span>€{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{cart.length} Artikel im Warenkorb</p>
          {orderMode === 'forecast' && (
            <p className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Prognose-basierte Mengen
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
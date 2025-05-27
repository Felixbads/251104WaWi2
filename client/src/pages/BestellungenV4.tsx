import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Plus, Package, Send, CheckCircle, AlertCircle, ShoppingCart, Eye } from 'lucide-react';

// Interfaces
interface Warehouse {
  id: number;
  name: string;
  address?: string;
}

interface Supplier {
  id: number;
  name: string;
  email?: string;
}

interface Product {
  id: number;
  product_name: string;
  price?: number;
}

interface InventoryItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  minQuantity: number;
}

interface OrderItem {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  unit: string;
}

interface Order {
  id: number;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string;
  total_amount: number;
  warehouse_name: string;
  supplier_name: string;
  item_count: number;
}

// API Funktionen
const api = {
  async fetchWarehouses(): Promise<Warehouse[]> {
    const response = await fetch('/api/warehouses');
    if (!response.ok) throw new Error('Fehler beim Laden der Lager');
    return response.json();
  },

  async fetchSuppliers(): Promise<Supplier[]> {
    const response = await fetch('/api/suppliers');
    if (!response.ok) throw new Error('Fehler beim Laden der Lieferanten');
    return response.json();
  },

  async fetchInventory(warehouseId: number): Promise<InventoryItem[]> {
    const response = await fetch(`/api/inventory?warehouseId=${warehouseId}`);
    if (!response.ok) throw new Error('Fehler beim Laden des Inventars');
    return response.json();
  },

  async fetchPurchaseConditions(supplierId: number): Promise<any[]> {
    const response = await fetch(`/api/suppliers/${supplierId}/purchase-conditions`);
    if (!response.ok) throw new Error('Fehler beim Laden der Einkaufsbedingungen');
    return response.json();
  },

  async createOrder(orderData: any) {
    const response = await fetch('/api/orders-v4/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler bei der Bestellerstellung');
    }
    return response.json();
  },

  async sendOrderEmail(orderId: number, recipientEmail: string) {
    const response = await fetch(`/api/orders-v4/${orderId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim E-Mail-Versand');
    }
    return response.json();
  },

  async fetchOrders(): Promise<Order[]> {
    const response = await fetch('/api/orders-v4');
    if (!response.ok) throw new Error('Fehler beim Laden der Bestellungen');
    const data = await response.json();
    return data.orders || [];
  },

  async fetchOrderDetails(orderId: number) {
    const response = await fetch(`/api/orders-v4/${orderId}`);
    if (!response.ok) throw new Error('Fehler beim Laden der Bestelldetails');
    return response.json();
  },

  async recordGoodsReceipt(orderId: number, receivedItems: any[]) {
    const response = await fetch(`/api/orders-v4/${orderId}/goods-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedItems })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim Wareneingang');
    }
    return response.json();
  }
};

// Hauptkomponente
export default function BestellungenV4() {
  const [currentStep, setCurrentStep] = useState<'list' | 'create' | 'details' | 'receipt'>('list');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Status-Badge-Komponente
  const StatusBadge = ({ status }: { status: string }) => {
    const statusConfig = {
      draft: { label: 'Entwurf', variant: 'secondary' as const, icon: AlertCircle },
      sent: { label: 'Gesendet', variant: 'default' as const, icon: Send },
      confirmed: { label: 'Bestätigt', variant: 'default' as const, icon: CheckCircle },
      received: { label: 'Erhalten', variant: 'default' as const, icon: Package }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon size={12} />
        {config.label}
      </Badge>
    );
  };

  // Bestellliste
  const OrdersList = () => {
    const { data: orders = [], isLoading, error } = useQuery({
      queryKey: ['orders-v4'],
      queryFn: api.fetchOrders
    });

    if (isLoading) return <div>Bestellungen werden geladen...</div>;
    if (error) return <div>Fehler beim Laden der Bestellungen</div>;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Bestellungen V4</h2>
          <Button onClick={() => setCurrentStep('create')} className="flex items-center gap-2">
            <Plus size={16} />
            Neue Bestellung
          </Button>
        </div>

        <div className="grid gap-4">
          {orders.map((order) => (
            <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{order.order_number}</CardTitle>
                    <CardDescription>
                      {new Date(order.order_date).toLocaleDateString('de-DE')} • {order.warehouse_name} • {order.supplier_name}
                    </CardDescription>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    {order.item_count} Artikel • {order.total_amount.toFixed(2)} €
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setCurrentStep('details');
                      }}
                    >
                      <Eye size={14} className="mr-1" />
                      Details
                    </Button>
                    {order.status === 'sent' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setCurrentStep('receipt');
                        }}
                      >
                        <Package size={14} className="mr-1" />
                        Wareneingang
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // Neue Bestellung erstellen
  const CreateOrder = () => {
    const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Daten laden
    const { data: warehouses = [] } = useQuery({
      queryKey: ['warehouses'],
      queryFn: api.fetchWarehouses
    });

    const { data: suppliers = [] } = useQuery({
      queryKey: ['suppliers'],
      queryFn: api.fetchSuppliers
    });

    const { data: inventory = [] } = useQuery({
      queryKey: ['inventory', selectedWarehouse],
      queryFn: () => api.fetchInventory(selectedWarehouse!),
      enabled: !!selectedWarehouse
    });

    const { data: purchaseConditions = [] } = useQuery({
      queryKey: ['purchase-conditions', selectedSupplier],
      queryFn: () => api.fetchPurchaseConditions(selectedSupplier!),
      enabled: !!selectedSupplier
    });

    // Bestellung erstellen
    const createOrderMutation = useMutation({
      mutationFn: api.createOrder,
      onSuccess: (data) => {
        toast({
          title: "Bestellung erstellt",
          description: `Bestellung ${data.order.orderNumber} wurde erfolgreich erstellt.`
        });
        queryClient.invalidateQueries({ queryKey: ['orders-v4'] });
        setCurrentStep('list');
      },
      onError: (error: Error) => {
        toast({
          title: "Fehler",
          description: error.message,
          variant: "destructive"
        });
      }
    });

    const handleSubmit = () => {
      if (!selectedWarehouse || !selectedSupplier || orderItems.length === 0) {
        toast({
          title: "Fehler",
          description: "Bitte füllen Sie alle Pflichtfelder aus.",
          variant: "destructive"
        });
        return;
      }

      setIsSubmitting(true);

      const orderData = {
        warehouseId: selectedWarehouse,
        supplierId: selectedSupplier,
        orderItems,
        expectedDeliveryDate,
        notes
      };

      console.log('[ORDER-V4-FRONTEND] Sending order data:', orderData);
      createOrderMutation.mutate(orderData);
      setIsSubmitting(false);
    };

    const addProduct = (product: InventoryItem) => {
      // Preis aus Einkaufsbedingungen suchen
      const condition = purchaseConditions.find(pc => pc.productId === product.productId);
      const price = condition?.price || 0;

      const newItem: OrderItem = {
        productId: product.productId,
        productName: product.productName,
        quantity: Math.max(1, product.minQuantity - product.quantity),
        price,
        unit: 'stk'
      };

      setOrderItems([...orderItems, newItem]);
    };

    const updateQuantity = (index: number, quantity: number) => {
      const updated = [...orderItems];
      updated[index].quantity = Math.max(1, quantity);
      setOrderItems(updated);
    };

    const removeItem = (index: number) => {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    };

    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Neue Bestellung erstellen</h2>
          <Button variant="outline" onClick={() => setCurrentStep('list')}>
            Zurück zur Liste
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lager auswählen */}
          <Card>
            <CardHeader>
              <CardTitle>Lager auswählen</CardTitle>
            </CardHeader>
            <CardContent>
              <Select onValueChange={(value) => setSelectedWarehouse(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Lager auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Lieferant auswählen */}
          <Card>
            <CardHeader>
              <CardTitle>Lieferant auswählen</CardTitle>
            </CardHeader>
            <CardContent>
              <Select onValueChange={(value) => setSelectedSupplier(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Lieferant auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Lieferdatum und Notizen */}
        <Card>
          <CardHeader>
            <CardTitle>Bestelldetails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="deliveryDate">Gewünschtes Lieferdatum</Label>
              <Input
                id="deliveryDate"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="notes">Anmerkungen</Label>
              <Textarea
                id="notes"
                placeholder="Besondere Hinweise zur Bestellung..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Produktauswahl */}
        {selectedWarehouse && (
          <Card>
            <CardHeader>
              <CardTitle>Verfügbare Produkte</CardTitle>
              <CardDescription>
                Wählen Sie Produkte aus dem Lagerbestand aus
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {inventory.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-2 border rounded">
                    <div>
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-sm text-gray-600">
                        Bestand: {item.quantity} | Min: {item.minQuantity}
                        {item.quantity < item.minQuantity && (
                          <Badge variant="destructive" className="ml-2">Nachbestellen</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addProduct(item)}
                      disabled={orderItems.some(oi => oi.productId === item.productId)}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bestellpositionen */}
        {orderItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bestellpositionen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 p-2 border rounded">
                    <div className="flex-1">
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-sm text-gray-600">{item.price.toFixed(2)} € pro {item.unit}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                        className="w-20"
                      />
                      <span className="text-sm">{item.unit}</span>
                    </div>
                    <div className="text-right min-w-[80px]">
                      {(item.price * item.quantity).toFixed(2)} €
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeItem(index)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="flex justify-between items-center font-bold">
                <span>Gesamtsumme:</span>
                <span>{totalAmount.toFixed(2)} €</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bestellung abschicken */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedWarehouse || !selectedSupplier || orderItems.length === 0}
            className="flex items-center gap-2"
          >
            <ShoppingCart size={16} />
            {isSubmitting ? 'Wird erstellt...' : 'Bestellung erstellen'}
          </Button>
        </div>
      </div>
    );
  };

  // Hauptrendering
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {currentStep === 'list' && <OrdersList />}
      {currentStep === 'create' && <CreateOrder />}
      {/* Details und Wareneingang werden später implementiert */}
      {currentStep === 'details' && (
        <div>
          <Button onClick={() => setCurrentStep('list')}>Zurück</Button>
          <div>Bestelldetails für Order #{selectedOrderId} (wird implementiert)</div>
        </div>
      )}
      {currentStep === 'receipt' && (
        <div>
          <Button onClick={() => setCurrentStep('list')}>Zurück</Button>
          <div>Wareneingang für Order #{selectedOrderId} (wird implementiert)</div>
        </div>
      )}
    </div>
  );
}
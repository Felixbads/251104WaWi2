import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Mail, FileText, AlertCircle, ArrowLeft, Edit3, Plus, Trash2, Save, X, CalendarDays, MapPin, MessageCircle, Truck, Home } from "lucide-react";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import EmailDialog from './EmailDialog';

interface OrderItem {
  id: number | null;
  tempId?: number;
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  packageSize?: number;
  packageQuantity?: number;
  packageInfo?: string;
  vatRate?: number;
  vatAmount?: number;
  netAmount?: number;
  grossAmount?: number;
}

interface VatGroup {
  vatRate: number;
  items: OrderItem[];
  netTotal: number;
  vatTotal: number;
}

interface OrderTotals {
  net: number;
  vat: number;
  gross: number;
}

interface Order {
  id: number;
  order_number: string;
  status: string;
  created_at: string;
  supplier_name: string;
  supplier_email: string;
  supplier_id?: number;
  warehouse_name: string;
  warehouse_id?: number;
  warehouseId?: number;
  warehouseName?: string;
  total_amount: number;
  expected_delivery_date?: string;
  delivery_location?: string;
  delivery_type?: 'pickup' | 'delivery';
  supplier_show_prices?: boolean;
  show_prices_in_email?: boolean;
  notes?: string;
  items: OrderItem[];
  itemsByVat?: VatGroup[];
  totals?: OrderTotals;
}

interface EmailTemplate {
  subject: string;
  content: string;
  supplierEmail: string;
  orderDetails: {
    orderNumber: string;
    orderDate: string;
    deliveryDate: string;
    totalAmount: string;
    itemsCount: number;
    supplierName: string;
  };
}

interface OrderDetailProps {
  orderId: number;
  onBack: () => void;
  onEmailPrepare?: () => void;
}

// Separate ProductRow component to avoid conditional hooks
function ProductRow({ product, onAdd }: { 
  product: any; 
  onAdd: (product: any, quantity: number) => void 
}) {
  const [selectedQuantity, setSelectedQuantity] = React.useState(1);
  
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
      <div className="flex-1">
        <h4 className="font-medium">{product.productName || product.name}</h4>
        <p className="text-sm text-gray-600">
          {product.price?.toFixed(2)} € / {product.units || 'Stk'}
        </p>
        {product.description && (
          <p className="text-xs text-gray-500 mt-1">{product.description}</p>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <Input
          type="number"
          min="1"
          defaultValue={1}
          className="w-20"
          onChange={(e) => setSelectedQuantity(parseInt(e.target.value) || 1)}
        />
        <Button
          onClick={() => onAdd(product, selectedQuantity)}
          size="sm"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-1" />
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}

const OrderDetail: React.FC<OrderDetailProps> = ({ orderId, onBack, onEmailPrepare }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  
  // Bearbeitungszustände
  const [isEditing, setIsEditing] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editingItems, setEditingItems] = useState<OrderItem[]>([]);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [showPricesInEmail, setShowPricesInEmail] = useState(true);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // API-Integration für Produkthinzufügung
  const addProductToOrder = async (product: any, quantity: number) => {
    try {
      setIsSaving(true);
      
      const response = await fetch(`/api/orders/${orderId}/add-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.id,
          quantity: quantity
        })
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Hinzufügen des Produkts');
      }
      
      const result = await response.json();
      
      // Bestellpositionen neu laden
      await loadOrderItems();
      
      // Dialog schließen
      setShowAddItemDialog(false);
      
      console.log('Produkt erfolgreich hinzugefügt:', result);
      
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Produkts:', error);
      setError('Produkt konnte nicht hinzugefügt werden');
    } finally {
      setIsSaving(false);
    }
  };

  // Produkte für Hinzufügung laden
  const loadAvailableProducts = async () => {
    if (!order?.supplier_id) {
      try {
        const response = await fetch(`/api/products`);
        if (response.ok) {
          const products = await response.json();
          setAvailableProducts(products?.data || products || []);
        }
      } catch (error) {
        console.error('Fehler beim Laden der verfügbaren Produkte:', error);
      }
      return;
    }
    
    try {
      const response = await fetch(`/api/suppliers/${order.supplier_id}/products`);
      if (response.ok) {
        const products = await response.json();
        setAvailableProducts(products.data || products || []);
      }
    } catch (error) {
      console.error('Error loading available products:', error);
    }
  };

  const loadOrderData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load enhanced order details with packaging and VAT data
      console.log(`Making API call to: /api/orders-direct/${orderId}`);
      const orderResponse = await fetch(`/api/orders-direct/${orderId}`);
      console.log('Order API response status:', orderResponse.status, orderResponse.statusText);
      
      if (!orderResponse.ok) {
        throw new Error(`Failed to load order: ${orderResponse.statusText}`);
      }

      console.log('About to parse JSON from order response...');
      const responseText = await orderResponse.text();
      console.log('Raw response text length:', responseText.length);
      console.log('Response starts with:', responseText.substring(0, 200));
      
      let orderData;
      try {
        orderData = JSON.parse(responseText);
        console.log('Successfully parsed order JSON');
      } catch (parseError) {
        console.error('JSON Parse Error in loadOrderData:', parseError);
        console.error('Failed to parse response:', responseText);
        throw new Error(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      console.log('Loaded enhanced order data:', orderData);
      
      setOrder({
        ...orderData,
        items: orderData.items || [],
        warehouse_name: orderData.warehouseName || orderData.warehouse_name || 'Unbekanntes Lager',
        supplier_name: orderData.supplierName || orderData.supplier_name || 'Unbekannter Lieferant'
      });

      // Supplier-Preisanzeige-Einstellung laden
      if (orderData.supplier_id) {
        try {
          const supplierResponse = await fetch(`/api/suppliers/${orderData.supplier_id}`);
          if (supplierResponse.ok) {
            const supplierData = await supplierResponse.json();
            setShowPricesInEmail(supplierData.showPricesInOrders !== false); // Default true
          }
        } catch (error) {
          console.error('Error loading supplier settings:', error);
          setShowPricesInEmail(true); // Default fallback
        }
      }

    } catch (error) {
      console.error('Error loading order:', error);
      setError(error instanceof Error ? error.message : 'Fehler beim Laden der Bestellung');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrderItems = async () => {
    try {
      setIsLoadingItems(true);
      
      console.log(`Making API call to: /api/order-items-direct/${orderId}`);
      const response = await fetch(`${window.location.origin}/api/order-items-direct/${orderId}`);
      console.log('Order Items API response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`Failed to load order items: ${response.statusText}`);
      }

      console.log('About to parse JSON from order items response...');
      const responseText = await response.text();
      console.log('Raw items response text length:', responseText.length);
      console.log('Items response starts with:', responseText.substring(0, 200));
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('Successfully parsed order items JSON');
      } catch (parseError) {
        console.error('JSON Parse Error in loadOrderItems:', parseError);
        console.error('Failed to parse items response:', responseText);
        throw new Error(`JSON parsing failed in loadOrderItems: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      const items = result.data || result;
      console.log('Loading order items from API:', items);
      
      setOrderItems(items.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name || `Produkt-ID ${item.product_id || 'undefined'}`,
        quantity: parseInt(item.quantity || 1),
        unit: item.unit || 'Stk',
        unitPrice: parseFloat(item.unit_price || 0),
        totalPrice: parseFloat(item.total_price || 0)
      })));

    } catch (error) {
      console.error('Error loading order items:', error);
      setError(error instanceof Error ? error.message : 'Fehler beim Laden der Bestellpositionen');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const loadEmailTemplate = async (templateType: string = 'standard') => {
    try {
      setIsLoadingEmail(true);
      
      // Use the enhanced email endpoint with price visibility and delivery type settings
      const currentOrder = editingOrder || order;
      const finalShowPrices = currentOrder?.show_prices_in_email !== false;
      const deliveryType = currentOrder?.delivery_type || 'delivery';
      const response = await fetch(`${window.location.origin}/api/enhanced-email-templates/order/${orderId}?template=${templateType}&showPrices=${finalShowPrices}&deliveryType=${deliveryType}`);
      if (!response.ok) {
        throw new Error(`Failed to load email template: ${response.statusText}`);
      }

      const template = await response.json();
      setEmailTemplate(template);

    } catch (error) {
      console.error('Error loading email template:', error);
      // Fallback to basic email dialog
      setIsEmailDialogOpen(true);
    } finally {
      setIsLoadingEmail(false);
    }
  };

  useEffect(() => {
    loadOrderData();
    loadOrderItems();
    loadAvailableProducts();
  }, [orderId]);

  // Bearbeitungsfunktionen
  const startEditing = () => {
    if (!order) return;
    setEditingOrder({
      ...order,
      warehouseId: order.warehouseId || order.warehouse_id || null,
      expected_delivery_date: order.expected_delivery_date || '',
      delivery_type: order.delivery_type || 'delivery',
      show_prices_in_email: order.show_prices_in_email !== false,
      notes: order.notes || ''
    });
    setEditingItems([...orderItems]);
    setShowPricesInEmail(order.supplier_show_prices !== false);
    setIsEditing(true);
    
    // Lade verfügbare Produkte für den Lieferanten und Lager
    loadAvailableProducts();
    loadAvailableWarehouses();
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingOrder(null);
    setEditingItems([]);
    setShowAddItemDialog(false);
  };



  const loadAvailableWarehouses = async () => {
    try {
      const response = await fetch('/api/warehouses');
      if (response.ok) {
        const warehouses = await response.json();
        setAvailableWarehouses(warehouses.data || warehouses || []);
      }
    } catch (error) {
      console.error('Error loading available warehouses:', error);
    }
  };

  const updateItemQuantity = (itemId: number | null, newQuantity: number) => {
    setEditingItems(prev => prev.map(item => 
      (item.id === itemId || item.tempId === itemId)
        ? { ...item, quantity: newQuantity, totalPrice: newQuantity * item.unitPrice }
        : item
    ));
  };

  const removeItem = (itemId: number | null) => {
    setEditingItems(prev => prev.filter(item => item.id !== itemId && item.tempId !== itemId));
  };

  const addNewItem = (product: any, quantity: number) => {
    const newItem: OrderItem = {
      id: null, // New items have no ID until saved
      tempId: -Math.random(), // Temporary ID for React rendering
      productId: product.id,
      productName: product.productName || product.name,
      quantity: quantity,
      unit: product.units || 'Stk',
      unitPrice: product.price || 0,
      totalPrice: quantity * (product.price || 0)
    };
    setEditingItems(prev => [...prev, newItem]);
    setShowAddItemDialog(false);
  };

  const saveChanges = async () => {
    if (!editingOrder || !order) return;
    
    setIsSaving(true);
    try {
      const requestBody = {
        warehouseId: editingOrder.warehouseId,
        warehouse_name: editingOrder.warehouse_name,
        expected_delivery_date: editingOrder.expected_delivery_date,
        delivery_type: editingOrder.delivery_type,
        show_prices_in_email: editingOrder.show_prices_in_email,
        notes: editingOrder.notes
      };
      
      console.log('FRONTEND: Saving order changes:', {
        delivery_type: editingOrder.delivery_type,
        show_prices_in_email: editingOrder.show_prices_in_email,
        warehouseId: editingOrder.warehouseId,
        notes: editingOrder.notes
      });
      console.log('FRONTEND: Full request body:', JSON.stringify(requestBody, null, 2));

      // Update order details including warehouse information
      console.log('About to make backend API call for order update...');
      const orderUpdateResponse = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('Backend API call completed, response status:', orderUpdateResponse.status);
      console.log('About to parse order update response JSON...');
      
      let orderUpdateResult;
      try {
        orderUpdateResult = await orderUpdateResponse.json();
        console.log('Successfully parsed order update response JSON');
      } catch (parseError) {
        console.error('Error parsing order update response JSON:', parseError);
        throw new Error(`Failed to parse order update response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      console.log('Order update response:', orderUpdateResult);

      if (!orderUpdateResponse.ok || orderUpdateResult.error) {
        throw new Error(`Failed to update order: ${orderUpdateResult.error || 'Unknown error'}`);
      }
      
      console.log('Order update validation passed, proceeding...');

      // Update order items (only if there are changes)
      console.log('Checking if order items need updating...');
      console.log('editingItems.length:', editingItems.length);
      console.log('editingItems content:', editingItems);
      
      if (editingItems.length > 0) {
        console.log('About to update order items...');
        
        let itemsUpdateResponse;
        try {
          console.log('About to serialize editingItems for API call...');
          const itemsPayload = { items: editingItems };
          console.log('Items payload structure:', Object.keys(itemsPayload));
          
          const serializedPayload = JSON.stringify(itemsPayload);
          console.log('Successfully serialized items payload, length:', serializedPayload.length);
          
          itemsUpdateResponse = await fetch(`/api/orders/${orderId}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: serializedPayload
          });
          
          console.log('Items API call completed');
        } catch (itemsError) {
          console.error('ERROR in order items update:', itemsError);
          console.error('Items error details:', {
            message: itemsError instanceof Error ? itemsError.message : 'Unknown',
            stack: itemsError instanceof Error ? itemsError.stack : 'No stack',
            toString: String(itemsError)
          });
          throw new Error(`Order items serialization failed: ${itemsError instanceof Error ? itemsError.message : String(itemsError)}`);
        }

        console.log('About to process items update response...');
        console.log('itemsUpdateResponse.ok:', itemsUpdateResponse.ok);
        console.log('itemsUpdateResponse.status:', itemsUpdateResponse.status);
        
        if (itemsUpdateResponse.ok) {
          console.log('About to parse items update response JSON...');
          try {
            const responseText = await itemsUpdateResponse.text();
            console.log('Items response text:', responseText.substring(0, 200), '...');
            console.log('Items response text length:', responseText.length);
            
            const itemsUpdateResult = JSON.parse(responseText);
            console.log('Successfully parsed items update JSON');
            console.log('Items update response:', itemsUpdateResult);
          } catch (parseError) {
            console.error('ERROR parsing items update response JSON:', parseError);
            console.error('Parse error details:', {
              message: parseError instanceof Error ? parseError.message : 'Unknown',
              stack: parseError instanceof Error ? parseError.stack : 'No stack',
              toString: String(parseError)
            });
            throw new Error(`Items response JSON parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }
        } else {
          const errorText = await itemsUpdateResponse.text();
          console.warn('Failed to update order items, but continuing:', errorText);
        }
      }

      // Reload data with detailed error tracking
      console.log('Starting data reload after successful order update...');
      
      try {
        await loadOrderData();
        console.log('Order data reloaded successfully');
      } catch (dataError) {
        console.error('ERROR in loadOrderData:', dataError);
        console.error('loadOrderData error details:', {
          message: dataError instanceof Error ? dataError.message : 'Unknown',
          stack: dataError instanceof Error ? dataError.stack : 'No stack',
          toString: String(dataError)
        });
        throw new Error(`Data reload failed in loadOrderData: ${dataError instanceof Error ? dataError.message : String(dataError)}`);
      }
      
      try {
        await loadOrderItems();
        console.log('Order items reloaded successfully');
      } catch (itemsError) {
        console.error('ERROR in loadOrderItems:', itemsError);
        console.error('loadOrderItems error details:', {
          message: itemsError instanceof Error ? itemsError.message : 'Unknown',
          stack: itemsError instanceof Error ? itemsError.stack : 'No stack',
          toString: String(itemsError)
        });
        throw new Error(`Data reload failed in loadOrderItems: ${itemsError instanceof Error ? itemsError.message : String(itemsError)}`);
      }

      // CRITICAL FIX: Reload email template with updated data
      try {
        console.log('Reloading email template with updated order data...');
        await loadEmailTemplate();
        console.log('Email template reloaded successfully');
      } catch (emailError) {
        console.error('ERROR reloading email template:', emailError);
        // Don't throw error for email template - it's not critical for saving
      }
      
      console.log('About to set editing states to false...');
      setIsEditing(false);
      console.log('setIsEditing(false) completed');
      
      setEditingOrder(null);
      console.log('setEditingOrder(null) completed');
      
      setEditingItems([]);
      console.log('setEditingItems([]) completed');
      
      console.log('Order saved successfully - all operations completed');
    } catch (error) {
      console.error('Error saving changes:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        toString: String(error)
      });
      
      // More specific error message
      const errorMessage = error instanceof Error ? error.message : 
                          (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
      
      alert(`Fehler beim Speichern der Änderungen: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'Ausstehend';
      case 'confirmed': return 'Bestätigt';
      case 'shipped': return 'Versendet';
      case 'delivered': return 'Geliefert';
      case 'cancelled': return 'Storniert';
      default: return status || 'Unbekannt';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Lade Bestelldetails...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => { loadOrderData(); loadOrderItems(); }} variant="outline">
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Package className="h-8 w-8 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Bestellung nicht gefunden</p>
          <Button onClick={onBack} variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück zur Übersicht
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button onClick={onBack} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <p className="text-gray-600">
              Erstellt am {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {!isEditing ? (
            <>
              <Button 
                onClick={startEditing}
                variant="outline"
                size="sm"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
              <Button 
                onClick={() => setIsEmailDialogOpen(true)}
                variant="outline"
                size="sm"
              >
                <Mail className="h-4 w-4 mr-2" />
                E-Mail senden
              </Button>
            </>
          ) : (
            <>
              <Button 
                onClick={saveChanges}
                variant="default"
                size="sm"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Speichern
              </Button>
              <Button 
                onClick={cancelEditing}
                variant="outline"
                size="sm"
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
            </>
          )}
          <Badge className={getStatusColor(order.status)}>
            {getStatusText(order.status)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Bestelldetails
                </div>
                {isEditing && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <CalendarDays className="h-4 w-4" />
                    <MapPin className="h-4 w-4" />
                    <MessageCircle className="h-4 w-4" />
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Lieferant</label>
                  <p className="text-sm">{order.supplier_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Lager</label>
                  {isEditing ? (
                    <Select
                      value={editingOrder?.warehouseId?.toString() || ''}
                      onValueChange={(value) => {
                        const selectedWarehouse = availableWarehouses.find(w => w.id.toString() === value);
                        setEditingOrder((prev: any) => prev ? {
                          ...prev, 
                          warehouseId: parseInt(value),
                          warehouse_name: selectedWarehouse?.name || 'Unbekanntes Lager'
                        } : null);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Lager auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWarehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{order.warehouse_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Bestelldatum</label>
                  <p className="text-sm">
                    {format(new Date(order.created_at), 'dd.MM.yyyy', { locale: de })}
                  </p>
                </div>
                
                {/* Liefertermin - bearbeitbar */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Gewünschter Liefertermin</label>
                  {isEditing ? (
                    <Input
                      type="date"
                      value={editingOrder?.expected_delivery_date || ''}
                      onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, expected_delivery_date: e.target.value} : null)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm">
                      {order.expected_delivery_date 
                        ? format(new Date(order.expected_delivery_date), 'dd.MM.yyyy', { locale: de })
                        : 'Nicht angegeben'
                      }
                    </p>
                  )}
                </div>
              </div>
              
              {/* Lieferort - bearbeitbar */}
              <div>
                <label className="text-sm font-medium text-gray-600">Lieferort</label>
                {isEditing ? (
                  <Input
                    value={editingOrder?.delivery_location || ''}
                    onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, delivery_location: e.target.value} : null)}
                    placeholder="Lieferadresse oder Lager"
                    className="mt-1"
                  />
                ) : (
                  <p className="text-sm">
                    {order.delivery_location || order.warehouse_name || 'Standard Lager'}
                  </p>
                )}
              </div>
              
              {/* Lieferart - bearbeitbar */}
              <div>
                <label className="text-sm font-medium text-gray-600">Lieferart</label>
                {isEditing ? (
                  <div className="flex gap-6 mt-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="delivery_type"
                        value="delivery"
                        checked={editingOrder?.delivery_type === 'delivery'}
                        onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, delivery_type: e.target.value} : null)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <Truck className="h-4 w-4" />
                      <span>Lieferung</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="delivery_type"
                        value="pickup"
                        checked={editingOrder?.delivery_type === 'pickup'}
                        onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, delivery_type: e.target.value} : null)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <Home className="h-4 w-4" />
                      <span>Abholung</span>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 mt-1">
                    {order.delivery_type === 'pickup' ? (
                      <>
                        <Home className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">Abholung</span>
                      </>
                    ) : (
                      <>
                        <Truck className="h-4 w-4 text-green-600" />
                        <span className="text-sm">Lieferung</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Preisanzeige in E-Mails - bearbeitbar */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${(isEditing ? editingOrder?.show_prices_in_email : order.show_prices_in_email) !== false ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-medium text-blue-800">
                      Preise in E-Mails
                    </span>
                  </div>
                  {isEditing ? (
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={editingOrder?.show_prices_in_email !== false}
                        onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, show_prices_in_email: e.target.checked} : null)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>
                  ) : (
                    <Badge variant={order.show_prices_in_email !== false ? "default" : "secondary"}>
                      {order.show_prices_in_email !== false ? 'Aktiviert' : 'Deaktiviert'}
                    </Badge>
                  )}
                </div>
                {!isEditing && (
                  <span className="text-xs text-blue-600 mt-1 block">
                    (kann in der Bearbeitung geändert werden)
                  </span>
                )}
              </div>
              
              {/* Notizen - bearbeitbar */}
              <Separator />
              <div>
                <label className="text-sm font-medium text-gray-600">Notizen</label>
                {isEditing ? (
                  <Textarea
                    value={editingOrder?.notes || ''}
                    onChange={(e) => setEditingOrder((prev: any) => prev ? {...prev, notes: e.target.value} : null)}
                    placeholder="Notizen zur Bestellung..."
                    className="mt-1"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm mt-1">{order.notes || 'Keine Notizen'}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Bestellpositionen
                {isEditing && (
                  <Button
                    onClick={() => setShowAddItemDialog(true)}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Produkt hinzufügen
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingItems ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Lade Bestellpositionen...</span>
                </div>
              ) : (isEditing ? editingItems : orderItems).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Keine Bestellpositionen gefunden
                </div>
              ) : (
                <div className="space-y-4">
                  {(isEditing ? editingItems : orderItems).map((item, index) => (
                    <div key={item.id || item.tempId || index} className="flex items-center justify-between py-3 border-b last:border-b-0">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.productName}</h4>
                        <div className="flex items-center space-x-4 mt-2">
                          {isEditing ? (
                            <>
                              <div className="flex items-center space-x-2">
                                <Label className="text-sm">Menge:</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(item.id || item.tempId || null, parseInt(e.target.value) || 1)}
                                  className="w-20"
                                />
                                <span className="text-sm text-gray-600">{item.unit}</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                × {item.unitPrice.toFixed(2)} €
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-gray-600">
                              {item.quantity} {item.unit} × {item.unitPrice.toFixed(2)} €
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <p className="font-medium">{item.totalPrice.toFixed(2)} €</p>
                        </div>
                        {isEditing && (
                          <Button
                            onClick={() => removeItem(item.id || item.tempId || null)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center pt-4">
                    <span className="text-lg font-semibold">Gesamtsumme:</span>
                    <span className="text-lg font-bold">
                      {isEditing 
                        ? editingItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)
                        : order.total_amount.toFixed(2)
                      } €
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={() => {
                  console.log('E-Mail generieren geklickt - öffne vollständigen E-Mail Dialog');
                  setIsEmailDialogOpen(true);
                }} 
                className="w-full" 
                variant="outline"
                disabled={isLoadingEmail}
              >
                <Mail className="h-4 w-4 mr-2" />
                E-Mail generieren
              </Button>
              
              <Button 
                onClick={() => {
                  console.log('Dringende E-Mail geklickt - öffne vollständigen E-Mail Dialog');
                  setIsEmailDialogOpen(true);
                }} 
                className="w-full" 
                variant="outline"
                disabled={isLoadingEmail}
              >
                <FileText className="h-4 w-4 mr-2" />
                Dringende E-Mail
              </Button>
            </CardContent>
          </Card>

          {/* Email Template Preview */}
          {emailTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>E-Mail-Vorlage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">An:</label>
                  <p className="text-sm">{emailTemplate.supplierEmail || 'Keine E-Mail verfügbar'}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Betreff:</label>
                  <p className="text-sm">{emailTemplate.subject}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Inhalt:</label>
                  <div className="text-sm bg-gray-50 p-3 rounded border max-h-64 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-xs">{emailTemplate.content}</pre>
                  </div>
                </div>
                
                <Button 
                  className="w-full" 
                  disabled={!emailTemplate.supplierEmail}
                  onClick={() => {
                    if (emailTemplate.supplierEmail) {
                      window.location.href = `mailto:${emailTemplate.supplierEmail}?subject=${encodeURIComponent(emailTemplate.subject)}&body=${encodeURIComponent(emailTemplate.content)}`;
                    }
                  }}
                >
                  E-Mail öffnen
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkt zur Bestellung hinzufügen</DialogTitle>
            <DialogDescription>
              Wählen Sie ein Produkt aus dem Sortiment des Lieferanten aus
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {availableProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Keine Produkte verfügbar
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableProducts.map((product) => (
                  <ProductRow 
                    key={product.id} 
                    product={product} 
                    onAdd={(product, quantity) => addProductToOrder(product, quantity)} 
                  />
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <EmailDialog
        open={isEmailDialogOpen}
        onOpenChange={setIsEmailDialogOpen}
        orderId={order.id}
        supplierEmail={order.supplier_email}
        orderNumber={order.order_number}
        supplierName={order.supplier_name}
        onSendEmail={(success) => {
          if (success) {
            console.log('Email sent successfully');
          }
        }}
      />
    </div>
  );
};

export default OrderDetail;
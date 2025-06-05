import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Package, Mail, FileText, AlertCircle, ArrowLeft } from "lucide-react";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  package_size?: number;
  package_quantity?: number;
  package_info?: string;
  vat_rate?: number;
  vat_amount?: number;
  net_amount?: number;
  gross_amount?: number;
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
  warehouse_name: string;
  warehouseName?: string;
  total_amount: number;
  expected_delivery_date?: string;
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

const OrderDetail: React.FC<OrderDetailProps> = ({ orderId, onBack, onEmailPrepare }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrderData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load enhanced order details with packaging and VAT data
      const orderResponse = await fetch(`/api/orders-direct/${orderId}`);
      if (!orderResponse.ok) {
        throw new Error(`Failed to load order: ${orderResponse.statusText}`);
      }

      const orderData = await orderResponse.json();
      console.log('Loaded enhanced order data:', orderData);
      
      setOrder({
        ...orderData,
        items: orderData.items || [],
        warehouse_name: orderData.warehouseName || orderData.warehouse_name || 'Unbekanntes Lager',
        supplier_name: orderData.supplierName || orderData.supplier_name || 'Unbekannter Lieferant'
      });

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
      
      const response = await fetch(`${window.location.origin}/api/orders/${orderId}/items`);
      if (!response.ok) {
        throw new Error(`Failed to load order items: ${response.statusText}`);
      }

      const items = await response.json();
      setOrderItems(items.map((item: any) => ({
        id: item.id,
        product_id: item.product_id || item.productId,
        product_name: item.product_name || item.productName || `Produkt-ID ${item.product_id || item.productId}`,
        quantity: parseInt(item.quantity || 1),
        unit: item.unit || 'Stk',
        unit_price: parseFloat(item.unit_price || item.unitPrice || 0),
        total_price: parseFloat(item.total_price || item.totalPrice || 0)
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
      
      const response = await fetch(`${window.location.origin}/api/orders/${orderId}/email-template?type=${templateType}`);
      if (!response.ok) {
        throw new Error(`Failed to load email template: ${response.statusText}`);
      }

      const template = await response.json();
      setEmailTemplate(template);

    } catch (error) {
      console.error('Error loading email template:', error);
      setError(error instanceof Error ? error.message : 'Fehler beim Laden der E-Mail-Vorlage');
    } finally {
      setIsLoadingEmail(false);
    }
  };

  useEffect(() => {
    loadOrderData();
    loadOrderItems();
  }, [orderId]);

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
        <Badge className={getStatusColor(order.status)}>
          {getStatusText(order.status)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Package className="h-5 w-5 mr-2" />
                Bestelldetails
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
                  <p className="text-sm">{order.warehouse_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Bestelldatum</label>
                  <p className="text-sm">
                    {format(new Date(order.created_at), 'dd.MM.yyyy', { locale: de })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Gewünschter Liefertermin</label>
                  <p className="text-sm">
                    {order.expected_delivery_date 
                      ? format(new Date(order.expected_delivery_date), 'dd.MM.yyyy', { locale: de })
                      : 'Nicht angegeben'
                    }
                  </p>
                </div>
              </div>
              
              {order.notes && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-gray-600">Notizen</label>
                    <p className="text-sm mt-1">{order.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Bestellpositionen</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingItems ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Lade Bestellpositionen...</span>
                </div>
              ) : orderItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Keine Bestellpositionen gefunden
                </div>
              ) : (
                <div className="space-y-4">
                  {orderItems.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.product_name}</h4>
                        <p className="text-sm text-gray-600">
                          {item.quantity} {item.unit} × {item.unit_price.toFixed(2)} €
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{item.total_price.toFixed(2)} €</p>
                      </div>
                    </div>
                  ))}
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center pt-4">
                    <span className="text-lg font-semibold">Gesamtsumme:</span>
                    <span className="text-lg font-bold">{order.total_amount.toFixed(2)} €</span>
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
                onClick={() => loadEmailTemplate('standard')} 
                className="w-full" 
                variant="outline"
                disabled={isLoadingEmail}
              >
                <Mail className="h-4 w-4 mr-2" />
                {isLoadingEmail ? 'Lädt...' : 'E-Mail generieren'}
              </Button>
              
              <Button 
                onClick={() => loadEmailTemplate('urgent')} 
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
    </div>
  );
};

export default OrderDetail;
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  Search, 
  Package, 
  Calendar, 
  Truck,
  Building2,
  Copy
} from 'lucide-react';

interface OrderCopySelectorProps {
  onSelectOrder: (orderId: number) => void;
  onBack: () => void;
}

interface Order {
  id: number;
  orderNumber: string;
  supplierName: string;
  warehouseName: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  totalAmount?: number;
  itemCount?: number;
}

const OrderCopySelector: React.FC<OrderCopySelectorProps> = ({ 
  onSelectOrder, 
  onBack 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch orders for copying
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['/api/orders-direct'],
    select: (data: any) => {
      if (!data || !Array.isArray(data)) return [];
      
      return data.map((order: any) => ({
        id: order.id,
        orderNumber: order.order_number || `ORD-${order.id}`,
        supplierName: order.supplier_name || 'Unbekannt',
        warehouseName: order.warehouse_name || 'Unbekannt',
        status: order.status || 'draft',
        orderDate: order.order_date || order.created_at,
        expectedDeliveryDate: order.expected_delivery_date,
        totalAmount: order.total_amount,
        itemCount: order.item_count
      }));
    }
  });

  // Filter orders based on search term
  const filteredOrders = orders.filter((order: Order) => 
    order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.warehouseName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Entwurf', variant: 'secondary' as const },
      sent: { label: 'Versendet', variant: 'default' as const },
      delivered: { label: 'Geliefert', variant: 'default' as const },
      cancelled: { label: 'Storniert', variant: 'destructive' as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || 
                  { label: status, variant: 'secondary' as const };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellung kopieren</CardTitle>
          <CardDescription>Wählen Sie eine Bestellung zum Kopieren aus</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-destructive mb-4">Fehler beim Laden der Bestellungen</p>
            <Button variant="outline" onClick={onBack}>
              <ArrowRight className="h-4 w-4 rotate-180 mr-2" />
              Zurück
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bestellung kopieren</CardTitle>
            <CardDescription>
              Wählen Sie eine Bestellung zum Kopieren aus. Der Liefertermin muss neu festgelegt werden.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onBack}>
            <ArrowRight className="h-4 w-4 rotate-180 mr-2" />
            Zurück
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Bestellung, Lieferant oder Lager suchen..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Orders List */}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="text-center py-8">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Bestellungen gefunden</h3>
            <p className="text-sm text-muted-foreground">
              {searchTerm 
                ? `Keine Bestellungen gefunden, die zu "${searchTerm}" passen.`
                : "Es sind noch keine Bestellungen vorhanden."
              }
            </p>
          </div>
        )}

        {!isLoading && filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <Card 
                key={order.id}
                className="cursor-pointer hover:shadow-md transition-all duration-200 border-2 hover:border-primary/50"
                onClick={() => onSelectOrder(order.id)}
              >
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-medium text-lg">{order.orderNumber}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Calendar className="h-4 w-4" />
                        Erstellt: {formatDate(order.orderDate)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Lieferant:</span>
                      <span>{order.supplierName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Lager:</span>
                      <span>{order.warehouseName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Positionen:</span>
                      <span>{order.itemCount || 0}</span>
                    </div>
                  </div>

                  {order.expectedDeliveryDate && (
                    <div className="mt-3 text-sm">
                      <span className="font-medium">Geplanter Liefertermin:</span>{' '}
                      <span className="text-muted-foreground">
                        {formatDate(order.expectedDeliveryDate)}
                      </span>
                    </div>
                  )}

                  {order.totalAmount && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Gesamtwert:</span>{' '}
                      <span className="font-medium text-green-600">
                        {order.totalAmount.toFixed(2)} €
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderCopySelector;
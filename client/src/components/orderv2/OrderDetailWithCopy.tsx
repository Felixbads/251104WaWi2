import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
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
import { Badge } from '@/components/ui/badge';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Copy, 
  Eye, 
  Package, 
  Truck, 
  Calendar, 
  User,
  MapPin,
  FileText,
  Euro
} from 'lucide-react';
import CopyOrderButton from './CopyOrderButton';

interface OrderDetailWithCopyProps {
  orderId: number;
  onClose?: () => void;
}

const OrderDetailWithCopy: React.FC<OrderDetailWithCopyProps> = ({ 
  orderId, 
  onClose 
}) => {
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['/api/orders', orderId],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }
      return response.json();
    },
    enabled: !!orderId,
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/orders', orderId, 'items'],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}/items`);
      if (!response.ok) {
        throw new Error('Failed to fetch order items');
      }
      return response.json();
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellung wird geladen...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !order) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fehler beim Laden der Bestellung</CardTitle>
          <CardDescription>
            Die Bestellung konnte nicht geladen werden.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'open': { label: 'Offen', variant: 'outline' as const },
      'ordered': { label: 'Bestellt', variant: 'secondary' as const },
      'delivered': { label: 'Geliefert', variant: 'default' as const },
      'completed': { label: 'Abgeschlossen', variant: 'default' as const },
      'canceled': { label: 'Storniert', variant: 'destructive' as const },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || 
                  { label: status, variant: 'outline' as const };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header with Copy Button */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Bestellung {order.orderNumber}
              </CardTitle>
              <CardDescription>
                Erstellt am {order.orderDate ? format(new Date(order.orderDate), 'dd.MM.yyyy HH:mm', { locale: de }) : 'Unbekannt'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <CopyOrderButton 
                orderId={order.id}
                orderNumber={order.orderNumber}
                size="default"
                variant="outline"
              />
              {onClose && (
                <Button variant="outline" onClick={onClose}>
                  <Eye className="h-4 w-4 mr-2" />
                  Schließen
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <div>{getStatusBadge(order.status)}</div>
            </div>
            
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Lieferant</div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>{order.supplierName}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Lager</div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{order.locationName}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Gesamtbetrag</div>
              <div className="flex items-center gap-2">
                <Euro className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bestelldetails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Bestelldatum:</span>
                <div>{order.orderDate ? format(new Date(order.orderDate), 'dd.MM.yyyy', { locale: de }) : '-'}</div>
              </div>
              
              <div>
                <span className="text-muted-foreground">Liefertermin:</span>
                <div>{order.expectedDeliveryDate ? format(new Date(order.expectedDeliveryDate), 'dd.MM.yyyy', { locale: de }) : '-'}</div>
              </div>
              
              <div>
                <span className="text-muted-foreground">Priorität:</span>
                <div>
                  <Badge variant={order.priority === 'high' ? 'destructive' : 'outline'}>
                    {order.priority === 'high' ? 'Hoch' : 
                     order.priority === 'urgent' ? 'Dringend' : 
                     order.priority === 'low' ? 'Niedrig' : 'Normal'}
                  </Badge>
                </div>
              </div>
              
              <div>
                <span className="text-muted-foreground">Erstellt von:</span>
                <div>{order.createdByName || 'Unbekannt'}</div>
              </div>
            </div>
            
            {order.notes && (
              <div>
                <span className="text-muted-foreground text-sm">Notizen:</span>
                <div className="mt-1 p-2 bg-muted rounded text-sm">{order.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Finanzielle Übersicht</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Zwischensumme:</span>
                <span>{formatCurrency((order.totalAmount || 0) - (order.vatAmount || 0))}</span>
              </div>
              
              <div className="flex justify-between">
                <span>MwSt:</span>
                <span>{formatCurrency(order.vatAmount || 0)}</span>
              </div>
              
              {order.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span>Rabatt:</span>
                  <span>-{formatCurrency(order.discountAmount)}</span>
                </div>
              )}
              
              {order.shippingCost > 0 && (
                <div className="flex justify-between">
                  <span>Versandkosten:</span>
                  <span>{formatCurrency(order.shippingCost)}</span>
                </div>
              )}
              
              <Separator />
              
              <div className="flex justify-between font-medium">
                <span>Gesamtbetrag:</span>
                <span>{formatCurrency(order.totalAmount || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bestellpositionen
          </CardTitle>
          <CardDescription>
            {orderItems?.length || 0} Position(en) in dieser Bestellung
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded"></div>
              ))}
            </div>
          ) : orderItems && orderItems.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                    <TableHead className="text-right">Gesamtpreis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.sku || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.unit || 'Stk'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unitPrice || 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.totalPrice || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Bestellpositionen gefunden.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Copy Action Call-to-Action */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Copy className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Diese Bestellung als Vorlage verwenden</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Erstellen Sie eine neue Bestellung basierend auf dieser Zusammenstellung.
              </p>
            </div>
            <CopyOrderButton 
              orderId={order.id}
              orderNumber={order.orderNumber}
              size="default"
              variant="default"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetailWithCopy;
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Package, Activity, Send, Clock, User, FileText, CheckCircle, AlertCircle, Package2 } from 'lucide-react';
import DocumentViewer from '@/components/documents/DocumentViewer';

interface Order {
  id: number;
  status: string;
  orderNumber: string;
  supplierName?: string;
  orderDate: string;
  totalAmount?: number;
  statusHistory?: string;
  // Weitere Bestelleigenschaften...
}

interface OrderDetailTabProps {
  order: Order;
  activeTab?: string;
  onChangeTab?: (tab: string) => void;
}

const OrderDetailTab: React.FC<OrderDetailTabProps> = ({ 
  order, 
  activeTab = 'overview', 
  onChangeTab 
}) => {
  
  const handleTabChange = (value: string) => {
    if (onChangeTab) {
      onChangeTab(value);
    }
  };
  
  return (
    <Tabs 
      value={activeTab} 
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className="grid grid-cols-4 mb-6">
        <TabsTrigger value="overview">
          <Mail className="mr-2 h-4 w-4" />
          Übersicht
        </TabsTrigger>
        <TabsTrigger value="positions">
          <Package className="mr-2 h-4 w-4" />
          Positionen
        </TabsTrigger>
        <TabsTrigger value="history">
          <Activity className="mr-2 h-4 w-4" />
          Verlauf
        </TabsTrigger>
        <TabsTrigger value="documents">
          <Mail className="mr-2 h-4 w-4" />
          Dokumente
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Bestellübersicht</CardTitle>
            <CardDescription>Allgemeine Informationen zu dieser Bestellung</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Hier werden allgemeine Informationen zur Bestellung angezeigt, wie z.B. Bestellnummer, 
              Lieferant, Bestelldatum, Lieferdatum, Status, etc.
            </p>
            <p className="mt-4">Die Übersichtsansicht wird bei Bedarf erweitert...</p>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="positions">
        <OrderPositions orderId={order.id} />
      </TabsContent>
      
      <TabsContent value="history">
        <OrderHistory order={order} />
      </TabsContent>
      
      <TabsContent value="documents">
        <DocumentViewer orderId={order.id} documentType="order" />
      </TabsContent>
    </Tabs>
  );
};

// Order Positions Component
const OrderPositions: React.FC<{ orderId: number }> = ({ orderId }) => {
  const { data: orderItems, isLoading, error } = useQuery({
    queryKey: ['/api/orders', orderId, 'items'],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}/items`);
      if (!response.ok) throw new Error('Failed to fetch order items');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>Einzelne Positionen dieser Bestellung</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4 p-3 border rounded-md">
                <Skeleton className="h-10 w-10" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>Einzelne Positionen dieser Bestellung</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-destructive/10 p-4 rounded-md flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-destructive font-medium">Fehler beim Laden der Positionen</p>
              <p className="text-sm text-muted-foreground">
                Die Bestellpositionen konnten nicht geladen werden.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!orderItems || orderItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>Einzelne Positionen dieser Bestellung</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-8 rounded-md text-center">
            <Package2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground font-medium">Keine Positionen gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Diese Bestellung enthält keine Positionen.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalAmount = orderItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellpositionen</CardTitle>
        <CardDescription>
          {orderItems.length} Position{orderItems.length !== 1 ? 'en' : ''} • 
          Gesamtwert: €{totalAmount.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pos.</TableHead>
                <TableHead>Produkt</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead className="text-right">Einzelpreis</TableHead>
                <TableHead className="text-right">Gesamtpreis</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.map((item: any, index: number) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.positionNumber || index + 1}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      {item.notes && (
                        <p className="text-sm text-muted-foreground">{item.notes}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.sku || item.supplierSku || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.quantity} {item.unit || 'Stk'}
                    {item.packageCount && item.packageCount > 1 && (
                      <div className="text-xs text-muted-foreground">
                        {item.packageCount} x {item.packageQuantity || 1}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    €{(item.unitPrice || 0).toFixed(2)}
                    {item.vatRate && (
                      <div className="text-xs text-muted-foreground">
                        +{item.vatRate}% MwSt
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    €{(item.totalPrice || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        item.status === 'delivered' ? 'default' :
                        item.status === 'partial' ? 'secondary' :
                        item.status === 'pending' ? 'outline' : 'destructive'
                      }
                    >
                      {item.status === 'delivered' ? 'Geliefert' :
                       item.status === 'partial' ? 'Teillieferung' :
                       item.status === 'pending' ? 'Ausstehend' :
                       item.status === 'backordered' ? 'Nachbestellt' : item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Zwischensumme:</span>
            <span>€{(totalAmount / 1.19).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">MwSt (19%):</span>
            <span>€{(totalAmount - totalAmount / 1.19).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center font-bold text-lg border-t pt-2 mt-2">
            <span>Gesamt:</span>
            <span>€{totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Order History Component
const OrderHistory: React.FC<{ order: Order }> = ({ order }) => {
  // Parse status history from JSON if available
  const statusHistory = React.useMemo(() => {
    try {
      return order.statusHistory ? JSON.parse(order.statusHistory) : [];
    } catch {
      return [];
    }
  }, [order.statusHistory]);

  // Generate default history entries if no history exists
  const historyEntries = React.useMemo(() => {
    if (statusHistory.length > 0) {
      return statusHistory;
    }

    // Create default entries based on order data
    const entries = [
      {
        timestamp: order.orderDate,
        action: 'created',
        status: 'open',
        user: 'System',
        description: 'Bestellung erstellt'
      }
    ];

    if (order.status !== 'open') {
      entries.push({
        timestamp: new Date().toISOString(),
        action: 'status_changed',
        status: order.status,
        user: 'System',
        description: `Status geändert zu: ${order.status}`
      });
    }

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [statusHistory, order]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created': return <FileText className="h-4 w-4" />;
      case 'status_changed': return <Activity className="h-4 w-4" />;
      case 'sent': return <Send className="h-4 w-4" />;
      case 'delivered': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <AlertCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'text-blue-600';
      case 'status_changed': return 'text-orange-600';
      case 'sent': return 'text-green-600';
      case 'delivered': return 'text-green-700';
      case 'cancelled': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellverlauf</CardTitle>
        <CardDescription>
          Verlauf aller Änderungen und Aktionen für Bestellung {order.orderNumber}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {historyEntries.length === 0 ? (
          <div className="bg-muted p-8 rounded-md text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground font-medium">Kein Verlauf verfügbar</p>
            <p className="text-sm text-muted-foreground mt-1">
              Für diese Bestellung sind noch keine Verlaufsdaten gespeichert.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {historyEntries.map((entry: any, index: number) => (
              <div key={index} className="flex items-start space-x-4 p-4 border rounded-lg">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 ${getActionColor(entry.action)}`}>
                  {getActionIcon(entry.action)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{entry.description}</h4>
                    <span className="text-sm text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 mt-1">
                    {entry.user && (
                      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{entry.user}</span>
                      </div>
                    )}
                    {entry.status && (
                      <Badge variant="outline" className="text-xs">
                        {entry.status}
                      </Badge>
                    )}
                  </div>
                  {entry.comment && (
                    <p className="text-sm text-muted-foreground mt-2">{entry.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderDetailTab;
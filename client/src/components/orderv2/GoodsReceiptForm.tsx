import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Truck,
  PackageCheck,
  FileText,
  Loader2,
  Search,
  Save,
  Plus,
  Minus,
  Clock,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type GoodsReceiptFormProps = {
  orderId: number;
  onReceiptComplete: () => void;
};

interface Order {
  id: number;
  orderNumber: string;
  warehouseId: number;
  warehouseName: string;
  supplierId: number;
  supplierName: string;
  status: string;
  createdAt: string;
  expectedDeliveryDate: string | null;
  items: OrderItem[];
}

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  receivedQuantity?: number;
  status?: string;
}

const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({
  orderId,
  onReceiptComplete,
}) => {
  const { toast } = useToast();
  const [receivedItems, setReceivedItems] = useState<Record<number, number>>({});
  const [receiptDate, setReceiptDate] = useState<Date>(new Date());
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [isReceiptComplete, setIsReceiptComplete] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch order details
  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId,
  });

  // Initialize receivedItems state when order data is loaded
  useEffect(() => {
    if (order?.items) {
      const initialReceivedItems = order.items.reduce((acc, item) => {
        acc[item.id] = item.receivedQuantity || 0;
        return acc;
      }, {} as Record<number, number>);
      setReceivedItems(initialReceivedItems);
    }
  }, [order]);

  // Filter items based on search query
  const filteredItems = order?.items.filter(item => 
    item.productName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Check if all items are received
  const allItemsReceived = order?.items.every(item => 
    receivedItems[item.id] > 0 && receivedItems[item.id] <= item.quantity
  ) || false;

  // Process goods receipt mutation
  const goodsReceiptMutation = useMutation({
    mutationFn: (receiptData: any) => {
      return apiRequest('post', `/api/orders/${orderId}/goods-receipt`, receiptData);
    },
    onSuccess: () => {
      toast({
        title: 'Wareneingang erfolgreich erfasst',
        description: 'Der Wareneingang wurde erfolgreich erfasst und die Lagerbestände wurden aktualisiert.',
      });
      setIsReceiptComplete(true);
      onReceiptComplete();
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Erfassen des Wareneingangs',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    },
  });

  // Handle quantity change for an item
  const handleQuantityChange = (itemId: number, value: number) => {
    const item = order?.items.find(i => i.id === itemId);
    if (item) {
      // Ensure the value is not negative and not more than the ordered quantity
      const newValue = Math.max(0, Math.min(value, item.quantity));
      setReceivedItems(prev => ({
        ...prev,
        [itemId]: newValue,
      }));
    }
  };

  // Handle increment/decrement of quantity
  const incrementQuantity = (itemId: number) => {
    const item = order?.items.find(i => i.id === itemId);
    if (item) {
      handleQuantityChange(itemId, (receivedItems[itemId] || 0) + 1);
    }
  };

  const decrementQuantity = (itemId: number) => {
    handleQuantityChange(itemId, (receivedItems[itemId] || 0) - 1);
  };

  // Submit goods receipt
  const submitGoodsReceipt = () => {
    if (!allItemsReceived) {
      toast({
        title: 'Unvollständiger Wareneingang',
        description: 'Bitte geben Sie für alle Artikel eine Eingangsmenge an.',
        variant: 'destructive',
      });
      return;
    }

    const receiptData = {
      orderId,
      receiptDate,
      items: Object.entries(receivedItems).map(([itemId, quantity]) => ({
        orderItemId: parseInt(itemId),
        receivedQuantity: quantity,
      })),
      notes: deliveryNotes,
    };

    goodsReceiptMutation.mutate(receiptData);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'received':
        return 'text-green-500';
      case 'partial':
        return 'text-orange-500';
      case 'pending':
        return 'text-blue-500';
      default:
        return '';
    }
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (status) {
      case 'received':
        return 'default';
      case 'partial':
        return 'secondary';
      case 'pending':
        return 'outline';
      default:
        return 'default';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <p>Bestelldaten werden geladen...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>
          Die Bestellung konnte nicht gefunden werden. Bitte versuchen Sie es später erneut.
        </AlertDescription>
      </Alert>
    );
  }

  if (isReceiptComplete) {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Wareneingang erfolgreich erfasst</AlertTitle>
        <AlertDescription>
          Der Wareneingang für die Bestellung {order.orderNumber} wurde erfolgreich erfasst und die Lagerbestände wurden aktualisiert.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bestellung #{order.orderNumber}</h2>
          <div className="flex items-center text-sm text-muted-foreground mt-1">
            <CalendarDays className="h-4 w-4 mr-1" />
            <span>Erstellt am {format(new Date(order.createdAt), 'PPP', { locale: de })}</span>
          </div>
        </div>
        
        <Badge 
          variant={getStatusBadgeVariant(order.status)}
          className="h-fit"
        >
          {order.status === 'draft' ? 'Entwurf' : 
           order.status === 'sent' ? 'Gesendet' :
           order.status === 'received' ? 'Eingegangen' :
           order.status === 'partial' ? 'Teilweise eingegangen' :
           order.status}
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Lieferant</h3>
          <div className="flex items-center">
            <Truck className="h-4 w-4 mr-2 text-primary" />
            <span className="font-medium">{order.supplierName}</span>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Ziellager</h3>
          <div className="flex items-center">
            <PackageCheck className="h-4 w-4 mr-2 text-primary" />
            <span className="font-medium">{order.warehouseName}</span>
          </div>
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h3 className="text-lg font-medium">Wareneingang erfassen</h3>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs">Vollständig</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-xs">Teilweise</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs">Ausstehend</span>
            </div>
          </div>
        </div>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Artikel suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="border rounded-md">
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[400px]">Produkt</TableHead>
                  <TableHead className="text-right">Bestellt</TableHead>
                  <TableHead className="text-right">Erhalten</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Keine Artikel gefunden.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const receivedQuantity = receivedItems[item.id] || 0;
                    let status = 'pending';
                    if (receivedQuantity > 0) {
                      status = receivedQuantity === item.quantity ? 'received' : 'partial';
                    }
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => decrementQuantity(item.id)}
                              disabled={receivedQuantity <= 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            
                            <Input
                              type="number"
                              value={receivedQuantity}
                              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                              className="w-16 text-center"
                              min="0"
                              max={item.quantity}
                            />
                            
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => incrementQuantity(item.id)}
                              disabled={receivedQuantity >= item.quantity}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`}></div>
                            <span className={getStatusColor(status)}>
                              {status === 'received' ? 'Vollständig' : 
                               status === 'partial' ? 'Teilweise' : 
                               'Ausstehend'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Label htmlFor="receipt-date">Eingangsdatum</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="receipt-date"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !receiptDate && "text-muted-foreground"
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {receiptDate ? (
                  format(receiptDate, "PPP", { locale: de })
                ) : (
                  <span>Wählen Sie ein Datum</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={receiptDate}
                onSelect={(date) => date && setReceiptDate(date)}
                initialFocus
                locale={de}
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-4">
          <Label htmlFor="delivery-notes">Lieferschein-Anmerkungen</Label>
          <Textarea
            id="delivery-notes"
            placeholder="Lieferschein-Nummer, Anmerkungen zur Lieferung, etc."
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            className="min-h-[120px] resize-y"
          />
        </div>
      </div>
      
      {!allItemsReceived && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unvollständiger Wareneingang</AlertTitle>
          <AlertDescription>
            Bitte geben Sie für alle Artikel eine Eingangsmenge an.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex justify-end">
        <Button 
          onClick={submitGoodsReceipt}
          disabled={!allItemsReceived || goodsReceiptMutation.isPending}
          className="w-full md:w-auto"
        >
          {goodsReceiptMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird verarbeitet...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Wareneingang speichern
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default GoodsReceiptForm;
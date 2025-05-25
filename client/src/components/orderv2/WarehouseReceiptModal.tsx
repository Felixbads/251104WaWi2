import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Package2, 
  Calendar, 
  Hash, 
  CheckCircle2, 
  AlertTriangle,
  Save,
  X,
  Plus,
  Minus,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface WarehouseReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  onReceiptConfirmed?: () => void;
}

interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit: string;
  received_quantity?: number;
  expiration_date?: string;
}

interface ReceiptItem {
  productId: number;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  expirationDate: string;
  unit: string;
}

const WarehouseReceiptModal: React.FC<WarehouseReceiptModalProps> = ({
  isOpen,
  onClose,
  orderId,
  onReceiptConfirmed
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  // Bestellpositionen laden
  const { data: orderItems, isLoading } = useQuery({
    queryKey: [`/api/order-items-direct/${orderId}`],
    queryFn: async () => {
      const response = await fetch(`/api/order-items-direct/${orderId}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Bestellpositionen');
      return response.json();
    },
    enabled: isOpen && !!orderId
  });

  // Wareneingang-Items initialisieren
  useEffect(() => {
    if (orderItems && Array.isArray(orderItems)) {
      const initialItems = orderItems.map((item: OrderItem) => ({
        productId: item.product_id,
        productName: item.product_name,
        orderedQuantity: item.quantity,
        receivedQuantity: item.received_quantity || item.quantity, // Standardmäßig vollständig erhalten
        expirationDate: item.expiration_date || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // 30 Tage Standard-MHD
        unit: item.unit || 'Stück'
      }));
      setReceiptItems(initialItems);
    }
  }, [orderItems]);

  // Wareneingang speichern
  const saveReceiptMutation = useMutation({
    mutationFn: async (receiptData: any) => {
      return apiRequest(`/api/orders/${orderId}/warehouse-receipt`, receiptData, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Wareneingang erfolgreich',
        description: 'Der Wareneingang wurde erfolgreich protokolliert und das Lager aktualisiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders-direct'] });
      queryClient.invalidateQueries({ queryKey: [`/api/order-items-direct/${orderId}`] });
      onReceiptConfirmed?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Wareneingang',
        description: `Fehler: ${error.message || 'Unbekannter Fehler'}`,
        variant: 'destructive',
      });
    }
  });

  const handleQuantityChange = (index: number, value: string) => {
    const quantity = parseFloat(value) || 0;
    setReceiptItems(prev => prev.map((item, i) => 
      i === index ? { ...item, receivedQuantity: quantity } : item
    ));
  };

  const handleExpirationDateChange = (index: number, value: string) => {
    setReceiptItems(prev => prev.map((item, i) => 
      i === index ? { ...item, expirationDate: value } : item
    ));
  };

  const handleSaveReceipt = () => {
    if (receiptItems.length === 0) {
      toast({
        title: 'Keine Positionen',
        description: 'Keine Positionen für den Wareneingang gefunden.',
        variant: 'destructive',
      });
      return;
    }

    const receiptData = {
      deliveryDate,
      notes,
      items: receiptItems.map(item => ({
        productId: item.productId,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: item.receivedQuantity,
        expirationDate: item.expirationDate,
        unit: item.unit
      }))
    };

    saveReceiptMutation.mutate(receiptData);
  };

  const totalOrderedQuantity = receiptItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const totalReceivedQuantity = receiptItems.reduce((sum, item) => sum + item.receivedQuantity, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Wareneingang protokollieren
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Lade Bestellpositionen...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Lieferdetails */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Lieferdetails
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="deliveryDate">Lieferdatum</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Bestellung #{orderId}</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {totalOrderedQuantity} Positionen bestellt
                      </Badge>
                      <Badge variant={totalReceivedQuantity === totalOrderedQuantity ? "default" : "secondary"}>
                        {totalReceivedQuantity} Positionen erhalten
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Anmerkungen</Label>
                  <Input
                    id="notes"
                    placeholder="Optionale Anmerkungen zum Wareneingang..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Wareneingang-Positionen */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Positionen ({receiptItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-center">Bestellt</TableHead>
                      <TableHead className="text-center">Erhalten</TableHead>
                      <TableHead className="text-center">Einheit</TableHead>
                      <TableHead>Ablaufdatum</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {item.productName}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {item.orderedQuantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={item.receivedQuantity}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            className="w-20 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {item.unit}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expirationDate}
                            onChange={(e) => handleExpirationDateChange(index, e.target.value)}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {item.receivedQuantity === item.orderedQuantity ? (
                            <Badge variant="default" className="flex items-center gap-1 w-fit">
                              <CheckCircle2 className="h-3 w-3" />
                              Vollständig
                            </Badge>
                          ) : item.receivedQuantity > 0 ? (
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <Clock className="h-3 w-3" />
                              Teilweise
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" />
                              Fehlend
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Abbrechen
          </Button>
          <Button 
            onClick={handleSaveReceipt}
            disabled={saveReceiptMutation.isPending || receiptItems.length === 0}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveReceiptMutation.isPending ? 'Speichert...' : 'Wareneingang bestätigen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WarehouseReceiptModal;
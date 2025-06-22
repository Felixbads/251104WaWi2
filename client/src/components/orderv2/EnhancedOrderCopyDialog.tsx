import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Copy, 
  Package, 
  Calendar, 
  Truck,
  Building2,
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EnhancedOrderCopyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceOrderId: number;
  onSuccess?: (newOrderId: number) => void;
}

interface OrderItem {
  productId: number;
  productName: string;
  sku: string;
  category: string;
  originalQuantity: number;
  quantity: number;
  unitPrice: number;
  unit: string;
  totalPrice: number;
  packageSize: number;
  vatRate: number;
  status: string;
}

interface CopyData {
  sourceOrder: any;
  editableFields: any;
  items: OrderItem[];
  availableWarehouses: any[];
  supplierDetails: any;
}

const EnhancedOrderCopyDialog: React.FC<EnhancedOrderCopyDialogProps> = ({
  isOpen,
  onClose,
  sourceOrderId,
  onSuccess
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('normal');
  const [editableItems, setEditableItems] = useState<OrderItem[]>([]);

  // Load copy data
  const { data: copyData, isLoading, error } = useQuery<{ success: boolean; data: CopyData }>({
    queryKey: ['/api/enhanced-order-copy/orders', sourceOrderId, 'copy-data'],
    enabled: isOpen && !!sourceOrderId,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/enhanced-order-copy/orders/${sourceOrderId}/copy-data`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bestelldaten');
      }
      return response.json();
    }
  });

  // Initialize form when data loads
  useEffect(() => {
    if (copyData?.data) {
      const data = copyData.data;
      setWarehouseId(data.editableFields.warehouseId);
      setNotes(data.editableFields.notes);
      setPriority(data.editableFields.priority);
      setEditableItems([...data.items]);
      
      // Set default delivery date (7 days from now)
      const defaultDate = addDays(new Date(), 7);
      setExpectedDeliveryDate(format(defaultDate, 'yyyy-MM-dd'));
    }
  }, [copyData]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await fetch('/api/enhanced-order-copy/orders/create-from-copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fehler beim Erstellen der Bestellung');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Bestellung erfolgreich kopiert',
        description: `Neue Bestellung ${data.order.order_number} wurde erstellt.`,
      });
      
      // Invalidate order queries
      queryClient.invalidateQueries({ queryKey: ['/api/orders-direct'] });
      
      // Call success callback
      if (onSuccess && data.order) {
        onSuccess(data.order.id);
      }
      
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler beim Kopieren',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Handle quantity change
  const updateItemQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 0) return;
    
    setEditableItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem = {
          ...item,
          quantity: newQuantity,
          totalPrice: newQuantity * item.unitPrice
        };
        return updatedItem;
      }
      return item;
    }));
  };

  // Handle price change
  const updateItemPrice = (index: number, newPrice: number) => {
    if (newPrice < 0) return;
    
    setEditableItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem = {
          ...item,
          unitPrice: newPrice,
          totalPrice: item.quantity * newPrice
        };
        return updatedItem;
      }
      return item;
    }));
  };

  // Remove item
  const removeItem = (index: number) => {
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calculate totals
  const totalNet = editableItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalVat = editableItems.reduce((sum, item) => sum + (item.totalPrice * (item.vatRate / 100)), 0);
  const totalGross = totalNet + totalVat;

  // Handle form submission
  const handleSubmit = () => {
    if (!warehouseId) {
      toast({
        title: 'Validation Fehler',
        description: 'Bitte wählen Sie ein Lager aus.',
        variant: 'destructive',
      });
      return;
    }

    if (!expectedDeliveryDate) {
      toast({
        title: 'Validation Fehler',
        description: 'Bitte geben Sie ein Lieferdatum an.',
        variant: 'destructive',
      });
      return;
    }

    if (editableItems.length === 0) {
      toast({
        title: 'Validation Fehler',
        description: 'Mindestens ein Artikel muss bestellt werden.',
        variant: 'destructive',
      });
      return;
    }

    const orderData = {
      sourceOrderId,
      warehouseId,
      supplierId: copyData?.data.supplierDetails.id,
      expectedDeliveryDate,
      notes,
      priority,
      items: editableItems.filter(item => item.quantity > 0)
    };

    createOrderMutation.mutate(orderData);
  };

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Fehler beim Laden
            </DialogTitle>
            <DialogDescription>
              Die Bestelldaten konnten nicht geladen werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Bestellung kopieren und anpassen
          </DialogTitle>
          <DialogDescription>
            Passen Sie die Bestelldetails an und erstellen Sie eine neue Bestellung basierend auf der ausgewählten Vorlage.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : copyData?.data ? (
          <div className="space-y-6">
            {/* Source Order Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5" />
                  Quell-Bestellung: {copyData.data.sourceOrder.orderNumber}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Lieferant:</span>
                    <span>{copyData.data.sourceOrder.supplierName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Ursprüngliches Lager:</span>
                    <span>{copyData.data.sourceOrder.warehouseName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Erstellt am:</span>
                    <span>{format(new Date(copyData.data.sourceOrder.orderDate), 'dd.MM.yyyy', { locale: de })}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="warehouse">Lager *</Label>
                <Select
                  value={warehouseId?.toString() || ''}
                  onValueChange={(value) => setWarehouseId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Lager auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {copyData.data.availableWarehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                        {warehouse.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryDate">Lieferdatum *</Label>
                <Input
                  id="deliveryDate"
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priorität</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="urgent">Dringend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Zusätzliche Notizen zur Bestellung..."
                rows={3}
              />
            </div>

            <Separator />

            {/* Items Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Bestellpositionen</h3>
                <Badge variant="secondary">
                  {editableItems.length} Artikel
                </Badge>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artikel</TableHead>
                      <TableHead className="text-center">Original</TableHead>
                      <TableHead className="text-center">Menge</TableHead>
                      <TableHead className="text-right">Preis (€)</TableHead>
                      <TableHead className="text-right">Gesamt (€)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editableItems.map((item, index) => (
                      <TableRow key={`${item.productId}-${index}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.sku && `SKU: ${item.sku}`}
                              {item.category && ` • ${item.category}`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {item.originalQuantity} {item.unit}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateItemQuantity(index, item.quantity - 1)}
                              disabled={item.quantity <= 0}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 0)}
                              className="w-20 text-center"
                              min="0"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateItemQuantity(index, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                            className="w-24 text-right"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {item.totalPrice.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="space-y-2 text-right">
                  <div className="flex justify-between gap-8">
                    <span>Nettosumme:</span>
                    <span className="font-medium">{totalNet.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between gap-8">
                    <span>MwSt (19%):</span>
                    <span className="font-medium">{totalVat.toFixed(2)} €</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-8 text-lg font-bold">
                    <span>Gesamtsumme:</span>
                    <span>{totalGross.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createOrderMutation.isPending || isLoading}
            className="flex items-center gap-2"
          >
            {createOrderMutation.isPending ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Erstelle...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Bestellung erstellen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedOrderCopyDialog;
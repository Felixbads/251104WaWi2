import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Loader2, Save, RefreshCw, Truck, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  TableCaption,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type GoodsReceiptFormProps = {
  orderId: number;
  onReceiptComplete: () => void;
};

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unit?: string;
  price?: number;
  batches?: Array<{
    id?: number;
    expiryDate: Date | null;
    quantity: number;
  }>;
}

interface Order {
  id: number;
  orderNumber: string;
  supplierName: string;
  warehouseName: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  items: OrderItem[];
}

const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({
  orderId,
  onReceiptComplete
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for goods receipt form
  const [receiptDate, setReceiptDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  
  // Fetch order details
  const { data: order, isLoading: isLoadingOrder, error: orderError } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    onSuccess: (data) => {
      // Initialize order items with batches array
      const initializedItems = data.items.map(item => ({
        ...item,
        receivedQuantity: 0,
        batches: [{ expiryDate: null, quantity: 0 }]
      }));
      setOrderItems(initializedItems);
    }
  });
  
  // Submit goods receipt mutation
  const submitReceiptMutation = useMutation({
    mutationFn: (receiptData: any) => {
      return apiRequest('post', `/api/orders/${orderId}/receipt`, {
        body: receiptData
      });
    },
    onSuccess: () => {
      toast({
        title: "Wareneingang erfolgreich erfasst",
        description: "Der Wareneingang wurde erfolgreich gespeichert und die Lagerbestände wurden aktualisiert."
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      // Notify parent component
      onReceiptComplete();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erfassen des Wareneingangs",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handle item batch dialog open
  const handleOpenBatchDialog = (index: number) => {
    setSelectedItemIndex(index);
    setDialogOpen(true);
  };
  
  // Handle adding a new batch to an item
  const handleAddBatch = () => {
    if (selectedItemIndex === null) return;
    
    const updatedItems = [...orderItems];
    updatedItems[selectedItemIndex].batches?.push({
      expiryDate: null,
      quantity: 0
    });
    setOrderItems(updatedItems);
  };
  
  // Handle removing a batch from an item
  const handleRemoveBatch = (batchIndex: number) => {
    if (selectedItemIndex === null) return;
    
    const updatedItems = [...orderItems];
    const batches = updatedItems[selectedItemIndex].batches || [];
    
    if (batches.length <= 1) {
      toast({
        title: "Mindestens eine Charge erforderlich",
        description: "Jedes Produkt muss mindestens eine Charge haben.",
        variant: "destructive"
      });
      return;
    }
    
    // Remove the batch
    updatedItems[selectedItemIndex].batches = batches.filter((_, i) => i !== batchIndex);
    
    // Recalculate total received quantity
    const totalReceived = updatedItems[selectedItemIndex].batches?.reduce(
      (sum, batch) => sum + (batch.quantity || 0), 0
    ) || 0;
    updatedItems[selectedItemIndex].receivedQuantity = totalReceived;
    
    setOrderItems(updatedItems);
  };
  
  // Handle batch expiry date change
  const handleBatchExpiryDateChange = (batchIndex: number, date: Date | undefined) => {
    if (selectedItemIndex === null) return;
    
    const updatedItems = [...orderItems];
    const batches = [...(updatedItems[selectedItemIndex].batches || [])];
    
    if (batches[batchIndex]) {
      batches[batchIndex].expiryDate = date || null;
      updatedItems[selectedItemIndex].batches = batches;
      setOrderItems(updatedItems);
    }
  };
  
  // Handle batch quantity change
  const handleBatchQuantityChange = (batchIndex: number, quantity: number) => {
    if (selectedItemIndex === null) return;
    
    const updatedItems = [...orderItems];
    const batches = [...(updatedItems[selectedItemIndex].batches || [])];
    
    if (batches[batchIndex]) {
      batches[batchIndex].quantity = quantity;
      updatedItems[selectedItemIndex].batches = batches;
      
      // Update total received quantity
      const totalReceived = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
      updatedItems[selectedItemIndex].receivedQuantity = totalReceived;
      
      setOrderItems(updatedItems);
    }
  };
  
  // Handle saving batch changes
  const handleSaveBatchChanges = () => {
    setDialogOpen(false);
  };
  
  // Format expiry date display
  const formatExpiryDate = (date: Date | null) => {
    if (!date) return 'Nicht angegeben';
    return format(date, 'dd.MM.yyyy', { locale: de });
  };
  
  // Handle direct received quantity update
  const handleReceivedQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...orderItems];
    
    // Update direct received quantity
    updatedItems[index].receivedQuantity = quantity;
    
    // If there's only one batch, update its quantity too
    if (updatedItems[index].batches?.length === 1) {
      updatedItems[index].batches[0].quantity = quantity;
    }
    
    setOrderItems(updatedItems);
  };
  
  // Submit goods receipt
  const handleSubmitReceipt = () => {
    // Validate form
    const invalidItems = orderItems.filter(item => {
      // Check if any received quantity is greater than ordered
      if (item.receivedQuantity > item.orderedQuantity) {
        return true;
      }
      
      // Check if batches are properly set
      if (item.receivedQuantity > 0) {
        const batches = item.batches || [];
        
        // Ensure batch quantities sum up to receivedQuantity
        const batchTotal = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
        if (batchTotal !== item.receivedQuantity) {
          return true;
        }
        
        // Ensure all batches with quantity > 0 have an expiry date
        const invalidBatch = batches.some(batch => 
          batch.quantity > 0 && !batch.expiryDate
        );
        
        return invalidBatch;
      }
      
      return false;
    });
    
    if (invalidItems.length > 0) {
      toast({
        title: "Fehlerhafte Eingaben",
        description: "Bitte überprüfen Sie die eingegebenen Mengen und Mindesthaltbarkeitsdaten.",
        variant: "destructive"
      });
      return;
    }
    
    // Create receipt data
    const receiptData = {
      receiptDate: receiptDate,
      deliveryNumber: deliveryNumber,
      notes: notes,
      items: orderItems.map(item => ({
        orderItemId: item.id,
        productId: item.productId,
        receivedQuantity: item.receivedQuantity,
        batches: (item.batches || [])
          .filter(batch => batch.quantity > 0)
          .map(batch => ({
            expiryDate: batch.expiryDate,
            quantity: batch.quantity
          }))
      }))
    };
    
    // Submit receipt
    submitReceiptMutation.mutate(receiptData);
  };
  
  // Get items where at least one batch is missing an expiry date
  const getItemsMissingExpiryDate = () => {
    return orderItems.filter(item => {
      if (item.receivedQuantity > 0) {
        const batches = item.batches || [];
        return batches.some(batch => batch.quantity > 0 && !batch.expiryDate);
      }
      return false;
    });
  };
  
  // Calculate total received quantity for all items
  const totalReceivedQuantity = orderItems.reduce(
    (sum, item) => sum + item.receivedQuantity, 
    0
  );
  
  // Calculate total ordered quantity for all items
  const totalOrderedQuantity = orderItems.reduce(
    (sum, item) => sum + item.orderedQuantity, 
    0
  );
  
  // Check if any items have been received
  const hasReceivedItems = totalReceivedQuantity > 0;
  
  // Check if all ordered items have been fully received
  const allItemsReceived = orderItems.every(
    item => item.receivedQuantity === item.orderedQuantity
  );
  
  // Loading state
  if (isLoadingOrder) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Bestelldaten werden geladen...</span>
      </div>
    );
  }
  
  // Error state
  if (orderError || !order) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Fehler beim Laden der Bestellung</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Es ist ein Fehler beim Laden der Bestelldaten aufgetreten.
            Bitte versuchen Sie es später erneut.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Seite neu laden
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wareneingang erfassen</CardTitle>
          <CardDescription>
            Erfassen Sie den Wareneingang für die Bestellung #{order.orderNumber}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Receipt Date */}
              <div className="space-y-2">
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
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {receiptDate ? (
                        format(receiptDate, "PPP", { locale: de })
                      ) : (
                        <span>Datum auswählen</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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
              
              {/* Delivery Number */}
              <div className="space-y-2">
                <Label htmlFor="delivery-number">Lieferscheinnummer</Label>
                <Input
                  id="delivery-number"
                  placeholder="Lieferscheinnummer (optional)"
                  value={deliveryNumber}
                  onChange={(e) => setDeliveryNumber(e.target.value)}
                />
              </div>
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Anmerkungen</Label>
              <Textarea
                id="notes"
                placeholder="Anmerkungen zum Wareneingang (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Order Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Bestellpositionen</CardTitle>
          <CardDescription>
            Erfassen Sie die erhaltenen Mengen und Mindesthaltbarkeitsdaten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Produkt</TableHead>
                <TableHead className="text-center">Bestellt</TableHead>
                <TableHead className="text-center">Erhalten</TableHead>
                <TableHead className="text-center">MHD / Chargen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.map((item, index) => {
                // Calculate progress percentage
                const progressPercentage = item.orderedQuantity > 0 
                  ? (item.receivedQuantity / item.orderedQuantity) * 100 
                  : 0;
                
                // Check if all batches have expiry dates
                const missingExpiryDates = (item.batches || []).some(
                  batch => batch.quantity > 0 && !batch.expiryDate
                );
                
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-center">{item.orderedQuantity} {item.unit || 'Stk.'}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <div className="w-32">
                          <div className="flex items-center rounded-md border">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-r-none"
                              onClick={() => handleReceivedQuantityChange(index, Math.max(0, item.receivedQuantity - 1))}
                              disabled={item.receivedQuantity <= 0}
                            >
                              <span className="sr-only">Verringern</span>
                              <span className="text-xl">-</span>
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              max={item.orderedQuantity}
                              value={item.receivedQuantity}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value) && value >= 0 && value <= item.orderedQuantity) {
                                  handleReceivedQuantityChange(index, value);
                                }
                              }}
                              className="h-8 w-12 border-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-l-none"
                              onClick={() => handleReceivedQuantityChange(index, Math.min(item.orderedQuantity, item.receivedQuantity + 1))}
                              disabled={item.receivedQuantity >= item.orderedQuantity}
                            >
                              <span className="sr-only">Erhöhen</span>
                              <span className="text-xl">+</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Progress bar for received vs ordered */}
                      {item.receivedQuantity > 0 && (
                        <div className="w-full mt-2">
                          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${progressPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${progressPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center items-center">
                        {item.receivedQuantity > 0 ? (
                          <Button 
                            variant={missingExpiryDates ? "destructive" : "outline"} 
                            size="sm"
                            onClick={() => handleOpenBatchDialog(index)}
                            className="w-full"
                          >
                            {missingExpiryDates ? (
                              <>
                                <span className="sr-only">MHD fehlt</span>
                                MHD erfassen
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                {(item.batches?.length || 0) > 1 
                                  ? `${item.batches?.length} Chargen` 
                                  : 'MHD erfasst'
                                }
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              
              {orderItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                    Keine Bestellpositionen gefunden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableCaption>
              Gesamtmenge: {totalReceivedQuantity} von {totalOrderedQuantity} empfangen
            </TableCaption>
          </Table>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <div className="text-muted-foreground text-sm">
            {totalReceivedQuantity === 0 
              ? 'Keine Artikel empfangen'
              : totalReceivedQuantity === totalOrderedQuantity
                ? 'Alle Artikel vollständig empfangen'
                : `${totalReceivedQuantity} von ${totalOrderedQuantity} Artikeln empfangen`
            }
          </div>
          
          <Button 
            onClick={handleSubmitReceipt}
            disabled={
              !hasReceivedItems || 
              getItemsMissingExpiryDate().length > 0 ||
              submitReceiptMutation.isPending
            }
          >
            {submitReceiptMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Wareneingang speichern
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Batch Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chargen und Mindesthaltbarkeitsdaten erfassen</DialogTitle>
            <DialogDescription>
              Erfassen Sie für jede Charge das Mindesthaltbarkeitsdatum und die Menge.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItemIndex !== null && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-lg">{orderItems[selectedItemIndex]?.productName}</h3>
                  <p className="text-sm text-muted-foreground">
                    Gesamtmenge: {orderItems[selectedItemIndex]?.receivedQuantity} {orderItems[selectedItemIndex]?.unit || 'Stk.'}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddBatch}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Charge
                </Button>
              </div>
              
              <ScrollArea className="max-h-[350px] pr-4">
                <div className="space-y-4">
                  {orderItems[selectedItemIndex]?.batches?.map((batch, batchIndex) => (
                    <Card key={batchIndex}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Charge #{batchIndex + 1}</h4>
                          
                          {orderItems[selectedItemIndex]?.batches?.length! > 1 && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleRemoveBatch(batchIndex)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Entfernen
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Mindesthaltbarkeitsdatum</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !batch.expiryDate && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {batch.expiryDate ? (
                                    format(batch.expiryDate, "PPP", { locale: de })
                                  ) : (
                                    <span>MHD auswählen</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={batch.expiryDate || undefined}
                                  onSelect={(date) => handleBatchExpiryDateChange(batchIndex, date)}
                                  disabled={(date) => date < new Date()}
                                  initialFocus
                                  locale={de}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Menge</Label>
                            <Input
                              type="number"
                              min="0"
                              max={orderItems[selectedItemIndex]?.orderedQuantity}
                              value={batch.quantity}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value) && value >= 0) {
                                  handleBatchQuantityChange(batchIndex, value);
                                }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
              
              {/* Validation Messages */}
              {orderItems[selectedItemIndex]?.batches?.some(batch => batch.quantity > 0 && !batch.expiryDate) && (
                <div className="text-destructive text-sm mt-2">
                  Bitte geben Sie für alle Chargen ein Mindesthaltbarkeitsdatum an.
                </div>
              )}
              
              {(() => {
                const batches = orderItems[selectedItemIndex]?.batches || [];
                const batchTotal = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
                const receivedQuantity = orderItems[selectedItemIndex]?.receivedQuantity || 0;
                
                if (batchTotal !== receivedQuantity) {
                  return (
                    <div className="text-destructive text-sm mt-2">
                      Die Summe der Chargenmengen ({batchTotal}) stimmt nicht mit der Gesamtmenge ({receivedQuantity}) überein.
                    </div>
                  );
                }
                
                return null;
              })()}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveBatchChanges}>
              <Check className="mr-2 h-4 w-4" />
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GoodsReceiptForm;
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";

// UI Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Icons
import { 
  Loader2, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Info,
  AlertTriangle
} from "lucide-react";

// API-Funktion zum Speichern des Wareneingangs
const saveGoodsReceipt = async (orderId: number, receiptData: any) => {
  const response = await fetch(`/api/orders/${orderId}/receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(receiptData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Fehler beim Speichern des Wareneingangs");
  }

  return response.json();
};

interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  onSuccess: (updatedOrder: any) => void;
}

export default function ReceiveOrderDialog({ 
  open, 
  onOpenChange, 
  order, 
  onSuccess 
}: ReceiveOrderDialogProps) {
  const { toast } = useToast();
  
  // State für empfangene Waren
  const [receivedItems, setReceivedItems] = useState(() => {
    return order.orderItems.map((item: any) => ({
      orderItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      orderedQuantity: item.quantity,
      receivedQuantity: item.quantity, // Standard: Alles empfangen
      notes: "",
      batches: [
        {
          quantity: item.quantity,
          expiryDate: addMonths(new Date(), 3), // Standard: 3 Monate haltbar
          batchNumber: "",
          lotNumber: "",
          supplierReference: ""
        }
      ]
    }));
  });
  
  // Allgemeine Notizen zum Wareneingang
  const [generalNotes, setGeneralNotes] = useState("");
  
  // Mutation zum Speichern des Wareneingangs
  const saveReceiptMutation = useMutation({
    mutationFn: (data: any) => saveGoodsReceipt(order.id, data),
    onSuccess: (data) => {
      toast({
        title: "Wareneingang gespeichert",
        description: "Der Wareneingang wurde erfolgreich erfasst."
      });
      // Dialog schließen und Callback aufrufen
      onSuccess(data);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Speichern",
        description: error.message || "Beim Speichern des Wareneingangs ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  });
  
  // Hilfsfunktion: Menge eines Artikels aktualisieren
  const updateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...receivedItems];
    newItems[index].receivedQuantity = quantity;
    
    // Wenn nur ein Batch existiert, aktualisieren wir auch die Batch-Menge
    if (newItems[index].batches.length === 1) {
      newItems[index].batches[0].quantity = quantity;
    }
    
    setReceivedItems(newItems);
  };
  
  // Hilfsfunktion: Notizen für einen Artikel aktualisieren
  const updateItemNotes = (index: number, notes: string) => {
    const newItems = [...receivedItems];
    newItems[index].notes = notes;
    setReceivedItems(newItems);
  };
  
  // Hilfsfunktion: Batch-Wert aktualisieren
  const updateBatchValue = (itemIndex: number, batchIndex: number, field: string, value: any) => {
    const newItems = [...receivedItems];
    newItems[itemIndex].batches[batchIndex][field] = value;
    setReceivedItems(newItems);
  };
  
  // Neuen Batch hinzufügen
  const addBatch = (itemIndex: number) => {
    const newItems = [...receivedItems];
    const currentQuantity = newItems[itemIndex].batches.reduce((acc, batch) => acc + batch.quantity, 0);
    const remainingQuantity = newItems[itemIndex].receivedQuantity - currentQuantity;
    
    if (remainingQuantity <= 0) {
      toast({
        title: "Warnung",
        description: "Die gesamte Menge wurde bereits auf Batches aufgeteilt.",
        variant: "default"
      });
      return;
    }
    
    newItems[itemIndex].batches.push({
      quantity: remainingQuantity,
      expiryDate: addMonths(new Date(), 3),
      batchNumber: "",
      lotNumber: "",
      supplierReference: ""
    });
    
    setReceivedItems(newItems);
  };
  
  // Batch entfernen
  const removeBatch = (itemIndex: number, batchIndex: number) => {
    const newItems = [...receivedItems];
    if (newItems[itemIndex].batches.length > 1) {
      newItems[itemIndex].batches.splice(batchIndex, 1);
      setReceivedItems(newItems);
    } else {
      toast({
        title: "Hinweis",
        description: "Mindestens ein Batch muss vorhanden sein.",
        variant: "default"
      });
    }
  };
  
  // Wareneingang speichern
  const handleSaveReceipt = () => {
    // Prüfen, ob die Mengen stimmen
    const itemsWithInvalidQuantities = receivedItems.filter(item => {
      const totalBatchQuantity = item.batches.reduce((acc, batch) => acc + batch.quantity, 0);
      return totalBatchQuantity !== item.receivedQuantity;
    });
    
    if (itemsWithInvalidQuantities.length > 0) {
      toast({
        title: "Ungültige Mengen",
        description: "Die Summe der Batch-Mengen muss der Gesamtmenge entsprechen.",
        variant: "destructive"
      });
      return;
    }
    
    // Daten für API zusammenstellen
    const receiptData = {
      orderId: order.id,
      warehouseId: order.warehouseId,
      notes: generalNotes,
      receivedItems,
      receiptDate: new Date().toISOString()
    };
    
    // Mutation ausführen
    saveReceiptMutation.mutate(receiptData);
  };
  
  // Überprüfung, ob ein Artikel valid ist
  const isItemValid = (item: any) => {
    const totalBatchQuantity = item.batches.reduce((acc: number, batch: any) => acc + batch.quantity, 0);
    return totalBatchQuantity === item.receivedQuantity;
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wareneingang erfassen</DialogTitle>
          <DialogDescription>
            Erfassen Sie den Wareneingang für Bestellung {order.orderNumber} vom {
              format(new Date(order.orderDate), "dd.MM.yyyy", { locale: de })
            }.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Hinweis</AlertTitle>
            <AlertDescription>
              Bitte geben Sie die tatsächlich gelieferten Mengen ein und erfassen Sie für jede Charge das Mindesthaltbarkeitsdatum und ggf. Chargennummern.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Allgemeine Notizen</Label>
            <Textarea
              id="notes"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="z.B. Lieferung unvollständig, Nachlieferung angekündigt"
            />
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="w-[100px] text-right">Bestellt</TableHead>
                  <TableHead className="w-[100px] text-right">Geliefert</TableHead>
                  <TableHead className="w-[140px] text-right">Bemerkung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivedItems.map((item, index) => (
                  <TableRow key={item.orderItemId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-right">{item.orderedQuantity}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        value={item.receivedQuantity}
                        onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 0)}
                        className="w-20 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.notes}
                        onChange={(e) => updateItemNotes(index, e.target.value)}
                        placeholder="z.B. Beschädigt"
                        className="w-full"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Chargen und MHD erfassen</h3>
            
            {receivedItems.map((item, itemIndex) => (
              <div key={`batch-${item.orderItemId}`} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    {item.productName}
                    {!isItemValid(item) && (
                      <span className="ml-2 text-red-500 text-sm">
                        (Batch-Mengen stimmen nicht mit Gesamtmenge überein)
                      </span>
                    )}
                  </h4>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => addBatch(itemIndex)}
                  >
                    Charge hinzufügen
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {item.batches.map((batch, batchIndex) => (
                    <div key={`batch-${item.orderItemId}-${batchIndex}`} className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2 border-t">
                      <div>
                        <Label htmlFor={`quantity-${itemIndex}-${batchIndex}`}>Menge</Label>
                        <Input
                          id={`quantity-${itemIndex}-${batchIndex}`}
                          type="number"
                          min="1"
                          value={batch.quantity}
                          onChange={(e) => updateBatchValue(itemIndex, batchIndex, 'quantity', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`mhd-${itemIndex}-${batchIndex}`}>MHD</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              id={`mhd-${itemIndex}-${batchIndex}`}
                              variant="outline"
                              className="w-full justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {batch.expiryDate ? (
                                format(batch.expiryDate, "dd.MM.yyyy", { locale: de })
                              ) : (
                                <span>Datum wählen</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={batch.expiryDate}
                              onSelect={(date) => updateBatchValue(itemIndex, batchIndex, 'expiryDate', date)}
                              initialFocus
                              locale={de}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      <div>
                        <Label htmlFor={`batchNumber-${itemIndex}-${batchIndex}`}>Charge/Lot</Label>
                        <Input
                          id={`batchNumber-${itemIndex}-${batchIndex}`}
                          value={batch.batchNumber}
                          onChange={(e) => updateBatchValue(itemIndex, batchIndex, 'batchNumber', e.target.value)}
                          placeholder="Chargennummer"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`supplierRef-${itemIndex}-${batchIndex}`}>Lieferantenreferenz</Label>
                        <Input
                          id={`supplierRef-${itemIndex}-${batchIndex}`}
                          value={batch.supplierReference}
                          onChange={(e) => updateBatchValue(itemIndex, batchIndex, 'supplierReference', e.target.value)}
                          placeholder="Lieferantenreferenz"
                        />
                      </div>
                      
                      <div className="flex items-end justify-end">
                        {item.batches.length > 1 && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="mt-auto"
                            onClick={() => removeBatch(itemIndex, batchIndex)}
                          >
                            <span className="sr-only">Charge entfernen</span>
                            <AlertTriangle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          
          <Button
            onClick={handleSaveReceipt}
            disabled={saveReceiptMutation.isPending || receivedItems.some(item => !isItemValid(item))}
          >
            {saveReceiptMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Wareneingang speichern
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addMonths, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { z } from "zod";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Icons
import { 
  Loader2, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Info,
  Package,
  ChevronRight,
  X,
  Check,
  Plus,
  Mail
} from "lucide-react";

// Zod-Schema für Wareneingang-Validierung
const receiptRequestSchema = z.object({
  receiptDate: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(
    z.object({
      orderItemId: z.number().int().positive(),
      productId: z.number().int().positive(),
      batchNumber: z.string().min(1),
      expiryDate: z.coerce.date(),
      receivedQuantity: z.number().positive(),
      orderedQuantity: z.number().positive(),
      warehouseId: z.number().int().positive(),
      notes: z.string().trim().max(1000).optional(),
    })
  ).min(1, "Mindestens eine Position muss erfasst werden"),
});

// TypeScript-Typen basierend auf Zod-Schema
type ReceiptRequest = z.infer<typeof receiptRequestSchema>;
type ReceiptItem = ReceiptRequest['items'][0];

// Frontend-spezifische Typen für bessere Typisierung
interface BatchData {
  quantity: number;
  expiryDate: Date;
  batchNumber: string;
  lotNumber: string;
  supplierReference: string;
}

interface ReceivedItemData {
  orderItemId: number;
  productId: number;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  notes: string;
  batches: BatchData[];
}

interface OrderData {
  id: number;
  orderNumber: string;
  supplierName: string;
  orderDate: string;
  warehouseId: number;
  orderItems: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
  }>;
}

// API-Funktion zum Speichern des Wareneingangs (Backend-kompatibel mit receiptTransactionSchema)
const saveGoodsReceipt = async (orderId: number, receiptData: any, order: OrderData) => {
  console.log("Sende Wareneingang-Anfrage:", JSON.stringify(receiptData, null, 2));
  
  try {
    // **KRITISCHER FIX**: Korrekte Payload-Struktur für Backend
    const payload = {
      orderId: orderId,
      warehouseId: order.warehouseId, // order-property verwenden
      deliveryDate: receiptData.receiptDate ? 
        receiptData.receiptDate.toISOString().split('T')[0] : // YYYY-MM-DD Format
        new Date().toISOString().split('T')[0],
      receiptLines: receiptData.items.flatMap((item: ReceivedItemData) => 
        item.batches
          .filter(batch => batch.quantity > 0) // Nur Batches mit Menge > 0
          .map(batch => ({
            orderItemId: item.orderItemId,
            productId: item.productId,
            productName: item.productName, // HINZUFÜGEN: Erforderlich vom Backend
            quantityOrdered: item.orderedQuantity, // HINZUFÜGEN: Erforderlich vom Backend
            quantityReceived: batch.quantity,
            batchNumber: batch.batchNumber || `BATCH-${orderId}-${item.productId}`,
            expiryDate: batch.expiryDate ? 
              batch.expiryDate.toISOString().split('T')[0] : // YYYY-MM-DD Format
              undefined,
            notes: item.notes?.trim() || "",
            qualityStatus: (batch as any).qualityStatus || 'good' // HINZUFÜGEN: Default 'good'
          }))
      ).filter((line: any) => line.quantityReceived > 0), // Nur Linien mit Menge > 0
      notes: receiptData.notes?.trim() || "",
      processedBy: 1 // TODO: Aktuellen Benutzer verwenden
    };
    
    console.log("Backend-kompatible Payload:", JSON.stringify(payload, null, 2));
    
    // Validierung vor API-Call
    if (!payload.orderId) {
      throw new Error("Bestellung nicht gefunden");
    }
    
    if (!payload.warehouseId) {
      throw new Error("Ziellager nicht definiert");
    }
    
    if (payload.receiptLines.length === 0) {
      throw new Error("Mindestens eine Position mit Liefermenge muss erfasst werden");
    }
    
    // API-Call mit korrigierter Payload-Struktur
    const response = await fetch(`/api/orders/${orderId}/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload), // Korrekte Backend-Struktur senden
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Fehler-Antwort vom Server:", errorData);
      throw new Error(errorData.error || "Fehler beim Speichern des Wareneingangs");
    }

    const result = await response.json();
    console.log("Erfolgreiche Server-Antwort:", result);
    return result;
    
  } catch (error: any) {
    console.error("Fehler beim API-Aufruf:", error);
    throw error;
  }
};

interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderData;
  onSuccess: (updatedOrder: any) => void;
}

export default function ReceiveOrderDialog({ 
  open, 
  onOpenChange, 
  order, 
  onSuccess 
}: ReceiveOrderDialogProps) {
  const { toast } = useToast();
  
  // Aktiver Tab (nur noch 2 Tabs: Wareneingang und Zusammenfassung)
  const [activeTab, setActiveTab] = useState<string>("quantities");
  
  // State für empfangene Waren
  const [receivedItems, setReceivedItems] = useState<ReceivedItemData[]>(() => {
    try {
      // Sicherstellen, dass orderItems ein Array ist
      const itemsArray = Array.isArray(order?.orderItems) ? order.orderItems : [];
      
      // Erzeuge ein gültiges Standarddatum für MHD (3 Monate in der Zukunft)
      const defaultExpiryDate = addMonths(new Date(), 3);
      
      return itemsArray.map((item: any) => ({
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        orderedQuantity: item.quantity || 0,
        receivedQuantity: item.quantity || 0, // Standard: Alles empfangen
        notes: "",
        batches: [
          {
            quantity: item.quantity || 0,
            expiryDate: defaultExpiryDate, // Standard: 3 Monate haltbar
            batchNumber: `BATCH-${order?.orderNumber || 'NEW'}-${item.id || '0'}`,
            lotNumber: "",
            supplierReference: ""
          }
        ]
      })) || [];
    } catch (error) {
      console.error("Fehler beim Initialisieren der empfangenen Waren:", error);
      return []; // Leeres Array im Fehlerfall zurückgeben
    }
  });
  
  // Allgemeine Notizen zum Wareneingang
  const [generalNotes, setGeneralNotes] = useState("");
  
  // Globale MHD-Werte
  const [globalExpiryDate, setGlobalExpiryDate] = useState<Date>(addMonths(new Date(), 3));
  const [globalBatchPattern, setGlobalBatchPattern] = useState<string>(`BATCH-${order?.orderNumber || ""}-`);
  
  // Alle Mengen auf einmal setzen oder zurücksetzen
  const [receiveAll, setReceiveAll] = useState(true);
  
  // Mutation zum Speichern des Wareneingangs (überarbeitet mit Validierung)
  const saveReceiptMutation = useMutation({
    mutationFn: (data: any) => {
      console.log("Sende Wareneingang-Daten:", JSON.stringify(data, null, 2));
      
      // Validierung vor API-Call
      if (!order?.id) {
        throw new Error("Bestellung nicht gefunden");
      }
      
      if (!order?.warehouseId) {
        throw new Error("Ziellager nicht definiert");
      }
      
      // Prüfen, ob mindestens eine Position mit Menge vorhanden ist
      const itemsWithQuantity = data.items?.filter((item: any) => 
        item.receivedQuantity > 0 && 
        item.batches && 
        item.batches.length > 0 &&
        item.batches.some((batch: any) => batch.quantity > 0)
      ) || [];
      
      if (itemsWithQuantity.length === 0) {
        throw new Error("Mindestens eine Position mit Liefermenge muss erfasst werden");
      }
      
      // Validierung der Batch-Mengen
      for (const item of itemsWithQuantity) {
        const totalBatchQuantity = item.batches.reduce((acc: number, batch: any) => acc + (batch.quantity || 0), 0);
        if (Math.abs(totalBatchQuantity - item.receivedQuantity) > 0.001) {
          throw new Error(`Die Summe der Batch-Mengen für "${item.productName}" muss der Gesamtmenge entsprechen`);
        }
        
        // Validierung der Pflichtfelder für jeden Batch
        for (const batch of item.batches) {
          if (batch.quantity > 0) {
            if (!batch.batchNumber?.trim()) {
              throw new Error(`Chargennummer fehlt für "${item.productName}"`);
            }
            if (!batch.expiryDate) {
              throw new Error(`Mindesthaltbarkeitsdatum fehlt für "${item.productName}"`);
            }
          }
        }
      }
      
      return saveGoodsReceipt(order.id, data, order);
    },
    onSuccess: (data) => {
      toast({
        title: "Wareneingang gespeichert",
        description: "Der Wareneingang wurde erfolgreich erfasst."
      });
      // Dialog schließen und Callback aufrufen
      onOpenChange(false);
      onSuccess(data);
    },
    onError: (error: any) => {
      console.error("Fehler beim Speichern des Wareneingangs:", error);
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
  const updateBatchValue = (itemIndex: number, batchIndex: number, field: keyof BatchData, value: any) => {
    const newItems = [...receivedItems];
    (newItems[itemIndex].batches[batchIndex] as any)[field] = value;
    setReceivedItems(newItems);
  };
  
  // Neuen Batch hinzufügen
  const addBatch = (itemIndex: number) => {
    const newItems = [...receivedItems];
    const currentQuantity = newItems[itemIndex].batches.reduce((acc: number, batch: any) => acc + batch.quantity, 0);
    const remainingQuantity = newItems[itemIndex].receivedQuantity - currentQuantity;
    
    if (remainingQuantity <= 0) {
      toast({
        title: "Warnung",
        description: "Die gesamte Menge wurde bereits auf Batches aufgeteilt.",
        variant: "default"
      });
      return;
    }
    
    // Gültiges Datum für neuen Batch erstellen (3 Monate in der Zukunft)
    try {
      const newExpiryDate = addMonths(new Date(), 3);
      
      newItems[itemIndex].batches.push({
        quantity: remainingQuantity,
        expiryDate: newExpiryDate,
        batchNumber: `${globalBatchPattern}${itemIndex}`,
        lotNumber: "",
        supplierReference: ""
      });
    } catch (error) {
      console.error("Fehler beim Erstellen des Ablaufdatums:", error);
      // Fallback für den Fall eines ungültigen Datums
      const today = new Date();
      // Manuelles Addieren von 3 Monaten
      const futureDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
      
      newItems[itemIndex].batches.push({
        quantity: remainingQuantity,
        expiryDate: futureDate,
        batchNumber: `${globalBatchPattern}${itemIndex}`,
        lotNumber: "",
        supplierReference: ""
      });
    }
    
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
  
  // Wareneingang speichern (vereinfacht, da Validierung in Mutation erfolgt)
  const handleSaveReceipt = () => {
    // Daten für Mutation zusammenstellen
    const receiptData = {
      orderId: order.id,
      warehouseId: order.warehouseId,
      notes: generalNotes.trim(),
      items: receivedItems,
      receiptDate: new Date()
    };
    
    console.log("Sende Wareneingang-Daten:", JSON.stringify(receiptData, null, 2));
    
    // Mutation ausführen (enthält alle Validierung)
    saveReceiptMutation.mutate(receiptData);
  };
  
  // Überprüfung, ob ein Artikel valid ist
  const isItemValid = (item: any) => {
    // Wenn keine Menge angegeben wurde, ist der Artikel gültig (wird ignoriert)
    if (item.receivedQuantity === 0) return true;
    
    // Sonst prüfen, ob die Summe der Batches der Gesamtmenge entspricht
    const totalBatchQuantity = item.batches.reduce((acc: number, batch: any) => acc + batch.quantity, 0);
    return totalBatchQuantity === item.receivedQuantity;
  };
  
  // Globales MHD auf alle Produkte anwenden
  const applyGlobalExpiryDate = () => {
    const newItems = receivedItems.map((item: any) => ({
      ...item,
      batches: item.batches.map((batch: any) => ({
        ...batch,
        expiryDate: globalExpiryDate
      }))
    }));
    
    setReceivedItems(newItems);
    
    toast({
      title: "MHD aktualisiert",
      description: "Das Mindesthaltbarkeitsdatum wurde für alle Produkte aktualisiert."
    });
  };
  
  // Globales Batch-Muster auf alle Produkte anwenden
  const applyGlobalBatchPattern = () => {
    const newItems = receivedItems.map((item: any) => ({
      ...item,
      batches: item.batches.map((batch: any, batchIndex: number) => ({
        ...batch,
        batchNumber: `${globalBatchPattern}${item.orderItemId}-${batchIndex}`
      }))
    }));
    
    setReceivedItems(newItems);
    
    toast({
      title: "Chargennummern aktualisiert",
      description: "Die Chargennummern wurden für alle Produkte aktualisiert."
    });
  };
  
  // Alle Mengen auf einmal übernehmen oder zurücksetzen
  const handleReceiveAll = () => {
    const newItems = receivedItems.map((item: any) => ({
      ...item,
      receivedQuantity: receiveAll ? item.orderedQuantity : 0,
      batches: item.batches.map((batch: any) => ({
        ...batch,
        quantity: receiveAll ? item.orderedQuantity : 0
      }))
    }));
    
    setReceivedItems(newItems);
    setReceiveAll(!receiveAll);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 md:p-6 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Package className="h-5 w-5" />
            Wareneingang erfassen
          </DialogTitle>
          <DialogDescription>
            Bestellung #{order?.orderNumber} von {order?.supplierName}
            {order?.orderDate && (
              <> vom {format(new Date(order.orderDate), "dd.MM.yyyy", { locale: de })}</>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab} 
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="border-b">
            <TabsList className="w-full h-12 p-0 bg-transparent justify-start rounded-none px-4">
              <TabsTrigger 
                value="quantities" 
                className="flex items-center data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full"
              >
                <Package className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Wareneingang erfassen</span>
                <span className="sm:hidden">Erfassen</span>
              </TabsTrigger>
              <TabsTrigger 
                value="summary" 
                className="flex items-center data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Zusammenfassung</span>
                <span className="sm:hidden">Übersicht</span>
              </TabsTrigger>
            </TabsList>
          </div>
          
          {/* Tab 1: Kombinierter Tab für Mengen und Chargen */}
          <TabsContent value="quantities" className="flex-1 overflow-hidden flex flex-col m-0 py-0 px-0">
            <div className="p-4 border-b">
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertTitle>Hinweis</AlertTitle>
                <AlertDescription>
                  Geben Sie die tatsächlich gelieferten Mengen ein und verwalten Sie Chargen und MHD.
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Mengen erfassen</h3>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleReceiveAll}
                  className="h-8 text-xs whitespace-nowrap"
                >
                  {receiveAll ? (
                    <>
                      <X className="h-3 w-3 mr-1" />
                      <span>Zurücksetzen</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      <span>Alle übernehmen</span>
                    </>
                  )}
                </Button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
                <Card>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm font-medium flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Globales MHD
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Für alle Produkte gleiches MHD setzen
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {globalExpiryDate ? (
                              format(globalExpiryDate, "dd.MM.yyyy", { locale: de })
                            ) : (
                              <span>Datum wählen</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={globalExpiryDate}
                            onSelect={(date) => date && setGlobalExpiryDate(date)}
                            initialFocus
                            locale={de}
                          />
                        </PopoverContent>
                      </Popover>
                      <Button onClick={applyGlobalExpiryDate} className="whitespace-nowrap">
                        Übernehmen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm font-medium flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      Chargennummern
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Chargennummern-Muster für alle Produkte
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Input
                        value={globalBatchPattern}
                        onChange={(e) => setGlobalBatchPattern(e.target.value)}
                        placeholder="z.B. BATCH-"
                      />
                      <Button onClick={applyGlobalBatchPattern} className="whitespace-nowrap">
                        Übernehmen
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Beispiel: {globalBatchPattern}ItemID
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            <ScrollArea className="flex-1 pb-4">
              <div className="space-y-6 p-4">
                {receivedItems.map((item: any, index: number) => (
                  <Card key={`item-${item.orderItemId}`} className="overflow-hidden">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-base font-medium truncate">
                        {item.productName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      {/* Mengenbereich */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Bestellt:</p>
                            <p className="font-medium">{item.orderedQuantity} Stk.</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Erhalten:</p>
                            <Input
                              type="number"
                              min="0"
                              value={item.receivedQuantity}
                              onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-right"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Bemerkung:</p>
                          <Input
                            value={item.notes}
                            onChange={(e) => updateItemNotes(index, e.target.value)}
                            placeholder="z.B. Beschädigt"
                            className="w-full h-8"
                          />
                        </div>
                      </div>
                      
                      {/* Chargenbereich - nur anzeigen, wenn Liefermenge > 0 */}
                      {item.receivedQuantity > 0 && (
                        <div className="mt-4">
                          <Separator className="my-3" />
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium">Chargen & MHD</h4>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => addBatch(index)}
                              className="h-7 text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Charge hinzufügen
                            </Button>
                          </div>
                          
                          <div className="space-y-4 mt-3">
                            {item.batches.map((batch: any, batchIndex: number) => (
                              <div key={`batch-${item.orderItemId}-${batchIndex}`} className="border rounded-md p-3">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium">Charge {batchIndex + 1}</span>
                                  {item.batches.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-destructive hover:text-destructive"
                                      onClick={() => removeBatch(index, batchIndex)}
                                    >
                                      <X className="h-3 w-3 mr-1" />
                                      Entfernen
                                    </Button>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-xs">Menge</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={batch.quantity}
                                      onChange={(e) => updateBatchValue(index, batchIndex, 'quantity', parseInt(e.target.value) || 0)}
                                      className="h-8"
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label className="text-xs">MHD</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          className="w-full justify-start text-left font-normal h-8"
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
                                          onSelect={(date) => date && updateBatchValue(index, batchIndex, 'expiryDate', date)}
                                          initialFocus
                                          locale={de}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label className="text-xs">Chargennummer</Label>
                                    <Input
                                      value={batch.batchNumber}
                                      onChange={(e) => updateBatchValue(index, batchIndex, 'batchNumber', e.target.value)}
                                      placeholder="Chargennummer"
                                      className="h-8"
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label className="text-xs">Lieferantenreferenz</Label>
                                    <Input
                                      value={batch.supplierReference}
                                      onChange={(e) => updateBatchValue(index, batchIndex, 'supplierReference', e.target.value)}
                                      placeholder="Lieferantenreferenz"
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {!isItemValid(item) && (
                            <p className="text-xs text-destructive mt-2">
                              Die Summe der Chargenmengen muss der Gesamtmenge entsprechen.
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
            
            <div className="border-t p-4">
              <Button 
                className="w-full"
                variant="outline"
                onClick={() => setActiveTab("summary")}
              >
                Weiter zur Zusammenfassung
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </TabsContent>
          
          {/* Tab 2: Zusammenfassung */}
          <TabsContent value="summary" className="flex-1 overflow-hidden flex flex-col m-0 py-0 px-0">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-lg font-semibold">Zusammenfassung</CardTitle>
                    <CardDescription>
                      Überprüfen Sie die Daten vor dem Speichern
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Bestellung:</p>
                        <p className="font-medium">#{order?.orderNumber}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Lieferant:</p>
                        <p className="font-medium">{order?.supplierName}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Datum:</p>
                        <p className="font-medium">{format(new Date(), "dd.MM.yyyy", { locale: de })}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Status:</p>
                        <Badge className="font-normal">
                          {receivedItems.some((item: any) => !isItemValid(item)) 
                            ? "Mengen überprüfen" 
                            : "Bereit zur Buchung"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <div className="space-y-2">
                  <Label htmlFor="general-notes">Allgemeine Notizen</Label>
                  <Textarea
                    id="general-notes"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Allgemeine Bemerkungen zum Wareneingang"
                    className="min-h-[100px]"
                  />
                </div>
                
                <Card>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm font-medium">Artikelübersicht</CardTitle>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead className="text-right">Bestellt</TableHead>
                          <TableHead className="text-right">Geliefert</TableHead>
                          <TableHead className="text-right">Chargen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivedItems.map((item: any) => (
                          <TableRow key={`summary-${item.orderItemId}`}>
                            <TableCell className="font-medium">{item.productName}</TableCell>
                            <TableCell className="text-right">{item.orderedQuantity}</TableCell>
                            <TableCell className="text-right">{item.receivedQuantity}</TableCell>
                            <TableCell className="text-right">
                              {item.receivedQuantity > 0 && !isItemValid(item) ? (
                                <Badge variant="destructive" className="ml-auto">
                                  Überprüfen
                                </Badge>
                              ) : (
                                item.receivedQuantity > 0 ? (
                                  <Badge variant="outline" className="ml-auto">
                                    {item.batches.length}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            </ScrollArea>
            
            <div className="border-t p-4">
              <Button 
                className="w-full"
                disabled={saveReceiptMutation.isPending || receivedItems.some((item: any) => !isItemValid(item))}
                onClick={handleSaveReceipt}
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
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="border-t p-4 flex-row-reverse sm:flex-row gap-2 justify-between">
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            
            {activeTab !== "summary" && (
              <Button
                size="sm"
                disabled={saveReceiptMutation.isPending || receivedItems.some((item: any) => !isItemValid(item))}
                onClick={handleSaveReceipt}
              >
                {saveReceiptMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div className="flex items-center">
            {receivedItems.some((item: any) => !isItemValid(item)) && (
              <Badge variant="destructive" className="mr-2">
                Mengen überprüfen
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {receivedItems.filter((item: any) => item.receivedQuantity > 0).length} von {receivedItems.length} Artikeln
            </span>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
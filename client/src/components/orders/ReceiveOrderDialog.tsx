import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// UI Komponenten
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Icons
import {
  Calendar as CalendarIcon,
  Loader2,
  Upload,
  Camera,
  Info,
  PackageCheck,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// Formatierung von Währungen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

// Formatierung des Datums
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy", { locale: de });
};

type ReceiveOrderDialogProps = {
  order: any; // In der tatsächlichen Implementierung sollte hier ein Typ definiert werden
  open: boolean;
  onClose: () => void;
  onSubmit: (receivedItems: any[], deliveryDetails: any) => void;
};

export default function ReceiveOrderDialog({
  order,
  open,
  onClose,
  onSubmit,
}: ReceiveOrderDialogProps) {
  // Zustand für die tatsächlich gelieferten Mengen und andere Details
  const [receivedItems, setReceivedItems] = useState<any[]>([]);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [comments, setComments] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);
  const [hasDeliveryPhoto, setHasDeliveryPhoto] = useState(false);
  const { toast } = useToast();

  // Initialisiere die Formulardaten basierend auf der Bestellung
  useEffect(() => {
    if (order && order.orderItems) {
      // Erstelle eine Kopie der Bestellpositionen mit zusätzlichen Feldern für den Wareneingang
      const items = order.orderItems.map((item: any) => ({
        ...item,
        receivedQuantity: item.receivedQuantity || item.quantity, // Standardmäßig die bestellte Menge
        isDamaged: false,
        damageNotes: "",
        batchNumber: "",
        expiryDate: ""
      }));
      setReceivedItems(items);
    }
  }, [order]);

  // Aktualisiere die empfangene Menge für einen Artikel
  const handleQuantityChange = (index: number, value: string) => {
    const newReceivedItems = [...receivedItems];
    const numericValue = parseInt(value) || 0;
    
    // Stelle sicher, dass die Menge nicht negativ ist
    newReceivedItems[index].receivedQuantity = Math.max(0, numericValue);
    setReceivedItems(newReceivedItems);
  };

  // Markiere einen Artikel als beschädigt oder nicht
  const handleDamageToggle = (index: number, checked: boolean) => {
    const newReceivedItems = [...receivedItems];
    newReceivedItems[index].isDamaged = checked;
    setReceivedItems(newReceivedItems);
  };

  // Aktualisiere die Beschädigungsnotizen für einen Artikel
  const handleDamageNotesChange = (index: number, value: string) => {
    const newReceivedItems = [...receivedItems];
    newReceivedItems[index].damageNotes = value;
    setReceivedItems(newReceivedItems);
  };

  // Aktualisiere die Chargennummer für einen Artikel
  const handleBatchNumberChange = (index: number, value: string) => {
    const newReceivedItems = [...receivedItems];
    newReceivedItems[index].batchNumber = value;
    setReceivedItems(newReceivedItems);
  };

  // Foto des Lieferscheins hochladen (Mock-Funktion)
  const handlePhotoUpload = () => {
    // In einer tatsächlichen Implementierung würde hier ein Datei-Upload-Dialog geöffnet
    toast({
      title: "Foto hinzugefügt",
      description: "Der Lieferschein wurde als Foto gespeichert."
    });
    setHasDeliveryPhoto(true);
  };

  // Wareneingang abschließen
  const handleSubmit = () => {
    setLoading(true);
    
    // Wareneingangsdaten zusammenstellen
    const deliveryDetails = {
      orderId: order.id,
      deliveryNoteNumber,
      comments,
      deliveryDate: deliveryDate?.toISOString(),
      hasDeliveryPhoto
    };
    
    // Kurze Verzögerung für Demo-Zwecke
    setTimeout(() => {
      onSubmit(receivedItems, deliveryDetails);
      setLoading(false);
    }, 1000);
  };

  // Berechne den Gesamtprozentsatz der gelieferten Artikel
  const calculateCompletionPercentage = () => {
    if (!receivedItems.length) return 0;
    
    const orderedTotal = receivedItems.reduce((sum, item) => sum + item.quantity, 0);
    const receivedTotal = receivedItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
    
    return Math.min(100, Math.round((receivedTotal / orderedTotal) * 100));
  };

  // Prüfe, ob es Abweichungen zwischen bestellter und gelieferter Menge gibt
  const hasDiscrepancies = receivedItems.some(
    item => item.receivedQuantity !== item.quantity || item.isDamaged
  );

  // Dialog-Inhalt
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Wareneingang erfassen für Bestellung #{order?.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Bitte überprüfen Sie die gelieferten Artikel und dokumentieren Sie eventuelle Abweichungen.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Liefer- und Bestellinformationen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
            <div>
              <h3 className="text-sm font-medium mb-2">Bestelldetails</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Bestellnummer:</div>
                <div>{order?.orderNumber}</div>
                <div className="text-muted-foreground">Lieferant:</div>
                <div>{order?.supplierName}</div>
                <div className="text-muted-foreground">Bestelldatum:</div>
                <div>{formatDate(order?.createdAt)}</div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Lieferinformationen</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                  <Label htmlFor="delivery-note" className="text-right">Lieferschein-Nr.</Label>
                  <Input
                    id="delivery-note"
                    value={deliveryNoteNumber}
                    onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                    placeholder="z.B. LS-2025-12345"
                  />
                </div>
                
                <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                  <Label htmlFor="delivery-date" className="text-right">Lieferdatum</Label>
                  <div className="flex-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {deliveryDate ? format(deliveryDate, "dd.MM.yyyy", { locale: de }) : "Datum auswählen"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={deliveryDate}
                          onSelect={setDeliveryDate}
                          locale={de}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Lieferschein Foto Upload */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-medium">Lieferschein Foto</h3>
                <p className="text-xs text-muted-foreground">Laden Sie ein Foto des Lieferscheins hoch (optional)</p>
              </div>
            </div>
            <div className="flex gap-2">
              {hasDeliveryPhoto ? (
                <Button variant="outline" onClick={() => setHasDeliveryPhoto(false)} className="gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Foto entfernen
                </Button>
              ) : (
                <Button variant="outline" onClick={handlePhotoUpload} className="gap-1.5">
                  <Camera className="h-4 w-4" />
                  Foto hinzufügen
                </Button>
              )}
            </div>
          </div>
          
          {/* Bestellpositionen */}
          <div>
            <h3 className="text-sm font-medium mb-2">Bestellpositionen</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artikel</TableHead>
                  <TableHead className="text-right">Bestellt</TableHead>
                  <TableHead className="text-right">Geliefert</TableHead>
                  <TableHead>Charge / MHD</TableHead>
                  <TableHead>Beschädigt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivedItems.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.sku} • {formatCurrency(item.unitPrice)} / {item.unit}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Input
                          type="number"
                          value={item.receivedQuantity}
                          onChange={(e) => handleQuantityChange(index, e.target.value)}
                          min="0"
                          className="w-20 text-right"
                        />
                        <span className="ml-1 flex items-center text-muted-foreground">{item.unit}</span>
                      </div>
                      {item.receivedQuantity !== item.quantity && (
                        <p className="text-xs text-amber-600 text-right mt-1">
                          {item.receivedQuantity > item.quantity ? "Überlieferung" : "Unterlieferung"}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Charge / MHD"
                        value={item.batchNumber}
                        onChange={(e) => handleBatchNumberChange(index, e.target.value)}
                        className="w-full"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={item.isDamaged}
                            onCheckedChange={(checked) => handleDamageToggle(index, checked as boolean)}
                            id={`damaged-${item.id}`}
                          />
                          <Label htmlFor={`damaged-${item.id}`} className="text-sm cursor-pointer">
                            Beschädigt
                          </Label>
                        </div>
                        {item.isDamaged && (
                          <Textarea
                            placeholder="Beschreibung des Schadens"
                            value={item.damageNotes}
                            onChange={(e) => handleDamageNotesChange(index, e.target.value)}
                            className="h-16 text-xs mt-1"
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {receivedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                      Keine Bestellpositionen gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            
            {/* Übersicht zur Lieferung */}
            <div className="mt-4 p-3 rounded-md bg-muted/30">
              <div className="flex justify-between mb-1 text-sm">
                <span>Lieferstatus:</span>
                <span className="font-medium">
                  {calculateCompletionPercentage()}% komplett
                  {hasDiscrepancies && " (mit Abweichungen)"}
                </span>
              </div>
              {hasDiscrepancies && (
                <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 rounded text-xs">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Achtung: Abweichungen festgestellt</p>
                    <p className="mt-0.5">
                      Es gibt Unterschiede zwischen der bestellten und der tatsächlich gelieferten Menge oder beschädigte Artikel.
                      Diese Abweichungen werden im System dokumentiert.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Kommentare */}
          <div>
            <Label htmlFor="comments" className="text-sm font-medium">
              Kommentare zum Wareneingang
            </Label>
            <Textarea
              id="comments"
              placeholder="Zusätzliche Bemerkungen zum Wareneingang..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="mt-1.5 min-h-32"
            />
          </div>
        </div>

        <Separator />
        
        {/* Info */}
        <div className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5" />
          <p>
            Nach Abschluss des Wareneingangs wird der Lagerbestand automatisch aktualisiert und ein Protokoll erstellt.
          </p>
        </div>
        
        {/* Aktionen */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Wareneingang abschließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
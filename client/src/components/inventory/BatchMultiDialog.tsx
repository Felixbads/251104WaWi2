import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// Eigene Funktion für eindeutige IDs
const generateUniqueId = (): string => {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
};
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, XCircle } from 'lucide-react';

interface BatchEntry {
  id: string; // temporäre ID für UI
  batchNumber: string;
  expiryDate: string | null;
  quantity: number;
}

interface InventoryCountItem {
  id: number;
  productId: number;
  countedQuantity?: number | null;
  product?: {
    productName: string;
  };
}

interface BatchMultiDialogProps {
  item: InventoryCountItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (batches: BatchEntry[]) => void;
  existingBatches?: BatchEntry[];
}

export default function BatchMultiDialog({
  item,
  isOpen,
  onClose,
  onSave,
  existingBatches = [],
}: BatchMultiDialogProps) {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchEntry[]>(
    existingBatches.length > 0
      ? existingBatches
      : [
          {
            id: generateUniqueId(),
            batchNumber: `INV-${new Date().toISOString().split('T')[0]}-1`,
            expiryDate: null,
            quantity: item.countedQuantity || 0,
          },
        ]
  );

  const [remainingQuantity, setRemainingQuantity] = useState(0);

  // Berechne verbleibende Menge bei Öffnung oder Änderung der gezählten Menge
  useEffect(() => {
    const totalAssigned = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const remaining = (item.countedQuantity || 0) - totalAssigned;
    setRemainingQuantity(remaining);
  }, [batches, item.countedQuantity, isOpen]);

  // Batch hinzufügen
  const addBatch = () => {
    const newBatch: BatchEntry = {
      id: generateUniqueId(),
      batchNumber: `INV-${new Date().toISOString().split('T')[0]}-${batches.length + 1}`,
      expiryDate: null,
      quantity: remainingQuantity > 0 ? remainingQuantity : 0,
    };

    setBatches([...batches, newBatch]);
    setRemainingQuantity(0);
  };

  // Batch entfernen
  const removeBatch = (batchId: string) => {
    // Nur löschen, wenn mehr als ein Batch übrig bleibt
    if (batches.length <= 1) {
      toast({
        title: "Mindestens ein Batch erforderlich",
        description: "Es muss mindestens ein MHD-Eintrag vorhanden sein.",
        variant: "destructive",
      });
      return;
    }

    const batchToRemove = batches.find((b) => b.id === batchId);
    const newBatches = batches.filter((b) => b.id !== batchId);

    setBatches(newBatches);

    if (batchToRemove) {
      setRemainingQuantity((prev) => prev + batchToRemove.quantity);
    }
  };

  // Batch aktualisieren
  const updateBatch = (batchId: string, field: string, value: any) => {
    const newBatches = batches.map((batch) => {
      if (batch.id === batchId) {
        const updatedBatch = { ...batch, [field]: value };

        // Bei Änderung der Menge den Restbestand neu berechnen
        if (field === 'quantity') {
          const oldQuantity = batch.quantity;
          const newQuantity = typeof value === 'string' ? parseInt(value, 10) : value;
          const diff = oldQuantity - newQuantity;
          setRemainingQuantity((prev) => prev + diff);
        }

        return updatedBatch;
      }
      return batch;
    });

    setBatches(newBatches);
  };

  // Prüfen, ob alle Batches gültige Werte haben
  const validateBatches = () => {
    // Prüfen, ob alle Batches eine Menge > 0 haben
    const invalidQuantity = batches.some((batch) => batch.quantity <= 0);
    if (invalidQuantity) {
      toast({
        title: "Ungültige Menge",
        description: "Alle Chargen müssen eine Menge größer als 0 haben.",
        variant: "destructive",
      });
      return false;
    }

    // Prüfen, ob die Summe der Chargen dem Gesamtbestand entspricht
    const totalBatchQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalBatchQuantity !== (item.countedQuantity || 0)) {
      toast({
        title: "Mengenabweichung",
        description: `Die Summe aller Chargen (${totalBatchQuantity}) entspricht nicht dem gezählten Bestand (${item.countedQuantity}).`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Speichern der Chargen
  const saveBatches = () => {
    if (!validateBatches()) return;

    // Rufe die onSave Callback-Funktion mit den Batches auf
    onSave(batches);
    onClose();
  };

  // Formatiert das Datum für HTML date input (YYYY-MM-DD Format)
  const formatDate = (date: string | null) => {
    if (!date) return "";
    // Extrahiere nur das Datum im YYYY-MM-DD Format
    // Behandle sowohl ISO-Strings mit Zeit als auch einfache Datumsstrings
    const dateOnly = date.split('T')[0];
    // Stelle sicher, dass das Format YYYY-MM-DD ist
    if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateOnly;
    }
    // Falls das Datum in einem anderen Format ist, versuche es zu parsen
    try {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (e) {
      console.error('Fehler beim Parsen des Datums:', e);
    }
    return "";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>MHD-Chargen für {item.product?.productName}</DialogTitle>
          <DialogDescription>
            Erfassen Sie die verschiedenen MHD-Chargen für dieses Produkt.
            <div className="mt-2 p-2 bg-muted rounded-md">
              <div className="flex justify-between text-sm">
                <span>Gezählter Gesamtbestand:</span>
                <span className="font-bold">{item.countedQuantity || 0} Stück</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Bereits zugeordnet:</span>
                <span className="font-medium">
                  {batches.reduce((sum, b) => sum + b.quantity, 0)} Stück
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Noch zuzuordnen:</span>
                <span
                  className={`font-medium ${
                    remainingQuantity !== 0 ? "text-red-500" : "text-green-500"
                  }`}
                >
                  {remainingQuantity} Stück
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 max-h-[400px] overflow-y-auto">
          <div className="space-y-6">
            {batches.map((batch, index) => (
              <div key={batch.id} className="p-3 border rounded-md relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => removeBatch(batch.id)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>

                <h4 className="font-medium mb-3">Charge {index + 1}</h4>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`batchNumber-${batch.id}`}>Chargennummer</Label>
                    <Input
                      id={`batchNumber-${batch.id}`}
                      value={batch.batchNumber}
                      onChange={(e) => updateBatch(batch.id, "batchNumber", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`expiryDate-${batch.id}`}>MHD</Label>
                    <Input
                      id={`expiryDate-${batch.id}`}
                      type="date"
                      value={formatDate(batch.expiryDate)}
                      onChange={(e) => updateBatch(batch.id, "expiryDate", e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor={`quantity-${batch.id}`}>Menge</Label>
                    <Input
                      id={`quantity-${batch.id}`}
                      type="number"
                      min="0"
                      value={batch.quantity}
                      onChange={(e) =>
                        updateBatch(batch.id, "quantity", parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full"
              onClick={addBatch}
              disabled={remainingQuantity <= 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Weitere Charge hinzufügen
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={saveBatches} disabled={remainingQuantity !== 0}>
            Chargen speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
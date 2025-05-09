import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { InventoryCountItem, ProductBatch } from './InventoryCountNew';

interface InventoryCountBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryCountItem | null;
  onBatchUpdate: (
    productId: number, 
    batchId: number, 
    countedQuantity: number
  ) => void;
}

const InventoryCountBatchDialog = ({ 
  open, 
  onOpenChange, 
  item, 
  onBatchUpdate 
}: InventoryCountBatchDialogProps) => {
  const [localBatchCounts, setLocalBatchCounts] = useState<{[key: number]: number}>({});
  const [totalCountedQuantity, setTotalCountedQuantity] = useState<number>(0);

  // Initialisiere die lokalen Mengen basierend auf dem Item
  useEffect(() => {
    if (item && item.batchCounts) {
      setLocalBatchCounts(item.batchCounts);
      
      // Berechne die Gesamtmenge
      const total = Object.values(item.batchCounts).reduce((sum, qty) => sum + qty, 0);
      setTotalCountedQuantity(total);
    } else if (item && item.batches) {
      // Initialisiere mit den aktuellen Mengen, wenn keine batchCounts gesetzt sind
      const initialCounts = item.batches.reduce((acc, batch) => {
        acc[batch.id] = batch.currentQuantity;
        return acc;
      }, {} as {[key: number]: number});
      
      setLocalBatchCounts(initialCounts);
      
      // Berechne die Gesamtmenge
      const total = Object.values(initialCounts).reduce((sum, qty) => sum + qty, 0);
      setTotalCountedQuantity(total);
    }
  }, [item]);

  // Handler für die Änderung der Menge eines Batches
  const handleBatchQuantityChange = (batchId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    
    // Aktualisiere die lokale Menge
    const updatedCounts = {
      ...localBatchCounts,
      [batchId]: numValue
    };
    
    setLocalBatchCounts(updatedCounts);
    
    // Aktualisiere die Gesamtmenge
    const newTotal = Object.values(updatedCounts).reduce((sum, qty) => sum + qty, 0);
    setTotalCountedQuantity(newTotal);
  };

  // Handler zum Speichern aller Batch-Änderungen
  const handleSaveAllBatches = () => {
    if (!item) return;

    // Für jeden Batch, bei dem sich die Menge geändert hat, aktualisiere sie
    if (item.batches) {
      item.batches.forEach(batch => {
        const countedQuantity = localBatchCounts[batch.id] || 0;
        
        // Rufe die onBatchUpdate-Funktion mit den neuen Mengen auf
        onBatchUpdate(item.productId, batch.id, countedQuantity);
      });
    }
    
    toast({
      title: "Chargen aktualisiert",
      description: `Die Mengen für ${item.productName} wurden aktualisiert.`,
    });
    
    // Schließe den Dialog
    onOpenChange(false);
  };

  // Formatiere das Datum zur Anzeige
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
  };

  // Bestimme den Status einer Charge (Farbe des Badges)
  const getBatchStatusVariant = (status: string, expiryDate: string | null | undefined) => {
    if (status === 'inactive') return "destructive";
    if (status !== 'active') return "secondary";
    
    // Prüfe Ablaufdatum für aktive Chargen
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      
      // Wenn abgelaufen, rot
      if (expiry < today) return "destructive";
      
      // Wenn in weniger als 30 Tagen ablaufend, orange
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      if (expiry < thirtyDaysFromNow) return "warning";
    }
    
    return "default";
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Chargen für {item.productName}</DialogTitle>
          <DialogDescription>
            Erfassen Sie die gezählten Mengen pro Charge
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">{item.productName}</h3>
                  {item.sku && <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm">Aktuelle Menge: <span className="font-medium">{item.currentQuantity}</span></p>
                  <p className="text-sm">Gezählte Menge: <span className="font-medium">{totalCountedQuantity}</span></p>
                  <p className="text-sm">
                    Differenz: <span className={`font-medium ${totalCountedQuantity - item.currentQuantity < 0 ? 'text-red-500' : totalCountedQuantity - item.currentQuantity > 0 ? 'text-green-500' : ''}`}>
                      {totalCountedQuantity - item.currentQuantity}
                    </span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MHD</TableHead>
                  <TableHead>Aktuell</TableHead>
                  <TableHead>Gezählt</TableHead>
                  <TableHead>Differenz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.batches && item.batches.length > 0 ? (
                  item.batches.map((batch) => {
                    const currentBatchQuantity = batch.currentQuantity || 0;
                    const countedBatchQuantity = localBatchCounts[batch.id] || 0;
                    const batchDifference = countedBatchQuantity - currentBatchQuantity;
                    
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                        <TableCell>
                          <Badge variant={getBatchStatusVariant(batch.status, batch.expiryDate)}>
                            {batch.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(batch.expiryDate)}</TableCell>
                        <TableCell>{currentBatchQuantity}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={countedBatchQuantity}
                            onChange={(e) => handleBatchQuantityChange(batch.id, e.target.value)}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className={`${batchDifference < 0 ? 'text-red-500' : batchDifference > 0 ? 'text-green-500' : ''}`}>
                          {batchDifference}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Keine Chargen für dieses Produkt gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Abbrechen</Button>
          </DialogClose>
          <Button onClick={handleSaveAllBatches}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryCountBatchDialog;
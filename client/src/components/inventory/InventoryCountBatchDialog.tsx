import { useState, useEffect } from 'react';
import { 
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { 
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
import { Plus, ChevronRight, PackageOpen, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

// Interface für Produktcharge
interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity: number;
  currentQuantity: number;
  expiryDate: string | null;
  status: string;
  locationInWarehouse?: string;
  notes?: string;
}

// Interface für das Inventur-Zähl-Element mit Chargen-Ansicht
interface InventoryCountItemBatchView {
  id?: number;
  productId: number;
  productName: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  batchId?: number | null;
  batchNumber?: string;
  expiryDate?: string | null;
}

interface InventoryCountBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: InventoryCountItemBatchView | null;
  availableBatches: ProductBatch[];
  onUpdateBatch?: (itemId: number, batchId: number, countedQuantity: number) => void;
  onCreateBatch?: (newBatch: Partial<ProductBatch>) => Promise<ProductBatch>;
  onLoadBatches?: (productId: number) => Promise<ProductBatch[]>;
}

export default function InventoryCountBatchDialog({
  open,
  onOpenChange,
  selectedItem,
  availableBatches,
  onUpdateBatch,
  onCreateBatch,
  onLoadBatches
}: InventoryCountBatchDialogProps) {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [activeTab, setActiveTab] = useState('existing');
  const [loading, setLoading] = useState(false);
  const [batchCounts, setBatchCounts] = useState<{[key: number]: number}>({});
  
  // Status für neue Charge
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [newExpiryDate, setNewExpiryDate] = useState<Date | null>(null);
  const [newLocation, setNewLocation] = useState('');
  const [newNotes, setNewNotes] = useState('');
  
  // Lade Batches, wenn Dialog geöffnet wird
  useEffect(() => {
    if (open && selectedItem) {
      // Verfügbare Batches aus Props verwenden oder nachladen
      if (availableBatches && availableBatches.length > 0) {
        setBatches(availableBatches);
        
        // Initialisiere batchCounts mit den aktuellen Mengen
        const initialCounts: {[key: number]: number} = {};
        availableBatches.forEach(batch => {
          initialCounts[batch.id] = batch.currentQuantity;
        });
        setBatchCounts(initialCounts);
      } else if (onLoadBatches) {
        loadBatches();
      }
    } else {
      // Bei Schließen des Dialogs alle Status zurücksetzen
      resetForm();
    }
  }, [open, selectedItem, availableBatches]);
  
  // Batches laden
  const loadBatches = async () => {
    if (!selectedItem || !onLoadBatches) return;
    
    try {
      setLoading(true);
      const loadedBatches = await onLoadBatches(selectedItem.productId);
      setBatches(loadedBatches);
      
      // Initialisiere batchCounts mit den aktuellen Mengen
      const initialCounts: {[key: number]: number} = {};
      loadedBatches.forEach(batch => {
        initialCounts[batch.id] = batch.currentQuantity;
      });
      setBatchCounts(initialCounts);
    } catch (error) {
      console.error('Fehler beim Laden der Batches:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handler für Mengenänderung einer Charge
  const handleQuantityChange = (batchId: number, value: number) => {
    setBatchCounts(prev => ({
      ...prev,
      [batchId]: value
    }));
  };
  
  // Handler für Aktualisierung der Charge-Menge
  const handleUpdateBatch = (batchId: number) => {
    if (!selectedItem || !selectedItem.id || !onUpdateBatch) return;
    
    const countedQuantity = batchCounts[batchId] || 0;
    onUpdateBatch(selectedItem.id, batchId, countedQuantity);
  };
  
  // Handler für Erstellung einer neuen Charge
  const handleCreateBatch = async () => {
    if (!selectedItem || !onCreateBatch) return;
    
    try {
      setLoading(true);
      
      const newBatch: Partial<ProductBatch> = {
        productId: selectedItem.productId,
        warehouseId: batches.length > 0 ? batches[0].warehouseId : 0, // Nehme das Lager der vorhandenen Batches
        batchNumber: newBatchNumber,
        initialQuantity: newQuantity,
        currentQuantity: newQuantity,
        expiryDate: newExpiryDate ? newExpiryDate.toISOString() : null,
        status: 'ACTIVE',
        locationInWarehouse: newLocation || undefined,
        notes: newNotes || undefined
      };
      
      await onCreateBatch(newBatch);
      
      // Formular zurücksetzen und zu "Vorhandene Chargen" wechseln
      resetForm();
      setActiveTab('existing');
      
      // Batches neu laden, wenn onLoadBatches verfügbar ist
      if (onLoadBatches) {
        await loadBatches();
      }
    } catch (error) {
      console.error('Fehler beim Erstellen der Charge:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Formular zurücksetzen
  const resetForm = () => {
    setNewBatchNumber('');
    setNewQuantity(0);
    setNewExpiryDate(null);
    setNewLocation('');
    setNewNotes('');
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chargen verwalten</DialogTitle>
          {selectedItem && (
            <DialogDescription>
              Verwalten Sie die Chargen für das Produkt "{selectedItem.productName}"
            </DialogDescription>
          )}
        </DialogHeader>
        
        {selectedItem && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="existing">Vorhandene Chargen</TabsTrigger>
              <TabsTrigger value="new">Neue Charge</TabsTrigger>
            </TabsList>
            
            <TabsContent value="existing" className="mt-4">
              {batches.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chargennummer</TableHead>
                      <TableHead>Ablaufdatum</TableHead>
                      <TableHead className="text-right">Aktuell</TableHead>
                      <TableHead className="text-right">Gezählt</TableHead>
                      <TableHead className="text-center">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <div className="font-medium">{batch.batchNumber}</div>
                          {batch.locationInWarehouse && (
                            <div className="text-xs text-muted-foreground">
                              Lagerort: {batch.locationInWarehouse}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {batch.expiryDate ? (
                            <div className="flex items-center">
                              <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                              <span className={
                                new Date(batch.expiryDate) < new Date() 
                                  ? "text-red-500" 
                                  : ""
                              }>
                                {format(parseISO(batch.expiryDate), 'dd.MM.yyyy', { locale: de })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {batch.currentQuantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            value={batchCounts[batch.id] || 0}
                            onChange={(e) => handleQuantityChange(batch.id, parseInt(e.target.value) || 0)}
                            className="w-20 text-right inline-block"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleUpdateBatch(batch.id)}
                          >
                            Aktualisieren
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-4">
                      <PackageOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        Keine Chargen für dieses Produkt gefunden
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="new" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Neue Charge anlegen</CardTitle>
                  <CardDescription>
                    Erstellen Sie eine neue Charge für das Produkt
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="batchNumber">Chargennummer</Label>
                      <Input
                        id="batchNumber"
                        value={newBatchNumber}
                        onChange={(e) => setNewBatchNumber(e.target.value)}
                        placeholder="z.B. CH-2023-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Menge</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="0"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Ablaufdatum</Label>
                      <DatePicker
                        date={newExpiryDate}
                        setDate={setNewExpiryDate}
                        placeholder="Ablaufdatum auswählen"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Lagerort</Label>
                      <Input
                        id="location"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="z.B. Regal A1"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">Anmerkungen</Label>
                    <Textarea
                      id="notes"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Optionale Anmerkungen zur Charge"
                      rows={3}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('existing')}
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    onClick={handleCreateBatch}
                    disabled={!newBatchNumber || newQuantity <= 0 || loading}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Charge erstellen
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        )}
        
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">Schließen</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
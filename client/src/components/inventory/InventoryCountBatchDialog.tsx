import { useState, useEffect } from 'react';
import { format, parseISO, isValid, addDays } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Calendar, PackageOpen, Plus, 
  Save, Trash2, AlertTriangle, 
  Check, RefreshCw, ArrowRight,
  Loader2, X, Split
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';

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

// Interface für Inventurelement
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

// Props für den Dialog
interface InventoryCountBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: InventoryCountItemBatchView | null;
  availableBatches: ProductBatch[];
  onUpdateBatch?: (itemId: number, batchId: number, countedQuantity: number) => void;
  onCreateBatch?: (newBatch: Partial<ProductBatch>) => Promise<ProductBatch>;
  onLoadBatches?: (productId: number) => Promise<ProductBatch[]>;
}

// InventoryCountBatchDialog Komponente
export default function InventoryCountBatchDialog({
  open,
  onOpenChange,
  selectedItem,
  availableBatches = [],
  onUpdateBatch,
  onCreateBatch,
  onLoadBatches
}: InventoryCountBatchDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Zustandsvariablen für die UI
  const [currentBatches, setCurrentBatches] = useState<ProductBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [showNewBatchForm, setShowNewBatchForm] = useState(false);
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('existing');
  
  // Felder für neue Charge
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState<Date | null>(null);
  const [newBatchQuantity, setNewBatchQuantity] = useState<number | null>(null);
  const [newBatchLocation, setNewBatchLocation] = useState('');
  const [newBatchNotes, setNewBatchNotes] = useState('');
  
  // Felder für Charge-Aufteilung
  const [splitQuantity, setSplitQuantity] = useState<number | null>(null);
  const [splitTargetBatchId, setSplitTargetBatchId] = useState<number | null>(null);
  const [batchCountedQuantities, setBatchCountedQuantities] = useState<{[key: number]: number}>({});

  // Setze Batches, wenn Dialog geöffnet oder selectedItem ändert
  useEffect(() => {
    if (open && selectedItem) {
      setCurrentBatches(availableBatches || []);
      setSelectedBatchId(selectedItem.batchId || null);
      
      // Initialisiere gezählte Mengen für alle Batches
      const initialQuantities: {[key: number]: number} = {};
      availableBatches.forEach(batch => {
        initialQuantities[batch.id] = batch.currentQuantity;
      });
      setBatchCountedQuantities(initialQuantities);
      
      // Wenn keine Batches geladen wurden und ein Callback verfügbar ist, lade Batches
      if (availableBatches.length === 0 && onLoadBatches && selectedItem.productId) {
        loadBatches(selectedItem.productId);
      }
    } else {
      resetForm();
    }
  }, [open, selectedItem, availableBatches]);

  // Lade Batches für ein Produkt
  const loadBatches = async (productId: number) => {
    if (!onLoadBatches) return;
    
    setIsLoading(true);
    try {
      const batches = await onLoadBatches(productId);
      setCurrentBatches(batches);
      
      // Initialisiere gezählte Mengen für alle geladenen Batches
      const initialQuantities: {[key: number]: number} = {};
      batches.forEach(batch => {
        initialQuantities[batch.id] = batch.currentQuantity;
      });
      setBatchCountedQuantities(initialQuantities);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Batches:', error);
      setIsLoading(false);
      toast({
        title: 'Fehler beim Laden der Batches',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    }
  };

  // Handler: Batch-Menge ändern
  const handleBatchQuantityChange = (batchId: number, quantity: number) => {
    setBatchCountedQuantities(prev => ({
      ...prev,
      [batchId]: quantity
    }));
  };

  // Handler: Batch zuweisen
  const handleAssignBatch = () => {
    if (!selectedItem || !selectedItem.id || !selectedBatchId) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie eine Charge aus.',
        variant: 'destructive'
      });
      return;
    }
    
    const countedQuantity = batchCountedQuantities[selectedBatchId] || 0;
    
    if (onUpdateBatch) {
      onUpdateBatch(selectedItem.id, selectedBatchId, countedQuantity);
      onOpenChange(false);
    } else {
      // Direkter API-Aufruf als Fallback
      updateInventoryItemBatch(selectedItem.id, selectedBatchId, countedQuantity);
    }
  };

  // API-Aufruf: Batch für Inventurelement aktualisieren
  const updateInventoryItemBatch = async (itemId: number, batchId: number, countedQuantity: number) => {
    try {
      const response = await fetch(`/api/inventory-counts/items/${itemId}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchId,
          countedQuantity
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      toast({
        title: 'Charge zugewiesen',
        description: 'Die Charge wurde erfolgreich zugewiesen.',
      });
      
      // Schließe Dialog
      onOpenChange(false);
      
      return data;
    } catch (error) {
      console.error('Fehler beim Zuweisen der Charge:', error);
      toast({
        title: 'Fehler beim Zuweisen der Charge',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
      throw error;
    }
  };

  // Mutation: Neue Batch erstellen
  const createBatchMutation = useMutation({
    mutationFn: async (newBatch: Partial<ProductBatch>) => {
      if (onCreateBatch) {
        return await onCreateBatch(newBatch);
      }
      
      // Direkter API-Aufruf als Fallback
      const response = await fetch('/api/product-batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newBatch),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler ${response.status}: ${errorText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      // Cache aktualisieren
      queryClient.invalidateQueries({ queryKey: ['/api/product-batches'] });
      
      // Lokale Batch-Liste aktualisieren
      setCurrentBatches(prev => [...prev, data]);
      
      // Neue Batch auswählen
      setSelectedBatchId(data.id);
      
      // Batch-Mengen aktualisieren
      setBatchCountedQuantities(prev => ({
        ...prev,
        [data.id]: data.initialQuantity
      }));
      
      // Formular zurücksetzen
      resetNewBatchForm();
      
      // Benachrichtigung
      toast({
        title: 'Neue Charge erstellt',
        description: `Die Charge ${data.batchNumber} wurde erfolgreich erstellt.`,
      });
      
      // Zurück zum Tab für bestehende Batches
      setActiveTab('existing');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Erstellen der Charge',
        description: error.message || 'Die Charge konnte nicht erstellt werden.',
        variant: 'destructive'
      });
    }
  });

  // Handler: Neue Batch erstellen
  const handleCreateBatch = () => {
    if (!selectedItem || !selectedItem.productId) {
      toast({
        title: 'Fehler',
        description: 'Produkt-ID fehlt',
        variant: 'destructive'
      });
      return;
    }
    
    if (!newBatchNumber.trim()) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie eine Chargennummer ein',
        variant: 'destructive'
      });
      return;
    }
    
    if (!newExpiryDate) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie ein Ablaufdatum',
        variant: 'destructive'
      });
      return;
    }
    
    if (!newBatchQuantity || newBatchQuantity <= 0) {
      toast({
        title: 'Fehler',
        description: 'Bitte geben Sie eine gültige Menge ein',
        variant: 'destructive'
      });
      return;
    }
    
    // Neue Batch erstellen
    const newBatch: Partial<ProductBatch> = {
      productId: selectedItem.productId,
      warehouseId: currentBatches.length > 0 ? currentBatches[0].warehouseId : 0, // Warehouse-ID aus bestehenden Batches übernehmen
      batchNumber: newBatchNumber,
      expiryDate: newExpiryDate.toISOString().split('T')[0],
      initialQuantity: newBatchQuantity,
      currentQuantity: newBatchQuantity,
      status: 'active',
      locationInWarehouse: newBatchLocation,
      notes: newBatchNotes
    };
    
    createBatchMutation.mutate(newBatch);
  };

  // Formular für neue Batch zurücksetzen
  const resetNewBatchForm = () => {
    setShowNewBatchForm(false);
    setNewBatchNumber('');
    setNewExpiryDate(null);
    setNewBatchQuantity(null);
    setNewBatchLocation('');
    setNewBatchNotes('');
  };

  // Gesamtes Formular zurücksetzen
  const resetForm = () => {
    setSelectedBatchId(null);
    setShowNewBatchForm(false);
    setShowSplitForm(false);
    resetNewBatchForm();
    setSplitQuantity(null);
    setSplitTargetBatchId(null);
    setBatchCountedQuantities({});
  };

  // Formatiere Datum für die Anzeige
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Kein Datum';
    
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'dd.MM.yyyy') : 'Ungültiges Datum';
    } catch (error) {
      console.error('Fehler beim Parsen des Datums:', error);
      return 'Fehler beim Parsen';
    }
  };

  // Bestimme Status des Verfallsdatums
  const getExpiryStatus = (dateString: string | null | undefined) => {
    if (!dateString) return 'unknown';
    
    try {
      const today = new Date();
      const expiryDate = parseISO(dateString);
      
      if (!isValid(expiryDate)) return 'unknown';
      
      const twoWeeksFromNow = addDays(today, 14);
      
      if (expiryDate < today) return 'expired';
      if (expiryDate < twoWeeksFromNow) return 'expiring-soon';
      return 'valid';
    } catch (error) {
      console.error('Fehler beim Bestimmen des Ablaufstatus:', error);
      return 'unknown';
    }
  };

  // Render-Funktion für Verfallsdatum mit farbiger Markierung
  const renderExpiryDate = (dateString: string | null | undefined) => {
    const status = getExpiryStatus(dateString);
    const formattedDate = formatDate(dateString);
    
    switch (status) {
      case 'expired':
        return (
          <div className="flex items-center">
            <Badge variant="destructive" className="mr-2">Abgelaufen</Badge>
            {formattedDate}
          </div>
        );
      case 'expiring-soon':
        return (
          <div className="flex items-center">
            <Badge variant="warning" className="mr-2">Bald abgelaufen</Badge>
            {formattedDate}
          </div>
        );
      case 'valid':
        return (
          <div className="flex items-center">
            <Badge variant="success" className="mr-2">Gültig</Badge>
            {formattedDate}
          </div>
        );
      default:
        return formattedDate;
    }
  };

  // Wenn kein ausgewähltes Element vorhanden ist
  if (!selectedItem) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chargen-Informationen</DialogTitle>
            <DialogDescription>
              Kein Produkt ausgewählt. Bitte wählen Sie zuerst ein Produkt aus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <PackageOpen className="mr-2 h-5 w-5" />
            Chargen für {selectedItem.productName}
          </DialogTitle>
          <DialogDescription>
            Verwalten Sie die Chargen und MHD-Informationen für dieses Produkt.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="existing">Bestehende Chargen</TabsTrigger>
            <TabsTrigger value="new">Neue Charge</TabsTrigger>
          </TabsList>
          
          {/* Tab: Bestehende Chargen */}
          <TabsContent value="existing" className="space-y-4 py-2">
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : currentBatches.length === 0 ? (
              <div className="text-center py-8">
                <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Keine Chargen für dieses Produkt gefunden.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setActiveTab('new')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Charge erstellen
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableCaption>Verfügbare Chargen für {selectedItem.productName}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Charge</TableHead>
                      <TableHead>MHD</TableHead>
                      <TableHead className="text-right">Bestand</TableHead>
                      <TableHead className="text-right">Gezählt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentBatches.map((batch) => (
                      <TableRow 
                        key={batch.id} 
                        className={selectedBatchId === batch.id ? 'bg-muted' : undefined}
                      >
                        <TableCell>
                          <input 
                            type="radio" 
                            name="selectedBatch" 
                            checked={selectedBatchId === batch.id}
                            onChange={() => setSelectedBatchId(batch.id)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{batch.batchNumber}</span>
                            {batch.locationInWarehouse && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Lagerort: {batch.locationInWarehouse}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderExpiryDate(batch.expiryDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {batch.currentQuantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            value={batchCountedQuantities[batch.id] || 0}
                            onChange={(e) => handleBatchQuantityChange(batch.id, parseInt(e.target.value) || 0)}
                            className="w-20 inline-block text-right"
                            disabled={selectedBatchId !== batch.id}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </TabsContent>
          
          {/* Tab: Neue Charge */}
          <TabsContent value="new" className="space-y-4 py-2">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Chargennummer *</Label>
                  <Input 
                    id="batchNumber"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    placeholder="z.B. LOT12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">MHD *</Label>
                  <DatePicker 
                    date={newExpiryDate} 
                    setDate={setNewExpiryDate} 
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Menge *</Label>
                  <Input 
                    id="quantity"
                    type="number"
                    min="1"
                    value={newBatchQuantity || ''}
                    onChange={(e) => setNewBatchQuantity(parseInt(e.target.value) || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Lagerort</Label>
                  <Input 
                    id="location"
                    value={newBatchLocation}
                    onChange={(e) => setNewBatchLocation(e.target.value)}
                    placeholder="z.B. Regal A3"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Anmerkungen</Label>
                <Textarea 
                  id="notes"
                  value={newBatchNotes}
                  onChange={(e) => setNewBatchNotes(e.target.value)}
                  placeholder="Optionale Anmerkungen zur Charge"
                  rows={3}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          {activeTab === 'existing' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button 
                variant="default" 
                onClick={handleAssignBatch}
                disabled={selectedBatchId === null}
                className="ml-2"
              >
                <Check className="h-4 w-4 mr-2" />
                Charge zuweisen
              </Button>
            </>
          )}
          
          {activeTab === 'new' && (
            <>
              <Button variant="outline" onClick={() => setActiveTab('existing')}>
                Zurück
              </Button>
              <Button 
                variant="default" 
                onClick={handleCreateBatch}
                disabled={createBatchMutation.isPending}
                className="ml-2"
              >
                {createBatchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Charge erstellen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
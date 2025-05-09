import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ClipboardCheck, Search, FilterX, PackageOpen,
  Plus, Check, X, Loader2, Save, Trash, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import InventoryCountBatchDialog from '@/components/inventory/InventoryCountBatchDialog';

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

// Interface für die Inventur-Zählvorgänge
interface InventoryCountItem {
  id?: number;
  productId: number;
  productName: string;
  currentQuantity: number;
  countedQuantity: number;
  difference: number;
  sku?: string;
  location?: string;
  status?: string;
  
  // Batch-bezogene Informationen
  batchId?: number;
  batches?: ProductBatch[]; // Alle verfügbaren Batches für dieses Produkt
  batchCounts?: {[batchId: number]: number}; // Gezählte Mengen pro Batch
}

// Interface für die Inventur
interface InventoryCount {
  id: number;
  warehouseId: number;
  status: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  initiatedBy?: number;
  completedBy?: number;
  createdAt: string;
  updatedAt?: string;
  itemCount?: number;
  adjustmentCount?: number;
  items?: InventoryCountItem[];
}

// Props für die InventoryCountNew-Komponente
interface InventoryCountNewProps {
  warehouseId: number;
  onComplete?: () => void;
  onCancel?: () => void;
}

const InventoryCountNew = ({ warehouseId, onComplete, onCancel }: InventoryCountNewProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State für Inventuritems und Filter
  const [activeCount, setActiveCount] = useState<InventoryCount | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryCountItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStartForm, setShowStartForm] = useState(true);
  const [countNotes, setCountNotes] = useState('');
  const [confirmCompleteDialog, setConfirmCompleteDialog] = useState(false);
  const [confirmCancelDialog, setConfirmCancelDialog] = useState(false);
  
  // Batch-Dialog-Status
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<InventoryCountItem | null>(null);

  // Gefilterte Items basierend auf der Suche
  const filteredItems = inventoryItems.filter(item => 
    item.productName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Anzahl der Items mit Differenzen
  const itemsWithDifference = inventoryItems.filter(item => item.difference !== 0).length;

  // Beim Laden prüfen, ob eine aktive Inventur für dieses Lager vorhanden ist
  useEffect(() => {
    checkActiveInventoryCount();
  }, [warehouseId]);

  // Prüfe, ob eine aktive Inventur für dieses Lager existiert
  const checkActiveInventoryCount = async () => {
    try {
      const response = await fetch(`/api/inventory-counts/active?warehouseId=${warehouseId}`);
      if (!response.ok) {
        throw new Error('Fehler beim Abrufen der aktiven Inventur');
      }
      
      const data = await response.json();
      if (data && data.id) {
        console.log("Aktive Inventur gefunden:", data);
        setActiveCount(data);
        setShowStartForm(false);
        
        // Lade die zugehörigen Items, falls vorhanden
        if (data.items && data.items.length > 0) {
          setInventoryItems(data.items.map((item: any) => ({
            ...item,
            difference: item.countedQuantity - item.currentQuantity
          })));
        } else {
          // Initialisiere mit dem aktuellen Inventar, wenn keine Items vorhanden sind
          await initializeItemsFromInventory();
        }
      } else {
        console.log("Keine aktive Inventur gefunden");
        setActiveCount(null);
        setShowStartForm(true);
      }
    } catch (error) {
      console.error("Fehler beim Prüfen der aktiven Inventur:", error);
      toast({
        title: 'Fehler',
        description: 'Die aktive Inventur konnte nicht abgerufen werden.',
        variant: 'destructive'
      });
    }
  };

  // Handler: Inventur speichern
  const handleSaveItem = (item: InventoryCountItem) => {
    if (!activeCount || !activeCount.id) {
      console.error("Keine aktive Inventur vorhanden");
      return;
    }
    
    saveInventoryItemMutation.mutate({ 
      inventoryCountId: activeCount.id, 
      item 
    });
  };

  // Handler: Bestätigen, dass Inventur abgeschlossen werden soll
  const confirmCompleteInventory = () => {
    if (!activeCount || !activeCount.id) return;
    
    completeInventoryCountMutation.mutate(activeCount.id);
  };

  // Handler: Bestätigen, dass Inventur abgebrochen werden soll
  const confirmCancelInventory = () => {
    if (!activeCount || !activeCount.id) return;
    
    cancelInventoryCountMutation.mutate(activeCount.id);
  };

  // Initialisiere Items basierend auf aktuellem Lagerbestand
  const initializeItemsFromInventory = async () => {
    try {
      // Lade Lagerbestand
      const response = await fetch(`/api/warehouses/${warehouseId}/inventory`);
      if (!response.ok) {
        throw new Error('Fehler beim Abrufen des Lagerbestands');
      }
      
      const data = await response.json();
      if (data && Array.isArray(data)) {
        console.log("Lagerbestand geladen:", data);
        
        // Konvertiere API-Daten in InventoryCountItems
        const items: InventoryCountItem[] = data.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          currentQuantity: item.quantity || 0,
          countedQuantity: item.quantity || 0, // Initial gleich wie currentQuantity
          difference: 0,
          sku: item.sku,
          location: item.locationInWarehouse
        }));
        
        // Lade die Batches für jedes Produkt
        console.log("Lade Batches für alle Produkte...");
        
        for (const item of items) {
          try {
            const batchResponse = await fetch(`/api/inventory-batches/product/${item.productId}/warehouse/${warehouseId}`);
            
            if (batchResponse.ok) {
              const batches = await batchResponse.json();
              
              if (batches && batches.length > 0) {
                console.log(`${batches.length} Batches für Produkt ${item.productId} (${item.productName}) gefunden`);
                
                // Aktualisiere das Item mit den Batch-Informationen
                setInventoryItems(prevItems => 
                  prevItems.map(prevItem => 
                    prevItem.productId === item.productId 
                      ? { 
                          ...prevItem, 
                          batches: batches,
                          // Erstelle ein Objekt mit BatchID als Schlüssel und aktueller Menge als Wert
                          batchCounts: batches.reduce((acc, batch) => {
                            acc[batch.id] = batch.currentQuantity;
                            return acc;
                          }, {} as {[batchId: number]: number})
                        } 
                      : prevItem
                  )
                );
              } else {
                console.log(`Keine Batches für Produkt ${item.productId} gefunden.`);
              }
            }
          } catch (error) {
            console.error(`Fehler beim Laden der Batches für Produkt ${item.productId}:`, error);
          }
        }
        
        setInventoryItems(items);
        
        // Speichere die initialisierten Items in der Datenbank, wenn eine aktive Inventur existiert
        if (activeCount && activeCount.id) {
          const apiItems = items.map(item => ({
            productId: Number(item.productId),
            currentQuantity: Number(item.currentQuantity),
            countedQuantity: Number(item.countedQuantity),
            difference: 0
          }));
          
          try {
            await fetch(`/api/inventory-counts/${activeCount.id}/items`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: 'in_progress',
                items: apiItems
              }),
            });
            
            console.log("Initialisierte Items erfolgreich gespeichert");
          } catch (error) {
            console.error("Fehler beim Speichern der initialisierten Items:", error);
          }
        }
      } else {
        console.log('Inventory für Zählung ist leer oder kein Array');
        setInventoryItems([]);
      }
    } catch (error) {
      console.error("Fehler beim Initialisieren der Inventurelemente:", error);
      toast({
        title: 'Fehler',
        description: 'Der Lagerbestand konnte nicht geladen werden.',
        variant: 'destructive'
      });
      setInventoryItems([]);
    }
  };

  // Mutation: Neue Inventur erstellen
  const startInventoryCountMutation = useMutation({
    mutationFn: async () => {
      return await fetch('/api/inventory-counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId: warehouseId,
          notes: countNotes,
          status: 'in_progress'
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Starten der Inventur');
        return res.json();
      });
    },
    onSuccess: (data) => {
      console.log("Inventur erfolgreich gestartet:", data);
      // Invalidiere die Abfrage für Inventurlisten, damit neue Einträge sofort sichtbar sind
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });

      // Setze die neue Inventur als aktiv
      setActiveCount(data);

      // UI Zustand zurücksetzen
      setShowStartForm(false);

      // Initialisiere mit dem aktuellen Inventar
      initializeItemsFromInventory();

      toast({
        title: 'Inventur gestartet',
        description: 'Die Inventur wurde erfolgreich gestartet.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Starten der Inventur',
        description: error.message || 'Die Inventur konnte nicht gestartet werden.',
        variant: 'destructive'
      });
    }
  });

  // Mutation: Inventur-Element speichern
  const saveInventoryItemMutation = useMutation({
    mutationFn: async ({ inventoryCountId, item }: { inventoryCountId: number, item: InventoryCountItem }) => {
      // Erstelle das API-Item
      const apiItem = {
        productId: Number(item.productId),
        currentQuantity: Number(item.currentQuantity),
        countedQuantity: Number(item.countedQuantity),
        difference: Number(item.countedQuantity) - Number(item.currentQuantity)
      };

      return await fetch(`/api/inventory-counts/${inventoryCountId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'in_progress',
          items: [apiItem]
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Speichern des Inventurelements');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });

      toast({
        title: 'Element gespeichert',
        description: 'Das Element wurde erfolgreich gespeichert.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Speichern',
        description: error.message || 'Das Element konnte nicht gespeichert werden.',
        variant: 'destructive'
      });
    }
  });

  // Mutation: Inventur abschließen
  const completeInventoryCountMutation = useMutation({
    mutationFn: async (inventoryCountId: number) => {
      return await fetch(`/api/inventory-counts/${inventoryCountId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Abschließen der Inventur');
        return res.json();
      });
    },
    onSuccess: (data) => {
      console.log("Inventur erfolgreich abgeschlossen:", data);
      
      // Status aktualisieren
      setActiveCount(null);
      setShowStartForm(true);
      setInventoryItems([]);
      
      toast({
        title: 'Inventur abgeschlossen',
        description: 'Die Inventur wurde erfolgreich abgeschlossen. Die Lagerbestände wurden aktualisiert.',
      });
      
      // Callback für den Abschluss aufrufen
      if (onComplete) onComplete();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Abschließen der Inventur',
        description: error.message || 'Die Inventur konnte nicht abgeschlossen werden.',
        variant: 'destructive'
      });
      setConfirmCompleteDialog(false);
    }
  });

  // Mutation: Inventur abbrechen
  const cancelInventoryCountMutation = useMutation({
    mutationFn: async (inventoryCountId: number) => {
      return await fetch(`/api/inventory-counts/${inventoryCountId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Abbrechen der Inventur');
        return res.json();
      });
    },
    onSuccess: () => {
      console.log("Inventur erfolgreich abgebrochen");

      // Status aktualisieren
      setActiveCount(null);
      setShowStartForm(true);
      setInventoryItems([]);

      toast({
        title: 'Inventur abgebrochen',
        description: 'Die Inventur wurde abgebrochen.',
      });

      // Dialog schließen
      setConfirmCancelDialog(false);

      // Zustand zurücksetzen
      setActiveCount(null);
      setShowStartForm(true);

      // Callback für den Abbruch aufrufen
      if (onCancel) onCancel();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Abbrechen der Inventur',
        description: error.message || 'Die Inventur konnte nicht abgebrochen werden.',
        variant: 'destructive'
      });
      setConfirmCancelDialog(false);
    }
  });

  // Handler: Menge für einen Artikel ändern
  const handleQuantityChange = (productId: number, value: number) => {
    setInventoryItems(prevItems => 
      prevItems.map(item => 
        item.productId === productId 
          ? { 
              ...item, 
              countedQuantity: value,
              difference: value - item.currentQuantity
            } 
          : item
      )
    );
  };
  
  // Handler: Zeige Batches für ein Produkt an
  const handleShowBatches = (item: InventoryCountItem) => {
    setSelectedItemForBatch(item);
    setShowBatchDialog(true);
  };
  
  // Handler: Batch für ein Inventurelement aktualisieren
  const handleUpdateBatch = (itemId: number, batchId: number, countedQuantity: number) => {
    // Finde das betroffene Item
    const item = inventoryItems.find(item => item.id === itemId);
    if (!item) {
      console.error(`Item mit ID ${itemId} nicht gefunden`);
      return;
    }
    
    // Aktualisiere die gezählte Menge für den Batch
    const updatedBatchCounts = {
      ...(item.batchCounts || {}),
      [batchId]: countedQuantity
    };
    
    // Berechne die neue Gesamtmenge basierend auf den Batches
    const newTotalQuantity = Object.values(updatedBatchCounts).reduce((sum, qty) => sum + qty, 0);
    
    // Aktualisiere das Item
    setInventoryItems(prevItems => 
      prevItems.map(prevItem => 
        prevItem.productId === item.productId 
          ? { 
              ...prevItem, 
              batchId,
              batchCounts: updatedBatchCounts,
              countedQuantity: newTotalQuantity,
              difference: newTotalQuantity - prevItem.currentQuantity
            } 
          : prevItem
      )
    );
    
    // Speichere die Änderung in der Datenbank, wenn ein aktiver Count existiert
    if (activeCount && activeCount.id) {
      const updatedItem = {
        ...item,
        batchId,
        countedQuantity: newTotalQuantity,
        difference: newTotalQuantity - item.currentQuantity
      };
      
      handleSaveItem(updatedItem);
    }
    
    toast({
      title: 'Charge aktualisiert',
      description: `Die Charge wurde mit ${countedQuantity} Einheiten aktualisiert.`
    });
  };
  
  // Handler: Batch-Informationen für ein Produkt laden
  const handleLoadBatches = async (productId: number): Promise<ProductBatch[]> => {
    try {
      const response = await fetch(`/api/inventory-batches/product/${productId}/warehouse/${warehouseId}`);
      
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Batches: ${response.status}`);
      }
      
      const batches = await response.json();
      return batches;
    } catch (error) {
      console.error('Fehler beim Laden der Batches:', error);
      toast({
        title: 'Fehler beim Laden der Batches',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
      return [];
    }
  };
  
  // Handler: Neue Charge erstellen
  const handleCreateBatch = async (newBatch: Partial<ProductBatch>): Promise<ProductBatch> => {
    try {
      const response = await fetch('/api/inventory-batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newBatch),
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Erstellen der Charge: ${response.status}`);
      }
      
      const createdBatch = await response.json();
      
      // Aktualisiere das entsprechende Inventurelement mit der neuen Charge
      const productId = newBatch.productId as number;
      setInventoryItems(prevItems => 
        prevItems.map(item => {
          if (item.productId === productId) {
            const updatedBatches = [...(item.batches || []), createdBatch];
            const updatedBatchCounts = {
              ...(item.batchCounts || {}),
              [createdBatch.id]: createdBatch.initialQuantity
            };
            
            return {
              ...item,
              batches: updatedBatches,
              batchCounts: updatedBatchCounts
            };
          }
          return item;
        })
      );
      
      return createdBatch;
    } catch (error) {
      console.error('Fehler beim Erstellen der Charge:', error);
      toast({
        title: 'Fehler beim Erstellen der Charge',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      {showStartForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Neue Inventur starten</CardTitle>
            <CardDescription>
              Startet eine neue Inventurzählung für das Lager. Die aktuelle Lagermenge wird als Sollbestand verwendet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Anmerkungen zur Inventur</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Optional: Anmerkungen zur Inventur..."
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => setShowStartForm(false)}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={() => startInventoryCountMutation.mutate()}
              disabled={startInventoryCountMutation.isPending}
            >
              {startInventoryCountMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starte Inventur...
                </>
              ) : (
                <>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Inventur starten
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : activeCount ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Inventur #{activeCount.id}</h2>
              <p className="text-muted-foreground">
                {new Date(activeCount.createdAt).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
                {activeCount.notes && ` • ${activeCount.notes}`}
              </p>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => setConfirmCancelDialog(true)}
              >
                <X className="mr-2 h-4 w-4" />
                Abbrechen
              </Button>
              <Button
                onClick={() => setConfirmCompleteDialog(true)}
              >
                <Check className="mr-2 h-4 w-4" />
                Inventur abschließen
              </Button>
            </div>
          </div>

          <div className="mb-4 relative">
            <Input
              placeholder="Produkte durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery('')}
              >
                <FilterX className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Inventurtabelle */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>SKU/Artikelnummer</TableHead>
                  <TableHead className="text-right">Soll</TableHead>
                  <TableHead className="text-right">Ist</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                  <TableHead className="text-center">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item, index) => (
                    <TableRow key={`${item.productId}-${index}`}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell>{item.sku || "-"}</TableCell>
                      <TableCell className="text-right">{item.currentQuantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          value={item.countedQuantity}
                          onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 0)}
                          className="w-24 text-right inline-block"
                        />
                      </TableCell>
                      <TableCell className={`text-right ${
                        item.difference !== 0 
                          ? (item.difference > 0 ? 'text-green-600' : 'text-red-600') 
                          : ''
                      }`}>
                        {item.difference > 0 ? '+' : ''}{item.difference}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSaveItem(item)}
                            disabled={saveInventoryItemMutation.isPending}
                            title="Artikel speichern"
                          >
                            {saveInventoryItemMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          
                          {item.batches && item.batches.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleShowBatches(item)}
                              className="ml-1 flex items-center"
                              title="Chargen anzeigen und bearbeiten"
                            >
                              <PackageOpen className="h-4 w-4 mr-1" />
                              <span className="text-xs">
                                Chargen ({item.batches.length})
                              </span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <div className="text-muted-foreground">Keine Produkte gefunden</div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Bestätigungsdialog für Abschließen */}
          <AlertDialog open={confirmCompleteDialog} onOpenChange={setConfirmCompleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Inventur abschließen</AlertDialogTitle>
                <AlertDialogDescription>
                  Möchten Sie die Inventur wirklich abschließen? 
                  Die Lagerbestände werden entsprechend der gezählten Mengen angepasst.
                  {itemsWithDifference > 0 && (
                    <>
                      <br /><br />
                      <span className="font-semibold">
                        {itemsWithDifference} Produkte haben Abweichungen.
                      </span>
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCompleteInventory}>
                  Inventur abschließen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bestätigungsdialog für Abbrechen */}
          <AlertDialog open={confirmCancelDialog} onOpenChange={setConfirmCancelDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Inventur abbrechen</AlertDialogTitle>
                <AlertDialogDescription>
                  Möchten Sie die laufende Inventur wirklich abbrechen? 
                  Alle nicht gespeicherten Änderungen gehen verloren.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zurück</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmCancelInventory}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Inventur abbrechen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {/* Batch-Dialog */}
          <InventoryCountBatchDialog 
            open={showBatchDialog}
            onOpenChange={setShowBatchDialog}
            selectedItem={selectedItemForBatch ? {
              id: selectedItemForBatch.id,
              productId: selectedItemForBatch.productId,
              productName: selectedItemForBatch.productName,
              expectedQuantity: selectedItemForBatch.currentQuantity,
              countedQuantity: selectedItemForBatch.countedQuantity,
              batchId: selectedItemForBatch.batchId,
            } : null}
            availableBatches={selectedItemForBatch?.batches || []}
            onUpdateBatch={handleUpdateBatch}
            onCreateBatch={handleCreateBatch}
            onLoadBatches={handleLoadBatches}
          />
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
              <h3 className="text-lg font-medium mb-2">Keine aktive Inventur</h3>
              <p className="text-muted-foreground mb-6">
                Es gibt derzeit keine aktive Inventurzählung für dieses Lager.
              </p>
              <Button
                onClick={() => setShowStartForm(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Neue Inventur starten
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InventoryCountNew;
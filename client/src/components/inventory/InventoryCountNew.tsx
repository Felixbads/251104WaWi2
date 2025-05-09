
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

// Komponente für die Inventur-Zählung in einem Lager
const InventoryCountNew = ({
  warehouseId,
  inventory = [],
  onComplete,
  onCancel,
  inventoryId
}: {
  warehouseId: number;
  inventory: any[];
  onComplete?: () => void;
  onCancel?: () => void;
  inventoryId?: string | null;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Zustandsvariablen
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryItems, setInventoryItems] = useState<InventoryCountItem[]>([]);
  const [activeCount, setActiveCount] = useState<InventoryCount | null>(null);
  const [confirmCompleteDialog, setConfirmCompleteDialog] = useState(false);
  const [confirmCancelDialog, setConfirmCancelDialog] = useState(false);
  const [showStartForm, setShowStartForm] = useState(false);
  const [countNotes, setCountNotes] = useState('');
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<InventoryCountItem | null>(null);

  // Interne Zustände für manuellen Abruf der Inventur
  const [specificInventoryCount, setSpecificInventoryCount] = useState<InventoryCount | null>(null);
  const [specificInventoryLoading, setSpecificInventoryLoading] = useState<boolean>(false);

  // Manueller Abruf der spezifischen Inventurzählung, wenn inventoryId vorhanden ist
  useEffect(() => {
    if (inventoryId) {
      setSpecificInventoryLoading(true);

      // Direkter Abruf der spezifischen Inventurzählung
      fetch(`/api/inventory-counts/${inventoryId}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP Fehler: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          console.log("Spezifische Inventurzählung geladen:", data);
          setSpecificInventoryCount(data as InventoryCount);

          // Wenn Items-Endpoint verfügbar ist, Elemente abrufen
          return fetch(`/api/inventory-counts/${inventoryId}/items`);
        })
        .then(res => {
          if (!res.ok) {
            console.log("Keine Items gefunden für Inventur:", inventoryId);
            return null;
          }
          return res.json();
        })
        .then(items => {
          if (items && Array.isArray(items)) {
            console.log("Inventurelemente geladen:", items);
            // Aktualisiere die Inventurzählung mit den geladenen Elementen
            setSpecificInventoryCount(prev => prev ? {...prev, items} : null);
          }
          setSpecificInventoryLoading(false);
        })
        .catch(error => {
          console.error("Fehler beim Laden der Inventurzählung:", error);
          setSpecificInventoryLoading(false);
          toast({
            title: 'Fehler beim Laden der Inventurzählung',
            description: error.message || 'Die Inventurzählung konnte nicht geladen werden.',
            variant: 'destructive'
          });
        });
    }
  }, [inventoryId]);

  // Abfrage der aktiven Inventuren für dieses Lager, wenn keine spezifische ID angegeben ist
  const {
    data: inventoryCounts = [],
    isLoading: countsLoading,
    refetch: refetchCounts
  } = useQuery({
    queryKey: ['/api/inventory-counts', { 
      warehouseId: warehouseId,
      status: 'in_progress' 
    }],
    enabled: !inventoryId, // Nur abfragen, wenn keine spezifische ID angegeben ist
    staleTime: 30000, // 30 Sekunden Caching
  });

  // Verarbeitung der spezifischen Inventur, wenn inventoryId vorhanden ist
  useEffect(() => {
    if (specificInventoryCount) {
      console.log('Spezifische Inventur geladen:', specificInventoryCount);
      setActiveCount(specificInventoryCount);

      // Wenn die Inventur bereits Elemente hat, verwende diese
      if (specificInventoryCount.items && specificInventoryCount.items.length > 0) {
        setInventoryItems(specificInventoryCount.items);
      } else {
        // Ansonsten initialisiere mit dem aktuellen Inventar
        initializeItemsFromInventory();
      }

      // Setze Notizen aus der geladenen Inventur
      if (specificInventoryCount.notes) {
        setCountNotes(specificInventoryCount.notes);
      }

      // Formularansicht ausblenden, da wir eine vorhandene Inventur anzeigen
      setShowStartForm(false);
    }
  }, [specificInventoryCount]);

  // Initialisierung - Prüfe auf aktive Inventuren (wenn keine spezifische ID angegeben ist)
  useEffect(() => {
    if (!inventoryId) { // Nur ausführen, wenn keine spezifische ID übergeben wurde
      if (Array.isArray(inventoryCounts) && inventoryCounts.length > 0) {
        // Setze die erste aktive Inventur als aktuell aktiv
        setActiveCount(inventoryCounts[0]);
        console.log('Aktive Inventur gefunden:', inventoryCounts[0]);

        // Wenn die Inventur bereits Elemente hat, verwende diese
        if (inventoryCounts[0].items && inventoryCounts[0].items.length > 0) {
          setInventoryItems(inventoryCounts[0].items);
        } else {
          // Ansonsten initialisiere mit dem aktuellen Inventar
          initializeItemsFromInventory();
        }
      } else {
        // Es gibt keine aktive Inventur
        setActiveCount(null);
        // In diesem Fall können wir die Formularansicht anzeigen
        setShowStartForm(true);
      }
    }
  }, [inventoryCounts, warehouseId, inventoryId]);

  // Initialisierung der Inventurzählung mit aktuellen Bestandsdaten
  const initializeItemsFromInventory = async () => {
    if (Array.isArray(inventory) && inventory.length > 0) {
      console.log('Initialisiere Inventur mit', inventory.length, 'Produkten');
      
      // Erstelle initiale Liste aus Inventardaten
      const initialItems = inventory.map(item => ({
        productId: typeof item.productId === 'string' ? Number(item.productId) : item.productId,
        productName: item.productName || 'Unbekannt',
        currentQuantity: item.quantity || 0,
        countedQuantity: item.quantity || 0, // Standardmäßig aktueller Bestand
        difference: 0,
        sku: item.sku || '',
        location: item.locationInWarehouse || '',
        batches: [],               // Wird später gefüllt
        batchCounts: {}            // Wird später gefüllt
      }));
      
      setInventoryItems(initialItems);
      
      // Lade Batch-Informationen für jedes Produkt
      for (const item of initialItems) {
        try {
          // Hole Batches für dieses Produkt im aktuellen Lager
          const response = await fetch(`/api/products/${item.productId}/batches?warehouseId=${warehouseId}`);
          
          if (!response.ok) {
            console.error(`Fehler beim Laden der Batches für Produkt ${item.productId}: ${response.status}`);
            continue;
          }
          
          const batches = await response.json();
          
          if (Array.isArray(batches) && batches.length > 0) {
            console.log(`${batches.length} Batches für Produkt ${item.productId} gefunden:`, batches);
            
            // Aktualisiere das Item mit Batch-Informationen
            setInventoryItems(prev => 
              prev.map(prevItem => 
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
        } catch (error) {
          console.error(`Fehler beim Laden der Batches für Produkt ${item.productId}:`, error);
        }
      }
      
    } else {
      console.log('Inventory für Zählung ist leer oder kein Array');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });

      toast({
        title: 'Inventur abgeschlossen',
        description: 'Die Inventur wurde erfolgreich abgeschlossen und die Bestände aktualisiert.',
      });

      // Dialog schließen
      setConfirmCompleteDialog(false);

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
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });

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

  // Handler: Starte neue Inventur
  const handleStartInventory = () => {
    startInventoryCountMutation.mutate();
  };

  // Handler: Abbrechen der Formularanzeige
  const handleCancelForm = () => {
    setShowStartForm(false);
    if (onCancel) onCancel();
  };

  // Handler: Update der gezählten Menge
  const handleQuantityChange = (productId: number, value: number) => {
    setInventoryItems(prev => 
      prev.map(item => 
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

  // Handler: Speichern eines Inventurelements
  const handleSaveItem = (item: InventoryCountItem) => {
    if (!activeCount) {
      toast({
        title: 'Fehler',
        description: 'Keine aktive Inventur verfügbar.',
        variant: 'destructive'
      });
      return;
    }

    saveInventoryItemMutation.mutate({ 
      inventoryCountId: activeCount.id, 
      item 
    });
  };

  // Handler: Inventur abschließen Dialog öffnen
  const handleCompleteInventory = () => {
    if (!activeCount) return;
    setConfirmCompleteDialog(true);
  };

  // Handler: Inventur tatsächlich abschließen
  const confirmCompleteInventory = () => {
    if (!activeCount) return;
    completeInventoryCountMutation.mutate(activeCount.id);
  };

  // Handler: Inventur abbrechen Dialog öffnen
  const handleCancelInventory = () => {
    if (!activeCount) return;
    setConfirmCancelDialog(true);
  };

  // Handler: Inventur tatsächlich abbrechen
  const confirmCancelInventory = () => {
    if (!activeCount) return;
    cancelInventoryCountMutation.mutate(activeCount.id);
  };

  // Filtere Inventurelemente basierend auf Suchbegriff
  const filteredItems = inventoryItems.filter(item => {
    if (!searchQuery.trim()) return true;

    const lowerCaseQuery = searchQuery.toLowerCase();
    return (
      item.productName.toLowerCase().includes(lowerCaseQuery) ||
      (item.sku && item.sku.toLowerCase().includes(lowerCaseQuery)) ||
      (item.location && item.location.toLowerCase().includes(lowerCaseQuery))
    );
  });

  // Berechnen der Statistiken
  const totalItems = inventoryItems.length;
  const itemsWithDifference = inventoryItems.filter(item => item.difference !== 0).length;
  const differencePercentage = totalItems > 0 ? (itemsWithDifference / totalItems) * 100 : 0;

  // Wenn Daten geladen werden
  if (countsLoading || specificInventoryLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Rendering des Formulars für eine neue Inventur
  if (showStartForm && !activeCount) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Neue Inventurzählung starten</CardTitle>
          <CardDescription>
            Starten Sie eine neue Inventurzählung, um den aktuellen Lagerbestand zu erfassen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Anmerkungen zur Inventur</Label>
              <Textarea 
                id="notes" 
                value={countNotes}
                onChange={(e) => setCountNotes(e.target.value)}
                placeholder="Optionale Anmerkungen zur Inventur"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleCancelForm}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleStartInventory}
            disabled={startInventoryCountMutation.isPending}
          >
            {startInventoryCountMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Inventur starten
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Aktive Inventurzählung anzeigen
  return (
    <div>
      {activeCount && (
        <>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-medium mb-1">Laufende Inventurzählung</h3>
              <p className="text-sm text-muted-foreground">
                Erfassen Sie die tatsächlichen Mengen für jeden Artikel im Lager
              </p>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <Badge variant="outline" className="bg-slate-100">
                  Gestartet: {new Date(activeCount.createdAt).toLocaleDateString()}
                </Badge>
                <Badge variant="outline" className="bg-slate-100">
                  Produkte: {totalItems}
                </Badge>
                <Badge variant={differencePercentage > 0 ? 'default' : 'outline'} className={
                  differencePercentage > 30 ? "bg-red-100 text-red-800" : 
                  differencePercentage > 10 ? "bg-amber-100 text-amber-800" : 
                  "bg-emerald-100 text-emerald-800"
                }>
                  Abweichungen: {itemsWithDifference} ({Math.round(differencePercentage)}%)
                </Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={handleCancelInventory}
              >
                <Trash className="mr-2 h-4 w-4" />
                Abbrechen
              </Button>

              <Button
                onClick={handleCompleteInventory}
                disabled={completeInventoryCountMutation.isPending}
              >
                {completeInventoryCountMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Inventur abschließen
              </Button>
            </div>
          </div>

          {/* Suchleiste */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Produkt suchen..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
        </>
      )}

      {!activeCount && !showStartForm && (
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
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useSimpleInventory } from '@/hooks/useSimpleInventory';
import { SimpleInventoryActions } from '@/components/inventory/SimpleInventoryActions';
import InventoryCountBatchDialog from '@/components/inventory/batch/InventoryCountBatchDialog';
import { generateBatchNumber, getDefaultExpiryDate, createAndLinkBatch } from '@/components/inventory/batch/CreateAndLinkBatchHandler';
import {
  ArrowLeft, Search, TrendingUp, TrendingDown, Equal, Plus, Package, Calendar, ChevronDown, ChevronUp
} from 'lucide-react';

// UI-Komponenten
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

// Erweiterte Typ-Definitionen mit MHD und Gebinde-Support
interface SimpleInventoryCount {
  id: number;
  warehouseId: number;
  status: string;
  warehouseName?: string;
  warehouse?: { id: number; name: string; };
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity?: number;
  currentQuantity: number;
  expiryDate: string | null;
  manufacturingDate?: string | null;
  receivedDate?: string | null;
  notes?: string | null;
  productName?: string;
  status?: string;
  locationInWarehouse?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface SimpleInventoryItem {
  id: number;
  inventoryCountId: number;
  productId: number;
  expectedQuantity: number;
  countedQuantity?: number | null;
  notes?: string;
  batchId?: number | null;
  batch?: ProductBatch | null;
  product?: {
    id: number;
    productName: string;
    sku?: string;
    category?: string;
    units?: string;
    // Package/Container fields für Gebinde
    packageQuantity?: number;
    packageSize?: string;
    packagingQuantity?: number;
    packagingUnit?: string;
    baseUnitName?: string;
  };
}

interface SimpleInventurDetailPageProps {
  params: {
    id: string;
  };
}

const SimpleInventurDetailPage: React.FC<SimpleInventurDetailPageProps> = ({ params }) => {
  const inventoryId = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local state für erweiterte Funktionen
  const [editedCounts, setEditedCounts] = useState<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SimpleInventoryItem | null>(null);
  
  // Neue State-Variablen für Gebinde-Eingabe
  const [packageCounts, setPackageCounts] = useState<Record<number, number>>({});
  const [individualCounts, setIndividualCounts] = useState<Record<number, number>>({});
  
  // Vereinfachter Inventur-Hook
  const { inventoryActionMutation, updateItemMutation, isLoading } = useSimpleInventory(inventoryId);

  // Lade Inventur-Daten
  const { data: inventurData, isLoading: inventurLoading, error: inventurError } = useQuery<SimpleInventoryCount>({
    queryKey: [`/api/inventory-counts/${inventoryId}`],
    enabled: !!inventoryId,
  });

  // Lade Inventur-Items
  const { data: inventurItems, isLoading: itemsLoading, error: itemsError } = useQuery<SimpleInventoryItem[]>({
    queryKey: [`/api/inventory-counts/${inventoryId}/items`],
    enabled: !!inventoryId,
  });

  // Lade verfügbare Batches für jedes Produkt
  const { data: availableBatches } = useQuery<ProductBatch[]>({
    queryKey: [`/api/inventory-count-batches/warehouse/${inventurData?.warehouseId}/products`],
    enabled: !!inventurData?.warehouseId,
  });

  // Handler für Batch-Erstellung mit sofortigen UI-Updates
  const handleBatchCreated = (batch: ProductBatch) => {
    console.log('[BATCH-CREATED] Neue Batch erstellt:', batch);
    
    // Auto-expand das Item nach Batch-Erstellung für sofortige Sichtbarkeit
    if (selectedItem) {
      setExpandedItems(prev => new Set(prev).add(selectedItem.id));
      console.log('[BATCH-CREATED] Item expandiert:', selectedItem.id);
    }
    
    // Query invalidieren für Live-Update der availableBatches
    queryClient.invalidateQueries({ 
      queryKey: [`/api/inventory-count-batches/warehouse/${inventurData?.warehouseId}/products`]
    });
    
    // Optional: Auch die Inventur-Items-Query invalidieren für vollständige Konsistenz
    queryClient.invalidateQueries({ 
      queryKey: [`/api/inventory-counts/${inventoryId}/items`]
    });
    
    toast({
      title: "MHD-Batch erstellt",
      description: `Neue Charge ${batch.batchNumber} wurde erfolgreich angelegt`,
    });
    
    // Dialog schließen
    setShowBatchDialog(false);
    setSelectedItem(null);
  };

  // Handle inventory actions
  const handleInventoryAction = (action: 'start' | 'save' | 'complete', notes?: string) => {
    inventoryActionMutation.mutate({ action, notes });
  };

  // Handle quantity changes
  const handleQuantityChange = (itemId: number, value: string) => {
    const quantity = value === '' ? 0 : parseInt(value) || 0;
    setEditedCounts(prev => ({
      ...prev,
      [itemId]: quantity
    }));
    
    // Auto-update nach kurzer Verzögerung
    setTimeout(() => {
      updateItemMutation.mutate({
        itemId,
        countedQuantity: quantity
      });
    }, 500);
  };

  // Hilfsfunktionen für Gebinde und MHD
  const parsePackageSize = (product: SimpleInventoryItem['product']): number => {
    if (!product) return 1;
    
    // Priorität 1: Gebindegröße aus Einkaufsbedingungen (packageQuantity)
    if (product.packageQuantity && typeof product.packageQuantity === 'number' && product.packageQuantity > 0) {
      return product.packageQuantity;
    }
    
    // Priorität 2: Gebindegröße aus Einkaufsbedingungen (packagingQuantity - Legacy)
    if (product.packagingQuantity && typeof product.packagingQuantity === 'number' && product.packagingQuantity > 0) {
      return product.packagingQuantity;
    }
    
    // Priorität 3: Legacy packageSize Feld parsen (z.B. "6x0,5L", "24x330ml")
    if (product.packageSize && typeof product.packageSize === 'string') {
      const match = product.packageSize.match(/^(\d+)x/i);
      if (match) {
        const size = parseInt(match[1]);
        if (size > 0) return size;
      }
    }
    
    // Fallback: Einzelstück
    return 1;
  };

  // Funktion zur Berechnung der Gesamtmenge basierend auf Gebinden und Einzelartikeln
  const calculateTotalQuantity = (itemId: number, product?: SimpleInventoryItem['product']) => {
    const packageCount = packageCounts[itemId] || 0;
    const individualCount = individualCounts[itemId] || 0;
    const packageSize = parsePackageSize(product);
    
    const totalFromPackages = packageCount * packageSize;
    const total = totalFromPackages + individualCount;
    
    return {
      totalFromPackages,
      individualCount,
      total
    };
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return 'Kein Datum';
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(date));
  };

  // Hilfsfunktion um abgelaufene Chargen zu identifizieren
  const isBatchExpired = (expiryDate?: string | null): boolean => {
    if (!expiryDate) return false;
    const today = new Date();
    const expiry = new Date(expiryDate);
    return expiry < today;
  };

  // Sortiere Chargen: aktive zuerst, dann abgelaufene
  const sortBatches = (batches: ProductBatch[]): ProductBatch[] => {
    return [...batches].sort((a, b) => {
      const aExpired = isBatchExpired(a.expiryDate);
      const bExpired = isBatchExpired(b.expiryDate);
      
      // Aktive Chargen zuerst
      if (aExpired && !bExpired) return 1;
      if (!aExpired && bExpired) return -1;
      
      // Innerhalb der gleichen Kategorie (aktiv/abgelaufen) nach Ablaufdatum sortieren
      if (a.expiryDate && b.expiryDate) {
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      }
      
      return 0;
    });
  };

  // Toggle für erweiterte Item-Details
  const toggleItemExpansion = (itemId: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // MHD-Batch Dialog Handler
  const handleCreateBatch = (item: SimpleInventoryItem) => {
    setSelectedItem(item);
    setShowBatchDialog(true);
  };





  // Filter items based on search
  const filteredItems = React.useMemo(() => {
    if (!inventurItems || !Array.isArray(inventurItems)) return [];
    
    return inventurItems.filter((item: SimpleInventoryItem) => {
      if (!searchTerm) return true;
      const productName = item.product?.productName || '';
      const sku = item.product?.sku || '';
      return productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             sku.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [inventurItems, searchTerm]);

  // Berechne Statistiken
  const itemStats = React.useMemo(() => {
    if (!filteredItems.length) return { total: 0, counted: 0, progress: 0 };
    
    const total = filteredItems.length;
    const counted = filteredItems.filter((item: SimpleInventoryItem) => 
      item.countedQuantity !== null && item.countedQuantity !== undefined
    ).length;
    
    return {
      total,
      counted,
      progress: total > 0 ? (counted / total) * 100 : 0
    };
  }, [filteredItems]);

  if (inventurLoading || itemsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (inventurError || itemsError) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-semibold mb-2">Fehler beim Laden</h2>
          <p>Die Inventur-Daten konnten nicht geladen werden.</p>
          <Button 
            onClick={() => setLocation('/inventur')} 
            className="mt-4"
            variant="outline"
          >
            Zurück zur Übersicht
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/inventur')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              Inventur #{inventoryId}
            </h1>
            <p className="text-muted-foreground">
              {inventurData?.warehouseName || 'Unbekanntes Lager'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Badge variant={inventurData?.status === 'completed' ? 'default' : 'secondary'}>
            {(inventurData?.status === 'pending' || inventurData?.status === 'open') && 'Geplant'}
            {inventurData?.status === 'in_progress' && 'Läuft'}
            {inventurData?.status === 'completed' && 'Abgeschlossen'}
          </Badge>

        </div>
      </div>

      {/* Actions */}
      <SimpleInventoryActions
        inventoryId={inventoryId}
        status={inventurData?.status || 'pending'}
        onAction={handleInventoryAction}
        isLoading={isLoading}
      />

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Fortschritt</CardTitle>
          <CardDescription>
            {itemStats.counted} von {itemStats.total} Produkten gezählt
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={itemStats.progress} className="w-full" />
          <p className="text-sm text-muted-foreground mt-2">
            {itemStats.progress.toFixed(1)}% abgeschlossen
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Produkte suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produkte</CardTitle>
          <CardDescription>
            {filteredItems.length} Produkte in dieser Inventur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt & Gebinde</TableHead>
                  <TableHead className="text-right">Erwartet</TableHead>
                  <TableHead className="text-right">Gezählt</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                  <TableHead className="text-center">MHD/Chargen</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item: SimpleInventoryItem) => {
                  const currentCount = editedCounts[item.id] ?? item.countedQuantity ?? '';
                  const expectedQty = item.expectedQuantity || 0;
                  const countedQty = typeof currentCount === 'number' ? currentCount : 0;
                  const difference = countedQty - expectedQty;
                  const packageSize = parsePackageSize(item.product);
                  const isExpanded = expandedItems.has(item.id);
                  
                  // Filtere verfügbare Batches für dieses Produkt
                  const productBatches = availableBatches?.filter(batch => 
                    batch.productId === item.productId
                  ) || [];
                  
                  return (
                    <React.Fragment key={`fragment-${item.id}-${item.productId}`}>
                      <TableRow key={`row-${item.id}`}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleItemExpansion(item.id)}
                              className="h-6 w-6 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <div>
                              <div className="font-medium">
                                {item.product?.productName || 'Unbekanntes Produkt'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {item.product?.sku && `SKU: ${item.product.sku}`}
                                {packageSize > 1 && (
                                  <span className="ml-2 inline-flex items-center">
                                    <Package className="h-3 w-3 mr-1" />
                                    {packageSize} {item.product?.packagingUnit || 'Stück'}/Gebinde
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>
                            <div className="font-medium">{expectedQty}</div>
                            {packageSize > 1 && (
                              <div className="text-xs text-muted-foreground">
                                ≈ {Math.ceil(expectedQty / packageSize)} Gebinde
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end space-y-2">
                            {inventurData?.status === 'pending' || inventurData?.status === 'in_progress' || inventurData?.status === 'open' ? (
                              packageSize > 1 ? (
                                <div className="space-y-3 w-full max-w-[250px]">
                                  {/* Kompakte Grid-Layout für nebeneinander liegende Eingaben */}
                                  <div className="grid grid-cols-2 gap-2">
                                    {/* Gebinde-Eingabe */}
                                    <div className="space-y-1 p-2 bg-blue-50 rounded border">
                                      <div className="text-xs font-medium text-blue-800">
                                        Gebinde ({packageSize} Stk./Gebinde)
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <Input
                                          type="number" 
                                          min="0"
                                          placeholder="0"
                                          value={packageCounts[item.id] ?? ''}
                                          onChange={(e) => {
                                            const count = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                                            setPackageCounts({ ...packageCounts, [item.id]: count });
                                            
                                            // Automatische Berechnung der Gesamtmenge
                                            const calculation = calculateTotalQuantity(item.id, item.product);
                                            calculation.total = count * packageSize + (individualCounts[item.id] || 0);
                                            setEditedCounts({ ...editedCounts, [item.id]: calculation.total });
                                          }}
                                          className="w-16 text-center text-sm"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                          = {(packageCounts[item.id] || 0) * packageSize} Stk.
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Einzelartikel-Eingabe */}
                                    <div className="space-y-1 p-2 bg-green-50 rounded border">
                                      <div className="text-xs font-medium text-green-800">
                                        Zusätzliche Einzelartikel
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <Input
                                          type="number" 
                                          min="0"
                                          placeholder="0"
                                          value={individualCounts[item.id] ?? ''}
                                          onChange={(e) => {
                                            const count = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                                            setIndividualCounts({ ...individualCounts, [item.id]: count });
                                            
                                            // Automatische Berechnung der Gesamtmenge
                                            const calculation = calculateTotalQuantity(item.id, item.product);
                                            calculation.total = (packageCounts[item.id] || 0) * packageSize + count;
                                            setEditedCounts({ ...editedCounts, [item.id]: calculation.total });
                                          }}
                                          className="w-16 text-center text-sm"
                                        />
                                        <span className="text-xs text-muted-foreground">Stk.</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Kompakte Gesamtmenge */}
                                  <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded border">
                                    <span className="text-xs text-gray-600">Gesamt:</span>
                                    <Input
                                      type="number" 
                                      min="0"
                                      value={editedCounts[item.id] !== undefined ? editedCounts[item.id] : countedQty ?? ''}
                                      onChange={(e) => {
                                        const count = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                                        setEditedCounts({ ...editedCounts, [item.id]: count });
                                      }}
                                      onBlur={() => {
                                        if (editedCounts[item.id] !== undefined) {
                                          handleQuantityChange(item.id, editedCounts[item.id].toString());
                                        }
                                      }}
                                      className="w-20 text-center font-bold text-sm"
                                    />
                                    <span className="text-xs text-gray-600">{item.product?.units || 'Stk.'}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-gray-600">Anzahl</span>
                                  <Input
                                    type="number"
                                    value={currentCount.toString()}
                                    onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                    className="w-20 text-center"
                                    min="0"
                                    placeholder="0"
                                  />
                                </div>
                              )
                            ) : (
                              <div className="text-center">
                                <span className="text-sm font-medium">{countedQty ?? 'Nicht gezählt'}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`flex items-center justify-end space-x-1 ${
                            difference > 0 ? 'text-green-600' : 
                            difference < 0 ? 'text-red-600' : 
                            'text-gray-600'
                          }`}>
                            {difference > 0 && <TrendingUp className="h-4 w-4" />}
                            {difference < 0 && <TrendingDown className="h-4 w-4" />}
                            {difference === 0 && <Equal className="h-4 w-4" />}
                            <span>{difference > 0 ? '+' : ''}{difference}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center space-y-1">
                            <Badge variant="outline" className="text-xs">
                              {productBatches?.length || 0} MHD-Einträge
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCreateBatch(item)}
                              className="h-6 text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              MHD
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {currentCount !== null && currentCount !== 0 ? (
                            <Badge variant="default" className="text-xs">
                              Gezählt
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Offen
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                      
                      {/* Erweiterte MHD-Details */}
                      {isExpanded && (
                        <TableRow key={`expanded-${item.id}`} className="bg-muted/50">
                          <TableCell colSpan={7}>
                            <div className="p-4 space-y-3">
                              <h4 className="font-medium flex items-center">
                                <Calendar className="h-4 w-4 mr-2" />
                                MHD-Chargen für {item.product?.productName}
                              </h4>
                              
                              {productBatches && productBatches.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {sortBatches(productBatches).map((batch) => {
                                    const isExpired = isBatchExpired(batch.expiryDate);
                                    return (
                                      <div 
                                        key={batch.id} 
                                        className={`border rounded-lg p-3 transition-opacity ${
                                          isExpired 
                                            ? 'bg-gray-50 opacity-50 border-gray-200' 
                                            : 'bg-white border-gray-300'
                                        }`}
                                      >
                                        <div className="flex justify-between items-start mb-2">
                                          <span className={`font-mono text-sm font-medium ${
                                            isExpired ? 'text-gray-400' : 'text-gray-900'
                                          }`}>
                                            {batch.batchNumber}
                                            {isExpired && <span className="ml-2 text-red-500 text-xs">(Abgelaufen)</span>}
                                          </span>
                                          <Badge 
                                            variant={isExpired ? "secondary" : "outline"} 
                                            className={`text-xs ${isExpired ? 'bg-gray-200 text-gray-500' : ''}`}
                                          >
                                            {batch.currentQuantity} Stück
                                          </Badge>
                                        </div>
                                        <div className={`text-sm ${isExpired ? 'text-gray-400' : 'text-muted-foreground'}`}>
                                          <div className={isExpired ? 'text-red-400' : ''}>
                                            MHD: {batch.expiryDate ? formatDate(batch.expiryDate) : 'Kein MHD'}
                                          </div>
                                          {batch.notes && (
                                            <div className="mt-1 text-xs">{batch.notes}</div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                  <p>Noch keine MHD-Einträge vorhanden</p>
                                  <p className="text-xs">Klicken Sie auf "MHD" um eine neue Charge anzulegen</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* MHD-Batch Dialog */}
      {showBatchDialog && selectedItem && (
        <InventoryCountBatchDialog
          open={showBatchDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowBatchDialog(false);
              setSelectedItem(null);
            }
          }}
          selectedItem={{
            ...selectedItem,
            productName: selectedItem.product?.productName || 'Unbekanntes Produkt'
          }}
          availableBatches={availableBatches?.filter(batch => 
            batch.productId === selectedItem.productId
          ) || []}
          onBatchSelect={() => {}}
          inventoryId={inventoryId.toString()}
          warehouseId={inventurData?.warehouseId || 0}
          onBatchCreated={handleBatchCreated}
        />
      )}
    </div>
  );
};

export default SimpleInventurDetailPage;
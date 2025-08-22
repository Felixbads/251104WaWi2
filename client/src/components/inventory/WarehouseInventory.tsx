import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  RefreshCw, Package, Search, FilterX, AlertTriangle, 
  CircleAlert, Loader2, Warehouse as WarehouseIcon,
  ChevronDown, ChevronRight, CornerDownRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import ProductBatchDialog from './batch/ProductBatchDialog';

// Typ für Inventar-Bewegungen
interface InventoryMovement {
  id: number;
  productId: number;
  sourceType: string; // Quelle: 'warehouse', 'supplier', etc.
  sourceId?: number;
  destinationType: string; // Ziel: 'warehouse', 'machine', etc.
  destinationId?: number;
  quantity: number;
  movementType: 'IN' | 'OUT' | 'TRANSFER';
  performedAt: string;
  reason?: string;
  notes?: string;
  previousStock?: number;
  currentStock?: number;
  sourceName?: string;
  destinationName?: string;
  batchId?: number;
  batchNumber?: string;
  expiryDate?: string;
  performedByName?: string; // Name des Benutzers, der die Bewegung durchgeführt hat
}

// Sicherer Typ für Inventory Items
interface InventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  productName?: string;
  warehouseName?: string;
  quantity: number | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  reorderPoint?: number | null;
  targetQuantity?: number | null;
  locationInWarehouse?: string | null;
  status?: string | null;
  notes?: string | null;
  lastUpdated?: string | null;
  nextExpiryDate?: string | null; // Das früheste MHD der Batches dieses Produkts
  movements?: InventoryMovement[]; // Warenbewegungen für dieses Produkt
}

interface WarehouseInventoryProps {
  warehouseId?: number;
  inventory?: InventoryItem[];
  isLoading?: boolean;
  error?: any;
  onRefresh?: () => void;
}

export default function WarehouseInventory({
  warehouseId = 0,
  inventory: propInventory = [],
  isLoading: propIsLoading = false,
  error: propError = null,
  onRefresh = () => {}
}: WarehouseInventoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number, warehouseId: number, name: string } | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [expandedRows, setExpandedRows] = useState<number[]>([]);

  const queryClient = useQueryClient();

  // Setze den Lagerfilter, wenn warehouseId übergeben wird
  useEffect(() => {
    if (warehouseId > 0) {
      setWarehouseFilter(warehouseId.toString());
    }
  }, [warehouseId]);
  
  // Lade Inventardaten, falls sie nicht als Prop übergeben wurden
  const {
    data: fetchedInventory = [],
    isLoading: fetchIsLoading,
    error: fetchError,
    refetch
  } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory', { 
      warehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
      critical: showCriticalOnly,
      includeZeroStock: showZeroStock
    }],
    queryFn: async ({ queryKey }) => {
      try {
        // Sicherere API-Anfrage mit Fehlerbehandlung
        let url = '/api/inventory';
        const params: string[] = [];
        
        if (warehouseFilter) {
          params.push(`warehouseId=${warehouseFilter}`);
        }
        
        if (showCriticalOnly) {
          params.push('critical=true');
        }
        
        if (showZeroStock) {
          params.push('includeZeroStock=true');
        }
        
        if (params.length > 0) {
          url += `?${params.join('&')}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Fehler beim Laden der Inventardaten: ${response.status}`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("Fehler beim Laden der Inventardaten:", error);
        return [];
      }
    },
    enabled: (!propInventory || propInventory.length === 0) && typeof window !== 'undefined',
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Lade Lagerdaten für das Dropdown
  const {
    data: warehouses = [],
    isLoading: warehousesLoading
  } = useQuery<any[]>({
    queryKey: ['/api/warehouses'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/warehouses');
        if (!response.ok) {
          return [];
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("Fehler beim Laden der Lagerdaten:", error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Warenbewegungen für ein Produkt laden
  const getProductMovements = async (productId: number, warehouseId: number) => {
    try {
      const response = await fetch(`/api/inventory/movements?productId=${productId}&warehouseId=${warehouseId}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Warenbewegungen: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Fehler beim Laden der Warenbewegungen:", error);
      return [];
    }
  };
  
  // Warenbewegungen für einen Batch laden
  const getBatchMovements = async (batchId: number) => {
    try {
      const response = await fetch(`/api/inventory/movements?batchId=${batchId}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Batch-Warenbewegungen: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Fehler beim Laden der Batch-Warenbewegungen:", error);
      return [];
    }
  };
  
  // Toggle für expandierte Zeilen
  const toggleRowExpansion = async (item: InventoryItem) => {
    const itemId = item.id;
    if (expandedRows.includes(itemId)) {
      // Wenn die Zeile bereits expandiert ist, schließen
      setExpandedRows(expandedRows.filter(id => id !== itemId));
    } else {
      // Wenn die Zeile noch nicht expandiert ist, öffnen und Bewegungen laden
      setExpandedRows([...expandedRows, itemId]);
      
      // Warenbewegungen nur laden, wenn sie noch nicht vorhanden sind
      if (!item.movements || item.movements.length === 0) {
        const movements = await getProductMovements(item.productId, item.warehouseId);
        
        // Inventar-Item mit den Bewegungen aktualisieren
        const updatedInventory = filteredAndSortedInventory.map(invItem => 
          invItem.id === itemId ? { ...invItem, movements } : invItem
        );
        
        // Cache aktualisieren
        queryClient.setQueryData(['/api/inventory', { 
          warehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
          critical: showCriticalOnly,
          includeZeroStock: showZeroStock
        }], updatedInventory);
      }
    }
  };
  
  // Sicheres Zusammenführen der Daten
  const inventory: InventoryItem[] = Array.isArray(propInventory) && propInventory.length > 0 
    ? propInventory 
    : (Array.isArray(fetchedInventory) ? fetchedInventory : []);
  
  const isLoading = propIsLoading || fetchIsLoading || warehousesLoading;
  const error = propError || fetchError;

  // Sichere Suche und Filterung
  const filteredAndSortedInventory = Array.isArray(inventory) 
    ? inventory.filter((item: InventoryItem) => {
        if (!item) return false;
        
        const matchesSearch = !searchTerm || 
          ((item.productName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
           (item.locationInWarehouse ?? '').toLowerCase().includes(searchTerm.toLowerCase()));
           
        const matchesWarehouse = !warehouseFilter || 
          (item.warehouseId === parseInt(warehouseFilter));
        
        const matchesCritical = !showCriticalOnly || 
          ((item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0);
        
        const matchesZero = showZeroStock || (item.quantity ?? 0) > 0;
        
        return matchesSearch && matchesWarehouse && matchesCritical && matchesZero;
      })
    : [];

  // Lagerbestand aktualisieren mit Fehlerbehandlung
  const handleRefresh = () => {
    try {
      if (typeof onRefresh === 'function') {
        onRefresh();
      } else {
        refetch();
      }
      
      // Invalidiere den Cache für Statistiken
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/alerts'] });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Lagerbestands:", error);
    }
  };
  
  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Lagerbestände werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">Fehler beim Laden der Lagerbestände</h3>
        <p className="text-muted-foreground mt-1">
          {typeof error === 'object' && error?.message ? error.message : 'Unbekannter Fehler'}
        </p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={handleRefresh}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }
  
  // Leerer Zustand
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return (
      <div className="rounded-md bg-muted/50 p-8 text-center">
        <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <h3 className="text-lg font-medium">Keine Lagerbestände vorhanden</h3>
        <p className="text-muted-foreground mt-1">
          Es wurden noch keine Produkte im Lager erfasst.
        </p>
      </div>
    );
  }
  
  return (
    <div>
      {/* Batch Dialog als separate Komponente */}
      {selectedProduct && (
        <ProductBatchDialog 
          open={showBatchDialog} 
          onOpenChange={setShowBatchDialog}
          product={selectedProduct}
        />
      )}
      
      {/* Filter und Suchleiste */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Produkt oder Lagerort suchen..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchTerm('')}
            >
              <FilterX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        {warehouseId === 0 && (
          <div className="w-full sm:w-52">
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alle Lager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="all" value="all">Alle Lager</SelectItem>
                {Array.isArray(warehouses) && warehouses.map((warehouse: any) => (
                  <SelectItem 
                    key={warehouse?.id || 'unknown'} 
                    value={warehouse?.id?.toString() || 'unknown'}
                  >
                    {warehouse?.name || 'Unbekanntes Lager'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <div className="flex flex-row gap-4 items-center">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="critical-only" 
              checked={showCriticalOnly}
              onCheckedChange={(checked) => setShowCriticalOnly(!!checked)}
            />
            <Label htmlFor="critical-only" className="text-sm cursor-pointer">
              Nur kritische
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="zero-stock" 
              checked={showZeroStock}
              onCheckedChange={(checked) => setShowZeroStock(!!checked)}
            />
            <Label htmlFor="zero-stock" className="text-sm cursor-pointer">
              Nullbestand anzeigen
            </Label>
          </div>
          
          <Button 
            variant="outline" 
            size="icon"
            className="ml-auto"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Inventartabelle */}
      <div className="rounded-md border">
        <Table>
          <TableCaption>
            {filteredAndSortedInventory.length} Lagerposten {warehouseFilter ? `in Lager #${warehouseFilter}` : 'in allen Lagern'}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              {!warehouseFilter && <TableHead>Lager</TableHead>}
              <TableHead>MHD</TableHead>
              <TableHead className="text-right">Bestand</TableHead>
              <TableHead className="text-right">Min/Max</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={warehouseFilter ? 5 : 6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-muted-foreground">
                      Keine Ergebnisse für die aktuelle Filterauswahl
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedInventory.map((item: InventoryItem) => {
                if (!item) return null;
                
                // Sicherheitsabfragen für alle Werte
                const quantity = item.quantity ?? 0;
                const minQuantity = item.minQuantity ?? 0;
                const maxQuantity = item.maxQuantity ?? 100;
                const reorderPoint = item.reorderPoint ?? 0;
                
                const isCritical = quantity <= minQuantity && minQuantity > 0;
                const isLow = quantity <= reorderPoint && !isCritical;
                
                // Berechne Füllstand in Prozent mit Sicherheitsabfragen
                let fillPercentage = 0;
                if (maxQuantity > 0) {
                  fillPercentage = Math.min(100, Math.max(0, (quantity / maxQuantity) * 100));
                } else {
                  fillPercentage = quantity > 0 ? 50 : 0; // Default, wenn kein Maximum angegeben ist
                }
                
                // Ist die Zeile expandiert?
                const isExpanded = expandedRows.includes(item.id);
                
                return (
                  <Collapsible 
                    key={item.id}
                    open={isExpanded}
                    onOpenChange={() => {}}
                    className="w-full"
                  >
                    <TableRow className="group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CollapsibleTrigger asChild onClick={() => toggleRowExpansion(item)}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 p-0">
                              {isExpanded ? 
                                <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              }
                            </Button>
                          </CollapsibleTrigger>
                          <span 
                            className="font-medium cursor-pointer hover:text-primary hover:underline"
                            onClick={() => {
                              try {
                                // Zeige Batches für dieses Produkt an
                                setSelectedProduct({
                                  id: item.productId,
                                  warehouseId: item.warehouseId,
                                  name: item.productName || 'Unbekanntes Produkt'
                                });
                                setShowBatchDialog(true);
                              } catch (error) {
                                console.error("Fehler beim Öffnen des Batch-Dialogs:", error);
                              }
                            }}
                          >
                            {item.productName || 'Unbekanntes Produkt'}
                          </span>
                        </div>
                      </TableCell>
                      
                      {!warehouseFilter && (
                        <TableCell>
                          <div className="flex items-center">
                            <WarehouseIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <span>{item.warehouseName || 'Unbekanntes Lager'}</span>
                          </div>
                        </TableCell>
                      )}
                      
                      <TableCell>
                        {item.nextExpiryDate ? (
                          <span className={
                            new Date(item.nextExpiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) 
                            ? 'text-destructive font-medium' 
                            : ''
                          }>
                            {new Date(item.nextExpiryDate).toLocaleDateString('de-DE')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={
                            isCritical 
                              ? 'text-destructive font-medium' 
                              : isLow 
                                ? 'text-amber-500 font-medium' 
                                : ''
                          }>
                            {quantity}
                          </span>
                          <Progress value={fillPercentage} className="w-24 h-1.5 mt-1" />
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right space-x-1">
                        <span className="text-muted-foreground">
                          {minQuantity}/
                          {maxQuantity}
                        </span>
                      </TableCell>
                      
                      <TableCell className="text-right">
                        {isCritical && (
                          <Badge variant="destructive" className="ml-auto">
                            <CircleAlert className="h-3 w-3 mr-1" />
                            Kritisch
                          </Badge>
                        )}
                        
                        {isLow && (
                          <Badge variant="warning" className="ml-auto">
                            Niedrig
                          </Badge>
                        )}
                        
                        {item.status && item.status !== 'active' && (
                          <Badge variant="secondary" className="ml-auto">
                            {item.status === 'inactive' ? 'Inaktiv' : item.status}
                          </Badge>
                        )}
                        
                        {!isCritical && !isLow && (!item.status || item.status === 'active') && (
                          <Badge variant="outline" className="text-muted-foreground ml-auto">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                      
                    {/* Warenbewegungen-Detailzeile */}
                    <CollapsibleContent>
                      <TableRow className="bg-muted/50 hover:bg-muted">
                        <TableCell colSpan={warehouseFilter ? 5 : 6}>
                          <div className="py-2 pl-8">
                            <h4 className="text-sm font-medium mb-2">Warenbewegungen</h4>
                            
                            {(!item.movements || item.movements.length === 0) ? (
                              <div className="text-sm text-muted-foreground italic">
                                Keine Warenbewegungen für dieses Produkt vorhanden.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {item.movements.map((movement, index) => {
                                  // Bewegungstyp-Anzeige
                                  let typeLabel = '';
                                  let typeDetails = '';
                                  let stockDetails = '';
                                  
                                  // Format für Datum
                                  const formattedDate = movement.performedAt ? 
                                    format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', {locale: de}) : '--';
                                  
                                  // Bestandsänderung formatieren
                                  if (movement.previousStock !== undefined && movement.currentStock !== undefined) {
                                    stockDetails = `${movement.previousStock} → ${movement.currentStock}`;
                                  }
                                  
                                  if (movement.movementType === 'IN') {
                                    if (movement.sourceType === 'supplier') {
                                      typeLabel = 'Wareneingang';
                                      typeDetails = `von ${movement.sourceName || 'Lieferant'}`;
                                      if (movement.batchNumber) {
                                        typeDetails += `, Ch.-Nr. ${movement.batchNumber}`;
                                      }
                                      if (movement.expiryDate) {
                                        typeDetails += `, MHD ${format(parseISO(movement.expiryDate), 'dd.MM.yyyy', {locale: de})}`;
                                      }
                                    } else {
                                      typeLabel = 'Einlagerung';
                                      typeDetails = movement.reason || '';
                                    }
                                  } else if (movement.movementType === 'OUT') {
                                    if (movement.destinationType === 'machine') {
                                      typeLabel = 'Refill';
                                      typeDetails = `in ${movement.destinationName || 'Automat'}`;
                                      // Benutzer-Information für Refills hinzufügen
                                      if (movement.performedByName) {
                                        typeDetails += ` (von ${movement.performedByName})`;
                                      }
                                    } else {
                                      typeLabel = 'Auslagerung';
                                      typeDetails = movement.reason || '';
                                      if (movement.performedByName) {
                                        typeDetails += ` (von ${movement.performedByName})`;
                                      }
                                    }
                                  } else if (movement.movementType === 'TRANSFER') {
                                    typeLabel = 'Umlagerung';
                                    if (movement.destinationType === 'warehouse') {
                                      typeDetails = `in Lager ${movement.destinationName || ''}`;
                                    } else {
                                      typeDetails = `von ${movement.sourceName || ''} nach ${movement.destinationName || ''}`;
                                    }
                                    // Benutzer-Information für Transfers hinzufügen
                                    if (movement.performedByName) {
                                      typeDetails += ` (von ${movement.performedByName})`;
                                    }
                                  }
                                  
                                  return (
                                    <div key={movement.id} className="flex items-start text-sm border-l-2 border-muted pl-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="font-medium">{typeLabel}</span>
                                          <span className="text-muted-foreground text-xs">
                                            {formattedDate}
                                          </span>
                                        </div>
                                        <div className="ml-5 text-sm">
                                          <span>{movement.quantity} Stück, {typeDetails}</span>
                                          {stockDetails && (
                                            <span className="text-xs text-muted-foreground ml-1">
                                              (Bestand: {stockDetails})
                                            </span>
                                          )}
                                          {movement.notes && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                              Notiz: {movement.notes}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
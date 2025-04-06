import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  RefreshCw, Package, Search, FilterX, AlertTriangle, 
  CircleAlert, Loader2, Warehouse as WarehouseIcon,
  Calendar, Clock 
} from 'lucide-react';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
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
import { 
  Dialog,
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';

interface InventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  productName?: string;
  quantity: number | null;
  minQuantity?: number | null;
  targetQuantity?: number | null;
  locationInWarehouse?: string | null;
  status?: string | null;
  notes?: string | null;
  lastUpdated?: string | null;
  nextExpiryDate?: string | null; // Das früheste MHD der Batches dieses Produkts
}

interface WarehouseInventoryProps {
  warehouseId: number;
  inventory: InventoryItem[];
  isLoading: boolean;
  error: any;
  onRefresh: () => void;
}

export default function WarehouseInventory({
  warehouseId,
  inventory: propInventory,
  isLoading: propIsLoading,
  error: propError,
  onRefresh
}: WarehouseInventoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState(warehouseId === 0 ? '' : warehouseId.toString());
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number, warehouseId: number, name: string } | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  
  const queryClient = useQueryClient();
  
  // Lade Inventardaten, falls sie nicht als Prop übergeben wurden
  const {
    data: fetchedInventory = [],
    isLoading: fetchIsLoading,
    error: fetchError,
    refetch
  } = useQuery({
    queryKey: ['/api/inventory', { 
      warehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
      critical: showCriticalOnly,
      includeZeroStock: showZeroStock
    }],
    enabled: !propInventory || propInventory.length === 0,
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Lade Lagerdaten für das Dropdown
  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  const inventory = propInventory.length > 0 ? propInventory : fetchedInventory;
  const isLoading = propIsLoading || fetchIsLoading;
  const error = propError || fetchError;

  // Suche und Filterung
  const filteredInventory = inventory.filter((item: InventoryItem) => {
    const matchesSearch = !searchTerm || 
      (item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.locationInWarehouse?.toLowerCase().includes(searchTerm.toLowerCase()));
       
    const matchesWarehouse = !warehouseFilter || item.warehouseId === parseInt(warehouseFilter);
    const matchesCritical = !showCriticalOnly || 
      ((item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0);
    const matchesZero = showZeroStock || (item.quantity ?? 0) > 0;
    
    return matchesSearch && matchesWarehouse && matchesCritical && matchesZero;
  });

  // Lagerbestand aktualisieren
  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      refetch();
    }
    
    // Invalidiere den Cache für Statistiken
    queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/inventory/alerts'] });
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
          {error.message || 'Unbekannter Fehler'}
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
  if (!inventory || inventory.length === 0) {
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
  
  // Laden der Batches für das ausgewählte Produkt
  const { data: productBatches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: ['/api/product-batches/product', selectedProduct?.id, 'warehouse', selectedProduct?.warehouseId],
    enabled: !!selectedProduct && showBatchDialog,
  });

  return (
    <div>
      {/* Batch Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chargen für {selectedProduct?.name}</DialogTitle>
            <DialogDescription>
              Übersicht aller Chargen im Lager mit Ablaufdaten (MHD)
            </DialogDescription>
          </DialogHeader>
          
          {isBatchesLoading ? (
            <div className="py-6 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : productBatches.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium mb-1">Keine Chargen gefunden</h3>
              <p className="text-muted-foreground text-sm">
                Für dieses Produkt sind keine Chargen im Lager vorhanden.
              </p>
            </div>
          ) : (
            <div className="rounded-md border mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chargen-Nr.</TableHead>
                    <TableHead>Eingangsdatum</TableHead>
                    <TableHead>MHD</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productBatches.map((batch: any) => {
                    const isExpired = new Date(batch.expiryDate) < new Date();
                    const isExpiringSoon = !isExpired && 
                      new Date(batch.expiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                    
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                        <TableCell>
                          {batch.receivedDate ? (
                            <div className="flex items-center">
                              <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                              <span>{new Date(batch.receivedDate).toLocaleDateString('de-DE')}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unbekannt</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <span className={
                              isExpired ? 'text-destructive font-medium' :
                              isExpiringSoon ? 'text-amber-500 font-medium' : ''
                            }>
                              {new Date(batch.expiryDate).toLocaleDateString('de-DE')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {batch.currentQuantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {isExpired ? (
                            <Badge variant="destructive">Abgelaufen</Badge>
                          ) : isExpiringSoon ? (
                            <Badge variant="warning">Bald ablaufend</Badge>
                          ) : (
                            <Badge variant="outline">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
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
                <SelectItem value="">Alle Lager</SelectItem>
                {warehouses.map((warehouse: any) => (
                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                    {warehouse.name}
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
            {filteredInventory.length} Lagerposten {warehouseFilter ? `in Lager #${warehouseFilter}` : 'in allen Lagern'}
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
            {filteredInventory.length === 0 ? (
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
              filteredInventory.map((item: any) => {
                const isCritical = (item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0;
                const isLow = (item.quantity ?? 0) <= (item.reorderPoint ?? 0) && !isCritical;
                
                // Berechne Füllstand in Prozent
                let fillPercentage = 0;
                if (item.maxQuantity) {
                  fillPercentage = Math.min(100, Math.max(0, (item.quantity / item.maxQuantity) * 100));
                } else {
                  fillPercentage = item.quantity > 0 ? 50 : 0; // Default, wenn kein Maximum angegeben ist
                }
                
                return (
                  <TableRow key={item.id}>
                    <TableCell 
                      className="font-medium cursor-pointer hover:text-primary hover:underline"
                      onClick={() => {
                        // Zeige Batches für dieses Produkt an
                        setSelectedProduct({
                          id: item.productId,
                          warehouseId: item.warehouseId,
                          name: item.productName || 'Unbekanntes Produkt'
                        });
                        setShowBatchDialog(true);
                      }}
                    >
                      {item.productName}
                    </TableCell>
                    
                    {!warehouseFilter && (
                      <TableCell>
                        <div className="flex items-center">
                          <WarehouseIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <span>{item.warehouseName}</span>
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
                          {item.quantity}
                        </span>
                        <Progress value={fillPercentage} className="w-24 h-1.5 mt-1" />
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-right space-x-1">
                      <span className="text-muted-foreground">
                        {item.minQuantity !== null ? item.minQuantity : '--'}/
                        {item.maxQuantity !== null ? item.maxQuantity : '--'}
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
                      
                      {!isCritical && !isLow && item.status === 'active' && (
                        <Badge variant="outline" className="text-muted-foreground ml-auto">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
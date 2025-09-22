import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  Package2, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  ArrowUpDown, 
  ArrowDown,
  ArrowUp,
  Clock,
  PackageOpen,
  Loader2,
  Filter
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface InventoryDetailedTableProps {
  warehouseId: number;
}

interface ProductInventoryItem {
  productId: number;
  productName: string;
  totalQuantity: number;
  activeBatches: number;
  nextExpiryDate?: string;
  criticalBatches: number;
}

interface BatchItem {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  currentQuantity: number;
  expiryDate?: string;
  expiryStatus: 'expired' | 'warning' | 'attention' | 'good' | 'no_expiry';
  daysUntilExpiry?: number;
  locationInWarehouse?: string;
  status: string;
  createdAt: string;
  productName?: string;
}

interface MovementItem {
  id: number;
  productId: number;
  productBatchId?: number;
  quantity: number;
  movementType: string;
  referenceType?: string;
  performedAt: string;
  notes?: string;
  performedBy?: number;
  status: string;
}

const InventoryDetailedTable: React.FC<InventoryDetailedTableProps> = ({ warehouseId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const [sortColumn, setSortColumn] = useState<'productName' | 'totalQuantity' | 'nextExpiryDate'>('productName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Query für Inventar-Übersicht (Produkt-Level)
  const { data: inventory = [], isLoading: isInventoryLoading } = useQuery({
    queryKey: [`/api/inventory/warehouse/${warehouseId}`],
    enabled: !!warehouseId,
  });

  // Wandle Inventar-Daten in aggregierte Produkt-Ansicht um
  const productInventory = useMemo((): ProductInventoryItem[] => {
    if (!Array.isArray(inventory)) return [];
    
    const productMap = new Map<number, ProductInventoryItem>();
    
    inventory.forEach((item: any) => {
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.totalQuantity += item.quantity || 0;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName || 'Unbekanntes Produkt',
          totalQuantity: item.quantity || 0,
          activeBatches: 0,
          criticalBatches: 0,
        });
      }
    });

    return Array.from(productMap.values());
  }, [inventory]);

  // Query für Batches eines spezifischen Produkts (lazy loading)
  const getBatchesQuery = (productId: number) => {
    return useQuery({
      queryKey: [`/api/inventory-batches/product/${productId}/warehouse/${warehouseId}`, { excludeExpired: !includeExpired }],
      queryFn: async (): Promise<BatchItem[]> => {
        const params = new URLSearchParams({
          excludeExpired: (!includeExpired).toString()
        });
        const response = await fetch(`/api/inventory-batches/product/${productId}/warehouse/${warehouseId}?${params}`);
        if (!response.ok) {
          throw new Error('Failed to fetch batches');
        }
        return response.json();
      },
      enabled: expandedProducts.has(productId),
      staleTime: 1000 * 60, // 1 Minute
    });
  };

  // Query für Movements einer spezifischen Batch (lazy loading)
  const getMovementsQuery = (batchId: number) => {
    return useQuery({
      queryKey: [`/api/inventory-movements`, { batchId }],
      queryFn: async (): Promise<MovementItem[]> => {
        const response = await fetch(`/api/inventory-movements?batchId=${batchId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch movements');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      },
      enabled: expandedBatches.has(batchId),
      staleTime: 1000 * 30, // 30 Sekunden
    });
  };

  // Filtering und Sorting
  const filteredProducts = useMemo(() => {
    let filtered = productInventory;
    
    if (searchTerm) {
      filtered = filtered.filter(product => 
        product.productName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortColumn) {
        case 'productName':
          aValue = a.productName.toLowerCase();
          bValue = b.productName.toLowerCase();
          break;
        case 'totalQuantity':
          aValue = a.totalQuantity;
          bValue = b.totalQuantity;
          break;
        case 'nextExpiryDate':
          aValue = a.nextExpiryDate || '9999-12-31';
          bValue = b.nextExpiryDate || '9999-12-31';
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [productInventory, searchTerm, sortColumn, sortDirection]);

  // Toggle Funktionen
  const toggleProduct = (productId: number) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleBatch = (batchId: number) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedBatches(newExpanded);
  };

  // Sorting Handler
  const handleSort = (column: 'productName' | 'totalQuantity' | 'nextExpiryDate') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Helper Functions
  const getExpiryStatusBadge = (status: string, daysUntilExpiry?: number) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive" className="text-xs">Abgelaufen</Badge>;
      case 'warning':
        return <Badge variant="destructive" className="text-xs bg-orange-100 text-orange-800">7 Tage</Badge>;
      case 'attention':
        return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">30 Tage</Badge>;
      case 'good':
        return <Badge variant="outline" className="text-xs">Gut</Badge>;
      case 'no_expiry':
        return <Badge variant="outline" className="text-xs">Kein MHD</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Unbekannt</Badge>;
    }
  };

  const getMovementTypeBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'IN':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 text-xs flex items-center gap-1">
            <ArrowDown className="h-3 w-3" />
            Eingang
          </Badge>
        );
      case 'OUT':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 text-xs flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            Ausgang
          </Badge>
        );
      case 'TRANSFER':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Transfer
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  if (isInventoryLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Detaillierte Lagerbestandsübersicht
            </CardTitle>
            <CardDescription>
              Vollständige Rückverfolgbarkeit: Produkt → Chargen → Bewegungen
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Switch 
              id="include-expired" 
              checked={includeExpired}
              onCheckedChange={setIncludeExpired}
              data-testid="switch-include-expired"
            />
            <Label htmlFor="include-expired" className="text-sm">
              Abgelaufene Chargen anzeigen
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Produkt suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-product"
            />
          </div>
        </div>

        {/* Main Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('productName')}
                  data-testid="header-product-name"
                >
                  <div className="flex items-center gap-2">
                    Produkt
                    {sortColumn === 'productName' && (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('totalQuantity')}
                  data-testid="header-total-quantity"
                >
                  <div className="flex items-center gap-2">
                    Gesamtbestand
                    {sortColumn === 'totalQuantity' && (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Aktive Chargen</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50" 
                  onClick={() => handleSort('nextExpiryDate')}
                  data-testid="header-next-expiry"
                >
                  <div className="flex items-center gap-2">
                    Nächstes MHD
                    {sortColumn === 'nextExpiryDate' && (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <ProductRow
                  key={product.productId}
                  product={product}
                  warehouseId={warehouseId}
                  includeExpired={includeExpired}
                  isExpanded={expandedProducts.has(product.productId)}
                  onToggle={() => toggleProduct(product.productId)}
                  expandedBatches={expandedBatches}
                  onToggleBatch={toggleBatch}
                  getBatchesQuery={getBatchesQuery}
                  getMovementsQuery={getMovementsQuery}
                  getExpiryStatusBadge={getExpiryStatusBadge}
                  getMovementTypeBadge={getMovementTypeBadge}
                />
              ))}
            </TableBody>
          </Table>
          
          {filteredProducts.length === 0 && (
            <div className="text-center p-8">
              <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Produkte gefunden</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? `Keine Produkte entsprechen dem Suchbegriff "${searchTerm}"`
                  : 'In diesem Lager sind keine Produkte vorhanden.'
                }
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Separate ProductRow Component für bessere Performance
interface ProductRowProps {
  product: ProductInventoryItem;
  warehouseId: number;
  includeExpired: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  expandedBatches: Set<number>;
  onToggleBatch: (batchId: number) => void;
  getBatchesQuery: (productId: number) => any;
  getMovementsQuery: (batchId: number) => any;
  getExpiryStatusBadge: (status: string, daysUntilExpiry?: number) => React.ReactNode;
  getMovementTypeBadge: (type: string) => React.ReactNode;
}

const ProductRow: React.FC<ProductRowProps> = ({
  product,
  warehouseId,
  includeExpired,
  isExpanded,
  onToggle,
  expandedBatches,
  onToggleBatch,
  getBatchesQuery,
  getMovementsQuery,
  getExpiryStatusBadge,
  getMovementTypeBadge,
}) => {
  const batchesQuery = getBatchesQuery(product.productId);
  const batches = batchesQuery?.data || [];
  
  return (
    <>
      {/* Product Row */}
      <TableRow 
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
        data-testid={`row-product-${product.productId}`}
      >
        <TableCell>
          {isExpanded ? 
            <ChevronDown className="h-4 w-4" /> : 
            <ChevronRight className="h-4 w-4" />
          }
        </TableCell>
        <TableCell className="font-medium" data-testid={`text-product-name-${product.productId}`}>
          {product.productName}
        </TableCell>
        <TableCell data-testid={`text-total-quantity-${product.productId}`}>
          <Badge variant="outline">{product.totalQuantity}</Badge>
        </TableCell>
        <TableCell data-testid={`text-active-batches-${product.productId}`}>
          <Badge variant="secondary">{batches.length}</Badge>
        </TableCell>
        <TableCell data-testid={`text-next-expiry-${product.productId}`}>
          {product.nextExpiryDate ? (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {format(parseISO(product.nextExpiryDate), 'dd.MM.yyyy', { locale: de })}
            </div>
          ) : (
            <span className="text-muted-foreground">Kein MHD</span>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded Batches */}
      {isExpanded && (
        <>
          {batchesQuery.isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          )}
          
          {batchesQuery.error && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4 text-destructive">
                <AlertTriangle className="h-4 w-4 mx-auto mb-2" />
                Fehler beim Laden der Chargen
              </TableCell>
            </TableRow>
          )}
          
          {batches.map((batch: BatchItem) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              isExpanded={expandedBatches.has(batch.id)}
              onToggle={() => onToggleBatch(batch.id)}
              getMovementsQuery={getMovementsQuery}
              getExpiryStatusBadge={getExpiryStatusBadge}
              getMovementTypeBadge={getMovementTypeBadge}
            />
          ))}
        </>
      )}
    </>
  );
};

// Separate BatchRow Component
interface BatchRowProps {
  batch: BatchItem;
  isExpanded: boolean;
  onToggle: () => void;
  getMovementsQuery: (batchId: number) => any;
  getExpiryStatusBadge: (status: string, daysUntilExpiry?: number) => React.ReactNode;
  getMovementTypeBadge: (type: string) => React.ReactNode;
}

const BatchRow: React.FC<BatchRowProps> = ({
  batch,
  isExpanded,
  onToggle,
  getMovementsQuery,
  getExpiryStatusBadge,
  getMovementTypeBadge,
}) => {
  const movementsQuery = getMovementsQuery(batch.id);
  const movements = movementsQuery?.data || [];

  return (
    <>
      {/* Batch Row */}
      <TableRow 
        className="bg-muted/25 cursor-pointer hover:bg-muted/40"
        onClick={onToggle}
        data-testid={`row-batch-${batch.id}`}
      >
        <TableCell className="pl-8">
          {isExpanded ? 
            <ChevronDown className="h-4 w-4" /> : 
            <ChevronRight className="h-4 w-4" />
          }
        </TableCell>
        <TableCell data-testid={`text-batch-number-${batch.id}`}>
          <div className="flex items-center gap-2">
            <PackageOpen className="h-4 w-4 text-muted-foreground" />
            {batch.batchNumber}
          </div>
        </TableCell>
        <TableCell data-testid={`text-batch-quantity-${batch.id}`}>
          <Badge variant="outline">{batch.currentQuantity}</Badge>
        </TableCell>
        <TableCell data-testid={`text-batch-status-${batch.id}`}>
          {getExpiryStatusBadge(batch.expiryStatus, batch.daysUntilExpiry)}
        </TableCell>
        <TableCell data-testid={`text-batch-expiry-${batch.id}`}>
          {batch.expiryDate ? (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {format(parseISO(batch.expiryDate), 'dd.MM.yyyy', { locale: de })}
              {batch.daysUntilExpiry !== undefined && (
                <span className="text-xs text-muted-foreground">
                  ({batch.daysUntilExpiry} Tage)
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Kein MHD</span>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded Movements */}
      {isExpanded && (
        <>
          {movementsQuery.isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          )}
          
          {movements.length === 0 && !movementsQuery.isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                Keine Bewegungen für diese Charge
              </TableCell>
            </TableRow>
          )}
          
          {movements.map((movement: MovementItem) => (
            <TableRow 
              key={movement.id} 
              className="bg-muted/10"
              data-testid={`row-movement-${movement.id}`}
            >
              <TableCell className="pl-12">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </TableCell>
              <TableCell data-testid={`text-movement-type-${movement.id}`}>
                {getMovementTypeBadge(movement.movementType)}
              </TableCell>
              <TableCell data-testid={`text-movement-quantity-${movement.id}`}>
                <span className={movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                  {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                </span>
              </TableCell>
              <TableCell data-testid={`text-movement-reference-${movement.id}`}>
                {movement.referenceType && (
                  <Badge variant="outline" className="text-xs">
                    {movement.referenceType}
                  </Badge>
                )}
              </TableCell>
              <TableCell data-testid={`text-movement-date-${movement.id}`}>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {movement.performedAt ? (
                    format(parseISO(movement.performedAt), 'dd.MM.yyyy HH:mm', { locale: de })
                  ) : (
                    <span className="text-muted-foreground italic">Kein Datum</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  );
};

export default InventoryDetailedTable;
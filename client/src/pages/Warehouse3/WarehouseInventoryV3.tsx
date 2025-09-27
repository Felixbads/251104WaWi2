import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Package, 
  Calendar, 
  AlertTriangle, 
  ClipboardList,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  MapPin,
  TrendingDown,
  AlertCircle,
  PackageX,
  Truck
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ---- TYPES ----

interface BatchMovement {
  id: number;
  performedAt: string;
  performedByName: string;
  quantity: number;
  movementType: string;
  direction: string;
  referenceType?: string;
  machineName?: string;
  destinationWarehouseName?: string;
  notes?: string;
}

interface ProductBatch {
  id: number;
  batchNumber: string;
  expiryDate: string | null;
  currentQuantity: number;
  receivedDate: string;
  supplierRef?: string;
  daysUntilExpiry?: number;
  movements?: BatchMovement[];
}

interface InventoryItem {
  id: number;
  productId: number;
  productName: string;
  sku?: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  location?: string;
  lastCountDate?: string;
  batches: ProductBatch[];
}

interface WarehouseStats {
  productCount: number;
  lowStockCount: number;
  machineCount: number;
  lastInventoryDate: string | null;
  movementCount30Days: number;
  lowStockItems: any[];
  assignedMachines: any[];
}

interface InventoryResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Warehouse {
  id: number;
  name: string;
  address?: string;
  city?: string;
  status?: string;
}

// ---- COMPONENTS ----

const BatchStatusBadge = ({ batch }: { batch: ProductBatch }) => {
  if (!batch.expiryDate) return <Badge variant="outline">Kein MHD</Badge>;
  
  const daysUntil = batch.daysUntilExpiry || 0;
  
  if (daysUntil < 0) {
    return <Badge variant="destructive" className="bg-red-600">🔴 Abgelaufen</Badge>;
  } else if (daysUntil <= 7) {
    return <Badge variant="destructive" className="bg-orange-500">🟡 {daysUntil}T</Badge>;
  } else if (daysUntil <= 14) {
    return <Badge variant="secondary" className="bg-yellow-400 text-black">🟠 {daysUntil}T</Badge>;
  } else {
    return <Badge variant="default" className="bg-green-600">✅ {daysUntil}T</Badge>;
  }
};

const ProductStockBadge = ({ item }: { item: InventoryItem }) => {
  const stockRatio = item.currentStock / (item.minimumStock || 1);
  
  if (item.currentStock === 0) {
    return <Badge variant="destructive" className="bg-red-600">🔴 Ausverkauft</Badge>;
  } else if (stockRatio <= 0.1) {
    return <Badge variant="destructive" className="bg-red-500">🔴 Kritisch</Badge>;
  } else if (stockRatio <= 0.25) {
    return <Badge variant="secondary" className="bg-orange-400">🟡 Niedrig</Badge>;
  } else {
    return <Badge variant="default" className="bg-green-600">✅ Gut</Badge>;
  }
};

const BatchMovementList = ({ batchId, warehouseId }: { batchId: number; warehouseId: number }) => {
  const { data: movements, isLoading } = useQuery<BatchMovement[]>({
    queryKey: [`/api/warehouse3-api/warehouses/${warehouseId}/movements`, { batchId }],
    enabled: !!batchId && !!warehouseId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="flex items-center space-x-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (!movements?.length) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Keine Bewegungen für dieses Batch gefunden</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Clock className="h-4 w-4" />
        Bewegungshistorie ({movements.length} Einträge)
      </div>
      
      {movements.map((movement: BatchMovement) => (
        <div key={movement.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded border">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {new Date(movement.performedAt).toLocaleDateString('de-DE')}
              <br />
              {new Date(movement.performedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium">{movement.performedByName}</span>
            </div>
            
            <div className={`text-sm font-bold ${movement.direction === 'OUT' ? 'text-red-600' : 'text-green-600'}`}>
              {movement.direction === 'OUT' ? '-' : '+'}{movement.quantity} Stk
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm">
              {movement.movementType === 'FILL' && movement.machineName ? (
                <>
                  <Truck className="h-3 w-3" />
                  <span>→ {movement.machineName}</span>
                </>
              ) : movement.destinationWarehouseName ? (
                <>
                  <MapPin className="h-3 w-3" />
                  <span>→ {movement.destinationWarehouseName}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{movement.movementType}</span>
              )}
            </div>
            {movement.notes && (
              <div className="text-xs text-muted-foreground mt-1">{movement.notes}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ProductBatchRow = ({ item, warehouseId }: { item: InventoryItem; warehouseId: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());

  const toggleBatch = (batchId: number) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedBatches(newExpanded);
  };

  // FIFO-sortierte Batches (älteste zuerst)
  const sortedBatches = [...item.batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg overflow-hidden">
        {/* Product Header */}
        <CollapsibleTrigger asChild>
          <div className="p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">{item.productName}</h3>
                  <p className="text-sm text-muted-foreground">{item.sku || 'Keine SKU'} • {item.category}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Batches:</span>
                    <Badge variant="outline">{item.batches.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">Gesamt:</span>
                    <span className="font-bold text-lg">{item.currentStock} Stk</span>
                  </div>
                </div>
                
                <ProductStockBadge item={item} />
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Batch Details */}
        <CollapsibleContent>
          <div className="border-t bg-gray-50 dark:bg-gray-900">
            {sortedBatches.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <PackageX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine Batches vorhanden</p>
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {sortedBatches.map((batch) => (
                  <Collapsible
                    key={batch.id}
                    open={expandedBatches.has(batch.id)}
                    onOpenChange={() => toggleBatch(batch.id)}
                  >
                    <div className="border rounded bg-white dark:bg-gray-800">
                      {/* Batch Header */}
                      <CollapsibleTrigger asChild>
                        <div className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {expandedBatches.has(batch.id) ? 
                                <ChevronDown className="h-3 w-3" /> : 
                                <ChevronRight className="h-3 w-3" />
                              }
                              <div>
                                <span className="font-mono text-sm">#{batch.batchNumber}</span>
                                <div className="text-xs text-muted-foreground">
                                  {batch.expiryDate ? (
                                    <>MHD: {new Date(batch.expiryDate).toLocaleDateString('de-DE')}</>
                                  ) : (
                                    'Kein MHD'
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <span className="font-bold">{batch.currentQuantity} Stk</span>
                              <BatchStatusBadge batch={batch} />
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      {/* Batch Movement History */}
                      <CollapsibleContent>
                        <div className="border-t">
                          <BatchMovementList batchId={batch.id} warehouseId={warehouseId} />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ---- MAIN COMPONENT ----

export default function WarehouseInventoryV3() {
  const [, params] = useRoute("/warehouse3/:id/inventory");
  const warehouseId = parseInt(params?.id || "0");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // Warehouse-Details abrufen
  const { data: warehouse, isLoading: warehouseLoading } = useQuery<Warehouse>({
    queryKey: [`/api/warehouse3-api/warehouses/${warehouseId}`],
    enabled: !!warehouseId,
  });

  // Lagerbestand abrufen
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery<InventoryResponse>({
    queryKey: [`/api/warehouse3-api/warehouses/${warehouseId}/inventory`],
    enabled: !!warehouseId,
  });

  // Warehouse-Statistiken abrufen
  const { data: stats, isLoading: statsLoading } = useQuery<WarehouseStats>({
    queryKey: [`/api/warehouse3-api/warehouses/${warehouseId}/stats`],
    enabled: !!warehouseId,
  });

  // Filter-Funktionen
  const allItems = inventoryData?.items || [];
  const filteredItems = allItems.filter((item: InventoryItem) => 
    item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = allItems.filter((item: InventoryItem) => 
    item.currentStock <= item.minimumStock
  );

  const expiringItems = allItems.filter((item: InventoryItem) =>
    item.batches.some(batch => 
      batch.expiryDate && batch.daysUntilExpiry !== undefined && batch.daysUntilExpiry <= 14
    )
  );

  if (warehouseLoading || inventoryLoading || statsLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="warehouse-inventory-v3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="warehouse-name">
            📦 {warehouse?.name} - Lagerbestand
          </h1>
          <p className="text-muted-foreground">
            Zentrale Bestandsübersicht mit FIFO-Batch-Management
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-new-count">
            <ClipboardList className="h-4 w-4 mr-2" />
            Inventur starten
          </Button>
          <Button data-testid="button-record-movement">
            <Package className="h-4 w-4 mr-2" />
            Entnahme buchen
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Produkte</span>
            </div>
            <div className="text-2xl font-bold">{stats?.productCount || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-muted-foreground">Niedrige Bestände</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{lowStockItems.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Bald ablaufend</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{expiringItems.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Letzte Inventur</span>
            </div>
            <div className="text-sm">
              {stats?.lastInventoryDate ? 
                new Date(stats.lastInventoryDate).toLocaleDateString('de-DE') : 
                'Keine'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Tabs */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Bestandsverwaltung</CardTitle>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Produkt suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
                data-testid="search-products"
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" data-testid="tab-overview">
                Übersicht ({filteredItems.length})
              </TabsTrigger>
              <TabsTrigger value="low-stock" data-testid="tab-low-stock">
                Niedrige Bestände ({lowStockItems.length})
              </TabsTrigger>
              <TabsTrigger value="expiring" data-testid="tab-expiring">
                Ablaufend ({expiringItems.length})
              </TabsTrigger>
              <TabsTrigger value="inventory" data-testid="tab-inventory">
                Inventur
              </TabsTrigger>
            </TabsList>

            {/* Übersicht Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Alle Produkte mit FIFO-sortierten Batches und vollständiger Bewegungshistorie
              </div>
              
              {filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Keine Produkte gefunden</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredItems.map((item: InventoryItem) => (
                    <ProductBatchRow 
                      key={item.id} 
                      item={item} 
                      warehouseId={warehouseId}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Niedrige Bestände Tab */}
            <TabsContent value="low-stock" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Produkte mit Bestand unter oder gleich der Mindestmenge
              </div>
              
              {lowStockItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Alle Bestände sind ausreichend</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lowStockItems.map((item: InventoryItem) => (
                    <ProductBatchRow 
                      key={item.id} 
                      item={item} 
                      warehouseId={warehouseId}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Ablaufende Produkte Tab */}
            <TabsContent value="expiring" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 text-red-600" />
                Produkte mit Batches, die in den nächsten 14 Tagen ablaufen
              </div>
              
              {expiringItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Keine ablaufenden Produkte in den nächsten 14 Tagen</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expiringItems.map((item: InventoryItem) => (
                    <ProductBatchRow 
                      key={item.id} 
                      item={item} 
                      warehouseId={warehouseId}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Inventur Tab */}
            <TabsContent value="inventory" className="space-y-4">
              <div className="text-center py-8">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Inventur-Management</h3>
                <p className="text-muted-foreground mb-6">
                  Starten Sie eine neue Inventur oder verwalten Sie laufende Inventuren
                </p>
                
                <div className="flex justify-center gap-4">
                  <Button data-testid="button-start-inventory">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Neue Inventur starten
                  </Button>
                  <Button variant="outline" data-testid="button-view-inventories">
                    Laufende Inventuren anzeigen
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
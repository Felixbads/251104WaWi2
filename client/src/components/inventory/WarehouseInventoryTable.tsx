import React, { useState, useCallback, useEffect } from 'react';
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
import { 
  AlertCircle, 
  Package2, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  ArrowUpDown, 
  ArrowDown,
  ArrowUp,
  MoreVertical,
  ExternalLink,
  History,
  Truck
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProductBatchDialog from './batch/ProductBatchDialog';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface WarehouseInventoryTableProps {
  warehouseId: number;
}

const WarehouseInventoryTable: React.FC<WarehouseInventoryTableProps> = ({ warehouseId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<{id: number, warehouseId: number, name: string} | null>(null);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('productName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Debug-Funktion zum Loggen von wichtigen Informationen
  const debug = useCallback((message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data || '');
  }, []);
  
  // API-Abfrage für Inventardaten
  const { data: inventory = [], isLoading, error } = useQuery({
    queryKey: [`/api/inventory/warehouse/${warehouseId}`],
  });
  
  // API-Abfrage für erweiterte Warenbewegungen über inventory-api
  const { data: inventoryMovements = [], isLoading: isMovementsLoading } = useQuery({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/movements`],
    queryFn: async () => {
      try {
        debug(`Lade erweiterte Warenbewegungen für Lager ${warehouseId}...`);
        const response = await fetch(`/api/warehouse3/warehouses/${warehouseId}/movements?limit=1000`);
        if (!response.ok) {
          debug(`Fehler beim Laden der erweiterten Warenbewegungen, Status: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        const movements = data.items || [];
        debug(`${movements.length} erweiterte Warenbewegungen geladen`);
        
        // Debug: Zeige tatsächliche API-Response-Struktur
        if (movements.length > 0) {
          console.log('[API DEBUG] Erste Warenbewegung:', movements[0]);
          console.log('[API DEBUG] Verfügbare Felder:', Object.keys(movements[0]));
        }
        
        return movements;
      } catch (error) {
        console.error("Fehler beim Laden der erweiterten Warenbewegungen:", error);
        debug(`Exception beim Laden der erweiterten Warenbewegungen: ${error}`);
        return [];
      }
    },
    enabled: !!warehouseId,
  });

  // API-Abfrage für alle Batches des Lagers
  const { data: allBatches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/batches`],
    queryFn: async () => {
      try {
        debug(`Lade Batches für Lager ${warehouseId}...`);
        const response = await fetch(`/api/warehouse3/warehouses/${warehouseId}/batches`);
        if (!response.ok) {
          debug(`Fehler beim Laden der Batches, Status: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        const batches = Array.isArray(data) ? data : (data.items || []);
        debug(`${batches.length} Batches geladen`);
        
        // Debug: Zeige tatsächliche API-Response-Struktur
        if (batches.length > 0) {
          console.log('[API DEBUG] Erster Batch:', batches[0]);
          console.log('[API DEBUG] Verfügbare Felder:', Object.keys(batches[0]));
        }
        
        return batches;
      } catch (error) {
        console.error("Fehler beim Laden der Batches:", error);
        debug(`Exception beim Laden der Batches: ${error}`);
        return [];
      }
    },
    enabled: !!warehouseId,
  });
  
  // Gruppiere Warenbewegungen nach Produkt-ID
  const movementsByProduct = React.useMemo(() => {
    const groupedMovements: Record<number, any[]> = {};
    
    debug(`Verarbeite ${inventoryMovements.length} Warenbewegungen zum Gruppieren`);
    
    console.log('[DEBUG] Raw inventoryMovements:', inventoryMovements);
    
    inventoryMovements.forEach((movement: any) => {
      // Verschiedene Produktid-Felder prüfen
      const productId = movement.productId || movement.product_id;
      if (!productId) {
        debug(`Warenbewegung ohne productId gefunden:`, movement);
        return;
      }
      
      if (!groupedMovements[productId]) {
        groupedMovements[productId] = [];
      }
      
      groupedMovements[productId].push(movement);
      console.log(`[DEBUG] Bewegung für Produkt-ID ${productId} gruppiert: ${movement.movementType}`);
    });
    
    console.log('[DEBUG] Gruppierte Bewegungen:', groupedMovements);
    
    // Sortiere Bewegungen nach Datum (neueste zuerst)
    Object.keys(groupedMovements).forEach(productId => {
      groupedMovements[parseInt(productId)].sort((a, b) => 
        new Date(b.performedAt || b.createdAt).getTime() - new Date(a.performedAt || a.createdAt).getTime()
      );
    });
    
    return groupedMovements;
  }, [inventoryMovements, debug]);

  // Gruppiere Batches nach Produkt-ID
  const batchesByProduct = React.useMemo(() => {
    const groupedBatches: Record<number, any[]> = {};
    
    debug(`Verarbeite ${allBatches.length} Batches zum Gruppieren`);
    
    // Filtere Batches mit Null-Werten aus und sortiere  
    const filteredBatches = allBatches // Zeige alle Batches, auch mit Bestand 0
      .sort((a: any, b: any) => {
        const today = new Date();
        const aExpired = new Date(a.expiryDate) < today;
        const bExpired = new Date(b.expiryDate) < today;
        
        // Expired batches nach unten sortieren
        if (aExpired && !bExpired) return 1;
        if (!aExpired && bExpired) return -1;
        
        // Innerhalb der gleichen Kategorie nach Ablaufdatum sortieren
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    
    console.log('[DEBUG] Raw allBatches:', allBatches);
    console.log('[DEBUG] Raw filteredBatches:', filteredBatches);
    
    filteredBatches.forEach((batch: any) => {
      // Verschiedene Produktid-Felder prüfen
      const productId = batch.productId || batch.product_id;
      if (!productId) {
        debug(`Batch ohne productId gefunden:`, batch);
        return;
      }
      
      if (!groupedBatches[productId]) {
        groupedBatches[productId] = [];
      }
      
      groupedBatches[productId].push(batch);
      console.log(`[DEBUG] Batch für Produkt-ID ${productId} gruppiert: ${batch.batchNumber}`);
    });
    
    console.log('[DEBUG] Gruppierte Batches:', groupedBatches);
    
    // Debug-Log für Produkt 21
    if (allBatches.length > 0 && groupedBatches[21]) {
      debug(`Batches für Produkt 21 gefunden: ${groupedBatches[21].length}`, groupedBatches[21]);
    } else if (allBatches.length > 0) {
      debug(`Keine Batches für Produkt 21 gefunden`);
      
      // Suche manuell nach Produkt 21
      const product21Batches = allBatches.filter((batch: any) => batch.productId === 21);
      debug(`Manuelle Suche nach Produkt 21: ${product21Batches.length} Batches gefunden`, product21Batches);
    }
    
    return groupedBatches;
  }, [allBatches, debug]);
  
  // Filtern und Sortieren der Inventardaten
  const filteredAndSortedInventory = React.useMemo(() => {
    // Filtern nach Suchbegriff
    let filteredData = searchTerm.trim() ? 
      (inventory as any[]).filter((item: any) => {
        const searchTermLower = searchTerm.toLowerCase();
        const productName = item.productName || item.product_name || '';
        return (
          productName.toLowerCase().includes(searchTermLower) ||
          (item.category || '').toLowerCase().includes(searchTermLower) ||
          (item.sku || '').toLowerCase().includes(searchTermLower)
        );
      }) : 
      [...(inventory as any[])];
    
    // Sortieren nach ausgewählter Spalte
    filteredData.sort((a: any, b: any) => {
      let valueA, valueB;
      
      // Bestimme die zu vergleichenden Werte basierend auf der Spalte
      switch (sortColumn) {
        case 'productName':
          valueA = (a.productName || a.product_name || '').toLowerCase();
          valueB = (b.productName || b.product_name || '').toLowerCase();
          break;
        case 'category':
          valueA = (a.category || '').toLowerCase();
          valueB = (b.category || '').toLowerCase();
          break;
        case 'sku':
          valueA = (a.sku || '').toLowerCase();
          valueB = (b.sku || '').toLowerCase();
          break;
        case 'batchCount':
          valueA = a.batchCount || a.batch_count || 0;
          valueB = b.batchCount || b.batch_count || 0;
          break;
        case 'quantity':
          valueA = a.quantity || 0;
          valueB = b.quantity || 0;
          break;
        case 'minQuantity':
          valueA = a.minQuantity || a.min_quantity || 0;
          valueB = b.minQuantity || b.min_quantity || 0;
          break;
        default:
          valueA = (a.productName || a.product_name || '').toLowerCase();
          valueB = (b.productName || b.product_name || '').toLowerCase();
      }
      
      // Vergleich für die Sortierrichtung
      if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filteredData;
  }, [inventory, searchTerm, sortColumn, sortDirection]);
  
  // Funktion zum Umschalten der Sortierung
  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      // Wenn die gleiche Spalte angeklickt wird, ändere die Richtung
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Wenn eine neue Spalte angeklickt wird, setze diese als Sortierkriterium (aufsteigend)
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Toggle für expandierte Zeilen
  const toggleRow = (productId: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (expandedRows.has(productId)) {
      newExpandedRows.delete(productId);
    } else {
      newExpandedRows.add(productId);
    }
    setExpandedRows(newExpandedRows);
  };

  // Öffne den Batch-Dialog für ein Produkt
  const openBatchDialog = (product: {id: number, warehouseId: number, name: string}) => {
    setSelectedProduct(product);
    setBatchDialogOpen(true);
  };

  // Status-Badge für den Bestand
  const getStockStatusBadge = (item: any) => {
    if (item.quantity <= 0) {
      return <Badge variant="destructive">Nicht auf Lager</Badge>;
    }
    
    const minQuantity = item.minQuantity || item.min_quantity || 0;
    if (minQuantity > 0 && item.quantity <= minQuantity) {
      return <Badge variant="warning" className="bg-amber-500">Kritisch</Badge>;
    }
    
    return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Auf Lager</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="my-6">
        <CardHeader>
          <CardTitle>Lagerbestand</CardTitle>
          <CardDescription>Ladevorgang...</CardDescription>
        </CardHeader>
        <CardContent className="animate-pulse">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="my-6 bg-red-50 dark:bg-red-900/20">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400">Fehler</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Der Lagerbestand konnte nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  // Manueller Lagerabgleich für alle Produkte
  const triggerWarehouseReconciliation = async () => {
    try {
      const response = await fetch('/api/warehouse-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId,
          syncAllProducts: true,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Lagerabgleich erfolgreich: ${result.message}`);
        window.location.reload(); // Seite neu laden, um aktualisierte Daten anzuzeigen
      } else {
        alert('Fehler beim Lagerabgleich');
      }
    } catch (error) {
      console.error('Fehler beim Auslösen des Lagerabgleichs:', error);
      alert('Fehler beim Lagerabgleich');
    }
  };
  
  // Lagerbestand zurücksetzen (löschen)
  const resetWarehouseInventory = async () => {
    if (!confirm('ACHTUNG: Diese Aktion wird den gesamten Lagerbestand für dieses Lager löschen. Möchten Sie fortfahren?')) {
      return;
    }
    
    try {
      const response = await fetch('/api/reset-warehouse-inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Lagerbestand erfolgreich zurückgesetzt: ${result.message || "Alle Einträge wurden gelöscht."}`);
        window.location.reload(); // Seite neu laden, um aktualisierte Daten anzuzeigen
      } else {
        alert('Fehler beim Zurücksetzen des Lagerbestands');
      }
    } catch (error) {
      console.error('Fehler beim Zurücksetzen des Lagerbestands:', error);
      alert('Fehler beim Zurücksetzen des Lagerbestands');
    }
  };

  return (
    <>
      <Card className="my-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Lagerbestand
            </CardTitle>
          </div>
          <CardDescription>
            Übersicht aller Produkte im Lager mit aktuellen Bestandsmengen
          </CardDescription>
          <div className="relative w-full md:w-96 my-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nach Produkten suchen..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead 
                    className="font-medium cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('productName')}
                  >
                    <div className="flex items-center">
                      Produkt
                      {sortColumn === 'productName' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'productName' && (
                        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="font-medium cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('category')}
                  >
                    <div className="flex items-center">
                      Kategorie
                      {sortColumn === 'category' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'category' && (
                        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>

                  <TableHead 
                    className="font-medium text-right cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('batchCount')}
                  >
                    <div className="flex items-center justify-end">
                      Chargen
                      {sortColumn === 'batchCount' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'batchCount' && (
                        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="font-medium text-right cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('quantity')}
                  >
                    <div className="flex items-center justify-end">
                      Bestand
                      {sortColumn === 'quantity' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'quantity' && (
                        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="font-medium text-right cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('minQuantity')}
                  >
                    <div className="flex items-center justify-end">
                      Min. Bestand
                      {sortColumn === 'minQuantity' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'minQuantity' && (
                        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="font-medium text-center">MHD</TableHead>
                  <TableHead className="font-medium text-center">Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedInventory.length > 0 ? (
                  filteredAndSortedInventory.map((item: any) => {
                    const productId = item.productId || item.product_id;
                    const isExpanded = expandedRows.has(productId);
                    const productBatches = batchesByProduct[productId] || [];
                    const productMovements = movementsByProduct[productId] || [];
                    const hasBatches = productBatches.length > 0;
                    
                    // Debug: Log erweiterte Ansicht (falls nötig)
                    if (isExpanded && (productBatches.length === 0 && productMovements.length === 0)) {
                      debug(`[EXPANDED] Produkt-ID ${productId}: ${productBatches.length} Batches, ${productMovements.length} Bewegungen`);
                    }
                    
                    // Nächstes MHD berechnen
                    let nextExpiryDate = null;
                    let isExpired = false;
                    let isExpiringSoon = false;
                    
                    if (hasBatches) {
                      // Sortiere die Chargen nach Ablaufdatum (aufsteigend)
                      const sortedBatches = [...productBatches].sort((a, b) => {
                        if (!a.expiryDate) return 1;
                        if (!b.expiryDate) return -1;
                        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                      });
                      
                      // Das früheste Ablaufdatum finden
                      if (sortedBatches.length > 0 && sortedBatches[0].expiryDate) {
                        nextExpiryDate = new Date(sortedBatches[0].expiryDate);
                        isExpired = nextExpiryDate < new Date();
                        isExpiringSoon = !isExpired && nextExpiryDate < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                      }
                    }
                    
                    return (
                      <React.Fragment key={`product-${item.id}`}>
                        <TableRow 
                          className={`cursor-pointer ${isExpanded ? 'bg-muted/20' : ''}`}
                          onClick={() => toggleRow(productId)}
                        >
                          <TableCell className="p-2 text-center">
                            {hasBatches ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )
                            ) : (
                              <span className="w-4 h-4 inline-block"></span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{item.product?.productName || item.productName || item.product_name || '-'}</TableCell>
                          <TableCell>{item.product?.category || item.category || '-'}</TableCell>
                          <TableCell className="text-right">
                            {item.batchCount || item.batch_count || productBatches.length || 0}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{item.minQuantity || item.min_quantity || 0}</TableCell>
                          <TableCell className="text-center">
                            {nextExpiryDate ? (
                              <div className="flex items-center justify-center">
                                <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                                <span className={
                                  isExpired ? 'text-destructive font-medium' :
                                  isExpiringSoon ? 'text-amber-500 font-medium' : ''
                                }>
                                  {nextExpiryDate.toLocaleDateString('de-DE')}
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {getStockStatusBadge(item)}
                          </TableCell>
                          <TableCell className="w-8 p-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button 
                                  className="p-1 rounded-sm hover:bg-muted" 
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `/produkte/${productId}`;
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Produkt aufrufen
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `/warenbewegungen?productId=${productId}`;
                                  }}
                                >
                                  <Truck className="h-4 w-4 mr-2" />
                                  Warenbewegung
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `/lager/bewegungshistorie/${productId}`;
                                  }}
                                >
                                  <History className="h-4 w-4 mr-2" />
                                  Bewegungshistorie
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="py-0 bg-muted/10">
                              <div className="px-4 py-2">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium">Chargen</h4>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBatchDialog({
                                        id: item.product?.id || item.productId || item.product_id,
                                        warehouseId: warehouseId,
                                        name: item.productName || item.product_name || 'Unbekanntes Produkt'
                                      });
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    Detailansicht mit Bewegungshistorie
                                  </button>
                                </div>
                                
                                {productBatches.length > 0 ? (
                                  <div className="space-y-2 mb-2">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="py-2">Batch Nr.</TableHead>
                                          <TableHead className="py-2">MHD</TableHead>
                                          <TableHead className="py-2">Eingangsdatum</TableHead>
                                          <TableHead className="py-2 text-right">Menge</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {productBatches.map((batch) => {
                                          const isExpired = new Date(batch.expiryDate) < new Date();
                                          const isExpiringSoon = !isExpired && 
                                            new Date(batch.expiryDate) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                                          
                                          return (
                                            <TableRow key={batch.id} className="border-b border-gray-100">
                                              <TableCell className="py-1.5 text-xs">{batch.batchNumber}</TableCell>
                                              <TableCell className="py-1.5 text-xs">
                                                <div className="flex items-center">
                                                  <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                                                  <span className={
                                                    isExpired ? 'text-destructive font-medium' :
                                                    isExpiringSoon ? 'text-amber-500 font-medium' : ''
                                                  }>
                                                    {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('de-DE') : 'Unbekannt'}
                                                  </span>
                                                </div>
                                              </TableCell>
                                              <TableCell className="py-1.5 text-xs">
                                                {batch.receivedDate ? new Date(batch.receivedDate).toLocaleDateString('de-DE') : 'Unbekannt'}
                                              </TableCell>
                                              <TableCell className="py-1.5 text-xs text-right font-medium">
                                                {batch.currentQuantity || batch.quantity || 0}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <div className="py-2 text-center text-sm text-muted-foreground">
                                    <Package2 className="h-4 w-4 mx-auto mb-1" />
                                    <p>Keine Chargen für dieses Produkt vorhanden</p>
                                  </div>
                                )}

                                {/* Warenbewegungen Sektion */}
                                <div className="mt-4 border-t pt-3">
                                  <h4 className="text-sm font-medium mb-2">Warenbewegungen</h4>
                                  {(() => {
                                    const productMovements = movementsByProduct[productId] || [];
                                    return productMovements.length > 0 ? (
                                      <div className="space-y-1">
                                        {productMovements.slice(0, 5).map((movement, index) => {
                                          const formattedDate = movement.performedAt ? 
                                            format(new Date(movement.performedAt), 'dd.MM.yyyy HH:mm', { locale: de }) : 
                                            (movement.createdAt ? format(new Date(movement.createdAt), 'dd.MM.yyyy HH:mm', { locale: de }) : '--');
                                          
                                          let typeLabel = '';
                                          let typeColor = 'text-muted-foreground';
                                          let detailText = '';
                                          
                                          if (movement.movementType === 'refill' || movement.movementType === 'REFILL' || (movement.movementType === 'OUT' && movement.referenceType === 'refill')) {
                                            typeLabel = '🔧 Refill';
                                            typeColor = 'text-blue-600';
                                            if (movement.machineName) {
                                              detailText = `→ ${movement.machineName}`;
                                            }
                                            // Extrahiere Befüller-Info aus notes
                                            if (movement.notes) {
                                              const befuellerMatch = movement.notes.match(/\(Befüller: ([^)]+)\)/);
                                              if (befuellerMatch) {
                                                detailText = (detailText || '') + ` | Befüller: ${befuellerMatch[1]}`;
                                              }
                                            }
                                          } else if (movement.movementType === 'IN' || movement.movementType === 'receipt') {
                                            typeLabel = '📥 Wareneingang';
                                            typeColor = 'text-green-600';
                                            // Zeige Details aus notes
                                            if (movement.notes) {
                                              const lieferantMatch = movement.notes.match(/von Lieferant ([^,]+)/);
                                              if (lieferantMatch) {
                                                detailText = `von ${lieferantMatch[1]}`;
                                              }
                                            }
                                          } else if (movement.movementType === 'TRANSFER' || movement.movementType === 'transfer') {
                                            typeLabel = '🔄 Transfer';
                                            typeColor = 'text-orange-600';
                                            if (movement.destinationWarehouseName) {
                                              detailText = `→ ${movement.destinationWarehouseName}`;
                                            } else if (movement.notes) {
                                              // Extrahiere Ziel-Lager aus notes
                                              const lagerMatch = movement.notes.match(/nach Lager ([^,]+)/);
                                              if (lagerMatch) {
                                                detailText = `→ ${lagerMatch[1]}`;
                                              }
                                            }
                                          } else if (movement.movementType === 'manual_removal') {
                                            typeLabel = '👤 Manuelle Entnahme';
                                            typeColor = 'text-red-600';
                                          } else if (movement.movementType === 'OUT') {
                                            typeLabel = '📤 Warenausgang';
                                            typeColor = 'text-red-600';
                                          } else {
                                            typeLabel = movement.movementType || 'Unbekannt';
                                          }

                                          return (
                                            <div key={movement.id || index} className="flex flex-col py-1.5 px-2 bg-muted/20 rounded text-xs border-l-2 border-blue-500">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                  <span className={`font-medium ${typeColor}`}>{typeLabel}</span>
                                                  <span className="font-semibold text-foreground">
                                                    -{movement.quantity} Stück
                                                  </span>
                                                  {detailText && (
                                                    <span className="text-muted-foreground">
                                                      {detailText}
                                                    </span>
                                                  )}
                                                  {/* Bestand vorher/nachher prominent anzeigen - benutze displayDescription wenn verfügbar */}
                                                  {movement.displayDescription ? (
                                                    <span className="font-bold text-blue-600">
                                                      {movement.displayDescription}
                                                    </span>
                                                  ) : (movement.previousStock !== undefined || movement.currentStock !== undefined) && (
                                                    <span className="font-bold text-blue-600">
                                                      Bestand: {movement.previousStock !== 'undefined' && movement.previousStock !== null ? movement.previousStock : 'Unbekannt'} → {movement.currentStock !== 'undefined' && movement.currentStock !== null ? movement.currentStock : 'Unbekannt'}
                                                    </span>
                                                  )}
                                                </div>
                                                <span className="text-muted-foreground">{formattedDate}</span>
                                              </div>
                                              {movement.performedByName && (
                                                <div className="text-muted-foreground mt-0.5">
                                                  Befüller: <span className="font-medium text-foreground">{movement.performedByName}</span>
                                                  {movement.machineName && (
                                                    <span className="ml-2">• Automat: <span className="font-medium">{movement.machineName}</span></span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {productMovements.length > 5 && (
                                          <div className="text-xs text-center text-muted-foreground py-1">
                                            ... und {productMovements.length - 5} weitere Bewegungen
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="py-2 text-center text-sm text-muted-foreground">
                                        <History className="h-4 w-4 mx-auto mb-1" />
                                        <p>Keine Warenbewegungen für dieses Produkt vorhanden</p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      {searchTerm ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Search className="h-8 w-8 mb-2" />
                          <p>Keine Produkte für "{searchTerm}" gefunden.</p>
                          <p className="text-sm">Versuchen Sie einen anderen Suchbegriff.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <AlertCircle className="h-8 w-8 mb-2" />
                          <p>Keine Produkte im Lager vorhanden.</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Aktionsbuttons am Ende der Tabelle */}
          <div className="flex justify-end gap-2 mt-6">
            <button 
              onClick={resetWarehouseInventory}
              className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Lagerbestand zurücksetzen
            </button>
            <button 
              onClick={triggerWarehouseReconciliation}
              className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Lagerabgleich mit allen Produkten
            </button>
          </div>
          {filteredAndSortedInventory.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              {filteredAndSortedInventory.length} {filteredAndSortedInventory.length === 1 ? 'Produkt' : 'Produkte'} {searchTerm && 'gefunden'}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Batch-Dialog */}
      <ProductBatchDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        product={selectedProduct}
      />
    </>
  );
};

export default WarehouseInventoryTable;
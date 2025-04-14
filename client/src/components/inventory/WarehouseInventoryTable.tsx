import React, { useState } from 'react';
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
} from 'lucide-react';
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
  
  // API-Abfrage für Inventardaten
  const { data: inventory = [], isLoading, error } = useQuery({
    queryKey: [`/api/inventory/warehouse/${warehouseId}`],
  });
  
  // API-Abfrage für alle Batches des Lagers
  const { data: allBatches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: [`/api/inventory-batches`, warehouseId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/inventory-batches?warehouseId=${warehouseId}`);
        if (!response.ok) return [];
        return response.json();
      } catch (error) {
        console.error("Fehler beim Laden der Batches:", error);
        return [];
      }
    },
    enabled: !!warehouseId,
  });
  
  // Gruppiere Batches nach Produkt-ID
  const batchesByProduct = React.useMemo(() => {
    const groupedBatches: Record<number, any[]> = {};
    
    allBatches.forEach((batch: any) => {
      if (!batch.productId) return;
      
      if (!groupedBatches[batch.productId]) {
        groupedBatches[batch.productId] = [];
      }
      
      groupedBatches[batch.productId].push(batch);
    });
    
    return groupedBatches;
  }, [allBatches]);
  
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
            <div className="flex gap-2">
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
                    className="font-medium cursor-pointer hover:bg-muted/20"
                    onClick={() => toggleSort('sku')}
                  >
                    <div className="flex items-center">
                      SKU
                      {sortColumn === 'sku' && (
                        sortDirection === 'asc' ? 
                          <ArrowUp className="ml-1 h-4 w-4" /> : 
                          <ArrowDown className="ml-1 h-4 w-4" />
                      )}
                      {sortColumn !== 'sku' && (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedInventory.length > 0 ? (
                  filteredAndSortedInventory.map((item: any) => {
                    const productId = item.productId || item.product_id;
                    const isExpanded = expandedRows.has(productId);
                    const productBatches = batchesByProduct[productId] || [];
                    const hasBatches = productBatches.length > 0;
                    
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
                      <React.Fragment key={item.id}>
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
                          <TableCell className="font-medium">{item.productName || item.product_name || '-'}</TableCell>
                          <TableCell>{item.category || '-'}</TableCell>
                          <TableCell>{item.sku || '-'}</TableCell>
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
                                        id: productId,
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
                                                {batch.quantity || 0}
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
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleAlert, Package, Search, PlusCircle, ClockIcon, AlertTriangle, History, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isBefore, isAfter, isEqual, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import NewBatchDialog from './NewBatchDialog';
import BatchDetailDialog from './BatchDetailDialog';

// FIFO-Sortierfunktion für Chargen (älteste Charge zuerst)
const sortBatchesByFIFO = (batches: any[]) => {
  return [...batches].sort((a, b) => {
    // Zuerst nach Ablaufdatum sortieren (ältestes zuerst)
    const dateA = parseISO(a.expiryDate);
    const dateB = parseISO(b.expiryDate);
    
    if (isBefore(dateA, dateB)) return -1;
    if (isAfter(dateA, dateB)) return 1;
    
    // Bei gleichem Ablaufdatum nach Eingangsdatum sortieren (ältestes zuerst)
    const incomingDateA = parseISO(a.incomingDate);
    const incomingDateB = parseISO(b.incomingDate);
    
    if (isBefore(incomingDateA, incomingDateB)) return -1;
    if (isAfter(incomingDateA, incomingDateB)) return 1;
    
    return 0;
  });
};

export default function InventoryBatches() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showExpiringSoon, setShowExpiringSoon] = useState<boolean>(false);
  const [isNewBatchDialogOpen, setIsNewBatchDialogOpen] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState<boolean>(false);
  
  const queryClient = useQueryClient();

  // Query für Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Query für Produkte
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Query für Chargen
  const { data: batches, isLoading: batchesLoading, error } = useQuery({
    queryKey: ['/api/inventory-batches', { 
      warehouseId: selectedWarehouse !== 'all' ? parseInt(selectedWarehouse) : undefined,
      productId: selectedProduct !== 'all' ? parseInt(selectedProduct) : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      expiringSoon: showExpiringSoon
    }],
    staleTime: 1000 * 30, // 30 Sekunden
  });

  // Rendering bei Ladevorgang
  if (warehousesLoading || productsLoading || batchesLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[200px]" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Rendering bei Fehler
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-center">
        <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">Fehler beim Laden der Chargen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Chargen ist ein Fehler aufgetreten.'}
        </p>
      </div>
    );
  }

  // Filtere Chargen basierend auf der Suche
  const filteredBatches = batches 
    ? batches.filter((batch: any) => 
        batch.batchNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        batch.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        batch.warehouseName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        batch.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Sortiere Chargen nach FIFO-Prinzip
  const sortedBatches = sortBatchesByFIFO(filteredBatches);

  // Status-Badge anzeigen, basierend auf Status und Ablaufdatum
  const getBatchStatusBadge = (batch: any) => {
    const today = new Date();
    const expiryDate = parseISO(batch.expiryDate);
    const thirtyDaysFromNow = addDays(today, 30);
    
    if (batch.status === 'expired' || isBefore(expiryDate, today)) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Abgelaufen
        </Badge>
      );
    } else if (batch.status === 'consumed') {
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-800 hover:bg-slate-100 flex items-center gap-1">
          <History className="h-3 w-3" />
          Verbraucht
        </Badge>
      );
    } else if (batch.status === 'quarantine') {
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Quarantäne
        </Badge>
      );
    } else if (isBefore(expiryDate, thirtyDaysFromNow)) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
          <ClockIcon className="h-3 w-3" />
          Läuft bald ab
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          Aktiv
        </Badge>
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter-Bereich */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full sm:w-auto">
          <div className="space-y-2">
            <Label htmlFor="warehouse">Lager</Label>
            <Select 
              value={selectedWarehouse} 
              onValueChange={setSelectedWarehouse}
            >
              <SelectTrigger id="warehouse">
                <SelectValue placeholder="Alle Lager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lager</SelectItem>
                {warehouses?.map((warehouse: any) => (
                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="product">Produkt</Label>
            <Select 
              value={selectedProduct} 
              onValueChange={setSelectedProduct}
            >
              <SelectTrigger id="product">
                <SelectValue placeholder="Alle Produkte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Produkte</SelectItem>
                {products?.map((product: any) => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.productName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={selectedStatus} 
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="consumed">Verbraucht</SelectItem>
                <SelectItem value="expired">Abgelaufen</SelectItem>
                <SelectItem value="quarantine">Quarantäne</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="search">Suche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Chargen-Nr, Produkt oder Lager..."
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant={showExpiringSoon ? "default" : "outline"} 
            onClick={() => setShowExpiringSoon(!showExpiringSoon)}
            className="whitespace-nowrap"
          >
            <ClockIcon className="mr-2 h-4 w-4" />
            {showExpiringSoon ? "Alle anzeigen" : "Bald ablaufend"}
          </Button>

          <Button 
            className="whitespace-nowrap" 
            onClick={() => setIsNewBatchDialogOpen(true)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Neue Charge
          </Button>
        </div>
      </div>

      {/* Haupttabelle */}
      {sortedBatches.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Chargen gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || showExpiringSoon || selectedStatus !== 'all' || selectedProduct !== 'all' || selectedWarehouse !== 'all'
              ? "Es wurden keine Chargen gefunden, die den Filterkriterien entsprechen."
              : "Es wurden noch keine Chargen angelegt."}
          </p>
          <Button onClick={() => setIsNewBatchDialogOpen(true)}>
            Neue Charge anlegen
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chargen-Nr.</TableHead>
                <TableHead>Produkt</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead>MHD</TableHead>
                <TableHead>Eingang</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBatches.map((batch: any) => (
                <TableRow key={batch.id} className={
                  batch.status === 'expired' || isBefore(parseISO(batch.expiryDate), new Date())
                    ? 'bg-red-50'
                    : isBefore(parseISO(batch.expiryDate), addDays(new Date(), 30))
                      ? 'bg-amber-50'
                      : ''
                }>
                  <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                  <TableCell>{batch.productName || "Unbekanntes Produkt"}</TableCell>
                  <TableCell>{batch.warehouseName || "Unbekanntes Lager"}</TableCell>
                  <TableCell className="text-right">{batch.quantity}</TableCell>
                  <TableCell>
                    {format(parseISO(batch.expiryDate), 'dd.MM.yyyy', { locale: de })}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(batch.incomingDate), 'dd.MM.yyyy', { locale: de })}
                  </TableCell>
                  <TableCell className="text-center">
                    {getBatchStatusBadge(batch)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={batch.notes || ""}>
                    {batch.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setIsDetailDialogOpen(true);
                      }}
                      title="Details anzeigen"
                      className="ml-auto"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog zum Anlegen einer neuen Charge */}
      <NewBatchDialog 
        open={isNewBatchDialogOpen} 
        onOpenChange={setIsNewBatchDialogOpen}
        warehouses={warehouses || []}
        products={products || []}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/inventory-batches'] });
          queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
        }}
      />

      {/* Dialog zum Anzeigen von Chargen-Details */}
      <BatchDetailDialog
        batchId={selectedBatchId}
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
      />
    </div>
  );
}
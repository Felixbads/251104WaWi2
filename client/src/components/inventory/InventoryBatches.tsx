import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar, PackageOpen, Search, 
  PackagePlus, RefreshCw, FilterX, Loader2, AlertTriangle 
} from 'lucide-react';
import { differenceInDays, format, isBefore, isPast, parseISO } from 'date-fns';
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

// Placeholder-Komponente für die Chargen-Verwaltung
export default function InventoryBatches() {
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Lade Charge-Daten
  const {
    data: batches = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/inventory-batches', { 
      warehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
      status: statusFilter || undefined
    }],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Lagerdaten für das Dropdown
  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Suche und Filterung
  const filteredBatches = Array.isArray(batches) ? batches.filter(batch => {
    const matchesSearch = !searchTerm || 
      (batch.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.productName?.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesWarehouse = !warehouseFilter || batch.warehouseId === parseInt(warehouseFilter);
    const matchesStatus = !statusFilter || batch.status === statusFilter;
    
    return matchesSearch && matchesWarehouse && matchesStatus;
  }) : [];

  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Chargen werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">Fehler beim Laden der Chargen</h3>
        <p className="text-muted-foreground mt-1">
          {(error as any).message || 'Unbekannter Fehler'}
        </p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }
  
  return (
    <div>
      {/* Filter und Suchleiste */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Produkt oder Chargennummer suchen..."
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
        
        <div className="w-full md:w-52">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Alle Lager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {Array.isArray(warehouses) ? warehouses.map((warehouse: any) => (
                <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                  {warehouse.name}
                </SelectItem>
              )) : []}
            </SelectContent>
          </Select>
        </div>
        
        <div className="w-full md:w-52">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
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
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button>
            <PackagePlus className="h-4 w-4 mr-2" />
            Neue Charge
          </Button>
        </div>
      </div>
      
      {/* Chargentabelle */}
      {filteredBatches.length === 0 ? (
        <div className="rounded-md bg-muted/50 p-8 text-center">
          <PackageOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">Keine Chargen gefunden</h3>
          <p className="text-muted-foreground mt-1">
            Es wurden keine Chargen für die aktuelle Filterauswahl gefunden.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableCaption>
              {filteredBatches.length} Chargen {warehouseFilter ? `in Lager #${warehouseFilter}` : 'in allen Lagern'}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Chargennummer</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead className="text-center">Menge</TableHead>
                <TableHead className="text-center">MHD</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.map((batch: any) => {
                // MHD-Status berechnen
                const expiryDate = parseISO(batch.expiryDate);
                const today = new Date();
                const daysUntilExpiry = differenceInDays(expiryDate, today);
                
                const isExpired = isPast(expiryDate);
                const isExpiringSoon = !isExpired && daysUntilExpiry <= 30;
                
                // Verbrauchsstatus berechnen
                const consumptionPercentage = 
                  batch.initialQuantity > 0 
                    ? Math.min(100, Math.max(0, 100 - ((batch.quantity / batch.initialQuantity) * 100)))
                    : 0;
                
                return (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">
                      {batch.productName}
                    </TableCell>
                    
                    <TableCell>
                      {batch.batchNumber}
                    </TableCell>
                    
                    <TableCell>
                      {batch.warehouseName}
                    </TableCell>
                    
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span>{batch.quantity} / {batch.initialQuantity || batch.quantity}</span>
                        <Progress
                          value={consumptionPercentage}
                          className="h-1.5 w-20 mt-1"
                        />
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center justify-center space-x-1">
                        <Calendar className={`h-3.5 w-3.5 ${
                          isExpired 
                            ? 'text-destructive' 
                            : isExpiringSoon 
                              ? 'text-amber-500' 
                              : 'text-muted-foreground'
                        }`} />
                        <span className={`text-sm ${
                          isExpired 
                            ? 'text-destructive font-medium' 
                            : isExpiringSoon 
                              ? 'text-amber-500' 
                              : ''
                        }`}>
                          {format(expiryDate, 'dd.MM.yyyy')}
                          {!isExpired && daysUntilExpiry <= 60 && (
                            <span className="text-xs ml-1">
                              ({daysUntilExpiry} Tage)
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-right">
                      {batch.status === 'active' && (
                        <Badge variant={
                          isExpired 
                            ? 'destructive' 
                            : isExpiringSoon 
                              ? 'default' 
                              : 'outline'
                        }>
                          {isExpired ? 'Abgelaufen' : isExpiringSoon ? 'Läuft bald ab' : 'Aktiv'}
                        </Badge>
                      )}
                      
                      {batch.status === 'consumed' && (
                        <Badge variant="secondary">Verbraucht</Badge>
                      )}
                      
                      {batch.status === 'quarantine' && (
                        <Badge variant="destructive">Quarantäne</Badge>
                      )}
                      
                      {batch.status === 'returned' && (
                        <Badge variant="outline">Zurückgegeben</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
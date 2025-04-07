import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  ArrowLeftRight, SearchIcon, FilterX, 
  ArrowRight, ArrowLeft, RefreshCw, Loader2, AlertTriangle,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';

// Placeholder-Komponente für die Warenbewegungen
export default function InventoryMovements() {
  const [searchTerm, setSearchTerm] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  
  // Lade Bewegungsdaten
  const {
    data: movements = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/inventory-movements', { 
      sourceWarehouseId: 
        movementTypeFilter === 'OUT' ? (warehouseFilter ? parseInt(warehouseFilter) : undefined) : undefined,
      destinationWarehouseId: 
        movementTypeFilter === 'IN' ? (warehouseFilter ? parseInt(warehouseFilter) : undefined) : undefined,
      movementType: movementTypeFilter || undefined,
      limit: 50
    }],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Lagerdaten für das Dropdown
  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Suche und Filterung
  const filteredMovements = Array.isArray(movements) ? movements.filter(movement => {
    const matchesSearch = !searchTerm || 
      (movement.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       movement.notes?.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesType = !movementTypeFilter || movement.movementType === movementTypeFilter;
    
    const matchesWarehouse = !warehouseFilter || 
      (movement.sourceWarehouseId === parseInt(warehouseFilter) || 
       movement.destinationWarehouseId === parseInt(warehouseFilter));
    
    return matchesSearch && matchesType && matchesWarehouse;
  }) : [];

  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Warenbewegungen werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">Fehler beim Laden der Warenbewegungen</h3>
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
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Produkt oder Notizen suchen..."
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
          <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Alle Bewegungen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Bewegungen</SelectItem>
              <SelectItem value="IN">Eingänge</SelectItem>
              <SelectItem value="OUT">Ausgänge</SelectItem>
              <SelectItem value="TRANSFER">Umlagerungen</SelectItem>
              <SelectItem value="ADJUST">Anpassungen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="w-full md:w-52">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Alle Lager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {warehouses.map((warehouse: any) => (
                <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                  {warehouse.name}
                </SelectItem>
              ))}
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
          
          <Button
            onClick={() => window.location.href = '/inventory/movements/new'}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neue Bewegung
          </Button>
        </div>
      </div>
      
      {/* Bewegungstabelle */}
      {filteredMovements.length === 0 ? (
        <div className="rounded-md bg-muted/50 p-8 text-center">
          <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">Keine Warenbewegungen gefunden</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Es wurden keine Warenbewegungen für die aktuelle Filterauswahl gefunden.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableCaption>
              {filteredMovements.length} Warenbewegungen
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Produkt</TableHead>
                <TableHead>Menge</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Quelle / Ziel</TableHead>
                <TableHead>Referenz</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.map((movement: any) => (
                <TableRow key={movement.id}>
                  <TableCell className="font-medium">
                    {movement.createdAt && format(
                      parseISO(movement.createdAt), 
                      'dd.MM.yyyy HH:mm'
                    )}
                  </TableCell>
                  
                  <TableCell>
                    {movement.productName}
                  </TableCell>
                  
                  <TableCell>
                    {movement.quantity}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center whitespace-nowrap">
                      {movement.movementType === 'IN' && (
                        <>
                          <ArrowRight className="h-4 w-4 mr-1 text-emerald-500" />
                          <span>Eingang</span>
                        </>
                      )}
                      
                      {movement.movementType === 'OUT' && (
                        <>
                          <ArrowLeft className="h-4 w-4 mr-1 text-amber-500" />
                          <span>Ausgang</span>
                        </>
                      )}
                      
                      {movement.movementType === 'TRANSFER' && (
                        <>
                          <ArrowLeftRight className="h-4 w-4 mr-1 text-blue-500" />
                          <span>Umlagerung</span>
                        </>
                      )}
                      
                      {movement.movementType === 'ADJUST' && (
                        <>
                          <ArrowLeftRight className="h-4 w-4 mr-1 text-purple-500" />
                          <span>Anpassung</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {movement.movementType === 'IN' && movement.destinationWarehouseName && (
                      <span>Nach: {movement.destinationWarehouseName}</span>
                    )}
                    
                    {movement.movementType === 'OUT' && movement.sourceWarehouseName && (
                      <span>Von: {movement.sourceWarehouseName}</span>
                    )}
                    
                    {movement.movementType === 'TRANSFER' && (
                      <span>
                        {movement.sourceWarehouseName} → {movement.destinationWarehouseName}
                      </span>
                    )}
                    
                    {movement.movementType === 'ADJUST' && movement.sourceWarehouseName && (
                      <span>In: {movement.sourceWarehouseName}</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <div>
                      <div className="text-xs text-muted-foreground">{movement.referenceType}</div>
                      <div>{movement.notes}</div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-right">
                    {movement.status === 'completed' && (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500">
                        Abgeschlossen
                      </Badge>
                    )}
                    
                    {movement.status === 'pending' && (
                      <Badge variant="outline" className="text-amber-500 border-amber-500">
                        Ausstehend
                      </Badge>
                    )}
                    
                    {movement.status === 'cancelled' && (
                      <Badge variant="outline" className="text-destructive border-destructive">
                        Storniert
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
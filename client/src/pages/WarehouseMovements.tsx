import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// UI Komponenten
import {
  ChevronLeft,
  Download,
  Filter,
  Truck,
  FileDown,
  FileUp,
  Package,
  RefreshCw,
  ShoppingCart,
  User,
  RotateCw,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// Typ-Definitionen
interface WarehouseMovement {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  sourceWarehouseId: number | null;
  sourceWarehouseName: string | null;
  destinationWarehouseId: number | null;
  destinationWarehouseName: string | null;
  machineId: number | null;
  machineName: string | null;
  movementType: string;
  referenceType: string;
  referenceId: string | null;
  notes: string | null;
  performedBy: number | null;
  performedByName: string | null;
  performedAt: string;
  createdAt: string;
  unit: string | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
}

// Hilfsfunktionen
const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
  } catch (error) {
    return 'Ungültiges Datum';
  }
};

const getMovementTypeLabel = (type: string) => {
  switch (type) {
    case 'IN': return 'Eingang';
    case 'OUT': return 'Ausgang';
    case 'TRANSFER': return 'Umlagerung';
    case 'ADJUSTMENT': return 'Korrektur';
    case 'REFILL': return 'Auffüllung';
    case 'MANUAL': return 'Manuell';
    default: return type;
  }
};

const getMovementTypeIcon = (type: string) => {
  switch (type) {
    case 'IN': return <FileDown className="h-4 w-4 mr-1" />;
    case 'OUT': return <FileUp className="h-4 w-4 mr-1" />;
    case 'TRANSFER': return <RotateCw className="h-4 w-4 mr-1" />;
    case 'ADJUSTMENT': return <AlertTriangle className="h-4 w-4 mr-1" />;
    case 'REFILL': return <ShoppingCart className="h-4 w-4 mr-1" />;
    case 'MANUAL': return <Package className="h-4 w-4 mr-1" />;
    default: return null;
  }
};

const getMovementBadgeVariant = (type: string) => {
  switch (type) {
    case 'IN': return 'default';
    case 'OUT': return 'destructive';
    case 'TRANSFER': return 'secondary';
    case 'ADJUSTMENT': return 'outline';
    case 'REFILL': return 'destructive';
    case 'MANUAL': return 'outline';
    default: return 'default';
  }
};

// Hauptkomponente
export default function WarehouseMovements() {
  const params = useParams();
  const warehouseId = Number(params.id);
  const [, setLocation] = useLocation();
  
  const queryClient = useQueryClient();
  
  // Status und Filter
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)), // Letzte Woche
    endDate: new Date(),
    productName: '',
    movementType: '',
    userId: ''
  });
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Zeitraumauswahl-Status
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  
  // Abfragen der Lagerdaten
  const { data: warehouse, isLoading: warehouseLoading } = useQuery({
    queryKey: ['/api/warehouses', warehouseId],
    enabled: !!warehouseId
  });
  
  // Abfragen aller Warenbewegungen über die neue konsolidierte API-Route
  const {
    data: combinedMovements = [],
    isLoading: movementsLoading,
    error: movementsError,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'movements', filters, page, pageSize],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString()
      });
      
      if (filters.productName) queryParams.append('productName', filters.productName);
      if (filters.movementType) queryParams.append('movementType', filters.movementType);
      if (filters.userId) queryParams.append('userId', filters.userId);
      
      if (filters.startDate) {
        queryParams.append('startDate', filters.startDate.toISOString());
      }
      
      if (filters.endDate) {
        queryParams.append('endDate', filters.endDate.toISOString());
      }
      
      console.log(`Requesting warehouse movements with params: ${queryParams.toString()}`);
      
      try {
        const response = await fetch(`/api/warehouses/${warehouseId}/movements?${queryParams.toString()}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API Error:', errorData);
          throw new Error(`Fehler beim Laden der Warenbewegungen: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.length} warehouse movement records`);
        return data;
      } catch (error) {
        console.error('Error fetching warehouse movements:', error);
        throw error;
      }
    },
    enabled: !!warehouseId
  });
  
  const totalPages = Math.ceil(combinedMovements.length / pageSize);
  
  // Paginierte Bewegungen
  const paginatedMovements = combinedMovements.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  
  // Seite zurücksetzen, wenn Filter geändert werden
  useEffect(() => {
    setPage(1);
  }, [filters]);
  
  // Filter zurücksetzen
  const resetFilters = () => {
    setFilters({
      startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
      endDate: new Date(),
      productName: '',
      movementType: '',
      userId: ''
    });
  };
  
  // Fehlerbehandlung
  const isError = movementsError;
  if (isError) {
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/lager/${warehouseId}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
        </div>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Fehler beim Laden der Daten</h2>
              <p className="text-muted-foreground mb-4">
                Die Warenbewegungen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
              </p>
              <Button 
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'movements'] });
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Lade-Indikator
  if (warehouseLoading || movementsLoading) {
    return (
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/lager/${warehouseId}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
        </div>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="h-12 w-12 animate-spin mb-4" />
              <p className="text-muted-foreground">Lade Warenbewegungen...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Hauptansicht
  return (
    <div className="container py-6 space-y-6">
      {/* Kopfzeile mit Navigationslinks und Filtern */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/lager/${warehouseId}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
          
          <h1 className="text-xl font-semibold">
            Warenbewegungen: {warehouse?.name || 'Lager'}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filter für Warenbewegungen</SheetTitle>
                <SheetDescription>
                  Schränken Sie die angezeigten Warenbewegungen nach bestimmten Kriterien ein.
                </SheetDescription>
              </SheetHeader>
              
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Zeitraum von</Label>
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                        id="startDate"
                      >
                        {filters.startDate ? (
                          format(filters.startDate, "dd.MM.yyyy", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.startDate}
                        onSelect={(date) => {
                          setFilters({ ...filters, startDate: date || new Date() });
                          setStartDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="endDate">bis</Label>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                        id="endDate"
                      >
                        {filters.endDate ? (
                          format(filters.endDate, "dd.MM.yyyy", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.endDate}
                        onSelect={(date) => {
                          setFilters({ ...filters, endDate: date || new Date() });
                          setEndDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="productName">Produkt</Label>
                  <Input
                    id="productName"
                    placeholder="Produktnamen eingeben"
                    value={filters.productName}
                    onChange={(e) => setFilters({ ...filters, productName: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="movementType">Bewegungstyp</Label>
                  <Select
                    value={filters.movementType}
                    onValueChange={(value) => setFilters({ ...filters, movementType: value })}
                  >
                    <SelectTrigger id="movementType">
                      <SelectValue placeholder="Alle Typen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Alle Typen</SelectItem>
                      <SelectItem value="IN">Eingang</SelectItem>
                      <SelectItem value="OUT">Ausgang</SelectItem>
                      <SelectItem value="TRANSFER">Umlagerung</SelectItem>
                      <SelectItem value="ADJUSTMENT">Korrektur</SelectItem>
                      <SelectItem value="REFILL">Auffüllung</SelectItem>
                      <SelectItem value="MANUAL">Manuell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <SheetFooter>
                <Button variant="outline" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
                <SheetClose asChild>
                  <Button onClick={() => setIsFilterSheetOpen(false)}>
                    Anwenden
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'movements'] });
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
          
          <Button variant="outline" size="sm" disabled>
            <Download className="mr-2 h-4 w-4" />
            Exportieren
          </Button>
        </div>
      </div>
      
      {/* Hauptinhalt: Tabelle mit Warenbewegungen */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
              <CardTitle>Warenbewegungen</CardTitle>
              <CardDescription>
                Alle Ein- und Ausgänge sowie Anpassungen des Lagerbestands
              </CardDescription>
            </div>
            
            <div className="flex items-center mt-2 sm:mt-0">
              <Label htmlFor="pageSize" className="mr-2">Einträge:</Label>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger id="pageSize" className="w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {combinedMovements.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Menge</TableHead>
                    <TableHead>Quelle/Ziel</TableHead>
                    <TableHead>Benutzer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMovements.map((movement) => (
                    <TableRow key={`${movement.movementType}-${movement.id}`}>
                      <TableCell className="font-medium">
                        {formatDate(movement.performedAt || movement.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getMovementBadgeVariant(movement.movementType)}>
                          <div className="flex items-center">
                            {getMovementTypeIcon(movement.movementType)}
                            {getMovementTypeLabel(movement.movementType)}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>{movement.productName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{Math.abs(Number(movement.quantity))} {movement.unit || 'Stk.'}</span>
                          {(movement.quantityBefore !== null && movement.quantityAfter !== null) && (
                            <span className="text-xs text-muted-foreground">
                              Vorher: {movement.quantityBefore} → Nachher: {movement.quantityAfter}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {movement.movementType === 'IN' && (
                          <div className="flex flex-col">
                            <span>Eingang → {movement.destinationWarehouseName}</span>
                            {movement.referenceType === 'ORDER' && (
                              <span className="text-xs text-muted-foreground">
                                Bestellung: {movement.referenceId}
                              </span>
                            )}
                          </div>
                        )}
                        {movement.movementType === 'OUT' && (
                          <div className="flex flex-col">
                            <span>{movement.sourceWarehouseName} → Ausgang</span>
                          </div>
                        )}
                        {movement.movementType === 'TRANSFER' && (
                          <div className="flex flex-col">
                            <span>{movement.sourceWarehouseName} → {movement.destinationWarehouseName}</span>
                          </div>
                        )}
                        {movement.movementType === 'REFILL' && (
                          <div className="flex flex-col">
                            <span>{movement.sourceWarehouseName} → {movement.machineName}</span>
                          </div>
                        )}
                        {movement.movementType === 'ADJUSTMENT' && (
                          <div className="flex flex-col">
                            <span>{Number(movement.quantity) > 0 ? 'Hinzugefügt' : 'Entfernt'}</span>
                            <span className="text-xs text-muted-foreground">
                              {movement.notes || 'Manuelle Anpassung'}
                            </span>
                          </div>
                        )}
                        {movement.movementType === 'MANUAL' && (
                          <div className="flex flex-col">
                            <span>{movement.sourceWarehouseName ? `${movement.sourceWarehouseName} →` : ''} {movement.notes || 'Manuelle Bewegung'}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1 text-muted-foreground" />
                          <span>{movement.performedByName || 'System'}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Warenbewegungen gefunden</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                Es wurden keine Warenbewegungen für dieses Lager im angegebenen Zeitraum gefunden.
                Versuchen Sie es mit anderen Filtereinstellungen oder einem längeren Zeitraum.
              </p>
              <Button variant="outline" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            </div>
          )}
          
          {/* Pagination */}
          {combinedMovements.length > 0 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                </PaginationItem>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNumber;
                  if (totalPages <= 5) {
                    pageNumber = i + 1;
                  } else {
                    if (page <= 3) {
                      pageNumber = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = page - 2 + i;
                    }
                  }
                  
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        onClick={() => setPage(pageNumber)}
                        isActive={page === pageNumber}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                {totalPages > 5 && page < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
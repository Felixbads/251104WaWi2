import { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, subDays, isAfter, isBefore, isEqual } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, Filter, Loader2, Package, RefreshCw, Search, AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';

export default function WarehouseMovements() {
  const { id } = useParams();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date()
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Load warehouse data
  const {
    data: warehouse = {} as Record<string, any>,
    isLoading: warehouseLoading,
    error: warehouseError
  } = useQuery({
    queryKey: ['/api/warehouses', id],
  });

  // Load movement data
  const {
    data: movements = [],
    isLoading: movementsLoading,
    error: movementsError,
    refetch: refetchMovements
  } = useQuery({
    queryKey: ['/api/inventory-movements', { 
      warehouseId: id, 
      startDate: dateRange?.from?.toISOString(), 
      endDate: dateRange?.to?.toISOString()
    }],
  });

  // Load refills that used products from this warehouse
  const {
    data: refills = [],
    isLoading: refillsLoading,
    error: refillsError,
    refetch: refetchRefills
  } = useQuery({
    queryKey: ['/api/refills', { 
      warehouseId: id,
      startDate: dateRange?.from?.toISOString(),
      endDate: dateRange?.to?.toISOString()
    }],
  });

  // Load products for filter dropdown
  const {
    data: products = [],
    isLoading: productsLoading,
  } = useQuery({
    queryKey: ['/api/products'],
  });

  // Load machines assigned to this warehouse
  const {
    data: machineAssignments = [],
    isLoading: machineAssignmentsLoading,
  } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', { warehouseId: id }],
  });

  // Load users for filter dropdown
  const {
    data: users = [],
    isLoading: usersLoading,
  } = useQuery({
    queryKey: ['/api/users'],
  });

  // Combine movements and refills
  const combinedMovements = useMemo(() => {
    if (!movements || !refills) return [];
    
    // Convert refills to match movement format
    const refillMovementsArray = Array.isArray(refills) 
      ? refills.flatMap((refill: any) => {
          if (refill.details && Array.isArray(refill.details)) {
            return refill.details.map((detail: any) => ({
              id: `refill-${refill.id}-${detail.id}`,
              productId: detail.productId,
              productName: detail.productName,
              quantity: detail.removed * -1, // Removed items as negative
              movementType: "REFILL",
              type: "OUT",
              createdAt: refill.datetime,
              performedAt: refill.datetime,
              source: "vendon",
              machineId: refill.machineId,
              machineName: refill.machineName,
              notes: `Auffüllung von Automat ${refill.machineName}`,
              operatorName: refill.operator || "Unbekannt",
              // These would be used for filtering
              referenceType: "REFILL",
              referenceId: refill.id.toString(),
              sourceWarehouseId: Number(id),
              destinationWarehouseId: null,
              unit: detail.unit || "Stk"
            }));
          }
          return [];
        })
      : [];
    
    // Add unit and user info to movement data if missing
    const enhancedMovements = Array.isArray(movements) 
      ? movements.map((movement: any) => ({
          ...movement,
          unit: movement.unit || "Stk",
          operatorName: movement.performedBy && Array.isArray(users)
            ? users.find((u: any) => u.id === movement.performedBy)?.username || "Unbekannt"
            : "Unbekannt"
        }))
      : [];
    
    // Combine and sort by date (newest first)
    return [...enhancedMovements, ...refillMovementsArray].sort((a: any, b: any) => {
      const dateA = new Date(a.performedAt || a.createdAt);
      const dateB = new Date(b.performedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [movements, refills, users, id]);

  // Apply filters to combined movements
  const filteredMovements = useMemo(() => {
    return combinedMovements.filter((movement: any) => {
      // Filter by search term (product name or notes)
      const matchesSearch = !searchTerm || 
        (movement.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         movement.notes?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Filter by movement type
      const matchesType = !movementTypeFilter || movement.movementType === movementTypeFilter;
      
      // Filter by machine
      const matchesMachine = !machineFilter || 
        (movement.machineId && movement.machineId.toString() === machineFilter);
      
      // Filter by user
      const matchesUser = !userFilter || 
        (movement.performedBy && movement.performedBy.toString() === userFilter) ||
        (movement.operatorName && movement.operatorName.toLowerCase().includes(userFilter.toLowerCase()));
      
      // Filter by date range
      let matchesDateRange = true;
      if (dateRange?.from || dateRange?.to) {
        const movementDate = new Date(movement.performedAt || movement.createdAt);
        
        if (dateRange.from && dateRange.to) {
          // Set time to beginning/end of day for proper comparison
          const fromDate = new Date(dateRange.from);
          fromDate.setHours(0, 0, 0, 0);
          
          const toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          
          matchesDateRange = (
            (isAfter(movementDate, fromDate) || isEqual(movementDate, fromDate)) && 
            (isBefore(movementDate, toDate) || isEqual(movementDate, toDate))
          );
        } else if (dateRange.from) {
          const fromDate = new Date(dateRange.from);
          fromDate.setHours(0, 0, 0, 0);
          matchesDateRange = isAfter(movementDate, fromDate) || isEqual(movementDate, fromDate);
        } else if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          matchesDateRange = isBefore(movementDate, toDate) || isEqual(movementDate, toDate);
        }
      }
      
      // Apply tab-specific filters
      const matchesTab = 
        activeTab === "all" ||
        (activeTab === "in" && movement.type === "IN") ||
        (activeTab === "out" && movement.type === "OUT") ||
        (activeTab === "refill" && movement.movementType === "REFILL");
      
      return matchesSearch && matchesType && matchesMachine && matchesUser && matchesDateRange && matchesTab;
    });
  }, [
    combinedMovements, 
    searchTerm, 
    movementTypeFilter, 
    machineFilter, 
    userFilter, 
    dateRange,
    activeTab
  ]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setMovementTypeFilter('');
    setMachineFilter('');
    setUserFilter('');
    setDateRange({
      from: subDays(new Date(), 7),
      to: new Date()
    });
  };

  // Handle manual refresh
  const handleRefresh = () => {
    refetchMovements();
    refetchRefills();
    toast({
      title: "Aktualisiert",
      description: "Die Warenbewegungen wurden aktualisiert."
    });
  };

  // Format movement type for display
  const formatMovementType = (type: string, movementType: string) => {
    if (movementType === "REFILL") return "Refill";
    
    if (type === "IN") {
      if (movementType === "ORDER") return "Wareneingang (Bestellung)";
      if (movementType === "TRANSFER") return "Umlagerung";
      if (movementType === "ADJUSTMENT") return "Bestandskorrektur";
      if (movementType === "MANUAL") return "Manueller Eingang";
      return "Wareneingang";
    } else {
      if (movementType === "TRANSFER") return "Umlagerung";
      if (movementType === "ADJUSTMENT") return "Bestandskorrektur";
      if (movementType === "MANUAL") return "Manuelle Entnahme";
      return "Warenausgang";
    }
  };

  // Error handling
  if (warehouseLoading) {
    return (
      <div className="container py-10">
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }
  
  if (warehouseError) {
    return (
      <div className="container py-10">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden des Lagers</AlertTitle>
          <AlertDescription>
            {warehouseError instanceof Error 
              ? warehouseError.message 
              : "Ein unbekannter Fehler ist aufgetreten."}
          </AlertDescription>
        </Alert>
        
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation(`/lager/${id}`)}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zum Lager
        </Button>
      </div>
    );
  }
  
  if (!warehouse || typeof warehouse !== 'object' || !('id' in warehouse)) {
    return (
      <div className="container py-10">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lager nicht gefunden</AlertTitle>
          <AlertDescription>
            Das angeforderte Lager konnte nicht gefunden werden.
          </AlertDescription>
        </Alert>
        
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation("/lager")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/lager/${id}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Zurück zum Lager
          </Button>
        </div>
        <h1 className="text-2xl font-bold">{warehouse && typeof warehouse === 'object' && 'name' in warehouse ? String(warehouse.name) : 'Lager'} - Warenbewegungen</h1>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Warenbewegungen</CardTitle>
              <CardDescription>
                Anzeige aller Zu- und Abgänge sowie Refills
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
              <Button 
                variant={showFilters ? "default" : "outline"} 
                size="sm" 
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filter {showFilters ? "ausblenden" : "anzeigen"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs for quick filtering */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">Alle</TabsTrigger>
              <TabsTrigger value="in">Eingänge</TabsTrigger>
              <TabsTrigger value="out">Ausgänge</TabsTrigger>
              <TabsTrigger value="refill">Refills</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters */}
          {showFilters && (
            <div className="mb-6 p-4 border rounded-md bg-muted/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                {/* Date Range Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Zeitraum</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "dd.MM.yyyy")} -{" "}
                              {format(dateRange.to, "dd.MM.yyyy")}
                            </>
                          ) : (
                            format(dateRange.from, "dd.MM.yyyy")
                          )
                        ) : (
                          "Zeitraum wählen"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        locale={de}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Article Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Artikel</label>
                  <Input
                    placeholder="Artikelname suchen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Movement Type Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Bewegungstyp</label>
                  <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Typen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Alle Typen</SelectItem>
                      <SelectItem value="IN">Wareneingang</SelectItem>
                      <SelectItem value="OUT">Warenausgang</SelectItem>
                      <SelectItem value="TRANSFER">Umlagerung</SelectItem>
                      <SelectItem value="REFILL">Refill</SelectItem>
                      <SelectItem value="ADJUSTMENT">Bestandskorrektur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Machine Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Automat</label>
                  <Select value={machineFilter} onValueChange={setMachineFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Automaten" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Alle Automaten</SelectItem>
                      {Array.isArray(machineAssignments) ? machineAssignments.map((assignment: any) => (
                        <SelectItem 
                          key={assignment.machine?.id} 
                          value={assignment.machine?.id?.toString() || ''}
                        >
                          {assignment.machine?.machineName || 'Unbekannter Automat'}
                        </SelectItem>
                      )) : null}
                    </SelectContent>
                  </Select>
                </div>

                {/* User Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Benutzer</label>
                  <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Benutzer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Alle Benutzer</SelectItem>
                      {Array.isArray(users) ? users.map((user: any) => (
                        <SelectItem 
                          key={user.id} 
                          value={user.id.toString()}
                        >
                          {user.username}
                        </SelectItem>
                      )) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Filter zurücksetzen
                </Button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {(movementsLoading || refillsLoading) ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* Active Filters Display */}
              {(searchTerm || movementTypeFilter || machineFilter || userFilter || dateRange) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {searchTerm && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      Artikel: {searchTerm}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setSearchTerm('')} 
                      />
                    </Badge>
                  )}
                  {movementTypeFilter && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      Typ: {movementTypeFilter}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setMovementTypeFilter('')} 
                      />
                    </Badge>
                  )}
                  {machineFilter && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      Automat: {Array.isArray(machineAssignments) 
                        ? machineAssignments.find((a: any) => 
                            a.machine?.id.toString() === machineFilter)?.machine?.machineName || machineFilter
                        : machineFilter}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setMachineFilter('')} 
                      />
                    </Badge>
                  )}
                  {userFilter && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      Benutzer: {Array.isArray(users)
                        ? users.find((u: any) => 
                            u.id.toString() === userFilter)?.username || userFilter
                        : userFilter}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setUserFilter('')} 
                      />
                    </Badge>
                  )}
                  {dateRange && dateRange.from && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      Zeitraum: {format(dateRange.from, "dd.MM.yyyy")}
                      {dateRange.to && ` - ${format(dateRange.to, "dd.MM.yyyy")}`}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => setDateRange(undefined)} 
                      />
                    </Badge>
                  )}
                </div>
              )}

              {/* Results Count */}
              <div className="text-sm text-muted-foreground mb-2">
                {filteredMovements.length} Warenbewegungen gefunden
              </div>

              {/* Movements Table */}
              {filteredMovements.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum/Zeit</TableHead>
                        <TableHead>Bewegungstyp</TableHead>
                        <TableHead>Artikelname</TableHead>
                        <TableHead className="text-center">Menge</TableHead>
                        <TableHead>Einheit</TableHead>
                        <TableHead>Quelle/Ziel</TableHead>
                        <TableHead>Nutzer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovements.map((movement: any) => (
                        <TableRow key={movement.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {movement && (movement.performedAt || movement.createdAt) 
                              ? format(new Date(movement.performedAt || movement.createdAt), "dd.MM.yyyy HH:mm")
                              : "Unbekanntes Datum"}
                          </TableCell>
                          <TableCell>
                            {movement.type && (
                              <Badge variant={movement.type === 'IN' ? 'default' : 'destructive'}>
                                {formatMovementType(movement.type || "", movement.movementType || "")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{movement.productName}</TableCell>
                          <TableCell className="text-center font-medium">
                            {movement.type && movement.quantity !== undefined ? 
                              `${movement.type === 'IN' ? '+' : '-'}${Math.abs(Number(movement.quantity))}` : 
                              "-"}
                          </TableCell>
                          <TableCell>{movement.unit}</TableCell>
                          <TableCell>
                            {movement.movementType === "REFILL" ? (
                              <span>Refill Automat {movement.machineName || "unbekannt"}</span>
                            ) : movement.type === "IN" && movement.referenceType === "ORDER" ? (
                              <span>Wareneingang Bestellung #{movement.referenceId || "?"}</span>
                            ) : movement.type === "OUT" && movement.destinationWarehouseId ? (
                              <span>Umlagerung nach {
                                // This would require fetching all warehouses to display the name
                                `Lager ${movement.destinationWarehouseId}`
                              }</span>
                            ) : movement.type === "IN" && movement.sourceWarehouseId ? (
                              <span>Umlagerung von {
                                `Lager ${movement.sourceWarehouseId}`
                              }</span>
                            ) : (
                              <span>{movement.notes || "-"}</span>
                            )}
                          </TableCell>
                          <TableCell>{movement.operatorName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-8 border rounded-md">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-muted-foreground">Keine Warenbewegungen gefunden</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
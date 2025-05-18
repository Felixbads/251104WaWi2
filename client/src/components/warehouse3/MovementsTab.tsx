import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Info,
  Mail,
  Truck,
  Package,
  ArrowUpDown,
  ArrowDownUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MovementsTabProps {
  warehouseId: number;
}

interface MovementFilters {
  search: string;
  startDate: Date | null;
  endDate: Date | null;
  movementType: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export default function MovementsTab({ warehouseId }: MovementsTabProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState<MovementFilters>({
    search: '',
    startDate: null,
    endDate: null,
    movementType: null,
    sortBy: 'performedAt',
    sortOrder: 'desc',
  });
  
  // Bewegungsdaten abrufen
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'movements', { page: currentPage, filters }],
    retry: 1,
  });

  // Aktualisiere den Filter
  const handleFilterChange = (key: keyof MovementFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Zurück zur ersten Seite
  };

  // Toggle Sortierung
  const handleSort = (column: string) => {
    if (filters.sortBy === column) {
      // Bei gleichem Feld, die Sortierreihenfolge umkehren
      handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Bei neuem Feld, dieses setzen und absteigend sortieren (bei Datum)
      setFilters(prev => ({ 
        ...prev, 
        sortBy: column, 
        sortOrder: column === 'performedAt' ? 'desc' : 'asc' 
      }));
    }
  };

  // Sortierungsindikator
  const SortIndicator = ({ column }: { column: string }) => {
    if (filters.sortBy !== column) return <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />;
    return filters.sortOrder === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" /> 
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  // Bewegungstyp-Badge
  const MovementTypeBadge = ({ type }: { type: string }) => {
    const typeMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline" }> = {
      IN: { label: "Eingang", variant: "default" },
      OUT: { label: "Ausgang", variant: "secondary" },
      TRANSFER: { label: "Transfer", variant: "outline" },
      ADJUST: { label: "Anpassung", variant: "secondary" },
      REFILL: { label: "Auffüllung", variant: "destructive" },
      DISPOSAL: { label: "Entsorgung", variant: "destructive" },
    };
    
    const typeInfo = typeMap[type] || { label: type, variant: "outline" };
    
    return (
      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
    );
  };

  // Datum formatieren
  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    
    return format(new Date(date), "dd.MM.yyyy HH:mm", { locale: de });
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Warenbewegungen</CardTitle>
          <CardDescription>Eingehende und ausgehende Warenbewegungen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex space-x-2">
                <div className="relative w-[250px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suche nach Produkten..."
                    className="pl-8"
                    disabled
                  />
                </div>
                
                <Button variant="outline" disabled>
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
                
                <Button variant="outline" disabled>
                  <Calendar className="mr-2 h-4 w-4" /> Zeitraum
                </Button>
              </div>
              
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" /> Neue Bewegung
              </Button>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum/Zeit</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead>Quelle/Ziel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-40" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" disabled>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wenn ein Fehler aufgetreten ist
  if (isError) {
    return (
      <Card className="bg-destructive/10 border-destructive">
        <CardHeader>
          <CardTitle>Warenbewegungen konnten nicht geladen werden</CardTitle>
          <CardDescription>
            Beim Abrufen der Bewegungsdaten ist ein Fehler aufgetreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
            <p className="mb-4 text-muted-foreground">{(error as Error)?.message || "Ein unbekannter Fehler ist aufgetreten"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'movements'] })}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wenn keine Daten vorhanden sind
  if (!data || !data.items || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Warenbewegungen</CardTitle>
          <CardDescription>Eingehende und ausgehende Warenbewegungen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2 mb-6">
            <div className="relative w-[250px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Produkten..."
                className="pl-8"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Bewegungstyp</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={() => handleFilterChange('movementType', null)}
                  className={cn({
                    "bg-muted": filters.movementType === null
                  })}
                >
                  <span>Alle Typen</span>
                  {filters.movementType === null && <Badge variant="outline" className="ml-2">✓</Badge>}
                </DropdownMenuItem>
                
                {["IN", "OUT", "TRANSFER", "ADJUST", "REFILL", "DISPOSAL"].map((type) => (
                  <DropdownMenuItem 
                    key={type}
                    onClick={() => handleFilterChange('movementType', type)}
                    className={cn({
                      "bg-muted": filters.movementType === type
                    })}
                  >
                    <MovementTypeBadge type={type} />
                    {filters.movementType === type && <Badge variant="outline" className="ml-2">✓</Badge>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <Calendar className="mr-2 h-4 w-4" /> 
                  {filters.startDate || filters.endDate ? (
                    <span>
                      {filters.startDate ? format(filters.startDate, "dd.MM.yy") : "..."}
                      {" - "}
                      {filters.endDate ? format(filters.endDate, "dd.MM.yy") : "..."}
                    </span>
                  ) : "Zeitraum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 flex gap-2">
                  <div>
                    <div className="mb-2 font-medium">Von</div>
                    <CalendarComponent
                      mode="single"
                      selected={filters.startDate || undefined}
                      onSelect={(date) => handleFilterChange('startDate', date)}
                      disabled={(date) => 
                        filters.endDate ? date > filters.endDate : false
                      }
                      initialFocus
                    />
                  </div>
                  <div>
                    <div className="mb-2 font-medium">Bis</div>
                    <CalendarComponent
                      mode="single"
                      selected={filters.endDate || undefined}
                      onSelect={(date) => handleFilterChange('endDate', date)}
                      disabled={(date) => 
                        filters.startDate ? date < filters.startDate : false
                      }
                      initialFocus
                    />
                  </div>
                </div>
                <div className="border-t p-3 flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleFilterChange('startDate', null);
                      handleFilterChange('endDate', null);
                    }}
                  >
                    Zurücksetzen
                  </Button>
                  <Button size="sm">Anwenden</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <ArrowDownUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Warenbewegungen gefunden</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {(filters.search || filters.movementType || filters.startDate || filters.endDate)
                ? "Versuchen Sie andere Filtereinstellungen oder erfassen Sie neue Warenbewegungen."
                : "In diesem Lager sind noch keine Warenbewegungen erfasst. Erfassen Sie Bewegungen, um mit dem Bestandsmanagement zu beginnen."}
            </p>
            
            {(filters.search || filters.movementType || filters.startDate || filters.endDate) && (
              <Button 
                variant="outline" 
                className="mr-2"
                onClick={() => setFilters({
                  search: '',
                  startDate: null,
                  endDate: null,
                  movementType: null,
                  sortBy: 'performedAt',
                  sortOrder: 'desc',
                })}
              >
                Filter zurücksetzen
              </Button>
            )}
            
            <Link href={`/warehouse3/${warehouseId}/movements/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Bewegung erfassen
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Seitenzahlen berechnen
  const totalPages = Math.ceil(data.total / itemsPerPage);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Warenbewegungen</CardTitle>
        <CardDescription>
          Eingehende, ausgehende und interne Warenbewegungen des Lagers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="relative w-[250px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Produkten..."
                  className="pl-8"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                />
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" /> 
                    {filters.movementType ? (
                      <MovementTypeBadge type={filters.movementType} />
                    ) : "Filter"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Bewegungstyp</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem 
                    onClick={() => handleFilterChange('movementType', null)}
                    className={cn({
                      "bg-muted": filters.movementType === null
                    })}
                  >
                    <span>Alle Typen</span>
                    {filters.movementType === null && <Badge variant="outline" className="ml-2">✓</Badge>}
                  </DropdownMenuItem>
                  
                  {["IN", "OUT", "TRANSFER", "ADJUST", "REFILL", "DISPOSAL"].map((type) => (
                    <DropdownMenuItem 
                      key={type}
                      onClick={() => handleFilterChange('movementType', type)}
                      className={cn({
                        "bg-muted": filters.movementType === type
                      })}
                    >
                      <MovementTypeBadge type={type} />
                      {filters.movementType === type && <Badge variant="outline" className="ml-2">✓</Badge>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Calendar className="mr-2 h-4 w-4" /> 
                    {filters.startDate || filters.endDate ? (
                      <span>
                        {filters.startDate ? format(filters.startDate, "dd.MM.yy") : "..."}
                        {" - "}
                        {filters.endDate ? format(filters.endDate, "dd.MM.yy") : "..."}
                      </span>
                    ) : "Zeitraum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 flex gap-2">
                    <div>
                      <div className="mb-2 font-medium">Von</div>
                      <CalendarComponent
                        mode="single"
                        selected={filters.startDate || undefined}
                        onSelect={(date) => handleFilterChange('startDate', date)}
                        disabled={(date) => 
                          filters.endDate ? date > filters.endDate : false
                        }
                        initialFocus
                      />
                    </div>
                    <div>
                      <div className="mb-2 font-medium">Bis</div>
                      <CalendarComponent
                        mode="single"
                        selected={filters.endDate || undefined}
                        onSelect={(date) => handleFilterChange('endDate', date)}
                        disabled={(date) => 
                          filters.startDate ? date < filters.startDate : false
                        }
                        initialFocus
                      />
                    </div>
                  </div>
                  <div className="border-t p-3 flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        handleFilterChange('startDate', null);
                        handleFilterChange('endDate', null);
                      }}
                    >
                      Zurücksetzen
                    </Button>
                    <Button size="sm">Anwenden</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <Link href={`/warehouse3/${warehouseId}/movements/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Neue Bewegung
              </Button>
            </Link>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer w-[180px]" onClick={() => handleSort('performedAt')}>
                    <div className="flex items-center">
                      Datum/Zeit
                      <SortIndicator column="performedAt" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('movementType')}>
                    <div className="flex items-center">
                      Typ
                      <SortIndicator column="movementType" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('productName')}>
                    <div className="flex items-center">
                      Produkt
                      <SortIndicator column="productName" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort('quantity')}>
                    <div className="flex items-center justify-end">
                      Menge
                      <SortIndicator column="quantity" />
                    </div>
                  </TableHead>
                  <TableHead>Quelle/Ziel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((movement: any) => {
                  // Zeige Pfeil je nach Bewegungstyp
                  const MovementArrow = () => {
                    if (movement.movementType === 'IN') return <ArrowRight className="h-4 w-4 text-green-600" />;
                    if (movement.movementType === 'OUT' || movement.movementType === 'REFILL') return <ArrowLeft className="h-4 w-4 text-amber-600" />;
                    if (movement.movementType === 'TRANSFER') return <ArrowRight className="h-4 w-4 text-blue-600" />;
                    return null;
                  };
                  
                  // Quelle und Ziel der Bewegung
                  const getSourceDestination = () => {
                    switch (movement.movementType) {
                      case 'IN':
                        return (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{movement.sourceType}</span>
                            <MovementArrow />
                            <span>Lager</span>
                          </div>
                        );
                      case 'OUT':
                      case 'DISPOSAL':
                        return (
                          <div className="flex items-center gap-1">
                            <span>Lager</span>
                            <MovementArrow />
                            <span className="text-muted-foreground">{movement.destinationType}</span>
                          </div>
                        );
                      case 'TRANSFER':
                        return (
                          <div className="flex items-center gap-1">
                            <span>{movement.sourceName || movement.sourceType}</span>
                            <MovementArrow />
                            <span>{movement.destinationName || movement.destinationType}</span>
                          </div>
                        );
                      case 'REFILL':
                        return (
                          <div className="flex items-center gap-1">
                            <span>Lager</span>
                            <MovementArrow />
                            <span className="flex items-center">
                              <PanelTop className="h-3 w-3 mr-1" /> 
                              {movement.machineName || "Automat"}
                            </span>
                          </div>
                        );
                      default:
                        return <span>—</span>;
                    }
                  };
                  
                  return (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(movement.performedAt || movement.createdAt)}
                      </TableCell>
                      <TableCell>
                        <MovementTypeBadge type={movement.movementType} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{movement.productName}</div>
                        {movement.batchNumber && (
                          <div className="text-xs text-muted-foreground">
                            Charge: {movement.batchNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={cn({
                          "text-green-600": movement.movementType === 'IN',
                          "text-red-600": movement.movementType === 'OUT' || movement.movementType === 'DISPOSAL',
                        })}>
                          {movement.movementType === 'IN' ? "+" : movement.movementType === 'OUT' || movement.movementType === 'DISPOSAL' ? "−" : ""}
                          {movement.quantity}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getSourceDestination()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          movement.status === 'completed' ? "outline" :
                          movement.status === 'pending' ? "secondary" :
                          movement.status === 'cancelled' ? "destructive" :
                          "outline"
                        }>
                          {movement.status === 'completed' ? "Abgeschlossen" :
                           movement.status === 'pending' ? "Ausstehend" :
                           movement.status === 'cancelled' ? "Storniert" :
                           movement.status || "Unbekannt"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <span className="sr-only">Aktionen</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/movements/${movement.id}`}>
                                <Info className="mr-2 h-4 w-4" /> Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/warehouse3/${warehouseId}/movements/${movement.id}/print`}>
                                <Mail className="mr-2 h-4 w-4" /> Drucken
                              </Link>
                            </DropdownMenuItem>
                            {movement.status === 'pending' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/warehouse3/${warehouseId}/movements/${movement.id}/edit`}>
                                    <Truck className="mr-2 h-4 w-4" /> Abschließen
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    // Hier könnte ein Bestätigungsdialog eingefügt werden
                                    toast({
                                      title: "Bewegung stornieren",
                                      description: "Diese Funktion ist noch nicht implementiert.",
                                    });
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Stornieren
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* Paginierung */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Zeige {(currentPage - 1) * itemsPerPage + 1} bis{" "}
              {Math.min(currentPage * itemsPerPage, data.total)} von {data.total} Einträgen
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t flex justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Legende:</span>{" "}
          <MovementTypeBadge type="IN" /> Eingang {" "}
          <MovementTypeBadge type="OUT" /> Ausgang {" "}
          <MovementTypeBadge type="TRANSFER" /> Transfer {" "}
          <MovementTypeBadge type="REFILL" /> Auffüllung {" "}
        </div>
        <Link href={`/warehouse3/${warehouseId}/movements/report`}>
          <Button variant="outline" size="sm">
            <Mail className="mr-2 h-4 w-4" /> Bericht erstellen
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
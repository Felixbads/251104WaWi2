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
  CardTitle
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
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Package,
  History,
  FileEdit,
  Trash2,
  AlertTriangle,
  ScanBarcode,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InventoryTabProps {
  warehouseId: number;
}

interface InventoryFilters {
  search: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  lowStock: boolean;
  category: string | null;
}

export default function InventoryTab({ warehouseId }: InventoryTabProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState<InventoryFilters>({
    search: '',
    sortBy: 'productName',
    sortOrder: 'asc',
    lowStock: false,
    category: null,
  });
  
  // Bestandsdaten abrufen
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'inventory', { page: currentPage, filters }],
    retry: 1,
  });

  // Kategorien für Filter abrufen
  const { data: categories } = useQuery({
    queryKey: ['/api/warehouse3/products/categories'],
    retry: 1,
  });

  // Aktualisiere den Filter
  const handleFilterChange = (key: keyof InventoryFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Zurück zur ersten Seite
  };

  // Toggle Sortierung
  const handleSort = (column: string) => {
    if (filters.sortBy === column) {
      // Bei gleichem Feld, die Sortierreihenfolge umkehren
      handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Bei neuem Feld, dieses setzen und aufsteigend sortieren
      setFilters(prev => ({ ...prev, sortBy: column, sortOrder: 'asc' }));
    }
  };

  // Sortierungsindikator
  const SortIndicator = ({ column }: { column: string }) => {
    if (filters.sortBy !== column) return <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />;
    return filters.sortOrder === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" /> 
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  // Bestandsanzeige-Status
  const InventoryStatus = ({ currentStock, minimumStock }: { currentStock: number, minimumStock: number }) => {
    if (currentStock <= 0) {
      return <Badge variant="destructive">Nicht auf Lager</Badge>;
    }
    if (currentStock < minimumStock) {
      return <Badge variant="warning" className="bg-amber-500">Niedriger Bestand</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-600">Auf Lager</Badge>;
  };

  // MHD-Status
  const ExpiryStatus = ({ expiryDate, daysUntilExpiry }: { expiryDate: string | null, daysUntilExpiry: number | null }) => {
    if (!expiryDate) return null;
    
    if (daysUntilExpiry !== null) {
      if (daysUntilExpiry < 0) {
        return <Badge variant="destructive">Abgelaufen</Badge>;
      }
      if (daysUntilExpiry < 14) {
        return <Badge variant="warning" className="bg-amber-500">Läuft bald ab</Badge>;
      }
    }
    
    return (
      <span className="text-sm text-muted-foreground">
        {new Date(expiryDate).toLocaleDateString('de-DE')}
      </span>
    );
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lagerbestand</CardTitle>
          <CardDescription>Alle Produkte in diesem Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Produkten..."
                  className="pl-8"
                  disabled
                />
              </div>
              <Button disabled>
                <Filter className="mr-2 h-4 w-4" /> Filter
              </Button>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" /> Produkt hinzufügen
              </Button>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Lagerort</TableHead>
                    <TableHead className="text-right">Bestand</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>MHD</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
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
          <CardTitle>Lagerbestand konnte nicht geladen werden</CardTitle>
          <CardDescription>
            Beim Abrufen der Bestandsdaten ist ein Fehler aufgetreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
            <p className="mb-4 text-muted-foreground">{(error as Error)?.message || "Ein unbekannter Fehler ist aufgetreten"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId, 'inventory'] })}
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
          <CardTitle>Lagerbestand</CardTitle>
          <CardDescription>Alle Produkte in diesem Lager</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Produkte gefunden</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {filters.search || filters.category || filters.lowStock
                ? "Versuchen Sie andere Filtereinstellungen oder fügen Sie neue Produkte hinzu."
                : "In diesem Lager sind noch keine Produkte vorhanden. Fügen Sie Produkte hinzu, um mit dem Bestandsmanagement zu beginnen."}
            </p>
            {(filters.search || filters.category || filters.lowStock) && (
              <Button 
                variant="outline" 
                className="mr-2"
                onClick={() => setFilters({
                  search: '',
                  sortBy: 'productName',
                  sortOrder: 'asc',
                  lowStock: false,
                  category: null,
                })}
              >
                Filter zurücksetzen
              </Button>
            )}
            <Link href={`/warehouse3/${warehouseId}/inventory/add`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Produkt hinzufügen
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
        <CardTitle>Lagerbestand</CardTitle>
        <CardDescription>
          Verwalten Sie den Bestand aller Produkte in diesem Lager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Produkten..."
                className="pl-8"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" /> Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Filter</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem 
                    onClick={() => handleFilterChange('lowStock', !filters.lowStock)}
                    className={cn("flex items-center justify-between", {
                      "bg-muted": filters.lowStock
                    })}
                  >
                    <span>Nur niedriger Bestand</span>
                    {filters.lowStock && <Badge variant="outline">An</Badge>}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Kategorie</DropdownMenuLabel>
                  
                  <DropdownMenuItem 
                    onClick={() => handleFilterChange('category', null)}
                    className={cn("flex items-center justify-between", {
                      "bg-muted": filters.category === null
                    })}
                  >
                    <span>Alle Kategorien</span>
                    {filters.category === null && <Badge variant="outline">✓</Badge>}
                  </DropdownMenuItem>
                  
                  {categories?.map((category: string) => (
                    <DropdownMenuItem 
                      key={category}
                      onClick={() => handleFilterChange('category', category)}
                      className={cn("flex items-center justify-between", {
                        "bg-muted": filters.category === category
                      })}
                    >
                      <span>{category || "Ohne Kategorie"}</span>
                      {filters.category === category && <Badge variant="outline">✓</Badge>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Link href={`/warehouse3/${warehouseId}/inventory/add`}>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Produkt hinzufügen
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('productName')}>
                    <div className="flex items-center">
                      Produkt
                      <SortIndicator column="productName" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('location')}>
                    <div className="flex items-center">
                      Lagerort
                      <SortIndicator column="location" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort('currentStock')}>
                    <div className="flex items-center justify-end">
                      Bestand
                      <SortIndicator column="currentStock" />
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('expiryDate')}>
                    <div className="flex items-center">
                      MHD
                      <SortIndicator column="expiryDate" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-sm text-muted-foreground">{item.productId}</div>
                    </TableCell>
                    <TableCell>
                      {item.location || "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.currentStock} / {item.minimumStock}
                    </TableCell>
                    <TableCell>
                      <InventoryStatus 
                        currentStock={item.currentStock} 
                        minimumStock={item.minimumStock}
                      />
                    </TableCell>
                    <TableCell>
                      <ExpiryStatus 
                        expiryDate={item.expiryDate} 
                        daysUntilExpiry={item.daysUntilExpiry}
                      />
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
                          <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/inventory/${item.id}`}>
                              <Package className="mr-2 h-4 w-4" /> Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/movements/new?productId=${item.productId}`}>
                              <History className="mr-2 h-4 w-4" /> Bewegung erfassen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/inventory/${item.id}/edit`}>
                              <FileEdit className="mr-2 h-4 w-4" /> Bearbeiten
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/warehouse3/${warehouseId}/inventory/${item.id}/barcode`}>
                              <ScanBarcode className="mr-2 h-4 w-4" /> Barcode anzeigen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              // Hier könnte ein Bestätigungsdialog eingefügt werden
                              toast({
                                title: "Produkt entfernen",
                                description: "Diese Funktion ist noch nicht implementiert.",
                              });
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Entfernen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
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
    </Card>
  );
}
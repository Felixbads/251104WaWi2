import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Lucide Icons
import { 
  Search, X, Plus, Building2, ArrowRightLeft, 
  Package, CircleAlert, RefreshCw, Filter,
  Download, Upload, ChevronRight, ChevronLeft,
  ChevronsRight, ChevronsLeft, Warehouse, MonitorSmartphone
} from 'lucide-react';

// UI-Komponenten
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Eigene Komponenten
import WarehouseList from '@/components/inventory/WarehouseList';
import WarehouseInventory from '@/components/inventory/WarehouseInventory';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import WarehouseMachineAssignments from '@/components/inventory/WarehouseMachineAssignments';
import NewWarehouseDialog from '@/components/inventory/NewWarehouseDialog';

// Dialog Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export default function LagerbestandPage() {
  const [activeTab, setActiveTab] = useState<string>('lagerbestand');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [isNewWarehouseDialogOpen, setIsNewWarehouseDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(50);

  // Lager abrufen
  const { data: warehousesData = { data: [], meta: { pages: 1 } }, isLoading, error } = useQuery({
    queryKey: ['/api/warehouses', { page: currentPage, limit, search: searchTerm, status: statusFilter }],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Filtere die Lager basierend auf der Suche
  const filteredWarehouses = Array.isArray(warehousesData.data) 
    ? warehousesData.data.filter((warehouse: any) => {
        // Status filter
        if (statusFilter !== "alle" && warehouse.status !== statusFilter) {
          return false;
        }
        
        // Suchtext filter
        if (searchTerm && !warehouse.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        
        return true;
      })
    : [];

  // Automatische Aktualisierung alle 5 Minuten
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
    }, 1000 * 60 * 5); // 5 Minuten
    
    return () => clearInterval(interval);
  }, [queryClient]);

  // Aktive Filter berechnen
  const activeFilters = [];
  if (searchTerm) activeFilters.push(`Suche: ${searchTerm}`);
  if (statusFilter !== "alle") activeFilters.push(`Status: ${statusFilter}`);

  // Filter zurücksetzen
  const clearFilter = (filter: string) => {
    if (filter.startsWith('Suche:')) {
      setSearchTerm('');
    } else if (filter.startsWith('Status:')) {
      setStatusFilter('alle');
    }
  };

  // Lager hinzufügen
  const handleAddWarehouse = (warehouseData: any) => {
    // API-Aufruf zum Hinzufügen eines neuen Lagers
    fetch('/api/warehouses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(warehouseData),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Fehler beim Erstellen des Lagers');
        }
        return response.json();
      })
      .then(() => {
        toast({
          title: "Lager hinzugefügt",
          description: `Das Lager "${warehouseData.name}" wurde erfolgreich hinzugefügt.`
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
        setIsNewWarehouseDialogOpen(false);
      })
      .catch(error => {
        console.error('Fehler beim Hinzufügen des Lagers:', error);
        toast({
          title: "Fehler",
          description: `Fehler beim Hinzufügen des Lagers: ${error.message}`,
          variant: "destructive"
        });
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <h1 className="text-2xl font-bold">Lagerbestand</h1>
        <Button 
          onClick={() => setIsNewWarehouseDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Lager hinzufügen
        </Button>
      </div>

      {/* Suchleiste und Filter */}
      <div className="w-full mb-6 flex flex-col sm:flex-row justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            placeholder="Nach Lagern suchen..."
            className="pl-8 h-9 w-full"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status-Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Status: {statusFilter === "alle" ? "Alle" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter("alle")}>
                Alle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("active")}>
                Aktiv
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("inactive")}>
                Inaktiv
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Aktualisieren Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Aktive Filter anzeigen */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {activeFilters.map((filter, index) => (
            <div 
              key={index} 
              className="text-xs py-1 px-2 bg-gray-100 rounded-md flex items-center gap-1.5"
            >
              {filter}
              <button 
                onClick={() => clearFilter(filter)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs für verschiedene Ansichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="lagerbestand" className="flex items-center gap-2">
            <Warehouse className="h-4 w-4" />
            <span>Lagerbestand</span>
          </TabsTrigger>
          <TabsTrigger value="bewegungen" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            <span>Warenbewegungen</span>
          </TabsTrigger>
          <TabsTrigger value="zuordnungen" className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4" />
            <span>Automaten-Zuordnungen</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab-Inhalte */}
        <TabsContent value="lagerbestand" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, index) => (
                <Card key={index}>
                  <CardHeader>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-6">
                <CircleAlert className="h-12 w-12 text-red-500 mb-4" />
                <h3 className="text-lg font-medium mb-1">Fehler beim Laden der Lager</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Es ist ein Fehler beim Laden der Lagerdaten aufgetreten.
                </p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] })}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Erneut versuchen
                </Button>
              </CardContent>
            </Card>
          ) : filteredWarehouses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-6">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Keine Lager gefunden</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchTerm 
                    ? `Es wurden keine Lager gefunden, die "${searchTerm}" enthalten.` 
                    : 'Es sind noch keine Lager angelegt.'}
                </p>
                <Button onClick={() => setIsNewWarehouseDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lager hinzufügen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWarehouses.map((warehouse: any) => (
                  <Card key={warehouse.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{warehouse.name}</CardTitle>
                          <CardDescription>
                            {warehouse.description || 'Keine Beschreibung'}
                          </CardDescription>
                        </div>
                        <Badge variant={warehouse.status === 'active' ? 'outline' : 'secondary'}>
                          {warehouse.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        {warehouse.address && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground">Adresse:</span>
                            <span className="font-medium">
                              {warehouse.address}, 
                              {warehouse.postalCode} {warehouse.city}
                            </span>
                          </div>
                        )}
                        {warehouse.contactPerson && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground">Kontakt:</span>
                            <span className="font-medium">{warehouse.contactPerson}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center mt-4">
                        <div className="flex">
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => setLocation(`/lagerbestand/${warehouse.id}`)}
                          >
                            Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {warehousesData.meta.pages > 1 && (
                <div className="flex justify-center gap-1 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage <= 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex gap-1">
                    {(() => {
                      const buttons = [];
                      const startPage = Math.max(1, currentPage - 2);
                      const endPage = Math.min(warehousesData.meta.pages || 1, startPage + 4);
                      
                      for (let i = startPage; i <= endPage; i++) {
                        buttons.push(
                          <Button
                            key={i}
                            variant={i === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(i)}
                          >
                            {i}
                          </Button>
                        );
                      }
                      
                      return buttons;
                    })()}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= (warehousesData.meta.pages || 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(warehousesData.meta.pages || 1)}
                    disabled={currentPage >= (warehousesData.meta.pages || 1)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="bewegungen" className="space-y-4">
          <InventoryMovements />
        </TabsContent>

        <TabsContent value="zuordnungen" className="space-y-4">
          <WarehouseMachineAssignments />
        </TabsContent>
      </Tabs>

      {/* Dialog für neues Lager */}
      <NewWarehouseDialog 
        isOpen={isNewWarehouseDialogOpen}
        onClose={() => setIsNewWarehouseDialogOpen(false)}
        onSave={handleAddWarehouse}
      />
    </div>
  );
}
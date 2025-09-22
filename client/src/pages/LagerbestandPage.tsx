import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Lucide Icons
import { 
  Search, X, Plus, Building2, ArrowRightLeft, 
  Package, Package2, CircleAlert, RefreshCw, Filter,
  Download, Upload, ChevronRight, ChevronLeft,
  ChevronsRight, ChevronsLeft, Warehouse, MonitorSmartphone, Users
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
import InventoryDetailedTable from '@/components/inventory/InventoryDetailedTable';
import WarehouseWithdrawals from '@/components/inventory/WarehouseWithdrawals';

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
  const { data: warehousesData, isLoading, error } = useQuery({
    queryKey: ['/api/warehouses', { page: currentPage, limit, search: searchTerm, status: statusFilter }],
    staleTime: 0, // Disable cache to debug
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  }) as { data: { data: any[], meta: { pages: number, total: number } } | undefined, isLoading: boolean, error: any };

  // Enhanced debug logging
  console.log('=== WAREHOUSE DEBUG ===');
  console.log('Query state - isLoading:', isLoading, 'error:', error);
  console.log('Raw warehousesData:', warehousesData);
  console.log('warehousesData?.data exists:', !!warehousesData?.data);
  console.log('warehousesData?.data is array:', Array.isArray(warehousesData?.data));
  if (warehousesData?.data) {
    console.log('warehousesData.data length:', warehousesData.data.length);
    console.log('First warehouse:', warehousesData.data[0]);
  }
  console.log('========================');

  // Filtere die Lager basierend auf der Suche
  const filteredWarehouses = (warehousesData?.data && Array.isArray(warehousesData.data)) 
    ? warehousesData.data.filter((warehouse: any) => {
        // Debug logging
        console.log('Filtering warehouse:', warehouse.name, 'Status:', warehouse.status, 'StatusFilter:', statusFilter);
        
        // Status filter
        if (statusFilter !== "alle" && warehouse.status !== statusFilter) {
          console.log('Warehouse filtered out by status:', warehouse.name);
          return false;
        }
        
        // Suchtext filter
        if (searchTerm && !warehouse.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          console.log('Warehouse filtered out by search:', warehouse.name);
          return false;
        }
        
        console.log('Warehouse passed all filters:', warehouse.name);
        return true;
      })
    : [];

  // Debug logging
  console.log('Warehouses data:', warehousesData);
  console.log('Filtered warehouses:', filteredWarehouses);
  console.log('Filtered warehouses length:', filteredWarehouses.length);

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
    <div className="max-w-7xl mx-auto">
      {/* Header mit Titel und Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lagerbestand</h1>
          <p className="text-muted-foreground mt-1">Verwalten Sie alle Lager und deren Bestände</p>
        </div>
        <Button 
          onClick={() => setIsNewWarehouseDialogOpen(true)}
          className="flex items-center gap-2 mt-4 sm:mt-0"
          size="default"
        >
          <Plus className="h-4 w-4" /> Lager erstellen
        </Button>
      </div>

      {/* Suchleiste und Filter */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            placeholder="Nach Lagern suchen..."
            className="pl-8 h-10 w-full"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Status-Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2 h-10">
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
            className="h-10"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Aktive Filter anzeigen */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {activeFilters.map((filter, index) => (
            <div 
              key={index} 
              className="py-1.5 px-3 bg-muted rounded-md flex items-center gap-2 text-sm"
            >
              {filter}
              <button 
                onClick={() => clearFilter(filter)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('alle');
            }}
          >
            Alle Filter zurücksetzen
          </Button>
        </div>
      )}

      {/* Tabs für verschiedene Ansichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 grid-cols-5">
          <TabsTrigger value="lagerbestand" className="flex items-center gap-2">
            <Warehouse className="h-4 w-4" />
            <span>Lagerbestand</span>
          </TabsTrigger>
          <TabsTrigger value="entnahmen" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Entnahmen-Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="chargen-detail" className="flex items-center gap-2">
            <Package2 className="h-4 w-4" />
            <span>Detaillierte Chargen</span>
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
              {(warehousesData?.meta?.pages ?? 1) > 1 && (
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
                      const endPage = Math.min(warehousesData?.meta?.pages || 1, startPage + 4);
                      
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
                    disabled={currentPage >= (warehousesData?.meta?.pages || 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(warehousesData?.meta?.pages || 1)}
                    disabled={currentPage >= (warehousesData?.meta?.pages || 1)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Entnahmen-Übersicht Tab */}
        <TabsContent value="entnahmen" className="space-y-4">
          <WarehouseWithdrawals />
        </TabsContent>

        {/* Detaillierte Chargen Tab */}
        <TabsContent value="chargen-detail" className="space-y-4">
          {filteredWarehouses.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {filteredWarehouses.map((warehouse: any) => (
                <div key={warehouse.id} className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Warehouse className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold" data-testid={`header-warehouse-${warehouse.id}`}>
                      {warehouse.name}
                    </h3>
                    <Badge variant="outline" className="ml-2">
                      {warehouse.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                  <InventoryDetailedTable 
                    warehouseId={warehouse.id}
                    key={`detailed-${warehouse.id}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8">
                <Package2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Keine Lager für detaillierte Ansicht</h3>
                <p className="text-muted-foreground text-center">
                  Wählen Sie ein Lager aus der Lagerbestand-Ansicht aus oder erstellen Sie ein neues Lager.
                </p>
              </CardContent>
            </Card>
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
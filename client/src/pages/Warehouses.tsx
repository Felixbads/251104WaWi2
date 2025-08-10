import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getWarehouses } from "@/lib/api";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Icons
import {
  Search,
  PlusCircle,
  Edit,
  Trash,
  Building2,
  Grid,
  List,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { WarehouseFormDialog } from "@/components/inventory/WarehouseFormDialog";

export default function Warehouses() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Dialog states
  const [isNewWarehouseDialogOpen, setIsNewWarehouseDialogOpen] = useState(false);
  const [isEditWarehouseDialogOpen, setIsEditWarehouseDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(50);

  // Abfrage aller Lager
  const { data: warehouses, isLoading, error } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => getWarehouses(),
  });

  // DEBUG: Log warehouse data
  console.log('[WAREHOUSES-DEBUG] Raw query result:', { warehouses, isLoading, error });
  console.log('[WAREHOUSES-DEBUG] Warehouses type:', typeof warehouses);
  console.log('[WAREHOUSES-DEBUG] Warehouses length:', warehouses?.length);

  // Handling für Lager bearbeiten
  const handleEditWarehouse = (e: React.MouseEvent, warehouse: any) => {
    e.stopPropagation();
    setSelectedWarehouse(warehouse);
    setIsEditWarehouseDialogOpen(true);
  };

  // Handling für Lager löschen
  const handleDeleteWarehouse = (e: React.MouseEvent, warehouse: any) => {
    e.stopPropagation();
    setSelectedWarehouse(warehouse);
    setIsDeleteDialogOpen(true);
  };

  // Filtere Lager basierend auf dem Suchbegriff
  const filteredWarehouses = warehouses
    ? warehouses.filter((warehouse) =>
        warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (warehouse.description && warehouse.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (warehouse.city && warehouse.city.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  // DEBUG: Log filtering process
  console.log('[WAREHOUSES-DEBUG] Filtered warehouses:', filteredWarehouses);
  console.log('[WAREHOUSES-DEBUG] Search term:', searchTerm);
  console.log('[WAREHOUSES-DEBUG] Original warehouses length:', warehouses?.length);
  console.log('[WAREHOUSES-DEBUG] Filtered warehouses length:', filteredWarehouses.length);

  // Wenn Lager geladen werden
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="w-full mb-6 flex justify-between">
          <div className="relative flex-1 mr-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Nach Lagern suchen..."
              className="pl-8 h-9 w-full"
              disabled
            />
          </div>
          <Button disabled>
            <PlusCircle className="mr-2 h-4 w-4" />
            Neues Lager
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
              <CardFooter>
                <div className="h-8 bg-gray-200 rounded w-full"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Wenn ein Fehler auftritt
  if (error) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">Fehler beim Laden der Lager</h2>
        <p className="text-muted-foreground mb-4">
          {(error as Error).message || "Bitte versuchen Sie es später erneut."}
        </p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] })}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Suchleiste und Neues Lager Button */}
      <div className="w-full mb-6 flex justify-between">
        <div className="relative flex-1 mr-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            placeholder="Nach Lagern suchen..."
            className="pl-8 h-9 w-full"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          {/* Ansichts-Schalter */}
          <TooltipProvider>
            <div className="border rounded-md p-0.5 flex mr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kachelansicht</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Listenansicht</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          
          <Button onClick={() => setIsNewWarehouseDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Neues Lager
          </Button>
        </div>
      </div>

      {/* Kein Lager gefunden Meldung */}
      {filteredWarehouses.length === 0 && (
        <div className="text-center p-8 border border-dashed rounded-lg">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">Keine Lager gefunden</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {searchTerm
              ? `Keine Lager gefunden, die zu "${searchTerm}" passen.`
              : "Es wurden noch keine Lager angelegt. Klicken Sie auf 'Neues Lager', um ein Lager zu erstellen."}
          </p>
          {searchTerm && (
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setSearchTerm("")}
            >
              Suche zurücksetzen
            </Button>
          )}
        </div>
      )}

      {/* Liste der Lager - Kachelansicht */}
      {viewMode === "grid" && filteredWarehouses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWarehouses.map((warehouse) => {
            // Anzahl der Produkte und kritischen Artikel berechnen (falls verfügbar)
            const productCount = warehouse.productCount || 0;
            const criticalCount = warehouse.criticalItemCount || 0;
            
            return (
              <Card 
                key={warehouse.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`/warehouses/${warehouse.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{warehouse.name}</CardTitle>
                    {warehouse.isActive === false && (
                      <Badge variant="outline" className="bg-gray-100">Inaktiv</Badge>
                    )}
                  </div>
                  {warehouse.city && (
                    <CardDescription>
                      {warehouse.city}
                      {warehouse.postalCode && `, ${warehouse.postalCode}`}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent>
                  {warehouse.description && (
                    <p className="text-sm text-muted-foreground mb-2">{warehouse.description}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      <Package className="h-3 w-3 mr-1" />
                      {productCount} {productCount === 1 ? 'Produkt' : 'Produkte'}
                    </Badge>
                    
                    {criticalCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {criticalCount} {criticalCount === 1 ? 'kritisch' : 'kritische'}
                      </Badge>
                    )}
                  </div>
                </CardContent>
                
                <CardFooter className="pt-0">
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => handleEditWarehouse(e, warehouse)}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Bearbeiten
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => handleDeleteWarehouse(e, warehouse)}
                    >
                      <Trash className="h-3.5 w-3.5 mr-1" />
                      Löschen
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Liste der Lager - Listenansicht */}
      {viewMode === "list" && filteredWarehouses.length > 0 && (
        <div className="rounded-md border">
          <div className="bg-muted/50 p-3 grid grid-cols-12 text-sm font-medium">
            <div className="col-span-4">Name</div>
            <div className="col-span-3">Standort</div>
            <div className="col-span-2">Produkte</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Aktionen</div>
          </div>
          
          <div>
            {filteredWarehouses.map((warehouse) => {
              // Anzahl der Produkte und kritischen Artikel berechnen (falls verfügbar)
              const productCount = warehouse.productCount || 0;
              const criticalCount = warehouse.criticalItemCount || 0;
              
              return (
                <div 
                  key={warehouse.id}
                  className="grid grid-cols-12 p-3 text-sm items-center border-t hover:bg-muted/50 cursor-pointer"
                  onClick={() => setLocation(`/warehouses/${warehouse.id}`)}
                >
                  <div className="col-span-4 font-medium">
                    {warehouse.name}
                    {warehouse.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[90%]">
                        {warehouse.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="col-span-3">
                    {warehouse.city ? (
                      <>
                        {warehouse.city}
                        {warehouse.postalCode && `, ${warehouse.postalCode}`}
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">Kein Standort</span>
                    )}
                  </div>
                  
                  <div className="col-span-2">
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {productCount} {productCount === 1 ? 'Produkt' : 'Produkte'}
                      </Badge>
                      
                      {criticalCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {criticalCount} kritisch
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="col-span-1">
                    {warehouse.isActive === false ? (
                      <Badge variant="outline" className="bg-gray-100">Inaktiv</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Aktiv</Badge>
                    )}
                  </div>
                  
                  <div className="col-span-2 flex justify-end space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => handleEditWarehouse(e, warehouse)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span className="sr-only">Bearbeiten</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => handleDeleteWarehouse(e, warehouse)}
                    >
                      <Trash className="h-3.5 w-3.5" />
                      <span className="sr-only">Löschen</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialog für neues Lager */}
      <WarehouseFormDialog 
        open={isNewWarehouseDialogOpen} 
        onOpenChange={setIsNewWarehouseDialogOpen}
        warehouse={null}
        isNew={true}
      />
      
      {/* Dialog für Lager bearbeiten */}
      {selectedWarehouse && (
        <WarehouseFormDialog 
          warehouse={selectedWarehouse}
          open={isEditWarehouseDialogOpen} 
          onOpenChange={setIsEditWarehouseDialogOpen} 
          isNew={false}
        />
      )}
      
      {/* Dialog für Lager löschen */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lager löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie das Lager "{selectedWarehouse?.name}" löschen möchten?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                // Hier würde die Delete-Mutation aufgerufen werden
                toast({
                  title: "Lager gelöscht",
                  description: `Das Lager "${selectedWarehouse?.name}" wurde erfolgreich gelöscht.`,
                });
                setIsDeleteDialogOpen(false);
                queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
              }}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
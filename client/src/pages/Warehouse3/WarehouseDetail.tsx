import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Home,
  Building2,
  Package,
  Clipboard,
  Truck,
  ArrowLeftRight,
  AlertCircle,
  Calendar,
  PanelTop,
  Pencil,
  Trash2,
  PackageOpen,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import WarehouseCreateForm from "@/components/warehouse3/WarehouseCreateForm";
import InventoryTab from "@/components/warehouse3/InventoryTab";
import MovementsTab from "@/components/warehouse3/MovementsTab";
import MachinesTab from "@/components/warehouse3/MachinesTab";
import RefillsTab from "@/components/warehouse3/RefillsTab";
import InventoryCountTab from "@/components/warehouse3/InventoryCountTab";
import ExpiredProductsList from "@/components/inventory/ExpiredProductsList";

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const warehouseId = parseInt(id);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("übersicht");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Lager-Daten abrufen
  const { data: warehouse, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId],
    retry: 1,
    enabled: !isNaN(warehouseId),
  });

  // Zusammenfassende Statistiken abrufen  
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/warehouse3/warehouses', warehouseId, 'stats'],
    retry: 1,
    enabled: !isNaN(warehouseId) && !!warehouse,
  });

  // Funktion zur Aktualisierung eines Lagers
  const handleUpdateWarehouse = async (warehouseData: any) => {
    try {
      await apiRequest(`/api/warehouse3/warehouses/${warehouseId}`, warehouseData, 'PATCH');
      
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId] });
      setIsEditDialogOpen(false);
      toast({
        title: "Lager aktualisiert",
        description: `Das Lager "${warehouseData.name}" wurde erfolgreich aktualisiert.`,
      });
    } catch (err) {
      console.error("Fehler beim Aktualisieren des Lagers:", err);
      toast({
        title: "Fehler",
        description: "Das Lager konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  // Status-Badge-Komponente
  const StatusBadge = ({ status }: { status: string }) => {
    const statusMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: "Aktiv", variant: "default" },
      inactive: { label: "Inaktiv", variant: "outline" },
      maintenance: { label: "Wartung", variant: "secondary" },
      closed: { label: "Geschlossen", variant: "destructive" },
    };
    
    const statusInfo = statusMap[status?.toLowerCase()] || { label: status, variant: "default" };
    
    return (
      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
    );
  };
  
  // Hilfsfunktion zum Formatieren des Datums
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Unbekannt";
    
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/warehouse3">
            <Button variant="outline" size="sm" className="mr-4">
              <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
          </Link>
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-1/3 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
        
        <Skeleton className="h-10 w-full mb-6" />
        
        <Card>
          <CardContent className="p-8">
            <div className="flex justify-center items-center">
              <Skeleton className="h-32 w-32 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Wenn ein Fehler aufgetreten ist oder das Lager nicht gefunden wurde
  if (isError || !warehouse) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/warehouse3">
            <Button variant="outline" size="sm" className="mr-4">
              <ChevronLeft className="h-4 w-4 mr-1" /> Zurück zur Lagerübersicht
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Lager nicht gefunden</h1>
        </div>
        
        <Card className="bg-destructive/10 border-destructive mb-6">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Fehler beim Laden des Lagers</h2>
              <p className="text-muted-foreground mb-4">
                {(error as Error)?.message || `Das Lager mit der ID ${warehouseId} wurde nicht gefunden.`}
              </p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3-api/warehouses', warehouseId] })}
                variant="outline"
                className="mr-2"
              >
                Erneut versuchen
              </Button>
              <Link href="/warehouse3">
                <Button>
                  Zur Lagerübersicht
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link href="/warehouse3">
            <Button variant="outline" size="sm" className="mr-4">
              <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              {warehouse.name}
              <StatusBadge status={warehouse.status || "active"} className="ml-3" />
            </h1>
            <p className="text-muted-foreground flex items-center mt-1">
              <Home className="h-4 w-4 mr-1.5 inline" />
              {warehouse.address ? `${warehouse.address}, ` : ""}
              {warehouse.postalCode ? `${warehouse.postalCode} ` : ""}
              {warehouse.city || "Kein Standort angegeben"}
            </p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Link href={`/warehouse3/${warehouseId}/inventory`}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Package className="h-4 w-4 mr-1.5" /> Bestandsübersicht V3
            </Button>
          </Link>
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1.5" /> Bearbeiten
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Lager bearbeiten</DialogTitle>
                <DialogDescription>
                  Bearbeiten Sie die Daten des Lagers "{warehouse.name}".
                </DialogDescription>
              </DialogHeader>
              <WarehouseCreateForm 
                onSubmit={handleUpdateWarehouse} 
                onCancel={() => setIsEditDialogOpen(false)}
                initialData={warehouse}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="flex justify-center mb-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Statistiken</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <Package className="h-5 w-5 mr-2 text-muted-foreground" />
                    <span>Produkte</span>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    {stats?.productCount || 0}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <PanelTop className="h-5 w-5 mr-2 text-muted-foreground" />
                    <span>Zugewiesene Automaten</span>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    {stats?.machineCount || 0}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 mr-2 text-amber-500" />
                    <span>Niedrige Bestände</span>
                  </div>
                  <Badge variant={stats?.lowStockCount ? "destructive" : "outline"} className="ml-auto">
                    {stats?.lowStockCount || 0}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-muted-foreground" />
                    <span>Letzte Inventur</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stats?.lastInventoryDate 
                      ? new Date(stats.lastInventoryDate).toLocaleDateString('de-DE')
                      : "Keine"}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <ArrowLeftRight className="h-5 w-5 mr-2 text-muted-foreground" />
                    <span>Bewegungen (30 Tage)</span>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    {stats?.movementCount30Days || 0}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <div className="flex justify-between items-center w-full">
              <Link href={`/warehouse3/${warehouseId}/inventory/add`}>
                <Button variant="outline" size="sm">
                  <Package className="h-4 w-4 mr-1.5" /> Produkt hinzufügen
                </Button>
              </Link>
              <Link href={`/warehouse3/${warehouseId}/counts/new`}>
                <Button size="sm">
                  <Clipboard className="h-4 w-4 mr-1.5" /> Inventur starten
                </Button>
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
      
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="w-full border-b rounded-none justify-start">
          <TabsTrigger value="übersicht" className="flex items-center gap-1">
            <Building2 className="h-4 w-4" /> Übersicht
          </TabsTrigger>
          <TabsTrigger value="bestand" className="flex items-center gap-1">
            <Package className="h-4 w-4" /> Bestand
          </TabsTrigger>
          <TabsTrigger value="bewegungen" className="flex items-center gap-1">
            <ArrowLeftRight className="h-4 w-4" /> Bewegungen
          </TabsTrigger>
          <TabsTrigger value="automaten" className="flex items-center gap-1">
            <PanelTop className="h-4 w-4" /> Automaten
          </TabsTrigger>
          <TabsTrigger value="auffüllungen" className="flex items-center gap-1">
            <Truck className="h-4 w-4" /> Auffüllungen
          </TabsTrigger>
          <TabsTrigger value="wareneingang" className="flex items-center gap-1" data-testid="tab-wareneingang">
            <PackageOpen className="h-4 w-4" /> Wareneingang
          </TabsTrigger>
          <TabsTrigger value="inventuren" className="flex items-center gap-1">
            <Clipboard className="h-4 w-4" /> Inventuren
          </TabsTrigger>
          <TabsTrigger value="abgelaufene-produkte" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" /> Abgelaufene Produkte
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="übersicht" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Kritische Bestände</CardTitle>
                <CardDescription>
                  Produkte mit niedrigem Bestand, die nachbestellt werden sollten
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : stats?.lowStockItems && stats.lowStockItems.length > 0 ? (
                  <div className="space-y-2">
                    {stats.lowStockItems.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center pb-2 border-b last:border-0">
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.currentStock} / {item.minimumStock} Einheiten
                          </div>
                        </div>
                        <Link href={`/warehouse3/${warehouseId}/inventory/${item.id}`}>
                          <Button variant="ghost" size="sm">
                            Details
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p>Keine kritischen Bestände vorhanden</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Automatenübersicht</CardTitle>
                <CardDescription>
                  Dem Lager zugewiesene Automaten und deren Status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : stats?.assignedMachines && stats.assignedMachines.length > 0 ? (
                  <div className="space-y-2">
                    {stats.assignedMachines.slice(0, 5).map((machine: any) => (
                      <div key={machine.id} className="flex justify-between items-center pb-2 border-b last:border-0">
                        <div>
                          <div className="font-medium">{machine.machineName}</div>
                          <div className="text-sm text-muted-foreground">
                            {machine.productCount} Produkte • {machine.pendingRefills || 0} ausstehende Auffüllungen
                          </div>
                        </div>
                        <Badge variant={machine.needsRefill ? "destructive" : "outline"} className="ml-2">
                          {machine.needsRefill ? "Auffüllen" : "OK"}
                        </Badge>
                      </div>
                    ))}
                    
                    {stats.assignedMachines.length > 5 && (
                      <div className="text-center pt-2">
                        <Link href={`/warehouse3/${warehouseId}/machines`}>
                          <Button variant="link" size="sm">
                            Alle {stats.assignedMachines.length} Automaten anzeigen
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <PanelTop className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p>Keine Automaten diesem Lager zugewiesen</p>
                    <Link href={`/warehouse3/${warehouseId}/machines/assign`}>
                      <Button variant="link" size="sm">
                        Automaten zuweisen
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="bestand">
          <InventoryTab warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="bewegungen">
          <MovementsTab warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="automaten">
          <MachinesTab warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="auffüllungen">
          <RefillsTab warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="inventuren">
          <InventoryCountTab warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="abgelaufene-produkte">
          <ExpiredProductsList warehouseId={warehouseId} />
        </TabsContent>
        
        <TabsContent value="wareneingang">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5" />
                Wareneingang
              </CardTitle>
              <CardDescription>
                Bestellungen annehmen und in das Lager einbuchen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <PackageOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Wareneingang verfügbar</h3>
                <p className="text-muted-foreground mb-6">
                  Hier können Sie eingehende Bestellungen bearbeiten und Waren in das Lager einbuchen.
                </p>
                <div className="flex gap-4 justify-center">
                  <Link href={`/orders?warehouseId=${warehouseId}`}>
                    <Button data-testid="button-orders-list">
                      <Package className="mr-2 h-4 w-4" />
                      Zu Bestellungen
                    </Button>
                  </Link>
                  <Link href={`/orders/new?warehouseId=${warehouseId}`}>
                    <Button variant="outline" data-testid="button-orders-new">
                      Neue Bestellung
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
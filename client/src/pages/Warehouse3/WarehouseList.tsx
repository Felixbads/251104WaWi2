import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Search, Building2, PanelTop, Filter, PackageOpen, Truck, Home } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import WarehouseCreateForm from "@/components/warehouse3/WarehouseCreateForm";

// Definiere einen Typ für die Lagerstatistiken
interface WarehouseStats {
  totalProducts: number;
  lowStockProducts: number;
  expiringSoonProducts: number;
  assignedMachines: number;
  pendingRefills: number;
  lastInventoryDate: string | null;
}

export default function WarehouseList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // Abrufen aller Lager
  const { data: warehouses, isLoading, isError, error } = useQuery({
    queryKey: ['/api/warehouse3-api/warehouses'],
    retry: 1,
  });

  // Filtere Lager basierend auf dem Suchbegriff
  const filteredWarehouses = warehouses?.filter((warehouse: any) => 
    warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    warehouse.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    warehouse.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Funktion zur Erstellung eines neuen Lagers
  const handleCreateWarehouse = async (warehouseData: any) => {
    try {
      await apiRequest('/api/warehouse3-api/warehouses', {
        method: 'POST',
        data: warehouseData,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse3-api/warehouses'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Lager erstellt",
        description: `Das Lager "${warehouseData.name}" wurde erfolgreich erstellt.`,
      });
    } catch (err) {
      console.error("Fehler beim Erstellen des Lagers:", err);
      toast({
        title: "Fehler",
        description: "Das Lager konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  // Hilfsfunktion zum Abrufen der Lagerstatistik (würde normalerweise per API erfolgen)
  // Dies ist ein Platzhalter - die tatsächliche Implementierung würde einen API-Aufruf beinhalten
  const getWarehouseStats = (warehouseId: number): WarehouseStats => {
    return {
      totalProducts: Math.floor(Math.random() * 100) + 10,
      lowStockProducts: Math.floor(Math.random() * 10),
      expiringSoonProducts: Math.floor(Math.random() * 5),
      assignedMachines: Math.floor(Math.random() * 15) + 1,
      pendingRefills: Math.floor(Math.random() * 8),
      lastInventoryDate: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    };
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

  // Wenn Daten geladen werden
  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Lagerverwaltung</h1>
          <Button disabled>
            <PlusCircle className="mr-2 h-4 w-4" /> Neues Lager
          </Button>
        </div>
        
        <div className="flex items-center mb-6">
          <Search className="h-5 w-5 mr-2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Lagern..."
            className="flex-1"
            disabled
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </CardContent>
              <CardFooter className="border-t p-4 bg-muted/30">
                <div className="flex justify-between w-full">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Wenn ein Fehler aufgetreten ist
  if (isError) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Lagerverwaltung</h1>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Neues Lager
          </Button>
        </div>
        
        <Card className="bg-destructive/10 border-destructive mb-6">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Fehler beim Laden der Lager</h2>
              <p className="text-muted-foreground mb-4">
                {(error as Error)?.message || "Es ist ein unbekannter Fehler aufgetreten."}
              </p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse3-api/warehouses'] })}
                variant="outline"
              >
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Lagerverwaltung</h1>
          <p className="text-muted-foreground">Übersicht und Verwaltung aller Lagerstandorte</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Neues Lager
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Neues Lager erstellen</DialogTitle>
              <DialogDescription>
                Erstellen Sie einen neuen Lagerstandort für Ihre Produkte.
              </DialogDescription>
            </DialogHeader>
            <WarehouseCreateForm onSubmit={handleCreateWarehouse} onCancel={() => setIsCreateDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="flex items-center space-x-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Lagern..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon" title="Filter">
          <Filter className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredWarehouses.length} {filteredWarehouses.length === 1 ? 'Lager' : 'Lager'} gefunden
        </div>
      </div>

      {filteredWarehouses.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Lager gefunden</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {searchTerm 
                ? `Es wurden keine Lager gefunden, die "${searchTerm}" enthalten.` 
                : "Es sind noch keine Lager erstellt worden. Erstellen Sie Ihr erstes Lager, um zu beginnen."}
            </p>
            {searchTerm ? (
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Suche zurücksetzen
              </Button>
            ) : (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Lager erstellen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWarehouses.map((warehouse: any) => {
            const stats = getWarehouseStats(warehouse.id);
            
            return (
              <Card key={warehouse.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{warehouse.name}</CardTitle>
                    <StatusBadge status={warehouse.status || "active"} />
                  </div>
                  <CardDescription className="flex items-center">
                    <Home className="h-3 w-3 mr-1 inline" /> 
                    {warehouse.city || warehouse.address || "Kein Standort angegeben"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center">
                      <PackageOpen className="h-4 w-4 mr-1.5 text-muted-foreground" />
                      <span>{stats.totalProducts} Produkte</span>
                    </div>
                    <div className="flex items-center">
                      <PanelTop className="h-4 w-4 mr-1.5 text-muted-foreground" />
                      <span>{stats.assignedMachines} Automaten</span>
                    </div>
                    <div className="flex items-center text-amber-600">
                      <span>{stats.lowStockProducts} niedrig</span>
                    </div>
                    <div className="flex items-center text-blue-600">
                      <span>{stats.pendingRefills} Auffüllungen</span>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    {warehouse.description || "Keine Beschreibung vorhanden"}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {stats.lastInventoryDate 
                      ? `Letzte Inventur: ${new Date(stats.lastInventoryDate).toLocaleDateString('de-DE')}`
                      : "Keine Inventurdaten verfügbar"}
                  </div>
                </CardContent>
                <CardFooter className="border-t p-3 bg-muted/10">
                  <div className="w-full flex justify-between">
                    <Link href={`/warehouse3/${warehouse.id}`}>
                      <Button variant="default" size="sm">
                        Details
                      </Button>
                    </Link>
                    <Link href={`/warehouse3/${warehouse.id}/inventory`}>
                      <Button variant="outline" size="sm">
                        Bestand
                      </Button>
                    </Link>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
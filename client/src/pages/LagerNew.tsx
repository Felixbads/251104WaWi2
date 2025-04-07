import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Building2, 
  Package, 
  ArrowDownUp,
  AlertCircle,
  ShoppingCart,
  Truck,
  BarChart4
} from 'lucide-react';

// Import der Lagerkomponenten
import WarehouseList from '@/components/inventory/WarehouseList';
import WarehouseInventory from '@/components/inventory/WarehouseInventory';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import MachineAssignments from '@/components/inventory/MachineAssignments';

export default function LagerNew() {
  // Aktiven Tab aus localStorage laden oder Standard verwenden
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('lager-active-tab');
    return savedTab || 'warehouses';
  });
  
  // Lager zählen
  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Maschinenzuordnungen zählen
  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ['/api/machine-warehouse-assignments'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Inventardaten laden
  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Warenbewegungen zählen
  const { data: movements = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory-movements'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Werte für Übersichtskacheln berechnen
  const totalWarehouses = warehouses?.length || 0;
  const totalAssignments = assignments?.length || 0;
  const totalProducts = inventory?.length || 0;
  
  // Kritische Produkte (Menge <= Mindestmenge) zählen
  const criticalProducts = inventory?.filter((item: any) => 
    (item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0
  )?.length || 0;
  
  // Bei Tab-Wechsel in localStorage speichern
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem('lager-active-tab', value);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Lager</h1>
        <Button onClick={() => {
          try {
            window.location.href = '/warehouses/neu';
          } catch (error) {
            console.error("Navigation error:", error);
          }
        }}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Neues Lager anlegen
        </Button>
      </div>
      
      {/* Übersichtskacheln */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lager</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWarehouses}</div>
            <p className="text-xs text-muted-foreground">Aktive Lagerstandorte</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Automaten-Zuordnungen</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAssignments}</div>
            <p className="text-xs text-muted-foreground">Automaten-Lager-Zuweisungen</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produkte</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">Produkte im Lagerbestand</p>
          </CardContent>
        </Card>
        
        <Card className={criticalProducts > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-medium ${criticalProducts > 0 ? "text-destructive" : ""}`}>
              Kritische Produkte
            </CardTitle>
            <AlertCircle className={`h-4 w-4 ${criticalProducts > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${criticalProducts > 0 ? "text-destructive" : ""}`}>
              {criticalProducts}
            </div>
            <p className="text-xs text-muted-foreground">Produkte unter Mindestbestand</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs für die verschiedenen Bestandsansichten */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto py-1">
          <TabsTrigger value="warehouses" className="flex items-center">
            <Building2 className="mr-2 h-4 w-4" />
            Lager
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center">
            <Truck className="mr-2 h-4 w-4" />
            Automaten-Zuordnungen
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center">
            <Package className="mr-2 h-4 w-4" />
            Warenbestand
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center">
            <ArrowDownUp className="mr-2 h-4 w-4" />
            Warenstandsbewegung
          </TabsTrigger>
        </TabsList>
        
        {/* Lager-Tab: Anzeige und Verwaltung der Lagerstandorte */}
        <TabsContent value="warehouses" className="space-y-4">
          <WarehouseList />
        </TabsContent>
        
        {/* Automaten-Zuordnungen-Tab: Zuordnung von Automaten zu Lagern */}
        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automaten zu Lagern zuordnen</CardTitle>
              <CardDescription>
                Hier können Sie Automaten zu Lagern zuordnen. Bei der Zuordnung werden automatisch alle Produkte des Automaten ins Lager übernommen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MachineAssignments />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Lagerbestände-Tab: Übersicht über alle Artikel im Lager */}
        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warenbestand pro Lager</CardTitle>
              <CardDescription>
                Hier wird der Warenbestand für jedes Lager angezeigt. Die Produkte wurden automatisch bei der Zuordnung der Automaten übernommen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Die WarehouseInventory-Komponente ohne Vorübergabe von Daten, sie holt sich die Daten selbst */}
              <WarehouseInventory />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Warenbewegungen-Tab: Anzeige aller Ein- und Ausgänge */}
        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warenstandsbewegung</CardTitle>
              <CardDescription>
                Alle Warenbewegungen und Änderungen des Warenbestands werden hier zentral angezeigt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryMovements key="movements" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
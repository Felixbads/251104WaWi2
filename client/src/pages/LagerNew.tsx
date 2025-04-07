import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Building2, 
  Package, 
  ArrowDownUp
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
  
  // Bei Tab-Wechsel in localStorage speichern
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem('lager-active-tab', value);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Lager</h1>
        <Button onClick={() => window.location.href = '/warehouses/neu'}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Neues Lager anlegen
        </Button>
      </div>
      
      {/* Tabs für die verschiedenen Bestandsansichten */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto py-1">
          <TabsTrigger value="warehouses" className="flex items-center">
            <Building2 className="mr-2 h-4 w-4" />
            Lager
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center">
            <PlusCircle className="mr-2 h-4 w-4" />
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
              <WarehouseInventory 
                warehouseId={0} 
                inventory={[]} 
                isLoading={false}
                error={null}
                onRefresh={() => {}}
              />
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
              <InventoryMovements />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
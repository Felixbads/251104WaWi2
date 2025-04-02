import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Info, Building2, Package, ArrowDownUp, ClipboardCheck, Truck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageTitle } from '@/components/ui/page-title';

// Import der Lagerkomponenten
import WarehouseList from '@/components/inventory/WarehouseList';
import InventoryItems from '@/components/inventory/InventoryItems';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import InventoryCounts from '@/components/inventory/InventoryCounts';
import MachineAssignments from '@/components/inventory/MachineAssignments';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('warehouses');
  
  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Keine Suche erforderlich */}
        <div className="flex-grow">
        </div>
        
        {/* Rechte Seite: Aktionsbuttons (könnten in Zukunft hinzugefügt werden) */}
        <div className="flex flex-wrap items-center gap-2">
        </div>
      </div>
      
      {/* Informations-Alert zur Systemfunktion */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle>Lager und Bestandsmodul</AlertTitle>
        <AlertDescription>
          Hier verwalten Sie Ihre Lagerbestände, Lagerbewegungen und Inventuren. Die Daten werden automatisch mit dem Bestell- und Automatenmodul synchronisiert.
        </AlertDescription>
      </Alert>
      
      {/* Tabs für die verschiedenen Bestandsansichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto py-1">
          <TabsTrigger value="warehouses" className="flex items-center">
            <Building2 className="mr-2 h-4 w-4" />
            Lager
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center">
            <Package className="mr-2 h-4 w-4" />
            Lagerbestände
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center">
            <ArrowDownUp className="mr-2 h-4 w-4" />
            Warenbewegungen
          </TabsTrigger>
          <TabsTrigger value="counts" className="flex items-center">
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Inventuren
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center">
            <Truck className="mr-2 h-4 w-4" />
            Automaten-Zuordnungen
          </TabsTrigger>
        </TabsList>
        
        {/* Lager-Tab: Anzeige und Verwaltung der Lagerstandorte */}
        <TabsContent value="warehouses" className="space-y-4">
          <WarehouseList />
        </TabsContent>
        
        {/* Lagerbestände-Tab: Übersicht über alle Artikel im Lager */}
        <TabsContent value="inventory" className="space-y-4">
          <InventoryItems />
        </TabsContent>
        
        {/* Warenbewegungen-Tab: Anzeige aller Ein- und Ausgänge */}
        <TabsContent value="movements" className="space-y-4">
          <InventoryMovements />
        </TabsContent>
        
        {/* Inventuren-Tab: Verwaltung von Inventuren */}
        <TabsContent value="counts" className="space-y-4">
          <InventoryCounts />
        </TabsContent>
        
        {/* Automaten-Zuordnungen-Tab: Zuordnung von Automaten zu Lagern */}
        <TabsContent value="assignments" className="space-y-4">
          <MachineAssignments />
        </TabsContent>
      </Tabs>
    </div>
  );
}
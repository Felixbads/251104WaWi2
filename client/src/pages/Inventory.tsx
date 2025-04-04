import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Info, 
  Building2, 
  Package, 
  ArrowDownUp, 
  ClipboardCheck, 
  Truck, 
  Grid, 
  List,
  Search,
  Filter,
  SlidersHorizontal
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageTitle } from '@/components/ui/page-title';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Import der Lagerkomponenten
import WarehouseList from '@/components/inventory/WarehouseList';
import InventoryItems from '@/components/inventory/InventoryItems';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import InventoryCounts from '@/components/inventory/InventoryCounts';
import MachineAssignments from '@/components/inventory/MachineAssignments';

export default function Inventory() {
  // Aktiven Tab aus localStorage laden oder Standard verwenden
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('inventory-active-tab');
    return savedTab || 'warehouses';
  });
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  
  // Bei Tab-Wechsel in localStorage speichern
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem('inventory-active-tab', value);
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Lagerverwaltung</h1>
      
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Suchfeld und Filter-Dropdowns */}
        <div className="flex-grow flex flex-col sm:flex-row gap-2">
          {/* Suchfeld */}
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              placeholder="Lager suchen..."
              className="pl-8 h-9 w-full"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Filter-Dropdown */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Rechte Seite: Ansichts-Toggle und Aktionsbuttons */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            {/* Ansichts-Schalter */}
            <div className="flex border rounded-md">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-none rounded-l-md"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kachelansicht</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-9 w-9 rounded-none rounded-r-md"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Listenansicht</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
      
      {/* Tabs für die verschiedenen Bestandsansichten */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
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
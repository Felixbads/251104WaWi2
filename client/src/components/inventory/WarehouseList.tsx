import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Warehouse, Search, FilterX, 
  RefreshCw, PlusSquare, Loader2, AlertTriangle,
  Package, MapPin, Users, Phone, Mail, Plus,
  MonitorSmartphone, Truck, RotateCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import WarehouseInventory from './WarehouseInventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WarehouseStatsItem {
  totalProducts: number;
  totalItems: number;
  lowStock: number;
  criticalStock: number;
  expiringBatches: number;
  totalBatches: number;
}

interface Warehouse {
  id: number;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  status?: string | null;
}

// Lager-Übersicht Komponente
// Interface für Automaten-Zuordnung
interface MachineAssignment {
  id: number;
  machineId: number;
  warehouseId: number;
  isPrimary: boolean;
  machineName?: string;
  warehouseName?: string;
  notes?: string | null;
}

export default function WarehouseList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedWarehouse, setExpandedWarehouse] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("inventory");
  
  // Lade Lagerdaten
  const {
    data: warehouses = [] as Warehouse[],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Lagerstatistiken
  const { data: warehouseStats = {} as Record<string, WarehouseStatsItem> } = useQuery({
    queryKey: ['/api/warehouses/stats'],
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });
  
  // Lade Automaten-Lager-Zuordnungen
  const { data: machineAssignments = [] as MachineAssignment[] } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments'],
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });
  
  // Suche und Filterung
  const filteredWarehouses = Array.isArray(warehouses) ? warehouses.filter(warehouse => {
    return !searchTerm || 
      warehouse.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      warehouse.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      warehouse.description?.toLowerCase().includes(searchTerm.toLowerCase());
  }) : [];

  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Lagerdaten werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">Fehler beim Laden der Lager</h3>
        <p className="text-muted-foreground mt-1">
          {(error as any).message || 'Unbekannter Fehler'}
        </p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }
  
  return (
    <div>
      {/* Filter und Suchleiste */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Lager suchen..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchTerm('')}
            >
              <FilterX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={() => window.location.href = '/warehouses/neu'}
          >
            <PlusSquare className="h-4 w-4 mr-2" />
            Neues Lager
          </Button>
        </div>
      </div>
      
      {/* Lagerliste */}
      {filteredWarehouses.length === 0 ? (
        <div className="rounded-md bg-muted/50 p-8 text-center">
          <Warehouse className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">Keine Lager gefunden</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Es wurden keine Lager für die aktuelle Filterauswahl gefunden.
          </p>
          <Button>
            <PlusSquare className="h-4 w-4 mr-2" />
            Neues Lager anlegen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredWarehouses.map((warehouse: any) => {
            // Statistiken für dieses Lager
            const stats = warehouseStats[warehouse.id] || {
              totalProducts: 0,
              totalItems: 0,
              lowStock: 0,
              criticalStock: 0,
              expiringBatches: 0,
              totalBatches: 0
            };
            
            // Zähle die zugeordneten Automaten für dieses Lager
            const assignedMachines = machineAssignments.filter(
              assignment => assignment.warehouseId === warehouse.id
            );
            
            const isExpanded = expandedWarehouse === warehouse.id;
            
            return (
              <Card 
                key={warehouse.id} 
                className={`overflow-hidden transition-all ${
                  isExpanded ? 'col-span-full' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Warehouse className="h-5 w-5 text-primary" />
                        {warehouse.name}
                      </CardTitle>
                      
                      <CardDescription className="mt-1">
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3.5 w-3.5" />
                          {warehouse.city || warehouse.address || 'Kein Standort angegeben'}
                        </div>
                      </CardDescription>
                    </div>
                    
                    <Badge 
                      variant={warehouse.isActive ? 'outline' : 'secondary'}
                      className={warehouse.isActive ? 'text-emerald-500 border-emerald-300' : ''}
                    >
                      {warehouse.isActive ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="pb-2">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-semibold">{stats.totalProducts}</div>
                      <div className="text-xs text-muted-foreground">Produkte</div>
                    </div>
                    
                    <div>
                      <div className="text-2xl font-semibold">{stats.totalItems}</div>
                      <div className="text-xs text-muted-foreground">Artikel</div>
                    </div>
                    
                    <div>
                      <div className={`text-2xl font-semibold ${
                        stats.criticalStock > 0 ? 'text-destructive' : ''
                      }`}>
                        {stats.criticalStock}
                      </div>
                      <div className="text-xs text-muted-foreground">Kritisch</div>
                    </div>
                    
                    <div>
                      <div className="text-2xl font-semibold flex justify-center">
                        <span className="flex items-center">
                          {assignedMachines.length}
                          <MonitorSmartphone className="h-4 w-4 ml-1 text-muted-foreground" />
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">Automaten</div>
                    </div>
                  </div>
                  
                  {warehouse.description && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {warehouse.description.length > 100 
                        ? `${warehouse.description.substring(0, 100)}...` 
                        : warehouse.description}
                    </div>
                  )}
                  
                  {isExpanded && (
                    <div className="mt-6">
                      <Tabs 
                        defaultValue="inventory" 
                        className="w-full" 
                        value={activeTab}
                        onValueChange={setActiveTab}
                      >
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="inventory">Bestand</TabsTrigger>
                          <TabsTrigger value="details">Details</TabsTrigger>
                          <TabsTrigger value="movements">Warenbewegungen</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="inventory" className="mt-4">
                          <WarehouseInventory 
                            warehouseId={warehouse.id}
                            inventory={[]}
                            isLoading={false}
                            error={null}
                            onRefresh={() => {}}
                          />
                        </TabsContent>
                        
                        <TabsContent value="details" className="mt-4">
                          <Accordion type="single" collapsible>
                            <AccordionItem value="description">
                              <AccordionTrigger>Beschreibung</AccordionTrigger>
                              <AccordionContent>
                                <div className="text-sm">
                                  {warehouse.description || 'Keine Beschreibung vorhanden.'}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                            
                            <AccordionItem value="address">
                              <AccordionTrigger>Adresse</AccordionTrigger>
                              <AccordionContent>
                                <div className="text-sm">
                                  <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                    <div>
                                      <p>{warehouse.address || warehouse.city || '-'}</p>
                                      
                                      {warehouse.postalCode && warehouse.city && (
                                        <p>{warehouse.postalCode} {warehouse.city}</p>
                                      )}
                                      {warehouse.country && <p>{warehouse.country}</p>}
                                    </div>
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                            
                            <AccordionItem value="machines">
                              <AccordionTrigger>Zugeordnete Automaten</AccordionTrigger>
                              <AccordionContent>
                                {assignedMachines.length > 0 ? (
                                  <div className="space-y-4">
                                    <ul className="text-sm space-y-1">
                                      {assignedMachines.map((assignment) => (
                                        <li key={assignment.id} className="flex items-center gap-2">
                                          <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground" />
                                          {assignment.machineName || `Automat ID: ${assignment.machineId}`} 
                                          {assignment.isPrimary && (
                                            <Badge variant="outline" className="ml-2 text-xs text-blue-500 border-blue-300">
                                              Primär
                                            </Badge>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => window.location.href = `/warehouses/${warehouse.id}/automaten/zuordnen`}
                                    >
                                      <Plus className="h-3.5 w-3.5 mr-1" />
                                      Automaten zuordnen
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">Diesem Lager sind noch keine Automaten zugeordnet.</p>
                                    <Button 
                                      size="sm"
                                      onClick={() => window.location.href = `/warehouses/${warehouse.id}/automaten/zuordnen`}
                                    >
                                      <Plus className="h-3.5 w-3.5 mr-1" />
                                      Automaten zuordnen
                                    </Button>
                                  </div>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </TabsContent>
                        
                        <TabsContent value="movements" className="mt-4">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-medium">Warenbewegungen</h4>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => window.location.href = `/warehouses/${warehouse.id}/bewegungen`}
                            >
                              <Truck className="h-3.5 w-3.5 mr-1" />
                              Alle anzeigen
                            </Button>
                          </div>
                          
                          <div className="border rounded-md p-3">
                            <div className="text-sm text-muted-foreground mb-2">
                              <div className="flex justify-center">
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-xs"
                                  onClick={() => window.location.href = `/warehouses/${warehouse.id}/warenbewegung`}
                                >
                                  <RotateCw className="h-3.5 w-3.5 mr-1" />
                                  Hier klicken, um alle Warenbewegungen zu sehen
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </CardContent>
                
                <CardFooter className="flex justify-end pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setExpandedWarehouse(
                      isExpanded ? null : warehouse.id
                    )}
                  >
                    {isExpanded ? 'Weniger anzeigen' : 'Details anzeigen'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
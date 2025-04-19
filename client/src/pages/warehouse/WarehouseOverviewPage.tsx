import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Tabs as TabsBase, TabsContent as TabsContentBase, TabsList as TabsListBase, TabsTrigger as TabsTriggerBase } from "@/components/ui/tabs";
import * as React from 'react';

// Custom Tabs wrapper to fix type issues
const Tabs = ({ defaultValue, className, children }: { defaultValue: string, className?: string, children: React.ReactNode }) => {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsBase value={value} onValueChange={setValue} defaultValue={defaultValue} className={className}>
      {children}
    </TabsBase>
  );
};

const TabsContent = TabsContentBase;
const TabsList = TabsListBase;
const TabsTrigger = TabsTriggerBase;
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Package, ArrowDown, ArrowUp, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { WarehouseFormDialog } from '@/components/inventory/WarehouseFormDialog';

/**
 * Hauptseite für die Lagerbestandsübersicht
 * Zeigt alle verfügbaren Lager und ermöglicht Navigation zu Details
 */
export default function WarehouseOverviewPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewWarehouseDialogOpen, setIsNewWarehouseDialogOpen] = useState(false);
  
  // Lager laden
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Inventar-Statistiken laden - Korrektes Endpoint für warehouse stats verwenden
  const { data: inventoryStats = [], isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/inventory/warehouses/stats'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Lager filtern basierend auf der Suche
  const filteredWarehouses = Array.isArray(warehouses) 
    ? warehouses.filter((warehouse: any) => 
        warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (warehouse.description && warehouse.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  // Generiere eine Übersicht-Karte für das gesamte System
  const generateSystemOverview = () => {
    // Berechne die Gesamtstatistiken über alle Lager
    let totalProducts = 0;
    let totalCriticalItems = 0;
    let totalMachines = 0;
    let totalInventoryValue = 0;

    if (Array.isArray(inventoryStats)) {
      inventoryStats.forEach((stat: any) => {
        totalProducts += stat.productCount || 0;
        totalCriticalItems += stat.criticalItemCount || 0;
        totalMachines += stat.machineCount || 0;
        totalInventoryValue += stat.inventoryValue || 0;
      });
    }

    return (
      <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-primary/5 border-b">
          <CardTitle className="flex items-center text-xl">
            <Package className="h-6 w-6 mr-2 text-primary" />
            Gesamtsystem-Übersicht
          </CardTitle>
          <CardDescription>
            Aggregierte Daten über alle Lager hinweg
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500">Produkte</span>
              <span className="text-2xl font-bold">{totalProducts}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500">Kritische Bestände</span>
              <div className="flex items-center">
                <span className="text-2xl font-bold">{totalCriticalItems}</span>
                {totalCriticalItems > 0 && (
                  <AlertTriangle className="h-4 w-4 ml-1 text-amber-500" />
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500">Automaten</span>
              <span className="text-2xl font-bold">{totalMachines}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500">Gesamtwert</span>
              <span className="text-2xl font-bold">
                {new Intl.NumberFormat('de-DE', { 
                  style: 'currency', 
                  currency: 'EUR' 
                }).format(totalInventoryValue / 100)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Generiere eine Karte für jedes Lager
  const renderWarehouseCard = (warehouse: any) => {
    // Finde passende Statistiken für dieses Lager
    const warehouseStats = Array.isArray(inventoryStats) 
      ? inventoryStats.find((stat: any) => stat.warehouseId === warehouse.id)
      : null;

    const productCount = warehouseStats?.productCount || 0;
    const criticalItemCount = warehouseStats?.criticalItemCount || 0;
    const machineCount = warehouseStats?.machineCount || 0;
    const inventoryValue = warehouseStats?.inventoryValue || 0;

    return (
      <Card key={warehouse.id} className="bg-white shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-primary/5 border-b">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-lg">
              <Building2 className="h-5 w-5 mr-2 text-primary" />
              {warehouse.name}
            </CardTitle>
            {warehouse.status && (
              <Badge variant={warehouse.status === 'active' ? 'default' : 'outline'}>
                {warehouse.status === 'active' ? 'Aktiv' : 'Inaktiv'}
              </Badge>
            )}
          </div>
          {warehouse.description && (
            <CardDescription>{warehouse.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500">Produkte</span>
              <span className="text-xl font-bold">{productCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500">Kritische Bestände</span>
              <div className="flex items-center">
                <span className="text-xl font-bold">{criticalItemCount}</span>
                {criticalItemCount > 0 && (
                  <AlertTriangle className="h-4 w-4 ml-1 text-amber-500" />
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500">Automaten</span>
              <span className="text-xl font-bold">{machineCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500">Lagerwert</span>
              <span className="text-xl font-bold">
                {new Intl.NumberFormat('de-DE', { 
                  style: 'currency', 
                  currency: 'EUR' 
                }).format(inventoryValue / 100)}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Link href={`/lagerbestand/${warehouse.id}`}>
              <Button variant="outline" className="text-sm">
                Details ansehen
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h1 className="text-2xl font-bold">Lagerbestand Übersicht</h1>
        <Button 
          onClick={() => setIsNewWarehouseDialogOpen(true)}
          className="flex items-center gap-2 mt-2 sm:mt-0"
        >
          <Plus className="h-4 w-4" /> Lager erstellen
        </Button>
      </div>
      
      {/* System-Übersicht oben */}
      <div className="mb-8">
        {isLoadingStats ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          generateSystemOverview()
        )}
      </div>

      {/* Suche und Filter */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-grow max-w-md">
          <Input
            type="text"
            placeholder="Lager suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </span>
        </div>
      </div>

      {/* Tabs für unterschiedliche Ansichten */}
      <Tabs defaultValue="cards" className="mb-6">
        <TabsList className="mb-2">
          <TabsTrigger value="cards">Karten-Ansicht</TabsTrigger>
          <TabsTrigger value="table">Tabellen-Ansicht</TabsTrigger>
        </TabsList>
        
        <TabsContent value="cards">
          {isLoadingWarehouses ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredWarehouses.map(renderWarehouseCard)}
              
              {filteredWarehouses.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">Keine Lager gefunden</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchTerm 
                      ? `Keine Lager gefunden, die mit "${searchTerm}" übereinstimmen.` 
                      : 'Es sind noch keine Lager angelegt worden.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="table">
          <div className="bg-white rounded-md shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Beschreibung
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Produkte
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wert
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingWarehouses ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-6 py-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredWarehouses.map((warehouse: any) => {
                    const warehouseStats = Array.isArray(inventoryStats) 
                      ? inventoryStats.find((stat: any) => stat.warehouseId === warehouse.id)
                      : null;
                      
                    return (
                      <tr key={warehouse.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Building2 className="h-4 w-4 mr-2 text-gray-500" />
                            <div className="text-sm font-medium text-gray-900">{warehouse.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{warehouse.description || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={warehouse.status === 'active' ? 'default' : 'outline'}>
                            {warehouse.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {warehouseStats?.productCount || 0}
                            {(warehouseStats?.criticalItemCount || 0) > 0 && (
                              <span className="ml-2 inline-flex items-center">
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                                <span className="ml-1 text-xs text-amber-500">
                                  {warehouseStats?.criticalItemCount || 0}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {new Intl.NumberFormat('de-DE', { 
                              style: 'currency', 
                              currency: 'EUR' 
                            }).format((warehouseStats?.inventoryValue || 0) / 100)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Link href={`/lagerbestand/${warehouse.id}`}>
                            <Button variant="link" className="text-primary-600 hover:text-primary-900">
                              Details
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}

                {filteredWarehouses.length === 0 && !isLoadingWarehouses && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">Keine Lager gefunden</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {searchTerm 
                          ? `Keine Lager gefunden, die mit "${searchTerm}" übereinstimmen.` 
                          : 'Es sind noch keine Lager angelegt worden.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog zum Erstellen eines neuen Lagers */}
      <WarehouseFormDialog
        open={isNewWarehouseDialogOpen}
        onOpenChange={setIsNewWarehouseDialogOpen}
        warehouse={null}
        isNew={true}
      />
    </div>
  );
}
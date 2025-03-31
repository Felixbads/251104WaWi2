import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getProductDisposals, formatDateTime } from '@/lib/api';
import { getWarehouses } from '@/lib/warehouseApi';
import { getRemovedProducts, getRemovedProductsSummary, exportRemovedProducts } from '@/lib/removedProductsApi';
import { utils, writeFile } from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  ChevronLeft,
  Info,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search
} from 'lucide-react';

export default function WarenentnahmePage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('current');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<{startDate?: string; endDate?: string}>({});
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  
  // Lade Lager-Daten
  const { data: warehouses, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: getWarehouses
  });

  // Lade Warenentnahmen
  const { data: disposals, isLoading: isLoadingDisposals, isError: isErrorDisposals, error: disposalsError, refetch: refetchDisposals } = useQuery({
    queryKey: ['/api/product-disposals', selectedWarehouse],
    queryFn: () => getProductDisposals({ warehouseId: selectedWarehouse || undefined }),
  });

  // Filter und Sortierung
  const safeDisposals = disposals || [];
  const filteredDisposals = safeDisposals.filter(disposal => {
    if (!searchTerm) return true;
    
    // Suche in Beschreibung, Lager und Produkten
    return (
      disposal.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      disposal.warehouseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (disposal.items && Array.isArray(disposal.items) && disposal.items.some(item => 
        item && item.productName && item.productName.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    );
  });

  // Disposal-Gruppen berechnen (aktuelle, geplante, abgeschlossene)
  const currentDisposals = filteredDisposals.filter(d => d.status === 'pending');
  const completedDisposals = filteredDisposals.filter(d => d.status === 'completed');

  // Warehouse auswählen
  const handleSelectWarehouse = (warehouseId: string) => {
    setSelectedWarehouse(warehouseId === selectedWarehouse ? null : warehouseId);
  };

  // Neue Entsorgung erstellen
  const handleCreateNew = () => {
    setLocation('/warenentnahme/new');
  };

  // Entsorgung anzeigen
  const handleViewDisposal = (disposalId: number) => {
    setLocation(`/warenentnahme/${disposalId}`);
  };
  
  // Lade-/Fehlerzustand
  if (isLoadingDisposals) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Warenentnahme</h1>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isErrorDisposals) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Warenentnahme</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Fehler beim Laden der Warenentnahmen</h2>
              <p className="text-gray-500 mb-4">
                {disposalsError instanceof Error ? disposalsError.message : "Ein unbekannter Fehler ist aufgetreten."}
              </p>
              <Button onClick={() => refetchDisposals()}>
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Warenentnahme</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchDisposals()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Aktualisieren
          </Button>
          <Button size="sm" onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-1" />
            Neue Warenentnahme aus Lager
          </Button>
        </div>
      </div>

      {/* Filterleiste */}
      <div className="bg-card border rounded-lg p-3 mb-6 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 min-w-[280px]">
          <Search className="text-muted-foreground h-4 w-4 flex-shrink-0" />
          <Input
            placeholder="Suche nach Produkten, Beschreibungen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 md:w-[300px] lg:w-[400px]"
          />
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-xs font-normal text-muted-foreground mr-1">Lager:</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  {selectedWarehouse 
                    ? warehouses?.find(w => w.id === selectedWarehouse)?.name || 'Unbekanntes Lager'
                    : 'Alle Lager'}
                  <ChevronLeft className={`ml-2 h-4 w-4 transition-transform ${selectedWarehouse ? 'rotate-90' : '-rotate-90'}`} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedWarehouse(null)}>
                  Alle Lager
                </DropdownMenuItem>
                {Array.isArray(warehouses) && warehouses.map((warehouse) => (
                  <DropdownMenuItem 
                    key={warehouse.id}
                    onClick={() => handleSelectWarehouse(warehouse.id)}
                  >
                    {warehouse.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs und Inhalt */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="current" className="relative">
            Aktuelle
            {currentDisposals.length > 0 && (
              <Badge className="ml-2 bg-primary text-white">{currentDisposals.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Abgeschlossen
            {completedDisposals.length > 0 && (
              <Badge className="ml-2">{completedDisposals.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="removed">
            Entnahme aus Automaten
            <Badge className="ml-2 bg-amber-400 text-white">NEU</Badge>
          </TabsTrigger>
        </TabsList>
        
        {/* Liste der aktuellen Entsorgungen */}
        <TabsContent value="current">
          <Card>
            <CardHeader>
              <CardTitle>Warenentnahme aus Lager</CardTitle>
              <CardDescription>
                Produkte, die aus dem Lager entnommen werden müssen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentDisposals.length === 0 ? (
                <div className="text-center py-8">
                  <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">Keine aktuellen Warenentnahmen</p>
                  <p className="text-gray-400 text-sm">
                    Überlagerte Produkte werden hier angezeigt, wenn sie zur Entsorgung markiert werden.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Lager</TableHead>
                      <TableHead>Produkte</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentDisposals.map((disposal) => (
                      <TableRow key={disposal.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDisposal(disposal.id)}>
                        <TableCell className="font-medium">{disposal.id}</TableCell>
                        <TableCell>{formatDateTime(disposal.createdAt, 'date')}</TableCell>
                        <TableCell>{disposal.warehouseName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{disposal.items?.length || 0} Produkt(e)</span>
                            <span className="text-xs text-muted-foreground">
                              {disposal.items && disposal.items.length > 0 
                                ? (
                                  <>
                                    {disposal.items.map(i => i.productName).slice(0, 1).join(', ')}
                                    {disposal.items.length > 1 ? ` und ${disposal.items.length - 1} weitere` : ''}
                                  </>
                                ) : 'Keine Produkte'
                              }
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{disposal.reason || 'Nicht angegeben'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            Ausstehend
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleViewDisposal(disposal.id);
                              }}>
                                Details ansehen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Liste der abgeschlossenen Entsorgungen */}
        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Abgeschlossene Warenentnahmen</CardTitle>
              <CardDescription>
                Bereits entsorgte Produkte und abgeschlossene Vorgänge
              </CardDescription>
            </CardHeader>
            <CardContent>
              {completedDisposals.length === 0 ? (
                <div className="text-center py-8">
                  <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Keine abgeschlossenen Warenentnahmen</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Lager</TableHead>
                      <TableHead>Produkte</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedDisposals.map((disposal) => (
                      <TableRow key={disposal.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDisposal(disposal.id)}>
                        <TableCell className="font-medium">{disposal.id}</TableCell>
                        <TableCell>{formatDateTime(disposal.completedAt || disposal.createdAt, 'date')}</TableCell>
                        <TableCell>{disposal.warehouseName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{disposal.items?.length || 0} Produkt(e)</span>
                            <span className="text-xs text-muted-foreground">
                              {disposal.items && disposal.items.length > 0 
                                ? (
                                  <>
                                    {disposal.items.map(i => i.productName).slice(0, 1).join(', ')}
                                    {disposal.items.length > 1 ? ` und ${disposal.items.length - 1} weitere` : ''}
                                  </>
                                ) : 'Keine Produkte'
                              }
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{disposal.reason || 'Nicht angegeben'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-100 text-green-800">
                            Abgeschlossen
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleViewDisposal(disposal.id);
                              }}>
                                Details ansehen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardFooter>
              <div className="text-xs text-muted-foreground">
                Zeige {completedDisposals.length} abgeschlossene Warenentnahmen
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Entfernte/Entnommene Produkte (Refill Details mit removed > 0) */}
        <TabsContent value="removed">
          <Card>
            <CardHeader>
              <CardTitle>Entnahme aus Automaten</CardTitle>
              <CardDescription>
                Produkte, die bei der Auffüllung aus Automaten entnommen wurden (aus Refill-Details)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filter-Optionen für entnommene Produkte */}
              <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="dateStart">Von Datum</Label>
                  <Input
                    id="dateStart"
                    type="date"
                    className="mt-1"
                    value={dateFilter.startDate || ''}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="dateEnd">Bis Datum</Label>
                  <Input
                    id="dateEnd"
                    type="date"
                    className="mt-1"
                    value={dateFilter.endDate || ''}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline" 
                    className="mb-1"
                    onClick={() => setDateFilter({})}
                  >
                    Filter zurücksetzen
                  </Button>
                  <Button
                    variant="outline"
                    className="mb-1"
                    onClick={() => {
                      // Standardwerte setzen: 30 Tage zurück bis heute
                      const today = new Date();
                      const startDate = new Date();
                      startDate.setDate(today.getDate() - 30);
                      
                      setDateFilter({
                        startDate: startDate.toISOString().split('T')[0],
                        endDate: today.toISOString().split('T')[0]
                      });
                    }}
                  >
                    Letzte 30 Tage
                  </Button>
                </div>
              </div>
              
              {/* Lade Daten zu entnommenen Produkten */}
              <RemovedProductsSection 
                dateFilter={dateFilter} 
                selectedMachine={selectedMachine}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Komponente für entnommene Produkte
function RemovedProductsSection({ 
  dateFilter, 
  selectedMachine 
}: { 
  dateFilter: {startDate?: string; endDate?: string}, 
  selectedMachine: string | null 
}) {
  // Lade entnommene Produkte
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/removed-products', dateFilter, selectedMachine],
    queryFn: () => getRemovedProducts({
      machineId: selectedMachine || undefined,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      limit: 1000 // Erhöht auf 1000 Produkte statt Standard-Limit
    }),
  });
  
  // Export-Funktion
  const handleExport = (format: 'excel' | 'csv') => {
    if (!data) return;
    
    exportRemovedProducts({
      machineId: selectedMachine || undefined,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate
    }, format).then((blob: Blob) => {
      const fileName = `entnahme-automaten-${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <div className="text-center mb-6">
          <Skeleton className="h-10 w-40 mx-auto mb-4" />
          <Skeleton className="h-6 w-60 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-60 rounded-lg" />
          <Skeleton className="h-60 rounded-lg" />
          <Skeleton className="h-60 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-medium mb-2">Fehler beim Laden der entnommenen Produkte</h2>
        <p className="text-gray-500 mb-4">
          {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
        </p>
      </div>
    );
  }

  if (!data || !data.products || data.products.length === 0) {
    return (
      <div className="text-center py-8">
        <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-2">Keine entnommenen Produkte gefunden</p>
        <p className="text-gray-400 text-sm">
          Für den gewählten Zeitraum wurden keine entnommenen Produkte gefunden.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Export-Buttons */}
      <div className="flex justify-end mb-4 gap-2">
        <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
          Excel exportieren
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
          CSV exportieren
        </Button>
      </div>
      
      {/* Zeitliche Verteilung Grafik */}
      {/* Grafik-Tabs für verschiedene Analysen */}
      <Tabs defaultValue="time" className="mb-6">
        <Card>
          <CardHeader className="pb-2 border-b">
            <div className="flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-lg">Grafische Analyse der Entnahmen</CardTitle>
                <CardDescription>
                  Visualisierung der Entnahmen nach verschiedenen Kriterien
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="time">Nach Zeit</TabsTrigger>
                <TabsTrigger value="product">Nach Produkt</TabsTrigger>
                <TabsTrigger value="machine">Nach Standort</TabsTrigger>
                <TabsTrigger value="combined">Produkt + Standort</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Zeitliche Verteilung */}
            <TabsContent value="time" className="m-0">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.analytics.byDate.map(item => ({
                      date: new Date(item.date).toLocaleDateString('de-DE'),
                      count: item.count
                    }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Entnommene Produkte" 
                      stroke="#8884d8"
                      strokeWidth={2}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            
            {/* Verteilung nach Produkt */}
            <TabsContent value="product" className="m-0">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.analytics.byProduct.slice(0, 10).map(item => ({
                      name: item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name,
                      count: item.count
                    }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      name="Entnahmen pro Produkt" 
                      fill="#82ca9d"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            
            {/* Verteilung nach Standort/Automat */}
            <TabsContent value="machine" className="m-0">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.analytics.byMachine.slice(0, 10).map(item => ({
                      name: item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name,
                      count: item.count
                    }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      name="Entnahmen pro Standort" 
                      fill="#ff7300"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            
            {/* Kombinierte Ansicht: Top Produkte pro Standort */}
            <TabsContent value="combined" className="m-0">
              <div className="h-72">
                {/* For the combined view, we'll create a specialized visualization */}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={
                      // Take top 5 machines and get their top products
                      data.analytics.byMachine.slice(0, 5).flatMap(machine => 
                        // Find products for this machine in the products list
                        data.products
                          .filter(p => p.machineId === machine.name || p.machineName === machine.name)
                          .reduce((acc, product) => {
                            // Group by product name and count
                            const existing = acc.find(p => p.productName === product.productName);
                            if (existing) {
                              existing.count += product.removed;
                            } else {
                              acc.push({
                                machineName: machine.name.length > 15 ? machine.name.substring(0, 15) + '...' : machine.name,
                                productName: product.productName.length > 15 ? product.productName.substring(0, 15) + '...' : product.productName,
                                count: product.removed
                              });
                            }
                            return acc;
                          }, [] as {machineName: string; productName: string; count: number}[])
                          // Take top 3 products for each machine
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 3)
                          .map(item => ({
                            name: `${item.productName} (${item.machineName})`,
                            count: item.count
                          }))
                      )
                    }
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={200} />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      dataKey="count" 
                      name="Top Produkte pro Standort" 
                      fill="#8884d8"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
      
      {/* Statistik-Widgets und Zusammenfassung */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Nach Produkt</CardTitle>
            <CardDescription>
              Welche Produkte wurden am häufigsten entnommen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.analytics.byProduct.slice(0, 5).map(item => (
                <div key={item.name} className="flex justify-between items-center">
                  <div className="flex-1 truncate mr-4">
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-600">
                    {item.count}x
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Nach Automat</CardTitle>
            <CardDescription>
              Automaten mit den meisten Entnahmen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.analytics.byMachine.slice(0, 5).map(item => (
                <div key={item.name} className="flex justify-between items-center">
                  <div className="flex-1 truncate mr-4">
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-600">
                    {item.count}x
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Nach Datum</CardTitle>
            <CardDescription>
              Zeitliche Verteilung der Entnahmen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.analytics.byDate.slice(0, 5).map(item => (
                <div key={item.date} className="flex justify-between items-center">
                  <div className="flex-1 truncate mr-4">
                    <span className="font-medium truncate">{new Date(item.date).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})}</span>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-600">
                    {item.count}x
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detaillierte Auflistung */}
      <div>
        <h3 className="text-lg font-medium mb-4">Detaillierte Auflistung</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Automat</TableHead>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Menge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.products.map(product => (
              <TableRow key={product.id}>
                <TableCell>{new Date(product.datetime).toLocaleDateString('de-DE', {
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit'
                })}</TableCell>
                <TableCell>{product.machineName}</TableCell>
                <TableCell className="font-medium">{product.productName}</TableCell>
                <TableCell className="text-right">
                  <Badge>{product.removed} Stk.</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
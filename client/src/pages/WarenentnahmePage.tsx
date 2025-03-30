import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  Filter,
  Info,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/api';
import { 
  createProductDisposal, 
  getProductDisposals,
  getWarehouses,
  ProductDisposal,
  ProductDisposalItem,
  Warehouse
} from '@/lib/api';

export default function WarenentnahmePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("current");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);

  // API-Anfragen
  const { 
    data: warehouses,
    isLoading: isLoadingWarehouses,
  } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => getWarehouses(),
  });
  
  const { 
    data: disposals, 
    isLoading: isLoadingDisposals,
    isError: isErrorDisposals,
    error: disposalsError,
    refetch: refetchDisposals,
  } = useQuery({
    queryKey: ['/api/product-disposals', selectedWarehouse],
    queryFn: () => getProductDisposals({ warehouseId: selectedWarehouse }),
  });

  // Filter und Sortierung
  const filteredDisposals = disposals?.filter(disposal => {
    if (!searchTerm) return true;
    
    // Suche in Beschreibung, Lager und Produkten
    return (
      disposal.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      disposal.warehouseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      disposal.items.some(item => 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }) || [];

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
            Neue Warenentnahme
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
                {warehouses?.map((warehouse) => (
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
        </TabsList>
        
        {/* Liste der aktuellen Entsorgungen */}
        <TabsContent value="current">
          <Card>
            <CardHeader>
              <CardTitle>Aktuelle Warenentnahmen</CardTitle>
              <CardDescription>
                Überalterte oder beschädigte Produkte, die aus dem Lager entnommen werden müssen
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
                            <span>{disposal.items.length} Produkt(e)</span>
                            <span className="text-xs text-muted-foreground">
                              {disposal.items.map(i => i.productName).slice(0, 1).join(', ')}
                              {disposal.items.length > 1 ? ` und ${disposal.items.length - 1} weitere` : ''}
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
                            <span>{disposal.items.length} Produkt(e)</span>
                            <span className="text-xs text-muted-foreground">
                              {disposal.items.map(i => i.productName).slice(0, 1).join(', ')}
                              {disposal.items.length > 1 ? ` und ${disposal.items.length - 1} weitere` : ''}
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
      </Tabs>
    </div>
  );
}
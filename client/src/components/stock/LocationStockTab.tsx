import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  MachineStock, 
  Stock, 
  getMachineStocksByLocation, 
  getStocks, 
  Machine, 
  getMachines,
  formatDateTime
} from '@/lib/api';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CircleAlert, Search, ArrowUpDown, SlidersHorizontal, Package, Package2, AlertCircle } from 'lucide-react';

interface LocationStockTabProps {
  locationId: number;
}

interface ProductStockSummary {
  productVendonId: string;
  productName: string;
  totalQuantity: number;
  machineDistribution: {
    machineId: number;
    machineName: string;
    quantity: number;
  }[];
  status: string;
  lastFilled?: string;
}

/**
 * Komponente für den Bestand-Tab auf der Standortdetailseite
 * Zeigt den Bestand aller Automaten an diesem Standort an.
 */
export function LocationStockTab({ locationId }: LocationStockTabProps) {
  const [activeView, setActiveView] = useState<'product' | 'machine'>('product');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  
  // Abrufen der Maschinenbestände für den Standort
  const { 
    data: machineStocks, 
    isLoading: isLoadingMachineStocks,
    error: machineStocksError
  } = useQuery({
    queryKey: ['machine-stocks-by-location', locationId],
    queryFn: () => getMachineStocksByLocation(locationId),
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!locationId,
  });
  
  // Abrufen aller Produktbestände (für die Anzeige der Produktnamen)
  const { 
    data: stockProducts, 
    isLoading: isLoadingStockProducts 
  } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => getStocks(),
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Abrufen aller Automaten (für die Anzeige der Automatennamen)
  const { 
    data: machines, 
    isLoading: isLoadingMachines 
  } = useQuery({
    queryKey: ['machines'],
    queryFn: () => getMachines(),
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Aggregierte Produktansicht generieren
  const productSummary = getProductSummary(machineStocks, stockProducts, machines);
  
  // Gefilterte Produktliste basierend auf Suchbegriff und Kritischen-Filter
  const filteredProducts = productSummary.filter(product => {
    const matchesSearch = product.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCritical = showCriticalOnly ? product.status === 'critical' : true;
    return matchesSearch && matchesCritical;
  });
  
  // Gefilterte Maschinenbestandsliste basierend auf Suchbegriff
  const filteredMachineStocks = machineStocks?.filter(stock => {
    // Produktname aus dem stock-Produkt finden
    const product = stockProducts?.find(p => p.vendonId === stock.productVendonId);
    const productName = product?.productName || '';
    
    // Maschinenname aus der machines-Liste finden
    const machine = machines?.find(m => Number(m.id) === stock.machineId);
    const machineName = machine?.machineName || '';
    
    return (
      productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.selectionNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  
  // Laden-Status anzeigen
  if (isLoadingMachineStocks || isLoadingStockProducts || isLoadingMachines) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Fehler-Status anzeigen
  if (machineStocksError) {
    return (
      <div className="rounded-lg bg-destructive/15 p-4 text-center">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">
          Fehler beim Laden der Maschinenbestände
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(machineStocksError as Error)?.message || 'Es ist ein unbekannter Fehler aufgetreten.'}
        </p>
      </div>
    );
  }
  
  // Keine Daten gefunden
  if (!machineStocks || machineStocks.length === 0) {
    return (
      <div className="rounded-lg bg-muted/50 p-4 text-center">
        <Package2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <h3 className="font-medium">Keine Bestandsdaten gefunden</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Es wurden keine Automaten oder Produkte an diesem Standort gefunden.
        </p>
      </div>
    );
  }
  
  // Kennzahlen berechnen
  const totalProducts = productSummary.length;
  const totalItems = productSummary.reduce((sum, product) => sum + product.totalQuantity, 0);
  const criticalProducts = productSummary.filter(product => product.status === 'critical').length;
  const uniqueMachineIds = Array.from(new Set(machineStocks.map(stock => stock.machineId)));
  const uniqueMachines = uniqueMachineIds.length;
  
  return (
    <div className="space-y-6">
      {/* KPIs / Kennzahlen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <Package className="h-4 w-4 mr-2 text-primary" />
              Produkte
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{totalProducts}</div>
            <p className="text-sm text-muted-foreground">Verschiedene Produkte</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <Package2 className="h-4 w-4 mr-2 text-primary" />
              Gesamtbestand
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{totalItems}</div>
            <p className="text-sm text-muted-foreground">Einheiten in Automaten</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <CircleAlert className="h-4 w-4 mr-2 text-destructive" />
              Kritische Bestände
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{criticalProducts}</div>
            <p className="text-sm text-muted-foreground">Produkte zum Nachfüllen</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center">
              <Package className="h-4 w-4 mr-2 text-primary" />
              Automaten
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-3xl font-bold">{uniqueMachines}</div>
            <p className="text-sm text-muted-foreground">An diesem Standort</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Suchleiste und Filter */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full sm:w-1/2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Nach Produkt oder Automaten suchen..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center space-x-2 ml-auto">
          <Checkbox 
            id="show-critical" 
            checked={showCriticalOnly}
            onCheckedChange={(checked) => setShowCriticalOnly(!!checked)}
          />
          <label
            htmlFor="show-critical"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Nur kritische Bestände anzeigen
          </label>
        </div>
      </div>
      
      {/* Tabs für verschiedene Ansichten */}
      <Tabs defaultValue={activeView} onValueChange={(value) => setActiveView(value as 'product' | 'machine')}>
        <TabsList className="mb-4">
          <TabsTrigger value="product">Produktansicht</TabsTrigger>
          <TabsTrigger value="machine">Maschinenansicht</TabsTrigger>
        </TabsList>
        
        {/* Produktansicht */}
        <TabsContent value="product" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Produktübersicht</CardTitle>
              <CardDescription>
                Aggregierte Bestandsübersicht nach Produkten
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Keine Produkte gefunden.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-center">Gesamtbestand</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Letzte Auffüllung</TableHead>
                      <TableHead>In Automaten</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.productVendonId}>
                        <TableCell className="font-medium">
                          {product.productName}
                        </TableCell>
                        <TableCell className="text-center">{product.totalQuantity}</TableCell>
                        <TableCell className="text-center">
                          {product.status === 'critical' ? (
                            <Badge variant="destructive">Kritisch</Badge>
                          ) : product.status === 'low' ? (
                            <Badge variant="secondary">Niedrig</Badge>
                          ) : (
                            <Badge variant="outline">Normal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {product.lastFilled 
                            ? formatDateTime(product.lastFilled, 'date') 
                            : '–'}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {product.machineDistribution.map((machine) => (
                              <div key={machine.machineId} className="flex justify-between text-muted-foreground">
                                <span>{machine.machineName || `Automat #${machine.machineId}`}</span>
                                <span>{machine.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Maschinenansicht */}
        <TabsContent value="machine" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Maschinendetails</CardTitle>
              <CardDescription>
                Detaillierte Bestandsübersicht nach Automaten
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!filteredMachineStocks || filteredMachineStocks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Keine Automatenbestände gefunden.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Automat</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-center">Position</TableHead>
                      <TableHead className="text-center">Bestand</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Letzte Auffüllung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMachineStocks.map((stock) => {
                      // Produkt- und Maschinennamen finden
                      const product = stockProducts?.find(p => p.vendonId === stock.productVendonId);
                      const machine = machines?.find(m => Number(m.id) === stock.machineId);
                      
                      // Status basierend auf Menge (Beispielschwellwerte, können angepasst werden)
                      const status = stock.quantity <= 2 ? 'critical' : 
                                   stock.quantity <= 5 ? 'low' : 'normal';
                      
                      return (
                        <TableRow key={`${stock.machineId}-${stock.productVendonId}-${stock.selectionNumber}`}>
                          <TableCell className="font-medium">
                            {machine?.machineName || `Automat #${stock.machineId}`}
                          </TableCell>
                          <TableCell>{product?.productName || stock.productVendonId}</TableCell>
                          <TableCell className="text-center">{stock.selectionNumber}</TableCell>
                          <TableCell className="text-center">{stock.quantity}</TableCell>
                          <TableCell className="text-center">
                            {status === 'critical' ? (
                              <Badge variant="destructive">Kritisch</Badge>
                            ) : status === 'low' ? (
                              <Badge variant="secondary">Niedrig</Badge>
                            ) : (
                              <Badge variant="outline">Normal</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {stock.lastFilled 
                              ? formatDateTime(stock.lastFilled, 'date') 
                              : '–'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Hilfsfunktion zur Generierung einer aggregierten Produktübersicht.
 */
function getProductSummary(
  machineStocks?: MachineStock[], 
  stocks?: Stock[], 
  machines?: Machine[]
): ProductStockSummary[] {
  if (!machineStocks || machineStocks.length === 0) {
    return [];
  }
  
  // Groupieren nach Produkt
  const groupedByProduct: Record<string, ProductStockSummary> = {};
  
  machineStocks.forEach(stock => {
    const productVendonId = stock.productVendonId;
    
    // Produkt im Gruppenobjekt erstellen, wenn es noch nicht existiert
    if (!groupedByProduct[productVendonId]) {
      const product = stocks?.find(p => p.vendonId === productVendonId);
      groupedByProduct[productVendonId] = {
        productVendonId,
        productName: product?.productName || productVendonId,
        totalQuantity: 0,
        machineDistribution: [],
        status: 'normal',
        lastFilled: undefined
      };
    }
    
    // Maschinennamen finden
    const machine = machines?.find(m => Number(m.id) === stock.machineId);
    const machineName = machine?.machineName || `Automat #${stock.machineId}`;
    
    // Bestand für diese Maschine hinzufügen
    groupedByProduct[productVendonId].machineDistribution.push({
      machineId: stock.machineId,
      machineName,
      quantity: stock.quantity
    });
    
    // Gesamtbestand aktualisieren
    groupedByProduct[productVendonId].totalQuantity += stock.quantity;
    
    // Letzte Auffüllung aktualisieren (nehme das neueste Datum)
    if (stock.lastFilled) {
      const lastFilled = new Date(stock.lastFilled);
      if (!groupedByProduct[productVendonId].lastFilled || 
          new Date(groupedByProduct[productVendonId].lastFilled!) < lastFilled) {
        groupedByProduct[productVendonId].lastFilled = stock.lastFilled;
      }
    }
  });
  
  // Status basierend auf Gesamtbestand festlegen
  Object.values(groupedByProduct).forEach(product => {
    if (product.totalQuantity <= 5) {
      product.status = 'critical';
    } else if (product.totalQuantity <= 10) {
      product.status = 'low';
    } else {
      product.status = 'normal';
    }
  });
  
  // In ein Array konvertieren und nach Produktname sortieren
  return Object.values(groupedByProduct).sort((a, b) => 
    a.productName.localeCompare(b.productName)
  );
}
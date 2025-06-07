import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  Package, 
  TrendingDown, 
  Clock, 
  Filter,
  RefreshCw,
  Download,
  Eye
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface CriticalInventoryItem {
  id: number;
  warehouseId: number;
  warehouseName: string;
  productId: number;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  reorderPoint: number;
  price: number;
  sku: string;
  category: string;
  isActivelySold: boolean;
  lastSaleDate: string | null;
  salesLast7Days: number;
  criticalityScore: number;
  shouldAlert: boolean;
  assignedMachines: Array<{
    id: number;
    machineName: string;
    locationName: string;
    status: string;
  }>;
}

interface CriticalInventoryResponse {
  criticalItems: CriticalInventoryItem[];
  totalCritical: number;
  totalInventoryItems: number;
  summary: {
    byWarehouse: Array<{
      warehouseId: number;
      warehouseName: string;
      count: number;
      totalValue: number;
    }>;
    byCategory: Array<{
      category: string;
      count: number;
    }>;
  };
}

export default function CriticalInventory() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [includeRecentSales, setIncludeRecentSales] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error, refetch } = useQuery<CriticalInventoryResponse>({
    queryKey: [
      '/api/critical-inventory/critical-inventory',
      selectedWarehouse,
      includeRecentSales
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedWarehouse && selectedWarehouse !== 'all') {
        params.append('warehouseId', selectedWarehouse);
      }
      if (includeRecentSales) {
        params.append('includeRecentSales', 'true');
      }
      
      const url = `/api/critical-inventory/critical-inventory${params.toString() ? `?${params}` : ''}`;
      console.log('Fetching critical inventory from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Response status:', response.status);
        console.error('Response text:', await response.text());
        throw new Error('Fehler beim Laden der kritischen Bestände');
      }
      return response.json();
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: async () => {
      const response = await fetch('/api/warehouses');
      if (!response.ok) throw new Error('Fehler beim Laden der Lager');
      return response.json();
    },
  });

  // Filter items based on search term
  const filteredItems = data?.criticalItems.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.warehouseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getCriticalityBadge = (score: number) => {
    if (score <= 0.2) return <Badge variant="destructive">Kritisch</Badge>;
    if (score <= 0.5) return <Badge variant="secondary">Niedrig</Badge>;
    if (score <= 0.8) return <Badge variant="outline">Beachten</Badge>;
    return <Badge variant="default">Normal</Badge>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nie';
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
              <p>Fehler beim Laden der kritischen Bestände</p>
              <Button onClick={() => refetch()} className="mt-4">
                <RefreshCw className="h-4 w-4 mr-2" />
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Kritische Bestände</h1>
        <p className="text-muted-foreground">
          Überwachung von Produkten mit niedrigen Beständen in aktiv genutzten Automaten
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Kritische Produkte
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                {data?.totalCritical || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Benötigen Nachbestellung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Gesamte Bestände
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.totalInventoryItems || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Produkte im System
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Betroffene Lager
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-500">
                {data?.summary.byWarehouse.length || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Mit kritischen Beständen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Letzte Aktualisierung
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Date().toLocaleTimeString('de-DE', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Aktueller Stand
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Lager</label>
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Lager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lager</SelectItem>
                  {warehouses?.map((warehouse: any) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Produktsuche</label>
              <Input
                placeholder="Nach Produkt oder Kategorie suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => refetch()}
                className="mr-2"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kritische Bestände Details</CardTitle>
          <CardDescription>
            {filteredItems.length} von {data?.criticalItems.length || 0} Produkten angezeigt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Keine kritischen Bestände gefunden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead>Bestand</TableHead>
                    <TableHead>Min. Bestand</TableHead>
                    <TableHead>Kritikalität</TableHead>
                    <TableHead>Verkäufe (7T)</TableHead>
                    <TableHead>Letzter Verkauf</TableHead>
                    <TableHead>Automaten</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.category} • {item.sku}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.warehouseName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          <div className="font-bold text-destructive">
                            {item.currentQuantity}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          {item.minQuantity || 5}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getCriticalityBadge(item.criticalityScore)}
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <Badge variant={item.salesLast7Days > 0 ? "default" : "secondary"}>
                            {item.salesLast7Days}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDate(item.lastSaleDate)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {item.assignedMachines.length} Automaten
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
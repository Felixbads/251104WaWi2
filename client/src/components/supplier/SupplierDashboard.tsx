import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  TrendingUp, 
  ShoppingCart, 
  Warehouse,
  DollarSign,
  Calendar,
  MapPin,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart } from 'recharts';

interface SupplierDashboardProps {
  supplierId: number;
  supplier: any;
}

interface DashboardData {
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    openOrders: number;
    totalRevenue: number;
    monthlyRevenue: number;
    lastOrderDate: string | null;
  };
  inventory: Array<{
    productId: number;
    productName: string;
    sku: string;
    warehouses: Array<{
      warehouseId: number;
      warehouseName: string;
      location: string;
      stock: number;
      reorderLevel: number;
      status: 'good' | 'warning' | 'critical';
    }>;
    totalStock: number;
    averageStock: number;
  }>;
  salesData: Array<{
    date: string;
    revenue: number;
    orders: number;
    products: number;
  }>;
  topLocations: Array<{
    locationId: number;
    locationName: string;
    revenue: number;
    orders: number;
    percentage: number;
  }>;
  topProducts: Array<{
    productId: number;
    productName: string;
    revenue: number;
    quantity: number;
    growth?: number;
  }>;
}

export default function SupplierDashboard({ supplierId, supplier }: SupplierDashboardProps) {
  const { data: rawDashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: [`/api/supplier-analytics/dashboard/${supplierId}`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Handle different API response formats
  const dashboardData = React.useMemo(() => {
    if (!rawDashboardData) return null;
    
    // Transform the API response to match our expected format
    const apiData = rawDashboardData as any;
    
    if (apiData.overview) {
      return {
        overview: {
          totalProducts: parseInt(apiData.overview.products_sold) || 0,
          activeProducts: parseInt(apiData.overview.products_sold) || 0,
          totalOrders: parseInt(apiData.overview.total_orders) || 0,
          openOrders: 0, // Not provided by API
          totalRevenue: parseFloat(apiData.overview.total_revenue) || 0,
          monthlyRevenue: apiData.salesData?.[0]?.revenue || 0,
          lastOrderDate: null, // Not provided by API
        },
        salesData: apiData.salesData || [],
        topProducts: apiData.productPerformance?.map((product: any) => ({
          productId: product.productId,
          productName: product.productName,
          revenue: product.revenue,
          quantity: product.quantitySold,
          growth: 0,
        })) || [],
        inventory: apiData.inventory || [],
        topLocations: apiData.topLocations || [],
      };
    }
    
    return null;
  }, [rawDashboardData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Daten verfügbar</h3>
            <p className="text-muted-foreground">
              Dashboard-Daten für diesen Lieferanten konnten nicht geladen werden.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const getStockStatus = (status: string) => {
    switch (status) {
      case 'good':
        return <Badge className="bg-green-100 text-green-800">Gut</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Niedrig</Badge>;
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Kritisch</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Übersichtskarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktuelle Produkte</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.overview.activeProducts}</div>
            <p className="text-xs text-muted-foreground">
              von {dashboardData.overview.totalProducts} Gesamtprodukten
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktuelle Verkäufe</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardData.overview.monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              diesen Monat
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Bestellungen</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.overview.openOrders}</div>
            <p className="text-xs text-muted-foreground">
              von {dashboardData.overview.totalOrders} Gesamtbestellungen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Letzte Bestellung</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.overview.lastOrderDate ? formatDate(dashboardData.overview.lastOrderDate) : 'Keine'}
            </div>
            <p className="text-xs text-muted-foreground">
              Zuletzt bestellt
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warenbestand Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            Warenbestand je Lager
          </CardTitle>
          <CardDescription>
            Aktuelle Bestände aller Produkte in den jeweiligen Lagern
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Lager</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead className="text-right">Bestand</TableHead>
                  <TableHead className="text-right">Mindestbestand</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData.inventory && dashboardData.inventory.length > 0 ? (
                  dashboardData.inventory.flatMap((product: any) =>
                    product.warehouses.map((warehouse: any) => (
                      <TableRow key={`${product.productId}-${warehouse.warehouseId}`}>
                        <TableCell className="font-medium">{product.productName}</TableCell>
                        <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                        <TableCell>{warehouse.warehouseName}</TableCell>
                        <TableCell>{warehouse.location}</TableCell>
                        <TableCell className="text-right">{warehouse.stock}</TableCell>
                        <TableCell className="text-right">{warehouse.reorderLevel}</TableCell>
                        <TableCell>{getStockStatus(warehouse.status)}</TableCell>
                      </TableRow>
                    ))
                  )
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Keine Bestandsdaten verfügbar
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verkaufsentwicklung */}
        <Card>
          <CardHeader>
            <CardTitle>Verkaufsentwicklung über Zeit</CardTitle>
            <CardDescription>
              Umsatz und Bestellungen der letzten 30 Tage
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData.salesData && dashboardData.salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData.salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(date) => formatDate(date)}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value,
                      name === 'revenue' ? 'Umsatz' : 'Bestellungen'
                    ]}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="revenue"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#82ca9d" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="orders"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Keine Verkaufsdaten verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Standorte */}
        <Card>
          <CardHeader>
            <CardTitle>Top Standorte</CardTitle>
            <CardDescription>
              Beste performende Standorte nach Umsatz
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData.topLocations && dashboardData.topLocations.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData.topLocations} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis 
                    dataKey="locationName" 
                    type="category" 
                    tick={{ fontSize: 12 }}
                    width={100}
                  />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Umsatz']}
                />
                <Bar dataKey="revenue" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Keine Standortdaten verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Produkte */}
      <Card>
        <CardHeader>
          <CardTitle>Top Produkte</CardTitle>
          <CardDescription>
            Beste performende Produkte nach Umsatz und Absatz
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dashboardData.topProducts && dashboardData.topProducts.length > 0 ? (
              dashboardData.topProducts.map((product: any, index: number) => (
              <div key={product.productId} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-medium">{product.productName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {product.quantity} Einheiten verkauft
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatCurrency(product.revenue)}</div>
                  {product.growth !== undefined && product.growth !== null ? (
                    <div className={`text-sm flex items-center ${
                      product.growth >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {product.growth >= 0 ? '+' : ''}{product.growth.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Trend nicht verfügbar
                    </div>
                  )}
                </div>
              </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Keine Produktdaten verfügbar
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
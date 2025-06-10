import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  PieChart,
  Calendar,
  MapPin,
  Package,
  Euro,
  Users,
  Clock
} from 'lucide-react';
import { 
  Line, 
  LineChart, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Bar, 
  BarChart,
  PieChart as RechartsPieChart,
  Cell,
  Area,
  AreaChart
} from 'recharts';

interface SupplierStatisticsProps {
  supplierId: number;
  supplier: any;
}

interface StatisticsData {
  overview: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    topSellingProduct: string;
    revenueGrowth: number;
    orderGrowth: number;
  };
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    orders: number;
    avgOrderValue: number;
  }>;
  productPerformance: Array<{
    productId: number;
    productName: string;
    revenue: number;
    quantity: number;
    growth: number;
    margin: number;
  }>;
  locationPerformance: Array<{
    locationId: number;
    locationName: string;
    revenue: number;
    orders: number;
    growth: number;
    topProducts: Array<{
      productName: string;
      quantity: number;
    }>;
  }>;
  seasonalTrends: Array<{
    period: string;
    revenue: number;
    orders: number;
    avgTemp: number;
  }>;
  orderPatterns: Array<{
    dayOfWeek: string;
    hour: number;
    orders: number;
    revenue: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function SupplierStatistics({ supplierId, supplier }: SupplierStatisticsProps) {
  const [timeRange, setTimeRange] = useState('12m');
  
  const { data: statisticsData, isLoading } = useQuery<StatisticsData>({
    queryKey: [`/api/supplier-analytics/statistics/${supplierId}`, timeRange],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
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

  if (!statisticsData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Statistiken verfügbar</h3>
            <p className="text-muted-foreground">
              Für diesen Lieferanten sind noch keine Statistikdaten verfügbar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Zeitraum-Selektor */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Statistiken</h2>
          <p className="text-muted-foreground">Detaillierte Analyse der Lieferantenperformance</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Letzte 3 Monate</SelectItem>
            <SelectItem value="6m">Letzte 6 Monate</SelectItem>
            <SelectItem value="12m">Letzte 12 Monate</SelectItem>
            <SelectItem value="24m">Letzte 2 Jahre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statisticsData.overview.totalRevenue)}</div>
            <div className={`text-xs flex items-center ${
              statisticsData.overview.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {statisticsData.overview.revenueGrowth >= 0 ? 
                <TrendingUp className="h-3 w-3 mr-1" /> : 
                <TrendingDown className="h-3 w-3 mr-1" />
              }
              {formatPercentage(statisticsData.overview.revenueGrowth)} vs. Vorperiode
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bestellungen</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statisticsData.overview.totalOrders}</div>
            <div className={`text-xs flex items-center ${
              statisticsData.overview.orderGrowth >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {statisticsData.overview.orderGrowth >= 0 ? 
                <TrendingUp className="h-3 w-3 mr-1" /> : 
                <TrendingDown className="h-3 w-3 mr-1" />
              }
              {formatPercentage(statisticsData.overview.orderGrowth)} vs. Vorperiode
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ø Bestellwert</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statisticsData.overview.avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground">
              Durchschnittlicher Bestellwert
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Produkt</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{statisticsData.overview.topSellingProduct}</div>
            <p className="text-xs text-muted-foreground">
              Bestseller der Periode
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="revenue">Umsatzentwicklung</TabsTrigger>
          <TabsTrigger value="products">Produktperformance</TabsTrigger>
          <TabsTrigger value="locations">Standortanalyse</TabsTrigger>
          <TabsTrigger value="trends">Trends & Muster</TabsTrigger>
        </TabsList>

        {/* Umsatzentwicklung */}
        <TabsContent value="revenue" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Umsatzentwicklung über Zeit</CardTitle>
              <CardDescription>
                Monatliche Entwicklung von Umsatz und Bestellungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={statisticsData.revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value,
                      name === 'revenue' ? 'Umsatz' : 'Bestellungen'
                    ]}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="revenue" 
                    stackId="1"
                    stroke="#8884d8" 
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="orders" 
                    fill="#82ca9d"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Produktperformance */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Produkte nach Umsatz</CardTitle>
              <CardDescription>
                Beste performende Produkte mit Wachstumsraten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {statisticsData.productPerformance.map((product, index) => (
                  <div key={product.productId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-medium">{product.productName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {product.quantity} Einheiten • {product.margin.toFixed(1)}% Marge
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(product.revenue)}</div>
                      <div className={`text-sm flex items-center ${
                        product.growth >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {product.growth >= 0 ? 
                          <TrendingUp className="h-3 w-3 mr-1" /> : 
                          <TrendingDown className="h-3 w-3 mr-1" />
                        }
                        {formatPercentage(product.growth)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Standortanalyse */}
        <TabsContent value="locations" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Umsatz nach Standorten</CardTitle>
                <CardDescription>
                  Verteilung des Umsatzes auf verschiedene Standorte
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statisticsData.locationPerformance} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis 
                      dataKey="locationName" 
                      type="category" 
                      width={120}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Umsatz']} />
                    <Bar dataKey="revenue" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Standort Details</CardTitle>
                <CardDescription>
                  Performance-Details pro Standort
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {statisticsData.locationPerformance.map((location) => (
                    <div key={location.locationId} className="border rounded p-3">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{location.locationName}</h4>
                        <Badge className={
                          location.growth >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }>
                          {formatPercentage(location.growth)}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(location.revenue)} • {location.orders} Bestellungen
                      </div>
                      {location.topProducts.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium">Top Produkte:</p>
                          <div className="text-xs text-muted-foreground">
                            {location.topProducts.slice(0, 2).map((product, idx) => (
                              <span key={idx}>
                                {product.productName} ({product.quantity})
                                {idx < location.topProducts.slice(0, 2).length - 1 && ', '}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends & Muster */}
        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Saisonale Trends</CardTitle>
                <CardDescription>
                  Verkaufsmuster über verschiedene Jahreszeiten
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={statisticsData.seasonalTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#8884d8" 
                      name="Umsatz"
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="avgTemp" 
                      stroke="#82ca9d" 
                      name="Ø Temperatur"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bestellmuster</CardTitle>
                <CardDescription>
                  Wann werden die meisten Bestellungen aufgegeben?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium mb-4">
                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {statisticsData.orderPatterns.map((pattern, index) => (
                    <div 
                      key={index} 
                      className="h-8 bg-blue-100 rounded flex items-center justify-center text-xs"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${Math.min(pattern.orders / 100, 1)})`
                      }}
                    >
                      {pattern.orders}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Intensität zeigt Anzahl der Bestellungen pro Wochentag
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  BarChart3,
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
import LocationAnalysisTab from './LocationAnalysisTab';
import TrendPatternsTab from './TrendPatternsTab';

interface SupplierStatisticsProps {
  supplierId: number;
  supplier: any;
}

interface StatisticsData {
  overview: {
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
    products_sold: number;
  };
  monthlyRevenue: Array<{
    month: string;
    revenue: number;
    orders: number;
    avgOrderValue: number;
  }>;
  productPerformance: Array<{
    productId: number;
    productName: string;
    revenue: number;
    quantitySold: number;
    avgPrice: number;
    marketShare: number;
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

export default function SupplierStatistics({ supplierId, supplier }: SupplierStatisticsProps) {
  const [timeRange, setTimeRange] = useState('6m');

  const { data: statisticsData, isLoading, error } = useQuery({
    queryKey: ['/api/supplier-analytics/dashboard', supplierId, timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/supplier-analytics/dashboard/${supplierId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    },
    enabled: !!supplierId
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

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Fehler beim Laden der Statistiken</h3>
            <p className="text-muted-foreground">
              Die Statistiken für diesen Lieferanten konnten nicht geladen werden.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Zeitraum-Selektor */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Statistiken für {supplier?.companyName}</h2>
          <p className="text-muted-foreground">Umfassende Analyse der Lieferantenperformance</p>
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

      {/* Tabs für verschiedene Analysen */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="locations">Standort-Analyse</TabsTrigger>
          <TabsTrigger value="trends">Trends und Muster</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
                <Euro className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(statisticsData?.overview?.total_revenue || 0)}</div>
                <div className="text-xs text-muted-foreground">
                  Gesamtumsatz aller Zeiten
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bestellungen</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statisticsData?.overview?.total_orders || 0}</div>
                <div className="text-xs text-muted-foreground">
                  Bestellungen insgesamt
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ø Bestellwert</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(statisticsData?.overview?.avg_order_value || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Durchschnittlicher Bestellwert
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aktive Produkte</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statisticsData?.overview?.products_sold || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Verkaufte Produkte
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Monatliche Umsätze</CardTitle>
                <CardDescription>Umsatzentwicklung der letzten Monate</CardDescription>
              </CardHeader>
              <CardContent>
                {statisticsData?.monthlyRevenue && statisticsData.monthlyRevenue.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={statisticsData.monthlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'short' })}
                      />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                        formatter={(value: number) => [formatCurrency(value), 'Umsatz']}
                      />
                      <Line type="monotone" dataKey="revenue" stroke="#0088FE" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Keine Umsatzdaten verfügbar
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Produkte</CardTitle>
                <CardDescription>Umsatzstärkste Produkte</CardDescription>
              </CardHeader>
              <CardContent>
                {statisticsData?.productPerformance && statisticsData.productPerformance.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={statisticsData.productPerformance.slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="productName" angle={-45} textAnchor="end" height={80} fontSize={10} />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Umsatz']} />
                      <Bar dataKey="revenue" fill="#00C49F" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Keine Produktdaten verfügbar
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="locations">
          <LocationAnalysisTab supplierId={supplierId} />
        </TabsContent>

        <TabsContent value="trends">
          <TrendPatternsTab supplierId={supplierId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
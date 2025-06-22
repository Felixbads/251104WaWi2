import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, TrendingUp, TrendingDown, Activity, Target, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar } from 'recharts';

interface ProductAnalyticsViewProps {
  productId: number;
  productName: string;
}

interface AnalyticsData {
  summary: {
    totalSales: number;
    totalRevenue: number;
    avgDailySales: number;
    salesGrowth: number;
    revenueGrowth: number;
    topMachine: string;
    slowestMachine: string;
    peakHour: number;
    popularityRank: number;
  };
  salesTrend: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
  hourlyPattern: Array<{
    hour: number;
    sales: number;
    label: string;
  }>;
  machinePerformance: Array<{
    machineName: string;
    sales: number;
    revenue: number;
    efficiency: number;
  }>;
}

export default function ProductAnalyticsView({ productId, productName }: ProductAnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState('30d');

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: [`/api/products/${productId}/analytics`, timeRange],
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getGrowthColor = (growth: number) => {
    if (growth > 0) return 'text-green-600';
    if (growth < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getGrowthIcon = (growth: number) => {
    if (growth > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (growth < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Activity className="h-4 w-4 text-gray-600" />;
  };

  if (isLoading && !analyticsData) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const analytics = analyticsData?.data as AnalyticsData;

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Produktauswertung für {productName}</h3>
          <p className="text-sm text-muted-foreground">Detaillierte Verkaufs- und Leistungsanalyse</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 Tage</SelectItem>
            <SelectItem value="30d">30 Tage</SelectItem>
            <SelectItem value="90d">90 Tage</SelectItem>
            <SelectItem value="1y">1 Jahr</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gesamtverkäufe</p>
                <p className="text-2xl font-bold">{analytics?.summary?.totalSales || 0}</p>
                <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analytics?.summary?.salesGrowth || 0)}`}>
                  {getGrowthIcon(analytics?.summary?.salesGrowth || 0)}
                  {formatPercentage(analytics?.summary?.salesGrowth || 0)}
                </div>
              </div>
              <BarChart className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gesamtumsatz</p>
                <p className="text-2xl font-bold">{formatCurrency(analytics?.summary?.totalRevenue || 0)}</p>
                <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analytics?.summary?.revenueGrowth || 0)}`}>
                  {getGrowthIcon(analytics?.summary?.revenueGrowth || 0)}
                  {formatPercentage(analytics?.summary?.revenueGrowth || 0)}
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ø täglich</p>
                <p className="text-2xl font-bold">{(analytics?.summary?.avgDailySales || 0).toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">Verkäufe/Tag</p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Beliebtheit</p>
                <p className="text-2xl font-bold">#{analytics?.summary?.popularityRank || '-'}</p>
                <p className="text-sm text-muted-foreground">von allen Produkten</p>
              </div>
              <Target className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Verkaufstrend</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics?.salesTrend && analytics.salesTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.salesTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                />
                <YAxis yAxisId="sales" orientation="left" />
                <YAxis yAxisId="revenue" orientation="right" />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                  formatter={(value: any, name: string) => [
                    name === 'sales' ? `${value} Stück` : formatCurrency(value),
                    name === 'sales' ? 'Verkäufe' : 'Umsatz'
                  ]}
                />
                <Line yAxisId="sales" type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} />
                <Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Keine Trenddaten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hourly Pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Verkaufsmuster nach Uhrzeit
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics?.hourlyPattern && analytics.hourlyPattern.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsBarChart data={analytics.hourlyPattern}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any) => [`${value} Verkäufe`, 'Anzahl']}
                    labelFormatter={(label) => `${label} Uhr`}
                  />
                  <Bar dataKey="sales" fill="#3b82f6" />
                </RechartsBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                Keine Stundendaten verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Machines Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Automat-Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics?.machinePerformance && analytics.machinePerformance.length > 0 ? (
              <div className="space-y-3">
                {analytics.machinePerformance.slice(0, 5).map((machine, index) => (
                  <div key={machine.machineName} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                        {index + 1}
                      </Badge>
                      <div>
                        <div className="font-medium text-sm">{machine.machineName}</div>
                        <div className="text-xs text-muted-foreground">
                          {machine.sales} Verkäufe • {formatCurrency(machine.revenue)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{machine.efficiency.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">Effizienz</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                Keine Performance-Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance-Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Bester Automat</h4>
              <p className="text-blue-700">{analytics?.summary?.topMachine || 'Nicht verfügbar'}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <h4 className="font-medium text-orange-900 mb-2">Verkaufs-Stoßzeit</h4>
              <p className="text-orange-700">
                {analytics?.summary?.peakHour ? `${analytics.summary.peakHour}:00 Uhr` : 'Nicht verfügbar'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
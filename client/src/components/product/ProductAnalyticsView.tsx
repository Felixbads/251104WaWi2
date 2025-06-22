import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, TrendingUp, Calendar, Euro, ShoppingCart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar, ComposedChart } from 'recharts';

interface ProductAnalyticsViewProps {
  productId: number;
  productName: string;
}

interface SalesData {
  summary: {
    totalSales: number;
    totalRevenue: number;
    avgPrice: number;
    activeMachines: number;
  };
  salesTrend: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
  machines: Array<{
    machineId: number;
    machineName: string;
    locationName?: string;
    totalSales: number;
    totalRevenue: number;
    avgPrice: number;
    lastSale?: string;
  }>;
}

export default function ProductAnalyticsView({ productId, productName }: ProductAnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState('30d');

  // Fetch sales data
  const { data: salesData, isLoading: isLoadingSales, error: salesError } = useQuery({
    queryKey: [`/api/products/${productId}/sales`, timeRange],
    queryFn: async () => {
      const url = `/api/products/${productId}/sales?timeRange=${timeRange}`;
      console.log('Fetching sales data from:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch sales data');
      const data = await response.json();
      console.log('Sales data received:', data);
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  if (isLoadingSales) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (salesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500 mb-2">Fehler beim Laden der Analysedaten</p>
        </div>
      </div>
    );
  }

  if (!salesData?.success) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BarChart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Keine Analysedaten verfügbar</p>
          <p className="text-sm text-gray-400">Für den ausgewählten Zeitraum wurden keine Daten gefunden.</p>
        </div>
      </div>
    );
  }

  // Ensure we have valid data structures
  const summary = salesData?.data?.summary || salesData?.summary || {};
  const trend = salesData?.data?.salesTrend || salesData?.salesTrend || [];
  const machinesList = salesData?.data?.machines || salesData?.machines || [];

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Verkaufsgrafiken für {productName}</h3>
          <p className="text-sm text-muted-foreground">Grafische Auswertung der Verkaufsdaten</p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Tage</SelectItem>
              <SelectItem value="30d">30 Tage</SelectItem>
              <SelectItem value="90d">90 Tage</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gesamtverkäufe</p>
                <p className="text-2xl font-bold">
                  {summary?.totalSales || 0}
                </p>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gesamtumsatz</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.totalRevenue || 0)}
                </p>
              </div>
              <Euro className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ø Preis</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.avgPrice || 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktive Automaten</p>
                <p className="text-2xl font-bold">
                  {summary?.activeMachines || 0}
                </p>
              </div>
              <BarChart className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend Chart */}
      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart className="h-5 w-5 mr-2" />
              Verkaufsverlauf: Umsatz (€) und Anzahl
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                />
                <YAxis yAxisId="left" orientation="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                  formatter={(value, name) => [
                    name === 'revenue' ? formatCurrency(Number(value)) : `${value} Stück`,
                    name === 'revenue' ? 'Umsatz' : 'Verkäufe'
                  ]}
                />
                <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="revenue" />
                <Line yAxisId="right" type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name="sales" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Machine Performance Chart */}
      {machinesList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart className="h-5 w-5 mr-2" />
              Verkäufe nach Automaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={machinesList.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="machineName" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'totalRevenue' ? formatCurrency(Number(value)) : `${value} Stück`,
                    name === 'totalRevenue' ? 'Umsatz' : 'Verkäufe'
                  ]}
                />
                <Bar dataKey="totalSales" fill="#8884d8" name="totalSales" />
                <Bar dataKey="totalRevenue" fill="#82ca9d" name="totalRevenue" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Daily Sales Trend */}
      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Täglicher Verkaufstrend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                  formatter={(value) => [`${value} Stück`, 'Verkäufe']}
                />
                <Line type="monotone" dataKey="sales" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
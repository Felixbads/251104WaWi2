import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, TrendingUp, Calendar, MapPin, Euro, BarChart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';


interface ProductSalesViewProps {
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

interface RefillData {
  refillId: number;
  machineId: number;
  machineName: string;
  refillDate: string;
  quantityAdded: number;
  quantityRemoved: number;
  netChange: number;
  reason: string;
}

export default function ProductSalesView({ productId, productName }: ProductSalesViewProps) {
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');

  // Fetch sales data
  const { data: salesData, isLoading: isLoadingSales, error: salesError } = useQuery({
    queryKey: [`/api/products/${productId}/sales`, timeRange, selectedMachine],
    queryFn: async () => {
      const url = `/api/products/${productId}/sales?timeRange=${timeRange}${selectedMachine !== 'all' ? `&selectedMachine=${selectedMachine}` : ''}`;
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

  // Fetch refill history
  const { data: refillData, isLoading: isLoadingRefills, error: refillError } = useQuery({
    queryKey: [`/api/products/${productId}/refills`, timeRange],
    queryFn: async () => {
      const url = `/api/products/${productId}/refills?timeRange=${timeRange}`;
      console.log('Fetching refill data from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch refill data');
      const data = await response.json();
      console.log('Refill data received:', data);
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

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default: return <div className="h-4 w-4 bg-gray-400 rounded-full" />;
    }
  };

  if ((isLoadingSales && !salesData) || (isLoadingRefills && !refillData)) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
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
          <h3 className="text-lg font-semibold">Verkaufsanalyse für {productName}</h3>
          <p className="text-sm text-muted-foreground">Umsätze und Verkaufshistorie über Zeit</p>
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

      {/* Sales Summary */}
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
              <MapPin className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales by Machine */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Verkäufe nach Automaten
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machinesList.length > 0 ? (
            <div className="space-y-4">
              {machinesList.map((machine: any) => (
                <div key={machine.machineId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">{machine.machineName}</div>
                      {machine.locationName && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {machine.locationName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {machine.totalSales} Verkäufe
                      </Badge>
                      <Badge variant="secondary">
                        {formatCurrency(machine.totalRevenue)}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Durchschnittspreis:</span>
                      <div className="font-medium">{formatCurrency(machine.avgPrice)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Letzter Verkauf:</span>
                      <div className="font-medium">
                        {machine.lastSale ? new Date(machine.lastSale).toLocaleDateString('de-DE') : 'Nie'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gesamtumsatz:</span>
                      <div className="font-medium">{formatCurrency(machine.totalRevenue)}</div>
                    </div>
                  </div>
                  
                  {machine.lastSale && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Letzter Verkauf: {new Date(machine.lastSale).toLocaleString('de-DE')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Keine Verkaufsdaten gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refill History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Auffüllhistorie
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(refillData?.data || refillData) && (Array.isArray(refillData?.data) ? refillData.data : Array.isArray(refillData) ? refillData : []).length > 0 ? (
            <div className="space-y-3">
              {(Array.isArray(refillData?.data) ? refillData.data : Array.isArray(refillData) ? refillData : []).map((refill: RefillData) => (
                <div key={refill.refillId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{refill.machineName}</div>
                    <div className="text-sm text-muted-foreground">
                      {refill.refillDate && !isNaN(new Date(refill.refillDate).getTime()) 
                        ? new Date(refill.refillDate).toLocaleString('de-DE')
                        : 'Datum nicht verfügbar'
                      }
                    </div>
                    {refill.reason && (
                      <div className="text-xs text-muted-foreground">{refill.reason}</div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">+{refill.quantityAdded || 0}</span>
                      {(refill.quantityRemoved || 0) > 0 && (
                        <span className="text-red-600">-{refill.quantityRemoved}</span>
                      )}
                    </div>
                    <Badge variant={refill.netChange > 0 ? 'default' : 'secondary'} className="text-xs">
                      Netto: {refill.netChange > 0 ? '+' : ''}{refill.netChange || 0}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Keine Auffüllhistorie gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, TrendingUp, Calendar, MapPin, Euro } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductSalesViewProps {
  productId: number;
  productName: string;
}

interface SalesData {
  machineId: number;
  machineName: string;
  locationName?: string;
  totalSales: number;
  totalRevenue: number;
  avgPrice: number;
  lastSale?: string;
  salesTrend: 'up' | 'down' | 'stable';
  periodSales: {
    today: number;
    yesterday: number;
    last7Days: number;
    last30Days: number;
  };
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

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Verkaufsdaten für {productName}</h3>
          <p className="text-sm text-muted-foreground">Umsätze und Verkaufshistorie nach Automaten</p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Heute</SelectItem>
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
                  {salesData?.summary?.total_sales || 
                   salesData?.totalSales || 
                   (Array.isArray(salesData) ? salesData.reduce((sum, item) => sum + (item.count || 0), 0) : 0)}
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
                  {formatCurrency(salesData?.summary?.total_revenue || salesData?.totalRevenue || 
                   (Array.isArray(salesData) ? salesData.reduce((sum, item) => sum + (item.revenue || 0), 0) : 0))}
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
                  {formatCurrency(salesData?.summary?.avg_price || salesData?.avgPrice || 
                   (Array.isArray(salesData) && salesData.length > 0 ? 
                    salesData.reduce((sum, item) => sum + (item.revenue || 0), 0) / 
                    salesData.reduce((sum, item) => sum + (item.count || 0), 0) || 0 : 0))}
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
                  {salesData?.summary?.active_machines || salesData?.activeMachines || (salesData?.machines?.length || 0)}
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
          {Array.isArray(salesData) && salesData.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tägliche Verkäufe (letzten {timeRange === '1d' ? '24 Stunden' : timeRange === '7d' ? '7 Tage' : timeRange === '30d' ? '30 Tage' : '90 Tage'})
              </p>
              {salesData.map((sale, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">
                      {new Date(sale.date).toLocaleDateString('de-DE')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sale.count} Verkäufe
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(sale.revenue)}</div>
                    <div className="text-sm text-muted-foreground">
                      Ø {formatCurrency(sale.revenue / sale.count)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (salesData?.machines || salesData?.data) && (salesData.machines || salesData.data).length > 0 ? (
            <div className="space-y-4">
              {(salesData.machines || salesData.data || []).map((machine: SalesData) => (
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
                      {getTrendIcon(machine.salesTrend)}
                      <Badge variant="outline">
                        {machine.totalSales} Verkäufe
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Heute:</span>
                      <div className="font-medium">{machine.periodSales?.today || 0}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">7 Tage:</span>
                      <div className="font-medium">{machine.periodSales?.last7Days || 0}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Umsatz:</span>
                      <div className="font-medium">{formatCurrency(machine.totalRevenue)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ø Preis:</span>
                      <div className="font-medium">{formatCurrency(machine.avgPrice)}</div>
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
                      {new Date(refill.refillDate).toLocaleString('de-DE')}
                    </div>
                    {refill.reason && (
                      <div className="text-xs text-muted-foreground">{refill.reason}</div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">+{refill.quantityAdded}</span>
                      {refill.quantityRemoved > 0 && (
                        <span className="text-red-600">-{refill.quantityRemoved}</span>
                      )}
                    </div>
                    <Badge variant={refill.netChange > 0 ? 'default' : 'secondary'} className="text-xs">
                      Netto: {refill.netChange > 0 ? '+' : ''}{refill.netChange}
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
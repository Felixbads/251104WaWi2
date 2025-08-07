import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, TrendingDown, TrendingUp, Activity } from 'lucide-react';

interface ProductWithdrawalChartProps {
  productId: number;
  productName: string;
}

export default function ProductWithdrawalChart({ productId, productName }: ProductWithdrawalChartProps) {
  const [viewMode, setViewMode] = useState<'withdrawn' | 'added' | 'net'>('withdrawn');

  // Fetch monthly withdrawal data
  const { data: withdrawalData, isLoading, error } = useQuery({
    queryKey: [`/api/products/${productId}/withdrawals-summary`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/withdrawals-summary`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      
      if (!response.ok) {
        console.error(`[WITHDRAWALS] API error: ${response.status} ${response.statusText}`);
        return { monthlyData: [] };
      }
      
      const data = await response.json();
      return data;
    }
  });

  const handleExportCSV = () => {
    if (!withdrawalData?.monthlyData) return;
    
    const csvContent = [
      ['Monat', 'Entnommen', 'Hinzugefügt', 'Netto-Änderung'].join(','),
      ...withdrawalData.monthlyData.map((row: any) => 
        [row.month_label, row.withdrawn, row.added, row.net_change].join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${productName}-withdrawals-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getChartData = () => {
    if (!withdrawalData?.monthlyData) return [];
    
    return withdrawalData.monthlyData.map((item: any) => ({
      month: item.month_label,
      withdrawn: item.withdrawn,
      added: item.added,
      net: item.net_change,
      value: viewMode === 'withdrawn' ? item.withdrawn : 
             viewMode === 'added' ? item.added : 
             item.net_change
    }));
  };

  const getBarColor = () => {
    switch (viewMode) {
      case 'withdrawn': return '#ef4444'; // red
      case 'added': return '#10b981'; // green
      case 'net': return '#3b82f6'; // blue
      default: return '#6b7280';
    }
  };

  const getTotalStats = () => {
    if (!withdrawalData?.monthlyData || withdrawalData.monthlyData.length === 0) {
      return { totalWithdrawn: 0, totalAdded: 0, totalNet: 0 };
    }
    
    const stats = withdrawalData.monthlyData.reduce((acc: any, item: any) => ({
      totalWithdrawn: acc.totalWithdrawn + (item.withdrawn || 0),
      totalAdded: acc.totalAdded + (item.added || 0),
      totalNet: acc.totalNet + (item.net_change || 0)
    }), { totalWithdrawn: 0, totalAdded: 0, totalNet: 0 });
    
    return stats;
  };

  const stats = getTotalStats();

  if (error) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-red-500">Fehler beim Laden der Entnahmedaten</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Monatliche Bewegungsübersicht (12 Monate)
          </CardTitle>
          <Button onClick={handleExportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Statistics Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Gesamt entnommen</p>
                <p className="text-2xl font-bold text-red-600">{stats.totalWithdrawn}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Gesamt hinzugefügt</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalAdded}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Netto-Änderung</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalNet}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-400" />
            </div>
          </div>
        </div>

        {/* View Mode Selector */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === 'withdrawn' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('withdrawn')}
            className={viewMode === 'withdrawn' ? 'bg-red-500 hover:bg-red-600' : ''}
          >
            Entnahmen
          </Button>
          <Button
            variant={viewMode === 'added' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('added')}
            className={viewMode === 'added' ? 'bg-green-500 hover:bg-green-600' : ''}
          >
            Hinzufügungen
          </Button>
          <Button
            variant={viewMode === 'net' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('net')}
            className={viewMode === 'net' ? 'bg-blue-500 hover:bg-blue-600' : ''}
          >
            Netto-Änderung
          </Button>
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-500">Lade Bewegungsdaten...</p>
          </div>
        ) : withdrawalData?.monthlyData && withdrawalData.monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={getChartData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                label={{ value: 'Menge (Stk.)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                formatter={(value: any) => [`${value} Stk.`, viewMode === 'withdrawn' ? 'Entnommen' : viewMode === 'added' ? 'Hinzugefügt' : 'Netto']}
              />
              <Bar 
                dataKey="value" 
                fill={getBarColor()}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Keine Bewegungsdaten für die letzten 12 Monate verfügbar</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
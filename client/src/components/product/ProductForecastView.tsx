import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Calendar, BarChart3, Download, Info } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ProductForecastViewProps {
  productId: number;
  productName: string;
}

interface WeeklyData {
  week: string;
  year: number;
  weekNumber: number;
  historicalSales: number;
  forecastSales: number | null;
  percentageDeviation?: number;
}

interface MonthlyData {
  month: string;
  year: number;
  monthNumber: number;
  historicalSales: number;
  forecastSales: number | null;
  percentageDeviation?: number;
}

interface ForecastSummary {
  next7Days: number;
  next14Days: number;
  next12Weeks: WeeklyData[];
  next12Months: MonthlyData[];
}

export default function ProductForecastView({ productId, productName }: ProductForecastViewProps) {
  const [viewType, setViewType] = useState<'weekly' | 'monthly'>('weekly');

  // Fetch weekly forecast data
  const { data: weeklyData, isLoading: weeklyLoading, error: weeklyError } = useQuery<WeeklyData[]>({
    queryKey: [`/api/products/${productId}/forecast/weekly`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch monthly forecast data
  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError } = useQuery<MonthlyData[]>({
    queryKey: [`/api/products/${productId}/forecast/monthly`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch forecast summary
  const { data: forecastSummary, isLoading: summaryLoading, error: summaryError } = useQuery<ForecastSummary>({
    queryKey: [`/api/products/${productId}/forecast/summary`],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleExportCSV = () => {
    const data = viewType === 'weekly' ? weeklyData : monthlyData;
    if (!data) return;

    const headers = ['Zeitraum', 'Historische Verkäufe', 'Prognosewerte', 'Abweichung %'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => {
        const timeLabel = viewType === 'weekly' 
          ? `KW ${(row as WeeklyData).weekNumber}/${row.year}` 
          : `${(row as MonthlyData).month} ${row.year}`;
        return [
          timeLabel,
          row.historicalSales || 0,
          row.forecastSales || 0,
          row.percentageDeviation ? `${row.percentageDeviation.toFixed(1)}%` : 'k.A.'
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${productName}_prognose_${viewType}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatChartData = () => {
    const data = viewType === 'weekly' ? weeklyData : monthlyData;
    if (!data) return [];

    return data.map(item => {
      const name = viewType === 'weekly' 
        ? `KW ${(item as WeeklyData).weekNumber}` 
        : (item as MonthlyData).month;
      const fullName = viewType === 'weekly' 
        ? `KW ${(item as WeeklyData).weekNumber}/${item.year}` 
        : `${(item as MonthlyData).month} ${item.year}`;
      
      return {
        name,
        historisch: item.historicalSales || 0,
        prognose: item.forecastSales || 0,
        fullName
      };
    });
  };

  if (weeklyLoading || monthlyLoading || summaryLoading) {
    return (
      <div className="space-y-6">
        <LoadingSpinner />
        <p className="text-center text-gray-600">Lade Prognosedaten...</p>
      </div>
    );
  }

  if (weeklyError || monthlyError || summaryError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <Info className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 font-medium">Fehler beim Laden der Prognosedaten</p>
            <p className="text-gray-500 text-sm mt-1">
              {weeklyError?.message || monthlyError?.message || summaryError?.message}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = formatChartData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Verkaufsprognose
          </h2>
          <p className="text-gray-600">Historische Verkäufe und Zukunftsprognosen für {productName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewType} onValueChange={(value: 'weekly' | 'monthly') => setViewType(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Wöchentlich</SelectItem>
              <SelectItem value="monthly">Monatlich</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportCSV} disabled={!chartData.length}>
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
        </div>
      </div>

      {/* Forecast Summary Cards */}
      {forecastSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Kurzfristige Prognose
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Nächste 7 Tage:</span>
                  <Badge variant="outline" className="font-mono">
                    {forecastSummary.next7Days || 0} Verkäufe
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Nächste 14 Tage:</span>
                  <Badge variant="outline" className="font-mono">
                    {forecastSummary.next14Days || 0} Verkäufe
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Langfristige Prognose
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Nächste 12 Wochen:</span>
                  <Badge variant="outline" className="font-mono">
                    {forecastSummary.next12Weeks?.reduce((sum, week) => sum + (week.forecastSales || 0), 0) || 0} Verkäufe
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Nächste 12 Monate:</span>
                  <Badge variant="outline" className="font-mono">
                    {forecastSummary.next12Months?.reduce((sum, month) => sum + (month.forecastSales || 0), 0) || 0} Verkäufe
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Verkaufsverlauf und Prognose ({viewType === 'weekly' ? 'Wöchentlich' : 'Monatlich'})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Verkäufe', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    labelFormatter={(label: any, payload: any) => {
                      if (payload && payload[0] && payload[0].payload) {
                        return payload[0].payload.fullName;
                      }
                      return label;
                    }}
                    formatter={(value: any, name: any) => [
                      `${value} Verkäufe`,
                      name === 'historisch' ? 'Historische Verkäufe' : 'Prognose'
                    ]}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="historisch" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    name="Historische Verkäufe"
                    connectNulls={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="prognose" 
                    stroke="#dc2626" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Prognose"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Keine Daten verfügbar</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detaillierte Daten ({viewType === 'weekly' ? 'Wöchentlich' : 'Monatlich'})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Zeitraum</th>
                    <th className="text-right p-3 font-medium">Historische Verkäufe</th>
                    <th className="text-right p-3 font-medium">Prognosewerte</th>
                    <th className="text-right p-3 font-medium">Abweichung</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewType === 'weekly' ? weeklyData : monthlyData)?.map((row, index) => {
                    const timeLabel = viewType === 'weekly' 
                      ? `KW ${(row as WeeklyData).weekNumber}/${row.year}` 
                      : `${(row as MonthlyData).month} ${row.year}`;
                    
                    return (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {timeLabel}
                        </td>
                      <td className="p-3 text-right">{row.historicalSales || 0}</td>
                      <td className="p-3 text-right">{row.forecastSales || 0}</td>
                      <td className="p-3 text-right">
                        {row.percentageDeviation ? (
                          <Badge variant={Math.abs(row.percentageDeviation) > 20 ? 'destructive' : 'secondary'}>
                            {row.percentageDeviation > 0 ? '+' : ''}{row.percentageDeviation.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-gray-400">k.A.</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Keine Daten verfügbar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
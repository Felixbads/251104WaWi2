import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown,
  Clock,
  Calendar,
  BarChart3,
  Activity
} from 'lucide-react';
import { 
  Line, 
  LineChart,
  Bar, 
  BarChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

interface TrendPatternsTabProps {
  supplierId: number;
}

export default function TrendPatternsTab({ supplierId }: TrendPatternsTabProps) {
  const { data: trendData, isLoading } = useQuery({
    queryKey: ['/api/supplier-analytics/trend-patterns', supplierId],
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!trendData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Trenddaten verfügbar</h3>
            <p className="text-muted-foreground">
              Für diesen Lieferanten sind noch keine Trenddaten verfügbar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { weekdayPatterns, hourlyPatterns, monthlyTrends, seasonalPatterns } = trendData;

  return (
    <div className="space-y-6">
      {/* Monatliche Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            Monatliche Entwicklung
          </CardTitle>
          <CardDescription>
            Umsatz- und Transaktionstrends der letzten 12 Monate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyTrends && monthlyTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}
                />
                <YAxis yAxisId="left" 
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                  formatter={[
                    (value: number, name: string) => {
                      if (name === 'revenue') return [formatCurrency(value), 'Umsatz'];
                      if (name === 'transactions') return [value, 'Transaktionen'];
                      return [formatPercentage(value), 'Wachstum'];
                    }
                  ]}
                />
                <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#0088FE" fill="#0088FE" fillOpacity={0.3} />
                <Line yAxisId="right" type="monotone" dataKey="transactions" stroke="#00C49F" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Keine monatlichen Trends verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wochentag-Muster */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Wochentag-Muster
            </CardTitle>
            <CardDescription>
              Verkaufsmuster nach Wochentagen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weekdayPatterns && weekdayPatterns.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weekdayPatterns}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="weekdayName" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    formatter={[
                      (value: number) => formatCurrency(value),
                      'Umsatz'
                    ]}
                  />
                  <Bar dataKey="revenue" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Keine Wochentag-Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Tageszeit-Muster
            </CardTitle>
            <CardDescription>
              Verkaufsmuster nach Tageszeiten
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyPatterns && hourlyPatterns.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={hourlyPatterns}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={(value) => `${value}:00`}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => `${value}:00 Uhr`}
                    formatter={[
                      (value: number) => value,
                      'Transaktionen'
                    ]}
                  />
                  <Area type="monotone" dataKey="transactions" stroke="#00C49F" fill="#00C49F" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Keine Tageszeit-Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saisonale Muster */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Saisonale Muster
          </CardTitle>
          <CardDescription>
            Verkaufsmuster nach Jahreszeiten
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seasonalPatterns && seasonalPatterns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {seasonalPatterns.map((season, index) => (
                <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-lg mb-2">{season.season}</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatCurrency(season.revenue)}
                      </p>
                      <p className="text-sm text-muted-foreground">Umsatz</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {season.transactions}
                      </p>
                      <p className="text-sm text-muted-foreground">Transaktionen</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {formatCurrency(season.avgTransaction)}
                      </p>
                      <p className="text-sm text-muted-foreground">Ø Transaktion</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Keine saisonalen Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wachstums-Indikatoren */}
      {monthlyTrends && monthlyTrends.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {monthlyTrends.slice(-4).map((month, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {new Date(month.month).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Umsatzwachstum</span>
                    <div className={`flex items-center ${
                      month.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {month.revenueGrowth >= 0 ? 
                        <TrendingUp className="h-3 w-3 mr-1" /> : 
                        <TrendingDown className="h-3 w-3 mr-1" />
                      }
                      <span className="text-sm font-medium">
                        {formatPercentage(month.revenueGrowth)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Transaktionswachstum</span>
                    <div className={`flex items-center ${
                      month.transactionGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {month.transactionGrowth >= 0 ? 
                        <TrendingUp className="h-3 w-3 mr-1" /> : 
                        <TrendingDown className="h-3 w-3 mr-1" />
                      }
                      <span className="text-sm font-medium">
                        {formatPercentage(month.transactionGrowth)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
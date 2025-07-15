import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown,
  MapPin,
  BarChart3,
  Target,
  AlertTriangle
} from 'lucide-react';
import { 
  Bar, 
  BarChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Cell,
  Pie
} from 'recharts';

interface LocationAnalysisTabProps {
  supplierId: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function LocationAnalysisTab({ supplierId }: LocationAnalysisTabProps) {
  const { data: locationData, isLoading } = useQuery({
    queryKey: ['/api/supplier-analytics/location-analysis', supplierId],
    queryFn: async () => {
      const response = await fetch(`/api/supplier-analytics/location-analysis/${supplierId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch location analysis');
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
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
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

  if (!locationData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Standortdaten verfügbar</h3>
            <p className="text-muted-foreground">
              Für diesen Lieferanten sind noch keine Standortdaten verfügbar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { locationPerformance, geographicDistribution, topPerformers, underPerformers } = locationData;

  return (
    <div className="space-y-6">
      {/* Geografische Verteilung */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Geografische Verteilung
            </CardTitle>
            <CardDescription>
              Umsatzverteilung nach Regionen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {geographicDistribution && geographicDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={geographicDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ region, revenue }) => `${region}: ${formatCurrency(revenue)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="revenue"
                  >
                    {geographicDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={[
                      (value: number) => formatCurrency(value),
                      'Umsatz'
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Keine geografischen Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Standort-Performance
            </CardTitle>
            <CardDescription>
              Top 10 Standorte nach Umsatz
            </CardDescription>
          </CardHeader>
          <CardContent>
            {locationPerformance && locationPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={locationPerformance.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="locationName" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={10}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip 
                    formatter={[
                      (value: number) => formatCurrency(value),
                      'Umsatz'
                    ]}
                    labelFormatter={(label) => `Standort: ${label}`}
                  />
                  <Bar dataKey="totalRevenue" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Keine Standortdaten verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top und Underperformer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <Target className="h-5 w-5 mr-2" />
              Top-Performer
            </CardTitle>
            <CardDescription>
              Beste Standorte nach Umsatz
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topPerformers && topPerformers.length > 0 ? (
              <div className="space-y-3">
                {topPerformers.map((location, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-3">
                        #{index + 1}
                      </Badge>
                      <div>
                        <p className="font-medium">{location.locationName}</p>
                        <p className="text-sm text-muted-foreground">
                          {location.transactions} Transaktionen
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatCurrency(location.revenue)}
                      </p>
                      <TrendingUp className="h-4 w-4 text-green-600 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Keine Top-Performer verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-orange-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Optimierungspotential
            </CardTitle>
            <CardDescription>
              Standorte mit niedrigem Umsatz
            </CardDescription>
          </CardHeader>
          <CardContent>
            {underPerformers && underPerformers.length > 0 ? (
              <div className="space-y-3">
                {underPerformers.map((location, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-3">
                        #{index + 1}
                      </Badge>
                      <div>
                        <p className="font-medium">{location.locationName}</p>
                        <p className="text-sm text-muted-foreground">
                          {location.transactions} Transaktionen
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-orange-600">
                        {formatCurrency(location.revenue)}
                      </p>
                      <TrendingDown className="h-4 w-4 text-orange-600 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Alle Standorte performen gut
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detaillierte Standort-Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Detaillierte Standort-Analyse</CardTitle>
          <CardDescription>
            Vollständige Übersicht aller Standorte mit Performance-Kennzahlen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {locationPerformance && locationPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Standort</th>
                    <th className="text-right p-2">Umsatz</th>
                    <th className="text-right p-2">Verkäufe</th>
                    <th className="text-right p-2">Ø Transaktion</th>
                    <th className="text-right p-2">Aktive Tage</th>
                    <th className="text-right p-2">Marktanteil</th>
                  </tr>
                </thead>
                <tbody>
                  {locationPerformance.map((location, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{location.locationName}</td>
                      <td className="p-2 text-right">{formatCurrency(location.totalRevenue)}</td>
                      <td className="p-2 text-right">{location.totalSales}</td>
                      <td className="p-2 text-right">{formatCurrency(location.avgTransactionValue)}</td>
                      <td className="p-2 text-right">{location.activeDays}</td>
                      <td className="p-2 text-right">
                        <Badge variant="outline">
                          {formatPercentage(location.supplierShare)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Keine detaillierten Standortdaten verfügbar
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
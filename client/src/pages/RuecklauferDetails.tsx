import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, ArrowLeft, Package, Clock, MapPin, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import PageHeader from '@/components/layout/PageHeader';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

interface ProductRemovalStats {
  productName: string;
  totalRemoved: number;
  removalsCount: number;
  lastRemoved: string;
  avgPerRemoval: number;
  avgSalePrice: number;
  estimatedLoss: number;
  machines: Array<{
    machineId: number;
    machineName: string;
    removedCount: number;
    avgPrice: number;
    machineLoss: number;
  }>;
  timeline: Array<{
    date: string;
    removed: number;
    count: number;
  }>;
}

const getProductRemovalStats = async (productName: string, days: number = 30) => {
  return apiRequest(`/api/removed-products/stats/${encodeURIComponent(productName)}?days=${days}`);
};

export default function RuecklauferDetails() {
  const { productName } = useParams<{ productName: string }>();
  const decodedProductName = decodeURIComponent(productName || '');
  
  const { data: productStats, isLoading } = useQuery({
    queryKey: ['/api/removed-products/stats', decodedProductName],
    queryFn: () => getProductRemovalStats(decodedProductName, 30),
    enabled: !!decodedProductName,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!productStats) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Keine Detaildaten verfügbar</p>
        <Link href="/ruecklaufer">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück zur Übersicht
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Rückläufer-Details" />
      
      <div className="flex items-center gap-2 mb-6">
        <Link href="/ruecklaufer">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-red-500" />
          <h2 className="text-xl font-semibold">{decodedProductName}</h2>
        </div>
      </div>

      {/* Übersichtskarten */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {productStats.totalRemoved}
            </div>
            <p className="text-xs text-muted-foreground">Gesamt entfernt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {productStats.removalsCount}
            </div>
            <p className="text-xs text-muted-foreground">Entnahme-Vorgänge</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {productStats.avgPerRemoval?.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">Ø pro Entnahme</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              €{productStats.estimatedLoss?.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Geschätzter Verlust</p>
          </CardContent>
        </Card>
      </div>

      {/* Zeitverlaufs-Diagramm */}
      {productStats.timeline && productStats.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Zeitverlauf der Entnahmen
            </CardTitle>
            <CardDescription>
              Entwicklung der Entnahmen über die letzten 30 Tage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productStats.timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(new Date(date), 'dd.MM')}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(date) => format(new Date(date), 'dd.MM.yyyy')}
                    formatter={(value: number, name: string) => [
                      value, 
                      name === 'removed' ? 'Entfernte Menge' : 'Anzahl Entnahmen'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="removed" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    name="removed"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="count"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Automaten-spezifische Aufschlüsselung */}
      {productStats.machines && productStats.machines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-green-500" />
              Entnahmen nach Automaten
            </CardTitle>
            <CardDescription>
              Aufschlüsselung nach Standorten und betroffenen Automaten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productStats.machines}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="machineName" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar 
                      dataKey="removedCount" 
                      fill="#ef4444" 
                      name="Entfernte Menge"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Automat</TableHead>
                    <TableHead className="text-right">Entfernte Menge</TableHead>
                    <TableHead className="text-right">Anteil</TableHead>
                    <TableHead className="text-right">Verlust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productStats.machines
                    .sort((a: any, b: any) => b.removedCount - a.removedCount)
                    .map((machine: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {machine.machineName}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        {machine.removedCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {((machine.removedCount / productStats.totalRemoved) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        €{machine.machineLoss?.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Letzte Entnahme Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-orange-500" />
            Zuletzt entfernt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600">
            <p>
              <strong>Datum:</strong> {format(new Date(productStats.lastRemoved), 'dd.MM.yyyy HH:mm', { locale: de })}
            </p>
            <p>
              <strong>Durchschnittlicher Verkaufspreis:</strong> €{productStats.avgSalePrice?.toFixed(2)}
            </p>
            <p>
              <strong>Geschätzter Gesamtverlust:</strong> €{productStats.estimatedLoss?.toFixed(2)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Clock, TrendingDown, Download, Filter, BarChart3, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, BarChart, Bar } from "recharts";
import { formatDistanceToNow, format, startOfDay, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";

interface RemovedProduct {
  id: number;
  refillId: number;
  productName: string;
  removed: number;
  datetime: string;
  machineId: number;
  machineName: string;
  operator: string | null;
  vendonProductId: string | null;
  position: string | null;
}

interface ProductRemovalStats {
  productName: string;
  totalRemoved: number;
  removalsCount: number;
  lastRemoved: string;
  avgPerRemoval: number;
  machines: Array<{
    machineId: number;
    machineName: string;
    removedCount: number;
  }>;
  timeline: Array<{
    date: string;
    removed: number;
    count: number;
  }>;
}

// API-Funktionen
const getRemovedProducts = async (params: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  machineId?: number;
  productName?: string;
}) => {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.startDate) searchParams.append('startDate', params.startDate);
  if (params.endDate) searchParams.append('endDate', params.endDate);
  if (params.machineId) searchParams.append('machineId', params.machineId.toString());
  if (params.productName) searchParams.append('productName', params.productName);

  return apiRequest(`/api/removed-products?${searchParams.toString()}`);
};

const getProductRemovalStats = async (productName: string, days: number = 30) => {
  return apiRequest(`/api/removed-products/stats/${encodeURIComponent(productName)}?days=${days}`);
};

const getTopRemovedProducts = async (days: number = 30, limit: number = 20) => {
  return apiRequest(`/api/removed-products/top?days=${days}&limit=${limit}`);
};

const exportRemovedProducts = async (params: any) => {
  const searchParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key]) searchParams.append(key, params[key].toString());
  });

  const response = await fetch(`/api/removed-products/export?${searchParams.toString()}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Export fehlgeschlagen');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ruecklaufer_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export default function Ruecklaufer() {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(30);
  const [filterMachine, setFilterMachine] = useState<string>("");
  const [filterProduct, setFilterProduct] = useState<string>("");

  // Fetch top entfernte Produkte
  const { data: topProducts, isLoading: isLoadingTop } = useQuery({
    queryKey: ['/api/removed-products/top', dateRange, 20],
    queryFn: () => getTopRemovedProducts(dateRange, 20),
  });

  // Fetch detaillierte Statistiken für ausgewähltes Produkt
  const { data: productStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/removed-products/stats', selectedProduct, dateRange],
    queryFn: () => selectedProduct ? getProductRemovalStats(selectedProduct, dateRange) : null,
    enabled: !!selectedProduct,
  });

  // Zeitraum-Optionen
  const dateRangeOptions = [
    { value: 7, label: "Letzte 7 Tage" },
    { value: 14, label: "Letzte 14 Tage" },
    { value: 30, label: "Letzte 30 Tage" },
    { value: 60, label: "Letzte 60 Tage" },
    { value: 90, label: "Letzte 90 Tage" },
  ];

  const handleExport = async () => {
    try {
      await exportRemovedProducts({
        days: dateRange,
        machineId: filterMachine || undefined,
        productName: filterProduct || undefined,
      });
    } catch (error) {
      console.error('Export fehler:', error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rückläufer-Analyse"
        description="Detaillierte Übersicht über entfernte Produkte (abgelaufen/beschädigt)"
      />

      {/* Filter und Steuerung */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Zeitraum</label>
          <Select value={dateRange.toString()} onValueChange={(value) => setDateRange(parseInt(value))}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateRangeOptions.map(option => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Produktfilter</label>
          <Input
            placeholder="Produktname eingeben..."
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
          />
        </div>

        <Button onClick={handleExport} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Top 20 Entfernte Produkte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Top 20 Entfernte Produkte
          </CardTitle>
          <CardDescription>
            Häufigste Rückläufer der letzten {dateRange} Tage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTop ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : topProducts && topProducts.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rang</TableHead>
                    <TableHead>Produktname</TableHead>
                    <TableHead className="text-right">Gesamt entfernt</TableHead>
                    <TableHead className="text-right">Anzahl Entnahmen</TableHead>
                    <TableHead className="text-right">Ø pro Entnahme</TableHead>
                    <TableHead>Letzte Entnahme</TableHead>
                    <TableHead>Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product: any, index: number) => (
                    <TableRow key={index} className="hover:bg-gray-50">
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{product.productName}</div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        {product.totalRemoved}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.removalsCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {(parseInt(product.totalRemoved) / parseInt(product.removalsCount)).toFixed(1)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(product.lastRemoved), { 
                            addSuffix: true, 
                            locale: de 
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedProduct(product.productName)}
                          className="flex items-center gap-1"
                        >
                          <BarChart3 className="h-3 w-3" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Keine Rückläufer im gewählten Zeitraum gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailanalyse für ausgewähltes Produkt */}
      {selectedProduct && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Detailanalyse: {selectedProduct}
            </CardTitle>
            <CardDescription>
              Zeitverlauf und Automaten-spezifische Entnahmen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : productStats ? (
              <div className="space-y-6">
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
                      <div className="text-2xl font-bold">
                        {productStats.machines?.length || 0}
                      </div>
                      <p className="text-xs text-muted-foreground">Betroffene Automaten</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Zeitverlaufs-Diagramm */}
                {productStats.timeline && productStats.timeline.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Zeitverlauf der Entnahmen</CardTitle>
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
                      <CardTitle className="text-lg">Entnahmen nach Automaten</CardTitle>
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
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  variant="outline" 
                  onClick={() => setSelectedProduct(null)}
                  className="w-full"
                >
                  Auswahl aufheben
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Keine Detaildaten verfügbar</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
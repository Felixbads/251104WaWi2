import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Clock, TrendingDown, Download, Filter, BarChart3, AlertTriangle, Database } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, BarChart, Bar } from "recharts";
import { formatDistanceToNow, format, startOfDay, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { 
  getTopRemovedProducts, 
  getProductRemovalStats, 
  getLocationTrends,
  ProductRemovalStats,
  LocationTrendsData 
} from "@/lib/api";
import RuecklauferRawDataTab from "@/components/RuecklauferRawDataTab";

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

// Lokale Interfaces entfernt - verwende importierte Typen aus @/lib/api

// API-Funktionen
const getRemovedProducts = async (params: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  machineId?: number;
  productName?: string;
}) => {
  return apiRequest('/removed-products', params, 'GET');
};

// Lokale Funktionen entfernt - verwende importierte Funktionen aus @/lib/api

const exportRemovedProducts = async (params: any) => {
  const searchParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key]) searchParams.append(key, params[key].toString());
  });

  const response = await fetch(`/api/removed-products/export?${searchParams.toString()}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    },
    credentials: 'include',
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
  const [dateRange, setDateRange] = useState(90);
  const [filterMachine, setFilterMachine] = useState<string>("");
  const [filterProduct, setFilterProduct] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");

  // Calculate current range based on dateRange
  const currentRange = useMemo(() => {
    const end = startOfDay(new Date());
    const start = startOfDay(subDays(end, dateRange));
    return { start, end };
  }, [dateRange]);

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

  // Fetch Standort-Trends
  const { data: locationTrends, isLoading: isLoadingTrends } = useQuery({
    queryKey: ['/api/removed-products/location-trends', dateRange],
    queryFn: () => getLocationTrends(dateRange, 20),
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
      <PageHeader title="Rückläufer-Analyse" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Analyse
          </TabsTrigger>
          <TabsTrigger value="rawdata" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Raw Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
            Häufigste Rückläufer basierend auf Einkaufspreisen.
            <br />
            <span className="text-sm text-muted-foreground font-medium">
              Zeitraum: {format(currentRange.start, 'dd.MM.yyyy', { locale: de })} - {format(currentRange.end, 'dd.MM.yyyy', { locale: de })}
            </span>
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
                    <TableHead className="text-right">Ø Einkaufspreis</TableHead>
                    <TableHead className="text-right">Geschätzter Verlust</TableHead>
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
                      <TableCell className="text-right">
                        <span className="text-blue-600 font-medium">
                          {product.avgPurchasePrice ? `€${product.avgPurchasePrice.toFixed(2)}` : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-red-600 font-bold">
                          {product.estimatedLoss ? `€${product.estimatedLoss.toFixed(2)}` : '-'}
                        </span>
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

      {/* Standort-Trends: Problematische Produkte nach Standort */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Standort-Trends: Überschuss-Probleme
          </CardTitle>
          <CardDescription>
            Welche Produkte werden an welchen Standorten übermäßig entfernt - zeigt Überschuss-Probleme basierend auf Einkaufspreisen.
            <br />
            <span className="text-sm text-muted-foreground font-medium">
              Zeitraum: {format(currentRange.start, 'dd.MM.yyyy', { locale: de })} - {format(currentRange.end, 'dd.MM.yyyy', { locale: de })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTrends ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : locationTrends && locationTrends.length > 0 ? (
            <div className="space-y-6">
              {locationTrends.map((location, locationIndex) => (
                <div key={locationIndex} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {location.locationName}
                    </h3>
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-red-600 font-bold">{location.totalRemovedAtLocation}</div>
                        <div className="text-gray-500">Gesamt entfernt</div>
                      </div>
                      <div className="text-center">
                        <div className="text-red-600 font-bold">€{location.totalLossAtLocation.toFixed(2)}</div>
                        <div className="text-gray-500">Gesamtverlust</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Produktname</TableHead>
                          <TableHead className="text-right">Entfernt</TableHead>
                          <TableHead className="text-right">Ereignisse</TableHead>
                          <TableHead className="text-right">Ø pro Ereignis</TableHead>
                          <TableHead className="text-right">Ø Einkaufspreis</TableHead>
                          <TableHead className="text-right">Verlust</TableHead>
                          <TableHead className="text-right">Ø Verkäufe/Woche</TableHead>
                          <TableHead className="text-right">Monate mit Daten</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {location.products.slice(0, 5).map((product, productIndex) => (
                          <TableRow key={productIndex} className="hover:bg-white">
                            <TableCell>
                              <Badge 
                                variant={product.rankAtLocation <= 3 ? "destructive" : "outline"} 
                                className="text-xs"
                              >
                                #{product.rankAtLocation}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{product.productName}</div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-red-600">
                              {product.totalRemoved}
                            </TableCell>
                            <TableCell className="text-right">
                              {product.removalEvents}
                            </TableCell>
                            <TableCell className="text-right">
                              {product.avgPerEvent.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-blue-600 font-medium">
                                {product.avgPurchasePrice > 0 ? `€${product.avgPurchasePrice.toFixed(2)}` : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-red-600 font-bold">
                                {product.locationLoss > 0 ? `€${product.locationLoss.toFixed(2)}` : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-gray-400">-</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-gray-400">-</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {location.products.length > 5 && (
                    <div className="text-center mt-3">
                      <span className="text-sm text-gray-500">
                        ... und {location.products.length - 5} weitere Produkte
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Keine Standort-Trends im gewählten Zeitraum gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {/* Standort-Trends: Problematische Produkte nach Standort */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Standort-Trends: Überschuss-Probleme
              </CardTitle>
              <CardDescription>
                Welche Produkte werden an welchen Standorten übermäßig entfernt - zeigt Überschuss-Probleme basierend auf Einkaufspreisen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTrends ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : locationTrends && locationTrends.length > 0 ? (
                <div className="space-y-6">
                  {locationTrends.map((location, locationIndex) => (
                    <div key={locationIndex} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {location.locationName}
                        </h3>
                        <div className="flex gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-red-600 font-bold">{location.totalRemovedAtLocation}</div>
                            <div className="text-gray-500">Gesamt entfernt</div>
                          </div>
                          <div className="text-center">
                            <div className="text-red-600 font-bold">€{location.totalLossAtLocation.toFixed(2)}</div>
                            <div className="text-gray-500">Gesamtverlust</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rank</TableHead>
                              <TableHead>Produktname</TableHead>
                              <TableHead className="text-right">Entfernt</TableHead>
                              <TableHead className="text-right">Ereignisse</TableHead>
                              <TableHead className="text-right">Ø pro Ereignis</TableHead>
                              <TableHead className="text-right">Ø Einkaufspreis</TableHead>
                              <TableHead className="text-right">Verlust</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {location.products.slice(0, 5).map((product, productIndex) => (
                              <TableRow key={productIndex} className="hover:bg-white">
                                <TableCell>
                                  <Badge variant="outline">#{product.rankAtLocation}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{product.productName}</div>
                                </TableCell>
                                <TableCell className="text-right font-bold text-red-600">
                                  {product.totalRemoved}
                                </TableCell>
                                <TableCell className="text-right">
                                  {product.removalEvents}
                                </TableCell>
                                <TableCell className="text-right">
                                  {product.avgPerEvent?.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right">
                                  €{product.avgPurchasePrice?.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-bold text-red-600">
                                  €{product.locationLoss?.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>Keine Standort-Trends verfügbar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          {/* Detailanalyse für ausgewähltes Produkt */}
          {selectedProduct ? (
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
          ) : (
            <div className="text-center py-8 text-gray-500">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Wählen Sie ein Produkt aus der Übersicht für eine detaillierte Analyse</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rawdata" className="space-y-6">
          <RuecklauferRawDataTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
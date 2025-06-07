import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, TrendingUp, TrendingDown, Package, BarChart3, Calendar, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Legend, Area, AreaChart } from "recharts";
import { format, subWeeks, startOfWeek, endOfWeek, eachWeekOfInterval } from "date-fns";
import { de } from "date-fns/locale";

interface LocationAnalysisData {
  locationName: string;
  machineId: number;
  machineName: string;
  totalProducts: number;
  analysisData: {
    productName: string;
    weeklyData: {
      week: string;
      sales: number;
      removals: number;
      netDemand: number;
    }[];
    avgWeeklySales: number;
    avgWeeklyRemovals: number;
    totalSales: number;
    totalRemovals: number;
    recommendedWeeklyStock: number;
    removalLoss: number;
    salesRevenue: number;
    profitability: number;
  }[];
}

export default function StandortAnalyse() {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<number>(12); // weeks

  // Fetch all locations for dropdown
  const { data: locations } = useQuery({
    queryKey: ['/api/machines'],
    enabled: true,
  });

  // Fetch location analysis data
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ['/api/location-analysis', selectedLocation, timeRange],
    enabled: selectedLocation !== "all",
  });

  const uniqueLocations = locations ? 
    [...new Set(locations.map((m: any) => m.location_name))]
      .filter(Boolean)
      .sort() : [];

  const currentLocationData = analysisData?.find((loc: LocationAnalysisData) => 
    loc.locationName === selectedLocation
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Standort-Analyse</h1>
          <p className="text-muted-foreground">
            Verkäufe vs. Entnahmen mit Bestückungsempfehlungen pro Standort
          </p>
        </div>
        
        <div className="flex gap-3">
          <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 Wochen</SelectItem>
              <SelectItem value="8">8 Wochen</SelectItem>
              <SelectItem value="12">12 Wochen</SelectItem>
              <SelectItem value="24">24 Wochen</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Standort wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Standort wählen</SelectItem>
              {uniqueLocations.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedLocation === "all" && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Standort für Analyse wählen
              </h3>
              <p className="text-gray-500">
                Wählen Sie einen Standort aus dem Dropdown-Menü, um detaillierte Verkaufs- und Entnahmeanalysen zu sehen.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedLocation !== "all" && isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </CardContent>
        </Card>
      )}

      {selectedLocation !== "all" && !isLoading && currentLocationData && (
        <div className="space-y-6">
          {/* Standort-Übersicht */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {currentLocationData.locationName} - Übersicht
              </CardTitle>
              <CardDescription>
                Analysezeiraum: {timeRange} Wochen • {currentLocationData.totalProducts} Produkte analysiert
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-600">
                      {currentLocationData.analysisData.reduce((sum, p) => sum + p.totalSales, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Gesamt-Verkäufe</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-red-600">
                      {currentLocationData.analysisData.reduce((sum, p) => sum + p.totalRemovals, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Gesamt-Entnahmen</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-blue-600">
                      €{currentLocationData.analysisData.reduce((sum, p) => sum + p.salesRevenue, 0).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">Umsatz</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-orange-600">
                      €{currentLocationData.analysisData.reduce((sum, p) => sum + p.removalLoss, 0).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">Entnahme-Verlust</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Produktanalyse Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Produktübersicht</TabsTrigger>
              <TabsTrigger value="trends">Wochentrends</TabsTrigger>
              <TabsTrigger value="recommendations">Bestückungsempfehlungen</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Produktleistung</CardTitle>
                  <CardDescription>
                    Verkäufe vs. Entnahmen für alle Produkte am Standort
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produktname</TableHead>
                          <TableHead className="text-right">Ø Verkäufe/Woche</TableHead>
                          <TableHead className="text-right">Ø Entnahmen/Woche</TableHead>
                          <TableHead className="text-right">Verhältnis</TableHead>
                          <TableHead className="text-right">Rentabilität</TableHead>
                          <TableHead className="text-right">Empfohlene Bestückung</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentLocationData.analysisData
                          .sort((a, b) => b.profitability - a.profitability)
                          .map((product) => {
                            const ratio = product.avgWeeklySales / (product.avgWeeklyRemovals || 1);
                            return (
                              <TableRow key={product.productName} className="hover:bg-gray-50">
                                <TableCell>
                                  <div className="font-medium">{product.productName}</div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-green-600 font-medium">
                                    {product.avgWeeklySales.toFixed(1)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-red-600 font-medium">
                                    {product.avgWeeklyRemovals.toFixed(1)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge 
                                    variant={ratio > 3 ? "default" : ratio > 1.5 ? "secondary" : "destructive"}
                                  >
                                    {ratio.toFixed(1)}:1
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {product.profitability > 0 ? (
                                      <TrendingUp className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <TrendingDown className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className={product.profitability > 0 ? "text-green-600" : "text-red-600"}>
                                      {product.profitability.toFixed(1)}%
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-medium">
                                    {product.recommendedWeeklyStock} Stk.
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedProduct(product.productName)}
                                  >
                                    Details
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              {selectedProduct ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Wochentrend: {selectedProduct}</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedProduct(null)}
                      >
                        Alle anzeigen
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Verkäufe vs. Entnahmen über {timeRange} Wochen
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const productData = currentLocationData.analysisData.find(p => p.productName === selectedProduct);
                      if (!productData) return null;
                      
                      return (
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={productData.weeklyData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="week" 
                                tick={{ fontSize: 12 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                              />
                              <YAxis />
                              <Tooltip 
                                labelFormatter={(value) => `Woche: ${value}`}
                                formatter={(value: number, name: string) => [
                                  value,
                                  name === 'sales' ? 'Verkäufe' : 
                                  name === 'removals' ? 'Entnahmen' : 'Netto-Bedarf'
                                ]}
                              />
                              <Legend />
                              <Bar dataKey="sales" fill="#10b981" name="Verkäufe" />
                              <Bar dataKey="removals" fill="#ef4444" name="Entnahmen" />
                              <Line 
                                type="monotone" 
                                dataKey="netDemand" 
                                stroke="#3b82f6" 
                                strokeWidth={2}
                                name="Netto-Bedarf"
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Produkt für Trendanalyse wählen
                      </h3>
                      <p className="text-gray-500">
                        Wählen Sie ein Produkt aus der Übersicht, um detaillierte Wochentrends zu sehen.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="recommendations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Wöchentliche Bestückungsempfehlungen
                  </CardTitle>
                  <CardDescription>
                    Basierend auf Verkaufstrends und Entnahmemustern der letzten {timeRange} Wochen
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {currentLocationData.analysisData
                      .sort((a, b) => b.recommendedWeeklyStock - a.recommendedWeeklyStock)
                      .map((product) => (
                        <div key={product.productName} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex-1">
                            <h4 className="font-medium">{product.productName}</h4>
                            <div className="text-sm text-gray-500 mt-1">
                              Ø {product.avgWeeklySales.toFixed(1)} Verkäufe/Woche • 
                              Ø {product.avgWeeklyRemovals.toFixed(1)} Entnahmen/Woche
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-blue-600">
                              {product.recommendedWeeklyStock}
                            </div>
                            <div className="text-sm text-gray-500">Stück/Woche</div>
                          </div>
                          <div className="ml-4">
                            <Badge 
                              variant={
                                product.profitability > 20 ? "default" : 
                                product.profitability > 0 ? "secondary" : 
                                "destructive"
                              }
                            >
                              {product.profitability > 0 ? '+' : ''}{product.profitability.toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Euro, Package, BarChart3, PieChart, Calculator } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Cell } from 'recharts';
import ProductMarginCalculator from "@/components/ProductMarginCalculator";

interface ProductProfitability {
  productId: number;
  productName: string;
  category: string;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  profitMargin: number;
  totalQuantitySold: number;
  averageSellingPrice: number;
  averageCostPrice: number;
  monthlySummary: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
    quantity: number;
  }>;
  locationBreakdown: Array<{
    location: string;
    revenue: number;
    profit: number;
    margin: number;
  }>;
  calculationDetails?: {
    revenueCalculation: string;
    costCalculation: string;
    profitCalculation: string;
    marginCalculation: string;
    note: string;
  };
}

export default function ProductProfitabilityAnalysis() {
  const { id } = useParams();
  const productId = parseInt(id || '0');
  const [activeTab, setActiveTab] = useState("overview");

  // Use CLEAN profitability API - eliminates NaN values
  const apiEndpoint = `/api/clean-profitability/${productId}/profitability`;
  
  console.log(`[PROFITABILITY-DEBUG] Loading profitability for product ${productId} using CLEAN endpoint: ${apiEndpoint}`);
  
  const { data: profitability, isLoading, error } = useQuery<ProductProfitability>({
    queryKey: [apiEndpoint],
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center">Lade Wirtschaftlichkeitsanalyse...</div>
      </div>
    );
  }

  if (error || !profitability) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Keine Wirtschaftlichkeitsdaten verfügbar</h3>
            <p className="text-gray-600">
              {error ? `Fehler beim Laden: ${error}` : 'Für dieses Produkt können aktuell keine Wirtschaftlichkeitsdaten berechnet werden.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatPercentage = (value: number) => 
    `${(value || 0).toFixed(1)}%`;

  // Color coding for profit margins
  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-green-600';
    if (margin >= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMarginBadge = (margin: number) => {
    if (margin >= 30) return 'bg-green-100 text-green-800';
    if (margin >= 15) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{profitability.productName}</h1>
          <p className="text-gray-600">Wirtschaftlichkeitsanalyse</p>
        </div>
        <Badge className={getMarginBadge(profitability.profitMargin)}>
          {formatPercentage(profitability.profitMargin)} Gewinnmarge
        </Badge>
      </div>

      {/* NEUE MARGE-KALKULATION - VOR HISTORISCHER ANALYSE */}
      <ProductMarginCalculator productId={productId} />

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gesamtumsatz</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(profitability.totalRevenue)}
                </p>
              </div>
              <Euro className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gesamtkosten</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(profitability.totalCosts)}
                </p>
              </div>
              <Package className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gewinn</p>
                <p className={`text-2xl font-bold ${profitability.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(profitability.totalProfit)}
                </p>
              </div>
              {profitability.totalProfit >= 0 ? 
                <TrendingUp className="h-8 w-8 text-green-600" /> : 
                <TrendingDown className="h-8 w-8 text-red-600" />
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Verkaufte Menge</p>
                <p className="text-2xl font-bold">
                  {profitability.totalQuantitySold} Stück
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="trends">Zeitverlauf</TabsTrigger>
          <TabsTrigger value="locations">Standorte</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Kosten-Umsatz-Aufschlüsselung</CardTitle>
                <CardDescription>
                  Detaillierte Aufschlüsselung der Wirtschaftlichkeit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Ø Verkaufspreis:</span>
                    <span className="font-bold text-green-600">
                      {formatCurrency(profitability.averageSellingPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Ø Einkaufspreis:</span>
                    <span className="font-bold text-red-600">
                      {formatCurrency(profitability.averageCostPrice)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Ø Gewinn pro Stück:</span>
                    <span className={`font-bold ${profitability.averageSellingPrice - profitability.averageCostPrice >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(profitability.averageSellingPrice - profitability.averageCostPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Gewinnmarge:</span>
                    <span className={`font-bold ${getMarginColor(profitability.profitMargin)}`}>
                      {formatPercentage(profitability.profitMargin)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Leistungsübersicht</CardTitle>
                <CardDescription>
                  Wichtige Kennzahlen auf einen Blick
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Umsatzanteil</label>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: '100%' }}
                      ></div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-600">Gewinnspanne</label>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className={`h-2 rounded-full ${profitability.profitMargin >= 30 ? 'bg-green-600' : profitability.profitMargin >= 15 ? 'bg-yellow-600' : 'bg-red-600'}`}
                        style={{ width: `${Math.min(profitability.profitMargin, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatPercentage(profitability.profitMargin)} Marge
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monatlicher Verlauf</CardTitle>
              <CardDescription>
                Umsatz-, Kosten- und Gewinnentwicklung über die Zeit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={profitability.monthlySummary}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Umsatz" />
                  <Line type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} name="Kosten" />
                  <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} name="Gewinn" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Standort-Analyse</CardTitle>
              <CardDescription>
                Wirtschaftlichkeit nach Standorten aufgeschlüsselt
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* BERECHNUNGSHERLEITUNG - NETTO OHNE PFAND */}
                {profitability.calculationDetails && (
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="h-4 w-4 text-blue-600" />
                      <h4 className="font-semibold text-blue-900">Berechnungsherleitung (NETTO ohne Pfand)</h4>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><strong>Umsatz:</strong> {profitability.calculationDetails.revenueCalculation}</div>
                      <div><strong>Kosten:</strong> {profitability.calculationDetails.costCalculation}</div>
                      <div><strong>Gewinn:</strong> {profitability.calculationDetails.profitCalculation}</div>
                      <div><strong>Marge:</strong> {profitability.calculationDetails.marginCalculation}</div>
                      <div className="text-blue-700 font-medium">{profitability.calculationDetails.note}</div>
                    </div>
                  </Card>
                )}
                
                {profitability.locationBreakdown && profitability.locationBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {profitability.locationBreakdown.map((location, index) => (
                      <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">{location.location}</h4>
                        <Badge variant={location.margin > 20 ? "default" : location.margin > 0 ? "secondary" : "destructive"}>
                          {location.margin.toFixed(1)}% Marge
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Netto-Umsatz:</span>
                          <span className="font-medium ml-2 text-green-600">
                            {formatCurrency ? formatCurrency(location.revenue) : `€${location.revenue.toFixed(2)}`}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Netto-Gewinn:</span>
                          <span className={`font-medium ml-2 ${location.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency ? formatCurrency(location.profit) : `€${location.profit.toFixed(2)}`}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Gewinnmarge:</span>
                          <span className="font-medium ml-2">
                            {location.margin.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Standort-Daten werden berechnet...</h3>
                    <p className="text-gray-500">
                      Die NETTO-Berechnungen (ohne Pfand, ohne MwSt) werden für alle Standorte erstellt.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, TrendingUpIcon, TrendingDownIcon, PackageIcon, CalculatorIcon, EuroIcon } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ProductCostBreakdown {
  productId: number;
  productName: string;
  finalCost: {
    totalCostPerUnit: number;
    basePurchasePrice: number;
    discountAmount: number;
    discountType: string;
    netPurchasePrice: number;
    depositAmount: number;
    vatAmount: number;
  };
  purchaseCondition: {
    unitPrice: number;
    currency: string;
    minQuantity: number;
    validFrom: string;
    validTo?: string;
  };
  supplier: {
    id: number;
    name: string;
    discountRate?: number;
    discountType?: string;
  };
}

interface ProductRevenueAnalysis {
  productId: number;
  productName: string;
  revenueByPeriod: {
    totalRevenue: number;
    netRevenue: number;
    depositRevenue: number;
    vatAmount: number;
    quantitySold: number;
    transactionCount: number;
    avgSalePrice: number;
    avgMargin: number;
  };
  revenueByLocation: Array<{
    locationId: number;
    locationName: string;
    revenue: number;
    netRevenue: number;
    quantitySold: number;
    transactionCount: number;
    avgSalePrice: number;
  }>;
}

interface ProfitabilityAnalysis {
  productId: number;
  productName: string;
  costs: ProductCostBreakdown['finalCost'];
  revenue: ProductRevenueAnalysis['revenueByPeriod'];
  profitability: {
    grossProfit: number;
    netProfit: number;
    profitMarginPercent: number;
    returnOnInvestment: number;
    isProfitable: boolean;
  };
  allocatedLocationCosts: number;
}

interface ProductCostRevenueAnalysisProps {
  className?: string;
}

const ProductCostRevenueAnalysis: React.FC<ProductCostRevenueAnalysisProps> = ({ className }) => {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('costs');

  // Fetch cost breakdown data
  const { data: costData, isLoading: costsLoading } = useQuery({
    queryKey: ['/api/product-analysis/costs', selectedProduct],
    enabled: activeTab === 'costs' || activeTab === 'profitability',
  });

  // Fetch revenue data
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['/api/product-analysis/revenue', startDate, endDate, selectedLocation, selectedProduct],
    enabled: activeTab === 'revenue' || activeTab === 'profitability',
  });

  // Fetch profitability analysis
  const { data: profitabilityData, isLoading: profitabilityLoading } = useQuery({
    queryKey: ['/api/product-analysis/profitability', startDate, endDate, selectedLocation, selectedProduct],
    enabled: activeTab === 'profitability',
  });

  // Fetch products for dropdown
  const { data: products } = useQuery({
    queryKey: ['/api/products'],
  });

  // Fetch locations for dropdown
  const { data: locations } = useQuery({
    queryKey: ['/api/locations'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const CostBreakdownCard = ({ breakdown }: { breakdown: ProductCostBreakdown }) => (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageIcon className="h-5 w-5" />
          {breakdown.productName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Basic Purchase Info */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Grundpreise</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Basis-Einkaufspreis:</span>
                <span className="font-medium">{formatCurrency(breakdown.finalCost.basePurchasePrice)}</span>
              </div>
              {breakdown.finalCost.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="text-sm">Rabatt ({breakdown.finalCost.discountType}):</span>
                  <span className="font-medium">-{formatCurrency(breakdown.finalCost.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm">Netto-Einkaufspreis:</span>
                <span className="font-medium">{formatCurrency(breakdown.finalCost.netPurchasePrice)}</span>
              </div>
            </div>
          </div>

          {/* Additional Costs */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Zusätzliche Kosten</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Pfand:</span>
                <span className="font-medium">{formatCurrency(breakdown.finalCost.depositAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">MwSt:</span>
                <span className="font-medium">{formatCurrency(breakdown.finalCost.vatAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-sm font-medium">Gesamtkosten/Stück:</span>
                <span className="font-bold">{formatCurrency(breakdown.finalCost.totalCostPerUnit)}</span>
              </div>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Lieferant</h4>
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-medium">{breakdown.supplier.name}</span>
              </div>
              {breakdown.supplier.discountRate && (
                <Badge variant="secondary" className="text-xs">
                  {breakdown.supplier.discountRate}% {breakdown.supplier.discountType} Rabatt
                </Badge>
              )}
              <div className="text-xs text-gray-500">
                Mindestmenge: {breakdown.purchaseCondition.minQuantity} Stück
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const RevenueAnalysisCard = ({ analysis }: { analysis: ProductRevenueAnalysis }) => (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUpIcon className="h-5 w-5" />
          {analysis.productName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Revenue Summary */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Umsatz-Übersicht</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Brutto-Umsatz:</span>
                <span className="font-medium">{formatCurrency(analysis.revenueByPeriod.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Netto-Umsatz:</span>
                <span className="font-medium">{formatCurrency(analysis.revenueByPeriod.netRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Pfand-Umsatz:</span>
                <span className="font-medium">{formatCurrency(analysis.revenueByPeriod.depositRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">MwSt-Anteil:</span>
                <span className="font-medium">{formatCurrency(analysis.revenueByPeriod.vatAmount)}</span>
              </div>
            </div>
          </div>

          {/* Sales Metrics */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Verkaufszahlen</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Verkaufte Menge:</span>
                <span className="font-medium">{analysis.revenueByPeriod.quantitySold} Stück</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Transaktionen:</span>
                <span className="font-medium">{analysis.revenueByPeriod.transactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Ø Verkaufspreis:</span>
                <span className="font-medium">{formatCurrency(analysis.revenueByPeriod.avgSalePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Ø Marge:</span>
                <span className="font-medium">{formatPercent(analysis.revenueByPeriod.avgMargin)}</span>
              </div>
            </div>
          </div>

          {/* Location Performance */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Top Standorte</h4>
            <div className="space-y-1">
              {analysis.revenueByLocation
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 3)
                .map((location, index) => (
                  <div key={location.locationId} className="flex justify-between text-xs">
                    <span className="truncate">{location.locationName}</span>
                    <span className="font-medium ml-2">{formatCurrency(location.revenue)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ProfitabilityCard = ({ analysis }: { analysis: ProfitabilityAnalysis }) => (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {analysis.profitability.isProfitable ? (
            <TrendingUpIcon className="h-5 w-5 text-green-600" />
          ) : (
            <TrendingDownIcon className="h-5 w-5 text-red-600" />
          )}
          {analysis.productName}
          <Badge variant={analysis.profitability.isProfitable ? 'default' : 'destructive'}>
            {analysis.profitability.isProfitable ? 'Rentabel' : 'Unrentabel'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Erlöse</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Netto-Umsatz:</span>
                <span className="font-medium">{formatCurrency(analysis.revenue.netRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Verkaufte Menge:</span>
                <span className="font-medium">{analysis.revenue.quantitySold} Stück</span>
              </div>
            </div>
          </div>

          {/* Costs */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Kosten</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Wareneinsatz:</span>
                <span className="font-medium">{formatCurrency(analysis.costs.netPurchasePrice * analysis.revenue.quantitySold)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Standortkosten:</span>
                <span className="font-medium">{formatCurrency(analysis.allocatedLocationCosts)}</span>
              </div>
            </div>
          </div>

          {/* Profitability */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Rentabilität</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Bruttogewinn:</span>
                <span className={`font-medium ${analysis.profitability.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analysis.profitability.grossProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Nettogewinn:</span>
                <span className={`font-medium ${analysis.profitability.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analysis.profitability.netProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-600">Kennzahlen</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Gewinnmarge:</span>
                <span className={`font-medium ${analysis.profitability.profitMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(analysis.profitability.profitMarginPercent)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">ROI:</span>
                <span className={`font-medium ${analysis.profitability.returnOnInvestment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(analysis.profitability.returnOnInvestment)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalculatorIcon className="h-6 w-6" />
            Produktkosten- und Umsatzanalyse
          </CardTitle>
          <p className="text-sm text-gray-600">
            Transparente Aufschlüsselung der Produktkosten mit Einkaufsbedingungen, Lieferantenrabatten und Pfand
          </p>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
              <span className="text-sm text-gray-500">bis</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Produkt auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Produkte</SelectItem>
                {products?.data?.map((product: any) => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.productName || product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Standort auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Standorte</SelectItem>
                {locations?.data?.map((location: any) => (
                  <SelectItem key={location.id} value={location.id.toString()}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="costs">Kostenaufstellung</TabsTrigger>
              <TabsTrigger value="revenue">Umsatzanalyse</TabsTrigger>
              <TabsTrigger value="profitability">Rentabilitätsanalyse</TabsTrigger>
            </TabsList>

            <TabsContent value="costs" className="mt-6">
              {costsLoading ? (
                <div className="text-center py-8">Lade Kostendaten...</div>
              ) : costData?.success ? (
                <div>
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-medium mb-2">Zusammenfassung</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Produkte analysiert:</span>
                        <span className="font-medium ml-2">{costData.summary.totalProducts}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Ø Kosten/Stück:</span>
                        <span className="font-medium ml-2">{formatCurrency(costData.summary.averageCostPerUnit)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Lieferanten:</span>
                        <span className="font-medium ml-2">{costData.summary.suppliersAnalyzed}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Rabatte angewandt:</span>
                        <span className="font-medium ml-2">{costData.summary.totalDiscountsApplied}</span>
                      </div>
                    </div>
                  </div>
                  {costData.data.map((breakdown: ProductCostBreakdown) => (
                    <CostBreakdownCard key={breakdown.productId} breakdown={breakdown} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Keine Kostendaten verfügbar</div>
              )}
            </TabsContent>

            <TabsContent value="revenue" className="mt-6">
              {revenueLoading ? (
                <div className="text-center py-8">Lade Umsatzdaten...</div>
              ) : revenueData?.success ? (
                <div>
                  <div className="mb-4 p-4 bg-green-50 rounded-lg">
                    <h3 className="font-medium mb-2">Zusammenfassung</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Gesamtumsatz:</span>
                        <span className="font-medium ml-2">{formatCurrency(revenueData.summary.totalRevenue)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Netto-Umsatz:</span>
                        <span className="font-medium ml-2">{formatCurrency(revenueData.summary.totalNetRevenue)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Transaktionen:</span>
                        <span className="font-medium ml-2">{revenueData.summary.totalTransactions}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Produkte analysiert:</span>
                        <span className="font-medium ml-2">{revenueData.summary.productsAnalyzed}</span>
                      </div>
                    </div>
                  </div>
                  {revenueData.data.map((analysis: ProductRevenueAnalysis) => (
                    <RevenueAnalysisCard key={analysis.productId} analysis={analysis} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Keine Umsatzdaten verfügbar</div>
              )}
            </TabsContent>

            <TabsContent value="profitability" className="mt-6">
              {profitabilityLoading ? (
                <div className="text-center py-8">Lade Rentabilitätsdaten...</div>
              ) : profitabilityData?.success ? (
                <div>
                  <div className="mb-4 p-4 bg-purple-50 rounded-lg">
                    <h3 className="font-medium mb-2">Zusammenfassung</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Gesamtgewinn:</span>
                        <span className={`font-medium ml-2 ${profitabilityData.summary.totalNetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(profitabilityData.summary.totalNetProfit)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Ø Gewinnmarge:</span>
                        <span className="font-medium ml-2">{formatPercent(profitabilityData.summary.averageProfitMargin)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Rentable Produkte:</span>
                        <span className="font-medium ml-2">{profitabilityData.summary.profitableProducts}/{profitabilityData.summary.totalProducts}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Rentabilitätsquote:</span>
                        <span className="font-medium ml-2">{formatPercent(profitabilityData.summary.profitabilityRate)}</span>
                      </div>
                    </div>
                  </div>
                  {profitabilityData.data
                    .sort((a: ProfitabilityAnalysis, b: ProfitabilityAnalysis) => b.profitability.netProfit - a.profitability.netProfit)
                    .map((analysis: ProfitabilityAnalysis) => (
                      <ProfitabilityCard key={analysis.productId} analysis={analysis} />
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Keine Rentabilitätsdaten verfügbar</div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductCostRevenueAnalysis;
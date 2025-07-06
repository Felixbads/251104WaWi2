import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3, 
  Euro,
  Calendar,
  Package,
  Building2
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';

interface WirtschaftlichkeitData {
  period: string;
  periodDate: string;
  machineId?: number;
  machineName?: string;
  locationName?: string;
  productId?: number;
  productName?: string;
  revenueNet: number;
  revenueGross: number;
  depositRevenue: number;
  purchaseCostNet: number;
  operatingCostsNet: number;
  netProfit: number;
  profitMarginPercent: number;
  transactionCount: number;
  quantitySold: number;
  avgSalePrice: number;
}

interface SummaryData {
  totalRevenueNet: number;
  totalRevenueGross: number;
  totalDepositRevenue: number;
  totalPurchaseCost: number;
  totalOperatingCosts: number;
  totalNetProfit: number;
  profitMarginPercent: number;
  roiPercent: number;
  totalTransactions: number;
  totalQuantity: number;
}

export default function Wirtschaftlichkeit() {
  // State für Filter
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'machine' | 'product' | 'location' | 'total'>('product');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');

  // Profitability Data Query
  const { data: profitabilityData, isLoading: profitabilityLoading } = useQuery<{
    success: boolean;
    data: WirtschaftlichkeitData[];
    summary: SummaryData;
  }>({
    queryKey: ['/api/profitability/overview', { period, startDate, endDate, groupBy, selectedMachine, selectedProduct }],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
        groupBy,
        ...(selectedMachine && { machineId: selectedMachine }),
        ...(selectedProduct && { productId: selectedProduct })
      });
      
      const response = await fetch(`/api/profitability/overview?${params}`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Wirtschaftlichkeitsdaten');
      }
      return response.json();
    }
  });

  // Machines Query for filter
  const { data: machines } = useQuery<any[]>({
    queryKey: ['/api/machines'],
  });

  // Products Query for filter
  const { data: products } = useQuery<any[]>({
    queryKey: ['/api/products'],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-600';
    if (profit < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const summary = profitabilityData?.summary;
  const data = profitabilityData?.data || [];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">💰 Wirtschaftlichkeit</h1>
          <p className="text-gray-600 mt-2">Umsatz minus Kosten - Echte Gewinnberechnungen</p>
        </div>
      </div>

      {/* Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filter & Zeitraum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="period">Zeitraum</Label>
              <Select value={period} onValueChange={(value: 'day' | 'week' | 'month') => setPeriod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Täglich</SelectItem>
                  <SelectItem value="week">Wöchentlich</SelectItem>
                  <SelectItem value="month">Monatlich</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">Von</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="endDate">Bis</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="groupBy">Gruppierung</Label>
              <Select value={groupBy} onValueChange={(value: 'machine' | 'product' | 'location' | 'total') => setGroupBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Nach Produkt</SelectItem>
                  <SelectItem value="machine">Nach Automat</SelectItem>
                  <SelectItem value="location">Nach Standort</SelectItem>
                  <SelectItem value="total">Gesamt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {groupBy === 'machine' && machines && (
            <div className="mt-4">
              <Label htmlFor="selectedMachine">Automat auswählen</Label>
              <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Automaten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Automaten</SelectItem>
                  {machines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id.toString()}>
                      {machine.name || `Automat ${machine.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {groupBy === 'product' && products && (
            <div className="mt-4">
              <Label htmlFor="selectedProduct">Produkt auswählen</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Produkte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Produkte</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Gesamtumsatz</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalRevenueNet)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Euro className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Gesamtkosten</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalPurchaseCost + summary.totalOperatingCosts)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                {summary.totalNetProfit > 0 ? (
                  <TrendingUp className="h-8 w-8 text-green-600" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-red-600" />
                )}
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Nettogewinn</p>
                  <p className={`text-2xl font-bold ${getProfitColor(summary.totalNetProfit)}`}>
                    {formatCurrency(summary.totalNetProfit)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <BarChart3 className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Gewinnmarge</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatPercent(summary.profitMarginPercent)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Detaillierte Gewinn- und Verlustrechnung
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profitabilityLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Keine Daten für den ausgewählten Zeitraum gefunden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">
                      {groupBy === 'product' && 'Produkt'}
                      {groupBy === 'machine' && 'Automat'}
                      {groupBy === 'location' && 'Standort'}
                      {groupBy === 'total' && 'Zeitraum'}
                    </th>
                    <th className="text-right py-3 px-2">Verkäufe</th>
                    <th className="text-right py-3 px-2">Umsatz</th>
                    <th className="text-right py-3 px-2">Einkaufskosten</th>
                    <th className="text-right py-3 px-2">Betriebskosten</th>
                    <th className="text-right py-3 px-2">Nettogewinn</th>
                    <th className="text-right py-3 px-2">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">
                        {groupBy === 'product' && (item.productName || 'Unbekanntes Produkt')}
                        {groupBy === 'machine' && (item.machineName || `Automat ${item.machineId}`)}
                        {groupBy === 'location' && (item.locationName || 'Unbekannter Standort')}
                        {groupBy === 'total' && format(new Date(item.periodDate), 'dd.MM.yyyy', { locale: de })}
                      </td>
                      <td className="text-right py-3 px-2">
                        <Badge variant="outline">
                          {item.transactionCount} Verkäufe
                        </Badge>
                      </td>
                      <td className="text-right py-3 px-2 font-semibold">
                        {formatCurrency(item.revenueNet)}
                      </td>
                      <td className="text-right py-3 px-2 text-red-600">
                        -{formatCurrency(item.purchaseCostNet)}
                      </td>
                      <td className="text-right py-3 px-2 text-red-600">
                        -{formatCurrency(item.operatingCostsNet)}
                      </td>
                      <td className={`text-right py-3 px-2 font-bold ${getProfitColor(item.netProfit)}`}>
                        {formatCurrency(item.netProfit)}
                      </td>
                      <td className="text-right py-3 px-2">
                        <Badge 
                          variant={item.profitMarginPercent > 30 ? "default" : item.profitMarginPercent > 10 ? "secondary" : "destructive"}
                        >
                          {formatPercent(item.profitMarginPercent)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Building2 className="h-6 w-6 text-blue-600 mt-1" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Berechnungsgrundlage</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>• <strong>Umsatz:</strong> Tatsächliche Verkaufserlöse aus Vendon-Transaktionen</p>
                <p>• <strong>Einkaufskosten:</strong> 65% des Verkaufspreises (geschätzte Wareneinkaufskosten)</p>
                <p>• <strong>Betriebskosten:</strong> Berücksichtigt Standortmieten, Wartung und weitere operative Kosten</p>
                <p>• <strong>Nettogewinn:</strong> Umsatz minus Einkaufskosten minus Betriebskosten</p>
                <p>• <strong>Gewinnmarge:</strong> Nettogewinn in Prozent des Umsatzes</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
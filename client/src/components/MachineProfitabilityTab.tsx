import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMachineProfitability } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, Package, Target } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ProductProfitability {
  product_name: string;
  quantity_sold: number;
  revenue_gross: number;
  revenue_net: number;
  avg_sale_price: number;
  total_costs: number;
  net_profit: number;
  profit_margin_percent: number;
  is_profitable: boolean;
}

interface ProfitabilitySummary {
  totalRevenue: number;
  totalCosts: number;
  netProfit: number;
  profitMarginPercent: number;
  isProfitable: boolean;
  period: {
    start: string;
    end: string;
  };
}

interface ProfitabilityData {
  success: boolean;
  data: {
    products: ProductProfitability[];
    summary: ProfitabilitySummary;
  };
}

interface MachineProfitabilityTabProps {
  machineId: number | null;
}

const MachineProfitabilityTab: React.FC<MachineProfitabilityTabProps> = ({ machineId }) => {
  const [dateRange, setDateRange] = useState<{start: Date; end: Date}>(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start, end };
  });

  // Fetch machine profitability data
  const { data: profitabilityData, isLoading, error } = useQuery({
    queryKey: ['/api/machines', machineId, 'profitability', dateRange.start, dateRange.end],
    queryFn: () => getMachineProfitability(machineId!, dateRange.start.toISOString().split('T')[0], dateRange.end.toISOString().split('T')[0]),
    enabled: !!machineId
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

  const getProfitabilityColor = (profitMargin: number) => {
    if (profitMargin >= 20) return 'text-green-600';
    if (profitMargin >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProfitabilityBadgeColor = (isProfit: boolean) => {
    return isProfit ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Rentabilität</h3>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Lade Rentabilitätsdaten...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Rentabilität</h3>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              <p>Fehler beim Laden der Rentabilitätsdaten</p>
              <p className="text-sm text-gray-500 mt-1">
                {error instanceof Error ? error.message : 'Unbekannter Fehler'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = profitabilityData as ProfitabilityData;
  const summary = data?.data?.summary;
  const products = data?.data?.products || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Rentabilität</h3>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.start, "dd.MM.yyyy", { locale: de })} - {format(dateRange.end, "dd.MM.yyyy", { locale: de })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Startdatum</label>
                  <Calendar
                    mode="single"
                    selected={dateRange.start}
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, start: date }))}
                    locale={de}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Enddatum</label>
                  <Calendar
                    mode="single"
                    selected={dateRange.end}
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, end: date }))}
                    locale={de}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Gesamtumsatz</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.totalRevenue)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Gesamtkosten</p>
                  <p className="text-xl font-semibold">{formatCurrency(summary.totalCosts)}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Nettogewinn</p>
                  <p className={`text-xl font-semibold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.netProfit)}
                  </p>
                </div>
                {summary.netProfit >= 0 ? 
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
                  <p className="text-sm text-gray-600">Gewinnmarge</p>
                  <p className={`text-xl font-semibold ${getProfitabilityColor(summary.profitMarginPercent)}`}>
                    {formatPercentage(summary.profitMarginPercent)}
                  </p>
                  <Badge className={getProfitabilityBadgeColor(summary.isProfitable)}>
                    {summary.isProfitable ? 'Profitabel' : 'Verlust'}
                  </Badge>
                </div>
                <Target className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Produkt-Rentabilität</CardTitle>
          <CardDescription>
            Detaillierte Analyse der Produktrentabilität für den ausgewählten Zeitraum
          </CardDescription>
        </CardHeader>
        <CardContent>
          {products.length > 0 ? (
            <div className="space-y-4">
              {products.map((product, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{product.product_name}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          {product.quantity_sold} verkauft
                        </span>
                        <span>Ø {formatCurrency(product.avg_sale_price)}</span>
                      </div>
                    </div>
                    <Badge className={getProfitabilityBadgeColor(product.is_profitable)}>
                      {product.is_profitable ? 'Profitabel' : 'Verlust'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <label className="text-gray-600">Bruttoumsatz</label>
                      <p className="font-semibold">{formatCurrency(product.revenue_gross)}</p>
                    </div>
                    <div>
                      <label className="text-gray-600">Nettoumsatz</label>
                      <p className="font-semibold">{formatCurrency(product.revenue_net)}</p>
                    </div>
                    <div>
                      <label className="text-gray-600">Nettogewinn</label>
                      <p className={`font-semibold ${product.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(product.net_profit)}
                      </p>
                    </div>
                    <div>
                      <label className="text-gray-600">Gewinnmarge</label>
                      <p className={`font-semibold ${getProfitabilityColor(product.profit_margin_percent)}`}>
                        {formatPercentage(product.profit_margin_percent)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Rentabilität</span>
                      <span>{formatPercentage(Math.max(0, product.profit_margin_percent))}</span>
                    </div>
                    <Progress 
                      value={Math.max(0, Math.min(100, product.profit_margin_percent))} 
                      className="h-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="font-medium">Keine Verkaufsdaten verfügbar</p>
              <p className="text-sm">Für den ausgewählten Zeitraum wurden keine Produkte verkauft.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MachineProfitabilityTab;
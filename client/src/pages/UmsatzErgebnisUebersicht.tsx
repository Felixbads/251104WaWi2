import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, TrendingUpIcon, TrendingDownIcon, EuroIcon, CalculatorIcon, RefreshCwIcon, ExpandIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { de } from 'date-fns/locale';

interface ProductSalesAuthentic {
  productName: string;
  netSalePrice: number;
  purchasePrice: number;
  marginEur: number;
  marginPercent: number;
  salesCount: number;
  productResult: number;
  hasRealCosts: boolean;
  costSource: 'authentic' | 'estimated';
}

interface MachineOverview {
  machineId: number;
  machineName: string;
  locationName: string;
  netRevenue: number;
  transactionCount: number;
  totalResult: number;
  averageMargin: number;
  fixedCosts: number;
  hasRealCosts: boolean;
  authenticCostPercentage: number;
  delta: number;
  products: ProductSalesAuthentic[];
}

interface ApiResponse {
  success: boolean;
  data: MachineOverview[];
  summary: {
    totalMachines: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
    costDataSource: string;
    avgAuthenticCostPercentage: number;
  };
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export default function UmsatzErgebnisUebersicht() {
  const [timeFilter, setTimeFilter] = useState('7days');
  const [expandedMachines, setExpandedMachines] = useState<Set<number>>(new Set());
  const [useAuthenticCosts, setUseAuthenticCosts] = useState(true);

  // Calculate date range based on filter
  const getDateRange = () => {
    const today = new Date();
    switch (timeFilter) {
      case '1day':
        return { startDate: format(today, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case '7days':
        return { startDate: format(subDays(today, 6), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case '30days':
        return { startDate: format(subDays(today, 29), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'week':
        return { startDate: format(startOfWeek(today, { locale: de }), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'month':
        return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'year':
        return { startDate: format(startOfYear(today), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      default:
        return { startDate: format(subDays(today, 6), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
    }
  };

  const dateRange = getDateRange();
  const apiEndpoint = useAuthenticCosts ? '/api/umsatz-ergebnis-overview-authentic' : '/api/umsatz-ergebnis-overview-fast';

  const { data, isLoading, error, refetch } = useQuery<ApiResponse>({
    queryKey: ['umsatz-ergebnis', timeFilter, useAuthenticCosts, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      
      const response = await fetch(`${apiEndpoint}?${params}`);
      if (!response.ok) {
        throw new Error('API-Fehler beim Laden der Umsatz-Ergebnis-Daten');
      }
      return response.json();
    },
  });

  const toggleMachineExpanded = (machineId: number) => {
    const newExpanded = new Set(expandedMachines);
    if (newExpanded.has(machineId)) {
      newExpanded.delete(machineId);
    } else {
      newExpanded.add(machineId);
    }
    setExpandedMachines(newExpanded);
  };

  if (isLoading) {
    return <div className="p-6">Lade Umsatz- und Ergebnisübersicht...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">Fehler beim Laden der Daten: {error.message}</div>;
  }

  if (!data?.success || !data.data) {
    return <div className="p-6">Keine Daten verfügbar</div>;
  }

  const totalRevenue = data.data.reduce((sum, machine) => sum + machine.netRevenue, 0);
  const totalResult = data.data.reduce((sum, machine) => sum + machine.totalResult, 0);
  const totalTransactions = data.data.reduce((sum, machine) => sum + machine.transactionCount, 0);
  const avgMargin = totalRevenue > 0 ? (totalResult / totalRevenue) * 100 : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Umsatz- und Ergebnisübersicht</h1>
          <p className="text-muted-foreground">
            Detaillierte Analyse mit authentischen deutschen Geschäftsmetriken
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-48">
              <CalendarIcon className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1day">Heute</SelectItem>
              <SelectItem value="7days">Letzte 7 Tage</SelectItem>
              <SelectItem value="30days">Letzte 30 Tage</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Dieser Monat</SelectItem>
              <SelectItem value="year">Dieses Jahr</SelectItem>
            </SelectContent>
          </Select>

          <Tabs value={useAuthenticCosts ? 'authentic' : 'fast'} onValueChange={(value) => setUseAuthenticCosts(value === 'authentic')}>
            <TabsList>
              <TabsTrigger value="authentic" className="text-xs">
                <CalculatorIcon className="w-3 h-3 mr-1" />
                Echte Kosten
              </TabsTrigger>
              <TabsTrigger value="fast" className="text-xs">
                <TrendingUpIcon className="w-3 h-3 mr-1" />
                Standard (40%)
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCwIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Umsatz Netto (ohne Pfand)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">{totalTransactions} Transaktionen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ergebnis Netto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalResult >= 0 ? <TrendingUpIcon className="w-5 h-5 inline mr-1" /> : <TrendingDownIcon className="w-5 h-5 inline mr-1" />}
              {formatCurrency(totalResult)}
            </div>
            <p className="text-xs text-muted-foreground">
              Marge: {formatPercent(avgMargin)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Automaten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalMachines}</div>
            <p className="text-xs text-muted-foreground">
              Ø {formatCurrency(totalRevenue / data.summary.totalMachines)} pro Automat
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kostengenauigkeit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatPercent(data.summary.avgAuthenticCostPercentage)}
            </div>
            <p className="text-xs text-muted-foreground">
              <Badge variant={useAuthenticCosts ? "default" : "secondary"} className="text-xs">
                {useAuthenticCosts ? "Echte Kosten" : "Standard 40%"}
              </Badge>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Machine Overview */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Standort-Übersicht</CardTitle>
              <CardDescription>
                Umsatz und Ergebnis pro Automat ({format(new Date(dateRange.startDate), 'dd.MM.yy', { locale: de })} - {format(new Date(dateRange.endDate), 'dd.MM.yy', { locale: de })})
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.data.map((machine) => (
              <div key={machine.machineId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleMachineExpanded(machine.machineId)}>
                  <div className="flex items-center space-x-4">
                    <div>
                      <h3 className="font-semibold">{machine.machineName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {machine.transactionCount} Verkäufe
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(machine.netRevenue)}</div>
                      <div className="text-sm text-muted-foreground">Umsatz</div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`font-medium ${machine.totalResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(machine.totalResult)}
                      </div>
                      <div className="text-sm text-muted-foreground">Ergebnis</div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-medium">{formatPercent(machine.averageMargin)}</div>
                      <div className="text-sm text-muted-foreground">Marge</div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {machine.hasRealCosts && (
                        <Badge variant="default" className="text-xs">
                          <CalculatorIcon className="w-3 h-3 mr-1" />
                          Echte Kosten
                        </Badge>
                      )}
                      {expandedMachines.has(machine.machineId) ? (
                        <ChevronUpIcon className="w-4 h-4" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedMachines.has(machine.machineId) && machine.products?.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="font-medium mb-3">Produktdetails</h4>
                    <div className="grid gap-2">
                      {machine.products.map((product, index) => (
                        <div key={index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{product.productName}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.salesCount}× verkauft
                              {product.hasRealCosts && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Echte Kosten
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{formatCurrency(product.productResult)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatPercent(product.marginPercent)} Marge
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
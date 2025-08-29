import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  EuroIcon, 
  RefreshCwIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  BarChart3Icon,
  TrendingUp,
  Calculator,
  Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DBIProduct {
  id: number;
  product_vendon_id: string;
  produkt_name: string;
  deckungsbeitragsindex: number | null;
  monatsumsatz_netto: number;
  wert_entnahmen: number;
  gesamtmarge: number;
  delta_ergebnis_minus_entnahmen: number;
  anzahl_automaten_gelistet: number;
  dbi_vorperiode: number | null;
  dbi_delta_abs: number | null;
  dbi_delta_rel: number | null;
}

interface DBIResponse {
  success: boolean;
  data: {
    products: DBIProduct[];
    summary: {
      topProduct: DBIProduct | null;
      totalProducts: number;
      dateRange: {
        current: { startDate: string; endDate: string };
        previous: { startDate: string; endDate: string };
      };
    };
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

const formatNumber = (value: number | null, decimals: number = 2): string => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatPercent = (value: number | null, decimals: number = 1): string => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const DeltaIndicator = ({ value, isPercent = false }: { value: number | null; isPercent?: boolean }) => {
  if (value === null || value === undefined) return <MinusIcon className="h-4 w-4 text-gray-400" />;
  
  if (value > 0) {
    return (
      <div className="flex items-center text-green-600">
        <ArrowUpIcon className="h-4 w-4 mr-1" />
        <span className="text-sm font-medium">
          {isPercent ? formatPercent(value, 1) : `+${formatNumber(value, 2)}`}
        </span>
      </div>
    );
  } else if (value < 0) {
    return (
      <div className="flex items-center text-red-600">
        <ArrowDownIcon className="h-4 w-4 mr-1" />
        <span className="text-sm font-medium">
          {isPercent ? formatPercent(value, 1) : formatNumber(value, 2)}
        </span>
      </div>
    );
  } else {
    return (
      <div className="flex items-center text-gray-500">
        <MinusIcon className="h-4 w-4 mr-1" />
        <span className="text-sm font-medium">0,00</span>
      </div>
    );
  }
};

export default function DBIndex() {
  const [sortField, setSortField] = useState<keyof DBIProduct>('deckungsbeitragsindex');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error, refetch } = useQuery<DBIResponse>({
    queryKey: ['db-index-data'],
    queryFn: async () => {
      const response = await fetch('/api/db-index');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText || 'Failed to fetch DB-Index data'}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'API returned unsuccessful response');
      }
      return result;
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (gcTime replaces cacheTime in v5)
  });

  const handleSort = (field: keyof DBIProduct) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedProducts = data?.data?.products?.slice().sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    // Handle null values - push to end
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal, 'de') * multiplier;
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }
    
    return 0;
  });

  const topProduct = data?.data?.summary?.topProduct;

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Deckungsbeitragsindex</h1>
            <p className="text-sm text-gray-600 mt-1">
              Berechnung und Analyse des Deckungsbeitragsindex je Produkt (30 Tage)
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center h-40">
            <div className="text-center">
              <p className="text-red-600 font-medium">Fehler beim Laden der Daten</p>
              <p className="text-sm text-gray-500 mt-1">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deckungsbeitragsindex</h1>
          <p className="text-sm text-gray-600 mt-1">
            Berechnung und Analyse des Deckungsbeitragsindex je Produkt (30 Tage)
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCwIcon className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Aktualisieren
        </Button>
      </div>

      {/* Enhanced KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-blue-600" />
              <div className="text-sm font-medium text-gray-600">Gesamtprodukte</div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2">
              {data?.data?.summary?.totalProducts || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">mit Umsatz (30 Tage)</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div className="text-sm font-medium text-gray-600">Höchster DBI</div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2">
              {topProduct ? formatNumber(topProduct.deckungsbeitragsindex, 2) : '-'}
            </div>
            <p className="text-xs text-gray-500 mt-1">€ je Automat</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5 text-purple-600" />
              <div className="text-sm font-medium text-gray-600">Durchschnitt DBI</div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2">
              {sortedProducts && sortedProducts.length > 0 ? formatNumber(
                sortedProducts.filter(p => p.deckungsbeitragsindex !== null).reduce((sum, p) => sum + (p.deckungsbeitragsindex || 0), 0) / 
                sortedProducts.filter(p => p.deckungsbeitragsindex !== null).length || 1, 2
              ) : '-'}
            </div>
            <p className="text-xs text-gray-500 mt-1">€ je Automat</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3Icon className="h-5 w-5 text-orange-600" />
              <div className="text-sm font-medium text-gray-600">Positive DBIs</div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-2">
              {sortedProducts ? sortedProducts.filter(p => p.deckungsbeitragsindex && p.deckungsbeitragsindex > 0).length : 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">von {sortedProducts?.length || 0} Produkten</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Product Highlight */}
      {topProduct && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-medium flex items-center">
                  <TrendingUpIcon className="h-5 w-5 text-green-600 mr-2" />
                  Top-Performer: Deckungsbeitragsindex
                </CardTitle>
                <CardDescription className="text-base font-medium mt-1">
                  {topProduct.produkt_name}
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Rang #1
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center">
                  <EuroIcon className="h-5 w-5 text-green-600 mr-1" />
                  <span className="text-3xl font-bold text-gray-900">
                    {formatNumber(topProduct.deckungsbeitragsindex, 2)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">DBI je Automat</p>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Veränderung vs. Vorperiode</p>
                <div className="flex items-center space-x-2">
                  <DeltaIndicator value={topProduct.dbi_delta_abs} />
                  <span className="text-gray-400">|</span>
                  <DeltaIndicator value={topProduct.dbi_delta_rel} isPercent />
                </div>
              </div>
              
              <div className="space-y-2 text-right">
                <div className="space-y-1">
                  <Badge variant="outline" className="block">
                    {topProduct.anzahl_automaten_gelistet} {topProduct.anzahl_automaten_gelistet === 1 ? 'Automat' : 'Automaten'}
                  </Badge>
                  <p className="text-sm text-gray-600">
                    Monatsumsatz: {formatCurrency(topProduct.monatsumsatz_netto)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Marge: {formatCurrency(topProduct.gesamtmarge)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produktliste nach Deckungsbeitragsindex (30 Tage, sortiert)</CardTitle>
          <CardDescription>
            {data?.data?.summary?.totalProducts || 0} Produkte
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <RefreshCwIcon className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                <p className="text-gray-600 mt-2">Daten werden geladen...</p>
              </div>
            </div>
          ) : sortedProducts && sortedProducts.length > 0 ? (
            <div className="space-y-4">
              {/* Performance Summary Bar */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-green-600">
                      {sortedProducts.filter(p => p.deckungsbeitragsindex && p.deckungsbeitragsindex > 100).length}
                    </div>
                    <div className="text-gray-600">DBI &gt; 100€</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-yellow-600">
                      {sortedProducts.filter(p => p.deckungsbeitragsindex && p.deckungsbeitragsindex > 0 && p.deckungsbeitragsindex <= 100).length}
                    </div>
                    <div className="text-gray-600">DBI 0-100€</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-red-600">
                      {sortedProducts.filter(p => p.deckungsbeitragsindex && p.deckungsbeitragsindex <= 0).length}
                    </div>
                    <div className="text-gray-600">DBI ≤ 0€</div>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleSort('deckungsbeitragsindex')}
                      >
                        <div className="flex items-center">
                          Deckungsbeitragsindex
                          {sortField === 'deckungsbeitragsindex' && (
                            sortDirection === 'desc' ? <ArrowDownIcon className="ml-1 h-4 w-4" /> : <ArrowUpIcon className="ml-1 h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleSort('produkt_name')}
                      >
                        <div className="flex items-center">
                          Produkt
                          {sortField === 'produkt_name' && (
                            sortDirection === 'desc' ? <ArrowDownIcon className="ml-1 h-4 w-4" /> : <ArrowUpIcon className="ml-1 h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-50 text-right"
                        onClick={() => handleSort('monatsumsatz_netto')}
                      >
                        <div className="flex items-center justify-end">
                          Monatsumsatz (netto)
                          {sortField === 'monatsumsatz_netto' && (
                            sortDirection === 'desc' ? <ArrowDownIcon className="ml-1 h-4 w-4" /> : <ArrowUpIcon className="ml-1 h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-50 text-right"
                        onClick={() => handleSort('anzahl_automaten_gelistet')}
                      >
                        <div className="flex items-center justify-end">
                          Automaten
                          {sortField === 'anzahl_automaten_gelistet' && (
                            sortDirection === 'desc' ? <ArrowDownIcon className="ml-1 h-4 w-4" /> : <ArrowUpIcon className="ml-1 h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-50 text-right"
                        onClick={() => handleSort('dbi_vorperiode')}
                      >
                        <div className="flex items-center justify-end">
                          DBI Vormonat
                          {sortField === 'dbi_vorperiode' && (
                            sortDirection === 'desc' ? <ArrowDownIcon className="ml-1 h-4 w-4" /> : <ArrowUpIcon className="ml-1 h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Veränderung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProducts.map((product, index) => {
                      const dbiValue = product.deckungsbeitragsindex;
                      const dbiColor = dbiValue === null ? 'text-gray-400' : 
                                      dbiValue > 100 ? 'text-green-600' :
                                      dbiValue > 0 ? 'text-yellow-600' : 'text-red-600';
                      const bgColor = index < 3 ? 'bg-yellow-50' : 
                                      dbiValue && dbiValue > 100 ? 'bg-green-50' :
                                      dbiValue && dbiValue <= 0 ? 'bg-red-50' : '';
                      
                      return (
                        <TableRow key={product.id} className={bgColor}>
                          <TableCell className="font-medium text-gray-500">
                            {index + 1}
                            {index < 3 && <span className="ml-1 text-yellow-500">★</span>}
                          </TableCell>
                          <TableCell className={`font-medium ${dbiColor}`}>
                            <div className="flex items-center">
                              <EuroIcon className="h-4 w-4 mr-1" />
                              {formatNumber(product.deckungsbeitragsindex, 2)}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate font-medium" title={product.produkt_name}>
                              {product.produkt_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.monatsumsatz_netto)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={product.anzahl_automaten_gelistet > 1 ? 'default' : 'secondary'}>
                              {product.anzahl_automaten_gelistet}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(product.dbi_vorperiode, 2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-1">
                              <DeltaIndicator value={product.dbi_delta_abs} />
                              <DeltaIndicator value={product.dbi_delta_rel} isPercent />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <BarChart3Icon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">Keine Produktdaten verfügbar</p>
                <p className="text-sm text-gray-500 mt-1">
                  Keine Produkte mit Umsatz im 30-Tage-Zeitraum gefunden.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
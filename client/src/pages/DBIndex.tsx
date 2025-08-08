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
  MinusIcon 
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
        throw new Error('Failed to fetch DB-Index data');
      }
      return response.json();
    },
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

      {/* KPI Tile */}
      {topProduct && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">
              Deckungsbeitragsindex – Top-Produkt (30 Tage)
            </CardTitle>
            <CardDescription>
              {topProduct.produkt_name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div>
                  <div className="flex items-center">
                    <EuroIcon className="h-5 w-5 text-green-600 mr-1" />
                    <span className="text-2xl font-bold text-gray-900">
                      {formatNumber(topProduct.deckungsbeitragsindex, 2)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">DBI je Automat</p>
                </div>
                
                <div className="h-8 w-px bg-gray-200" />
                
                <div>
                  <p className="text-sm text-gray-600">Δ vs. Vorperiode</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <DeltaIndicator value={topProduct.dbi_delta_abs} />
                    <span className="text-gray-400">|</span>
                    <DeltaIndicator value={topProduct.dbi_delta_rel} isPercent />
                  </div>
                </div>
              </div>

              <div className="text-right">
                <Badge variant="outline">
                  {topProduct.anzahl_automaten_gelistet} Automaten
                </Badge>
                <p className="text-sm text-gray-600 mt-1">
                  Umsatz: {formatCurrency(topProduct.monatsumsatz_netto)}
                </p>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                        Monatsumsatz (netto, o. Pfand)
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
                        Automaten (gelistet)
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
                    <TableHead className="text-right">Δ DBI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <EuroIcon className="h-4 w-4 text-green-600 mr-1" />
                          {formatNumber(product.deckungsbeitragsindex, 2)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={product.produkt_name}>
                          {product.produkt_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.monatsumsatz_netto)}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.anzahl_automaten_gelistet}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p className="text-gray-600">Keine Daten im 30-Tage-Zeitraum.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
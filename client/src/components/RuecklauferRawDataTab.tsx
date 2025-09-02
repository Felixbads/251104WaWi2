import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Search, 
  Calendar,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";

interface RawDataItem {
  refill_date: string;
  machine_name: string;
  machine_id: number;
  product_name: string;
  operator: string;
  removed_quantity: number;
  estimated_loss: number;
}

interface RawDataResponse {
  success: boolean;
  data: RawDataItem[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filters: {
    machine_id?: string;
    from_date?: string;
    to_date?: string;
    operator?: string;
    product_name?: string;
    sort_by: string;
    sort_order: string;
  };
}

interface FilterState {
  machine_id: string;
  from_date: string;
  to_date: string;
  operator: string;
  product_name: string;
  sort_by: string;
  sort_order: 'ASC' | 'DESC';
  page: number;
}

const RuecklauferRawDataTab: React.FC = () => {
  // Filter und Sortierung State
  const [filters, setFilters] = useState<FilterState>({
    machine_id: 'all',
    from_date: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to_date: format(new Date(), 'yyyy-MM-dd'),
    operator: 'all',
    product_name: '',
    sort_by: 'refill_date',
    sort_order: 'DESC',
    page: 1
  });

  const [searchDebounce, setSearchDebounce] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // Debounce für Produktsuche
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(filters.product_name);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.product_name]);

  // Query Parameter für API
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    
    if (filters.machine_id && filters.machine_id !== 'all') params.append('machine_id', filters.machine_id);
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.operator && filters.operator !== 'all') params.append('operator', filters.operator);
    if (searchDebounce) params.append('product_name', searchDebounce);
    if (filters.sort_by) params.append('sort_by', filters.sort_by);
    if (filters.sort_order) params.append('sort_order', filters.sort_order);
    params.append('page', filters.page.toString());
    params.append('limit', '50');

    return params.toString();
  }, [filters, searchDebounce]);

  // Data fetching
  const { data: rawData, isLoading, error, refetch } = useQuery<RawDataResponse>({
    queryKey: ['/api/removed-products/raw-data', queryParams],
    queryFn: () => apiRequest(`/api/removed-products/raw-data?${queryParams}`),
    refetchOnWindowFocus: false,
  });

  // Fetch machines for dropdown
  const { data: machines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => apiRequest('/api/machines'),
    refetchOnWindowFocus: false,
  });

  // Unique operators for dropdown
  const { data: operators } = useQuery({
    queryKey: ['/api/removed-products/operators'],
    queryFn: async () => {
      // Da es keinen spezifischen Operators-Endpoint gibt, simuliere ich das mit einer kleinen Abfrage
      const result = await apiRequest('/api/removed-products/raw-data?limit=1000');
      const operatorSet = new Set(result.data?.map((item: any) => item.operator).filter(Boolean));
      return Array.from(operatorSet);
    },
    refetchOnWindowFocus: false,
  });

  // Filter Handlers
  const handleFilterChange = (key: keyof FilterState, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : (typeof value === 'number' ? value : parseInt(value as string) || 1) // Reset page when filters change
    }));
  };

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sort_by: column,
      sort_order: prev.sort_by === column && prev.sort_order === 'ASC' ? 'DESC' : 'ASC',
      page: 1
    }));
  };

  const resetFilters = () => {
    setFilters({
      machine_id: 'all',
      from_date: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      to_date: format(new Date(), 'yyyy-MM-dd'),
      operator: 'all',
      product_name: '',
      sort_by: 'refill_date',
      sort_order: 'DESC',
      page: 1
    });
  };

  // Excel Export
  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      const exportParams = new URLSearchParams();
      if (filters.machine_id && filters.machine_id !== 'all') exportParams.append('machine_id', filters.machine_id);
      if (filters.from_date) exportParams.append('from_date', filters.from_date);
      if (filters.to_date) exportParams.append('to_date', filters.to_date);
      if (filters.operator && filters.operator !== 'all') exportParams.append('operator', filters.operator);
      if (filters.product_name) exportParams.append('product_name', filters.product_name);

      const response = await fetch(`/api/removed-products/raw-data/export?${exportParams.toString()}`, {
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
      a.download = `ruecklaufer-raw-data_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Export fehler:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Sortierungsindikator
  const getSortIcon = (column: string) => {
    if (filters.sort_by !== column) return <ArrowUpDown className="h-4 w-4" />;
    return filters.sort_order === 'ASC' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Raw Data - Detaillierte Entnahmen
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Aktualisieren
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || isLoading}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exportiert...' : 'Excel Export'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-sm font-medium mb-2 block">Von Datum</label>
              <Input
                type="date"
                value={filters.from_date}
                onChange={(e) => handleFilterChange('from_date', e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Bis Datum</label>
              <Input
                type="date"
                value={filters.to_date}
                onChange={(e) => handleFilterChange('to_date', e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Automat</label>
              <Select value={filters.machine_id} onValueChange={(value) => handleFilterChange('machine_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Automaten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Automaten</SelectItem>
                  {machines?.map((machine: any) => (
                    <SelectItem key={machine.id} value={machine.id.toString()}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Mitarbeiter</label>
              <Select value={filters.operator} onValueChange={(value) => handleFilterChange('operator', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Mitarbeiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                  {operators?.map((operator: string) => (
                    <SelectItem key={operator} value={operator}>
                      {operator}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Produkt</label>
              <Input
                placeholder="Produktname suchen..."
                value={filters.product_name}
                onChange={(e) => handleFilterChange('product_name', e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={resetFilters}
                className="flex items-center gap-2 w-full"
              >
                <Filter className="h-4 w-4" />
                Zurücksetzen
              </Button>
            </div>
          </div>

          {/* Summary Statistics */}
          {rawData?.success && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">
                    {rawData.pagination.total_count}
                  </div>
                  <p className="text-xs text-muted-foreground">Gesamte Entnahmen</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {rawData.data.reduce((sum, item) => sum + item.removed_quantity, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Entfernte Menge</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">
                    €{rawData.data.reduce((sum, item) => sum + item.estimated_loss, 0).toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">Geschätzter Verlust</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>Fehler beim Laden der Daten: {error.message}</p>
            </div>
          ) : rawData?.success && rawData.data.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('refill_date')}
                      >
                        <div className="flex items-center gap-2">
                          Datum/Zeit
                          {getSortIcon('refill_date')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('machine_name')}
                      >
                        <div className="flex items-center gap-2">
                          Automat
                          {getSortIcon('machine_name')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('product_name')}
                      >
                        <div className="flex items-center gap-2">
                          Produkt
                          {getSortIcon('product_name')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('operator')}
                      >
                        <div className="flex items-center gap-2">
                          Mitarbeiter
                          {getSortIcon('operator')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none text-right"
                        onClick={() => handleSort('removed_quantity')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Entnahme-Menge
                          {getSortIcon('removed_quantity')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none text-right"
                        onClick={() => handleSort('estimated_loss')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Geschätzter Verlust
                          {getSortIcon('estimated_loss')}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawData.data.map((item, index) => (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(item.refill_date), 'dd.MM.yyyy HH:mm', { locale: de })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.machine_name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate" title={item.product_name}>
                            {item.product_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.operator}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-red-600">
                            {item.removed_quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-red-600">
                            €{item.estimated_loss.toFixed(2)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {rawData.pagination.total_pages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Seite {rawData.pagination.current_page} von {rawData.pagination.total_pages} 
                    ({rawData.pagination.total_count} Einträge gesamt)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFilterChange('page', filters.page - 1)}
                      disabled={!rawData.pagination.has_prev}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Vorherige
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFilterChange('page', filters.page + 1)}
                      disabled={!rawData.pagination.has_next}
                    >
                      Nächste
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Keine Rückläufer-Daten für die gewählten Filter gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RuecklauferRawDataTab;
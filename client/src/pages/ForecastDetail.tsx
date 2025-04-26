import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ScatterChart,
  ErrorBar,
} from 'recharts';
import {
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart2,
  LineChart as LineChartIcon,
  Store,
  ShoppingBag,
  Clock,
  AlertCircle,
  Percent,
  RefreshCw,
  Loader2
} from 'lucide-react';
import PageHeader from "@/components/layout/PageHeader";
import { Cell } from "recharts";

export default function ForecastDetail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<'chart' | 'table'>('chart');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [dateRange, setDateRange] = useState<{ startDate: Date, endDate: Date }>({
    startDate: subDays(new Date(), 7),
    endDate: addDays(new Date(), 14)
  });
  
  // Filter states
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'day' | 'product' | 'machine' | 'location'>('day');

  // Fetch forecast models
  const { data: models, isLoading: isLoadingModels } = useQuery({
    queryKey: ['/api/forecast/models'],
    queryFn: () => apiRequest('/api/forecast/models', undefined, 'GET')
  });

  // Fetch locations
  const { data: locations, isLoading: isLoadingLocations } = useQuery({
    queryKey: ['/api/locations'],
    queryFn: () => apiRequest('/api/locations', undefined, 'GET')
  });

  // Fetch machines
  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => apiRequest('/api/machines', undefined, 'GET')
  });

  // Fetch products
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => apiRequest('/api/products', undefined, 'GET')
  });

  // Fetch categories
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['/api/product-categories'],
    queryFn: () => apiRequest('/api/product-categories', undefined, 'GET')
  });

  // Fetch forecast data
  const { 
    data: forecastData, 
    isLoading: isLoadingForecasts,
    refetch: refetchForecasts
  } = useQuery({
    queryKey: [
      '/api/forecast/detailed', 
      {
        startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
        endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
        modelId: selectedModel === 'all' ? undefined : selectedModel,
        locationId: selectedLocation === 'all' ? undefined : selectedLocation,
        machineId: selectedMachine === 'all' ? undefined : selectedMachine,
        productId: selectedProduct === 'all' ? undefined : selectedProduct,
        categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
        groupBy: groupBy
      }
    ],
    enabled: true,
    queryFn: async ({ queryKey }) => {
      const [url, params] = queryKey as [string, {
        startDate: string;
        endDate: string;
        modelId?: string;
        locationId?: string;
        machineId?: string;
        productId?: string;
        categoryId?: string;
        groupBy: 'day' | 'product' | 'machine' | 'location';
      }];
      
      const queryParams = new URLSearchParams();
      
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      if (params.modelId) queryParams.append('modelId', params.modelId);
      if (params.locationId) queryParams.append('locationId', params.locationId);
      if (params.machineId) queryParams.append('machineId', params.machineId);
      if (params.productId) queryParams.append('productId', params.productId);
      if (params.categoryId) queryParams.append('categoryId', params.categoryId);
      if (params.groupBy) queryParams.append('groupBy', params.groupBy);
      
      return apiRequest(`${url}?${queryParams.toString()}`, undefined, 'GET');
    }
  });

  // Handle filter changes
  const handleApplyFilters = () => {
    refetchForecasts();
    toast({
      title: "Filter angewendet",
      description: "Die Prognoseansicht wurde aktualisiert."
    });
  };

  // Handle CSV export
  const handleExportCSV = () => {
    if (!forecastData || !Array.isArray(forecastData)) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Headers based on group by
    let headers = ["Datum"];
    if (groupBy === 'day') {
      headers = [...headers, "Erwarteter Absatz", "Unsicherheitsbereich Min", "Unsicherheitsbereich Max", "Trendrichtung", "Feiertag"];
    } else if (groupBy === 'product') {
      headers = [...headers, "Produkt", "Erwarteter Absatz", "Unsicherheitsbereich Min", "Unsicherheitsbereich Max"];
    } else if (groupBy === 'machine') {
      headers = [...headers, "Automat", "Erwarteter Absatz", "Unsicherheitsbereich Min", "Unsicherheitsbereich Max"];
    } else if (groupBy === 'location') {
      headers = [...headers, "Standort", "Erwarteter Absatz", "Unsicherheitsbereich Min", "Unsicherheitsbereich Max"];
    }
    
    csvContent += headers.join(";") + "\\r\\n";
    
    // Data rows
    forecastData.forEach((item: any) => {
      let row = [format(new Date(item.date || item.forecast_date), 'dd.MM.yyyy')];
      
      if (groupBy === 'day') {
        row = [...row, 
          item.predicted_quantity.toFixed(2), 
          item.lower_bound?.toFixed(2) || "", 
          item.upper_bound?.toFixed(2) || "",
          item.trend || "",
          item.is_holiday ? "Ja" : "Nein"
        ];
      } else if (groupBy === 'product') {
        row = [...row, 
          item.product_name || "Unbekannt", 
          item.predicted_quantity.toFixed(2), 
          item.lower_bound?.toFixed(2) || "", 
          item.upper_bound?.toFixed(2) || ""
        ];
      } else if (groupBy === 'machine') {
        row = [...row, 
          item.machine_name || "Unbekannt", 
          item.predicted_quantity.toFixed(2), 
          item.lower_bound?.toFixed(2) || "", 
          item.upper_bound?.toFixed(2) || ""
        ];
      } else if (groupBy === 'location') {
        row = [...row, 
          item.location_name || "Unbekannt", 
          item.predicted_quantity.toFixed(2), 
          item.lower_bound?.toFixed(2) || "", 
          item.upper_bound?.toFixed(2) || ""
        ];
      }
      
      csvContent += row.join(";") + "\\r\\n";
    });
    
    // Download CSV
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Prognose_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Export erfolgreich",
      description: "Die Prognosedaten wurden als CSV-Datei exportiert."
    });
  };

  // Calculate trend direction
  const getTrendDirection = (data: any[]) => {
    if (!data || data.length < 2) return 'neutral';
    
    const lastDay = data[data.length - 1].predicted_quantity;
    const previousDay = data[data.length - 2].predicted_quantity;
    
    if (lastDay > previousDay * 1.1) return 'up'; // 10% increase
    if (lastDay < previousDay * 0.9) return 'down'; // 10% decrease
    return 'neutral';
  };

  // Render line chart for day grouping
  const renderDayLineChart = () => {
    if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) return null;
    
    const chartData = forecastData.map((item: any) => ({
      date: format(new Date(item.date || item.forecast_date), 'dd.MM'),
      absatz: Number(item.predicted_quantity.toFixed(2)),
      min: item.lower_bound ? Number(item.lower_bound.toFixed(2)) : undefined,
      max: item.upper_bound ? Number(item.upper_bound.toFixed(2)) : undefined,
      isHoliday: item.is_holiday,
      holidayName: item.holiday_name
    }));
    
    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip 
            formatter={(value: any, name: string) => {
              if (name === 'absatz') return [value, 'Erwarteter Absatz'];
              if (name === 'min') return [value, 'Minimum'];
              if (name === 'max') return [value, 'Maximum'];
              return [value, name];
            }}
            labelFormatter={(label) => `Datum: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="absatz"
            stroke="#0ea5e9"
            strokeWidth={2}
            activeDot={{ r: 8 }}
            name="Erwarteter Absatz"
          />
          {chartData.some((item: any) => item.min !== undefined) && (
            <Line
              type="monotone"
              dataKey="min"
              stroke="#9ca3af"
              strokeDasharray="3 3"
              dot={false}
              name="Minimum"
            />
          )}
          {chartData.some((item: any) => item.max !== undefined) && (
            <Line
              type="monotone"
              dataKey="max"
              stroke="#9ca3af"
              strokeDasharray="3 3"
              dot={false}
              name="Maximum"
            />
          )}
          {/* Highlight holidays with reference lines */}
          {chartData.filter((item: any) => item.isHoliday).map((item: any, index: number) => (
            <ReferenceLine
              key={index}
              x={item.date}
              stroke="#f97316"
              strokeDasharray="3 3"
              label={{ value: 'Feiertag', position: 'insideTopRight', fill: '#f97316', fontSize: 10 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // Render bar chart for day grouping
  const renderDayBarChart = () => {
    if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) return null;
    
    const chartData = forecastData.map((item: any) => ({
      date: format(new Date(item.date || item.forecast_date), 'dd.MM'),
      absatz: Number(item.predicted_quantity.toFixed(2)),
      isHoliday: item.is_holiday,
      holidayName: item.holiday_name
    }));
    
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip 
            formatter={(value: any) => [value, 'Erwarteter Absatz']}
            labelFormatter={(label) => `Datum: ${label}`}
          />
          <Legend />
          <Bar 
            dataKey="absatz" 
            fill="#0ea5e9" 
            name="Erwarteter Absatz"
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry: any, index: number) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.isHoliday ? '#f97316' : '#0ea5e9'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Render charts for other groupings
  const renderGroupedChart = () => {
    if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) return null;
    
    let chartData;
    let nameKey = '';
    
    if (groupBy === 'product') {
      chartData = forecastData.map((item: any) => ({
        name: item.product_name || 'Unbekannt',
        absatz: Number(item.predicted_quantity.toFixed(2))
      }));
      nameKey = 'product';
    } else if (groupBy === 'machine') {
      chartData = forecastData.map((item: any) => ({
        name: item.machine_name || 'Unbekannt',
        absatz: Number(item.predicted_quantity.toFixed(2))
      }));
      nameKey = 'machine';
    } else if (groupBy === 'location') {
      chartData = forecastData.map((item: any) => ({
        name: item.location_name || 'Unbekannt',
        absatz: Number(item.predicted_quantity.toFixed(2))
      }));
      nameKey = 'location';
    } else {
      return null;
    }
    
    // Sort by predicted quantity descending
    chartData.sort((a: any, b: any) => b.absatz - a.absatz);
    
    // Limit to top 20 for readability
    const limitedData = chartData.slice(0, 20);
    
    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={limitedData} layout="vertical" margin={{ top: 20, right: 30, left: 150, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={150} />
            <Tooltip 
              formatter={(value: any) => [value, 'Erwarteter Absatz']}
              labelFormatter={(label) => `${nameKey === 'product' ? 'Produkt' : nameKey === 'machine' ? 'Automat' : 'Standort'}: ${label}`}
            />
            <Legend />
            <Bar dataKey="absatz" fill="#0ea5e9" name="Erwarteter Absatz" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    } else {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={limitedData} margin={{ top: 20, right: 30, left: 20, bottom: 150 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-90} textAnchor="end" height={150} />
            <YAxis />
            <Tooltip 
              formatter={(value: any) => [value, 'Erwarteter Absatz']}
              labelFormatter={(label) => `${nameKey === 'product' ? 'Produkt' : nameKey === 'machine' ? 'Automat' : 'Standort'}: ${label}`}
            />
            <Legend />
            <Line type="monotone" dataKey="absatz" stroke="#0ea5e9" name="Erwarteter Absatz" />
          </LineChart>
        </ResponsiveContainer>
      );
    }
  };

  // Render table based on grouping
  const renderForecastTable = () => {
    if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) return (
      <div className="text-center py-10 text-muted-foreground">
        Keine Prognosedaten gefunden. Bitte passen Sie Ihre Filter an.
      </div>
    );
    
    if (groupBy === 'day') {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Erwarteter Absatz</TableHead>
              <TableHead>Unsicherheitsbereich</TableHead>
              <TableHead>Trendrichtung</TableHead>
              <TableHead>Feiertag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecastData.map((item: any, index: number) => {
              const trend = index > 0 
                ? item.predicted_quantity > forecastData[index - 1].predicted_quantity * 1.1 
                  ? 'up' 
                  : item.predicted_quantity < forecastData[index - 1].predicted_quantity * 0.9 
                    ? 'down' 
                    : 'neutral'
                : 'neutral';
              
              return (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {format(new Date(item.date || item.forecast_date), 'dd.MM.yyyy')}
                  </TableCell>
                  <TableCell>{item.predicted_quantity.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.lower_bound && item.upper_bound 
                      ? `${item.lower_bound.toFixed(2)} - ${item.upper_bound.toFixed(2)}`
                      : 'n/a'}
                  </TableCell>
                  <TableCell>
                    {trend === 'up' && <TrendingUp className="text-green-500 h-5 w-5" />}
                    {trend === 'down' && <TrendingDown className="text-red-500 h-5 w-5" />}
                    {trend === 'neutral' && <div className="h-5 w-5 bg-gray-200 rounded-full" />}
                  </TableCell>
                  <TableCell>
                    {item.is_holiday ? (
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                        {item.holiday_name || 'Feiertag'}
                      </Badge>
                    ) : 'Nein'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      );
    } else if (groupBy === 'product') {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              <TableHead>Erwarteter Absatz</TableHead>
              <TableHead>Unsicherheitsbereich</TableHead>
              <TableHead>Kategorie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecastData.map((item: any, index: number) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{item.product_name || 'Unbekannt'}</TableCell>
                <TableCell>{item.predicted_quantity.toFixed(2)}</TableCell>
                <TableCell>
                  {item.lower_bound && item.upper_bound 
                    ? `${item.lower_bound.toFixed(2)} - ${item.upper_bound.toFixed(2)}`
                    : 'n/a'}
                </TableCell>
                <TableCell>{item.category_name || 'n/a'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    } else if (groupBy === 'machine') {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Automat</TableHead>
              <TableHead>Standort</TableHead>
              <TableHead>Erwarteter Absatz</TableHead>
              <TableHead>Unsicherheitsbereich</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecastData.map((item: any, index: number) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{item.machine_name || 'Unbekannt'}</TableCell>
                <TableCell>{item.location_name || 'Unbekannt'}</TableCell>
                <TableCell>{item.predicted_quantity.toFixed(2)}</TableCell>
                <TableCell>
                  {item.lower_bound && item.upper_bound 
                    ? `${item.lower_bound.toFixed(2)} - ${item.upper_bound.toFixed(2)}`
                    : 'n/a'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    } else if (groupBy === 'location') {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Standort</TableHead>
              <TableHead>Erwarteter Absatz</TableHead>
              <TableHead>Unsicherheitsbereich</TableHead>
              <TableHead>Anzahl Automaten</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecastData.map((item: any, index: number) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{item.location_name || 'Unbekannt'}</TableCell>
                <TableCell>{item.predicted_quantity.toFixed(2)}</TableCell>
                <TableCell>
                  {item.lower_bound && item.upper_bound 
                    ? `${item.lower_bound.toFixed(2)} - ${item.upper_bound.toFixed(2)}`
                    : 'n/a'}
                </TableCell>
                <TableCell>{item.machine_count || 'n/a'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prognoseanalyse"
      />
      <p className="text-muted-foreground mt-1 mb-6">
        Detaillierte Analyse erwarteter Verkaufszahlen nach Tag, Produkt, Automat und Standort
      </p>
      
      {/* Filter Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Filter className="h-5 w-5 mr-2 text-primary" />
            Filter und Gruppierung
          </CardTitle>
          <CardDescription>
            Wählen Sie die Parameter für Ihre Prognoseanalyse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label>Zeitraum</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Label className="w-12">Von:</Label>
                  <DatePicker 
                    date={dateRange.startDate} 
                    setDate={(date) => setDateRange(prev => ({ ...prev, startDate: date || prev.startDate }))} 
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-12">Bis:</Label>
                  <DatePicker 
                    date={dateRange.endDate} 
                    setDate={(date) => setDateRange(prev => ({ ...prev, endDate: date || prev.endDate }))} 
                  />
                </div>
              </div>
            </div>
            
            {/* Forecast Model */}
            <div className="space-y-2">
              <Label htmlFor="forecastModel">Prognosemodell</Label>
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
              >
                <SelectTrigger id="forecastModel">
                  <SelectValue placeholder="Alle Modelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Modelle</SelectItem>
                  {!isLoadingModels && models && models.map((model: any) => (
                    <SelectItem 
                      key={model.id} 
                      value={model.id.toString()}
                      disabled={model.status !== 'ready'}
                    >
                      {model.name} {model.status !== 'ready' && `(${model.status})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Standort</Label>
              <Select
                value={selectedLocation}
                onValueChange={setSelectedLocation}
              >
                <SelectTrigger id="location">
                  <SelectValue placeholder="Alle Standorte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Standorte</SelectItem>
                  {!isLoadingLocations && locations && locations.map((location: any) => (
                    <SelectItem 
                      key={location.id} 
                      value={location.id.toString()}
                    >
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Machine */}
            <div className="space-y-2">
              <Label htmlFor="machine">Automat</Label>
              <Select
                value={selectedMachine}
                onValueChange={setSelectedMachine}
              >
                <SelectTrigger id="machine">
                  <SelectValue placeholder="Alle Automaten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Automaten</SelectItem>
                  {!isLoadingMachines && machines && machines.map((machine: any) => (
                    <SelectItem 
                      key={machine.id} 
                      value={machine.id.toString()}
                    >
                      {machine.name || machine.machine_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Product */}
            <div className="space-y-2">
              <Label htmlFor="product">Produkt</Label>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger id="product">
                  <SelectValue placeholder="Alle Produkte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Produkte</SelectItem>
                  {!isLoadingProducts && products && products.map((product: any) => (
                    <SelectItem 
                      key={product.id} 
                      value={product.id.toString()}
                    >
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Alle Kategorien" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
                  {!isLoadingCategories && categories && categories.map((category: any) => (
                    <SelectItem 
                      key={category.id} 
                      value={category.id.toString()}
                    >
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Group By */}
          <div className="mt-4">
            <Label className="mb-2 block">Gruppieren nach</Label>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant={groupBy === 'day' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('day')}
                className="flex items-center"
              >
                <Calendar className="h-4 w-4 mr-1" />
                Tag
              </Button>
              <Button 
                variant={groupBy === 'product' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('product')}
                className="flex items-center"
              >
                <ShoppingBag className="h-4 w-4 mr-1" />
                Produkt
              </Button>
              <Button 
                variant={groupBy === 'machine' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('machine')}
                className="flex items-center"
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Automat
              </Button>
              <Button 
                variant={groupBy === 'location' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('location')}
                className="flex items-center"
              >
                <Store className="h-4 w-4 mr-1" />
                Standort
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between pt-0">
          <Button 
            variant="outline" 
            onClick={() => {
              setSelectedModel('all');
              setSelectedLocation('all');
              setSelectedMachine('all');
              setSelectedProduct('all');
              setSelectedCategory('all');
              setDateRange({
                startDate: subDays(new Date(), 7),
                endDate: addDays(new Date(), 14)
              });
              setGroupBy('day');
            }}
          >
            Filter zurücksetzen
          </Button>
          <Button onClick={handleApplyFilters}>
            {isLoadingForecasts ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird geladen...
              </>
            ) : (
              <>Filter anwenden</>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Prognoseauswertung</CardTitle>
              <CardDescription>
                Detaillierte Prognose für den ausgewählten Zeitraum vom {format(dateRange.startDate, 'dd.MM.yyyy')} bis {format(dateRange.endDate, 'dd.MM.yyyy')}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveView('chart')}
                className={activeView === 'chart' ? 'border-primary text-primary' : ''}
              >
                <BarChart2 className="h-4 w-4 mr-1" />
                Diagramm
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveView('table')}
                className={activeView === 'table' ? 'border-primary text-primary' : ''}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Tabelle
              </Button>
              
              {activeView === 'chart' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChartType('bar')}
                    className={chartType === 'bar' ? 'border-primary text-primary' : ''}
                  >
                    <BarChart2 className="h-4 w-4 mr-1" />
                    Balken
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChartType('line')}
                    className={chartType === 'line' ? 'border-primary text-primary' : ''}
                  >
                    <LineChartIcon className="h-4 w-4 mr-1" />
                    Linie
                  </Button>
                </>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!forecastData || !Array.isArray(forecastData) || forecastData.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingForecasts ? (
            <div className="flex justify-center py-20">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Prognosedaten werden geladen...</p>
              </div>
            </div>
          ) : (
            <>
              {activeView === 'chart' ? (
                <>
                  {groupBy === 'day' ? (
                    chartType === 'line' ? renderDayLineChart() : renderDayBarChart()
                  ) : (
                    renderGroupedChart()
                  )}
                  
                  {(!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) && (
                    <div className="text-center py-20 text-muted-foreground">
                      Keine Prognosedaten gefunden. Bitte passen Sie Ihre Filter an.
                    </div>
                  )}
                </>
              ) : (
                renderForecastTable()
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
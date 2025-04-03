import React, { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, addDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { apiRequest } from '@/lib/queryClient';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  CalendarIcon,
  BarChart3Icon,
  LineChartIcon,
  FilterIcon,
  RefreshCw
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';

// Farben für die Diagramme
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff6b6b', '#6a0dad'];

const ForecastEvaluation: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('date');
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 14));
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [isStartDateOpen, setIsStartDateOpen] = useState(false);
  const [isEndDateOpen, setIsEndDateOpen] = useState(false);
  
  // Abrufen der verfügbaren Maschinen
  const { data: machines } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    queryFn: () => apiRequest("get", "/api/machines")
  });
  
  // Abrufen der verfügbaren Produkte
  const { data: products } = useQuery({
    queryKey: ['/api/products'],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    queryFn: () => apiRequest("get", "/api/products")
  });
  
  // Abrufen der verfügbaren Lieferanten
  const { data: suppliers } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    queryFn: () => apiRequest("get", "/api/suppliers")
  });
  
  // Abrufen der verfügbaren Modelle
  const { data: models } = useQuery({
    queryKey: ['/api/forecast/models'],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    gcTime: 24 * 60 * 60 * 1000, // 24 Stunden (ersetzt cacheTime in TanStack Query v5),
    queryFn: () => apiRequest("get", "/api/forecast/models")
  });
  
  // Abrufen der Prognosedaten basierend auf Filtern
  // Vorhersagedaten laden mit React Query
  const queryParams = {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    modelId: selectedModel === 'all' ? undefined : selectedModel,
    machineId: selectedMachine === 'all' ? undefined : selectedMachine,
    productId: selectedProduct === 'all' ? undefined : selectedProduct,
    supplierId: selectedSupplier === 'all' ? undefined : selectedSupplier,
    groupBy: activeTab
  };
  
  // Verwende einen statischen Schlüssel für die Abfrage, um die Stabilität zu verbessern
  const queryKey = React.useMemo(() => 
    ['/api/forecast/evaluation-manual', startDate.toISOString(), endDate.toISOString(), selectedMachine, selectedProduct, selectedModel, selectedSupplier, activeTab],
  [startDate, endDate, selectedMachine, selectedProduct, selectedModel, selectedSupplier, activeTab]);
  
  const {
    data: forecastData,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey,
    staleTime: Infinity, // Keine automatische Invalidierung
    refetchInterval: false, // Kein automatisches Refetching
    refetchOnWindowFocus: false, // Kein Refetching bei Fokuswechsel
    gcTime: 24 * 60 * 60 * 1000, // 24 Stunden (ersetzt cacheTime in TanStack Query v5)
    enabled: false, // Nicht automatisch abrufen beim ersten Rendern
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (queryParams.startDate) params.append('startDate', queryParams.startDate);
      if (queryParams.endDate) params.append('endDate', queryParams.endDate);
      if (queryParams.modelId) params.append('modelId', queryParams.modelId);
      if (queryParams.machineId) params.append('machineId', queryParams.machineId);
      if (queryParams.productId) params.append('productId', queryParams.productId);
      if (queryParams.supplierId) params.append('supplierId', queryParams.supplierId);
      if (queryParams.groupBy) params.append('groupBy', queryParams.groupBy);
      
      return apiRequest("get", `/api/forecast/evaluation?${params.toString()}`);
    }
  });
  
  // Anwenden der Filter (einmalig und nur bei Button-Klick)
  const applyFilters = () => {
    try {
      toast({
        title: "Filter werden angewendet",
        description: `Daten werden für den Zeitraum ${format(startDate, 'dd.MM.yyyy')} bis ${format(endDate, 'dd.MM.yyyy')} geladen...`,
      });
      
      refetch().then(() => {
        // Erfolgsmeldung nur einmal anzeigen
        toast({
          title: "Filter erfolgreich angewendet",
          description: `Daten für den Zeitraum ${format(startDate, 'dd.MM.yyyy')} bis ${format(endDate, 'dd.MM.yyyy')} wurden geladen.`,
        });
      }).catch(error => {
        console.error("Fehler beim Laden der Daten:", error);
        toast({
          title: "Fehler beim Laden der Daten",
          description: "Bitte versuche es später erneut.",
          variant: "destructive"
        });
      });
    } catch (error) {
      console.error("Fehler beim Anwenden der Filter:", error);
      toast({
        title: "Fehler beim Anwenden der Filter",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };
  
  // Format der Daten für die Diagramme anpassen je nach aktivem Tab
  const getChartData = () => {
    // Vor der ersten Filteranwendung oder bei Fehlern leeres Array zurückgeben
    if (!forecastData || !forecastData.data) return [];
    
    try {
      switch (activeTab) {
        case 'date':
          return forecastData.data.map((item: any) => ({
            ...item,
            date: format(new Date(item.date), 'dd.MM'),
            formattedDate: format(new Date(item.date), 'EEEE, dd.MM.yyyy', { locale: de })
          }));
        case 'machine':
          return forecastData.data.map((item: any) => ({
            ...item,
            name: item.machineName || 'Unbekannt'
          }));
        case 'product':
          return forecastData.data.map((item: any) => ({
            ...item,
            name: item.productName || 'Unbekannt'
          }));
        case 'supplier':
          return forecastData.data.map((item: any) => ({
            ...item,
            name: item.supplierName || 'Unbekannt'
          }));
        default:
          return [];
      }
    } catch (error) {
      console.error("Fehler bei der Datenverarbeitung:", error);
      return [];
    }
  };
  
  // Inhalte für die verschiedenen Tabs
  const renderDateTab = () => {
    const data = getChartData();
    
    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-lg">Prognostizierte Verkäufe nach Datum</CardTitle>
              <CardDescription>
                Übersicht der erwarteten Verkäufe für den gewählten Zeitraum
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip 
                    formatter={(value) => [`${value} Stück`, 'Menge']}
                    labelFormatter={(label) => {
                      const item = data.find(d => d.date === label);
                      return item ? item.formattedDate : label;
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="totalQuantity" 
                    name="Prognostizierte Menge" 
                    fill="#8884d8"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card className="flex-1 md:w-1/3">
            <CardHeader>
              <CardTitle className="text-lg">Feiertage im Zeitraum</CardTitle>
              <CardDescription>
                Einfluss von Feiertagen auf Prognosen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.some(item => item.isHoliday) ? (
                  <ul className="space-y-2">
                    {data.filter(item => item.isHoliday).map((holiday, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span>{holiday.formattedDate}: <strong>{holiday.holidayName}</strong></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Keine Feiertage im gewählten Zeitraum.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Täglicher Vertrauensfaktor</CardTitle>
            <CardDescription>
              Vertrauenswert der Prognose (höher = zuverlässiger)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip 
                  formatter={(value) => [`${value}%`, 'Vertrauen']}
                  labelFormatter={(label) => {
                    const item = data.find(d => d.date === label);
                    return item ? item.formattedDate : label;
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="avgConfidence" 
                  name="Vertrauensfaktor" 
                  stroke="#82ca9d" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  const renderMachineTab = () => {
    const data = getChartData();
    
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verkaufsprognose nach Automat</CardTitle>
            <CardDescription>
              Erwartete Verkäufe in den einzelnen Automaten
            </CardDescription>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip formatter={(value) => [`${value} Stück`, 'Menge']} />
                <Legend />
                <Bar 
                  dataKey="totalQuantity" 
                  name="Prognostizierte Menge" 
                  fill="#8884d8"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vertrauensfaktor nach Automat</CardTitle>
              <CardDescription>
                Zuverlässigkeit der Prognose je Automat
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Vertrauen']} />
                  <Bar 
                    dataKey="avgConfidence" 
                    name="Vertrauensfaktor" 
                    fill="#82ca9d"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verteilung nach Automat</CardTitle>
              <CardDescription>
                Prozentualer Anteil an der Gesamtprognose
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="totalQuantity"
                    nameKey="name"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => {
                    const total = data.reduce((sum, item) => sum + item.totalQuantity, 0);
                    const percent = ((value / total) * 100).toFixed(1);
                    return [`${value} Stück (${percent}%)`, props.payload.name];
                  }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };
  
  const renderProductTab = () => {
    const data = getChartData();
    
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verkaufsprognose nach Produkt</CardTitle>
            <CardDescription>
              Erwartete Verkäufe je Produkt
            </CardDescription>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={180} />
                <Tooltip formatter={(value) => [`${value} Stück`, 'Menge']} />
                <Legend />
                <Bar 
                  dataKey="totalQuantity" 
                  name="Prognostizierte Menge" 
                  fill="#FFBB28"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 Produkte</CardTitle>
              <CardDescription>
                Die am meisten verkauften Produkte
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name.slice(0, 20)}${name.length > 20 ? '...' : ''} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="totalQuantity"
                    nameKey="name"
                  >
                    {data.slice(0, 5).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => {
                    const total = data.slice(0, 5).reduce((sum, item) => sum + item.totalQuantity, 0);
                    const percent = ((value / total) * 100).toFixed(1);
                    return [`${value} Stück (${percent}%)`, props.payload.name];
                  }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Produkte nach Lieferant</CardTitle>
              <CardDescription>
                Verteilung der Produkte nach Lieferant
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.reduce((result: any[], item) => {
                  const existingSupplier = result.find(supplier => supplier.name === item.supplierName);
                  if (existingSupplier) {
                    existingSupplier.totalQuantity += item.totalQuantity;
                  } else {
                    result.push({
                      name: item.supplierName || 'Unbekannt',
                      totalQuantity: item.totalQuantity
                    });
                  }
                  return result;
                }, [])}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${value} Stück`, 'Menge']} />
                  <Bar 
                    dataKey="totalQuantity" 
                    name="Prognostizierte Menge" 
                    fill="#FF8042"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };
  
  const renderSupplierTab = () => {
    const data = getChartData();
    
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verkaufsprognose nach Lieferant</CardTitle>
            <CardDescription>
              Erwartete Verkäufe je Lieferant
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip formatter={(value) => [`${value} Stück`, 'Menge']} />
                <Legend />
                <Bar 
                  dataKey="totalQuantity" 
                  name="Prognostizierte Menge" 
                  fill="#00C49F"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="productsCount" 
                  name="Anzahl Produkte" 
                  fill="#0088FE"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lieferantenverteilung</CardTitle>
              <CardDescription>
                Anteil der Lieferanten an der Gesamtprognose
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="totalQuantity"
                    nameKey="name"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => {
                    const total = data.reduce((sum, item) => sum + item.totalQuantity, 0);
                    const percent = ((value / total) * 100).toFixed(1);
                    return [`${value} Stück (${percent}%)`, props.payload.name];
                  }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Durchschnittliche Menge pro Produkt</CardTitle>
              <CardDescription>
                Verkaufte Menge pro Produkt je Lieferant
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={data.map(supplier => ({
                    name: supplier.name,
                    avgPerProduct: supplier.productsCount > 0 
                      ? supplier.totalQuantity / supplier.productsCount 
                      : 0
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${parseFloat(value).toFixed(1)} Stück`, 'Ø pro Produkt']} />
                  <Bar 
                    dataKey="avgPerProduct" 
                    name="Ø pro Produkt" 
                    fill="#8884d8"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Hauptkomponente
  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Nichts (keine Suche erforderlich) */}
        <div className="flex-grow">
        </div>
        
        {/* Rechte Seite: Aktionsbuttons */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  size="sm"
                  className="h-9"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aktualisieren
                </Button>
              </TooltipTrigger>
              <TooltipContent>Daten neu laden</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter und Auswertungsoptionen</CardTitle>
          <CardDescription>
            Wähle Zeitraum und weitere Filter für die Prognoseauswertung
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <Popover open={isStartDateOpen} onOpenChange={setIsStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="startDate"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        setIsStartDateOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">Enddatum</Label>
              <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="endDate"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      if (date) {
                        setEndDate(date);
                        setIsEndDateOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="modelSelect">Prognosemodell</Label>
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
              >
                <SelectTrigger id="modelSelect">
                  <SelectValue placeholder="Alle Modelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Modelle</SelectItem>
                  {models && Array.isArray(models) && models.map((model: any) => (
                    <SelectItem key={model.id} value={model.id.toString()}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="machineSelect">Automat</Label>
              <Select
                value={selectedMachine}
                onValueChange={setSelectedMachine}
              >
                <SelectTrigger id="machineSelect">
                  <SelectValue placeholder="Alle Automaten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Automaten</SelectItem>
                  {machines && Array.isArray(machines) && machines.map((machine: any) => (
                    <SelectItem key={machine.id} value={machine.id.toString()}>
                      {machine.machineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="productSelect">Produkt</Label>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger id="productSelect">
                  <SelectValue placeholder="Alle Produkte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Produkte</SelectItem>
                  {products && products.data && products.data.map((product: any) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="supplierSelect">Lieferant</Label>
              <Select
                value={selectedSupplier}
                onValueChange={setSelectedSupplier}
              >
                <SelectTrigger id="supplierSelect">
                  <SelectValue placeholder="Alle Lieferanten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lieferanten</SelectItem>
                  {suppliers && suppliers.data && suppliers.data.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={applyFilters} className="w-full">
                <FilterIcon className="mr-2 h-4 w-4" />
                Filter anwenden
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="date" className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4" />
            <span>Nach Datum</span>
          </TabsTrigger>
          <TabsTrigger value="machine" className="flex items-center gap-2">
            <BarChart3Icon className="h-4 w-4" />
            <span>Nach Automat</span>
          </TabsTrigger>
          <TabsTrigger value="product" className="flex items-center gap-2">
            <BarChart3Icon className="h-4 w-4" />
            <span>Nach Produkt</span>
          </TabsTrigger>
          <TabsTrigger value="supplier" className="flex items-center gap-2">
            <BarChart3Icon className="h-4 w-4" />
            <span>Nach Lieferant</span>
          </TabsTrigger>
        </TabsList>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : isError ? (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mt-4">
            <h3 className="font-bold">Fehler beim Laden der Daten</h3>
            <p>Bitte versuche es später erneut oder wähle andere Filter.</p>
          </div>
        ) : forecastData === undefined ? (
          <div className="bg-blue-50 text-blue-600 p-6 rounded-md mt-4 flex flex-col items-center justify-center gap-4">
            <p className="font-semibold text-center text-lg">Bitte wähle deine Filter aus und klicke auf "Filter anwenden"</p>
            <p className="text-center">Wähle einen Zeitraum und optional weitere Filter, um die Prognoseauswertung zu starten.</p>
            <Button 
              onClick={applyFilters} 
              size="lg"
              className="mt-2"
            >
              <FilterIcon className="mr-2 h-4 w-4" />
              Filter jetzt anwenden
            </Button>
          </div>
        ) : (
          <>
            <TabsContent value="date">
              {renderDateTab()}
            </TabsContent>
            
            <TabsContent value="machine">
              {renderMachineTab()}
            </TabsContent>
            
            <TabsContent value="product">
              {renderProductTab()}
            </TabsContent>
            
            <TabsContent value="supplier">
              {renderSupplierTab()}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default ForecastEvaluation;
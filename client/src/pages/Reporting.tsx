import React, { useState, Suspense, useMemo } from "react";
import {
  RefreshCw,
  Building,
  Package,
  ShoppingBag,
  Truck,
  Database,
  Loader2,
  Calendar,
  DollarSign,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Clock,
  BarChart2,
  PieChart,
  LineChart,
  TrendingUp,
  Percent
} from "lucide-react";
// Relative Pfade verwenden statt Aliasnamen, um NPM-Probleme zu vermeiden
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { toast } from "../hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useQuery, QueryClient } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';

// Typdefinitionen für die API-Antworten
interface DatabaseStatisticsResponse {
  transactions: number;
  openOrders: number;
  products: number;
  machines: number;
  suppliers: number;
  lastUpdated: string;
}

interface TransactionDataResponse {
  total: number;
  average: number;
  todayCount: number;
  todayRevenue: number;
  weekCount: number;
  weekRevenue: number;
  monthCount: number;
  monthRevenue: number;
  comparisonToPreviousPeriod: number;
  byDay: Array<{date: string; count: number; revenue: number}>;
  byMachine: Array<{machineId: number; machineName: string; count: number; revenue: number}>;
  byProduct: Array<{productId: number; productName: string; count: number; revenue: number}>;
  paymentMethods: {
    cash: number;
    card: number;
    cashless: number;
  };
}

interface SalesComparisonItem {
  label: string;
  current: number;
  previous: number;
  percentChange: number;
}

// Hilfsfunktion für Prozentberechnung
const calculatePercentChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
};

// Komponente für den Ladeindikator
function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center h-24">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Komponente für Fehlermeldungen
function ErrorDisplay({ error }: { error: Error }) {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-500">Fehler beim Laden der Daten</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{error.message}</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Neu laden
        </Button>
      </CardContent>
    </Card>
  );
}

// KPI-Karten für die Übersicht
function KpiCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  suffix = "", 
  loading = false 
}: { 
  title: string, 
  value: string | number, 
  change: number, 
  icon: React.ElementType, 
  suffix?: string,
  loading?: boolean
}) {
  const isPositive = change >= 0;
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingIndicator />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}{suffix}</div>
            <p className={`text-xs flex items-center ${isPositive ? 'text-green-500' : 'text-red-500'} mt-1`}>
              {isPositive ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 mr-1" />
              )}
              <span>{Math.abs(change)}% im Vgl. zum Vorzeitraum</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Datenbank-Statistiken Tab
function DatabaseStatistics() {
  // Einfache Statistiken aus der Datenbank laden
  const { data, error, isLoading, isError } = useQuery<DatabaseStatisticsResponse>({
    queryKey: ['/api/statistics/database'],
    staleTime: 5 * 60 * 1000 // 5 Minuten Caching
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError) return <ErrorDisplay error={error as Error} />;
  if (!data) return <ErrorDisplay error={new Error('Keine Daten erhalten')} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Database className="h-4 w-4 mr-2 text-muted-foreground" />
              Transaktionen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.transactions.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <ShoppingBag className="h-4 w-4 mr-2 text-muted-foreground" />
              Offene Bestellungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.openOrders.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Package className="h-4 w-4 mr-2 text-muted-foreground" />
              Produkte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.products.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Building className="h-4 w-4 mr-2 text-muted-foreground" />
              Automaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.machines.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
              Lieferanten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.suppliers.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Datenbankstatistiken</CardTitle>
          <CardDescription>
            Letzte Aktualisierung: {format(new Date(data.lastUpdated), 'dd.MM.yyyy HH:mm')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Diese Ansicht zeigt die aktuellen Datenmengen in unserer Datenbank.
            Die Auswertungen werden direkt aus der Datenbank geladen, ohne externe APIs zu verwenden,
            um eine maximale Leistung und Stabilität zu gewährleisten.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Erweiterte Typdefinition für die Verkaufsdaten-Antwort
interface SalesDataResponse {
  currentPeriod: {
    startDate: string;
    endDate: string;
    transactions: number;
    revenue: number;
    avgValue: number;
    profit: number;
  };
  previousPeriod: {
    startDate: string;
    endDate: string;
    transactions: number;
    revenue: number;
    avgValue: number;
    profit: number;
  };
  topMachines: Array<{
    machineId: string | number;
    machineName: string;
    count: number;
    revenue: number;
    avgValue: number;
  }>;
  topProducts: Array<{
    productName: string;
    count: number;
    revenue: number;
  }>;
  paymentMethods: {
    cash: number;
    card: number;
    cashless: number;
    other: number;
  };
  hourlyDistribution: Array<{
    hour: number;
    count: number;
    revenue: number;
  }>;
  metadata: {
    period: string;
    lastUpdated: string;
  };
}

// Komponente für die Umsatzübersicht
function SalesOverview() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('week');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  // Echte Daten aus dem Backend laden
  const { data, error, isLoading, isError, refetch } = useQuery<SalesDataResponse>({
    queryKey: ['/api/statistics/sales', period, customDateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ period: period as string });
      
      if (period === 'custom') {
        params.append('startDate', customDateRange.startDate);
        params.append('endDate', customDateRange.endDate);
      }
      
      const response = await fetch(`/api/statistics/sales?${params.toString()}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Verkaufsdaten');
      return response.json();
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten Caching
  });
  
  // Abgeleitete Daten für KPI-Karten berechnen
  const salesData = useMemo(() => {
    if (!data) return null;
    
    return {
      revenue: {
        value: data.currentPeriod.revenue.toFixed(2),
        change: calculatePercentChange(data.currentPeriod.revenue, data.previousPeriod.revenue)
      },
      transactions: {
        value: data.currentPeriod.transactions,
        change: calculatePercentChange(data.currentPeriod.transactions, data.previousPeriod.transactions)
      },
      avgValue: {
        value: data.currentPeriod.avgValue.toFixed(2),
        change: calculatePercentChange(data.currentPeriod.avgValue, data.previousPeriod.avgValue)
      },
      profit: {
        value: data.currentPeriod.profit.toFixed(2),
        change: calculatePercentChange(data.currentPeriod.profit, data.previousPeriod.profit)
      }
    };
  }, [data]);
  
  // Anzeige-Texte für Zeiträume
  const periodText = useMemo(() => {
    switch(period) {
      case 'day': return 'Heute';
      case 'week': return 'Diese Woche';
      case 'month': return 'Dieser Monat';
      case 'custom': return 'Gewählter Zeitraum';
      default: return '';
    }
  }, [period]);
  
  const dateRangeText = useMemo(() => {
    if (data) {
      const startDate = new Date(data.currentPeriod.startDate);
      const endDate = new Date(data.currentPeriod.endDate);
      return `${format(startDate, 'dd.MM.')} - ${format(endDate, 'dd.MM.yyyy')}`;
    }
    
    // Fallback, wenn keine Daten verfügbar sind
    const today = new Date();
    
    switch(period) {
      case 'day':
        return format(today, 'dd.MM.yyyy');
      case 'week': {
        const weekStart = startOfWeek(today, { locale: de, weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { locale: de, weekStartsOn: 1 });
        return `${format(weekStart, 'dd.MM.')} - ${format(weekEnd, 'dd.MM.yyyy')}`;
      }
      case 'month': {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return `${format(monthStart, 'dd.MM.')} - ${format(monthEnd, 'dd.MM.yyyy')}`;
      }
      case 'custom':
        return `${format(new Date(customDateRange.startDate), 'dd.MM.')} - ${format(new Date(customDateRange.endDate), 'dd.MM.yyyy')}`;
      default:
        return '';
    }
  }, [period, data, customDateRange]);
  
  // Verarbeitung von benutzerdefiniertem Zeitraum
  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setCustomDateRange(prev => ({ 
      ...prev, 
      [type === 'start' ? 'startDate' : 'endDate']: value 
    }));
  };
  
  // Aktualisieren bei Änderung des benutzerdefinierten Zeitraums
  React.useEffect(() => {
    if (period === 'custom') {
      refetch();
    }
  }, [customDateRange, period, refetch]);
  
  if (isLoading) return <LoadingIndicator />;
  if (isError) return <ErrorDisplay error={error as Error} />;
  if (!data || !salesData) return <ErrorDisplay error={new Error('Keine Daten erhalten')} />;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Umsatzübersicht</h2>
          <p className="text-muted-foreground">{periodText} ({dateRangeText})</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          {period === 'custom' && (
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                max={customDateRange.endDate}
              />
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                min={customDateRange.startDate}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}
          
          <Select value={period} onValueChange={(val) => setPeriod(val as 'day' | 'week' | 'month' | 'custom')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Zeitraum wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Heute</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Dieser Monat</SelectItem>
              <SelectItem value="custom">Zeitraum wählen...</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Gesamtumsatz"
          value={salesData.revenue.value}
          change={salesData.revenue.change}
          icon={DollarSign}
          suffix=" €"
        />
        
        <KpiCard 
          title="Transaktionen"
          value={salesData.transactions.value}
          change={salesData.transactions.change}
          icon={ShoppingBag}
        />
        
        <KpiCard 
          title="Ø Transaktionswert"
          value={salesData.avgValue.value}
          change={salesData.avgValue.change}
          icon={CreditCard}
          suffix=" €"
        />
        
        <KpiCard 
          title="Profitabilität"
          value={salesData.profit.value}
          change={salesData.profit.change}
          icon={Percent}
          suffix=" €"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart2 className="h-5 w-5 mr-2 text-muted-foreground" />
              Top Produkte
            </CardTitle>
            <CardDescription>Meistverkaufte Produkte nach Umsatz</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topProducts.map((product, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium">{index + 1}</span>
                  </div>
                  <div className="ml-3 flex-grow">
                    <div className="text-sm font-medium text-wrap">{product.productName}</div>
                    <div className="text-xs text-muted-foreground">{product.count} Verkäufe</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{product.revenue.toFixed(2)} €</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2 text-muted-foreground" />
              Top Automaten
            </CardTitle>
            <CardDescription>Umsatzstärkste Automaten im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topMachines.map((machine, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium">{index + 1}</span>
                  </div>
                  <div className="ml-3 flex-grow">
                    <div className="text-sm font-medium text-wrap">{machine.machineName}</div>
                    <div className="text-xs text-muted-foreground">
                      {machine.count} Transaktionen • Ø {machine.avgValue.toFixed(2)} €
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{machine.revenue.toFixed(2)} €</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
              Tagesverteilung
            </CardTitle>
            <CardDescription>Umsatzverteilung nach Tageszeit</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            {data.hourlyDistribution.length > 0 ? (
              <div className="h-[300px] flex items-end gap-1">
                {data.hourlyDistribution.map((hour) => {
                  // Maximaler Umsatz für die Skalierung
                  const maxRevenue = Math.max(...data.hourlyDistribution.map(h => h.revenue));
                  // Minimaler Wert 5% für Sichtbarkeit
                  const heightPercent = maxRevenue ? Math.max(5, (hour.revenue / maxRevenue) * 100) : 5;
                  
                  return (
                    <div 
                      key={hour.hour} 
                      className="flex-1 flex flex-col items-center"
                    >
                      <div className="w-full text-xs text-center mb-1 text-muted-foreground">
                        {hour.revenue > 0 ? `${hour.revenue.toFixed(0)}€` : ''}
                      </div>
                      <div 
                        className="w-full bg-primary/20 rounded-t-sm hover:bg-primary/30 transition-all group relative"
                        style={{ height: `${heightPercent}%` }}
                      >
                        {hour.revenue > 0 && (
                          <div className="invisible group-hover:visible bg-black/75 text-white text-xs p-1 rounded absolute -mt-6 ml-2">
                            {hour.count} Trans. • {hour.revenue.toFixed(2)}€
                          </div>
                        )}
                      </div>
                      <div className="w-full text-xs text-center mt-1">
                        {hour.hour}h
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground text-center">
                  Keine Daten für diesen Zeitraum verfügbar
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-muted-foreground" />
              Zahlungsmethoden
            </CardTitle>
            <CardDescription>Umsatzverteilung nach Zahlungsart</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="h-[300px] flex flex-col justify-center">
              {Object.entries(data.paymentMethods).some(([_, value]) => value > 0) ? (
                <div className="space-y-6">
                  {Object.entries(data.paymentMethods).map(([key, value]) => {
                    if (value <= 0) return null;
                    const totalRevenue = Object.values(data.paymentMethods).reduce((sum, val) => sum + val, 0);
                    const percentage = totalRevenue ? (value / totalRevenue) * 100 : 0;
                    
                    // Icon je nach Zahlungsmethode
                    const getIcon = () => {
                      switch(key) {
                        case 'cash': return <DollarSign className="h-4 w-4 mr-1 text-green-500" />;
                        case 'card': return <CreditCard className="h-4 w-4 mr-1 text-blue-500" />;
                        case 'cashless': return <CreditCard className="h-4 w-4 mr-1 text-purple-500" />;
                        default: return <CreditCard className="h-4 w-4 mr-1 text-gray-500" />;
                      }
                    };
                    
                    // Bezeichnung je nach Zahlungsmethode
                    const getLabel = () => {
                      switch(key) {
                        case 'cash': return 'Bargeld';
                        case 'card': return 'Karte';
                        case 'cashless': return 'Bargeldlos';
                        default: return 'Andere';
                      }
                    };
                    
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <div className="flex items-center">
                            {getIcon()}
                            {getLabel()}
                          </div>
                          <div className="font-medium">{value.toFixed(2)} € ({percentage.toFixed(1)}%)</div>
                        </div>
                        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              key === 'cash' ? 'bg-green-500' : 
                              key === 'card' ? 'bg-blue-500' : 
                              key === 'cashless' ? 'bg-purple-500' : 'bg-gray-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    Keine Daten für diesen Zeitraum verfügbar
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Komponente für die Automatenanalyse
function MachineAnalysis() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('week');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  // Echte Daten aus dem Backend laden
  const { data, error, isLoading, isError, refetch } = useQuery<SalesDataResponse>({
    queryKey: ['/api/statistics/sales', period, customDateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ period: period as string });
      
      if (period === 'custom') {
        params.append('startDate', customDateRange.startDate);
        params.append('endDate', customDateRange.endDate);
      }
      
      const response = await fetch(`/api/statistics/sales?${params.toString()}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Verkaufsdaten');
      return response.json();
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten Caching
  });
  
  // Abgeleitete Daten für Zeitraumanzeige
  const periodText = useMemo(() => {
    switch(period) {
      case 'day': return 'Heute';
      case 'week': return 'Diese Woche';
      case 'month': return 'Dieser Monat';
      case 'custom': return 'Gewählter Zeitraum';
      default: return '';
    }
  }, [period]);
  
  const dateRangeText = useMemo(() => {
    if (data) {
      const startDate = new Date(data.currentPeriod.startDate);
      const endDate = new Date(data.currentPeriod.endDate);
      return `${format(startDate, 'dd.MM.')} - ${format(endDate, 'dd.MM.yyyy')}`;
    }
    
    // Fallback
    const today = new Date();
    
    switch(period) {
      case 'day':
        return format(today, 'dd.MM.yyyy');
      case 'week': {
        const weekStart = startOfWeek(today, { locale: de, weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { locale: de, weekStartsOn: 1 });
        return `${format(weekStart, 'dd.MM.')} - ${format(weekEnd, 'dd.MM.yyyy')}`;
      }
      case 'month': {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return `${format(monthStart, 'dd.MM.')} - ${format(monthEnd, 'dd.MM.yyyy')}`;
      }
      case 'custom':
        return `${format(new Date(customDateRange.startDate), 'dd.MM.')} - ${format(new Date(customDateRange.endDate), 'dd.MM.yyyy')}`;
      default:
        return '';
    }
  }, [period, data, customDateRange]);
  
  // Verarbeitung von benutzerdefiniertem Zeitraum
  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setCustomDateRange(prev => ({ 
      ...prev, 
      [type === 'start' ? 'startDate' : 'endDate']: value 
    }));
  };
  
  // Aktualisieren bei Änderung des benutzerdefinierten Zeitraums
  React.useEffect(() => {
    if (period === 'custom') {
      refetch();
    }
  }, [customDateRange, period, refetch]);
  
  if (isLoading) return <LoadingIndicator />;
  if (isError) return <ErrorDisplay error={error as Error} />;
  if (!data) return <ErrorDisplay error={new Error('Keine Daten erhalten')} />;
  
  // Hier können wir mit den echten Daten arbeiten
  const topMachines = data.topMachines;
  const machineStats = topMachines.reduce(
    (acc, machine) => {
      acc.totalRevenue += machine.revenue;
      acc.totalTransactions += machine.count;
      return acc;
    },
    { totalRevenue: 0, totalTransactions: 0 }
  );
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Automatenanalyse</h2>
          <p className="text-muted-foreground">{periodText} ({dateRangeText})</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          {period === 'custom' && (
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                max={customDateRange.endDate}
              />
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                min={customDateRange.startDate}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}
          
          <Select value={period} onValueChange={(val) => setPeriod(val as 'day' | 'week' | 'month' | 'custom')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Zeitraum wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Heute</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Dieser Monat</SelectItem>
              <SelectItem value="custom">Zeitraum wählen...</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* KPI-Karten für Gesamtübersicht */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Building className="h-4 w-4 mr-2 text-muted-foreground" />
              Automaten mit Umsatz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topMachines.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
              Gesamtumsatz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{machineStats.totalRevenue.toFixed(2)} €</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <ShoppingBag className="h-4 w-4 mr-2 text-muted-foreground" />
              Transaktionen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{machineStats.totalTransactions}</div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2 text-muted-foreground" />
              Top Automaten
            </CardTitle>
            <CardDescription>Nach Umsatz im ausgewählten Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            {topMachines.length > 0 ? (
              <div className="space-y-4">
                {topMachines.map((machine, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium">{index + 1}</span>
                    </div>
                    <div className="ml-3 flex-grow">
                      <div className="text-sm font-medium text-wrap">{machine.machineName}</div>
                      <div className="flex text-xs text-muted-foreground space-x-2">
                        <span>{machine.count} Transaktionen</span>
                        <span>•</span>
                        <span>Ø {machine.avgValue.toFixed(2)} €</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{machine.revenue.toFixed(2)} €</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Keine Daten für diesen Zeitraum verfügbar
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-muted-foreground" />
              Umsatzverteilung
            </CardTitle>
            <CardDescription>Anteil am Gesamtumsatz im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            {topMachines.length > 0 ? (
              <div className="space-y-4">
                {topMachines.map((machine, index) => {
                  const percentage = (machine.revenue / machineStats.totalRevenue) * 100;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <div className="font-medium">{machine.machineName}</div>
                        <div className="text-muted-foreground">{percentage.toFixed(1)}%</div>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {machine.revenue.toFixed(2)} € / {machine.count} Trans.
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Keine Daten für diesen Zeitraum verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Stündliche Auslastung</CardTitle>
          <CardDescription>Transaktionen nach Tageszeit</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          {data.hourlyDistribution.length > 0 ? (
            <div className="h-[300px] flex items-end gap-1">
              {data.hourlyDistribution.map((hour) => {
                // Maximaler Count für die Skalierung
                const maxCount = Math.max(...data.hourlyDistribution.map(h => h.count));
                // Minimaler Wert 5% für Sichtbarkeit
                const heightPercent = maxCount ? Math.max(5, (hour.count / maxCount) * 100) : 5;
                
                return (
                  <div 
                    key={hour.hour} 
                    className="flex-1 flex flex-col items-center"
                  >
                    <div className="w-full text-xs text-center mb-1 text-muted-foreground">
                      {hour.count > 0 ? hour.count : ''}
                    </div>
                    <div 
                      className="w-full bg-primary/20 rounded-t-sm hover:bg-primary/30 transition-all group relative"
                      style={{ height: `${heightPercent}%` }}
                    >
                      {hour.count > 0 && (
                        <div className="invisible group-hover:visible bg-black/75 text-white text-xs p-1 rounded absolute -mt-6 ml-2">
                          {hour.count} Trans. • {hour.revenue.toFixed(2)}€
                        </div>
                      )}
                    </div>
                    <div className="w-full text-xs text-center mt-1">
                      {hour.hour}h
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Keine Daten für diesen Zeitraum verfügbar
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Komponente für die Produktanalyse
function ProductAnalysis() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('week');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });
  
  // Echte Daten aus dem Backend laden
  const { data, error, isLoading, isError, refetch } = useQuery<SalesDataResponse>({
    queryKey: ['/api/statistics/sales', period, customDateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ period: period as string });
      
      if (period === 'custom') {
        params.append('startDate', customDateRange.startDate);
        params.append('endDate', customDateRange.endDate);
      }
      
      const response = await fetch(`/api/statistics/sales?${params.toString()}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Verkaufsdaten');
      return response.json();
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten Caching
  });
  
  // Anzeige-Texte für Zeiträume
  const periodText = useMemo(() => {
    switch(period) {
      case 'day': return 'Heute';
      case 'week': return 'Diese Woche';
      case 'month': return 'Dieser Monat';
      case 'custom': return 'Gewählter Zeitraum';
      default: return '';
    }
  }, [period]);
  
  const dateRangeText = useMemo(() => {
    if (data) {
      const startDate = new Date(data.currentPeriod.startDate);
      const endDate = new Date(data.currentPeriod.endDate);
      return `${format(startDate, 'dd.MM.')} - ${format(endDate, 'dd.MM.yyyy')}`;
    }
    
    // Fallback, wenn keine Daten verfügbar sind
    const today = new Date();
    
    switch(period) {
      case 'day':
        return format(today, 'dd.MM.yyyy');
      case 'week': {
        const weekStart = startOfWeek(today, { locale: de, weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { locale: de, weekStartsOn: 1 });
        return `${format(weekStart, 'dd.MM.')} - ${format(weekEnd, 'dd.MM.yyyy')}`;
      }
      case 'month': {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return `${format(monthStart, 'dd.MM.')} - ${format(monthEnd, 'dd.MM.yyyy')}`;
      }
      case 'custom':
        return `${format(new Date(customDateRange.startDate), 'dd.MM.')} - ${format(new Date(customDateRange.endDate), 'dd.MM.yyyy')}`;
      default:
        return '';
    }
  }, [period, data, customDateRange]);
  
  // Verarbeitung von benutzerdefiniertem Zeitraum
  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setCustomDateRange(prev => ({ 
      ...prev, 
      [type === 'start' ? 'startDate' : 'endDate']: value 
    }));
  };
  
  // Aktualisieren bei Änderung des benutzerdefinierten Zeitraums
  React.useEffect(() => {
    if (period === 'custom') {
      refetch();
    }
  }, [customDateRange, period, refetch]);
  
  // Kategorie-Filter (auf Basis von Produktnamen)
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Kategorie-Extraktion aus Produktnamen
  const extractCategories = useMemo(() => {
    if (!data?.topProducts) return ['all'];
    
    const categoryMap = new Map<string, number>();
    categoryMap.set('all', 0);
    
    data.topProducts.forEach(product => {
      // Extrahiere Kategorie aus dem Produktnamen (in Klammern, wenn vorhanden)
      let category = 'Andere';
      
      // Versuche Kategorie aus dem Namen zu extrahieren
      const match = product.productName.match(/\(([^)]+)\)/);
      if (match) {
        category = match[1].trim();
        // Prüfe auf spezielle Tags wie [Bergkäse], [Vegan], etc.
        const tagMatch = category.match(/\[([^\]]+)\]/);
        if (tagMatch) {
          category = tagMatch[1].trim();
        }
      } else if (product.productName.includes('PET') || product.productName.includes('Naturell')) {
        category = 'Wasser';
      } else if (product.productName.includes('Cola') || product.productName.includes('brause')) {
        category = 'Getränke';
      } else if (product.productName.includes('Bemmchen') || product.productName.includes('Milch')) {
        category = 'Lebensmittel';
      }
      
      // Aktualisiere Zählung
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      categoryMap.set('all', categoryMap.get('all')! + 1);
    });
    
    // Konvertiere Map zu Array und sortiere nach Häufigkeit
    return Array.from(categoryMap.keys())
      .filter(cat => categoryMap.get(cat)! > 0)
      .sort((a, b) => {
        if (a === 'all') return -1;
        if (b === 'all') return 1;
        return (categoryMap.get(b) || 0) - (categoryMap.get(a) || 0);
      });
  }, [data?.topProducts]);
  
  // Produkte nach Kategorie filtern
  const filteredProducts = useMemo(() => {
    if (!data?.topProducts) return [];
    
    if (selectedCategory === 'all') return data.topProducts;
    
    return data.topProducts.filter(product => {
      const match = product.productName.match(/\(([^)]+)\)/);
      let category = 'Andere';
      
      if (match) {
        category = match[1].trim();
        // Prüfe auf spezielle Tags
        const tagMatch = category.match(/\[([^\]]+)\]/);
        if (tagMatch) {
          category = tagMatch[1].trim();
        }
      } else if (product.productName.includes('PET') || product.productName.includes('Naturell')) {
        category = 'Wasser';
      } else if (product.productName.includes('Cola') || product.productName.includes('brause')) {
        category = 'Getränke';
      } else if (product.productName.includes('Bemmchen') || product.productName.includes('Milch')) {
        category = 'Lebensmittel';
      }
      
      return category === selectedCategory;
    });
  }, [data?.topProducts, selectedCategory]);
  
  if (isLoading) return <LoadingIndicator />;
  if (isError) return <ErrorDisplay error={error as Error} />;
  if (!data) return <ErrorDisplay error={new Error('Keine Daten erhalten')} />;
  
  // Produktstatistiken
  const productStats = {
    totalRevenue: data.topProducts.reduce((sum, product) => sum + product.revenue, 0),
    totalSales: data.topProducts.reduce((sum, product) => sum + product.count, 0)
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Produktanalyse</h2>
          <p className="text-muted-foreground">{periodText} ({dateRangeText})</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          {period === 'custom' && (
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                max={customDateRange.endDate}
              />
              <input
                type="date"
                className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={customDateRange.endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                min={customDateRange.startDate}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}
          
          <Select value={period} onValueChange={(val) => setPeriod(val as 'day' | 'week' | 'month' | 'custom')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Zeitraum wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Heute</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Dieser Monat</SelectItem>
              <SelectItem value="custom">Zeitraum wählen...</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Übersichtskarten */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Package className="h-4 w-4 mr-2 text-muted-foreground" />
              Verkaufte Produkte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productStats.totalSales}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
              Umsatz Produkte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productStats.totalRevenue.toFixed(2)} €</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-muted-foreground" />
              Ø Preis pro Produkt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(productStats.totalSales > 0 
                ? productStats.totalRevenue / productStats.totalSales 
                : 0).toFixed(2)} €
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h3 className="text-xl font-semibold">Top Produkte nach Umsatz</h3>
        
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie wählen" />
          </SelectTrigger>
          <SelectContent>
            {extractCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category === 'all' ? 'Alle Kategorien' : category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="h-5 w-5 mr-2 text-muted-foreground" />
              Top Produkte
            </CardTitle>
            <CardDescription>Nach Umsatz im gewählten Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredProducts.length > 0 ? (
              <div className="space-y-4">
                {filteredProducts.map((product, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium">{index + 1}</span>
                    </div>
                    <div className="ml-3 flex-grow">
                      <div className="text-sm font-medium text-wrap">{product.productName}</div>
                      <div className="text-xs text-muted-foreground">{product.count} Verkäufe</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{product.revenue.toFixed(2)} €</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Keine Daten für diese Kategorie oder diesen Zeitraum verfügbar
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="h-5 w-5 mr-2 text-muted-foreground" />
              Umsatzverteilung
            </CardTitle>
            <CardDescription>Anteil am Gesamtumsatz im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredProducts.length > 0 ? (
              <div className="space-y-4">
                {filteredProducts.slice(0, 5).map((product, index) => {
                  const percentage = (product.revenue / productStats.totalRevenue) * 100;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <div className="font-medium text-wrap flex-grow">{product.productName}</div>
                        <div className="text-muted-foreground ml-2">{percentage.toFixed(1)}%</div>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {product.revenue.toFixed(2)} € / {product.count} Stk.
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Keine Daten für diese Kategorie oder diesen Zeitraum verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Stündliche Verkäufe</CardTitle>
          <CardDescription>Produktverkäufe nach Tageszeit</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          {data.hourlyDistribution.length > 0 ? (
            <div className="h-[300px] flex items-end gap-1">
              {data.hourlyDistribution.map((hour) => {
                // Maximaler Count für die Skalierung
                const maxCount = Math.max(...data.hourlyDistribution.map(h => h.count));
                // Minimaler Wert 5% für Sichtbarkeit
                const heightPercent = maxCount ? Math.max(5, (hour.count / maxCount) * 100) : 5;
                
                return (
                  <div 
                    key={hour.hour} 
                    className="flex-1 flex flex-col items-center"
                  >
                    <div className="w-full text-xs text-center mb-1 text-muted-foreground">
                      {hour.count > 0 ? hour.count : ''}
                    </div>
                    <div 
                      className="w-full bg-primary/20 rounded-t-sm hover:bg-primary/30 transition-all group relative"
                      style={{ height: `${heightPercent}%` }}
                    >
                      {hour.count > 0 && (
                        <div className="invisible group-hover:visible bg-black/75 text-white text-xs p-1 rounded absolute -mt-6 ml-2">
                          {hour.count} Verkäufe • {hour.revenue.toFixed(2)}€
                        </div>
                      )}
                    </div>
                    <div className="w-full text-xs text-center mt-1">
                      {hour.hour}h
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Keine Daten für diesen Zeitraum verfügbar
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Optimierte, erweiterte Reporting-Komponente
export default function Reporting() {
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = new QueryClient();
  
  // Funktion für UI-Feedback und Datenaktualisierung
  const refreshData = () => {
    // Alle relevanten Queries ungültig machen
    queryClient.invalidateQueries({ queryKey: ['/api/statistics/database'] });
    
    toast({
      title: "Daten werden aktualisiert",
      description: "Die Statistiken werden neu geladen.",
    });
  };
  
  // Das aktuelle Datum für den Header
  const today = new Date();
  const formattedDate = format(today, 'dd.MM.yyyy');
  
  return (
    <div className="space-y-6">
      {/* Header mit Datum und Refresh-Button */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-grow">
          <h1 className="text-2xl font-bold">Auswertungen</h1>
          <p className="text-muted-foreground">Umsatz- und Statistikanalysen</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs h-7 px-2 py-1">
            <Calendar className="h-3 w-3 mr-1" />
            Stand: {formattedDate}
          </Badge>
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={refreshData}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Erweiterte Tabs für verschiedene Statistiksichten */}
      <Tabs defaultValue="overview" onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart2 className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="machines" className="flex items-center gap-1">
            <Building className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Automaten</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-1">
            <Package className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Produkte</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-1">
            <Database className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Datenbank</span>
          </TabsTrigger>
        </TabsList>
      
        {/* Übersichts-Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Suspense fallback={<LoadingIndicator />}>
            <SalesOverview />
          </Suspense>
        </TabsContent>
        
        {/* Automaten-Tab */}
        <TabsContent value="machines" className="space-y-6">
          <Suspense fallback={<LoadingIndicator />}>
            <MachineAnalysis />
          </Suspense>
        </TabsContent>
        
        {/* Produkte-Tab */}
        <TabsContent value="products" className="space-y-6">
          <Suspense fallback={<LoadingIndicator />}>
            <ProductAnalysis />
          </Suspense>
        </TabsContent>
        
        {/* Datenbank-Statistiken Tab */}
        <TabsContent value="database" className="space-y-6">
          <Suspense fallback={<LoadingIndicator />}>
            <DatabaseStatistics />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
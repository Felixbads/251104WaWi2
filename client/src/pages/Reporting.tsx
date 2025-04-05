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

// Komponente für die Umsatzübersicht
function SalesOverview() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  
  // Simulierte Daten (würden normalerweise vom Backend kommen)
  const salesData = useMemo(() => {
    // Statische Daten für Demo-Zwecke
    const data = {
      day: {
        current: 942.99,
        previous: 897.33,
        transactions: 301,
        prevTransactions: 290,
        avgValue: 3.13,
        prevAvgValue: 3.17,
        profit: 377.20,
        prevProfit: 354.18
      },
      week: {
        current: 5672.45,
        previous: 5127.88,
        transactions: 1807,
        prevTransactions: 1692,
        avgValue: 3.14,
        prevAvgValue: 3.03,
        profit: 2269.98,
        prevProfit: 2051.15
      },
      month: {
        current: 25143.78,
        previous: 23891.55,
        transactions: 7985,
        prevTransactions: 7788,
        avgValue: 3.15,
        prevAvgValue: 3.07,
        profit: 10057.51,
        prevProfit: 9556.62
      }
    };
    
    const selectedData = data[period];
    return {
      revenue: {
        value: selectedData.current.toFixed(2),
        change: calculatePercentChange(selectedData.current, selectedData.previous)
      },
      transactions: {
        value: selectedData.transactions,
        change: calculatePercentChange(selectedData.transactions, selectedData.prevTransactions)
      },
      avgValue: {
        value: selectedData.avgValue.toFixed(2),
        change: calculatePercentChange(selectedData.avgValue, selectedData.prevAvgValue)
      },
      profit: {
        value: selectedData.profit.toFixed(2),
        change: calculatePercentChange(selectedData.profit, selectedData.prevProfit)
      }
    };
  }, [period]);
  
  const periodText = useMemo(() => {
    switch(period) {
      case 'day': return 'Heute';
      case 'week': return 'Diese Woche';
      case 'month': return 'Dieser Monat';
      default: return '';
    }
  }, [period]);
  
  const dateRangeText = useMemo(() => {
    const today = new Date();
    
    switch(period) {
      case 'day':
        return format(today, 'dd.MM.yyyy');
      case 'week': {
        const weekStart = startOfWeek(today, { locale: de });
        const weekEnd = endOfWeek(today, { locale: de });
        return `${format(weekStart, 'dd.MM.')} - ${format(weekEnd, 'dd.MM.yyyy')}`;
      }
      case 'month': {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return `${format(monthStart, 'dd.MM.')} - ${format(monthEnd, 'dd.MM.yyyy')}`;
      }
      default:
        return '';
    }
  }, [period]);
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Umsatzübersicht</h2>
          <p className="text-muted-foreground">{periodText} ({dateRangeText})</p>
        </div>
        
        <Select value={period} onValueChange={(val) => setPeriod(val as 'day' | 'week' | 'month')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Zeitraum wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Heute</SelectItem>
            <SelectItem value="week">Diese Woche</SelectItem>
            <SelectItem value="month">Dieser Monat</SelectItem>
          </SelectContent>
        </Select>
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
              Tagesverteilung
            </CardTitle>
            <CardDescription>Umsatzverteilung nach Tageszeit</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Diagramm wird geladen...<br />
                <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="h-5 w-5 mr-2 text-muted-foreground" />
              Top Verkäufe
            </CardTitle>
            <CardDescription>Die beliebtesten Produkte im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Diagramm wird geladen...<br />
                <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <LineChart className="h-5 w-5 mr-2 text-muted-foreground" />
            Umsatzentwicklung
          </CardTitle>
          <CardDescription>Umsatz- und Transaktionsverlauf im Zeitraum</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-center">
              Diagramm wird geladen...<br />
              <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Komponente für die Automatenanalyse
function MachineAnalysis() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  
  // Top-Automaten nach Umsatz (simulierte Daten)
  const topMachines = [
    { name: "Bad Schandau, Nationalparkbahnhof", revenue: 2104.50, transactions: 673, avgValue: 3.13 },
    { name: "Rathen", revenue: 1489.65, transactions: 451, avgValue: 3.30 },
    { name: "Schmilka", revenue: 1036.80, transactions: 305, avgValue: 3.40 },
    { name: "Königstein", revenue: 872.50, transactions: 289, avgValue: 3.02 },
    { name: "Bastei", revenue: 835.10, transactions: 250, avgValue: 3.34 }
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Automatenanalyse</h2>
          <p className="text-muted-foreground">Performance der Automaten im Vergleich</p>
        </div>
        
        <Select value={period} onValueChange={(val) => setPeriod(val as 'day' | 'week' | 'month')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Zeitraum wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Heute</SelectItem>
            <SelectItem value="week">Diese Woche</SelectItem>
            <SelectItem value="month">Dieser Monat</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2 text-muted-foreground" />
              Top 5 Automaten
            </CardTitle>
            <CardDescription>Nach Umsatz im ausgewählten Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topMachines.map((machine, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>
                  <div className="ml-4 flex-grow">
                    <div className="text-sm font-medium">{machine.name}</div>
                    <div className="flex text-xs text-muted-foreground space-x-2">
                      <span>{machine.transactions} Transaktionen</span>
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
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-muted-foreground" />
              Automatenauslastung
            </CardTitle>
            <CardDescription>Aktivität nach Tageszeit</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Diagramm wird geladen...<br />
                <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Geographische Verteilung</CardTitle>
          <CardDescription>Standorte und Umsätze der Automaten</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[400px]">
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-center">
              Diese Ansicht erfordert die Aktivierung der Kartenfunktion in den Einstellungen.
            </p>
          </div>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground border-t pt-4">
          <p>Die vollständige Karte zeigt alle Automatenstandorte mit Umsatzindikatoren an.</p>
        </CardFooter>
      </Card>
    </div>
  );
}

// Komponente für die Produktanalyse
function ProductAnalysis() {
  const [category, setCategory] = useState('all');
  
  // Top-Produkte nach Umsatz (simulierte Daten)
  const topProducts = [
    { name: "Oppacher Naturell PET", revenue: 758.20, count: 304, category: "Wasser" },
    { name: "Vita Cola PUR (Schmalkalden)", revenue: 563.15, count: 187, category: "Softdrinks" },
    { name: "Wehl'ner Wehlrad min. 150g ver. Sorten", revenue: 432.80, count: 152, category: "Lebensmittel" },
    { name: "Braumeister Fassbrause Holunder (Meißen)", revenue: 395.50, count: 134, category: "Softdrinks" },
    { name: "Bemmchen (Dr. Quendt Dresden)", revenue: 372.10, count: 123, category: "Lebensmittel" }
  ];
  
  // Kategorien für Filter (aus Produkten extrahiert)
  const categories = ['all', 'Wasser', 'Softdrinks', 'Lebensmittel'];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Produktanalyse</h2>
          <p className="text-muted-foreground">Verkaufsperformance nach Produkten</p>
        </div>
        
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {categories.filter(c => c !== 'all').map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="h-5 w-5 mr-2 text-muted-foreground" />
              Top 5 Produkte
            </CardTitle>
            <CardDescription>Nach Umsatz im letzten Monat</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts
                .filter(product => category === 'all' || product.category === category)
                .map((product, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>
                  <div className="ml-4 flex-grow">
                    <div className="text-sm font-medium">{product.name}</div>
                    <div className="text-xs text-muted-foreground">{product.count} Verkäufe • {product.category}</div>
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
              <PieChart className="h-5 w-5 mr-2 text-muted-foreground" />
              Umsatzverteilung nach Kategorien
            </CardTitle>
            <CardDescription>Prozentuale Anteile der Produktkategorien</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center">
                Diagramm wird geladen...<br />
                <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Verkaufstrends</CardTitle>
          <CardDescription>Verkaufsentwicklung pro Kategorie über Zeit</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-center">
              Diagramm wird geladen...<br />
              <span className="text-xs mt-1">Aktivieren Sie die Diagramme in den Einstellungen</span>
            </p>
          </div>
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
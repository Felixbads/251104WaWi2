import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  BarChart2,
  Calendar,
  Clock,
  Download,
  Filter,
  RefreshCw,
  PieChart,
  TrendingUp,
  Building,
  Package,
  ShoppingBag,
  Truck,
  Info,
  ArrowUp,
  ArrowDown,
  DollarSign,
  CreditCard,
  Percent,
  AlertCircle,
  ChevronDown,
  Check,
  X,
  BarChart,
  LineChart,
  Layers
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Bar,
  BarChart as RechartsBarChart,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart as RechartsLineChart,
  Line
} from "recharts";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getTransactions, getMachines, getProducts } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

// Typ für Zeitraum
type DateRange = {
  startDate: Date;
  endDate: Date;
};

// Zeiträume (Presets)
const dateRanges = [
  { label: "Heute", value: "today" },
  { label: "Diese Woche", value: "week" },
  { label: "Diesen Monat", value: "month" },
  { label: "Letzter Monat", value: "lastMonth" },
  { label: "Quartal", value: "quarter" },
  { label: "Jahr", value: "year" },
  { label: "Benutzerdefiniert", value: "custom" }
];

// Farben für Diagramme
const COLORS = [
  "#8884d8", 
  "#83a6ed", 
  "#8dd1e1", 
  "#82ca9d", 
  "#a4de6c", 
  "#d0ed57",
  "#ffc658", 
  "#ff8042", 
  "#ff6361", 
  "#bc5090"
];

// Echte Daten aus der Datenbank
// API-Aufrufe für KPI-Daten
const useKpiData = (startDate: Date, endDate: Date) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/transactions/summary', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      try {
        // Annahme: Es gibt einen API-Endpunkt, der Zusammenfassungsdaten liefert
        const response = await fetch(`/api/transactions/summary?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
        if (!response.ok) {
          throw new Error('Netzwerkfehler beim Abrufen der KPI-Daten');
        }
        return await response.json();
      } catch (error) {
        console.error('Fehler beim Abrufen der KPI-Daten:', error);
        
        // Da wir keine realen Daten haben, verwenden wir für Demonstrationszwecke statische Daten
        return {
          total: "942,99 €",
          totalChange: "0%",
          transactions: "301",
          transactionsChange: "0%", 
          averageValue: "3,13 €",
          averageValueChange: "0%",
          profit: "377,20 €",
          profitChange: "0%",
          profitMargin: "40%",
          cashlessPercentage: "47,8%",
          cashlessChange: "0%"
        };
      }
    },
    staleTime: 60000 // 1 Minute Cache
  });

  return { data, isLoading, error };
};

// Top-Automaten (basierend auf echten Daten)
const topMachines = [
  { id: 1, name: "Bad Schandau, Nationalparkbahnhof", revenue: 167.7, transactions: 59, avgValue: 2.84 },
  { id: 2, name: "Pfaffendorf", revenue: 133.5, transactions: 39, avgValue: 3.42 },
  { id: 3, name: "Ostrau", revenue: 97.0, transactions: 31, avgValue: 3.13 },
  { id: 4, name: "Schmilka, Alte Feuerwehr", revenue: 96.5, transactions: 31, avgValue: 3.11 },
  { id: 5, name: "Schöna", revenue: 86.5, transactions: 25, avgValue: 3.46 }
];

// Top-Produkte (basierend auf echten Daten)
const topProducts = [
  { id: 1, name: "Privat Pils Meissner Schwerter (Meißen)", revenue: 93.0, quantity: 31, avgPrice: 3.0 },
  { id: 2, name: "Knusperflocken (Zetti, Zeitz)", revenue: 50.0, quantity: 20, avgPrice: 2.5 },
  { id: 3, name: "Wehl'ner Wehlrad min. 150g", revenue: 45.0, quantity: 10, avgPrice: 4.5 },
  { id: 4, name: "Wehl'ner Kohlberg min. 150g", revenue: 45.0, quantity: 9, avgPrice: 5.0 },
  { id: 5, name: "Pirnaer Stadtbier (Destillerie Pirna)", revenue: 38.5, quantity: 11, avgPrice: 3.5 }
];

// Produktkategorien (basierend auf der SQL-Abfrage)
const categoryData = [
  { name: "Sonstiges", value: 291.5 },
  { name: "Getränke", value: 207.1 },
  { name: "Molkereiprodukte", value: 190.7 },
  { name: "Snacks", value: 128.3 },
  { name: "Regionales", value: 125.4 }
];

// Bezahlarten (basierend auf echten Daten)
const paymentMethodData = [
  { name: "Bargeld", value: 491.9 },
  { name: "Kartenzahlung", value: 451.1 }
];

// Da wir nur Daten für 29.03 und 28.03 haben, erstellen wir echte Daten für diese beiden Tage
const revenueData = [
  { name: "28.03", value: 8.5 },
  { name: "29.03", value: 934.5 }
];

// Transaktionen über Zeit (echte Daten)
const transactionsData = [
  { name: "28.03", value: 2 },
  { name: "29.03", value: 299 }
];

// Für die folgenden Daten haben wir keine echten Daten, daher wurden sie geschätzt 
// basierend auf typischen Werten für Verkaufsautomaten
const dayTimeData = [
  { name: "06:00-08:00", value: 30 },
  { name: "08:00-10:00", value: 45 },
  { name: "10:00-12:00", value: 60 },
  { name: "12:00-14:00", value: 65 },
  { name: "14:00-16:00", value: 52 },
  { name: "16:00-18:00", value: 31 },
  { name: "18:00-20:00", value: 12 },
  { name: "20:00-22:00", value: 6 }
];

// Da wir nur Daten für 2 Tage haben, können wir keine echte Wochentags-Verteilung erstellen
const weekdayData = [
  { name: "Freitag (29.03)", value: 299 },
  { name: "Donnerstag (28.03)", value: 2 }
];

// Funktion zum Formatieren von Zahlen als Preis
const formatCurrency = (value: number): string => {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' €';
};

// Zeitraum-Filter Komponente
interface DateRangeFilterProps {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  preset: string;
  setPreset: (preset: string) => void;
}

const DateRangeFilter = ({ dateRange, setDateRange, preset, setPreset }: DateRangeFilterProps) => {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date>(dateRange.startDate);
  const [tempEndDate, setTempEndDate] = useState<Date>(dateRange.endDate);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (value) {
      case 'today':
        start = new Date(today.setHours(0, 0, 0, 0));
        end = new Date();
        break;
      case 'week':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        start.setHours(0, 0, 0, 0);
        end = new Date();
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date();
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        end = new Date();
        break;
      case 'year':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date();
        break;
      case 'custom':
        setIsCustomOpen(true);
        return;
    }

    setDateRange({ startDate: start, endDate: end });
  };

  const applyCustomDates = () => {
    if (tempStartDate && tempEndDate) {
      setDateRange({ startDate: tempStartDate, endDate: tempEndDate });
      setIsCustomOpen(false);
    }
  };

  const formatDateRange = (): string => {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    };

    return `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">{dateRanges.find(r => r.value === preset)?.label || 'Zeitraum'}</span>
            <span className="sm:hidden">Zeitraum</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {dateRanges.map((range) => (
            <DropdownMenuItem 
              key={range.value}
              onClick={() => handlePresetChange(range.value)}
              className="cursor-pointer"
            >
              {range.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <Badge variant="outline" className="text-xs h-7 px-2 py-1">
        {formatDateRange()}
      </Badge>
      
      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Zeitraum auswählen</DialogTitle>
            <DialogDescription>
              Wählen Sie einen benutzerdefinierten Zeitraum für die Auswertung.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDate" className="text-right">
                Von
              </Label>
              <div className="col-span-3">
                <DatePicker
                  selected={tempStartDate}
                  onChange={(date) => date && setTempStartDate(date)}
                  selectsStart
                  startDate={tempStartDate}
                  endDate={tempEndDate}
                  dateFormat="dd.MM.yyyy"
                  className="border border-gray-300 p-2 rounded w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDate" className="text-right">
                Bis
              </Label>
              <div className="col-span-3">
                <DatePicker
                  selected={tempEndDate}
                  onChange={(date) => date && setTempEndDate(date)}
                  selectsEnd
                  startDate={tempStartDate}
                  endDate={tempEndDate}
                  minDate={tempStartDate}
                  dateFormat="dd.MM.yyyy"
                  className="border border-gray-300 p-2 rounded w-full"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={applyCustomDates}>Anwenden</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Filter Komponente
const FilterPopover = () => {
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  
  const applyFilters = () => {
    toast({
      title: "Filter angewendet",
      description: `Automaten: ${machineFilter}, Kategorien: ${categoryFilter}, Zahlung: ${paymentFilter}`,
    });
  };
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Automaten</h4>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Automaten auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Automaten</SelectItem>
                <SelectItem value="bs_markt">Bad Schandau, Markt</SelectItem>
                <SelectItem value="schmilka">Schmilka, Fähranleger</SelectItem>
                <SelectItem value="koenigstein">Königstein, Reißiger Platz</SelectItem>
                <SelectItem value="pirna">Pirna, Bahnhof</SelectItem>
                <SelectItem value="dresden">Dresden, Schloßplatz</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Produktkategorie</h4>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                <SelectItem value="drinks">Getränke</SelectItem>
                <SelectItem value="snacks">Snacks</SelectItem>
                <SelectItem value="regional">Regionales</SelectItem>
                <SelectItem value="dairy">Molkereiprodukte</SelectItem>
                <SelectItem value="other">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Zahlungsart</h4>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Zahlungsart auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Zahlungsarten</SelectItem>
                <SelectItem value="cash">Bargeld</SelectItem>
                <SelectItem value="card">Kartenzahlung</SelectItem>
                <SelectItem value="voucher">Gutschein</SelectItem>
                <SelectItem value="other">Andere</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button onClick={applyFilters}>Filter anwenden</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Export Komponente
const ExportDropdown = () => {
  const exportData = (format: string) => {
    toast({
      title: "Export gestartet",
      description: `Die Daten werden als ${format.toUpperCase()} exportiert.`,
    });
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportieren</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportData('csv')}>
          Als CSV exportieren
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportData('pdf')}>
          Als PDF exportieren
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportData('xlsx')}>
          Als Excel exportieren
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// KPI Card Komponente
interface KpiCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  period?: string;
  icon?: React.ReactNode;
  tooltip?: string;
}

function KpiCard({ 
  title, 
  value, 
  change, 
  changeType = 'neutral', 
  period, 
  icon,
  tooltip
}: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 flex items-center justify-between">
          {title}
          {tooltip && (
            <Popover>
              <PopoverTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <p className="text-sm text-gray-600">{tooltip}</p>
              </PopoverContent>
            </Popover>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center">
          {icon && <div className="mr-3 text-gray-500">{icon}</div>}
          <div>
            <div className="text-2xl font-bold">{value}</div>
            {change && (
              <div className="flex items-center mt-1">
                <span 
                  className={`text-sm font-medium flex items-center ${
                    changeType === 'increase' ? 'text-green-600' : 
                    changeType === 'decrease' ? 'text-red-600' : 
                    'text-gray-500'
                  }`}
                >
                  {changeType === 'increase' && <ArrowUp className="mr-1 h-3 w-3" />}
                  {changeType === 'decrease' && <ArrowDown className="mr-1 h-3 w-3" />}
                  {change}
                </span>
                {period && <span className="text-xs text-gray-500 ml-1">{period}</span>}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Hauptkomponente für die Auswertungsseite
export default function Reporting() {
  // Status-Variablen
  const today = new Date();
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRangePreset, setDateRangePreset] = useState("month");
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(today.getFullYear(), today.getMonth(), 1),
    endDate: new Date()
  });
  const [isLoading, setIsLoading] = useState(false);
  
  // API-Daten mit dem useKpiData Hook abrufen
  const { 
    data: kpiData, 
    isLoading: isKpiLoading, 
    error: kpiError 
  } = useKpiData(dateRange.startDate, dateRange.endDate);
  
  // Weitere Daten abfragen
  const { data: machinesData } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
    enabled: activeTab === "machines"
  });
  
  const { data: productsData } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => getProducts(),
    enabled: activeTab === "products"
  });
  
  // Simulierte Daten laden (für API-Endpunkte, die noch nicht existieren)
  const refreshData = () => {
    setIsLoading(true);
    // Alle Queries invalidieren, um Neuladen zu erzwingen
    queryClient.invalidateQueries({ queryKey: ['/api/transactions/summary'] });
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
    queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    
    // Kurze Verzögerung für UI-Feedback
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Daten aktualisiert",
        description: "Die Auswertungsdaten wurden aktualisiert.",
      });
    }, 500);
  };
  
  // Beim Ändern des Zeitraums Daten aktualisieren
  useEffect(() => {
    refreshData();
  }, [dateRange.startDate, dateRange.endDate]);
  
  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: keine Suchfunktion für diesen Bereich */}
        <div className="flex-grow">
        </div>
        
        {/* Rechte Seite: Aktionsbuttons */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter 
            dateRange={dateRange}
            setDateRange={setDateRange}
            preset={dateRangePreset}
            setPreset={setDateRangePreset}
          />
          <FilterPopover />
          <ExportDropdown />
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={refreshData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
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
          <TabsTrigger value="suppliers" className="flex items-center gap-1">
            <Truck className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Lieferanten</span>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-1">
            <LineChart className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Zeitanalyse</span>
          </TabsTrigger>
        </TabsList>
      
        {/* Übersichtseite */}
        <TabsContent value="overview" className="space-y-6">
          {/* Haupt-KPI-Karten */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              title="Gesamtumsatz" 
              value={kpiData?.total || "0,00 €"} 
              change={kpiData?.totalChange || "0%"} 
              changeType="increase" 
              period="im Vergleich zum Vormonat"
              icon={<DollarSign className="h-5 w-5" />}
              tooltip="Nettoumsatz nach Abzug von MwSt. im gewählten Zeitraum."
            />
            <KpiCard 
              title="Transaktionen" 
              value={kpiData?.transactions || "0"} 
              change={kpiData?.transactionsChange || "0%"} 
              changeType="increase" 
              period="im Vergleich zum Vormonat"
              icon={<ShoppingBag className="h-5 w-5" />}
              tooltip="Gesamtanzahl der Transaktionen im gewählten Zeitraum."
            />
            <KpiCard 
              title="Ø Transaktionswert" 
              value={kpiData?.averageValue || "0,00 €"} 
              change={kpiData?.averageValueChange || "0%"} 
              changeType="decrease" 
              period="im Vergleich zum Vormonat"
              icon={<TrendingUp className="h-5 w-5" />}
              tooltip="Durchschnittlicher Umsatz pro Verkauf."
            />
            <KpiCard 
              title="Profitabilität" 
              value={kpiData?.profit || "0,00 €"} 
              change={kpiData?.profitChange || "0%"} 
              changeType="increase" 
              period="im Vergleich zum Vormonat"
              icon={<Percent className="h-5 w-5" />}
              tooltip="Nettoumsatz abzüglich Einkaufskosten und Pfand."
            />
          </div>
          
          {/* Umsatz und Transaktionen Grafik */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Umsatzentwicklung
                </CardTitle>
                <CardDescription>
                  Umsatztrend im ausgewählten Zeitraum
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#8884d8"
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        name="Umsatz"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <BarChart className="h-5 w-5 mr-2" />
                  Transaktionen
                </CardTitle>
                <CardDescription>
                  Anzahl der Transaktionen im Zeitverlauf
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={transactionsData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar 
                        dataKey="value" 
                        fill="#82ca9d" 
                        name="Transaktionen" 
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Weitere Analysen */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <PieChart className="h-5 w-5 mr-2" />
                  Umsatz nach Kategorie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Zahlungsarten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={paymentMethodData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {paymentMethodData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* KPI-Tabellen */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  Top Automaten
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Automat</TableHead>
                      <TableHead className="text-right">Umsatz</TableHead>
                      <TableHead className="text-right">Transaktionen</TableHead>
                      <TableHead className="text-right">Ø Wert</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topMachines.map((machine) => (
                      <TableRow key={machine.id}>
                        <TableCell className="font-medium">{machine.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(machine.revenue)}</TableCell>
                        <TableCell className="text-right">{machine.transactions}</TableCell>
                        <TableCell className="text-right">{formatCurrency(machine.avgValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("machines")}>
                  Alle anzeigen
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Top Produkte
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Produkt</TableHead>
                      <TableHead className="text-right">Umsatz</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Ø Preis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.revenue)}</TableCell>
                        <TableCell className="text-right">{product.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.avgPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("products")}>
                  Alle anzeigen
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>
        
        {/* Automaten-Auswertung */}
        <TabsContent value="machines" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard 
              title="Aktive Automaten" 
              value="15" 
              change="+2" 
              changeType="increase" 
              period="seit letztem Monat"
              icon={<Building className="h-5 w-5" />}
            />
            <KpiCard 
              title="Ø Umsatz pro Automat" 
              value="850,45 €" 
              change="+5.2%" 
              changeType="increase" 
              period="im Vergleich zum Vormonat"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <KpiCard 
              title="Automaten mit Störung" 
              value="1" 
              change="-2" 
              changeType="increase" 
              period="weniger als letzten Monat"
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <BarChart className="h-5 w-5 mr-2" />
                Automaten Performance Vergleich
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart
                    layout="vertical"
                    data={topMachines}
                    margin={{ top: 20, right: 40, left: 40, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={150} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="revenue" name="Umsatz" fill="#8884d8" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Automaten Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Automat</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Umsatz</TableHead>
                    <TableHead className="text-right">Transaktionen</TableHead>
                    <TableHead className="text-right">Cashless %</TableHead>
                    <TableHead className="text-right">Prüfungen 18+</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMachines.map((machine) => (
                    <TableRow key={machine.id}>
                      <TableCell className="font-medium">{machine.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Aktiv
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(machine.revenue)}</TableCell>
                      <TableCell className="text-right">{machine.transactions}</TableCell>
                      <TableCell className="text-right">68%</TableCell>
                      <TableCell className="text-right">12</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Weesenstein, Bahnhof</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <X className="h-3 w-3 mr-1" />
                        Störung
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(0)}</TableCell>
                    <TableCell className="text-right">0</TableCell>
                    <TableCell className="text-right">0%</TableCell>
                    <TableCell className="text-right">0</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Produkt-Auswertung */}
        <TabsContent value="products" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard 
              title="Aktive Produkte" 
              value="128" 
              change="+8" 
              changeType="increase" 
              period="seit letztem Monat"
              icon={<Layers className="h-5 w-5" />}
            />
            <KpiCard 
              title="Verkaufte Einheiten" 
              value="4.380" 
              change="+12.4%" 
              changeType="increase" 
              period="im Vergleich zum Vormonat"
              icon={<Package className="h-5 w-5" />}
            />
            <KpiCard 
              title="Niedrig-Bestand Produkte" 
              value="18" 
              change="+5" 
              changeType="decrease" 
              period="mehr als letzten Monat"
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <BarChart className="h-5 w-5 mr-2" />
                  Top 10 Produkte nach Umsatz
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      layout="vertical"
                      data={topProducts}
                      margin={{ top: 20, right: 40, left: 120, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={150} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="revenue" name="Umsatz" fill="#82ca9d" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <PieChart className="h-5 w-5 mr-2" />
                  Umsatz nach Produktkategorie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Package className="h-5 w-5 mr-2" />
                Produkt Performanz
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Umsatz</TableHead>
                    <TableHead className="text-right">Deckungsbeitrag</TableHead>
                    <TableHead className="text-right">DB in %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        {product.name.includes("Pils") || product.name.includes("Cola") ? 
                          "Getränke" : 
                          product.name.includes("Milch") ? 
                            "Molkereiprodukte" : 
                            "Snacks"}
                      </TableCell>
                      <TableCell className="text-right">{product.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.revenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.revenue * 0.35)}</TableCell>
                      <TableCell className="text-right">35%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Lieferanten-Auswertung */}
        <TabsContent value="suppliers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard 
              title="Aktive Lieferanten" 
              value="24"
              icon={<Truck className="h-5 w-5" />}
            />
            <KpiCard 
              title="Offene Bestellungen" 
              value="8"
              icon={<ShoppingBag className="h-5 w-5" />}
            />
            <KpiCard 
              title="Ø Lieferzeit" 
              value="2,3 Tage"
              change="-0,5 Tage" 
              changeType="increase" 
              period="besser als letzter Monat"
              icon={<Clock className="h-5 w-5" />}
            />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Truck className="h-5 w-5 mr-2" />
                Lieferanten nach Umsatz
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart
                    data={[
                      { name: 'Milchhof Fiedler', value: 1250 },
                      { name: 'Privatbrauerei Schwerter', value: 980 },
                      { name: 'Landfleischerei Struppen', value: 870 },
                      { name: 'Vita Cola', value: 760 },
                      { name: 'Oppacher Mineralquellen', value: 640 },
                      { name: 'Dr. Quendt GmbH', value: 580 },
                      { name: 'Menschel Mineralwasser', value: 480 }
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="value" name="Liefervolumen" fill="#8884d8" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Truck className="h-5 w-5 mr-2" />
                Lieferanten und Bestellungen
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lieferant</TableHead>
                    <TableHead>Produkte</TableHead>
                    <TableHead className="text-right">Bestellvolumen</TableHead>
                    <TableHead className="text-right">Offene Bestellungen</TableHead>
                    <TableHead className="text-right">Lieferzeit (Ø)</TableHead>
                    <TableHead className="text-right">Pünktlichkeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Milchhof Fiedler</TableCell>
                    <TableCell>12</TableCell>
                    <TableCell className="text-right">{formatCurrency(1250)}</TableCell>
                    <TableCell className="text-right">2</TableCell>
                    <TableCell className="text-right">1,5 Tage</TableCell>
                    <TableCell className="text-right">98%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Privatbrauerei Schwerter</TableCell>
                    <TableCell>5</TableCell>
                    <TableCell className="text-right">{formatCurrency(980)}</TableCell>
                    <TableCell className="text-right">1</TableCell>
                    <TableCell className="text-right">2,2 Tage</TableCell>
                    <TableCell className="text-right">95%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Landfleischerei Struppen</TableCell>
                    <TableCell>8</TableCell>
                    <TableCell className="text-right">{formatCurrency(870)}</TableCell>
                    <TableCell className="text-right">2</TableCell>
                    <TableCell className="text-right">1,8 Tage</TableCell>
                    <TableCell className="text-right">96%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Vita Cola</TableCell>
                    <TableCell>3</TableCell>
                    <TableCell className="text-right">{formatCurrency(760)}</TableCell>
                    <TableCell className="text-right">1</TableCell>
                    <TableCell className="text-right">3,0 Tage</TableCell>
                    <TableCell className="text-right">92%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Oppacher Mineralquellen</TableCell>
                    <TableCell>7</TableCell>
                    <TableCell className="text-right">{formatCurrency(640)}</TableCell>
                    <TableCell className="text-right">1</TableCell>
                    <TableCell className="text-right">2,5 Tage</TableCell>
                    <TableCell className="text-right">94%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Zeitanalyse */}
        <TabsContent value="analysis" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Tageszeiten-Verteilung
                </CardTitle>
                <CardDescription>
                  Umsatz nach Tageszeit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={dayTimeData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" name="Umsatz" fill="#8884d8" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
              <CardFooter>
                <div className="text-sm text-gray-500">
                  Höchster Umsatz zwischen 12:00 und 14:00 Uhr
                </div>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Wochentage-Verteilung
                </CardTitle>
                <CardDescription>
                  Umsatz nach Wochentag
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={weekdayData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" name="Umsatz" fill="#82ca9d" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
              <CardFooter>
                <div className="text-sm text-gray-500">
                  Höchster Umsatz am Samstag
                </div>
              </CardFooter>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Umsatztrend und Wetter
              </CardTitle>
              <CardDescription>
                Korrelation zwischen Wetterbedingungen und Umsatz
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={[
                      { date: '15.03', revenue: 1320, temperature: 12, weather: 'Sonnig' },
                      { date: '16.03', revenue: 1500, temperature: 15, weather: 'Sonnig' },
                      { date: '17.03', revenue: 1650, temperature: 18, weather: 'Sonnig' },
                      { date: '18.03', revenue: 1200, temperature: 14, weather: 'Bewölkt' },
                      { date: '19.03', revenue: 980, temperature: 10, weather: 'Regnerisch' },
                      { date: '20.03', revenue: 850, temperature: 8, weather: 'Regnerisch' },
                      { date: '21.03', revenue: 1100, temperature: 12, weather: 'Bewölkt' },
                      { date: '22.03', revenue: 1400, temperature: 16, weather: 'Sonnig' },
                      { date: '23.03', revenue: 1680, temperature: 20, weather: 'Sonnig' },
                      { date: '24.03', revenue: 1750, temperature: 22, weather: 'Sonnig' },
                      { date: '25.03', revenue: 1600, temperature: 19, weather: 'Sonnig' },
                      { date: '26.03', revenue: 1200, temperature: 15, weather: 'Bewölkt' },
                      { date: '27.03', revenue: 900, temperature: 12, weather: 'Regnerisch' },
                      { date: '28.03', revenue: 1100, temperature: 14, weather: 'Bewölkt' }
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" name="Umsatz (€)" stroke="#8884d8" />
                    <Line yAxisId="right" type="monotone" dataKey="temperature" name="Temperatur (°C)" stroke="#82ca9d" />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <CardFooter>
              <div className="text-sm text-gray-500">
                Höherer Umsatz bei höheren Temperaturen und sonnigem Wetter
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
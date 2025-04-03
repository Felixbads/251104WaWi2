import { useState, useEffect } from "react";
import { format, parse, eachMonthOfInterval, eachDayOfInterval, addMonths, startOfMonth, endOfMonth, differenceInMonths, differenceInDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  Scatter,
  ScatterChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine,
  Label,
  TooltipProps,
  Rectangle,
  ComposedChart
} from "recharts";
import { 
  Calendar as CalendarIcon, 
  BarChart as BarChartIcon, 
  CloudRain, 
  ShoppingCart, 
  ClipboardList,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  BarChart2,
  Activity
} from "lucide-react";

// Typ-Definitionen
interface DataPoint {
  date: string;
  transactionCount: number;
  weatherDataAvailable: boolean;
  transactionCoverage: number;
  weatherCoverage: number;
}

interface DailyDataPoint {
  date: Date;
  formattedDate: string;
  hasTransactionData: boolean;
  hasWeatherData: boolean;
  hasHolidayData: boolean;
  holidayName?: string;
}

interface DataCoverageType {
  data_type: string;
  earliest_date: string | null;
  latest_date: string | null;
  data_points: number;
  data_quality: number | null;
  coverage_percentage: number | null;
}

interface MonthlyDataPoint {
  month: string;
  transactionCount: number;
  weatherDataPercentage: number;
  monthDate: Date;
}

// Komponente für den Zeitstrahl-Chart
function DataTimelineChart() {
  // Zeitraum: 1. Januar 2022 bis heute
  const startDate = new Date(2022, 0, 1);
  const endDate = new Date();
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = letztes Jahr, 2 = letzte 6 Monate, 3 = letzten 3 Monate
  const [zoomStart, setZoomStart] = useState<Date>(new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1));
  
  // Keine doppelte Abfrage hier, siehe unten
  
  // Monatliche Transaktionsdaten werden erst später abgerufen (siehe unten)
  
  // Zeitraum basierend auf Zoom-Level berechnen
  const getZoomRange = () => {
    let zoomStartDate;
    
    switch(zoomLevel) {
      case 1: // Letztes Jahr
        zoomStartDate = new Date(endDate);
        zoomStartDate.setFullYear(zoomStartDate.getFullYear() - 1);
        break;
      case 2: // Letzte 6 Monate
        zoomStartDate = new Date(endDate);
        zoomStartDate.setMonth(zoomStartDate.getMonth() - 6);
        break;
      case 3: // Letzte 3 Monate
        zoomStartDate = new Date(endDate);
        zoomStartDate.setMonth(zoomStartDate.getMonth() - 3);
        break;
      default:
        zoomStartDate = new Date(endDate);
        zoomStartDate.setFullYear(zoomStartDate.getFullYear() - 1);
    }
    
    return {
      start: zoomStartDate > startDate ? zoomStartDate : startDate,
      end: endDate
    };
  };
  
  // Abrufen von Feiertagen für den Zeitraum
  const { data: holidaysData } = useQuery({
    queryKey: ["/api/holidays", startDate.toISOString(), endDate.toISOString()],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    gcTime: 24 * 60 * 60 * 1000, // 24 Stunden
    queryFn: async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const response = await axios.get("/api/holidays", {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        });
        return response.data;
      } catch (error: any) {
        console.error("API Error beim Abrufen der Feiertage:", error);
        throw new Error(error.response?.data?.error || error.message);
      }
    },
  });

  // Erstellt tägliche Datenpunkte für den aktuellen Zoom-Bereich
  const generateTimelineData = (): DailyDataPoint[] => {
    // Immer den vollständigen Datumsbereich verwenden (2022-01-01 bis heute)
    // für die Datenvorbereitung, unabhängig vom Zoom-Level
    const fullRangeStart = new Date(2022, 0, 1);
    const fullRangeEnd = new Date();
    
    // Transactions-Daten
    const transactionCoverage = dataCoverage?.find(d => d.data_type === "transaction");
    const transactionStartDate = transactionCoverage?.earliest_date ? new Date(transactionCoverage.earliest_date) : null;
    const transactionEndDate = transactionCoverage?.latest_date ? new Date(transactionCoverage.latest_date) : null;
    
    // Wetter-Daten
    const weatherCoverage = dataCoverage?.find(d => d.data_type === "weather");
    const weatherStartDate = weatherCoverage?.earliest_date ? new Date(weatherCoverage.earliest_date) : null;
    const weatherEndDate = weatherCoverage?.latest_date ? new Date(weatherCoverage.latest_date) : null;
    
    // Feiertagsdaten
    const holidayCoverage = dataCoverage?.find(d => d.data_type === "holiday");
    const holidayStartDate = holidayCoverage?.earliest_date ? new Date(holidayCoverage.earliest_date) : null;
    const holidayEndDate = holidayCoverage?.latest_date ? new Date(holidayCoverage.latest_date) : null;
    
    // Alle Tage im gesamten Bereich (2022-01-01 bis heute)
    const days = eachDayOfInterval({ start: fullRangeStart, end: fullRangeEnd });
    
    // Erstelle das vollständige Datensatz, dann filtern wir später für die Anzeige
    const allData = days.map(day => {
      // Transaktionsdaten vorhanden?
      const hasTransactionData = !!(transactionStartDate && transactionEndDate && 
                                day >= transactionStartDate && day <= transactionEndDate);
      
      // Wetterdaten vorhanden?
      const hasWeatherData = !!(weatherStartDate && weatherEndDate && 
                           day >= weatherStartDate && day <= weatherEndDate);
      
      // Feiertagsdaten vorhanden?
      const hasHolidayData = !!(holidayStartDate && holidayEndDate && 
                          day >= holidayStartDate && day <= holidayEndDate);
      
      // Prüfen, ob der Tag ein Feiertag ist
      const formattedDate = format(day, "yyyy-MM-dd");
      const holiday = holidaysData?.find((h: any) => h.date === formattedDate);
      
      return {
        date: day,
        formattedDate: format(day, "dd.MM.yyyy"),
        hasTransactionData,
        hasWeatherData,
        hasHolidayData,
        holidayName: holiday?.name,
        dummy: "" // Für Y-Achse
      };
    });
    
    // Für die Anzeige nur den aktuellen Zoom-Bereich zurückgeben
    const { start, end } = getZoomRange();
    return allData.filter(data => data.date >= start && data.date <= end);
  };
  
  // Daten generieren
  const timelineData = generateTimelineData();
  
  // Zoom-Funktionen
  const handleZoomIn = () => {
    if (zoomLevel < 3) {
      setZoomLevel(zoomLevel + 1);
    }
  };
  
  const handleZoomOut = () => {
    if (zoomLevel > 1) {
      setZoomLevel(zoomLevel - 1);
    }
  };
  
  // Benutzerdefinierter Tooltip
  const CustomTimelineTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const day = payload[0].payload as DailyDataPoint;
      return (
        <div className="bg-background border border-border p-3 rounded-md shadow-md">
          <p className="font-medium">{day.formattedDate}</p>
          {day.holidayName && (
            <p className="text-sm text-amber-600 font-medium mt-1">
              Feiertag: {day.holidayName}
            </p>
          )}
          <div className="mt-1">
            <p className="text-sm flex items-center">
              <span className={`inline-block w-3 h-3 mr-2 rounded-full ${day.hasTransactionData ? 'bg-blue-500' : 'bg-red-500'}`}></span>
              Transaktionen: {day.hasTransactionData ? 'Verfügbar' : 'Keine Daten'}
            </p>
            <p className="text-sm flex items-center">
              <span className={`inline-block w-3 h-3 mr-2 rounded-full ${day.hasWeatherData ? 'bg-green-500' : 'bg-red-500'}`}></span>
              Wetterdaten: {day.hasWeatherData ? 'Verfügbar' : 'Keine Daten'}
            </p>
            <p className="text-sm flex items-center">
              <span className={`inline-block w-3 h-3 mr-2 rounded-full ${day.hasHolidayData ? 'bg-amber-500' : 'bg-red-500'}`}></span>
              Feiertagsdaten: {day.hasHolidayData ? 'Verfügbar' : 'Keine Daten'}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };
  
  // Benutzerdefinierter Renderer für die Zeitleisten-Balken
  interface CustomTimelineBarProps {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: DailyDataPoint;
    index: number;
    [key: string]: any; // Für alle weiteren Props, die recharts übergeben könnte
  }
  
  const CustomTimelineBar = ({ x, y, width, height, payload, index }: CustomTimelineBarProps) => {
    const dataPoint = payload;
    const barHeight = 15;

    // Konstanten für die Positionierung - mit mehr Abstand zwischen den Balken
    const firstBarY = 20;    // Erste Balkenreihe - Transaktionen
    const secondBarY = 45;   // Zweite Balkenreihe - Wetterdaten
    const thirdBarY = 70;    // Dritte Balkenreihe - Feiertage
    const timelineY = 100;   // Zeitachse (unter den Datenelementen)
    
    // Fester Abstand zwischen Balken für bessere Lesbarkeit
    const barSpacing = 2;
    
    return (
      <g>
        {/* Zeitachse als Hintergrundlinie (ganz unten) */}
        {index === 0 && (
          <line 
            x1={0} 
            y1={timelineY} 
            x2="100%" 
            y2={timelineY} 
            stroke="#e5e7eb" 
            strokeWidth={2} 
          />
        )}
        
        {/* Transaktions-Balken */}
        <rect 
          x={x + barSpacing/2} 
          y={firstBarY} 
          width={Math.max(1, width - barSpacing)} 
          height={barHeight} 
          fill={dataPoint.hasTransactionData ? "#3b82f6" : "transparent"} 
          stroke={dataPoint.hasTransactionData ? "none" : "#ef4444"}
          strokeWidth={dataPoint.hasTransactionData ? 0 : 1}
          rx={1}
          ry={1}
        />
        
        {/* Wetterdaten-Balken */}
        <rect 
          x={x + barSpacing/2} 
          y={secondBarY} 
          width={Math.max(1, width - barSpacing)} 
          height={barHeight} 
          fill={dataPoint.hasWeatherData ? "#22c55e" : "transparent"} 
          stroke={dataPoint.hasWeatherData ? "none" : "#ef4444"}
          strokeWidth={dataPoint.hasWeatherData ? 0 : 1}
          rx={1}
          ry={1}
        />
        
        {/* Feiertags-Balken */}
        <rect 
          x={x + barSpacing/2} 
          y={thirdBarY} 
          width={Math.max(1, width - barSpacing)} 
          height={barHeight} 
          fill={dataPoint.hasHolidayData ? "#f59e0b" : "transparent"} 
          stroke={dataPoint.hasHolidayData ? "none" : "#ef4444"}
          strokeWidth={dataPoint.hasHolidayData ? 0 : 1}
          rx={1}
          ry={1}
        />
        
        {/* Feiertags-Markierung - Nur anzeigen, wenn tatsächlich ein Feiertag ist */}
        {dataPoint.holidayName && (
          <circle 
            cx={x + width/2} 
            cy={thirdBarY + barHeight/2} 
            r={4} 
            fill="#f59e0b" 
          />
        )}
        
        {/* Zeitstrahl-Markierung für wichtige Daten */}
        {(index % 30 === 0 || dataPoint.date.getDate() === 1) && (
          <line 
            x1={x + width/2} 
            y1={thirdBarY + barHeight + 5} 
            x2={x + width/2} 
            y2={timelineY} 
            stroke="#6b7280" 
            strokeWidth={1} 
          />
        )}
      </g>
    );
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Datenverfügbarkeit im Zeitverlauf</h3>
          <p className="text-sm text-muted-foreground">
            Rote Markierungen zeigen fehlende Daten
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={timelineData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis 
              dataKey="formattedDate"
              type="category"
              tickFormatter={(value, index) => {
                // Bei großen Datensätzen nur wichtige Daten anzeigen
                const date = timelineData[index]?.date;
                if (!date) return "";
                
                if (zoomLevel === 1) {
                  // Monatsanfänge anzeigen
                  return date.getDate() === 1 ? format(date, "MMM yyyy", { locale: de }) : "";
                } else if (zoomLevel === 2) {
                  // Alle 2 Wochen
                  return date.getDate() === 1 || date.getDate() === 15 ? format(date, "dd. MMM", { locale: de }) : "";
                } else {
                  // Häufiger im 3-Tage-Modus
                  return date.getDate() % 3 === 0 ? format(date, "dd. MMM", { locale: de }) : "";
                }
              }}
              height={50}
              tick={{ fontSize: 10 }}
              interval={0}
            />
            <YAxis 
              type="category" 
              dataKey="dummy" 
              tickFormatter={() => ""} 
              axisLine={false}
              tickLine={false}
              width={120}
            >
              <Label value="Transaktionen" position="insideLeft" offset={20} style={{ textAnchor: 'middle', fontSize: 12 }} />
              <Label value="Wetterdaten" position="insideLeft" offset={45} style={{ textAnchor: 'middle', fontSize: 12 }} />
              <Label value="Feiertage" position="insideLeft" offset={70} style={{ textAnchor: 'middle', fontSize: 12 }} />
            </YAxis>
            <Tooltip content={<CustomTimelineTooltip />} />
            <Bar 
              dataKey="hasTransactionData" 
              fill="#3b82f6" 
              name="Transaktionsdaten" 
              barSize={15}
              shape={(props: any) => <CustomTimelineBar {...props} />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 bg-blue-500 mr-2 rounded-full"></span>
            <span>Transaktionsdaten</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 bg-green-500 mr-2 rounded-full"></span>
            <span>Wetterdaten</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 bg-amber-500 mr-2 rounded-full"></span>
            <span>Feiertage</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 bg-red-500 mr-2 rounded-full"></span>
            <span>Fehlende Daten</span>
          </div>
        </div>
        <div>
          <span className="text-xs">Zoom-Stufe: {
            zoomLevel === 1 ? "1 Jahr" : zoomLevel === 2 ? "6 Monate" : "3 Monate"
          }</span>
        </div>
      </div>
    </div>
  );
}

export default function DataAvailability() {
  // Datumsbereich festlegen (2022-01-01 bis heute)
  const startDate = new Date(2022, 0, 1); // 1. Januar 2022
  const endDate = new Date(); // Heute
  
  // State für aktuelle Ansicht
  const [activeView, setActiveView] = useState<"monthly" | "daily">("monthly");
  const [highlightedMonth, setHighlightedMonth] = useState<Date | undefined>(undefined);

  // Abfragen der Datenabdeckung für alle Datentypen
  const { data: dataCoverage, isLoading: isLoadingCoverage } = useQuery({
    queryKey: ["/api/data-coverage"],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      try {
        console.log("Fetching data coverage...");
        const token = localStorage.getItem("auth_token");
        const response = await axios.get<DataCoverageType[]>("/api/data-coverage", {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        });
        console.log("Data coverage response:", response.data);
        return response.data;
      } catch (error: any) {
        console.error("API Error:", error);
        throw new Error(error.response?.data?.error || error.message);
      }
    },
  });

  // Abfragen der monatlichen Transaktionsdaten für die Visualisierung
  const { data: monthlyTransactions, isLoading: isLoadingMonthlyData } = useQuery({
    queryKey: ["/api/data-coverage/monthly-transactions", startDate.toISOString(), endDate.toISOString()],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      try {
        console.log("Fetching monthly transaction data...");
        const token = localStorage.getItem("auth_token");
        const response = await axios.get("/api/data-coverage/monthly-transactions", {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        });
        console.log("Monthly transaction data response:", response.data);
        return response.data;
      } catch (error: any) {
        console.error("API Error beim Abrufen der monatlichen Transaktionsdaten:", error);
        throw new Error(error.response?.data?.error || error.message);
      }
    },
  });

  // Für die monatliche Ansicht: erzeuge ein Array mit allen Monaten im Bereich
  const monthsInRange = eachMonthOfInterval({
    start: startDate,
    end: endDate,
  });

  // Funktion zum Generieren der Visualisierungsdaten
  const generateMonthlyData = (): MonthlyDataPoint[] => {
    // Erstelle für jeden Monat einen Datenpunkt
    return monthsInRange.map(month => {
      // Extrahiere Werte aus den dataCoverage-Daten
      const weatherCoverage = dataCoverage?.find((d: DataCoverageType) => d.data_type === "weather");
      
      // Prüfe, ob dieser Monat innerhalb des verfügbaren Wetterdaten-Bereichs liegt
      const isInWeatherRange = weatherCoverage?.earliest_date && weatherCoverage?.latest_date 
        ? (month >= new Date(weatherCoverage.earliest_date) && month <= new Date(weatherCoverage.latest_date))
        : false;
      
      // Durchschnittliche Wetterdatenabdeckung für diesen Monat
      // Feste Abdeckung, könnte künftig durch präzisere tägliche Daten ersetzt werden
      const weatherDataPercentage = isInWeatherRange ? 100 : 0;
      
      // Finde die Transaktionsdaten für diesen Monat aus den API-Daten
      const monthStr = format(month, 'yyyy-MM');
      const transactionData = monthlyTransactions?.find(
        (item: any) => item.month === monthStr
      );
      
      // Transaktionsanzahl aus den API-Daten oder 0 wenn nicht vorhanden
      const transactionCount = transactionData?.transactionCount || 0;

      return {
        month: format(month, "MMM yyyy", { locale: de }),
        transactionCount: transactionCount,
        weatherDataPercentage: weatherDataPercentage,
        monthDate: month,
      };
    });
  };

  // Generiere Daten basierend auf den verfügbaren Informationen
  const monthlyData = !isLoadingMonthlyData && monthlyTransactions ? generateMonthlyData() : [];

  // Handler für den Export der Daten
  const handleExport = (format: "csv" | "excel") => {
    console.log(`Exportiere Daten im ${format}-Format`);
    // Implementierung des Datenexports hier
  };

  // Benutzerdefinierter Tooltip für den Chart
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-4 rounded-md shadow-md">
          <p className="font-semibold">{label}</p>
          <p className="text-sm">
            <span className="inline-block w-3 h-3 bg-blue-500 mr-2"></span>
            Transaktionen: {payload[0].value}
          </p>
          <p className="text-sm">
            <span className="inline-block w-3 h-3 bg-green-500 mr-2"></span>
            Wetterdaten: {payload[1].value}%
          </p>
        </div>
      );
    }
    return null;
  };

  // Rendere die Komponente
  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Datenverfügbarkeit</h1>
          <p className="text-muted-foreground">
            Überblick über die zeitliche Verfügbarkeit von Transaktions- und Wetterdaten
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExport("csv")}
          >
            <Download className="h-4 w-4 mr-2" />
            Als CSV exportieren
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExport("excel")}
          >
            <Download className="h-4 w-4 mr-2" />
            Als Excel exportieren
          </Button>
        </div>
      </div>

      {/* Datenabdeckungs-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Transaktions-Datenabdeckungs-Karte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Transaktionsdaten
            </CardTitle>
            <CardDescription>
              Verfügbarkeit und Statistiken zu Transaktionsdaten
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCoverage ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                {dataCoverage?.find((d: DataCoverageType) => d.data_type === "transaction") ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Datenabdeckung</span>
                        <span className="text-sm">{dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.coverage_percentage || 0}%</span>
                      </div>
                      <Progress 
                        value={dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.coverage_percentage || 0} 
                        className="h-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Frühestes Datum</p>
                        <p className="font-medium">
                          {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.earliest_date 
                            ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.earliest_date!), "dd.MM.yyyy")
                            : "Nicht verfügbar"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Neuestes Datum</p>
                        <p className="font-medium">
                          {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.latest_date 
                            ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.latest_date!), "dd.MM.yyyy")
                            : "Nicht verfügbar"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Datenpunkte</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.data_points.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Keine Transaktionsdaten verfügbar</AlertTitle>
                    <AlertDescription>
                      Es sind noch keine Transaktionsdaten synchronisiert worden.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Wetterdaten-Abdeckungs-Karte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudRain className="h-5 w-5" />
              Wetterdaten
            </CardTitle>
            <CardDescription>
              Verfügbarkeit und Statistiken zu historischen Wetterdaten
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCoverage ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                {dataCoverage?.find((d: DataCoverageType) => d.data_type === "weather") ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">Datenabdeckung</span>
                        <span className="text-sm">{dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.coverage_percentage || 0}%</span>
                      </div>
                      <Progress 
                        value={dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.coverage_percentage || 0} 
                        className="h-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Frühestes Datum</p>
                        <p className="font-medium">
                          {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.earliest_date 
                            ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.earliest_date!), "dd.MM.yyyy")
                            : "Nicht verfügbar"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Neuestes Datum</p>
                        <p className="font-medium">
                          {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.latest_date 
                            ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.latest_date!), "dd.MM.yyyy")
                            : "Nicht verfügbar"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Datenpunkte</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.data_points.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Keine Wetterdaten verfügbar</AlertTitle>
                    <AlertDescription>
                      Es sind noch keine Wetterdaten synchronisiert worden.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visualisierungstafel */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-xl">Zeitliche Datenverfügbarkeit</CardTitle>
              <CardDescription>
                Visualisierung der Transaktionsdaten und Wetterdaten über Zeit
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={activeView === "monthly" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveView("monthly")}
              >
                <BarChartIcon className="h-4 w-4 mr-2" />
                Monatlich
              </Button>
              <Button 
                variant={activeView === "daily" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveView("daily")}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                Tagesansicht
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeView === "monthly" ? (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  barGap={0}
                  barCategoryGap={8}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    angle={-45} 
                    textAnchor="end" 
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis yAxisId="left" orientation="left">
                    <Label 
                      value="Transaktionen" 
                      angle={-90} 
                      position="insideLeft" 
                      style={{ textAnchor: 'middle' }} 
                    />
                  </YAxis>
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    domain={[0, 100]}
                  >
                    <Label 
                      value="Wetterdaten (%)" 
                      angle={-90} 
                      position="insideRight" 
                      style={{ textAnchor: 'middle' }} 
                    />
                  </YAxis>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    yAxisId="left" 
                    dataKey="transactionCount" 
                    name="Transaktionen" 
                    fill="#3B82F6" 
                    radius={[4, 4, 0, 0]}
                    onClick={(data) => setHighlightedMonth(data.monthDate)}
                  >
                    {monthlyData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={highlightedMonth && 
                              entry.monthDate.getMonth() === highlightedMonth.getMonth() && 
                              entry.monthDate.getFullYear() === highlightedMonth.getFullYear() 
                                ? '#1E40AF' 
                                : '#3B82F6'} 
                      />
                    ))}
                  </Bar>
                  <Bar 
                    yAxisId="right" 
                    dataKey="weatherDataPercentage" 
                    name="Wetterdaten" 
                    fill="#10B981" 
                    radius={[4, 4, 0, 0]}
                  />
                  <ReferenceLine 
                    y={100} 
                    yAxisId="right" 
                    label="100%" 
                    stroke="#10B981" 
                    strokeDasharray="3 3" 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <DataTimelineChart />
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <p className="text-sm text-muted-foreground">
            Daten von {format(startDate, "dd.MM.yyyy")} bis {format(endDate, "dd.MM.yyyy")}
          </p>
          <p className="text-sm text-muted-foreground">
            Insgesamt {differenceInMonths(endDate, startDate)} Monate
          </p>
        </CardFooter>
      </Card>

      {/* Erklärungstext */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Hinweise zur Datenverfügbarkeit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>
              Diese Visualisierung zeigt die Verfügbarkeit und Datendichte von Transaktions- und Wetterdaten im Zeitverlauf,
              beginnend vom 1. Januar 2022 bis zum heutigen Tag.
            </p>
            <div>
              <h3 className="font-medium mb-1">Erklärung der Daten:</h3>
              <ul className="list-disc list-inside space-y-1 pl-4">
                <li>
                  <span className="font-medium">Transaktionen (blaue Balken):</span> Die Anzahl der Transaktionen pro Monat.
                  Fehlende Balken bedeuten, dass für diesen Zeitraum keine Transaktionsdaten verfügbar sind.
                </li>
                <li>
                  <span className="font-medium">Wetterdaten (grüne Balken):</span> Der Prozentsatz der für diesen Monat verfügbaren
                  Wetterdaten. 100% bedeutet, dass für jeden Tag des Monats vollständige Wetterdaten vorhanden sind.
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-1">Verwendungszweck:</h3>
              <p>
                Diese Übersicht hilft dabei, Datenlücken zu identifizieren und sicherzustellen, dass für Analysen
                und Prognosen ein vollständiger Datensatz verwendet wird. Fehlende Daten könnten zu ungenauen
                Ergebnissen führen.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
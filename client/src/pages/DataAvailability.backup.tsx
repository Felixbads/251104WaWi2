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
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Line,
  ComposedChart,
  Cell,
  Label
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  LayoutGrid, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ShieldAlert, 
  CloudRain, 
  Clock, 
  Package, 
  Calendar as CalendarIcon2,
  AlertTriangle,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { TooltipProps } from "recharts";

// Typendefinitionen
interface DataCoverageType {
  data_type: string;
  coverage_percentage: number;
  data_points: number;
  earliest_date: string;
  latest_date: string;
  days_with_data: number;
  total_days: number;
}

interface MonthlyDataPoint {
  month: Date;
  formattedMonth: string;
  transactionCount: number;
  transactionCoverage: number;
  weatherCoverage: number;
  holidayCoverage: number;
  hasHoliday: boolean;
  holidayName?: string;
}

interface DailyDataPoint {
  date: Date;
  formattedDate: string;
  hasTransactionData: boolean;
  hasWeatherData: boolean;
  hasHolidayData: boolean;
  holidayName?: string;
  dummy: string;
}

// Timeline-Komponente für tägliche Datenabdeckung
function DataAvailabilityTimeline({ dataCoverage }: { dataCoverage: DataCoverageType[] | undefined }) {
  // Datumsbereich festlegen
  const startDate = new Date(2022, 0, 1); // 1. Januar 2022
  const endDate = new Date();
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = letztes Jahr, 2 = letzte 6 Monate, 3 = letzten 3 Monate
  const [zoomStart, setZoomStart] = useState<Date>(new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1));
  
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
  const timelineData = dataCoverage ? generateTimelineData() : [];
  
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
        console.log("Fetching monthly transactions...");
        const token = localStorage.getItem("auth_token");
        const response = await axios.get("/api/data-coverage/monthly-transactions", {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        });
        console.log("Monthly transactions response:", response.data);
        return response.data;
      } catch (error: any) {
        console.error("API Error:", error);
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
      
      // Transaktionsabdeckung in Prozent - Dummy-Wert, könnte in Zukunft
      // präzisere Abdeckungsberechnung pro Monat haben
      const transactionCoverage = transactionData ? 
        (transactionData.daysWithData / transactionData.daysInMonth * 100) : 0;
      
      // Feiertage prüfen
      const holidayCoverage = dataCoverage?.find((d: DataCoverageType) => d.data_type === "holiday");
      const isInHolidayRange = holidayCoverage?.earliest_date && holidayCoverage?.latest_date 
        ? (month >= new Date(holidayCoverage.earliest_date) && month <= new Date(holidayCoverage.latest_date))
        : false;
      
      const holidayCoveragePercentage = isInHolidayRange ? 100 : 0;
      
      return {
        month,
        formattedMonth: format(month, 'MMM yyyy', { locale: de }),
        transactionCount,
        transactionCoverage,
        weatherCoverage: weatherDataPercentage,
        holidayCoverage: holidayCoveragePercentage,
        hasHoliday: false, // Dies könnte künftig mit tatsächlichen Feiertagsdaten befüllt werden
      };
    });
  };

  // Generiere Daten basierend auf den verfügbaren Informationen
  const monthlyData = !isLoadingMonthlyData && monthlyTransactions ? generateMonthlyData() : [];

  // Feiertagsdaten erhalten
  const { data: holidays, isLoading: isLoadingHolidays } = useQuery({
    queryKey: ["/api/holidays", startDate.toISOString(), endDate.toISOString()],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    gcTime: 24 * 60 * 60 * 1000,
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
        console.error("API Error:", error);
        throw new Error(error.response?.data?.error || error.message);
      }
    },
  });

  // Benutzerdefinierter Tooltip für die Monatsansicht
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MonthlyDataPoint;
      return (
        <div className="bg-background border border-border p-3 rounded-md shadow-md">
          <p className="font-medium">{data.formattedMonth}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm flex items-center">
              <span className="inline-block w-3 h-3 bg-blue-500 mr-2 rounded-full"></span>
              <span>Transaktionen: {data.transactionCount.toLocaleString("de-DE")}</span>
            </p>
            <p className="text-sm flex items-center">
              <span className="inline-block w-3 h-3 bg-green-500 mr-2 rounded-full"></span>
              <span>Wetterdaten: {data.weatherCoverage}% Abdeckung</span>
            </p>
            <p className="text-sm flex items-center">
              <span className="inline-block w-3 h-3 bg-amber-500 mr-2 rounded-full"></span>
              <span>Feiertage: {data.holidayCoverage}% Abdeckung</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleMonthClick = (month: Date) => {
    // Highlight des ausgewählten Monats toggeln
    setHighlightedMonth(highlightedMonth && isSameDay(new Date(highlightedMonth), new Date(month)) ? undefined : month);
  };
  
  // Custom Click Handler für Balken
  const handleBarClick = (data: any) => {
    const monthDate = data.month;
    handleMonthClick(monthDate);
  };

  const renderMonthlyChart = () => (
    <div className="h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={monthlyData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          onClick={(data) => data && data.activePayload && handleBarClick(data.activePayload[0].payload)}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="formattedMonth" 
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            yAxisId="left"
            domain={[0, 'dataMax']}
            allowDecimals={false}
            tickFormatter={(value) => value.toLocaleString("de-DE")}
          >
            <Label value="Transaktionen" position="insideLeft" angle={-90} style={{ textAnchor: 'middle' }} />
          </YAxis>
          <YAxis 
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
          >
            <Label value="Abdeckung (%)" position="insideRight" angle={-90} style={{ textAnchor: 'middle' }} />
          </YAxis>
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="transactionCount"
            fill="#3b82f6"
            name="Transaktionen"
            yAxisId="left"
            radius={[4, 4, 0, 0]}
          >
            {monthlyData.map((entry, index) => {
              const isHighlighted = highlightedMonth && isSameDay(new Date(startOfMonth(highlightedMonth)), new Date(startOfMonth(entry.month)));
              return (
                <Cell 
                  key={`cell-${index}`} 
                  fill={isHighlighted ? "#2563eb" : "#3b82f6"} 
                  strokeWidth={isHighlighted ? 2 : 0}
                  stroke={isHighlighted ? "#1e40af" : "none"}
                />
              );
            })}
          </Bar>
          <Line 
            type="monotone" 
            dataKey="transactionCoverage" 
            name="Transaktionsabdeckung" 
            stroke="#ef4444" 
            yAxisId="right"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line 
            type="monotone" 
            dataKey="weatherCoverage" 
            name="Wetterdatenabdeckung" 
            stroke="#22c55e" 
            yAxisId="right"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line 
            type="monotone" 
            dataKey="holidayCoverage" 
            name="Feiertagsabdeckung" 
            stroke="#f59e0b" 
            yAxisId="right"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
  
  const renderDailyChart = () => {
    // Wenn ein Monat ausgewählt, zeige nur diesen Monat an
    if (!highlightedMonth) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>Bitte wähle oben einen Monat aus, um tägliche Daten zu sehen.</p>
        </div>
      );
    }
    
    return (
      <div className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Tägliche Daten für {format(highlightedMonth, 'MMMM yyyy', { locale: de })}</CardTitle>
                <CardDescription>Transaktionen pro Tag mit Wetter- und Feiertagsinformationen</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHighlightedMonth(undefined)}
              >
                Zurück zur Übersicht
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={new Date()}
              month={highlightedMonth}
              onMonthChange={setHighlightedMonth}
              className="rounded-md"
              fixedWeeks
            />
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="container px-4 py-8 max-w-7xl mx-auto">
      <div className="space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Datenverfügbarkeit</h2>
        <p className="text-muted-foreground">
          Überblick über vorhandene Daten im System für Analyse und Prognosen
        </p>
      </div>
      
      <div className="grid gap-6">
        {isLoadingCoverage ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <Skeleton className="h-[300px] w-full" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : dataCoverage ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <Package className="mr-2 h-5 w-5 text-blue-500" />
                    Transaktionsdaten
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-2">
                    <span>Datenabdeckung</span>
                    <span className="text-sm">{dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.coverage_percentage || 0}%</span>
                  </div>
                  <Progress 
                    value={dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.coverage_percentage || 0} 
                    className="h-2 mb-4"
                  />
                  
                  <div className="text-sm grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground">Erster Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.earliest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.earliest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Letzter Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.latest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.latest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Datenpunkte</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.data_points.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tage mit Daten</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "transaction")?.days_with_data.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Wetterdaten-Karte */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <CloudRain className="mr-2 h-5 w-5 text-green-500" />
                    Wetterdaten
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-2">
                    <span>Datenabdeckung</span>
                    <span className="text-sm">{dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.coverage_percentage || 0}%</span>
                  </div>
                  <Progress 
                    value={dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.coverage_percentage || 0} 
                    className="h-2 mb-4"
                  />
                  
                  <div className="text-sm grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground">Erster Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.earliest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.earliest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Letzter Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.latest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.latest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Datenpunkte</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.data_points.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tage mit Daten</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "weather")?.days_with_data.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Feiertagsdaten-Karte */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <CalendarIcon2 className="mr-2 h-5 w-5 text-amber-500" />
                    Feiertagsdaten
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-2">
                    <span>Datenabdeckung</span>
                    <span className="text-sm">{dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.coverage_percentage || 0}%</span>
                  </div>
                  <Progress 
                    value={dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.coverage_percentage || 0} 
                    className="h-2 mb-4"
                  />
                  
                  <div className="text-sm grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground">Erster Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.earliest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.earliest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Letzter Datensatz</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.latest_date 
                          ? format(new Date(dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.latest_date!), "dd.MM.yyyy")
                          : "Keine Daten"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Feiertage</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.data_points.toLocaleString("de-DE") || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Jahre abgedeckt</p>
                      <p className="font-medium">
                        {dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")?.days_with_data 
                          ? Math.ceil(dataCoverage.find((d: DataCoverageType) => d.data_type === "holiday")!.days_with_data / 365)
                          : 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Visualisierungen */}
            <Tabs defaultValue="monthly" className="w-full" onValueChange={(value) => setActiveView(value as "monthly" | "daily")}>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="monthly">
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Monatlich
                </TabsTrigger>
                <TabsTrigger value="daily">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Täglich
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="monthly" className="pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Monatliche Datenübersicht</CardTitle>
                    <CardDescription>
                      Transaktionen pro Monat mit Datenabdeckung für verschiedene Datentypen
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingMonthlyData ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : monthlyData.length > 0 ? (
                      renderMonthlyChart()
                    ) : (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Keine Daten verfügbar</AlertTitle>
                        <AlertDescription>
                          Es konnten keine monatlichen Transaktionsdaten gefunden werden.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 justify-between items-center text-sm text-muted-foreground">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 bg-blue-500 mr-2 rounded-full"></span>
                        <span>Transaktionen</span>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 border border-red-500 mr-2 rounded-full"></span>
                        <span>Transaktionsabdeckung</span>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 border border-green-500 mr-2 rounded-full"></span>
                        <span>Wetterdaten</span>
                      </div>
                    </div>
                    <div>
                      <span>Klicke auf einen Monat für Details</span>
                    </div>
                  </CardFooter>
                </Card>
                
                {/* Tägliche Ansicht des ausgewählten Monats, wenn ein Monat angeklickt wurde */}
                {activeView === "monthly" && highlightedMonth && renderDailyChart()}
              </TabsContent>
              
              <TabsContent value="daily" className="pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Tägliche Datenverfügbarkeit</CardTitle>
                    <CardDescription>
                      Detaillierte Übersicht der verfügbaren Daten pro Tag
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingCoverage ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : (
                      <DataAvailabilityTimeline dataCoverage={dataCoverage} />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Keine Daten verfügbar</AlertTitle>
            <AlertDescription>
              Es konnten keine Informationen zur Datenabdeckung geladen werden.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
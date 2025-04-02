import { useState, useEffect } from "react";
import { format, parse, eachMonthOfInterval, addMonths, startOfMonth, endOfMonth, differenceInMonths } from "date-fns";
import { de } from "date-fns/locale";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine,
  Label,
  TooltipProps
} from "recharts";
import { 
  Calendar as CalendarIcon, 
  BarChart as BarChartIcon, 
  CloudRain, 
  ShoppingCart, 
  ClipboardList,
  Download,
  Info
} from "lucide-react";

// Typ-Definitionen
interface DataPoint {
  date: string;
  transactionCount: number;
  weatherDataAvailable: boolean;
  transactionCoverage: number;
  weatherCoverage: number;
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
    queryKey: ["/api/data-coverage/monthly-transactions", startDate, endDate],
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
            <div className="flex flex-col items-center">
              <p className="mb-4 text-center text-muted-foreground">
                Wählen Sie einen Monat, um die tägliche Verteilung der Daten anzuzeigen.
              </p>
              <Calendar
                mode="single"
                selected={highlightedMonth}
                onSelect={setHighlightedMonth}
                initialFocus
                disabled={(date) => 
                  date < startDate || 
                  date > endDate || 
                  date.getDate() !== 1
                }
                formatters={{
                  formatCaption: (date, options) => format(date, "MMMM yyyy", { locale: de }),
                }}
              />
              {highlightedMonth && (
                <div className="mt-4 w-full">
                  <h3 className="text-lg font-medium mb-2">
                    Detailansicht für {format(highlightedMonth, "MMMM yyyy", { locale: de })}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Diese Ansicht würde detaillierte tägliche Daten für den ausgewählten Monat zeigen.
                  </p>
                  <div className="bg-muted p-6 rounded-md text-center">
                    <p>Diese Funktion ist in der aktuellen Version noch nicht implementiert.</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Die Implementierung würde eine API für tägliche Datenabfragen erfordern.
                    </p>
                  </div>
                </div>
              )}
            </div>
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
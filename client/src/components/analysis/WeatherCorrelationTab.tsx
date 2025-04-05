import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, Download, CloudRain, Sun, Wind, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/utils";
import axios from "axios";

interface WeatherCorrelationTabProps {
  buildQueryUrl: (endpoint: string) => string;
}

interface DailyData {
  date: string;
  sales: {
    transactions: number;
    revenue: number;
  };
  weather: {
    avgTemp: number | null;
    maxTemp: number | null;
    minTemp: number | null;
    avgHumidity: number | null;
    avgClouds: number | null;
    totalPrecipitation: number;
    avgWindSpeed: number | null;
    dominantWeather: string | null;
  };
}

interface CorrelationData {
  correlation: number;
  dataPoints: { x: number; y: number }[];
}

interface SalesByWeatherType {
  [key: string]: {
    transactions: number;
    revenue: number;
    days: number;
    avgTransactions?: number;
    avgRevenue?: number;
  };
}

interface ApiResponse {
  dailyData: DailyData[];
  correlations: {
    temperature: CorrelationData;
    humidity: CorrelationData;
    precipitation: CorrelationData;
  };
  salesByWeatherType: SalesByWeatherType;
  metadata: {
    period: string;
    startDate: string;
    endDate: string;
    daysAnalyzed: number;
    lastUpdated: string;
  };
}

export default function WeatherCorrelationTab({ buildQueryUrl }: WeatherCorrelationTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // URL mit Benutzertoken erstellen
        const url = buildQueryUrl('/api/statistics/weather-correlation');
        
        // Daten abrufen
        const response = await axios.get<ApiResponse>(url);
        setData(response.data);
      } catch (err) {
        console.error("Fehler beim Laden der Wetter-Korrelationsdaten:", err);
        setError("Die Wetter-Korrelationsdaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [buildQueryUrl]);
  
  function handleExport() {
    if (!data) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Titel
    doc.setFontSize(16);
    doc.text("Wetter-Umsatz-Korrelationsanalyse", pageWidth / 2, 20, { align: "center" });
    
    // Metadaten
    doc.setFontSize(10);
    doc.text(`Zeitraum: ${data.metadata.period}`, 14, 30);
    doc.text(`Von: ${data.metadata.startDate} bis: ${data.metadata.endDate}`, 14, 35);
    doc.text(`Analysierte Tage: ${data.metadata.daysAnalyzed}`, 14, 40);
    doc.text(`Erstellt am: ${data.metadata.lastUpdated}`, 14, 45);
    
    // Korrelationen
    doc.setFontSize(12);
    doc.text("Korrelationswerte:", 14, 55);
    doc.setFontSize(10);
    doc.text(`Temperatur zu Umsatz: ${data.correlations.temperature.correlation?.toFixed(2) || 'N/A'}`, 14, 60);
    doc.text(`Luftfeuchtigkeit zu Umsatz: ${data.correlations.humidity.correlation?.toFixed(2) || 'N/A'}`, 14, 65);
    doc.text(`Niederschlag zu Umsatz: ${data.correlations.precipitation.correlation?.toFixed(2) || 'N/A'}`, 14, 70);
    
    // Umsatz nach Wettertyp
    doc.setFontSize(12);
    doc.text("Umsatz nach Wettertyp:", 14, 80);
    doc.setFontSize(9);
    
    let yPos = 85;
    Object.entries(data.salesByWeatherType).forEach(([weatherType, salesData], index) => {
      doc.text(`${index + 1}. ${weatherType}`, 14, yPos);
      doc.text(`Ø Umsatz: ${formatCurrency(salesData.avgRevenue || 0)} (${salesData.days} Tage)`, 100, yPos);
      yPos += 5;
    });
    
    // PDF speichern
    doc.save("Wetter_Umsatz_Korrelation.pdf");
  }
  
  if (isLoading) {
    return (
      <div className="flex flex-col space-y-4">
        <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
        </div>
        <div className="animate-pulse h-60 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>Keine Daten verfügbar.</AlertDescription>
      </Alert>
    );
  }

  // Korrelationsinterpretation
  const interpretCorrelation = (correlation: number | undefined) => {
    if (correlation === undefined) return { strength: "Unbekannt", description: "Keine Daten verfügbar." };
    
    const absCorrelation = Math.abs(correlation);
    
    if (absCorrelation >= 0.7) {
      return {
        strength: "Stark",
        description: correlation > 0 
          ? "Starker positiver Zusammenhang: Wenn dieser Wetterfaktor steigt, steigt auch der Umsatz deutlich."
          : "Starker negativer Zusammenhang: Wenn dieser Wetterfaktor steigt, sinkt der Umsatz deutlich."
      };
    } else if (absCorrelation >= 0.3) {
      return {
        strength: "Moderat",
        description: correlation > 0 
          ? "Moderater positiver Zusammenhang: Wenn dieser Wetterfaktor steigt, steigt auch der Umsatz in gewissem Maße."
          : "Moderater negativer Zusammenhang: Wenn dieser Wetterfaktor steigt, sinkt der Umsatz in gewissem Maße."
      };
    } else {
      return {
        strength: "Schwach",
        description: correlation > 0 
          ? "Schwacher positiver Zusammenhang: Nur ein leichter Einfluss auf den Umsatz ist erkennbar."
          : "Schwacher negativer Zusammenhang: Nur ein leichter Einfluss auf den Umsatz ist erkennbar."
      };
    }
  };
  
  // Farbe basierend auf Korrelationsstärke
  const getCorrelationColor = (correlation: number | undefined) => {
    if (correlation === undefined) return "text-gray-500";
    
    const absCorrelation = Math.abs(correlation);
    
    if (absCorrelation >= 0.7) {
      return correlation > 0 ? "text-green-600" : "text-red-600";
    } else if (absCorrelation >= 0.3) {
      return correlation > 0 ? "text-green-500" : "text-red-500";
    } else {
      return correlation > 0 ? "text-green-400" : "text-red-400";
    }
  };
  
  // Wettertyp-Icon anzeigen
  const getWeatherTypeIcon = (weatherType: string) => {
    switch (weatherType.toLowerCase()) {
      case 'rain':
      case 'drizzle':
      case 'shower':
        return <CloudRain className="h-5 w-5 text-blue-500" />;
      case 'clear':
      case 'sunny':
        return <Sun className="h-5 w-5 text-amber-500" />;
      case 'clouds':
      case 'cloudy':
      case 'overcast':
        return <CloudRain className="h-5 w-5 text-gray-500" />;
      case 'wind':
      case 'windy':
        return <Wind className="h-5 w-5 text-blue-400" />;
      default:
        return <Thermometer className="h-5 w-5 text-orange-500" />;
    }
  };
  
  // Wettertyp-Label übersetzen
  const translateWeatherType = (weatherType: string) => {
    const translations: Record<string, string> = {
      'clear': 'Klar',
      'clouds': 'Bewölkt',
      'rain': 'Regen',
      'drizzle': 'Nieselregen',
      'shower': 'Schauer',
      'thunderstorm': 'Gewitter',
      'snow': 'Schnee',
      'mist': 'Nebel',
      'fog': 'Nebel',
      'haze': 'Dunst',
      'dust': 'Staub',
      'smoke': 'Rauch',
      'sunny': 'Sonnig',
      'partly cloudy': 'Teilweise bewölkt',
      'overcast': 'Bedeckt',
      'windy': 'Windig'
    };
    
    return translations[weatherType.toLowerCase()] || weatherType;
  };
  
  // Interpretation der Temperaturkorrelation
  const tempCorrelation = interpretCorrelation(data.correlations.temperature.correlation);
  const humidityCorrelation = interpretCorrelation(data.correlations.humidity.correlation);
  const precipitationCorrelation = interpretCorrelation(data.correlations.precipitation.correlation);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Wetter-Umsatz-Korrelationsanalyse</h3>
          <p className="text-sm text-muted-foreground">
            Zeitraum: {data.metadata.period} | {data.metadata.daysAnalyzed} Tage analysiert | Letzte Aktualisierung: {data.metadata.lastUpdated}
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportieren
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Thermometer className="h-5 w-5 mr-2 text-red-500" />
              Temperatur
            </CardTitle>
            <CardDescription>Einfluss auf den Umsatz</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getCorrelationColor(data.correlations.temperature.correlation)}`}>
              {data.correlations.temperature.correlation?.toFixed(2) || 'N/A'} 
              <span className="text-base font-normal text-muted-foreground ml-2">
                Korrelation
              </span>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{tempCorrelation.strength} </span>
              <span className="text-muted-foreground">{tempCorrelation.description}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CloudRain className="h-5 w-5 mr-2 text-blue-500" />
              Niederschlag
            </CardTitle>
            <CardDescription>Einfluss auf den Umsatz</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getCorrelationColor(data.correlations.precipitation.correlation)}`}>
              {data.correlations.precipitation.correlation?.toFixed(2) || 'N/A'} 
              <span className="text-base font-normal text-muted-foreground ml-2">
                Korrelation
              </span>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{precipitationCorrelation.strength} </span>
              <span className="text-muted-foreground">{precipitationCorrelation.description}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Wind className="h-5 w-5 mr-2 text-blue-400" />
              Luftfeuchtigkeit
            </CardTitle>
            <CardDescription>Einfluss auf den Umsatz</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getCorrelationColor(data.correlations.humidity.correlation)}`}>
              {data.correlations.humidity.correlation?.toFixed(2) || 'N/A'} 
              <span className="text-base font-normal text-muted-foreground ml-2">
                Korrelation
              </span>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{humidityCorrelation.strength} </span>
              <span className="text-muted-foreground">{humidityCorrelation.description}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Umsatz nach Wettertyp</CardTitle>
          <CardDescription>Durchschnittlicher Umsatz bei verschiedenen Wetterbedingungen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(data.salesByWeatherType).map(([weatherType, salesData]) => (
              <div 
                key={weatherType} 
                className="p-4 border rounded-lg bg-white shadow-sm hover:shadow transition-shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  {getWeatherTypeIcon(weatherType)}
                  <h4 className="font-medium">{translateWeatherType(weatherType)}</h4>
                </div>
                <div className="text-lg font-bold">
                  {formatCurrency(salesData.avgRevenue || 0)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">Ø/Tag</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {salesData.avgTransactions?.toFixed(1) || '0'} Transaktionen/Tag
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Basierend auf {salesData.days} Tagen
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Temperatur-Umsatz-Beziehung</CardTitle>
            <CardDescription>
              Korrelation: <span className={getCorrelationColor(data.correlations.temperature.correlation)}>
                {data.correlations.temperature.correlation?.toFixed(2) || 'N/A'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              {tempCorrelation.description}
            </div>
            <div className="pl-4 space-y-3 border-l-2 border-red-100">
              <div className="flex justify-between">
                <span className="font-medium">Umsatz bei niedrigen Temperaturen</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByTemp(data.dailyData, 'low'))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Umsatz bei mittleren Temperaturen</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByTemp(data.dailyData, 'medium'))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Umsatz bei hohen Temperaturen</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByTemp(data.dailyData, 'high'))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Niederschlag-Umsatz-Beziehung</CardTitle>
            <CardDescription>
              Korrelation: <span className={getCorrelationColor(data.correlations.precipitation.correlation)}>
                {data.correlations.precipitation.correlation?.toFixed(2) || 'N/A'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              {precipitationCorrelation.description}
            </div>
            <div className="pl-4 space-y-3 border-l-2 border-blue-100">
              <div className="flex justify-between">
                <span className="font-medium">Umsatz an Tagen ohne Niederschlag</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByPrecipitation(data.dailyData, 'none'))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Umsatz an Tagen mit leichtem Niederschlag</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByPrecipitation(data.dailyData, 'light'))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Umsatz an Tagen mit starkem Niederschlag</span>
                <span className="font-medium">
                  {formatCurrency(findAvgRevenueByPrecipitation(data.dailyData, 'heavy'))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Hilfsfunktion, um den durchschnittlichen Umsatz nach Temperaturkategorie zu ermitteln
function findAvgRevenueByTemp(dailyData: DailyData[], category: 'low' | 'medium' | 'high'): number {
  // Sammle alle Temperaturen, um Min/Max zu ermitteln
  const allTemps = dailyData
    .map(day => day.weather.avgTemp)
    .filter((temp): temp is number => temp !== null);
  
  if (allTemps.length === 0) return 0;
  
  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);
  const tempRange = maxTemp - minTemp;
  
  // Definiere Temperaturbereiche
  const lowMax = minTemp + tempRange / 3;
  const mediumMax = minTemp + (tempRange * 2) / 3;
  
  // Filtere Tage nach Temperaturkategorie
  let filteredDays: DailyData[];
  
  if (category === 'low') {
    filteredDays = dailyData.filter(day => 
      day.weather.avgTemp !== null && day.weather.avgTemp <= lowMax
    );
  } else if (category === 'medium') {
    filteredDays = dailyData.filter(day => 
      day.weather.avgTemp !== null && day.weather.avgTemp > lowMax && day.weather.avgTemp <= mediumMax
    );
  } else {
    filteredDays = dailyData.filter(day => 
      day.weather.avgTemp !== null && day.weather.avgTemp > mediumMax
    );
  }
  
  // Berechne Durchschnittsumsatz
  if (filteredDays.length === 0) return 0;
  
  const totalRevenue = filteredDays.reduce((sum, day) => sum + day.sales.revenue, 0);
  return totalRevenue / filteredDays.length;
}

// Hilfsfunktion, um den durchschnittlichen Umsatz nach Niederschlagskategorie zu ermitteln
function findAvgRevenueByPrecipitation(dailyData: DailyData[], category: 'none' | 'light' | 'heavy'): number {
  // Definiere Niederschlagskategorien
  const noneMax = 0.1; // 0-0.1mm gilt als kein Niederschlag
  const lightMax = 5;  // 0.1-5mm gilt als leichter Niederschlag
  
  // Filtere Tage nach Niederschlagskategorie
  let filteredDays: DailyData[];
  
  if (category === 'none') {
    filteredDays = dailyData.filter(day => 
      day.weather.totalPrecipitation <= noneMax
    );
  } else if (category === 'light') {
    filteredDays = dailyData.filter(day => 
      day.weather.totalPrecipitation > noneMax && day.weather.totalPrecipitation <= lightMax
    );
  } else {
    filteredDays = dailyData.filter(day => 
      day.weather.totalPrecipitation > lightMax
    );
  }
  
  // Berechne Durchschnittsumsatz
  if (filteredDays.length === 0) return 0;
  
  const totalRevenue = filteredDays.reduce((sum, day) => sum + day.sales.revenue, 0);
  return totalRevenue / filteredDays.length;
}
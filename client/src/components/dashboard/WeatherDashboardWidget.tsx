import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Cloud, 
  Sun, 
  CloudRain, 
  CloudSnow, 
  Wind, 
  Droplets, 
  Thermometer,
  MapPin 
} from 'lucide-react';
import { getDashboardWeatherData, type DashboardWeatherData } from '@/lib/api';

interface WeatherDashboardWidgetProps {
  className?: string;
}

export default function WeatherDashboardWidget({ className }: WeatherDashboardWidgetProps) {
  const { data: weatherData, isLoading, error } = useQuery({
    queryKey: ['/api/dashboard/weather'],
    queryFn: getDashboardWeatherData,
    refetchInterval: 300000, // Alle 5 Minuten aktualisieren
    staleTime: 240000, // 4 Minuten als "frisch" betrachten
  });

  const getWeatherIcon = (iconCode: string) => {
    // Vereinfachte Icon-Zuordnung basierend auf OpenWeather Icon Codes
    if (iconCode.includes('01')) return <Sun className="h-6 w-6 text-yellow-500" />;
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) return <Cloud className="h-6 w-6 text-gray-500" />;
    if (iconCode.includes('09') || iconCode.includes('10') || iconCode.includes('11')) return <CloudRain className="h-6 w-6 text-blue-500" />;
    if (iconCode.includes('13')) return <CloudSnow className="h-6 w-6 text-blue-200" />;
    return <Cloud className="h-6 w-6 text-gray-500" />;
  };

  const formatTemperature = (temp: number) => {
    return `${Math.round(temp)}°C`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short', 
      day: '2-digit', 
      month: 'short' 
    });
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Cloud className="h-5 w-5 mr-2 text-blue-500" />
            Wetter
          </CardTitle>
          <CardDescription>Aktuelle Wetterdaten und Vorhersage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weatherData) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Cloud className="h-5 w-5 mr-2 text-blue-500" />
            Wetter
          </CardTitle>
          <CardDescription>Aktuelle Wetterdaten und Vorhersage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Cloud className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>Wetterdaten nicht verfügbar</p>
            <p className="text-sm">Überprüfen Sie die Internetverbindung</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <Cloud className="h-5 w-5 mr-2 text-blue-500" />
          Wetter
        </CardTitle>
        <CardDescription className="flex items-center">
          <MapPin className="h-3 w-3 mr-1" />
          {weatherData.current.location}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aktuelle Wetterdaten */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Temperatur und Beschreibung */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold flex items-center">
                  {getWeatherIcon(weatherData.current.icon)}
                  <span className="ml-2">{formatTemperature(weatherData.current.temperature)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {weatherData.current.description}
                </p>
              </div>
            </div>
          </div>

          {/* Weitere Details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center">
                <Droplets className="h-4 w-4 mr-2 text-blue-500" />
                <span className="text-sm">Luftfeuchtigkeit</span>
              </div>
              <Badge variant="outline">{weatherData.current.humidity}%</Badge>
            </div>
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center">
                <Wind className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-sm">Wind</span>
              </div>
              <Badge variant="outline">{weatherData.current.windSpeed} km/h</Badge>
            </div>
          </div>
        </div>

        {/* 5-Tage-Vorhersage */}
        <div>
          <h4 className="text-sm font-medium mb-3 text-muted-foreground">5-Tage-Vorhersage</h4>
          <div className="grid grid-cols-5 gap-2">
            {weatherData.forecast.slice(0, 5).map((day, index) => (
              <div 
                key={index} 
                className="text-center bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {formatDate(day.date)}
                </div>
                <div className="flex justify-center mb-1">
                  {getWeatherIcon(day.icon)}
                </div>
                <div className="text-xs">
                  <div className="font-medium">{formatTemperature(day.temperature.max)}</div>
                  <div className="text-muted-foreground">{formatTemperature(day.temperature.min)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Wettereinfluss auf Verkäufe */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <div className="flex items-center">
            <Thermometer className="h-4 w-4 mr-2 text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Wettereinfluss
            </span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {weatherData.current.temperature > 20 
              ? "Warmes Wetter → Erhöhte Nachfrage nach Getränken erwartet" 
              : weatherData.current.temperature < 5
              ? "Kaltes Wetter → Warme Getränke und Snacks bevorzugt"
              : "Moderates Wetter → Normale Verkaufsmuster erwartet"
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
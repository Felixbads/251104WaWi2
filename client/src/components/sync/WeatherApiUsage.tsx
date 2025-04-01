import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWeatherApiUsage, WeatherApiUsage } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { CloudRain, Loader2 } from 'lucide-react';

export const WeatherApiUsageCard: React.FC = () => {
  // Fetch weather API usage
  const { data: weatherApiUsage, isLoading: isLoadingWeatherApiUsage } = useQuery<WeatherApiUsage>({
    queryKey: ['/api/weather/api-usage'],
    refetchInterval: 60000, // Refetch every minute
  });

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center">
          <CloudRain className="h-4 w-4 mr-2" />
          OpenWeather API-Nutzung
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoadingWeatherApiUsage ? (
          <div className="flex items-center space-x-2 mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">Lade API-Nutzungsstatistiken...</p>
          </div>
        ) : weatherApiUsage ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">
                {weatherApiUsage.remaining}/{weatherApiUsage.limit} API-Anfragen verfügbar
              </span>
              <span className="text-xs text-gray-500">
                {weatherApiUsage.percentage}% verbraucht
              </span>
            </div>
            <Progress 
              value={weatherApiUsage.percentage} 
              className="h-2 mb-1" 
            />
            <p className="text-xs text-gray-500 mt-1">
              Limit wird zurückgesetzt am: {weatherApiUsage.resetDate ? new Date(weatherApiUsage.resetDate).toLocaleString('de-DE') : 'Unbekannt'}
            </p>
            {weatherApiUsage.percentage > 90 && (
              <Alert className="mt-2 bg-yellow-50 border-yellow-200 text-yellow-800">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Achtung</AlertTitle>
                <AlertDescription>
                  Das API-Limit ist fast erreicht. Bitte warten Sie, bis das Limit zurückgesetzt wird.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <p className="text-sm">Keine API-Nutzungsdaten verfügbar.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherApiUsageCard;
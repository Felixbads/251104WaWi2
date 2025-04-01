import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentWeather, CurrentWeather as CurrentWeatherType } from '@/lib/api/weather';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Droplets, Info, Sun, SunDim, Thermometer, Wind } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface CurrentWeatherCardProps {
  showTitle?: boolean;
  className?: string;
  compact?: boolean;
}

// Wettericon basierend auf OpenWeather-Icons
function WeatherIcon({ icon, description, className = 'h-12 w-12' }: { icon: string; description: string; className?: string }) {
  // Icon und Farbe basierend auf OpenWeather-Icon-Code
  const getIcon = () => {
    switch (icon.substring(0, 2)) {
      case '01': // Klarer Himmel
        return <Sun className={className} style={{ color: '#FFB300' }} />;
      case '02': // Wenige Wolken
        return <SunDim className={className} style={{ color: '#FFB300' }} />;
      case '03': // Aufgelockerte Bewölkung
      case '04': // Bewölkt
        return <Cloud className={className} style={{ color: '#78909C' }} />;
      case '09': // Nieselregen
        return <CloudDrizzle className={className} style={{ color: '#78909C' }} />;
      case '10': // Regen
        return <CloudRain className={className} style={{ color: '#78909C' }} />;
      case '11': // Gewitter
        return <CloudLightning className={className} style={{ color: '#546E7A' }} />;
      case '13': // Schnee
        return <CloudSnow className={className} style={{ color: '#90A4AE' }} />;
      case '50': // Nebel
        return <CloudFog className={className} style={{ color: '#B0BEC5' }} />;
      default:
        return <Sun className={className} style={{ color: '#FFB300' }} />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">{getIcon()}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hauptkomponente für das aktuelle Wetter
const CurrentWeatherCard: React.FC<CurrentWeatherCardProps> = ({ 
  showTitle = true,
  className = "",
  compact = false
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['current-weather'],
    queryFn: () => getCurrentWeather(),
    refetchInterval: 3600000, // Einmal pro Stunde aktualisieren
    staleTime: 1800000, // Nach 30 Minuten als veraltet markieren
  });

  if (error) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-red-600 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            Fehler beim Laden der Wetterdaten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Bitte versuchen Sie es später erneut.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Kompakte Version (für Sidebar oder schmale Spalten)
  if (compact) {
    return (
      <Card className={`${className}`}>
        {showTitle && (
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-sm font-medium">Bad Schandau</CardTitle>
          </CardHeader>
        )}
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex flex-col items-center">
              <Skeleton className="h-12 w-12 rounded-full mb-2" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24 mt-1" />
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <WeatherIcon 
                icon={data?.icon || '01d'} 
                description={data?.description || 'Wetter'} 
                className="h-12 w-12 mb-2" 
              />
              <div className="text-2xl font-semibold">{Math.round(data?.temperature || 0)}°C</div>
              <div className="text-xs text-muted-foreground text-center">{data?.description}</div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Vollständige Version mit mehr Wetterdetails
  return (
    <Card className={`${className}`}>
      {showTitle && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg font-medium">
              Aktuelles Wetter Bad Schandau
            </CardTitle>
            <Badge 
              variant="outline" 
              className="text-xs px-2 py-0 h-6 hidden md:flex items-center">
              {new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Aktuelle Wetterbedingungen für die Sächsische Schweiz
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        {isLoading ? (
          <div className="flex items-center">
            <Skeleton className="h-16 w-16 rounded-full mr-4" />
            <div className="flex-1">
              <Skeleton className="h-7 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center">
              <WeatherIcon 
                icon={data?.icon || '01d'} 
                description={data?.description || 'Wetter'} 
                className="h-16 w-16 mr-4" 
              />
              <div>
                <div className="text-2xl font-semibold">{Math.round(data?.temperature || 0)}°C</div>
                <div className="text-sm">{data?.description}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 md:gap-4 mt-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center text-muted-foreground mb-1">
                        <Wind className="h-4 w-4 mr-1" />
                        <span className="text-xs">Wind</span>
                      </div>
                      <div className="text-sm font-medium">{data?.windSpeed} km/h</div>
                      <div className="text-xs text-muted-foreground truncate max-w-full">{data?.windDirection}</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center">
                    <div className="text-center">
                      <div className="font-semibold">Windgeschwindigkeit</div>
                      <div>{data?.windSpeed} km/h</div>
                      <div className="text-xs mt-1">{data?.windDirection}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center text-muted-foreground mb-1">
                        <Droplets className="h-4 w-4 mr-1" />
                        <span className="text-xs">Luftfeuchtigkeit</span>
                      </div>
                      <div className="text-sm font-medium">{data?.humidity}%</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center">
                    <div className="text-center">
                      <div className="font-semibold">Luftfeuchtigkeit</div>
                      <div>{data?.humidity}%</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center text-center">
                      <div className="flex items-center text-muted-foreground mb-1">
                        <Thermometer className="h-4 w-4 mr-1" />
                        <span className="text-xs">Gefühlt</span>
                      </div>
                      <div className="text-sm font-medium">{Math.round(data?.temperature || 0)}°C</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center">
                    <div className="text-center">
                      <div className="font-semibold">Gefühlte Temperatur</div>
                      <div>{Math.round(data?.temperature || 0)}°C</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CurrentWeatherCard;
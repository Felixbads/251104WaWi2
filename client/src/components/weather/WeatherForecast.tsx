import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWeatherForecast, ForecastDay } from '@/lib/api/weather';
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
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarDays, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Info, Snowflake, Sun, SunDim } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface WeatherForecastProps {
  days?: number;
  showTitle?: boolean;
  className?: string;
}

// Wettericon basierend auf OpenWeather-Icons
function WeatherIcon({ icon, description, className = 'h-8 w-8' }: { icon: string; description: string; className?: string }) {
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

// Holiday-Badge-Komponente
function HolidayBadge({ holiday }: { holiday: { name: string; type: string; state?: string } }) {
  const isPublicHoliday = holiday.type === 'PUBLIC_HOLIDAY';
  const badgeVariant = isPublicHoliday ? 'destructive' : 'secondary';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={badgeVariant} className="text-xs px-1 py-0 h-5">
            {isPublicHoliday ? 'F' : 'S'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {holiday.name}
            {holiday.state && ` (${holiday.state})`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hauptkomponente für die Wettervorhersage
const WeatherForecast: React.FC<WeatherForecastProps> = ({ 
  days = 7, 
  showTitle = true,
  className = ""
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['weather-forecast', days],
    queryFn: () => getWeatherForecast(days),
    refetchInterval: 3600000, // Einmal pro Stunde aktualisieren
    staleTime: 1800000, // Nach 30 Minuten als veraltet markieren
  });

  // Beispielhafte Feiertage (in einer realen Implementierung würden diese von der API abgerufen)
  const holidays = {
    '2025-04-06': { name: 'Ostern', type: 'PUBLIC_HOLIDAY' },
    '2025-04-07': { name: 'Ostermontag', type: 'PUBLIC_HOLIDAY' },
    '2025-04-03': { name: 'Schulferien Sachsen', type: 'SCHOOL_HOLIDAY', state: 'Sachsen' }
  };

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

  return (
    <Card className={`${className}`}>
      {showTitle && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg font-medium flex items-center">
              <CalendarDays className="h-4 w-4 mr-2" />
              Wettervorhersage Bad Schandau
            </CardTitle>
            <Badge 
              variant="outline" 
              className="text-xs px-2 py-0 h-6 hidden md:flex items-center">
              Synchronisiert: {new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Vorhersage für die nächsten {days} Tage mit Feiertags- und Ferieninformationen
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {Array(7).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <Skeleton className="h-5 w-14 mb-2" />
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-10 mt-2" />
                <Skeleton className="h-4 w-14 mt-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {data?.map((day: ForecastDay, index: number) => {
              const date = parseISO(day.date);
              const formattedDate = format(date, 'yyyy-MM-dd');
              const holiday = holidays[formattedDate as keyof typeof holidays];
              const isWeekend = [0, 6].includes(date.getDay()); // 0 = Sonntag, 6 = Samstag
              
              return (
                <div 
                  key={day.date} 
                  className={`flex flex-col items-center p-1 rounded-md ${isWeekend ? 'bg-muted/30' : ''}`}
                >
                  <div className="text-xs font-medium mb-1 flex items-center gap-1">
                    {format(date, 'EEE', { locale: de })}
                    {format(date, '.dd', { locale: de })}
                    {holiday && <HolidayBadge holiday={holiday} />}
                  </div>
                  
                  <WeatherIcon 
                    icon={day.icon} 
                    description={day.description} 
                    className="h-8 w-8 mb-1" 
                  />
                  
                  <div className="flex items-center justify-center gap-1 text-xs">
                    <span className="font-medium">{Math.round(day.temperature.max)}°</span>
                    <span className="text-muted-foreground">{Math.round(day.temperature.min)}°</span>
                  </div>
                  
                  <div className="text-[10px] text-muted-foreground mt-0.5 text-center">
                    {day.description}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Badge variant="destructive" className="text-xs px-1 py-0 h-5">F</Badge>
            <span>Feiertag</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs px-1 py-0 h-5">S</Badge> 
            <span>Schulferien</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeatherForecast;
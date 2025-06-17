import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWeatherForecast, ForecastDay } from '@/lib/api/weather';
import { getHolidaysInRange } from '@/lib/api/holidays';
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
import { format, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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

// Erweiterte Holiday-Badge-Komponente
function HolidayBadge({ holiday }: { holiday: { name: string; type: string; state?: string; description?: string } }) {
  const isPublicHoliday = holiday.type === 'PUBLIC_HOLIDAY';
  const badgeVariant = isPublicHoliday ? 'destructive' : 'secondary';
  
  // Klarere Badge-Anzeige
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={badgeVariant} 
            className="text-xs px-1 py-0 h-5 absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2"
          >
            {isPublicHoliday ? 'F' : 'S'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-[250px] text-center z-50 px-3 py-2">
          <div className="font-semibold mb-1">
            {isPublicHoliday ? 'Feiertag:' : 'Schulferien:'}
          </div>
          <div className="font-medium mb-1">
            {holiday.name}
          </div>
          {holiday.description && (
            <div className="text-xs mb-1">{holiday.description}</div>
          )}
          {holiday.state && (
            <div className="text-xs mt-1 px-2 py-0.5 bg-muted inline-block rounded-full">
              {holiday.state}
            </div>
          )}
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

  // Typdefinition für Holiday-Objekte
  interface Holiday {
    name: string;
    type: string;
    state?: string;
    description?: string;
  }

  // Feiertage von der API abrufen mit useQuery
  const today = new Date();
  const endDate = addDays(today, days + 7); // Ein paar Tage mehr für die Liste unten
  
  const { data: holidaysData, isLoading: holidaysLoading, error: holidaysError } = useQuery({
    queryKey: ['holidays', format(today, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: () => getHolidaysInRange(
      format(today, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd')
    ),
    staleTime: 24 * 60 * 60 * 1000, // 24 Stunden
  });
  
  // Feiertage in das gewünschte Format konvertieren - nur authentische Daten verwenden
  const holidays: Record<string, Holiday> = React.useMemo(() => {
    if (!holidaysData?.success || !holidaysData?.data || holidaysData.data.length === 0) {
      return {};
    }
    
    return holidaysData.data.reduce((acc: Record<string, Holiday>, holiday: any) => {
      const formattedDate = format(parseISO(holiday.date), 'yyyy-MM-dd');
      acc[formattedDate] = {
        name: holiday.name,
        type: holiday.type || (holiday.isSchoolHoliday ? 'SCHOOL_HOLIDAY' : 'PUBLIC_HOLIDAY'),
        state: holiday.state || holiday.states?.join(', ') || 'Sachsen',
        description: holiday.description || (
          holiday.isSchoolHoliday 
            ? `Schulferien in ${holiday.state || 'Sachsen'}`
            : holiday.states?.length > 0 
              ? `Gesetzlicher Feiertag in ${holiday.states.length > 3 ? 'mehreren Bundesländern' : holiday.states.join(', ')}`
              : undefined
        )
      };
      return acc;
    }, {});
  }, [holidaysData?.data]);

  // Anzeige von Fehlern (Wetter oder Feiertage)
  if (error || holidaysError) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-red-600 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            {error ? "Fehler beim Laden der Wetterdaten" : "Fehler beim Laden der Feiertagsdaten"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-2">
            <AlertTitle>Daten konnten nicht geladen werden</AlertTitle>
            <AlertDescription className="text-xs">
              Bitte versuchen Sie es später erneut oder wenden Sie sich an den Support.
            </AlertDescription>
          </Alert>
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
                  className={`relative flex flex-col items-center p-2 rounded-md ${isWeekend ? 'bg-muted/30' : ''} hover:bg-muted/20`}
                >
                  {holiday && <HolidayBadge holiday={holiday} />}
                  
                  <div className="text-xs font-medium mb-1.5 flex items-center gap-0.5">
                    <span className="font-medium">{format(date, 'EEE', { locale: de })}</span>
                    <span>{format(date, '.dd', { locale: de })}</span>
                  </div>
                  
                  <WeatherIcon 
                    icon={day.icon} 
                    description={day.description} 
                    className="h-8 w-8 mb-1.5" 
                  />
                  
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="font-semibold">{Math.round(day.temperature.max)}°</span>
                    <span className="text-muted-foreground">{Math.round(day.temperature.min)}°</span>
                  </div>
                  
                  <div className="text-[10px] text-muted-foreground mt-1 text-center line-clamp-1 w-full overflow-hidden text-ellipsis">
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
        
        {/* Detaillierte Anzeige von Feiertagen und Ferien */}
        <div className="mt-4 border-t pt-3">
          <h4 className="text-sm font-medium mb-2">Aktuelle Feiertage & Ferien:</h4>
          
          {holidaysLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : holidaysError ? (
            <div className="text-sm text-red-500">
              Fehler beim Laden der Feiertagsdaten
            </div>
          ) : Object.keys(holidays).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              Keine Feiertage oder Ferien im gewählten Zeitraum
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(holidays)
                .filter(([date]) => {
                  const today = new Date();
                  const holidayDate = new Date(date);
                  // Nur Einträge für den aktuellen Monat und die nächsten 30 Tage anzeigen
                  return holidayDate >= today && 
                        holidayDate <= new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
                })
                .map(([date, holiday]) => {
                  const isPublicHoliday = holiday.type === 'PUBLIC_HOLIDAY';
                  return (
                    <div key={date} className="flex items-start gap-2">
                      <Badge 
                        variant={isPublicHoliday ? "destructive" : "secondary"}
                        className="mt-0.5"
                      >
                        {isPublicHoliday ? 'F' : 'S'}
                      </Badge>
                      <div>
                        <div className="text-xs font-medium">
                          {format(parseISO(date), 'dd.MM.yyyy')} - {holiday.name}
                        </div>
                        {holiday.state && (
                          <div className="text-[10px] text-muted-foreground">{holiday.state}</div>
                        )}
                        {holiday.description && (
                          <div className="text-[10px] text-muted-foreground">{holiday.description}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default WeatherForecast;
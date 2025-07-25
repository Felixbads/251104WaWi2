import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  CalendarDays, 
  School, 
  MapPin, 
  Clock, 
  AlertTriangle,
  Coffee,
  Users,
  TrendingUp
} from 'lucide-react';
import { getDashboardHolidayData, type DashboardHolidayData } from '@/lib/api';

interface HolidayDashboardWidgetProps {
  className?: string;
}

export default function HolidayDashboardWidget({ className }: HolidayDashboardWidgetProps) {
  const { data: holidayData, isLoading, error } = useQuery({
    queryKey: ['/api/dashboard/holidays'],
    queryFn: getDashboardHolidayData,
    refetchInterval: 3600000, // Alle 1 Stunde aktualisieren
    staleTime: 1800000, // 30 Minuten als "frisch" betrachten
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short', 
      day: '2-digit', 
      month: 'short' 
    });
  };

  const getHolidayTypeIcon = (type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY') => {
    return type === 'PUBLIC_HOLIDAY' 
      ? <Calendar className="h-4 w-4 text-red-500" />
      : <School className="h-4 w-4 text-blue-500" />;
  };

  const getHolidayTypeBadge = (type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY') => {
    return type === 'PUBLIC_HOLIDAY' 
      ? <Badge variant="destructive" className="text-xs">Feiertag</Badge>
      : <Badge variant="secondary" className="text-xs">Schulferien</Badge>;
  };

  const getDaysUntilText = (daysUntil: number) => {
    if (daysUntil === 0) return 'Heute';
    if (daysUntil === 1) return 'Morgen';
    if (daysUntil <= 7) return `In ${daysUntil} Tagen`;
    if (daysUntil <= 14) return `In ${Math.round(daysUntil / 7)} Woche${Math.round(daysUntil / 7) > 1 ? 'n' : ''}`;
    return `In ${Math.round(daysUntil / 7)} Wochen`;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <CalendarDays className="h-5 w-5 mr-2 text-blue-600" />
            Feiertage & Ferien
          </CardTitle>
          <CardDescription>Mitarbeiterinformationen und Verkaufseinflüsse</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (error || !holidayData) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <CalendarDays className="h-5 w-5 mr-2 text-blue-600" />
            Feiertage & Ferien
          </CardTitle>
          <CardDescription>Mitarbeiterinformationen und Verkaufseinflüsse</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>Feiertagsdaten nicht verfügbar</p>
            <p className="text-sm">Prüfen Sie die Systemkonfiguration</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasToday = holidayData.today.length > 0;
  const hasUpcoming = holidayData.upcoming.length > 0;
  const hasBridgeDays = holidayData.bridgeDays.length > 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <CalendarDays className="h-5 w-5 mr-2 text-blue-600" />
          Feiertage & Ferien
        </CardTitle>
        <CardDescription>Aktuelle Feiertage und Ferien nach Bundesländern</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Heutige Feiertage/Ferien */}
        {hasToday && (
          <Alert className={
            holidayData.today.some(h => h.type === 'PUBLIC_HOLIDAY') 
              ? "border-red-200 bg-red-50 dark:bg-red-950/20"
              : "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
          }>
            {holidayData.today.some(h => h.type === 'PUBLIC_HOLIDAY') 
              ? <Calendar className="h-4 w-4 text-red-600" />
              : <School className="h-4 w-4 text-blue-600" />
            }
            <AlertDescription>
              <div className={`font-medium mb-2 ${
                holidayData.today.some(h => h.type === 'PUBLIC_HOLIDAY')
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-blue-800 dark:text-blue-200'
              }`}>
                {(() => {
                  const publicHolidays = holidayData.today.filter(h => h.type === 'PUBLIC_HOLIDAY');
                  const schoolHolidays = holidayData.today.filter(h => h.type === 'SCHOOL_HOLIDAY');
                  
                  if (publicHolidays.length > 0 && schoolHolidays.length > 0) {
                    return 'Heute ist Feiertag und Schulferien!';
                  } else if (publicHolidays.length > 0) {
                    return `Heute ${publicHolidays.length > 1 ? 'sind' : 'ist'} ${publicHolidays.length > 1 ? 'Feiertage' : 'Feiertag'}!`;
                  } else {
                    return `Heute ${schoolHolidays.length > 1 ? 'sind' : 'sind'} Schulferien!`;
                  }
                })()}
              </div>
              <div className="space-y-2">
                {holidayData.today.map((holiday, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {getHolidayTypeIcon(holiday.type)}
                        <span className={`ml-2 text-sm font-medium ${
                          holiday.type === 'PUBLIC_HOLIDAY'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-blue-700 dark:text-blue-300'
                        }`}>
                          {holiday.name}
                        </span>
                      </div>
                      {getHolidayTypeBadge(holiday.type)}
                    </div>
                    {holiday.stateNames && holiday.stateNames.length > 0 && (
                      <div className="ml-6 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 inline mr-1" />
                        {holiday.stateNames.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Kommende Feiertage */}
        {hasUpcoming && (
          <div>
            <h4 className="text-sm font-medium mb-3 text-muted-foreground flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Kommende Feiertage
            </h4>
            <div className="space-y-3">
              {holidayData.upcoming.slice(0, 4).map((holiday, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center flex-1">
                    {getHolidayTypeIcon(holiday.type)}
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{holiday.name}</span>
                        {getHolidayTypeBadge(holiday.type)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-1">
                        <div>{formatDate(holiday.date)}</div>
                        {holiday.stateNames && holiday.stateNames.length > 0 ? (
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            <span className="font-medium">{holiday.stateNames.join(', ')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            <span>Bundesweit</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {getDaysUntilText(holiday.daysUntil)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brückentage */}
        {hasBridgeDays && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <h4 className="text-sm font-medium mb-2 text-amber-800 dark:text-amber-200 flex items-center">
              <Coffee className="h-4 w-4 mr-2" />
              Mögliche Brückentage
            </h4>
            <div className="space-y-2">
              {holidayData.bridgeDays.slice(0, 2).map((bridge, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    <div className="font-medium">{formatDate(bridge.date)}</div>
                    <div>{bridge.relatedHoliday}</div>
                  </div>
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                    Brückentag
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verkaufseinfluss-Hinweis */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center mb-2">
            <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Verkaufseinfluss
            </span>
          </div>
          <p className="text-xs text-green-700 dark:text-green-300">
            {hasToday 
              ? (() => {
                  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
                  const hasSchoolHoliday = holidayData.today.some(h => h.type === 'SCHOOL_HOLIDAY');
                  const hasPublicHoliday = holidayData.today.some(h => h.type === 'PUBLIC_HOLIDAY');
                  
                  if (hasSchoolHoliday && isWeekend) {
                    return "Stark erhöhte Verkäufe erwartet - Schulferien + Wochenende";
                  } else if (hasSchoolHoliday) {
                    return "Erhöhte Verkäufe erwartet - Schulferien bedeuten mehr Besucher";
                  } else if (hasPublicHoliday) {
                    return "Leicht reduzierte Verkäufe möglich - Feiertag (weniger Arbeiter/Pendler)";
                  } else {
                    return "Normale Verkaufsmuster erwartet";
                  }
                })()
              : hasUpcoming && holidayData.upcoming[0]?.daysUntil <= 3
              ? `Erhöhte Nachfrage vor ${holidayData.upcoming[0].name} möglich`
              : "Normale Verkaufsmuster erwartet - keine besonderen Ereignisse"
            }
          </p>
        </div>

        {/* Mitarbeiterhinweis */}
        {(hasToday || (hasUpcoming && holidayData.upcoming[0]?.daysUntil <= 1)) && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <Users className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="text-blue-800 dark:text-blue-200">
                <div className="font-medium mb-1">Mitarbeiterhinweis</div>
                <div className="text-sm">
                  {hasToday 
                    ? "Prüfen Sie die Personalplanung für den Feiertag"
                    : "Feiertag morgen - Schichtplanung überprüfen"
                  }
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Keine Feiertage */}
        {!hasToday && !hasUpcoming && !hasBridgeDays && (
          <div className="text-center py-4 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">Keine Feiertage in den nächsten 30 Tagen</p>
            <p className="text-xs">Normale Geschäftstätigkeit</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncWeatherData } from '@/lib/api';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Calendar as CalendarIcon, Cloud, CloudRain, Info, Clock, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { WeatherApiUsageCard } from './WeatherApiUsage';

type WeatherSyncType = 'forecast' | 'historical' | 'historical_from_2023' | 'missing';

interface WeatherSyncTabProps {
  // Optional props if needed
}

export const WeatherSyncTab: React.FC<WeatherSyncTabProps> = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [weatherSync, setWeatherSync] = useState<WeatherSyncType>('forecast');

  // Weather sync mutation
  const weatherSyncMutation = useMutation({
    mutationFn: () => {
      const options: any = {};
      
      // Je nach ausgewähltem Wettersync-Typ
      if (weatherSync === 'historical') {
        if (!startDate) {
          throw new Error('Bitte wählen Sie ein Datum für die historische Wetterdatensynchronisierung');
        }
        options.date = format(startDate, 'yyyy-MM-dd');
      } else if (weatherSync === 'missing') {
        options.startDate = format(new Date(2023, 0, 1), 'yyyy-MM-dd'); // 01.01.2023
        options.endDate = format(new Date(), 'yyyy-MM-dd'); // Heute
        options.maxDays = 20; // Begrenzung für API-Limit
      } else if (weatherSync === 'historical_from_2023') {
        options.batchSize = 20; // Maximale Anzahl an Tagen pro Batch
      }
      
      return syncWeatherData(weatherSync, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weather/api-usage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
      
      toast({
        title: "Wetterdaten-Synchronisierung gestartet",
        description: `Die ${getWeatherSyncTypeLabel(weatherSync)}-Synchronisierung wurde erfolgreich gestartet.`,
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Wetterdaten-Synchronisierungsfehler",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });

  // Function to get label for weather sync type
  const getWeatherSyncTypeLabel = (type: string): string => {
    switch (type) {
      case 'forecast': return 'Wettervorhersage';
      case 'historical': return 'Historische Wetterdaten';
      case 'historical_from_2023': return 'Historische Wetterdaten seit 2023';
      case 'missing': return 'Fehlende Wetterdaten';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Show API usage first */}
      <WeatherApiUsageCard />
      
      <Card>
        <CardHeader>
          <CardTitle>Wetterdaten-Synchronisierung</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Wetterdaten-Sync Optionen */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <div
                className={`border p-3 rounded-md flex items-center cursor-pointer ${
                  weatherSync === 'forecast' ? 'border-primary' : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setWeatherSync('forecast')}
              >
                <CloudRain className="h-5 w-5 mr-2 text-blue-600" />
                <span>Vorhersage (8-14 Tage)</span>
              </div>
              <div
                className={`border p-3 rounded-md flex items-center cursor-pointer ${
                  weatherSync === 'historical' ? 'border-primary' : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setWeatherSync('historical')}
              >
                <CalendarIcon className="h-5 w-5 mr-2 text-amber-600" />
                <span>Historischer Tag</span>
              </div>
              <div
                className={`border p-3 rounded-md flex items-center cursor-pointer ${
                  weatherSync === 'missing' ? 'border-primary' : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setWeatherSync('missing')}
              >
                <Info className="h-5 w-5 mr-2 text-green-600" />
                <span>Fehlende Daten</span>
              </div>
              <div
                className={`border p-3 rounded-md flex items-center cursor-pointer ${
                  weatherSync === 'historical_from_2023' ? 'border-primary' : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setWeatherSync('historical_from_2023')}
              >
                <Clock className="h-5 w-5 mr-2 text-red-600" />
                <span>Seit 2023 (alle)</span>
              </div>
            </div>
            
            {/* Historischer Tag Auswahl */}
            {weatherSync === 'historical' && (
              <div className="flex flex-col space-y-1">
                <Label htmlFor="historical-date">Datum für historische Daten</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="historical-date"
                      variant={"outline"}
                      className={`w-full justify-start text-left font-normal ${!startDate ? "text-muted-foreground" : ""}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd.MM.yyyy") : "Datum auswählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            
            {/* Hinweise */}
            {weatherSync === 'forecast' && (
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CloudRain className="h-4 w-4 text-blue-600" />
                <AlertTitle>Wettervorhersage</AlertTitle>
                <AlertDescription>
                  Lädt die aktuelle Wettervorhersage für die nächsten 8-14 Tage. 
                  Eine Anfrage pro Tag ist ausreichend.
                </AlertDescription>
              </Alert>
            )}
            
            {weatherSync === 'historical_from_2023' && (
              <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800">
                <Clock className="h-4 w-4" />
                <AlertTitle>Hinweis</AlertTitle>
                <AlertDescription>
                  Dies synchronisiert alle Wetterdaten seit 01.01.2023 und verbraucht 
                  viele API-Anfragen. Der Prozess wird automatisch gestoppt, wenn 
                  das tägliche API-Limit erreicht ist, und beim nächsten Lauf fortgesetzt.
                </AlertDescription>
              </Alert>
            )}
            
            {weatherSync === 'missing' && (
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>Fehlende Daten</AlertTitle>
                <AlertDescription>
                  Identifiziert und lädt fehlende historische Wetterdaten im Zeitraum von
                  01.01.2023 bis heute. Maximal 20 Tage werden pro Ausführung synchronisiert.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="space-x-2">
          <Button 
            onClick={() => weatherSyncMutation.mutate()}
            disabled={weatherSyncMutation.isPending}
            className="w-full"
          >
            {weatherSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisierung läuft...
              </>
            ) : (
              <>
                <Cloud className="h-5 w-5 mr-2" />
                {`${getWeatherSyncTypeLabel(weatherSync)}-Synchronisierung starten`}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default WeatherSyncTab;
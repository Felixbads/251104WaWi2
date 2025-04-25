import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncHolidays } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Loader2, CheckCircle2, History, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import axios from 'axios';

interface HolidaySyncTabProps {
  // Optional props if needed
}

// Liste aller deutschen Bundesländer
const ALL_STATES = [
  { code: "SN", name: "Sachsen" },
  { code: "BB", name: "Brandenburg" },
  { code: "BE", name: "Berlin" },
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "HB", name: "Bremen" },
  { code: "HE", name: "Hessen" },
  { code: "HH", name: "Hamburg" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "SL", name: "Saarland" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "TH", name: "Thüringen" }
];

export const HolidaySyncTab: React.FC<HolidaySyncTabProps> = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [includeSchoolHolidays, setIncludeSchoolHolidays] = useState<boolean>(true);
  const [syncAllStates, setSyncAllStates] = useState<boolean>(true);

  // Für historischen Daten-Import
  const [startYear, setStartYear] = useState<number>(2023);
  const [endYear, setEndYear] = useState<number>(new Date().getFullYear());
  const [historicalSyncLoading, setHistoricalSyncLoading] = useState<boolean>(false);

  // Holiday sync mutation
  const holidaySyncMutation = useMutation({
    mutationFn: () => {
      const options: any = {
        year: selectedYear,
        includeSchoolHolidays: includeSchoolHolidays,
        allStates: syncAllStates
      };
      
      // 'all' synchronisiert sowohl öffentliche Feiertage als auch Schulferien
      return syncHolidays('all', options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data-coverage'] });
      
      toast({
        title: "Feiertagssynchronisierung abgeschlossen",
        description: syncAllStates 
          ? `Die Feiertagssynchronisierung für ${selectedYear} wurde für alle Bundesländer erfolgreich durchgeführt.`
          : `Die Feiertagssynchronisierung für ${selectedYear} wurde erfolgreich durchgeführt.`,
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Feiertagssynchronisierungsfehler",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });

  // Funktion für die historische Synchronisierung
  const handleHistoricalSync = async () => {
    try {
      setHistoricalSyncLoading(true);
      
      const statesList = ALL_STATES.map(state => state.code);
      
      // Die vollständige historische Synchronisierung durchführen
      const response = await axios.post('/api/holidays/sync-range', {
        startYear: startYear,
        endYear: endYear,
        states: statesList,
        includeSchoolHolidays: true
      });
      
      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/data-coverage'] });
        
        toast({
          title: "Historische Feiertagssynchronisierung erfolgreich",
          description: `Es wurden ${response.data.data.addedEntries} Feiertage und Ferien für den Zeitraum ${startYear}-${endYear} für alle Bundesländer synchronisiert.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Fehler bei der historischen Synchronisierung",
          description: response.data.error || "Es ist ein unbekannter Fehler aufgetreten.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Fehler bei der historischen Synchronisierung:", error);
      toast({
        title: "Fehler bei der historischen Synchronisierung",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setHistoricalSyncLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Aktuelle Feiertagssynchronisierung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Feiertage-Synchronisierung
            {syncAllStates && (
              <Badge variant="secondary" className="ml-2">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Alle Bundesländer
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col space-y-1 flex-1">
                <Label htmlFor="holiday-year">Jahr</Label>
                <Select 
                  value={selectedYear.toString()} 
                  onValueChange={(value) => setSelectedYear(parseInt(value))}
                >
                  <SelectTrigger id="holiday-year">
                    <SelectValue placeholder="Jahr auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + i - 3).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Alle Bundesländer Option */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="all-states" 
                checked={syncAllStates}
                onCheckedChange={(checked) => {
                  setSyncAllStates(checked === true);
                }}
              />
              <Label htmlFor="all-states" className="font-medium">
                Alle Bundesländer synchronisieren
              </Label>
            </div>
            
            {/* Schulferien Option */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="school-holidays" 
                checked={includeSchoolHolidays}
                onCheckedChange={(checked) => {
                  setIncludeSchoolHolidays(checked === true);
                }}
              />
              <Label htmlFor="school-holidays">
                Schulferien einbeziehen
              </Label>
            </div>
            
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertTitle>Hinweis</AlertTitle>
              <AlertDescription>
                Feiertage und Schulferien für Deutschland werden von OpenHolidaysAPI abgerufen. 
                Für das ausgewählte Jahr und alle Bundesländer werden alle gesetzlichen Feiertage und 
                optional Schulferien synchronisiert.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
        <CardFooter className="space-x-2">
          <Button 
            onClick={() => holidaySyncMutation.mutate()}
            disabled={holidaySyncMutation.isPending}
            className="w-full"
          >
            {holidaySyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisierung läuft...
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5 mr-2" />
                Feiertage für {selectedYear} synchronisieren
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Historische Feiertagssynchronisierung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historische Feiertage & Ferien importieren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTitle className="text-amber-800">Wichtig</AlertTitle>
            <AlertDescription className="text-amber-700">
              Für eine korrekte Analyse von Verkaufsdaten im Zeitverlauf ist es wichtig, 
              dass Feiertage und Schulferien für alle Bundesländer seit 2023 synchronisiert sind. 
              Dieser Prozess kann einige Minuten dauern.
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-year">Startjahr</Label>
              <Select 
                value={startYear.toString()} 
                onValueChange={(value) => setStartYear(parseInt(value))}
                disabled={historicalSyncLoading}
              >
                <SelectTrigger id="start-year">
                  <SelectValue placeholder="Startjahr auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => 2020 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="end-year">Endjahr</Label>
              <Select 
                value={endYear.toString()} 
                onValueChange={(value) => setEndYear(parseInt(value))}
                disabled={historicalSyncLoading}
              >
                <SelectTrigger id="end-year">
                  <SelectValue placeholder="Endjahr auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center justify-between border rounded-md p-3 bg-gray-50">
            <div className="flex-grow">
              <div className="text-sm font-medium">Synchronisierungszeitraum</div>
              <div className="text-sm text-gray-600 flex items-center mt-1">
                <span>{startYear}</span>
                <ArrowRight className="mx-2 h-3 w-3" />
                <span>{endYear}</span>
                <Badge variant="outline" className="ml-2">
                  Alle Bundesländer
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            variant="secondary" 
            onClick={handleHistoricalSync} 
            disabled={historicalSyncLoading}
            className="w-full"
          >
            {historicalSyncLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Historische Daten werden synchronisiert...
              </>
            ) : (
              <>
                <History className="mr-2 h-4 w-4" />
                Historische Feiertage synchronisieren
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default HolidaySyncTab;
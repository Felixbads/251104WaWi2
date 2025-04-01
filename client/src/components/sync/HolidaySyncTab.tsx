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
import { Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

  return (
    <div className="space-y-4">
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
    </div>
  );
};

export default HolidaySyncTab;
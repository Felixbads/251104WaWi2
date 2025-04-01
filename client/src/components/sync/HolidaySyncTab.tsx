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
import { Calendar, Loader2 } from 'lucide-react';

interface HolidaySyncTabProps {
  // Optional props if needed
}

export const HolidaySyncTab: React.FC<HolidaySyncTabProps> = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedState, setSelectedState] = useState<string>("SN"); // Default: Sachsen
  const [includeSchoolHolidays, setIncludeSchoolHolidays] = useState<boolean>(true);

  // Holiday sync mutation
  const holidaySyncMutation = useMutation({
    mutationFn: () => {
      const options: any = {
        year: selectedYear,
        state: selectedState,
        includeSchoolHolidays: includeSchoolHolidays
      };
      
      return syncHolidays('all', options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
      
      toast({
        title: "Feiertagssynchronisierung abgeschlossen",
        description: `Die Feiertagssynchronisierung für ${selectedYear} wurde erfolgreich durchgeführt.`,
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
          <CardTitle>Feiertage-Synchronisierung</CardTitle>
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
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 1).map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex flex-col space-y-1 flex-1">
                <Label htmlFor="holiday-state">Bundesland</Label>
                <Select 
                  value={selectedState} 
                  onValueChange={setSelectedState}
                >
                  <SelectTrigger id="holiday-state">
                    <SelectValue placeholder="Bundesland auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SN">Sachsen</SelectItem>
                    <SelectItem value="BB">Brandenburg</SelectItem>
                    <SelectItem value="BE">Berlin</SelectItem>
                    <SelectItem value="BW">Baden-Württemberg</SelectItem>
                    <SelectItem value="BY">Bayern</SelectItem>
                    <SelectItem value="HB">Bremen</SelectItem>
                    <SelectItem value="HE">Hessen</SelectItem>
                    <SelectItem value="HH">Hamburg</SelectItem>
                    <SelectItem value="MV">Mecklenburg-Vorpommern</SelectItem>
                    <SelectItem value="NI">Niedersachsen</SelectItem>
                    <SelectItem value="NW">Nordrhein-Westfalen</SelectItem>
                    <SelectItem value="RP">Rheinland-Pfalz</SelectItem>
                    <SelectItem value="SH">Schleswig-Holstein</SelectItem>
                    <SelectItem value="SL">Saarland</SelectItem>
                    <SelectItem value="ST">Sachsen-Anhalt</SelectItem>
                    <SelectItem value="TH">Thüringen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                Für das ausgewählte Jahr und Bundesland werden alle gesetzlichen Feiertage und 
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
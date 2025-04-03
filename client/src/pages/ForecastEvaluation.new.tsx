import React, { useState } from 'react';
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Diese minimale Version enthält keine komplexen Abfragen oder Datenverarbeitung
export default function ForecastEvaluation() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // Einfache Funktion zum Anwenden der Filter
  const applyFilters = () => {
    setIsLoading(true);
    
    // Simuliere eine Verzögerung, um Loading-Zustand zu zeigen
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Filter erfolgreich angewendet",
        description: `Zeitraum: ${format(startDate, 'dd.MM.yyyy')} bis ${format(endDate, 'dd.MM.yyyy')}`,
      });
    }, 500);
  };

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Prognoseauswertung</h2>
        <p className="text-muted-foreground">
          Analyse der vorhandenen Prognosemodelle und ihrer Genauigkeit.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>Filter für die Prognoseauswertung einstellen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Startdatum */}
            <div className="space-y-2">
              <div className="font-medium">Startdatum</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, 'PPP', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Enddatum */}
            <div className="space-y-2">
              <div className="font-medium">Enddatum</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, 'PPP', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button onClick={applyFilters} disabled={isLoading}>
            {isLoading ? "Wird geladen..." : "Filter anwenden"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prognoseauswertung</CardTitle>
          <CardDescription>Diese Seite wird neu implementiert und optimiert</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Bitte klicken Sie auf "Filter anwenden", um fortzufahren.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
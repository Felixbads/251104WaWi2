import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { format, parseISO, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Calendar, BarChart3 } from 'lucide-react';

// Definieren der Antworttypen vom Backend
interface AvailabilityDataPoint {
  date: string;
  count: number;
}

interface HistoricalDataStats {
  total: number;
  minDate: string | null;
  maxDate: string | null;
}

interface HistoricalDataResponse {
  status: string;
  availability: AvailabilityDataPoint[];
  stats: HistoricalDataStats;
  parameters: {
    granularity: string;
    startDate: string;
    endDate: string;
  };
}

// Benutzerdefinierte Tooltip-Komponente für das Diagramm
const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    const date = label ? parseISO(label) : null;
    const formattedDate = date && isValid(date) 
      ? format(date, 'MMMM yyyy', { locale: de })
      : label;
    
    return (
      <div className="bg-background border border-border p-2 rounded-md shadow-md">
        <p className="font-semibold">{formattedDate}</p>
        <p className="text-sm">{`${payload[0].value} Transaktionen`}</p>
      </div>
    );
  }
  return null;
};

// Hauptkomponente
const HistoricalDataAvailability: React.FC = () => {
  const [granularity, setGranularity] = useState<string>('month');
  const [startYear, setStartYear] = useState<string>('2022');
  const [endYear, setEndYear] = useState<string>(new Date().getFullYear().toString());
  
  // Abfrage der Datenverfügbarkeit
  const { data, isLoading, error, refetch } = useQuery<HistoricalDataResponse>({
    queryKey: ['/api/vendon/historical-data-availability', granularity, startYear, endYear],
    queryFn: async () => {
      const startDate = `${startYear}-01-01`;
      const endDate = `${endYear}-12-31`;
      const response = await fetch(
        `/api/vendon/historical-data-availability?granularity=${granularity}&startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Fehler beim Abrufen der Datenverfügbarkeit');
      }
      return response.json();
    }
  });

  // Format data for visualization
  const chartData = React.useMemo(() => {
    if (!data?.availability) return [];
    
    return data.availability.map(item => {
      // Formatierung je nach Granularität
      let formattedDate = '';
      const dateObj = item.date ? new Date(item.date) : null;
      
      if (dateObj && isValid(dateObj)) {
        formattedDate = granularity === 'month' 
          ? format(dateObj, 'yyyy-MM', { locale: de }) 
          : format(dateObj, 'yyyy-MM-dd', { locale: de });
      }
      
      return {
        date: item.date,
        count: item.count,
        label: formattedDate
      };
    });
  }, [data, granularity]);

  // Jahre für die Auswahl generieren
  const years = Array.from({ length: new Date().getFullYear() - 2021 }, (_, i) => (2022 + i).toString());

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Verfügbarkeit historischer Daten
        </CardTitle>
        <CardDescription>
          Übersicht über importierte Transaktionsdaten im Zeitverlauf
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Steuerelemente */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="granularity">Zeitraum</Label>
              <Select value={granularity} onValueChange={setGranularity}>
                <SelectTrigger id="granularity" className="w-full md:w-[180px]">
                  <SelectValue placeholder="Zeitraum wählen" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="month">Monatlich</SelectItem>
                  <SelectItem value="day">Täglich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="startYear">Von Jahr</Label>
              <Select value={startYear} onValueChange={setStartYear}>
                <SelectTrigger id="startYear" className="w-full md:w-[120px]">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {years.map((year) => (
                    <SelectItem key={`start-${year}`} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="endYear">Bis Jahr</Label>
              <Select value={endYear} onValueChange={setEndYear}>
                <SelectTrigger id="endYear" className="w-full md:w-[120px]">
                  <SelectValue placeholder="Ende" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {years.map((year) => (
                    <SelectItem key={`end-${year}`} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Statistik */}
          {data?.stats && (
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className="text-sm py-1.5">
                Gesamt: {data.stats.total.toLocaleString('de-DE')} Transaktionen
              </Badge>
              {data.stats.minDate && (
                <Badge variant="outline" className="text-sm py-1.5 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Älteste: {format(new Date(data.stats.minDate), 'dd.MM.yyyy', { locale: de })}
                </Badge>
              )}
              {data.stats.maxDate && (
                <Badge variant="outline" className="text-sm py-1.5 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Neueste: {format(new Date(data.stats.maxDate), 'dd.MM.yyyy', { locale: de })}
                </Badge>
              )}
            </div>
          )}

          {/* Fehleranzeige */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Fehler</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : 'Fehler beim Laden der Daten'}
              </AlertDescription>
            </Alert>
          )}

          {/* Datenvisualisierung */}
          <div className="w-full h-[300px]">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Skeleton className="w-full h-[250px]" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => {
                      const date = parseISO(value);
                      return isValid(date) 
                        ? format(date, granularity === 'month' ? 'MMM yy' : 'dd.MM', { locale: de })
                        : value;
                    }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#3b82f6" name="Transaktionen" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-muted-foreground">Keine Daten verfügbar</p>
              </div>
            )}
          </div>

          {/* Hilfetext */}
          <p className="text-sm text-muted-foreground">
            Diese Ansicht zeigt, für welche Zeiträume historische Transaktionsdaten verfügbar sind. 
            Lücken im Diagramm weisen auf fehlende Daten hin, die Sie über die historische Synchronisierung 
            importieren können.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default HistoricalDataAvailability;
import React, { useState } from 'react';
import { format, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, ShieldAlert, CloudRain, Clock, Package } from 'lucide-react';

// Diese minimale Version enthält keine komplexen Abfragen oder Datenverarbeitung
export default function DataAvailability() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(false);

  // Simulierte Daten für die Übersicht
  const coverageData = [
    { data_type: 'Transaktionen', coverage_percentage: 95, data_points: 25000 },
    { data_type: 'Wetterdaten', coverage_percentage: 80, data_points: 730 },
    { data_type: 'Feiertage', coverage_percentage: 100, data_points: 42 },
    { data_type: 'Auffüllungen', coverage_percentage: 70, data_points: 1200 }
  ];

  // Einfache Funktion zum Aktualisieren der Daten
  const refreshData = () => {
    setIsLoading(true);
    
    // Simuliere eine Verzögerung, um Loading-Zustand zu zeigen
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  // Icon-Mapping für verschiedene Datentypen
  const getIconForDataType = (dataType: string) => {
    switch (dataType.toLowerCase()) {
      case 'transaktionen':
        return <Clock className="h-5 w-5 mr-2" />;
      case 'wetterdaten':
        return <CloudRain className="h-5 w-5 mr-2" />;
      case 'feiertage':
        return <CalendarIcon className="h-5 w-5 mr-2" />;
      case 'auffüllungen':
        return <Package className="h-5 w-5 mr-2" />;
      default:
        return <ShieldAlert className="h-5 w-5 mr-2" />;
    }
  };

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Datenverfügbarkeit</h2>
        <p className="text-muted-foreground">
          Übersicht über die verfügbaren Daten nach Typ und Zeitraum
        </p>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="transactions">Transaktionen</TabsTrigger>
          <TabsTrigger value="weather">Wetterdaten</TabsTrigger>
          <TabsTrigger value="holidays">Feiertage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coverageData.map((item, index) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    {getIconForDataType(item.data_type)}
                    {item.data_type}
                  </CardTitle>
                  <CardDescription>
                    {item.data_points.toLocaleString()} Datenpunkte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Abdeckung</span>
                      <span className="font-medium">{item.coverage_percentage}%</span>
                    </div>
                    <Progress value={item.coverage_percentage} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Datenübersicht</CardTitle>
              <CardDescription>
                Zusammenfassung der verfügbaren Daten im System
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <p>Diese Seite wurde vereinfacht, um Leistungsprobleme zu beheben.</p>
                <Button 
                  className="mt-4"
                  onClick={refreshData}
                  disabled={isLoading}
                >
                  {isLoading ? "Wird aktualisiert..." : "Daten aktualisieren"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaktionsdaten</CardTitle>
              <CardDescription>Überblick über Transaktionsdaten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p>
                  Diese Seite wurde vereinfacht, um Leistungsprobleme zu beheben.
                  Klicken Sie auf den Tab "Übersicht" für eine Zusammenfassung.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weather">
          <Card>
            <CardHeader>
              <CardTitle>Wetterdaten</CardTitle>
              <CardDescription>Überblick über Wetterdaten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p>
                  Diese Seite wurde vereinfacht, um Leistungsprobleme zu beheben.
                  Klicken Sie auf den Tab "Übersicht" für eine Zusammenfassung.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <Card>
            <CardHeader>
              <CardTitle>Feiertage</CardTitle>
              <CardDescription>Überblick über Feiertagsdaten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p>
                  Diese Seite wurde vereinfacht, um Leistungsprobleme zu beheben.
                  Klicken Sie auf den Tab "Übersicht" für eine Zusammenfassung.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
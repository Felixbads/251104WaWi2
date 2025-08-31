import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, Download, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { jsPDF } from "jspdf";
import axios from "axios";

interface EventFrequencyTabProps {
  buildQueryUrl: (endpoint: string) => string;
}

interface MachineEvents {
  machineId: number;
  machineName: string;
  totalEvents: number;
}

interface EventType {
  eventType: string;
  description?: string;
  count: number;
  percentage: number;
}

interface ApiResponse {
  machines: MachineEvents[];
  topMachine: MachineEvents | null;
  topMachineEventTypes: EventType[];
  eventTypeDistribution: EventType[];
  metadata: {
    period: string;
    startDate: string;
    endDate: string;
    lastUpdated: string;
  };
}

export default function EventFrequencyTab({ buildQueryUrl }: EventFrequencyTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // URL mit Benutzertoken erstellen
        const url = buildQueryUrl('/api/statistics/event-frequency');
        
        // Daten abrufen
        const response = await axios.get<ApiResponse>(url);
        setData(response.data);
      } catch (err) {
        console.error("Fehler beim Laden der Ereignishäufigkeitsdaten:", err);
        setError("Die Ereignishäufigkeitsdaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [buildQueryUrl]);
  
  function handleExport() {
    if (!data) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Titel
    doc.setFontSize(16);
    doc.text("Ereignishäufigkeitsanalyse", pageWidth / 2, 20, { align: "center" });
    
    // Metadaten
    doc.setFontSize(10);
    doc.text(`Zeitraum: ${data.metadata.period}`, 14, 30);
    doc.text(`Von: ${data.metadata.startDate} bis: ${data.metadata.endDate}`, 14, 35);
    doc.text(`Erstellt am: ${data.metadata.lastUpdated}`, 14, 40);
    
    // Top-Maschine mit den meisten Ereignissen
    doc.setFontSize(12);
    doc.text("Automat mit den meisten Ereignissen:", 14, 50);
    doc.setFontSize(10);
    
    if (data.topMachine) {
      doc.text(`${data.topMachine.machineName} (ID: ${data.topMachine.machineId})`, 14, 55);
      doc.text(`Gesamtzahl der Ereignisse: ${data.topMachine.totalEvents}`, 14, 60);
    } else {
      doc.text("Keine Daten verfügbar", 14, 55);
    }
    
    // Verteilung der Ereignistypen
    doc.setFontSize(12);
    doc.text("Verteilung der Ereignistypen:", 14, 70);
    doc.setFontSize(9);
    
    let yPos = 75;
    data.eventTypeDistribution.forEach((eventType, index) => {
      doc.text(`${index + 1}. ${eventType.eventType}${eventType.description ? ` (${eventType.description})` : ''}`, 14, yPos);
      doc.text(`${eventType.count} (${(eventType.percentage || 0).toFixed(2)}%)`, 100, yPos);
      yPos += 5;
    });
    
    // PDF speichern
    doc.save("Ereignishäufigkeitsanalyse.pdf");
  }
  
  if (isLoading) {
    return (
      <div className="flex flex-col space-y-4">
        <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
          <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
        </div>
        <div className="animate-pulse h-60 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>Keine Daten verfügbar.</AlertDescription>
      </Alert>
    );
  }

  // Ereignistypen farblich kodieren
  const getEventColor = (eventType: string) => {
    // Hier können wir verschiedenen Ereignistypen bestimmte Farben zuweisen
    const eventColors: Record<string, string> = {
      'ERROR': 'text-red-600',
      'WARNING': 'text-amber-600',
      'DOOR_OPEN': 'text-blue-600',
      'DOOR_CLOSE': 'text-green-600',
      'POWER_ON': 'text-emerald-600',
      'POWER_OFF': 'text-rose-600',
      'REFILL': 'text-teal-600',
      'MAINTENANCE': 'text-violet-600',
      'CASH_COLLECTION': 'text-orange-600'
    };
    
    return eventColors[eventType] || 'text-gray-600';
  };
  
  // Finde den Automaten mit den meisten Ereignissen
  const topMachine = data.topMachine;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Ereignishäufigkeitsanalyse</h3>
          <p className="text-sm text-muted-foreground">
            Zeitraum: {data.metadata.period} | Letzte Aktualisierung: {data.metadata.lastUpdated}
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportieren
        </Button>
      </div>
      
      {topMachine && (
        <Card className="border-amber-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Automat mit den meisten Ereignissen</CardTitle>
            <CardDescription>höchste Anzahl an Systemereignissen im Zeitraum</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center mb-4">
              <Bell className="h-10 w-10 text-amber-500 mr-4" />
              <div>
                <div className="text-xl font-bold">{topMachine.machineName}</div>
                <div className="text-sm text-muted-foreground">ID: {topMachine.machineId}</div>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="text-sm font-medium text-muted-foreground">Gesamtzahl der Ereignisse</div>
              <div className="text-2xl font-bold">{topMachine.totalEvents}</div>
            </div>
            
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Ereignistypen</div>
              <div className="space-y-3">
                {data.topMachineEventTypes.map((eventType, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <div className={`font-medium ${getEventColor(eventType.eventType)}`}>
                        {eventType.eventType}
                        {eventType.description && (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({eventType.description})
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold">
                        {eventType.count} ({(eventType.percentage || 0).toFixed(2)}%)
                      </div>
                    </div>
                    <Progress value={eventType.percentage} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Verteilung der Ereignistypen</CardTitle>
            <CardDescription>Globale Verteilung über alle Automaten</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.eventTypeDistribution.map((eventType, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className={`font-medium ${getEventColor(eventType.eventType)}`}>
                      {eventType.eventType}
                      {eventType.description && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({eventType.description})
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold">
                      {eventType.count} ({(eventType.percentage || 0).toFixed(2)}%)
                    </div>
                  </div>
                  <Progress value={eventType.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Top Automaten nach Ereignissen</CardTitle>
            <CardDescription>Automaten mit den meisten Systemereignissen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.machines.slice(0, 5).map((machine) => (
                <div key={machine.machineId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{machine.machineName}</div>
                    <div className="font-bold">{machine.totalEvents}</div>
                  </div>
                  <Progress 
                    value={machine.totalEvents / (data.machines[0]?.totalEvents || 1) * 100}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Alle Automaten</CardTitle>
          <CardDescription>Übersicht der Ereignishäufigkeit pro Automat</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Automat</th>
                  <th className="text-right py-2 px-4">ID</th>
                  <th className="text-right py-2 px-4">Anzahl Ereignisse</th>
                </tr>
              </thead>
              <tbody>
                {data.machines.map((machine) => (
                  <tr key={machine.machineId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{machine.machineName}</td>
                    <td className="text-right py-2 px-4">{machine.machineId}</td>
                    <td className="text-right py-2 px-4">{machine.totalEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
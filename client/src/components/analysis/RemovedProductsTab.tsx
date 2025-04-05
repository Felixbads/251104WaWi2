import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { jsPDF } from "jspdf";
import axios from "axios";

interface RemovedProductsTabProps {
  buildQueryUrl: (endpoint: string) => string;
}

interface MachineRemovedProducts {
  machineId: number;
  machineName: string;
  totalRefills: number;
  totalRemovedProducts: number;
  avgRemovedPerRefill: number;
}

interface RemovedProduct {
  productName: string;
  totalRemoved: number;
  count: number;
}

interface ApiResponse {
  machines: MachineRemovedProducts[];
  topMachine: MachineRemovedProducts | null;
  topProductsRemoved: RemovedProduct[];
  metadata: {
    period: string;
    startDate: string;
    endDate: string;
    lastUpdated: string;
  };
}

export default function RemovedProductsTab({ buildQueryUrl }: RemovedProductsTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // URL mit Benutzertoken erstellen
        const url = buildQueryUrl('/api/statistics/removed-products');
        
        // Daten abrufen
        const response = await axios.get<ApiResponse>(url);
        setData(response.data);
      } catch (err) {
        console.error("Fehler beim Laden der Daten zu entfernten Produkten:", err);
        setError("Die Daten zu entfernten Produkten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.");
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
    doc.text("Analyse der entfernten Produkte", pageWidth / 2, 20, { align: "center" });
    
    // Metadaten
    doc.setFontSize(10);
    doc.text(`Zeitraum: ${data.metadata.period}`, 14, 30);
    doc.text(`Von: ${data.metadata.startDate} bis: ${data.metadata.endDate}`, 14, 35);
    doc.text(`Erstellt am: ${data.metadata.lastUpdated}`, 14, 40);
    
    // Top-Maschine mit den meisten entfernten Produkten
    doc.setFontSize(12);
    doc.text("Automat mit den meisten entfernten Produkten:", 14, 50);
    doc.setFontSize(10);
    
    if (data.topMachine) {
      doc.text(`${data.topMachine.machineName} (ID: ${data.topMachine.machineId})`, 14, 55);
      doc.text(`Gesamtzahl entfernter Produkte: ${data.topMachine.totalRemovedProducts}`, 14, 60);
      doc.text(`Durchschnitt pro Auffüllung: ${data.topMachine.avgRemovedPerRefill.toFixed(2)}`, 14, 65);
    } else {
      doc.text("Keine Daten verfügbar", 14, 55);
    }
    
    // Top entfernte Produkte
    doc.setFontSize(12);
    doc.text("Top entfernte Produkte:", 14, 75);
    doc.setFontSize(9);
    
    let yPos = 80;
    data.topProductsRemoved.forEach((product, index) => {
      doc.text(`${index + 1}. ${product.productName}`, 14, yPos);
      doc.text(`Gesamt entfernt: ${product.totalRemoved}`, 100, yPos);
      yPos += 5;
    });
    
    // PDF speichern
    doc.save("Analyse_Entfernte_Produkte.pdf");
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

  // Finde den Automaten mit den meisten entfernten Produkten
  const topMachine = data.topMachine;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Analyse entfernter Produkte</h3>
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
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Automat mit den meisten entfernten Produkten</CardTitle>
            <CardDescription>höchste Anzahl an herausgenommenen Produkten bei Auffüllungen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center mb-4">
              <Package className="h-10 w-10 text-blue-500 mr-4" />
              <div>
                <div className="text-xl font-bold">{topMachine.machineName}</div>
                <div className="text-sm text-muted-foreground">ID: {topMachine.machineId}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Gesamt entfernte Produkte</div>
                <div className="text-2xl font-bold">{topMachine.totalRemovedProducts}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Anzahl Auffüllungen</div>
                <div className="text-2xl font-bold">{topMachine.totalRefills}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Ø pro Auffüllung</div>
                <div className="text-2xl font-bold">{topMachine.avgRemovedPerRefill.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Am häufigsten entfernte Produkte</CardTitle>
            <CardDescription>die bei Auffüllungen am häufigsten entfernt wurden</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topProductsRemoved.map((product, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{product.productName}</div>
                    <div className="font-bold">{product.totalRemoved}</div>
                  </div>
                  <Progress value={product.totalRemoved / (data.topProductsRemoved[0]?.totalRemoved || 1) * 100} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Automaten nach entfernten Produkten</CardTitle>
            <CardDescription>Automaten mit den meisten entfernten Produkten</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.machines.slice(0, 5).map((machine) => (
                <div key={machine.machineId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{machine.machineName}</div>
                    <div className="font-bold">{machine.totalRemovedProducts}</div>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Auffüllungen: {machine.totalRefills}</span>
                    <span>Ø {machine.avgRemovedPerRefill.toFixed(2)} pro Auffüllung</span>
                  </div>
                  <Progress 
                    value={machine.totalRemovedProducts / (data.machines[0]?.totalRemovedProducts || 1) * 100}
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
          <CardDescription>Übersicht aller Automaten und ihrer entfernten Produkte</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Automat</th>
                  <th className="text-right py-2 px-4">ID</th>
                  <th className="text-right py-2 px-4">Auffüllungen</th>
                  <th className="text-right py-2 px-4">Entfernte Produkte</th>
                  <th className="text-right py-2 px-4">Ø pro Auffüllung</th>
                </tr>
              </thead>
              <tbody>
                {data.machines.map((machine) => (
                  <tr key={machine.machineId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{machine.machineName}</td>
                    <td className="text-right py-2 px-4">{machine.machineId}</td>
                    <td className="text-right py-2 px-4">{machine.totalRefills}</td>
                    <td className="text-right py-2 px-4">{machine.totalRemovedProducts}</td>
                    <td className="text-right py-2 px-4">{machine.avgRemovedPerRefill.toFixed(2)}</td>
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
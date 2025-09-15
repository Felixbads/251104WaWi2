import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { useAuth } from "@/lib";

import ProductPerformanceTab from "@/components/analysis/ProductPerformanceTab";
import RemovedProductsTab from "@/components/analysis/RemovedProductsTab";
import EventFrequencyTab from "@/components/analysis/EventFrequencyTab";
import WeatherCorrelationTab from "@/components/analysis/WeatherCorrelationTab";

interface UserWithToken {
  id: number;
  email: string;
  role: string;
  approved: boolean;
  token?: string;
}

export default function AdvancedAnalysis() {
  const [activeTab, setActiveTab] = useState("product-performance");
  const { user } = useAuth();
  const typedUser = user as UserWithToken;
  
  // Funktion zum Erstellen der API-URL mit Benutzertoken
  const buildQueryUrl = (endpoint: string) => {
    // Falls ein Benutzertoken vorhanden ist, füge es hinzu
    const token = typedUser?.token || "";
    if (token) {
      // Prüfen, ob die URL bereits einen Query-Parameter hat
      if (endpoint.includes('?')) {
        return `${endpoint}&token=${token}`;
      } else {
        return `${endpoint}?token=${token}`;
      }
    }
    return endpoint;
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-2">Erweiterte Analyse</h1>
      <p className="text-muted-foreground mb-6">
        Detaillierte Analysen zur Wirtschaftlichkeit, Warenentnahme, Ereignissen und Wettereinflüssen
      </p>
      
      <Alert className="bg-blue-50 border-blue-200">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertTitle>Hinweis zu den Analysen</AlertTitle>
        <AlertDescription>
          Die erweiterte Analyse bietet tiefgehende Einblicke in verschiedene Aspekte des Betriebs.
          Die Daten werden täglich aktualisiert und basieren auf den verfügbaren Transaktions-, Inventar- und Wetterdaten.
        </AlertDescription>
      </Alert>
      
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <CardHeader className="pb-3">
            <TabsList className="w-full overflow-x-auto scrollbar-hide flex justify-start">
              <TabsTrigger value="product-performance">Produktleistung</TabsTrigger>
              <TabsTrigger value="removed-products">Entfernte Produkte</TabsTrigger>
              <TabsTrigger value="event-frequency">Ereignisanalyse</TabsTrigger>
              <TabsTrigger value="weather-correlation">Wettereinfluss</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-2">
            <TabsContent value="product-performance" className="mt-0">
              <ProductPerformanceTab buildQueryUrl={buildQueryUrl} />
            </TabsContent>
            
            <TabsContent value="removed-products" className="mt-0">
              <RemovedProductsTab buildQueryUrl={buildQueryUrl} />
            </TabsContent>
            
            <TabsContent value="event-frequency" className="mt-0">
              <EventFrequencyTab buildQueryUrl={buildQueryUrl} />
            </TabsContent>
            
            <TabsContent value="weather-correlation" className="mt-0">
              <WeatherCorrelationTab buildQueryUrl={buildQueryUrl} />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
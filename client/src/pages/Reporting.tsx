import React, { useState, Suspense } from "react";
import {
  RefreshCw,
  Building,
  Package,
  ShoppingBag,
  Truck,
  Database,
  Loader2,
} from "lucide-react";
// Relative Pfade verwenden statt Aliasnamen, um NPM-Probleme zu vermeiden
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { toast } from "../hooks/use-toast";
import { useQuery, QueryClient } from "@tanstack/react-query";
import { format } from 'date-fns';

// Typdefinition für die Statistik-API-Antwort
interface DatabaseStatisticsResponse {
  transactions: number;
  openOrders: number;
  products: number;
  machines: number;
  suppliers: number;
  lastUpdated: string;
}

// Komponente für den Ladeindikator
function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center h-24">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Komponente für Fehlermeldungen
function ErrorDisplay({ error }: { error: Error }) {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-500">Fehler beim Laden der Daten</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{error.message}</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Neu laden
        </Button>
      </CardContent>
    </Card>
  );
}

// Datenbank-Statistiken Tab
function DatabaseStatistics() {
  // Einfache Statistiken aus der Datenbank laden
  const { data, error, isLoading, isError } = useQuery<DatabaseStatisticsResponse>({
    queryKey: ['/api/statistics/database'],
    staleTime: 5 * 60 * 1000 // 5 Minuten Caching
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError) return <ErrorDisplay error={error as Error} />;
  if (!data) return <ErrorDisplay error={new Error('Keine Daten erhalten')} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Database className="h-4 w-4 mr-2 text-muted-foreground" />
              Transaktionen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.transactions.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <ShoppingBag className="h-4 w-4 mr-2 text-muted-foreground" />
              Offene Bestellungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.openOrders.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Package className="h-4 w-4 mr-2 text-muted-foreground" />
              Produkte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.products.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Building className="h-4 w-4 mr-2 text-muted-foreground" />
              Automaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.machines.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
              Lieferanten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.suppliers.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Datenbankstatistiken</CardTitle>
          <CardDescription>
            Letzte Aktualisierung: {format(new Date(data.lastUpdated), 'dd.MM.yyyy HH:mm')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Diese Ansicht zeigt die aktuellen Datenmengen in unserer Datenbank.
            Die Auswertungen werden direkt aus der Datenbank geladen, ohne externe APIs zu verwenden,
            um eine maximale Leistung und Stabilität zu gewährleisten.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Optimierte, ressourcenschonende Reporting-Komponente
export default function Reporting() {
  const [activeTab, setActiveTab] = useState("database");
  const queryClient = new QueryClient();
  
  // Nur eine Funktion für UI-Feedback und Datenaktualisierung
  const refreshData = () => {
    // Alle relevanten Queries ungültig machen
    queryClient.invalidateQueries({ queryKey: ['/api/statistics/database'] });
    
    toast({
      title: "Daten werden aktualisiert",
      description: "Die Statistiken werden neu geladen.",
    });
  };
  
  // Das aktuelle Datum für den Header
  const today = new Date();
  const formattedDate = format(today, 'dd.MM.yyyy');
  
  return (
    <div className="space-y-6">
      {/* Header mit Datum und Refresh-Button */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-grow">
          <h1 className="text-2xl font-bold">Auswertungen</h1>
          <p className="text-muted-foreground">Ressourcenschonende Datenauswertung</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs h-7 px-2 py-1">
            Stand: {formattedDate}
          </Badge>
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={refreshData}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Vereinfachte Tabs für verschiedene Statistiksichten */}
      <Tabs defaultValue="database" onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="database" className="flex items-center gap-1">
            <Database className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Datenbank</span>
          </TabsTrigger>
          <TabsTrigger value="machines" className="flex items-center gap-1">
            <Building className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Automaten</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-1">
            <Package className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Produkte</span>
          </TabsTrigger>
        </TabsList>
      
        {/* Datenbank-Statistiken Tab */}
        <TabsContent value="database" className="space-y-6">
          <Suspense fallback={<LoadingIndicator />}>
            <DatabaseStatistics />
          </Suspense>
        </TabsContent>
        
        {/* Automaten Tab - Nur ein einfacher Platzhalter */}
        <TabsContent value="machines" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Automaten-Übersicht</CardTitle>
              <CardDescription>Einfache Automaten-Statistiken</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Diese vereinfachte Ansicht zeigt grundlegende Informationen zu den Automaten,
                ohne komplexe Berechnungen oder externe API-Aufrufe durchzuführen.
              </p>
              <p className="mt-2">
                Für detaillierte Automaten-Analysen nutzen Sie bitte die Automaten-Ansicht
                unter dem Menüpunkt "Automaten".
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Produkte Tab - Nur ein einfacher Platzhalter */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Produkt-Übersicht</CardTitle>
              <CardDescription>Einfache Produkt-Statistiken</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Diese vereinfachte Ansicht zeigt grundlegende Informationen zu den Produkten,
                ohne komplexe Berechnungen oder externe API-Aufrufe durchzuführen.
              </p>
              <p className="mt-2">
                Für detaillierte Produkt-Analysen nutzen Sie bitte die Produkt-Ansicht
                unter dem Menüpunkt "Produkte".
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
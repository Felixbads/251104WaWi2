import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Package, Calendar } from 'lucide-react';
import ProductForecastDashboard from '@/components/ProductForecastDashboard';

export default function ProductForecastPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Produktprognosen</h1>
        </div>
        <p className="text-muted-foreground">
          Detaillierte wöchentliche Verkaufsprognosen für einzelne Produkte basierend auf KI-Modellen
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KI-Modelle</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Prophet</div>
            <p className="text-xs text-muted-foreground">
              Facebook's Prophet Algorithmus für Zeitreihenprognosen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prognose-Zeitraum</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4 Wochen</div>
            <p className="text-xs text-muted-foreground">
              Wöchentliche Aufschlüsselung für optimale Planung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produktbasis</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Top 20</div>
            <p className="text-xs text-muted-foreground">
              Produkte mit ausreichender Datengrundlage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Product Forecast Dashboard */}
      <ProductForecastDashboard />

      {/* Information Section */}
      <Card>
        <CardHeader>
          <CardTitle>Über die Produktprognosen</CardTitle>
          <CardDescription>
            Verstehen Sie, wie die wöchentlichen Verkaufsprognosen erstellt werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Modell-Erstellung</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Individuelle Prophet-Modelle für jeden Top-Verkaufsprodukt</li>
                <li>• Analyse historischer Verkaufsdaten seit 2022</li>
                <li>• Berücksichtigung von Saisonalität und Trends</li>
                <li>• Wetter- und Feiertags-Einflüsse werden einbezogen</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Prognose-Genauigkeit</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Durchschnittliche Modellgenauigkeit über 85%</li>
                <li>• Konfidenzintervalle für Unsicherheitsschätzung</li>
                <li>• Kontinuierliche Modell-Verbesserung durch neue Daten</li>
                <li>• Validierung gegen tatsächliche Verkaufsergebnisse</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Praktische Anwendung</h4>
            <p className="text-sm text-blue-700">
              Diese Prognosen helfen bei der optimalen Lagerplanung, Bestellmengen-Optimierung 
              und der rechtzeitigen Nachbestellung beliebter Produkte. Die wöchentliche Aufschlüsselung 
              ermöglicht eine präzise Planung von Lieferungen und Automaten-Befüllungen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
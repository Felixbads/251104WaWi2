import { BarChart2, Calendar, Clock, Download, FileText, Filter, PieChart, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function Reporting() {
  const [activeTab, setActiveTab] = useState("overview");
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <BarChart2 className="h-6 w-6 mr-2" />
            Auswertungen
          </h1>
          <p className="text-gray-500 mt-1">
            Analysieren Sie Kennzahlen, Trends und wichtige Geschäftsindikatoren
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Zeitraum
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportieren
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="machines">Automaten</TabsTrigger>
          <TabsTrigger value="products">Produkte</TabsTrigger>
          <TabsTrigger value="suppliers">Lieferanten</TabsTrigger>
          <TabsTrigger value="stock">Lagerbestand</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Haupt-KPI-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Gesamtumsatz" 
          value="4.256,78 €" 
          change="+8.2%" 
          changeType="increase" 
          period="im Vergleich zum Vormonat"
        />
        <KpiCard 
          title="Transaktionen" 
          value="1.245" 
          change="+12.5%" 
          changeType="increase" 
          period="im Vergleich zum Vormonat"
        />
        <KpiCard 
          title="Ø Transaktionswert" 
          value="3,42 €" 
          change="-4.3%" 
          changeType="decrease" 
          period="im Vergleich zum Vormonat"
        />
        <KpiCard 
          title="Profitabilität" 
          value="1.820,50 €" 
          change="+5.7%" 
          changeType="increase" 
          period="im Vergleich zum Vormonat"
        />
      </div>

      {/* Platzhalter für den Chart-Bereich */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <PieChart className="h-5 w-5 mr-2" />
            Diese Seite wird gerade entwickelt
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="bg-gray-100 rounded-full p-4 mb-6">
            <FileText className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium mb-2">
            Die Auswertungsseite wird aktuell implementiert
          </h3>
          <p className="text-gray-500 max-w-lg mb-6">
            Die Entwicklung dieser Seite ist in Arbeit. Hier werden bald detaillierte Diagramme, Trends und Analysen basierend auf Ihren Daten angezeigt.
          </p>
          <div className="flex items-center text-sm text-gray-500">
            <Clock className="h-4 w-4 mr-1" />
            Voraussichtliche Fertigstellung in Kürze
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// KPI Card Komponente
interface KpiCardProps {
  title: string;
  value: string;
  change: string;
  changeType: 'increase' | 'decrease' | 'neutral';
  period: string;
}

function KpiCard({ title, value, change, changeType, period }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center mt-1">
          <span 
            className={`text-sm font-medium ${
              changeType === 'increase' ? 'text-green-600' : 
              changeType === 'decrease' ? 'text-red-600' : 
              'text-gray-500'
            }`}
          >
            {change}
          </span>
          <span className="text-xs text-gray-500 ml-1">{period}</span>
        </div>
      </CardContent>
    </Card>
  );
}
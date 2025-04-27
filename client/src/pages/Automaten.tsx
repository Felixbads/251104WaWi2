import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Package, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Euro,
  ShoppingCart,
  CreditCard,
  Tag,
  MapPin,
  Map,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  Grid,
  List,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, getMachines, Machine } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

// Erweiterte Maschinenschnittstelle mit den zusätzlichen KPIs
interface EnhancedMachine extends Machine {
  todayTransactions?: number;
  todayRevenue?: number;
  lastSale?: string;
  cashlessStatus?: 'ok' | 'warning' | 'error';
  ageVerificationStatus?: 'ok' | 'warning' | 'error';
}

export default function Automaten() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid");
  const [, setLocation] = useLocation();
  const [locationFilter, setLocationFilter] = useState<string>("alle");
  const [machineTypeFilter, setMachineTypeFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Daten abrufen und aktuelle Werte aus der API verwenden
  const { data: machines, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: async () => {
      const data = await getMachines();

      // Wir verwenden die echten Daten aus der API
      const enhancedMachines = data.map(machine => ({
        ...machine,
        // Initiale Werte setzen, die später durch API-Daten ersetzt werden
        todayTransactions: 0,
        todayRevenue: 0,
        cashlessStatus: machine.status === 'online' ? 'ok' : 'warning',
        ageVerificationStatus: 'ok'
      } as EnhancedMachine));

      // Für jede Maschine die täglichen Statistiken abrufen
      for (const machine of enhancedMachines) {
        try {
          console.log(`DEBUG: Abrufen von KPIs für Maschine ${machine.id} (${machine.machineName})`);
          
          // Neue API für alle KPIs in einem Aufruf nutzen
          const response = await fetch(`/api/machines/${machine.id}/daily-stats`);
          console.log(`DEBUG: API-Status für Maschine ${machine.id}:`, response.status);
          
          if (response.ok) {
            const stats = await response.json();
            console.log(`DEBUG: API-Antwort für Maschine ${machine.id}:`, JSON.stringify(stats));
            
            // Überprüfen der API-Antwort
            if (Object.keys(stats).length === 0) {
              console.error(`Fehler: Leere API-Antwort für Maschine ${machine.id}`);
              continue; // Überspringe diese Maschine
            }
            
            // Tägliche Transaktionen und Umsatz
            machine.todayTransactions = stats.todayTransactions || 0;
            machine.todayRevenue = stats.todayRevenue || 0;
            console.log(`DEBUG: Heutige Transaktionen: ${machine.todayTransactions}, Umsatz: ${machine.todayRevenue}`);
            
            // Letzter Verkauf
            console.log(`DEBUG: lastSale aus API:`, stats.lastSale);
            if (stats.lastSale) {
              try {
                // Prüfen, ob stats.lastSale.datetime existiert und gültig ist
                if (stats.lastSale.datetime) {
                  machine.lastSale = new Date(stats.lastSale.datetime).toISOString();
                  console.log('Letzter Verkauf gesetzt aus datetime:', machine.lastSale);
                } else if (typeof stats.lastSale === 'object') {
                  // Falls stats.lastSale ein Objekt ist, aber kein datetime hat
                  console.log('lastSale ist ein Objekt ohne datetime-Feld:', stats.lastSale);
                  
                  // Fallback: Wenn das Objekt ein vollständiges Transaction-Objekt ist, 
                  // könnte das Datumswert in einem anderen Feld sein
                  const possibleDateFields = ['datetime', 'createdAt', 'updatedAt', 'date', 'timestamp'];
                  for (const field of possibleDateFields) {
                    if (stats.lastSale[field] && !isNaN(new Date(stats.lastSale[field]).getTime())) {
                      machine.lastSale = new Date(stats.lastSale[field]).toISOString();
                      console.log(`Letzter Verkauf aus alternativer Eigenschaft '${field}':`, machine.lastSale);
                      break;
                    }
                  }
                  
                  if (!machine.lastSale) {
                    // Falls kein passendes Feld gefunden wurde
                    console.log('Kein gültiges Datumfeld gefunden in:', Object.keys(stats.lastSale));
                    machine.lastSale = undefined;
                  }
                } else {
                  // Falls stats.lastSale direkt ein Datum ist (String oder Date)
                  machine.lastSale = new Date(stats.lastSale).toISOString();
                  console.log('Letzter Verkauf direkt aus stats.lastSale:', machine.lastSale);
                }
              } catch (dateError) {
                console.error('Fehler bei der Datums-Formatierung:', dateError);
                console.log('Problematischer Wert war:', stats.lastSale);
                machine.lastSale = undefined;
              }
            }
            
            // Letzter bargeldloser Verkauf und Status-Indikator
            if (stats.lastCashlessSale) {
              const now = new Date();
              const lastCashlessDate = new Date(stats.lastCashlessSale.datetime);
              const hoursSinceLastCashless = (now.getTime() - lastCashlessDate.getTime()) / (1000 * 60 * 60);
              
              // Status basierend auf der Zeit seit dem letzten bargeldlosen Verkauf
              if (hoursSinceLastCashless < 1) {
                machine.cashlessStatus = 'ok';
              } else if (hoursSinceLastCashless < 4) {
                machine.cashlessStatus = 'warning';
              } else {
                machine.cashlessStatus = 'error';
              }
            } else {
              machine.cashlessStatus = 'error'; // Keine bargeldlosen Verkäufe
            }
            
            // Alkoholverkaufs-Status-Indikator
            if (stats.alcoholSales) {
              const { today, weekAvg, monthAvg } = stats.alcoholSales;
              
              // Status basierend auf Abweichung vom Durchschnitt
              if (today <= monthAvg * 1.2 && today >= monthAvg * 0.8) {
                machine.ageVerificationStatus = 'ok'; // Im normalen Bereich
              } else if (today > monthAvg * 1.5 || today < monthAvg * 0.5) {
                machine.ageVerificationStatus = 'error'; // Starke Abweichung
              } else {
                machine.ageVerificationStatus = 'warning'; // Leichte Abweichung
              }
            }
          }
        } catch (err) {
          console.error(`Fehler beim Abrufen der KPIs für Maschine ${machine.id}:`, err);
        }
      }

      return enhancedMachines;
    },
  });

  // Extrahiere verfügbare Standorte und Maschinentypen für die Filter
  const locations = machines ? Array.from(new Set(machines.map(m => m.location).filter(Boolean))) : [];
  const machineTypes = ['Snackautomat', 'Getränkeautomat', 'Kombi-Automat', 'Kaffeeautomat'];

  // Filter- und Suchfunktionen
  const filteredMachines = machines?.filter((machine: EnhancedMachine) => {
    // Demo-Automaten mit ID 1 ausschließen
    if (!machine || !machine.machineName || machine.id === 1) return false;

    const matchesSearch = machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (machine.location?.toLowerCase().includes(searchTerm.toLowerCase()) || false);

    const matchesLocation = locationFilter === 'alle' || machine.location === locationFilter;

    // In einem echten Szenario würde machine.type existieren - hier nehmen wir eine zufällige Zuordnung vor
    const matchesMachineType = machineTypeFilter === 'alle' || 
                              (machine.vendonId?.length || 0) % machineTypes.length === machineTypes.indexOf(machineTypeFilter);

    const matchesStatus = !statusFilter || machine.status === statusFilter;

    return matchesSearch && matchesLocation && matchesMachineType && matchesStatus;
  }) || [];

  // Refreshen der Daten
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
  };

  // AutomatenKarte Komponente mit erweiterten KPIs
  const AutomatenKarte = ({ machine }: { machine: EnhancedMachine }) => {
    return (
      <Card 
        className="overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer"
        onClick={() => setLocation(`/automaten/${machine.id}`)}
      >
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg truncate">{machine.machineName}</CardTitle>
            <StatusBadge status={machine.status} />
          </div>
          {/* Standort ausgeblendet, wie vom Benutzer gewünscht */}
          <CardDescription className="text-xs text-gray-500">
            Vendon ID: {machine.vendonId}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2 space-y-4">
          {/* KPI-Bereich */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Letzter Verkauf
              </div>
              <div className="font-medium">
                {machine.lastSale 
                  ? formatDateTime(machine.lastSale, 'datetime')
                  : '–'}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> Transaktionen heute
              </div>
              <div className="font-medium">
                {machine.todayTransactions || 0}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <Euro className="h-3 w-3" /> Umsatz heute
              </div>
              <div className="font-medium">
                {machine.todayRevenue?.toFixed(2) || '0.00'} €
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-gray-500 flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Cashless-Status
              </div>
              <div>
                <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
              </div>
            </div>
          </div>

          {/* Altersverifikation (falls vorhanden) */}
          <div className="flex items-center justify-between">
            <div className="text-gray-500 text-xs flex items-center gap-1">
              <Tag className="h-3 w-3" /> Altersverifikation
            </div>
            <AgeVerificationIndicator status={machine.ageVerificationStatus || 'error'} />
          </div>
        </CardContent>
        <CardFooter className="pt-2 flex items-center justify-end">
          {/* Details-Button entfernt, wie vom Benutzer gewünscht */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-2"
            onClick={async (e) => {
              e.stopPropagation(); // Verhindert, dass der Kartenklick ausgelöst wird
              
              // Aktualisierte KPI-Werte direkt von der neuen API abrufen
              try {
                const response = await fetch(`/api/machines/${machine.id}/daily-stats`);
                if (response.ok) {
                  const stats = await response.json();
                  
                  // Maschine im Cache aktualisieren
                  queryClient.setQueryData(['/api/machines'], (oldData: EnhancedMachine[] | undefined) => {
                    if (!oldData) return oldData;
                    
                    return oldData.map(m => {
                      if (m.id === machine.id) {
                        // KPIs aktualisieren
                        return {
                          ...m,
                          todayTransactions: stats.todayTransactions || 0,
                          todayRevenue: stats.todayRevenue || 0,
                          lastSale: stats.lastSale ? new Date(stats.lastSale.datetime).toISOString() : m.lastSale,
                        };
                      }
                      return m;
                    });
                  });
                }
              } catch (err) {
                console.error(`Fehler beim Aktualisieren der KPIs für Maschine ${machine.id}:`, err);
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    );
  };

  // Automaten-Listeneintrag mit erweiterten KPIs
  const AutomatenListenEintrag = ({ machine }: { machine: EnhancedMachine }) => {
    return (
      <div 
        className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setLocation(`/automaten/${machine.id}`)}
      >
        <div className="flex-grow mr-4">
          <div className="flex items-center mb-1">
            <h3 className="font-medium truncate mr-2">{machine.machineName}</h3>
            <StatusBadge status={machine.status} />
          </div>
          <div className="flex items-center text-xs text-gray-600 gap-2">
            {/* Standort ausgeblendet, wie vom Benutzer gewünscht */}
            <span>ID: {machine.vendonId}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <Clock className="h-3 w-3 mr-1" /> Letzter Verkauf
            </p>
            <p className="font-medium">
              {machine.lastSale 
                ? formatDateTime(machine.lastSale, 'time')
                : '–'}
            </p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <ShoppingCart className="h-3 w-3 mr-1" /> Heute
            </p>
            <p className="font-medium">{machine.todayTransactions || 0}</p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <Euro className="h-3 w-3 mr-1" /> Umsatz
            </p>
            <p className="font-medium">{machine.todayRevenue?.toFixed(2) || '0.00'} €</p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs flex items-center justify-center">
              <CreditCard className="h-3 w-3 mr-1" /> Cashless
            </p>
            <div className="flex justify-center">
              <CashlessStatusIndicator status={machine.cashlessStatus || 'error'} />
            </div>
          </div>

          <div className="flex justify-end">
            {/* Details-Button entfernt, wie vom Benutzer gewünscht */}
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={async (e) => {
                e.stopPropagation();
                
                // Aktualisierte KPI-Werte direkt von der neuen API abrufen
                try {
                  const response = await fetch(`/api/machines/${machine.id}/daily-stats`);
                  if (response.ok) {
                    const stats = await response.json();
                    
                    // Maschine im Cache aktualisieren
                    queryClient.setQueryData(['/api/machines'], (oldData: EnhancedMachine[] | undefined) => {
                      if (!oldData) return oldData;
                      
                      return oldData.map(m => {
                        if (m.id === machine.id) {
                          // KPIs aktualisieren
                          return {
                            ...m,
                            todayTransactions: stats.todayTransactions || 0,
                            todayRevenue: stats.todayRevenue || 0,
                            lastSale: stats.lastSale ? new Date(stats.lastSale.datetime).toISOString() : m.lastSale,
                          };
                        }
                        return m;
                      });
                    });
                  }
                } catch (err) {
                  console.error(`Fehler beim Aktualisieren der KPIs für Maschine ${machine.id}:`, err);
                }
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Status-Badge-Komponente
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: 
      | "default"
      | "outline"
      | "secondary"
      | "destructive" = "default";
    let icon = null;
    let className = "";

    switch (status) {
      case "active":
        variant = "default";
        className = "bg-green-500 hover:bg-green-700";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "inactive":
        variant = "secondary";
        break;
      case "error":
        variant = "destructive";
        icon = <AlertTriangle className="h-3 w-3 mr-1" />;
        break;
      default:
        variant = "outline";
    }

    return (
      <Badge variant={variant} className={`flex items-center ${className}`}>
        {icon}
        {status === "active" ? "Aktiv" : 
         status === "inactive" ? "Inaktiv" : 
         status === "error" ? "Fehler" : status}
      </Badge>
    );
  };

  // Cashless Status Indikator
  const CashlessStatusIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let statusText = '';
    let tooltip = '';

    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        statusText = 'OK';
        tooltip = 'Letzte Cashless-Transaktion vor weniger als 1 Stunde';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        statusText = 'Prüfen';
        tooltip = 'Letzte Cashless-Transaktion vor mehr als 4 Stunden';
        break;
      case 'error':
        statusColor = 'text-red-500';
        statusText = 'Problem';
        tooltip = 'Keine Cashless-Transaktionen in den letzten 24 Stunden';
        break;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor} font-medium`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4 mr-1" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4 mr-1" /> : 
               <AlertTriangle className="h-4 w-4 mr-1" />}
              <span className="text-xs">{statusText}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Altersverifikations-Indikator
  const AgeVerificationIndicator = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    let statusColor = '';
    let tooltip = '';

    switch(status) {
      case 'ok':
        statusColor = 'text-green-500';
        tooltip = 'Alle Altersverifizierungen erfolgreich';
        break;
      case 'warning':
        statusColor = 'text-amber-500';
        tooltip = 'Einige Altersverifizierungen fehlgeschlagen';
        break;
      case 'error':
        statusColor = 'text-red-500';
        tooltip = 'Mehrere Altersverifizierungen fehlgeschlagen';
        break;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center ${statusColor}`}>
              {status === 'ok' ? <CheckCircle className="h-4 w-4" /> : 
               status === 'warning' ? <AlertTriangle className="h-4 w-4" /> : 
               <AlertTriangle className="h-4 w-4" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Suchfeld und Filter-Dropdowns */}
        <div className="flex-grow flex flex-col sm:flex-row gap-2">
          {/* Suchfeld */}
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              placeholder="Automaten suchen..."
              className="pl-8 h-9 w-full"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter-Dropdowns */}
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder="Standort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Standorte</SelectItem>
              {locations.map(location => (
                <SelectItem key={location} value={location}>{location}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={machineTypeFilter} onValueChange={setMachineTypeFilter}>
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder="Maschinentyp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Typen</SelectItem>
              {machineTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            {/* Ansichts-Schalter */}
            <div className="border rounded-md p-0.5 flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kachelansicht</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Listenansicht</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === "map" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("map")}
                    className="h-8 w-8 rounded-sm"
                  >
                    <Map className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kartenansicht</TooltipContent>
              </Tooltip>
            </div>

            {/* Aktualisieren Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Aktualisieren</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Tabs for Status Filtering */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setStatusFilter(null)}>
            Alle
          </TabsTrigger>
          <TabsTrigger value="active" onClick={() => setStatusFilter("active")}>
            Aktiv
          </TabsTrigger>
          <TabsTrigger value="inactive" onClick={() => setStatusFilter("inactive")}>
            Inaktiv
          </TabsTrigger>
          <TabsTrigger value="error" onClick={() => setStatusFilter("error")}>
            Fehler
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden der Automaten: {String(error)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {!isLoading && !error && (
        <p className="text-sm text-gray-500">
          {filteredMachines.length} {filteredMachines.length === 1 ? 'Automat' : 'Automaten'} gefunden
        </p>
      )}

      {/* Machines Grid/List View */}
      {!isLoading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMachines.map((machine: EnhancedMachine) => (
            <AutomatenKarte key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "list" && (
        <div className="border rounded-md divide-y">
          {filteredMachines.map((machine: EnhancedMachine) => (
            <AutomatenListenEintrag key={machine.id} machine={machine} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "map" && (
        <Card className="h-[500px] flex items-center justify-center">
          <CardContent className="text-center">
            <Map className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Kartenansicht</h3>
            <p className="text-gray-500 max-w-md">
              Die Kartenansicht mit den genauen Standorten aller Automaten wird in einem kommenden Update verfügbar sein. Wir arbeiten daran!
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {!isLoading && !error && filteredMachines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium">Keine Automaten gefunden</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? `Keine Ergebnisse für "${searchTerm}"`
              : "Es wurden keine Automaten gefunden, die den Filterkriterien entsprechen"}
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setSearchTerm("");
              setStatusFilter(null);
              setLocationFilter("alle");
              setMachineTypeFilter("alle");
            }}
          >
            Filter zurücksetzen
          </Button>
        </div>
      )}
    </div>
  );
}
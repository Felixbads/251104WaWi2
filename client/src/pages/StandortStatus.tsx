import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { 
  Clock, 
  ShoppingCart, 
  Wine, 
  CreditCard, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock3,
  Search,
  RefreshCw,
  Euro,
  PackageX,
  Play,
  Pause,
  Power,
  Wifi,
  WifiOff,
  Package,
  AlertCircle,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface MachineStatusData {
  id: number;
  machineName: string;
  location: string | null;
  locationId?: number | null;
  realMachineId?: number | null;
  lastRefill?: {
    datetime: string;
    operator: string;
    daysAgo: number;
  } | null;
  lastSale?: {
    datetime: string;
    daysAgo: number;
  } | null;
  lastCashlessSale?: {
    datetime: string;
    paymentMethod: string;
    daysAgo: number;
  } | null;
  lastAlcoholSale?: {
    datetime: string;
    productName: string;
    daysAgo: number;
  } | null;
  lastDoorOpening?: {
    datetime: string;
    daysAgo: number;
  } | null;
  lastCashCollection?: {
    datetime: string;
    daysAgo: number;
  } | null;
  todayRevenue: number;
  recentTransactions: Array<{
    datetime: string;
    productName: string;
    amount: number;
  }>;
  status: 'ok' | 'warning' | 'error';
  warnings: string[];
  mhdStatus?: {
    expiredCount: number;
    warningCount: number;
    earliestExpiry: string | null;
    alertLevel: 'expired' | 'warning' | 'ok';
  };
  // New fields for enhanced status display
  systemStatus?: {
    power: boolean;
    powerStatus: string;
    telemetryOnline: boolean;
    stockLevel: number | null;
  };
  cashStatus?: {
    totalCash: number;
    lowCoinTubes: number; // Number of tubes with <5 coins
    hasHighCash: boolean; // >250 EUR
  };
}

// API-Funktionen
async function getMachineStatusData(): Promise<MachineStatusData[]> {
  const response = await fetch('/api/location-status', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch machine status data');
  }
  return response.json();
}

export default function StandortStatus() {
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const { data: machineStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: getMachineStatusData,
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - keep data in cache for 10 minutes
    refetchOnMount: false, // Don't automatically refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchInterval: autoRefresh ? 2 * 60 * 1000 : false, // Only refetch every 2 minutes if auto-refresh enabled
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
  });

  // Gefilterte Maschinen basierend auf Suchbegriff
  const filteredMachines = useMemo(() => {
    if (!machineStatus) return [];
    
    return machineStatus.filter(machine => 
      machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (machine.location && machine.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [machineStatus, searchTerm]);



  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Standort-Status</h1>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Fehler beim Laden der Daten</h2>
          <p className="text-muted-foreground mb-4">
            Die Standort-Status-Daten konnten nicht geladen werden.
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Standort-Status</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto-Aktualisierung
            </Label>
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            {autoRefresh ? (
              <Play className="h-4 w-4 text-green-500" />
            ) : (
              <Pause className="h-4 w-4 text-gray-400" />
            )}
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>



      {/* Suche */}
      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Automat oder Standort suchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Automaten-Kacheln */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredMachines?.map((machine) => (
          <MachineStatusCard key={machine.id} machine={machine} />
        ))}
      </div>
    </div>
  );
}

function MachineStatusCard({ machine }: { machine: MachineStatusData }) {
  const [, setLocation] = useLocation();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock3 className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDaysAgo = (daysAgo: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (daysAgo === 0) return "Heute";
    if (daysAgo === 1) return "Gestern";
    return `vor ${daysAgo} Tagen`;
  };

  const handleCardClick = () => {
    // Navigate to the machine detail page using the real machine ID
    if (machine.realMachineId) {
      console.log(`[StandortStatus] Navigating to machine with realMachineId: ${machine.realMachineId}`);
      setLocation(`/automaten/${machine.realMachineId}`);
    } else if (machine.locationId) {
      // Try using locationId if available
      console.log(`[StandortStatus] Using locationId for navigation: ${machine.locationId}`);
      setLocation(`/automaten/${machine.locationId}`);
    } else {
      // Complete vendon_id mapping for all machines
      const vendonIdMap: Record<string, string> = {
        // Exact matches
        'Rathen': '325762',
        'Schöna': '348079', 
        'Bad Schandau, Nationalparkbahnhof': '323959',
        'Bad Schandau, Elbkai': '391262',
        'Hohnstein': '363236',
        'Ostrau': '347989',
        'Schmilka': '391263',
        'Papstdorf, Feuerwehrmuseum': '380593',
        'Gohrisch': '340303',
        'Burg Stolpen': '362117',
        'Schloss Pilnitz,in der Orangerie': '395727',
        'Leupoldishain': '334642',
        'Bad Gottleuba-Berggishübel': '380053',
        'Berggishübel': '380053',
        'COMÖDIE Dresden, Schloß Übigau': '504610',
        'Pfaffendorf': '323780',
        'Pirna, Hotel zur Post': '380592',
        'Pötzscha': '384501',
        'Struppen, Landschlachthof': '378540',
        // Location-based fallbacks (when API returns location-grouped names)
        'Bad Schandau': '391262', // Default to Elbkai location
        'Schloss Pilnitz': '395727',
        'Papstdorf': '380593',
        'Struppen': '378540',
        'Bad Gottleuba': '380053',
        'Pirna': '380592',
        'COMÖDIE Dresden': '504610'
      };
      
      const vendonId = vendonIdMap[machine.machineName];
      if (vendonId) {
        console.log(`[StandortStatus] Using mapped vendon_id for ${machine.machineName}: ${vendonId}`);
        setLocation(`/automaten/${vendonId}`);
      } else {
        // Fallback: try location status ID
        console.warn(`No mapping found for machine: ${machine.machineName}, using fallback ID: ${machine.id}`);
        setLocation(`/automaten/${machine.id}`);
      }
    }
  };

  return (
    <Card 
      className={`border-l-4 cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-card hover:bg-accent/50 ${
        machine.status === 'ok' ? 'border-l-green-500' :
        machine.status === 'warning' ? 'border-l-yellow-500' :
        'border-l-red-500'
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold truncate">
            {machine.machineName}
          </CardTitle>
          {getStatusIcon(machine.status)}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {machine.location || 'Kein Standort'}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* MHD Status - Prominent display at top */}
        {machine.mhdStatus && (machine.mhdStatus.expiredCount > 0 || machine.mhdStatus.warningCount > 0) && (
          <div className={`flex items-center space-x-2 text-sm p-2 rounded-md border ${
            machine.mhdStatus.expiredCount > 0 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}>
            <PackageX className={`h-4 w-4 ${
              machine.mhdStatus.expiredCount > 0 ? 'text-red-600' : 'text-yellow-600'
            }`} />
            <div className="flex-1">
              <p className="font-medium">
                {machine.mhdStatus.expiredCount > 0 ? 'Abgelaufene Produkte!' : 'MHD-Warnung'}
              </p>
              <p className="text-xs">
                {machine.mhdStatus.expiredCount > 0 && `${machine.mhdStatus.expiredCount} abgelaufen`}
                {machine.mhdStatus.expiredCount > 0 && machine.mhdStatus.warningCount > 0 && ', '}
                {machine.mhdStatus.warningCount > 0 && `${machine.mhdStatus.warningCount} laufen bald ab`}
              </p>
            </div>
            <Badge variant={machine.mhdStatus.expiredCount > 0 ? "destructive" : "secondary"}>
              {machine.mhdStatus.expiredCount > 0 ? "KRITISCH" : "WARNUNG"}
            </Badge>
          </div>
        )}

        {/* System Status */}
        {machine.systemStatus && (
          <div className="flex items-center space-x-2 text-sm">
            <div className="flex-1 space-y-1">
              {(!machine.systemStatus.power || machine.systemStatus.powerStatus === 'OFF') && (
                <div className="flex items-center space-x-2">
                  <Power className="h-4 w-4 text-red-500" />
                  <Badge variant="destructive" className="text-xs">
                    Power: {machine.systemStatus.powerStatus}
                  </Badge>
                </div>
              )}
              {!machine.systemStatus.telemetryOnline && (
                <div className="flex items-center space-x-2">
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <Badge variant="destructive" className="text-xs">
                    Telemetrie offline
                  </Badge>
                </div>
              )}
              {machine.systemStatus.stockLevel !== null && (
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">
                    Warenbestand: {machine.systemStatus.stockLevel}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cash Status */}
        {machine.cashStatus && (
          <div className="flex items-center space-x-2 text-sm">
            <div className="flex-1 space-y-1">
              {machine.cashStatus.hasHighCash && (
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <Badge variant="secondary" className="text-xs">
                    Hoher Bargeldbestand: {machine.cashStatus.totalCash.toFixed(2)}€
                  </Badge>
                </div>
              )}
              {machine.cashStatus.lowCoinTubes > 0 && (
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <Badge variant="secondary" className="text-xs">
                    {machine.cashStatus.lowCoinTubes} Münzröhre(n) fast leer
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Letzte Entleerung */}
        {machine.lastCashCollection && (
          <div className="flex items-center space-x-2 text-sm">
            <Trash2 className={`h-4 w-4 ${machine.lastCashCollection.daysAgo > 14 ? 'text-red-500' : 'text-gray-500'}`} />
            <div className="flex-1">
              <p className="font-medium">Letzte Entleerung</p>
              <p className={`text-muted-foreground ${machine.lastCashCollection.daysAgo > 14 ? 'text-red-600 font-medium' : ''}`}>
                {formatDaysAgo(machine.lastCashCollection.daysAgo)}
                {machine.lastCashCollection.daysAgo > 14 && (
                  <span className="ml-1">⚠️</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(machine.lastCashCollection.datetime).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        )}

        {/* Letzte Füllung */}
        <div className="flex items-center space-x-2 text-sm">
          <Clock className="h-4 w-4 text-blue-500" />
          <div className="flex-1">
            <p className="font-medium">Letzte Füllung</p>
            {machine.lastRefill ? (
              <div>
                <p className="text-muted-foreground">
                  {formatDaysAgo(machine.lastRefill.daysAgo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(machine.lastRefill.datetime).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  von {machine.lastRefill.operator}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Daten</p>
            )}
          </div>
        </div>


        {/* Letzter Alkoholverkauf */}
        <div className="flex items-center space-x-2 text-sm">
          <Wine className="h-4 w-4 text-purple-500" />
          <div className="flex-1">
            <p className="font-medium">Letzter Alkoholverkauf</p>
            {machine.lastAlcoholSale ? (
              <div>
                <p className="text-muted-foreground">
                  {formatDaysAgo(machine.lastAlcoholSale.daysAgo)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {machine.lastAlcoholSale.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(machine.lastAlcoholSale.datetime).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Alkoholverkäufe</p>
            )}
          </div>
        </div>

        {/* Heutiger Umsatz */}
        <div className="flex items-center space-x-2 text-sm">
          <Euro className="h-4 w-4 text-green-500" />
          <div className="flex-1">
            <p className="font-medium">Heutiger Umsatz</p>
            <p className="text-lg font-bold text-green-600">
              {machine.todayRevenue.toFixed(2)} €
            </p>
          </div>
        </div>

        {/* Letzte Transaktionen */}
        <div className="flex items-center space-x-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-indigo-500" />
          <div className="flex-1">
            <p className="font-medium">Letzte Verkäufe</p>
            <div className="space-y-1 mt-1 max-h-20 overflow-y-auto">
              {machine.recentTransactions.slice(0, 3).map((transaction, index) => (
                <div key={index} className="text-xs border-b pb-1 last:border-b-0">
                  <div className="flex justify-between items-start">
                    <span className="truncate flex-1 mr-2 font-medium">
                      {transaction.productName}
                    </span>
                    <span className="font-bold text-green-600">
                      {(transaction.amount || 0).toFixed(2)} €
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {new Date(transaction.datetime).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })} - {new Date(transaction.datetime).toLocaleTimeString('de-DE', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              ))}
              {machine.recentTransactions.length === 0 && (
                <p className="text-muted-foreground text-xs">Keine aktuellen Verkäufe</p>
              )}
            </div>
          </div>
        </div>


        {/* Bargeldloser Verkauf */}
        <div className="flex items-center space-x-2 text-sm">
          <CreditCard className="h-4 w-4 text-purple-500" />
          <div className="flex-1">
            <p className="font-medium">Letzter bargeldloser Verkauf</p>
            {machine.lastCashlessSale ? (
              <div>
                <p className="text-muted-foreground">
                  {formatDaysAgo(machine.lastCashlessSale.daysAgo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(machine.lastCashlessSale.datetime).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {machine.lastCashlessSale.paymentMethod}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Daten</p>
            )}
          </div>
        </div>



        {/* Nächstes MHD */}
        {machine.mhdStatus?.earliestExpiry && (
          <div className="flex items-center space-x-2 text-sm">
            <Calendar className="h-4 w-4 text-yellow-500" />
            <div className="flex-1">
              <p className="font-medium">Nächstes MHD</p>
              <p className="text-muted-foreground">
                {new Date(machine.mhdStatus.earliestExpiry).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
        )}

        {/* Status Indicators und Warnungen */}
        <div className="mt-4 space-y-2">
          {/* Power & System Status */}
          {machine.systemStatus && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Power className={`h-4 w-4 ${machine.systemStatus.power ? 'text-green-500' : 'text-red-500'}`} />
                <span className="text-sm">System</span>
              </div>
              <Badge variant={machine.systemStatus.power ? "default" : "destructive"}>
                {machine.systemStatus.power ? 'EIN' : 'AUS'}
              </Badge>
            </div>
          )}

          {/* Telemetry Status */}
          {machine.systemStatus && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {machine.systemStatus.telemetryOnline ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">Telemetrie</span>
              </div>
              <Badge variant={machine.systemStatus.telemetryOnline ? "default" : "destructive"}>
                {machine.systemStatus.telemetryOnline ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </div>
          )}

          {/* Cash Status Warnings */}
          {machine.cashStatus && (
            <>
              {machine.cashStatus.hasHighCash && (
                <div className="flex items-center space-x-2 text-sm bg-yellow-50 p-2 rounded">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-800">
                    Hoher Bargeldbestand: {(machine.cashStatus.totalCash || 0).toFixed(2)}€
                  </span>
                </div>
              )}
              {(machine.cashStatus.lowCoinTubes || 0) > 0 && (
                <div className="flex items-center space-x-2 text-sm bg-orange-50 p-2 rounded">
                  <PackageX className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-800">
                    {machine.cashStatus.lowCoinTubes} Münzröhre(n) mit &lt;5 Münzen
                  </span>
                </div>
              )}
            </>
          )}

          {/* Collection Warning */}
          {machine.lastCashCollection && machine.lastCashCollection.daysAgo > 14 && (
            <div className="flex items-center space-x-2 text-sm bg-red-50 p-2 rounded">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-800">
                Letzte Entleerung vor {machine.lastCashCollection.daysAgo} Tagen
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
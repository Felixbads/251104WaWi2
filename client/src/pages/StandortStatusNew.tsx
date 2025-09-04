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
  systemStatus?: {
    power: boolean;
    powerStatus: string;
    telemetryOnline: boolean;
    stockLevel: number | null;
  };
  cashStatus?: {
    totalCash: number;
    lowCoinTubes: number;
    hasHighCash: boolean;
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

// Mobile-First Kompakte Kachel-Komponente
function MachineCard({ machine, onViewDetails }: { 
  machine: MachineStatusData; 
  onViewDetails: (machine: MachineStatusData) => void; 
}) {
  const formatDaysAgo = (days: number) => {
    if (days === 0) return "heute"; 
    if (days === 1) return "gestern";
    return `vor ${days} Tagen`;
  };

  // Sammle kritische Warnungen
  const criticalAlerts = [];
  if (machine.systemStatus && !machine.systemStatus.power) {
    criticalAlerts.push({ type: 'error', message: 'System ausgeschaltet', icon: Power });
  }
  if (machine.systemStatus && !machine.systemStatus.telemetryOnline) {
    criticalAlerts.push({ type: 'error', message: 'Telemetrie offline', icon: WifiOff });
  }
  if (machine.cashStatus && machine.cashStatus.hasHighCash) {
    criticalAlerts.push({ type: 'warning', message: `Bargeld: ${(machine.cashStatus.totalCash || 0).toFixed(0)}€`, icon: AlertTriangle });
  }
  if (machine.cashStatus && (machine.cashStatus.lowCoinTubes || 0) > 0) {
    criticalAlerts.push({ type: 'warning', message: `${machine.cashStatus.lowCoinTubes} Röhren leer`, icon: PackageX });
  }
  if (machine.lastCashCollection && machine.lastCashCollection.daysAgo > 14) {
    criticalAlerts.push({ type: 'warning', message: `Entleerung: ${machine.lastCashCollection.daysAgo}d`, icon: Trash2 });
  }

  return (
    <Card 
      key={machine.id} 
      className="relative w-full cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onViewDetails(machine)}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Kritische Warnungen ganz oben - MOBILE FIRST */}
        {criticalAlerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-1">
                <AlertCircle className="h-3 w-3 text-red-600" />
                <span className="text-xs font-medium text-red-800">Kritisch</span>
              </div>
              <Badge variant="destructive" className="text-xs px-1 py-0">
                {criticalAlerts.length}
              </Badge>
            </div>
            <div className="space-y-1">
              {criticalAlerts.slice(0, 2).map((alert, index) => {
                const IconComponent = alert.icon;
                return (
                  <div key={index} className="flex items-center space-x-1 text-xs">
                    <IconComponent className="h-3 w-3 text-red-600 flex-shrink-0" />
                    <span className="text-red-800 truncate">{alert.message}</span>
                  </div>
                );
              })}
              {criticalAlerts.length > 2 && (
                <p className="text-xs text-red-600">+{criticalAlerts.length - 2} weitere</p>
              )}
            </div>
          </div>
        )}

        {/* Kompakter Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate">{machine.machineName}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {machine.location || 'Kein Standort'}
            </p>
          </div>
          <div className="flex-shrink-0 ml-2">
            <Badge 
              variant={criticalAlerts.length > 0 ? 'destructive' : 'default'}
              className="text-xs px-2 py-0.5"
            >
              {criticalAlerts.length > 0 ? 'FEHLER' : 'OK'}
            </Badge>
          </div>
        </div>

        {/* Kompakte System-Infos - Nur das Wichtigste */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Umsatz heute */}
          <div className="flex items-center space-x-1">
            <Euro className="h-3 w-3 text-green-600" />
            <span className="font-medium">{machine.todayRevenue.toFixed(0)}€</span>
          </div>

          {/* Letzter Verkauf */}
          {machine.lastSale && (
            <div className="flex items-center space-x-1">
              <ShoppingCart className="h-3 w-3 text-blue-600" />
              <span className="truncate">
                {machine.lastSale.daysAgo === 0 ? 'heute' : `${machine.lastSale.daysAgo}d`}
              </span>
            </div>
          )}

          {/* Stock Level */}
          {machine.systemStatus?.stockLevel && (
            <div className="flex items-center space-x-1">
              <Package className="h-3 w-3 text-purple-600" />
              <span>{machine.systemStatus.stockLevel}%</span>
            </div>
          )}

          {/* Nächstes MHD */}
          {machine.mhdStatus?.earliestExpiry && (
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3 text-yellow-600" />
              <span className="truncate">
                {new Date(machine.mhdStatus.earliestExpiry).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit'
                })}
              </span>
            </div>
          )}
        </div>

        {/* Schnelle Aktions-Buttons (nur bei kritischen Problemen) */}
        {criticalAlerts.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="flex space-x-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="text-xs h-6 px-2 flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(machine);
                }}
              >
                Details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StandortStatus() {
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const { data: machineStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: getMachineStatusData,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const filteredMachines = useMemo(() => {
    if (!machineStatus) return [];
    if (!searchTerm) return machineStatus;
    
    return machineStatus.filter(machine => 
      machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (machine.location && machine.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [machineStatus, searchTerm]);

  const handleViewDetails = (machine: MachineStatusData) => {
    console.log(`[StandortStatus] Using mapped vendon_id for ${machine.machineName}: ${machine.id}`);
    window.location.href = `/automaten/${machine.id}`;
  };

  // Sortiere Maschinen: Kritische zuerst
  const sortedMachines = useMemo(() => {
    return filteredMachines.sort((a, b) => {
      const aHasErrors = !a.systemStatus?.power || !a.systemStatus?.telemetryOnline || 
                        (a.cashStatus?.hasHighCash) || (a.cashStatus?.lowCoinTubes || 0) > 0 ||
                        (a.lastCashCollection?.daysAgo || 0) > 14;
      const bHasErrors = !b.systemStatus?.power || !b.systemStatus?.telemetryOnline || 
                        (b.cashStatus?.hasHighCash) || (b.cashStatus?.lowCoinTubes || 0) > 0 ||
                        (b.lastCashCollection?.daysAgo || 0) > 14;
      
      if (aHasErrors && !bHasErrors) return -1;
      if (!aHasErrors && bHasErrors) return 1;
      return a.machineName.localeCompare(b.machineName);
    });
  }, [filteredMachines]);

  return (
    <div className="space-y-4 p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Mobile-First Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Standort Status</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Echtzeit-Übersicht aller Standorte
          </p>
        </div>
        
        {/* Kompakte Controls */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Standort suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 h-9 text-sm"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                className="h-4 w-7"
              />
              <Label htmlFor="auto-refresh" className="text-xs sm:text-sm">
                Auto-Refresh
              </Label>
            </div>
            
            <Button onClick={() => refetch()} variant="outline" size="sm" className="h-8">
              <RefreshCw className="h-3 w-3 mr-1" />
              <span className="text-xs">Update</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Critical Alerts Summary */}
      {machineStatus && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-800">Kritische Standorte</span>
            </div>
            <Badge variant="destructive" className="text-xs">
              {sortedMachines.filter(m => 
                !m.systemStatus?.power || !m.systemStatus?.telemetryOnline || 
                (m.cashStatus?.hasHighCash) || (m.cashStatus?.lowCoinTubes || 0) > 0 ||
                (m.lastCashCollection?.daysAgo || 0) > 14
              ).length}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="text-center">
              <div className="font-medium text-red-700">
                {sortedMachines.filter(m => !m.systemStatus?.power).length}
              </div>
              <div className="text-red-600">Offline</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-orange-700">
                {sortedMachines.filter(m => m.cashStatus?.hasHighCash).length}
              </div>
              <div className="text-orange-600">Hoher Bargeld</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-yellow-700">
                {sortedMachines.filter(m => (m.cashStatus?.lowCoinTubes || 0) > 0).length}
              </div>
              <div className="text-yellow-600">Münzen leer</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-purple-700">
                {sortedMachines.filter(m => (m.lastCashCollection?.daysAgo || 0) > 14).length}
              </div>
              <div className="text-purple-600">Entleerung</div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="w-full">
              <CardContent className="p-3">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-3" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-600" />
            <p className="text-sm text-red-800">Fehler beim Laden der Daten</p>
          </CardContent>
        </Card>
      )}

      {/* Mobile-First Grid - Viel dichter für mobile Geräte */}
      {machineStatus && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {sortedMachines.map((machine) => (
            <MachineCard 
              key={machine.id}
              machine={machine} 
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      )}
      
      {/* No Results */}
      {machineStatus && sortedMachines.length === 0 && (
        <Card className="mx-auto max-w-md">
          <CardContent className="p-6 text-center">
            <Search className="h-8 w-8 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 text-sm">Keine Automaten gefunden</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
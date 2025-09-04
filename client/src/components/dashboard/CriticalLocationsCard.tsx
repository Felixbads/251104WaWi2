import React from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Power, 
  WifiOff, 
  PackageX, 
  Trash2,
  Euro,
  ChevronRight,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface MachineStatusData {
  id: number;
  machineName: string;
  location: string | null;
  systemStatus?: {
    power: boolean;
    telemetryOnline: boolean;
    stockLevel: number | null;
  };
  cashStatus?: {
    totalCash: number;
    lowCoinTubes: number;
    hasHighCash: boolean;
  };
  lastCashCollection?: {
    daysAgo: number;
  };
}

async function getCriticalMachineStatus(): Promise<MachineStatusData[]> {
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

export function CriticalLocationsCard() {
  const [, setLocation] = useLocation();
  
  const { data: machines, isLoading, error } = useQuery({
    queryKey: ['/api/location-status-critical'],
    queryFn: getCriticalMachineStatus,
    refetchInterval: 5 * 60 * 1000, // 5 Minuten
    staleTime: 2 * 60 * 1000, // 2 Minuten
  });

  // Filter kritische Maschinen
  const criticalMachines = React.useMemo(() => {
    if (!machines) return [];
    return machines.filter(machine => {
      const hasSystemIssues = !machine.systemStatus?.power || !machine.systemStatus?.telemetryOnline;
      const hasCashIssues = machine.cashStatus?.hasHighCash || (machine.cashStatus?.lowCoinTubes || 0) > 0;
      const hasCollectionIssues = (machine.lastCashCollection?.daysAgo || 0) > 14;
      
      return hasSystemIssues || hasCashIssues || hasCollectionIssues;
    });
  }, [machines]);

  const getCriticalIssueCount = (machine: MachineStatusData) => {
    let count = 0;
    if (!machine.systemStatus?.power) count++;
    if (!machine.systemStatus?.telemetryOnline) count++;
    if (machine.cashStatus?.hasHighCash) count++;
    if ((machine.cashStatus?.lowCoinTubes || 0) > 0) count++;
    if ((machine.lastCashCollection?.daysAgo || 0) > 14) count++;
    return count;
  };

  const getWorstIssueIcon = (machine: MachineStatusData) => {
    if (!machine.systemStatus?.power) return <Power className="h-3 w-3 text-red-600" />;
    if (!machine.systemStatus?.telemetryOnline) return <WifiOff className="h-3 w-3 text-red-600" />;
    if (machine.cashStatus?.hasHighCash) return <Euro className="h-3 w-3 text-yellow-600" />;
    if ((machine.cashStatus?.lowCoinTubes || 0) > 0) return <PackageX className="h-3 w-3 text-orange-600" />;
    if ((machine.lastCashCollection?.daysAgo || 0) > 14) return <Trash2 className="h-3 w-3 text-purple-600" />;
    return <AlertTriangle className="h-3 w-3 text-gray-600" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span>Kritische Standorte</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-4 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-700">Fehler beim Laden der Standort-Daten</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={criticalMachines.length > 0 ? "border-red-200 bg-red-50/30" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className={`h-4 w-4 ${criticalMachines.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            <span>Kritische Standorte</span>
          </div>
          {criticalMachines.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {criticalMachines.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          {criticalMachines.length === 0 
            ? "Alle Standorte funktionieren ordnungsgemäß" 
            : `${criticalMachines.length} Standorte benötigen Aufmerksamkeit`}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0">
        {criticalMachines.length === 0 ? (
          <div className="text-center py-4">
            <div className="text-green-600 mb-2">✓</div>
            <p className="text-sm text-green-700">Keine kritischen Probleme</p>
          </div>
        ) : (
          <div className="space-y-2">
            {criticalMachines.slice(0, 4).map((machine) => (
              <div 
                key={machine.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                onClick={() => setLocation(`/automaten/${machine.id}`)}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  {getWorstIssueIcon(machine)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{machine.machineName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {machine.location || 'Kein Standort'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge 
                    variant="destructive" 
                    className="text-xs px-1.5 py-0.5"
                  >
                    {getCriticalIssueCount(machine)}
                  </Badge>
                  <ChevronRight className="h-3 w-3 text-gray-400" />
                </div>
              </div>
            ))}
            
            {criticalMachines.length > 4 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-3 h-8 text-xs"
                onClick={() => setLocation('/standort-status')}
              >
                Alle {criticalMachines.length} kritischen Standorte anzeigen
              </Button>
            )}
            
            {criticalMachines.length <= 4 && criticalMachines.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-3 h-8 text-xs"
                onClick={() => setLocation('/standort-status')}
              >
                <MapPin className="h-3 w-3 mr-1" />
                Zur Standort-Übersicht
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
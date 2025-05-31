import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Clock, 
  DoorOpen, 
  ShoppingCart, 
  Wine, 
  CreditCard, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock3,
  Search,
  RefreshCw,
  Euro
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MachineStatusData {
  id: number;
  machineName: string;
  location: string | null;
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
  lastDoorOpen?: {
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
}

// API-Funktionen
async function getMachineStatusData(): Promise<MachineStatusData[]> {
  const response = await fetch('/api/location-status');
  if (!response.ok) {
    throw new Error('Failed to fetch machine status data');
  }
  return response.json();
}

export default function StandortStatus() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: machineStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: getMachineStatusData,
    refetchInterval: 5 * 60 * 1000, // Alle 5 Minuten aktualisieren
  });

  // Gefilterte Maschinen basierend auf Suchbegriff
  const filteredMachines = useMemo(() => {
    if (!machineStatus) return [];
    
    return machineStatus.filter(machine => 
      machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (machine.location && machine.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [machineStatus, searchTerm]);

  // Status-Verteilung für Übersicht
  const statusCounts = useMemo(() => {
    if (!machineStatus) return { ok: 0, warning: 0, error: 0 };
    
    return machineStatus.reduce((acc, machine) => {
      acc[machine.status]++;
      return acc;
    }, { ok: 0, warning: 0, error: 0 });
  }, [machineStatus]);

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
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Status-Übersicht */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{statusCounts.ok}</p>
                <p className="text-sm text-muted-foreground">OK</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{statusCounts.warning}</p>
                <p className="text-sm text-muted-foreground">Warnung</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{statusCounts.error}</p>
                <p className="text-sm text-muted-foreground">Fehler</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
    if (daysAgo === 0) return "Heute";
    if (daysAgo === 1) return "Gestern";
    return `vor ${daysAgo} Tagen`;
  };

  return (
    <Card className={`border-l-4 ${
      machine.status === 'ok' ? 'border-l-green-500' :
      machine.status === 'warning' ? 'border-l-yellow-500' :
      'border-l-red-500'
    }`}>
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

        {/* Letzte Türöffnung */}
        <div className="flex items-center space-x-2 text-sm">
          <DoorOpen className="h-4 w-4 text-orange-500" />
          <div className="flex-1">
            <p className="font-medium">Letzte Türöffnung</p>
            {machine.lastDoorOpen ? (
              <div>
                <p className="text-muted-foreground">
                  {formatDaysAgo(machine.lastDoorOpen.daysAgo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(machine.lastDoorOpen.datetime).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Daten</p>
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
                      {transaction.amount.toFixed(2)} €
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
                  {machine.lastCashlessSale.paymentMethod}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Daten</p>
            )}
          </div>
        </div>

        {/* Letzter Verkauf */}
        <div className="flex items-center space-x-2 text-sm">
          <Calendar className="h-4 w-4 text-slate-500" />
          <div className="flex-1">
            <p className="font-medium">Letzter Verkauf</p>
            {machine.lastSale ? (
              <div>
                <p className="text-muted-foreground">
                  {formatDaysAgo(machine.lastSale.daysAgo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(machine.lastSale.datetime).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Daten</p>
            )}
          </div>
        </div>

        {/* Warnungen */}
        {machine.warnings.length > 0 && (
          <div className="space-y-1">
            {machine.warnings.map((warning, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {warning}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Search, AlertTriangle, Clock, Euro, ShoppingCart, CreditCard, Wine, DoorOpen } from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface MachineData {
  machineId: number;
  machineName: string;
  location: string;
  vendonId: string;
  status: 'ok' | 'warning' | 'error';
  warnings: string[];
  mhdStatus: {
    expiredCount: number;
    warningCount: number;
    earliestExpiry?: string;
  };
  lastFilling: {
    datetime?: string;
    operator?: string;
  };
  lastDoorOpen?: string;
  lastAlcoholSale: {
    datetime?: string;
    productName?: string;
  };
  todayRevenue: number;
  todayTransactions: number;
  recentSales: Array<{
    product_name: string;
    amount: number;
    datetime: string;
  }>;
  lastCashlessSale: {
    datetime?: string;
    productName?: string;
    amount?: number;
    paymentMethod?: string;
  };
  totalStock: number;
  lastSale: {
    datetime?: string;
    productName?: string;
    amount?: number;
  };
}

interface LocationStatusResponse {
  machines: MachineData[];
  summary: {
    totalMachines: number;
    okMachines: number;
    warningMachines: number;
    errorMachines: number;
    totalTodayRevenue: number;
    lastUpdated: string;
  };
}

function StatusBadge({ status, warnings }: { status: 'ok' | 'warning' | 'error'; warnings: string[] }) {
  const statusConfig = {
    ok: { color: 'bg-green-500', text: 'OK', icon: null },
    warning: { color: 'bg-yellow-500', text: 'WARNUNG', icon: <AlertTriangle className="w-3 h-3" /> },
    error: { color: 'bg-red-500', text: 'FEHLER', icon: <AlertTriangle className="w-3 h-3" /> }
  };

  const config = statusConfig[status];

  return (
    <div className="space-y-1">
      <Badge variant="secondary" className={`${config.color} text-white`}>
        {config.icon && <span className="mr-1">{config.icon}</span>}
        {config.text}
      </Badge>
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warning, idx) => (
            <div key={idx} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MHDStatusBadge({ mhdStatus }: { mhdStatus: MachineData['mhdStatus'] }) {
  if (mhdStatus.expiredCount > 0) {
    return (
      <Badge variant="destructive" className="text-xs">
        KRITISCH: {mhdStatus.expiredCount} abgelaufen
      </Badge>
    );
  }
  if (mhdStatus.warningCount > 0) {
    return (
      <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">
        WARNUNG: {mhdStatus.warningCount} laufen bald ab
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-green-500 text-green-700">
      MHD OK
    </Badge>
  );
}

function formatDateTime(dateString?: string) {
  if (!dateString) return 'Nie';
  try {
    return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
  } catch {
    return 'Ungültig';
  }
}

function formatTimeAgo(dateString?: string) {
  if (!dateString) return 'Nie';
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true, locale: de });
  } catch {
    return 'Ungültig';
  }
}

function MachineCard({ machine }: { machine: MachineData }) {
  const borderColor = {
    ok: 'border-l-green-500',
    warning: 'border-l-yellow-500',
    error: 'border-l-red-500'
  }[machine.status];

  return (
    <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-l-4 ${borderColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{machine.machineName}</CardTitle>
            <p className="text-sm text-muted-foreground">{machine.location}</p>
          </div>
          <StatusBadge status={machine.status} warnings={machine.warnings} />
        </div>
        <MHDStatusBadge mhdStatus={machine.mhdStatus} />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Letzte Füllung */}
        <div className="flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-sm font-medium">Letzte Füllung</p>
            <p className="text-xs text-muted-foreground">
              {machine.lastFilling.datetime ? formatDateTime(machine.lastFilling.datetime) : 'Nie'}
              {machine.lastFilling.operator && (
                <span className="ml-2">von {machine.lastFilling.operator}</span>
              )}
            </p>
          </div>
        </div>

        {/* Letzte Türöffnung */}
        <div className="flex items-center space-x-2">
          <DoorOpen className="w-4 h-4 text-purple-500" />
          <div>
            <p className="text-sm font-medium">Letzte Türöffnung</p>
            <p className="text-xs text-muted-foreground">
              {machine.lastDoorOpen ? formatTimeAgo(machine.lastDoorOpen) : 'Keine in 7 Tagen'}
            </p>
          </div>
        </div>

        {/* Letzter Alkoholverkauf */}
        {machine.lastAlcoholSale.datetime && (
          <div className="flex items-center space-x-2">
            <Wine className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-sm font-medium">Letzter Alkoholverkauf</p>
              <p className="text-xs text-muted-foreground">
                {machine.lastAlcoholSale.productName} - {formatTimeAgo(machine.lastAlcoholSale.datetime)}
              </p>
            </div>
          </div>
        )}

        {/* Heutiger Umsatz */}
        <div className="flex items-center space-x-2">
          <Euro className="w-4 h-4 text-green-500" />
          <div>
            <p className="text-sm font-medium">Heutiger Umsatz</p>
            <p className="text-xs text-muted-foreground">
              {machine.todayRevenue.toFixed(2)} EUR ({machine.todayTransactions} Verkäufe)
            </p>
          </div>
        </div>

        <Separator />

        {/* Letzte Verkäufe */}
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <p className="text-sm font-medium">Letzte Verkäufe</p>
          </div>
          {machine.recentSales && machine.recentSales.length > 0 ? (
            <div className="space-y-1">
              {machine.recentSales.slice(0, 3).map((sale, idx) => (
                <div key={idx} className="text-xs text-muted-foreground flex justify-between">
                  <span>{sale.product_name}</span>
                  <span>{sale.amount?.toFixed(2)} EUR - {formatTimeAgo(sale.datetime)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Keine aktuellen Verkäufe</p>
          )}
        </div>

        {/* Letzter bargeldloser Verkauf */}
        {machine.lastCashlessSale.datetime && (
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="text-sm font-medium">Letzter bargeldloser Verkauf</p>
              <p className="text-xs text-muted-foreground">
                {machine.lastCashlessSale.productName} - {machine.lastCashlessSale.amount?.toFixed(2)} EUR
                <br />
                {formatTimeAgo(machine.lastCashlessSale.datetime)} ({machine.lastCashlessSale.paymentMethod})
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AutomatenNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [lastManualRefresh, setLastManualRefresh] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      setLastManualRefresh(Date.now());
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const {
    data: locationData,
    isLoading,
    error,
    refetch
  } = useQuery<LocationStatusResponse>({
    queryKey: ['/api/location-status', lastManualRefresh],
    staleTime: 30000, // 30 seconds
    refetchInterval: autoRefresh ? 30000 : undefined,
  });

  const handleManualRefresh = () => {
    setLastManualRefresh(Date.now());
    refetch();
  };

  const filteredMachines = locationData?.machines?.filter(machine =>
    machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    machine.location.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Lade Automaten-Daten...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-red-600">Fehler beim Laden der Daten</p>
          <Button onClick={handleManualRefresh} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Automaten-Übersicht</h1>
          <p className="text-muted-foreground">
            Echtzeitstatus aller Automaten mit MHD, Umsatz und Wartungshinweisen
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="autoRefresh" className="text-sm">
              Auto-Refresh (30s)
            </label>
          </div>

          <Button onClick={handleManualRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {locationData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{locationData.summary.totalMachines}</div>
              <p className="text-xs text-muted-foreground">Gesamt Automaten</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{locationData.summary.okMachines}</div>
              <p className="text-xs text-muted-foreground">OK</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">{locationData.summary.warningMachines}</div>
              <p className="text-xs text-muted-foreground">Warnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{locationData.summary.errorMachines}</div>
              <p className="text-xs text-muted-foreground">Fehler</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {locationData.summary.totalTodayRevenue.toFixed(0)} EUR
              </div>
              <p className="text-xs text-muted-foreground">Heute Umsatz</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suche nach Automat oder Standort..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Last Updated */}
      {locationData?.summary.lastUpdated && (
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>
            Zuletzt aktualisiert: {formatDateTime(locationData.summary.lastUpdated)}
          </span>
        </div>
      )}

      {/* Machine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMachines.map((machine) => (
          <MachineCard key={machine.machineId} machine={machine} />
        ))}
      </div>

      {/* No Results */}
      {filteredMachines.length === 0 && searchTerm && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold">Keine Automaten gefunden</p>
          <p className="text-muted-foreground">
            Versuche einen anderen Suchbegriff
          </p>
        </div>
      )}
    </div>
  );
}
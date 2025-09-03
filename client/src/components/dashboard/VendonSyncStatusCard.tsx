import React from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  RefreshCw, 
  Database, 
  Activity, 
  Clock, 
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Cpu,
  BarChart3
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

interface VendonSyncStats {
  summary: {
    totalTransactions: number;
    activeMachines: number;
    machinesWithData: number;
    recentActivity: number;
    lastSyncTime: string | null;
    systemStatus: 'active' | 'idle';
  };
  machines: Array<{
    machineId: string;
    machineName: string;
    watermarkTime: string;
    lastSyncUpdate: string;
    transactionCount: number;
    dateRange: {
      earliest: string;
      latest: string;
      firstImport: string;
    } | null;
    isActive: boolean;
  }>;
  performance: {
    avgTransactionsPerMachine: number;
    dataAvailability: string;
    uptimeIndicator: number;
  };
}

export const VendonSyncStatusCard: React.FC = () => {
  const [, setLocation] = useLocation();

  const { data: syncStats, isLoading, error, refetch } = useQuery<{ success: boolean; data: VendonSyncStats }>({
    queryKey: ['/api/vendon/sync-stats'],
    refetchInterval: 60000, // Refresh alle Minute
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nie';
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'idle': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'idle': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default: return <Database className="h-5 w-5 text-gray-500" />;
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Database className="h-5 w-5 mr-2 text-red-500" />
            Vendon Historische Synchronisation
          </CardTitle>
          <CardDescription>Fehler beim Laden der Sync-Statistiken</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
            <p className="text-sm text-red-600">Daten konnten nicht geladen werden</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut laden
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all duration-200"
      onClick={() => setLocation('/admin/vendon-sync-dashboard')}
    >
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Database className="h-5 w-5 mr-2 text-blue-600" />
          Vendon Historische Synchronisation
          <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
        </CardTitle>
        <CardDescription>Status der automatischen Transaktions-Synchronisation</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : syncStats?.success && syncStats.data ? (
          <div className="space-y-4">
            {/* Status-Übersicht */}
            <div className="bg-blue-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  {getStatusIcon(syncStats.data.summary.systemStatus)}
                  <div className="ml-3">
                    <p className="font-medium text-lg">
                      {syncStats.data.summary.totalTransactions.toLocaleString('de-DE')} Transaktionen
                    </p>
                    <p className={`text-sm ${getStatusColor(syncStats.data.summary.systemStatus)}`}>
                      System {syncStats.data.summary.systemStatus === 'active' ? 'aktiv' : 'inaktiv'}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant={syncStats.data.summary.systemStatus === 'active' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {syncStats.data.summary.recentActivity} aktive
                </Badge>
              </div>
            </div>

            {/* Maschinen-Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center">
                  <Cpu className="h-4 w-4 mr-2 text-blue-500" />
                  <div>
                    <p className="text-lg font-bold">{syncStats.data.summary.activeMachines}</p>
                    <p className="text-xs text-gray-600">Maschinen konfiguriert</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center">
                  <BarChart3 className="h-4 w-4 mr-2 text-green-500" />
                  <div>
                    <p className="text-lg font-bold">{syncStats.data.summary.machinesWithData}</p>
                    <p className="text-xs text-gray-600">mit Daten</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance-Info */}
            <div className="bg-green-50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Letzte Synchronisation</p>
                  <p className="text-xs text-gray-600 flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDate(syncStats.data.summary.lastSyncTime)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">⌀ pro Maschine</p>
                  <p className="text-xs text-gray-600">
                    {syncStats.data.performance.avgTransactionsPerMachine} Transaktionen
                  </p>
                </div>
              </div>
            </div>

            {/* Top Maschinen Preview */}
            {syncStats.data.machines.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top Maschinen (Transaktionen):</p>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {syncStats.data.machines
                    .filter(m => m.transactionCount > 0)
                    .slice(0, 3)
                    .map((machine, index) => (
                    <div key={machine.machineId} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center">
                        <Activity className={`h-3 w-3 mr-1 ${machine.isActive ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className="truncate max-w-[120px]">{machine.machineName}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {machine.transactionCount.toLocaleString('de-DE')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              variant="outline" 
              className="w-full mt-3"
              onClick={() => setLocation('/admin/vendon-sync-dashboard')}
            >
              Details anzeigen
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Keine Sync-Daten verfügbar</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VendonSyncStatusCard;
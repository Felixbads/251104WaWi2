import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Settings, RefreshCw } from "lucide-react";
import { getSyncStatus, triggerSync, formatDateTime } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface SyncStatusCardProps {
  onSettingsClick?: () => void;
}

export default function SyncStatusCard({ onSettingsClick }: SyncStatusCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch sync status
  const { data: syncStatus, isLoading, error } = useQuery({
    queryKey: ['/api/sync/status'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => triggerSync('all'),
    onMutate: () => {
      setIsSyncing(true);
      toast({
        title: "Synchronisierung gestartet",
        description: "Die Daten werden im Hintergrund synchronisiert.",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      toast({
        title: "Synchronisierung abgeschlossen",
        description: "Alle Daten wurden erfolgreich synchronisiert.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Synchronisierungsfehler",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSyncing(false);
    },
  });

  // Handler for sync button
  const handleSyncClick = () => {
    syncMutation.mutate();
  };

  // Calculate progress percentages
  const getProgressPercentage = (found: number, total: number) => {
    if (total === 0) return 100;
    return Math.min(100, Math.round((found / total) * 100));
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl">Synchronisierungsstatus</CardTitle>
            <CardDescription className="mt-1">
              Letzte Synchronisierung:{' '}
              {isLoading ? (
                <span className="font-medium">Wird geladen...</span>
              ) : error ? (
                <span className="font-medium text-red-500">Fehler beim Laden</span>
              ) : (
                <span className="font-medium">
                  {syncStatus?.transactions?.lastSync
                    ? formatDateTime(syncStatus.transactions.lastSync)
                    : 'Noch keine Synchronisierung'}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={handleSyncClick} 
              disabled={isSyncing}
              className="flex items-center"
            >
              {isSyncing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-5 w-5" />
              )}
              Jetzt synchronisieren
            </Button>
            <Button 
              variant="outline" 
              onClick={onSettingsClick}
              className="flex items-center"
            >
              <Settings className="mr-2 h-5 w-5 text-gray-500" />
              Einstellungen
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bars */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Transactions Progress */}
          <div className="bg-gray-50 rounded-md p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Transaktionen</h3>
              <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                {isLoading ? (
                  "Laden..."
                ) : (
                  `${syncStatus?.transactions?.count || 0} / ${syncStatus?.transactions?.count || 0}`
                )}
              </span>
            </div>
            <Progress 
              value={isLoading ? 0 : 100} 
              className="h-2.5 bg-gray-200" 
            />
            <p className="mt-2 text-xs text-gray-500">
              {isLoading ? (
                "Wird geladen..."
              ) : syncStatus?.transactions?.latest ? (
                `Letzte Transaktion: ${formatDateTime(syncStatus.transactions.latest)}`
              ) : (
                "Keine Transaktionen vorhanden"
              )}
            </p>
          </div>
          
          {/* Machines Progress */}
          <div className="bg-gray-50 rounded-md p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Maschinen</h3>
              <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                {isLoading ? (
                  "Laden..."
                ) : (
                  `${syncStatus?.machines?.count || 0} / ${syncStatus?.machines?.count || 0}`
                )}
              </span>
            </div>
            <Progress 
              value={isLoading ? 0 : 100} 
              className="h-2.5 bg-gray-200" 
            />
            <p className="mt-2 text-xs text-gray-500">
              {isLoading ? (
                "Wird geladen..."
              ) : syncStatus?.machines?.count ? (
                "Alle Maschinen synchronisiert"
              ) : (
                "Keine Maschinen vorhanden"
              )}
            </p>
          </div>
          
          {/* Events Progress */}
          <div className="bg-gray-50 rounded-md p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Ereignisse</h3>
              <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                {isLoading ? (
                  "Laden..."
                ) : (
                  `${syncStatus?.events?.count || 0} / ${syncStatus?.events?.count || 0}`
                )}
              </span>
            </div>
            <Progress 
              value={isLoading ? 0 : getProgressPercentage(syncStatus?.events?.count || 0, syncStatus?.events?.count || 0)} 
              className="h-2.5 bg-gray-200" 
            />
            <p className="mt-2 text-xs text-gray-500">
              {isLoading ? (
                "Wird geladen..."
              ) : syncStatus?.events?.status === "completed" ? (
                "Alle Ereignisse synchronisiert"
              ) : syncStatus?.events?.status === "running" ? (
                `Synchronisierung läuft... (${getProgressPercentage(syncStatus?.events?.count || 0, syncStatus?.events?.count || 0)}%)`
              ) : (
                "Keine Synchronisierung durchgeführt"
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

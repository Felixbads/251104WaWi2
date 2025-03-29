import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSyncLogs, formatDateTime, formatDuration } from "@/lib/api";
import { 
  FileText, Package, AlertCircle, Clock, RefreshCw, 
  CheckCircle, XCircle, AlertTriangle
} from "lucide-react";

export default function SyncHistory() {
  const [limit, setLimit] = useState(20);

  // Query to get sync logs
  const { data: syncLogs, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/sync/logs?limit=${limit}`],
    queryFn: () => getSyncLogs(limit),
  });

  // Function to determine the status badge color
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Function to get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 mr-1" />;
      case "running":
        return <Clock className="h-4 w-4 mr-1" />;
      case "error":
        return <XCircle className="h-4 w-4 mr-1" />;
      default:
        return <AlertTriangle className="h-4 w-4 mr-1" />;
    }
  };

  // Function to get icon based on sync type
  const getSyncTypeIcon = (type: string) => {
    switch (type) {
      case "transactions":
        return <FileText className="h-5 w-5 text-blue-500 mr-2" />;
      case "machines":
        return <Package className="h-5 w-5 text-blue-500 mr-2" />;
      case "events":
        return <AlertCircle className="h-5 w-5 text-blue-500 mr-2" />;
      default:
        return <Clock className="h-5 w-5 text-blue-500 mr-2" />;
    }
  };

  // Function to get formatted sync type
  const getFormattedSyncType = (type: string) => {
    switch (type) {
      case "transactions":
        return "Transaktionen";
      case "machines":
        return "Maschinen";
      case "events":
        return "Ereignisse";
      case "all":
        return "Vollständig";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Synchronisierungsverlauf</CardTitle>
              <CardDescription>
                Verlauf aller durchgeführten Synchronisierungen mit dem Vendon-System
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(limit)} onValueChange={(value) => setLimit(parseInt(value))}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Anzahl anzeigen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 Einträge</SelectItem>
                  <SelectItem value="20">20 Einträge</SelectItem>
                  <SelectItem value="50">50 Einträge</SelectItem>
                  <SelectItem value="100">100 Einträge</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => refetch()} className="flex items-center">
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Typ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ende
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Elemente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gespeichert
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktualisiert
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fehler
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dauer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-24" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-32" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-32" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-5 w-24" />
                      </td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                      <div className="flex flex-col items-center">
                        <AlertCircle className="h-6 w-6 text-red-500 mb-2" />
                        <p>Fehler beim Laden des Synchronisierungsverlaufs:</p>
                        <p className="font-medium">{error instanceof Error ? error.message : "Unbekannter Fehler"}</p>
                        <Button variant="outline" className="mt-2" onClick={() => refetch()}>
                          Erneut versuchen
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : syncLogs && syncLogs.length > 0 ? (
                  syncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getSyncTypeIcon(log.syncType)}
                          <span className="text-sm font-medium text-gray-900">
                            {getFormattedSyncType(log.syncType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.startDate ? formatDateTime(log.startDate) : "--"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.endDate ? formatDateTime(log.endDate) : "--"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.itemsFound}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.itemsSaved}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.itemsUpdated}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.errors}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(log.durationSeconds)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(log.syncStatus)}`}
                        >
                          {getStatusIcon(log.syncStatus)}
                          {log.syncStatus === "completed"
                            ? "Abgeschlossen"
                            : log.syncStatus === "running"
                            ? "Läuft"
                            : log.syncStatus === "error"
                            ? "Fehler"
                            : log.syncStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                      Keine Synchronisierungsprotokolle gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

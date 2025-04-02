import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import axios from 'axios';
import { AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

export default function SyncLogs() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const syncLogsQuery = useQuery({
    queryKey: ['/api/sync/logs', page, limit],
    queryFn: async () => {
      const response = await axios.get(`/api/sync/logs?page=${page}&limit=${limit}`);
      return response.data;
    },
  });

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'running':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'completed':
        return 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30';
      case 'running':
        return 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30';
      case 'error':
        return 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30';
      default:
        return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Synchronisierungslogs</CardTitle>
        <CardDescription>
          Protokoll der letzten Synchronisierungsvorgänge
        </CardDescription>
      </CardHeader>
      <CardContent>
        {syncLogsQuery.isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Startzeit</TableHead>
                  <TableHead>Dauer</TableHead>
                  <TableHead className="text-right">Elemente</TableHead>
                  <TableHead className="text-right">Gespeichert</TableHead>
                  <TableHead className="text-right">Aktualisiert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogsQuery.data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center">
                        {getStatusIcon(log.status)}
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(log.status)}`}>
                          {log.status === 'completed' ? 'Abgeschlossen' :
                           log.status === 'running' ? 'Läuft' :
                           log.status === 'error' ? 'Fehler' : 'Unbekannt'}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{log.sync_type}</TableCell>
                    <TableCell>
                      {log.start_time ? format(new Date(log.start_time), 'Pp', { locale: de }) : 'N/A'}
                    </TableCell>
                    <TableCell>{formatDuration(log.duration_seconds)}</TableCell>
                    <TableCell className="text-right">{log.items_found?.toLocaleString() || 'N/A'}</TableCell>
                    <TableCell className="text-right">{log.items_saved?.toLocaleString() || 'N/A'}</TableCell>
                    <TableCell className="text-right">{log.items_updated?.toLocaleString() || 'N/A'}</TableCell>
                  </TableRow>
                ))}
                {(!syncLogsQuery.data?.logs || syncLogsQuery.data.logs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      Keine Synchronisierungslogs vorhanden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-muted-foreground">
                Zeige {syncLogsQuery.data?.logs?.length || 0} von {syncLogsQuery.data?.total || 0} Logs
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Zurück
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!syncLogsQuery.data?.hasMore}
                  className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Weiter
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
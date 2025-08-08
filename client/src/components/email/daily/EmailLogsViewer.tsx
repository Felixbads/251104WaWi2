import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Filter, RefreshCw, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface EmailLog {
  id: number;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt: string;
  errorMessage?: string;
  templateId?: number;
  createdAt: string;
}

export const EmailLogsViewer: React.FC = () => {
  const [filters, setFilters] = useState({
    status: '' as 'sent' | 'failed' | 'pending' | '',
    startDate: '',
    endDate: '',
    limit: 50,
    offset: 0,
  });

  // Lade E-Mail-Logs
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['/api/email/daily/logs', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', filters.limit.toString());
      params.append('offset', filters.offset.toString());

      return fetch(`/api/email/daily/logs?${params.toString()}`).then(res => res.json());
    },
  });

  const logs = logsData?.data || [];
  const pagination = logsData?.pagination;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'pending':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'sent':
        return 'Gesendet';
      case 'failed':
        return 'Fehlgeschlagen';
      case 'pending':
        return 'Ausstehend';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              E-Mail-Protokoll
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
          </CardTitle>
          <CardDescription>
            Übersicht über gesendete E-Mail-Benachrichtigungen und deren Status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />
                Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="status-filter">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => setFilters({ ...filters, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Alle Status</SelectItem>
                      <SelectItem value="sent">Gesendet</SelectItem>
                      <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                      <SelectItem value="pending">Ausstehend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="start-date">Von Datum</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">Bis Datum</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="limit">Anzahl Einträge</Label>
                  <Select
                    value={filters.limit.toString()}
                    onValueChange={(value) => setFilters({ ...filters, limit: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Tabelle */}
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p>Lade E-Mail-Protokolle...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-4" />
              <p>Keine E-Mail-Protokolle gefunden.</p>
              <p className="text-sm">Versuchen Sie andere Filtereinstellungen.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log: EmailLog) => (
                <Card key={log.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusColor(log.status)}>
                          {getStatusText(log.status)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(log.sentAt || log.createdAt)}
                        </span>
                      </div>
                      
                      <div>
                        <p className="font-medium">{log.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          An: {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail}
                        </p>
                      </div>

                      {log.errorMessage && (
                        <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                          <strong>Fehler:</strong> {log.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              {/* Pagination Info */}
              {pagination && (
                <div className="flex justify-between items-center pt-4 text-sm text-muted-foreground">
                  <span>
                    Zeige {pagination.offset + 1} bis {Math.min(pagination.offset + pagination.limit, pagination.total)} von {pagination.total} Einträgen
                  </span>
                  <div className="flex gap-2">
                    {pagination.offset > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters({ ...filters, offset: Math.max(0, pagination.offset - pagination.limit) })}
                      >
                        Zurück
                      </Button>
                    )}
                    {pagination.offset + pagination.limit < pagination.total && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters({ ...filters, offset: pagination.offset + pagination.limit })}
                      >
                        Weiter
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
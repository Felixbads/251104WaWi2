import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Mail,
  Eye,
  Calendar
} from 'lucide-react';

interface NotificationLog {
  id: string;
  eventType: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  recipientEmail: string;
  subject: string;
  sentAt: string | null;
  errorMessage: string | null;
  metadata: any;
  createdAt: string;
}

interface NotificationEvent {
  id: string;
  eventType: string;
  data: any;
  triggeredAt: string;
  processedAt: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
}

export function NotificationLogsViewer() {
  const [activeTab, setActiveTab] = useState('logs');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('7d');

  // Fetch notification logs
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['/api/notifications/logs', { 
      search: searchTerm,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      eventType: eventTypeFilter !== 'all' ? eventTypeFilter : undefined,
      days: dateFilter !== 'all' ? parseInt(dateFilter) : undefined,
    }],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch notification events
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['/api/notifications/events', {
      search: searchTerm,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      eventType: eventTypeFilter !== 'all' ? eventTypeFilter : undefined,
      days: dateFilter !== 'all' ? parseInt(dateFilter) : undefined,
    }],
    refetchInterval: 30000,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered': 
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending':
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'pending':
      case 'processing': return <Clock className="h-4 w-4" />;
      case 'failed': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getEventTypeLabel = (eventType: string) => {
    const eventTypes: Record<string, string> = {
      'coin_low': 'Niedriger Münzbestand',
      'cash_high': 'Hoher Bargeldbestand',
      'mhd_soon': 'MHD-Warnung',
      'stock_low': 'Niedriger Lagerbestand',
      'sales_yesterday': 'Täglicher Verkaufsbericht',
      'sales_weekly': 'Wöchentlicher Verkaufsbericht',
      'margin_report': 'Deckungsbeitrags-Analyse',
      'forecast_week': 'Wöchentliche Verkaufsprognose',
    };
    return eventTypes[eventType] || eventType;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  const handleRefresh = () => {
    refetchLogs();
    refetchEvents();
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export functionality to be implemented');
  };

  return (
    <Card data-testid="notification-logs-viewer">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Benachrichtigungs-Protokolle
            </CardTitle>
            <CardDescription>
              Überwachen Sie gesendete Benachrichtigungen und Systemereignisse
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              data-testid="refresh-logs-button"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Aktualisieren
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              data-testid="export-logs-button"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Controls */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="logs-search-input"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="logs-status-filter">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="pending">Ausstehend</SelectItem>
              <SelectItem value="sent">Gesendet</SelectItem>
              <SelectItem value="delivered">Zugestellt</SelectItem>
              <SelectItem value="failed">Fehlgeschlagen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-48" data-testid="logs-eventtype-filter">
              <SelectValue placeholder="Ereignistyp filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="coin_low">Niedriger Münzbestand</SelectItem>
              <SelectItem value="cash_high">Hoher Bargeldbestand</SelectItem>
              <SelectItem value="mhd_soon">MHD-Warnung</SelectItem>
              <SelectItem value="stock_low">Niedriger Lagerbestand</SelectItem>
              <SelectItem value="sales_yesterday">Täglicher Bericht</SelectItem>
              <SelectItem value="sales_weekly">Wöchentlicher Bericht</SelectItem>
              <SelectItem value="margin_report">Deckungsbeitrags-Analyse</SelectItem>
              <SelectItem value="forecast_week">Verkaufsprognose</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-32" data-testid="logs-date-filter">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Heute</SelectItem>
              <SelectItem value="7d">7 Tage</SelectItem>
              <SelectItem value="30d">30 Tage</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="logs" data-testid="logs-tab">
              <Mail className="mr-2 h-4 w-4" />
              E-Mail-Protokolle
            </TabsTrigger>
            <TabsTrigger value="events" data-testid="events-tab">
              <Calendar className="mr-2 h-4 w-4" />
              Systemereignisse
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            {logsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : logs?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Ereignistyp</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Betreff</TableHead>
                    <TableHead>Gesendet</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs?.map((log: NotificationLog) => (
                    <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <Badge className={getStatusColor(log.status)}>
                            {log.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{getEventTypeLabel(log.eventType)}</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.recipientEmail}
                      </TableCell>
                      <TableCell className="max-w-64 truncate">
                        {log.subject}
                      </TableCell>
                      <TableCell>
                        {log.sentAt ? formatDateTime(log.sentAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {log.errorMessage ? (
                          <span className="text-red-600 text-sm max-w-48 truncate block">
                            {log.errorMessage}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Alert>
                <AlertDescription>
                  Keine E-Mail-Protokolle für die ausgewählten Filter gefunden.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="events">
            {eventsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : events?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Ereignistyp</TableHead>
                    <TableHead>Ausgelöst</TableHead>
                    <TableHead>Verarbeitet</TableHead>
                    <TableHead>Dauer</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.map((event: NotificationEvent) => (
                    <TableRow key={event.id} data-testid={`event-row-${event.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(event.status)}
                          <Badge className={getStatusColor(event.status)}>
                            {event.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{getEventTypeLabel(event.eventType)}</span>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(event.triggeredAt)}
                      </TableCell>
                      <TableCell>
                        {event.processedAt ? formatDateTime(event.processedAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {event.processedAt ? (
                          <span className="text-sm">
                            {Math.round((new Date(event.processedAt).getTime() - new Date(event.triggeredAt).getTime()) / 1000)}s
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {event.errorMessage ? (
                          <span className="text-red-600 text-sm max-w-48 truncate block">
                            {event.errorMessage}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Alert>
                <AlertDescription>
                  Keine Systemereignisse für die ausgewählten Filter gefunden.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
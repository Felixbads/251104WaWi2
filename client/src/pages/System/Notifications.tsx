import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, 
  Users, 
  Calendar, 
  Mail, 
  Settings, 
  Activity, 
  TestTube,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  Database,
  Zap
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// Components for different tabs
import { NotificationRecipientsManager } from '@/components/notifications/NotificationRecipientsManager';
import { NotificationSubscriptionsManager } from '@/components/notifications/NotificationSubscriptionsManager';
import { NotificationSchedulesManager } from '@/components/notifications/NotificationSchedulesManager';
import { NotificationLogsViewer } from '@/components/notifications/NotificationLogsViewer';
import { NotificationTestCenter } from '@/components/notifications/NotificationTestCenter';
import { NotificationSystemStatus } from '@/components/notifications/NotificationSystemStatus';

interface NotificationSystemHealth {
  overall: 'healthy' | 'warning' | 'critical' | 'offline';
  components: {
    database: 'healthy' | 'warning' | 'error';
    queueSystem: 'healthy' | 'warning' | 'error';
    emailService: 'healthy' | 'warning' | 'error';
    triggers: 'healthy' | 'warning' | 'error';
  };
  stats: {
    totalRecipients: number;
    activeSubscriptions: number;
    scheduledNotifications: number;
    recentEvents: number;
    queuedJobs: number;
    failedJobs: number;
  };
  lastCheck: string;
}

export default function Notifications() {
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch notification system status
  const { data: systemStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/notifications/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch queue status
  const { data: queueStatus, isLoading: queueLoading } = useQuery({
    queryKey: ['/api/notifications/queue/status'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Manual trigger mutation
  const triggerMutation = useMutation({
    mutationFn: (eventType: string) => 
      apiRequest(`/api/notifications/triggers/${eventType}/run`, {
        method: 'POST',
      }),
    onSuccess: (data, eventType) => {
      toast({
        title: 'Trigger ausgeführt',
        description: `${eventType} Trigger wurde erfolgreich ausgeführt.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Trigger-Fehler',
        description: error.message || 'Fehler beim Ausführen des Triggers',
        variant: 'destructive',
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': 
      case 'error': return 'bg-red-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'Gesund';
      case 'warning': return 'Warnung';
      case 'critical': return 'Kritisch';
      case 'error': return 'Fehler';
      case 'offline': return 'Offline';
      default: return 'Unbekannt';
    }
  };

  const eventTypes = [
    { key: 'coin_low', label: 'Niedriger Münzbestand', icon: '🪙' },
    { key: 'cash_high', label: 'Hoher Bargeldbestand', icon: '💰' },
    { key: 'mhd_soon', label: 'MHD-Warnung', icon: '📅' },
    { key: 'stock_low', label: 'Niedriger Lagerbestand', icon: '📦' },
    { key: 'sales_yesterday', label: 'Täglicher Verkaufsbericht', icon: '📊' },
    { key: 'sales_weekly', label: 'Wöchentlicher Verkaufsbericht', icon: '📈' },
    { key: 'margin_report', label: 'Deckungsbeitrags-Analyse', icon: '💰' },
    { key: 'forecast_week', label: 'Wöchentliche Verkaufsprognose', icon: '🔮' },
  ];

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="notifications-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Benachrichtigungssystem</h1>
        <p className="text-muted-foreground mt-1">
          Zentrale Verwaltung für automatische E-Mail-Benachrichtigungen und Systemereignisse
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-7 mb-6">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Activity className="mr-2 h-4 w-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="recipients" data-testid="tab-recipients">
            <Users className="mr-2 h-4 w-4" />
            Empfänger
          </TabsTrigger>
          <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">
            <Bell className="mr-2 h-4 w-4" />
            Abonnements
          </TabsTrigger>
          <TabsTrigger value="schedules" data-testid="tab-schedules">
            <Calendar className="mr-2 h-4 w-4" />
            Zeitpläne
          </TabsTrigger>
          <TabsTrigger value="test" data-testid="tab-test">
            <TestTube className="mr-2 h-4 w-4" />
            Test
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <Database className="mr-2 h-4 w-4" />
            Protokolle
          </TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system">
            <Settings className="mr-2 h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* System Status Overview */}
            <Card data-testid="system-status-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Systemstatus
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusLoading ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Gesamtstatus</span>
                      <Badge 
                        className={`${getStatusColor(systemStatus?.overall || 'offline')} text-white`}
                        data-testid="overall-status"
                      >
                        {getStatusText(systemStatus?.overall || 'offline')}
                      </Badge>
                    </div>
                    {systemStatus?.components && Object.entries(systemStatus.components).map(([component, status]) => (
                      <div key={component} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{component}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`}></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Queue Status */}
            <Card data-testid="queue-status-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Warteschlange
                </CardTitle>
              </CardHeader>
              <CardContent>
                {queueLoading ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Wartende Jobs</span>
                      <Badge variant="outline" data-testid="queued-jobs">
                        {queueStatus?.pendingJobs || 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Aktive Jobs</span>
                      <Badge variant="outline" data-testid="active-jobs">
                        {queueStatus?.activeJobs || 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Fehlgeschlagene Jobs</span>
                      <Badge 
                        variant={queueStatus?.failedJobs > 0 ? "destructive" : "outline"}
                        data-testid="failed-jobs"
                      >
                        {queueStatus?.failedJobs || 0}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card data-testid="statistics-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Statistiken
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Empfänger</span>
                    <Badge variant="outline" data-testid="total-recipients">
                      {systemStatus?.stats?.totalRecipients || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Aktive Abonnements</span>
                    <Badge variant="outline" data-testid="active-subscriptions">
                      {systemStatus?.stats?.activeSubscriptions || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Geplante Benachrichtigungen</span>
                    <Badge variant="outline" data-testid="scheduled-notifications">
                      {systemStatus?.stats?.scheduledNotifications || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Letzte Ereignisse (24h)</span>
                    <Badge variant="outline" data-testid="recent-events">
                      {systemStatus?.stats?.recentEvents || 0}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Manual Trigger Section */}
          <Card data-testid="manual-triggers-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Manuelle Trigger
              </CardTitle>
              <CardDescription>
                Trigger für verschiedene Benachrichtigungstypen manuell ausführen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {eventTypes.map((eventType) => (
                  <Button
                    key={eventType.key}
                    variant="outline"
                    size="sm"
                    onClick={() => triggerMutation.mutate(eventType.key)}
                    disabled={triggerMutation.isPending}
                    className="flex items-center gap-2 h-auto p-4 flex-col"
                    data-testid={`trigger-${eventType.key}`}
                  >
                    <span className="text-2xl">{eventType.icon}</span>
                    <span className="text-xs text-center">{eventType.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card data-testid="recent-activity-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Letzte Aktivität
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemStatus?.recentActivity?.length > 0 ? (
                  systemStatus.recentActivity.map((activity: any, index: number) => (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="text-sm font-medium">{activity.eventType}</p>
                        <p className="text-xs text-muted-foreground">{activity.message}</p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleString('de-DE')}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Keine aktuellen Aktivitäten</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients" className="space-y-6">
          <NotificationRecipientsManager />
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <NotificationSubscriptionsManager />
        </TabsContent>

        <TabsContent value="schedules" className="space-y-6">
          <NotificationSchedulesManager />
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <NotificationTestCenter />
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <NotificationLogsViewer />
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <NotificationSystemStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}
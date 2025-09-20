import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Plus, Trash2, Edit, Calendar, Clock, Play, Pause } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { insertNotificationScheduleSchema, type InsertNotificationSchedule, type NotificationSchedule } from '@shared/schema';

const frequencyOptions = [
  { value: 'once', label: 'Einmalig' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'cron', label: 'Cron-Ausdruck' },
];

const eventTypes = [
  { value: 'coin_low', label: 'Niedriger Münzbestand', icon: '🪙' },
  { value: 'cash_high', label: 'Hoher Bargeldbestand', icon: '💰' },
  { value: 'mhd_soon', label: 'MHD-Warnung', icon: '📅' },
  { value: 'stock_low', label: 'Niedriger Lagerbestand', icon: '📦' },
  { value: 'sales_yesterday', label: 'Täglicher Verkaufsbericht', icon: '📊' },
  { value: 'sales_weekly', label: 'Wöchentlicher Verkaufsbericht', icon: '📈' },
  { value: 'margin_report', label: 'Deckungsbeitrags-Analyse', icon: '💰' },
  { value: 'forecast_week', label: 'Wöchentliche Verkaufsprognose', icon: '🔮' },
];

export function NotificationSchedulesManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<NotificationSchedule | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertNotificationSchedule>({
    resolver: zodResolver(insertNotificationScheduleSchema),
    defaultValues: {
      subscriptionId: '',
      frequency: 'daily',
      timezone: 'Europe/Berlin',
      active: true,
    },
  });

  const watchedFrequency = form.watch('frequency');

  // Fetch schedules
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['/api/notifications/schedules'],
  });

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: (data: InsertNotificationSchedule) =>
      apiRequest('/api/notifications/schedules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Zeitplan erstellt',
        description: 'Der neue Zeitplan wurde erfolgreich hinzugefügt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/schedules'] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Erstellen des Zeitplans',
        variant: 'destructive',
      });
    },
  });

  // Update schedule mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertNotificationSchedule> }) =>
      apiRequest(`/api/notifications/schedules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Zeitplan aktualisiert',
        description: 'Der Zeitplan wurde erfolgreich aktualisiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/schedules'] });
      setIsDialogOpen(false);
      setEditingSchedule(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Aktualisieren des Zeitplans',
        variant: 'destructive',
      });
    },
  });

  // Delete schedule mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/notifications/schedules/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'Zeitplan gelöscht',
        description: 'Der Zeitplan wurde erfolgreich entfernt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/schedules'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Löschen des Zeitplans',
        variant: 'destructive',
      });
    },
  });

  // Toggle schedule status
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`/api/notifications/schedules/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/schedules'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Ändern des Status',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: InsertNotificationSchedule) => {
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (schedule: NotificationSchedule) => {
    setEditingSchedule(schedule);
    form.reset({
      subscriptionId: schedule.subscriptionId.toString(),
      frequency: schedule.frequency,
      timezone: schedule.timezone || 'Europe/Berlin',
      active: schedule.active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Sind Sie sicher, dass Sie diesen Zeitplan löschen möchten?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    toggleMutation.mutate({ id, active: !currentStatus });
  };

  const getEventTypeInfo = (eventType: string) => {
    return eventTypes.find(et => et.value === eventType) || { 
      value: eventType, 
      label: eventType, 
      icon: '📧' 
    };
  };

  const getFrequencyLabel = (frequency: string) => {
    return frequencyOptions.find(fo => fo.value === frequency)?.label || frequency;
  };

  const getNextRun = (schedule: any) => {
    if (schedule.nextRun) {
      return new Date(schedule.nextRun).toLocaleString('de-DE');
    }
    return 'Nicht geplant';
  };

  return (
    <Card data-testid="notification-schedules-manager">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Benachrichtigungs-Zeitpläne
            </CardTitle>
            <CardDescription>
              Verwalten Sie automatische Zeitpläne für wiederkehrende Benachrichtigungen
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingSchedule(null);
                  form.reset();
                }}
                data-testid="add-schedule-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Zeitplan hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingSchedule ? 'Zeitplan bearbeiten' : 'Neuen Zeitplan hinzufügen'}
                </DialogTitle>
                <DialogDescription>
                  {editingSchedule 
                    ? 'Bearbeiten Sie die Zeitplan-Einstellungen.' 
                    : 'Fügen Sie einen neuen automatischen Benachrichtigungs-Zeitplan hinzu.'
                  }
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="subscriptionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Abonnement</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="schedule-subscription-select">
                              <SelectValue placeholder="Abonnement auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {/* TODO: Load subscriptions for dropdown */}
                            <SelectItem value="1">Test Abonnement</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Häufigkeit</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="schedule-frequency-select">
                              <SelectValue placeholder="Häufigkeit auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {frequencyOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {watchedFrequency === 'cron' && (
                    <FormField
                      control={form.control}
                      name="cronExpression"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cron-Ausdruck</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="0 8 * * *" data-testid="schedule-cron-input" />
                          </FormControl>
                          <FormDescription>
                            z.B. "0 8 * * *" für täglich um 8:00 Uhr
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zeitzone</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="schedule-timezone-input" />
                        </FormControl>
                        <FormDescription>
                          Standard: Europe/Berlin
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Aktiv
                          </FormLabel>
                          <FormDescription>
                            Zeitplan aktivieren
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="schedule-active-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="save-schedule-button"
                    >
                      {editingSchedule ? 'Aktualisieren' : 'Hinzufügen'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        ) : schedules?.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Abonnement</TableHead>
                <TableHead>Häufigkeit</TableHead>
                <TableHead>Nächste Ausführung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules?.map((schedule: any) => (
                <TableRow key={schedule.id} data-testid={`schedule-row-${schedule.id}`}>
                  <TableCell className="font-medium">
                    {schedule.subscription?.recipient?.displayName || `Abonnement #${schedule.subscriptionId}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getFrequencyLabel(schedule.frequency)}
                    </Badge>
                    {schedule.hour !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">
                        {String(schedule.hour).padStart(2, '0')}:{String(schedule.minute || 0).padStart(2, '0')} Uhr
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{getNextRun(schedule)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={schedule.active ? 'default' : 'secondary'}>
                        {schedule.active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggle(schedule.id.toString(), schedule.active)}
                        data-testid={`toggle-schedule-${schedule.id}`}
                      >
                        {schedule.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(schedule)}
                        data-testid={`edit-schedule-${schedule.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(schedule.id.toString())}
                        data-testid={`delete-schedule-${schedule.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Alert>
            <AlertDescription>
              Noch keine Zeitpläne konfiguriert. Fügen Sie Zeitpläne hinzu für automatische wiederkehrende Benachrichtigungen.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
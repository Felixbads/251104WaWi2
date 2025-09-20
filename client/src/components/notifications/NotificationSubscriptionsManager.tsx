import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Plus, Trash2, Edit, Bell, BellOff, Settings } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { insertNotificationSubscriptionSchema, type InsertNotificationSubscription, type NotificationSubscription } from '@shared/schema';

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

export function NotificationSubscriptionsManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<NotificationSubscription | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertNotificationSubscription>({
    resolver: zodResolver(insertNotificationSubscriptionSchema),
    defaultValues: {
      recipientId: '',
      eventType: 'coin_low',
      active: true,
    },
  });

  // Fetch subscriptions
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['/api/notifications/subscriptions'],
  });

  // Fetch recipients for dropdown
  const { data: recipients } = useQuery({
    queryKey: ['/api/notifications/recipients'],
  });

  // Create subscription mutation
  const createMutation = useMutation({
    mutationFn: (data: InsertNotificationSubscription) =>
      apiRequest('/api/notifications/subscriptions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Abonnement erstellt',
        description: 'Das neue Abonnement wurde erfolgreich hinzugefügt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/subscriptions'] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Erstellen des Abonnements',
        variant: 'destructive',
      });
    },
  });

  // Update subscription mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertNotificationSubscription> }) =>
      apiRequest(`/api/notifications/subscriptions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Abonnement aktualisiert',
        description: 'Das Abonnement wurde erfolgreich aktualisiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/subscriptions'] });
      setIsDialogOpen(false);
      setEditingSubscription(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Aktualisieren des Abonnements',
        variant: 'destructive',
      });
    },
  });

  // Delete subscription mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/notifications/subscriptions/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'Abonnement gelöscht',
        description: 'Das Abonnement wurde erfolgreich entfernt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/subscriptions'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Löschen des Abonnements',
        variant: 'destructive',
      });
    },
  });

  // Toggle subscription status
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`/api/notifications/subscriptions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/subscriptions'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Ändern des Status',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: InsertNotificationSubscription) => {
    if (editingSubscription) {
      updateMutation.mutate({ id: editingSubscription.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (subscription: NotificationSubscription) => {
    setEditingSubscription(subscription);
    form.reset({
      recipientId: subscription.recipientId.toString(),
      eventType: subscription.eventType,
      active: subscription.active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Sind Sie sicher, dass Sie dieses Abonnement löschen möchten?')) {
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

  return (
    <Card data-testid="notification-subscriptions-manager">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Benachrichtigungs-Abonnements
            </CardTitle>
            <CardDescription>
              Verwalten Sie, wer welche Arten von Benachrichtigungen erhält
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingSubscription(null);
                  form.reset();
                }}
                data-testid="add-subscription-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Abonnement hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingSubscription ? 'Abonnement bearbeiten' : 'Neues Abonnement hinzufügen'}
                </DialogTitle>
                <DialogDescription>
                  {editingSubscription 
                    ? 'Bearbeiten Sie die Abonnement-Einstellungen.' 
                    : 'Fügen Sie ein neues Benachrichtigungs-Abonnement hinzu.'
                  }
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="recipientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empfänger</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="subscription-recipient-select">
                              <SelectValue placeholder="Empfänger auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {recipients?.map((recipient: any) => (
                              <SelectItem key={recipient.id} value={recipient.id}>
                                {recipient.name} ({recipient.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="eventType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ereignistyp</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="subscription-eventtype-select">
                              <SelectValue placeholder="Ereignistyp auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventTypes.map((eventType) => (
                              <SelectItem key={eventType.value} value={eventType.value}>
                                {eventType.icon} {eventType.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="save-subscription-button"
                    >
                      {editingSubscription ? 'Aktualisieren' : 'Hinzufügen'}
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
        ) : subscriptions?.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empfänger</TableHead>
                <TableHead>Ereignistyp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions?.map((subscription: any) => {
                const eventInfo = getEventTypeInfo(subscription.eventType);
                return (
                  <TableRow key={subscription.id} data-testid={`subscription-row-${subscription.id}`}>
                    <TableCell className="font-medium">
                      {subscription.recipient?.name || 'Unbekannt'}
                      <div className="text-sm text-gray-500">
                        {subscription.recipient?.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{eventInfo.icon}</span>
                        <span>{eventInfo.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={subscription.active ? 'default' : 'secondary'}>
                          {subscription.active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggle(subscription.id.toString(), subscription.active)}
                          data-testid={`toggle-subscription-${subscription.id}`}
                        >
                          {subscription.active ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(subscription.createdAt).toLocaleDateString('de-DE')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(subscription)}
                          data-testid={`edit-subscription-${subscription.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(subscription.id.toString())}
                          data-testid={`delete-subscription-${subscription.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Alert>
            <AlertDescription>
              Noch keine Abonnements konfiguriert. Fügen Sie Abonnements hinzu, damit Empfänger Benachrichtigungen erhalten.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
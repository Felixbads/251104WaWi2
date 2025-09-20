import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Plus, Trash2, Edit, Users, Mail } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { insertNotificationRecipientSchema, type InsertNotificationRecipient, type NotificationRecipient } from '@shared/schema';

interface NotificationRecipientsManagerProps {}

export function NotificationRecipientsManager({}: NotificationRecipientsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<NotificationRecipient | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertNotificationRecipient>({
    resolver: zodResolver(insertNotificationRecipientSchema),
    defaultValues: {
      displayName: '',
      email: '',
      active: true,
    },
  });

  // Fetch recipients
  const { data: recipients, isLoading } = useQuery({
    queryKey: ['/api/notifications/recipients'],
  });

  // Create recipient mutation
  const createMutation = useMutation({
    mutationFn: (data: InsertNotificationRecipient) =>
      apiRequest('/api/notifications/recipients', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Empfänger erstellt',
        description: 'Der neue Empfänger wurde erfolgreich hinzugefügt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/recipients'] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Erstellen des Empfängers',
        variant: 'destructive',
      });
    },
  });

  // Update recipient mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertNotificationRecipient> }) =>
      apiRequest(`/api/notifications/recipients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: 'Empfänger aktualisiert',
        description: 'Der Empfänger wurde erfolgreich aktualisiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/recipients'] });
      setIsDialogOpen(false);
      setEditingRecipient(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Aktualisieren des Empfängers',
        variant: 'destructive',
      });
    },
  });

  // Delete recipient mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/notifications/recipients/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'Empfänger gelöscht',
        description: 'Der Empfänger wurde erfolgreich entfernt.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/recipients'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Löschen des Empfängers',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: InsertNotificationRecipient) => {
    if (editingRecipient) {
      updateMutation.mutate({ id: editingRecipient.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (recipient: NotificationRecipient) => {
    setEditingRecipient(recipient);
    form.reset({
      displayName: recipient.displayName,
      email: recipient.email,
      active: recipient.active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Sind Sie sicher, dass Sie diesen Empfänger löschen möchten?')) {
      deleteMutation.mutate(id);
    }
  };


  return (
    <Card data-testid="notification-recipients-manager">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Benachrichtigungs-Empfänger
            </CardTitle>
            <CardDescription>
              Verwalten Sie E-Mail-Empfänger für automatische Benachrichtigungen
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingRecipient(null);
                  form.reset();
                }}
                data-testid="add-recipient-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Empfänger hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingRecipient ? 'Empfänger bearbeiten' : 'Neuen Empfänger hinzufügen'}
                </DialogTitle>
                <DialogDescription>
                  {editingRecipient 
                    ? 'Bearbeiten Sie die Empfänger-Informationen.' 
                    : 'Fügen Sie einen neuen E-Mail-Empfänger für Benachrichtigungen hinzu.'
                  }
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="recipient-name-input" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-Mail</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="recipient-email-input" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="save-recipient-button"
                    >
                      {editingRecipient ? 'Aktualisieren' : 'Hinzufügen'}
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
        ) : recipients?.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients?.map((recipient: NotificationRecipient) => (
                <TableRow key={recipient.id} data-testid={`recipient-row-${recipient.id}`}>
                  <TableCell className="font-medium">{recipient.displayName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      {recipient.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={recipient.active ? 'default' : 'secondary'}>
                      {recipient.active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(recipient)}
                        data-testid={`edit-recipient-${recipient.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(recipient.id.toString())}
                        data-testid={`delete-recipient-${recipient.id}`}
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
              Noch keine Empfänger konfiguriert. Fügen Sie Empfänger hinzu, um Benachrichtigungen zu erhalten.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
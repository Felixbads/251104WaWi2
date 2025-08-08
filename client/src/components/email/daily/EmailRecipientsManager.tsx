import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Trash2, Mail, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface EmailRecipient {
  id?: number;
  name: string;
  email: string;
  enabled: boolean;
  emailSettingsId?: number;
  createdAt?: string;
}

export const EmailRecipientsManager: React.FC = () => {
  const [newRecipient, setNewRecipient] = useState<EmailRecipient>({
    name: '',
    email: '',
    enabled: true,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<EmailRecipient | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade Empfänger
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['/api/email/daily/recipients'],
    select: (data: any) => data?.data || [],
  });

  // Erstelle Empfänger
  const createRecipientMutation = useMutation({
    mutationFn: async (recipient: EmailRecipient) => {
      const response = await fetch('/api/email/daily/recipients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recipient),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Erstellen des Empfängers');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Empfänger erstellt",
        description: "Der neue E-Mail-Empfänger wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/recipients'] });
      setIsDialogOpen(false);
      setNewRecipient({ name: '', email: '', enabled: true });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Aktualisiere Empfänger
  const updateRecipientMutation = useMutation({
    mutationFn: async (recipient: EmailRecipient) => {
      const response = await fetch(`/api/email/daily/recipients/${recipient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recipient),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Aktualisieren des Empfängers');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Empfänger aktualisiert",
        description: "Der E-Mail-Empfänger wurde erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/recipients'] });
      setEditingRecipient(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Lösche Empfänger
  const deleteRecipientMutation = useMutation({
    mutationFn: async (recipientId: number) => {
      const response = await fetch(`/api/email/daily/recipients/${recipientId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Fehler beim Löschen des Empfängers');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Empfänger gelöscht",
        description: "Der E-Mail-Empfänger wurde erfolgreich entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/recipients'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateRecipient = async () => {
    if (!newRecipient.name || !newRecipient.email) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte geben Sie Name und E-Mail-Adresse ein.",
        variant: "destructive",
      });
      return;
    }

    await createRecipientMutation.mutateAsync(newRecipient);
  };

  const handleUpdateRecipient = async (recipient: EmailRecipient) => {
    await updateRecipientMutation.mutateAsync(recipient);
  };

  const handleDeleteRecipient = async (recipientId: number) => {
    if (confirm('Sind Sie sicher, dass Sie diesen Empfänger löschen möchten?')) {
      await deleteRecipientMutation.mutateAsync(recipientId);
    }
  };

  const toggleRecipientEnabled = async (recipient: EmailRecipient) => {
    await handleUpdateRecipient({
      ...recipient,
      enabled: !recipient.enabled,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              E-Mail-Empfänger
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Empfänger hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neuen E-Mail-Empfänger hinzufügen</DialogTitle>
                  <DialogDescription>
                    Fügen Sie einen neuen Empfänger für tägliche E-Mail-Benachrichtigungen hinzu.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newRecipient.name}
                      onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })}
                      placeholder="z.B. Max Mustermann"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail-Adresse</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newRecipient.email}
                      onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                      placeholder="z.B. max@example.com"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enabled"
                      checked={newRecipient.enabled}
                      onCheckedChange={(enabled) => setNewRecipient({ ...newRecipient, enabled })}
                    />
                    <Label htmlFor="enabled">Empfänger aktiviert</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateRecipient}
                    disabled={createRecipientMutation.isPending}
                  >
                    {createRecipientMutation.isPending ? 'Erstellen...' : 'Empfänger erstellen'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            Verwalten Sie die E-Mail-Empfänger für automatische tägliche Statusberichte
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Lade Empfänger...</div>
          ) : recipients.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Noch keine E-Mail-Empfänger konfiguriert. Fügen Sie Empfänger hinzu, um tägliche Benachrichtigungen zu aktivieren.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {recipients.map((recipient: EmailRecipient) => (
                <Card key={recipient.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{recipient.name}</div>
                        <div className="text-sm text-muted-foreground">{recipient.email}</div>
                      </div>
                      <Badge variant={recipient.enabled ? "default" : "secondary"}>
                        {recipient.enabled ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={recipient.enabled}
                        onCheckedChange={() => toggleRecipientEnabled(recipient)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingRecipient(recipient)}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRecipient(recipient.id!)}
                        disabled={deleteRecipientMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bearbeiten Dialog */}
      {editingRecipient && (
        <Dialog open={!!editingRecipient} onOpenChange={() => setEditingRecipient(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>E-Mail-Empfänger bearbeiten</DialogTitle>
              <DialogDescription>
                Bearbeiten Sie die Daten des E-Mail-Empfängers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingRecipient.name}
                  onChange={(e) => setEditingRecipient({ ...editingRecipient, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">E-Mail-Adresse</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingRecipient.email}
                  onChange={(e) => setEditingRecipient({ ...editingRecipient, email: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-enabled"
                  checked={editingRecipient.enabled}
                  onCheckedChange={(enabled) => setEditingRecipient({ ...editingRecipient, enabled })}
                />
                <Label htmlFor="edit-enabled">Empfänger aktiviert</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => handleUpdateRecipient(editingRecipient)}
                disabled={updateRecipientMutation.isPending}
              >
                {updateRecipientMutation.isPending ? 'Speichern...' : 'Änderungen speichern'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
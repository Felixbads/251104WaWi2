import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Edit, Trash2, Eye } from 'lucide-react';
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

interface EmailTemplate {
  id?: number;
  name: string;
  description?: string;
  subjectTemplate: string;
  contentTemplate: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const EmailTemplatesManager: React.FC = () => {
  const [newTemplate, setNewTemplate] = useState<EmailTemplate>({
    name: '',
    description: '',
    subjectTemplate: 'Täglicher Proviantomat-Statusbericht - {date}',
    contentTemplate: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Täglicher Proviantomat-Statusbericht</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h1>Täglicher Proviantomat-Statusbericht</h1>
    <p><strong>Datum:</strong> {date}</p>
    
    <h2>Wetter & Umsatzprognose</h2>
    <p>{weather_data}</p>
    
    <h2>Offene Wareneingänge</h2>
    <p>{open_orders}</p>
    
    <h2>MHD-Alerts</h2>
    <p>{mhd_alerts}</p>
    
    <h2>Automaten-Anomalien</h2>
    <p>{machine_anomalies}</p>
    
    <h2>Tagesrückblick</h2>
    <p>{daily_summary}</p>
    
    <p>Mit freundlichen Grüßen<br>
    Ihr Proviantomat-System</p>
</body>
</html>`,
    isDefault: false,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade Templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/email/daily/templates'],
    select: (data: any) => data?.data || [],
  });

  // Erstelle Template
  const createTemplateMutation = useMutation({
    mutationFn: async (template: EmailTemplate) => {
      const response = await fetch('/api/email/daily/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Erstellen der Vorlage');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vorlage erstellt",
        description: "Die E-Mail-Vorlage wurde erfolgreich erstellt.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/templates'] });
      setIsDialogOpen(false);
      setNewTemplate({
        name: '',
        description: '',
        subjectTemplate: 'Täglicher Proviantomat-Statusbericht - {date}',
        contentTemplate: newTemplate.contentTemplate,
        isDefault: false,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Aktualisiere Template
  const updateTemplateMutation = useMutation({
    mutationFn: async (template: EmailTemplate) => {
      const response = await fetch(`/api/email/daily/templates/${template.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Aktualisieren der Vorlage');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vorlage aktualisiert",
        description: "Die E-Mail-Vorlage wurde erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/templates'] });
      setEditingTemplate(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Lösche Template
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/email/daily/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Fehler beim Löschen der Vorlage');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vorlage gelöscht",
        description: "Die E-Mail-Vorlage wurde erfolgreich entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/daily/templates'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.subjectTemplate || !newTemplate.contentTemplate) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte füllen Sie alle erforderlichen Felder aus.",
        variant: "destructive",
      });
      return;
    }

    await createTemplateMutation.mutateAsync(newTemplate);
  };

  const handleUpdateTemplate = async (template: EmailTemplate) => {
    await updateTemplateMutation.mutateAsync(template);
  };

  const handleDeleteTemplate = async (templateId: number) => {
    if (confirm('Sind Sie sicher, dass Sie diese Vorlage löschen möchten?')) {
      await deleteTemplateMutation.mutateAsync(templateId);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              E-Mail-Vorlagen
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Vorlage erstellen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Neue E-Mail-Vorlage erstellen</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie eine neue Vorlage für tägliche E-Mail-Berichte.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name der Vorlage</Label>
                    <Input
                      id="name"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      placeholder="z.B. Standard Tagesbericht"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Beschreibung (optional)</Label>
                    <Input
                      id="description"
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      placeholder="z.B. Vollständiger Tagesbericht mit allen Bereichen"
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject">Betreff-Vorlage</Label>
                    <Input
                      id="subject"
                      value={newTemplate.subjectTemplate}
                      onChange={(e) => setNewTemplate({ ...newTemplate, subjectTemplate: e.target.value })}
                      placeholder="z.B. Täglicher Statusbericht - {date}"
                    />
                  </div>
                  <div>
                    <Label htmlFor="content">HTML-Inhalt</Label>
                    <Textarea
                      id="content"
                      value={newTemplate.contentTemplate}
                      onChange={(e) => setNewTemplate({ ...newTemplate, contentTemplate: e.target.value })}
                      rows={15}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateTemplate}
                    disabled={createTemplateMutation.isPending}
                  >
                    {createTemplateMutation.isPending ? 'Erstellen...' : 'Vorlage erstellen'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            Verwalten Sie E-Mail-Vorlagen für automatische tägliche Berichte
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Lade Vorlagen...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Noch keine E-Mail-Vorlagen erstellt. Erstellen Sie Ihre erste Vorlage.
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template: EmailTemplate) => (
                <Card key={template.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{template.name}</h3>
                        {template.isDefault && (
                          <Badge variant="default">Standard</Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Betreff: {template.subjectTemplate}
                      </p>
                      {template.updatedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Zuletzt bearbeitet: {new Date(template.updatedAt).toLocaleDateString('de-DE')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewTemplate(template)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id!)}
                        disabled={deleteTemplateMutation.isPending}
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
      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>E-Mail-Vorlage bearbeiten</DialogTitle>
              <DialogDescription>
                Bearbeiten Sie die E-Mail-Vorlage für tägliche Berichte.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name der Vorlage</Label>
                <Input
                  id="edit-name"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Beschreibung</Label>
                <Input
                  id="edit-description"
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-subject">Betreff-Vorlage</Label>
                <Input
                  id="edit-subject"
                  value={editingTemplate.subjectTemplate}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subjectTemplate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-content">HTML-Inhalt</Label>
                <Textarea
                  id="edit-content"
                  value={editingTemplate.contentTemplate}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, contentTemplate: e.target.value })}
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => handleUpdateTemplate(editingTemplate)}
                disabled={updateTemplateMutation.isPending}
              >
                {updateTemplateMutation.isPending ? 'Speichern...' : 'Änderungen speichern'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Vorschau Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vorlagen-Vorschau: {previewTemplate.name}</DialogTitle>
              <DialogDescription>
                HTML-Vorschau der E-Mail-Vorlage
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Betreff:</Label>
                <p className="p-2 bg-muted rounded">{previewTemplate.subjectTemplate}</p>
              </div>
              <div>
                <Label>HTML-Inhalt:</Label>
                <div className="border rounded p-4 bg-white max-h-96 overflow-y-auto">
                  <iframe
                    srcDoc={previewTemplate.contentTemplate}
                    className="w-full h-80 border-none"
                    title="E-Mail Vorschau"
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
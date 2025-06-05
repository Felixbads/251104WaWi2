import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Edit2, Trash2, Star, StarOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SupplierEmailTemplate {
  id: number;
  supplierId: number;
  templateName: string;
  subjectTemplate: string;
  contentTemplate: string;
  isDefault: boolean;
  templateType: string;
  createdAt: string;
  updatedAt: string;
}

interface SupplierEmailTemplatesProps {
  supplierId: number;
  supplierName: string;
}

export default function SupplierEmailTemplates({ supplierId, supplierName }: SupplierEmailTemplatesProps) {
  const [editingTemplate, setEditingTemplate] = useState<SupplierEmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    templateName: '',
    subjectTemplate: 'Bestellung {orderNumber} – Lieferung am {deliveryDate}',
    contentTemplate: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere aktuelle Bestellung {orderNumber} mit geplantem {deliveryType} am {deliveryDate} für unseren Lagerstandort {warehouseAddress}.

Bestellinformationen
Bestellnummer: {orderNumber}
Bestelldatum: {orderDate}
Lieferanten-Nr.: {supplierNumber}
Bearbeiter: Felix Zschoge
E-Mail für Rückfragen: felix@proviantomat.de
Bestelltyp: Standardbestellung

{deliveryAddress}

Rechnungsadresse:
Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden

Bestellte Artikel:
{itemsList}

Kostenübersicht:
Nettosumme: {netAmount} €
zzgl. {vatRate} % MwSt.: {vatAmount} €
Gesamtsumme brutto: {totalAmount} €

Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten {deliveryType}.

Für Rückfragen stehen wir jederzeit zur Verfügung.

Mit freundlichen Grüßen
Felix Zschoge

Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden
Tel.: +49 173 4385330
E-Mail: felix@proviantomat.de

Unternehmensdaten:
USt-IdNr.: DE353967134
Steuernummer: 202/108/12994`,
    templateType: 'standard',
    isDefault: false
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Vorlagen laden
  const { data: templates, isLoading } = useQuery({
    queryKey: ['supplier-email-templates', supplierId],
    queryFn: async () => {
      const response = await fetch(`/api/supplier-email-templates/${supplierId}`);
      if (!response.ok) throw new Error('Fehler beim Laden der E-Mail-Vorlagen');
      return response.json();
    }
  });

  // Vorlage erstellen
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/supplier-email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, supplierId })
      });
      if (!response.ok) throw new Error('Fehler beim Erstellen der Vorlage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-email-templates', supplierId] });
      resetForm();
      toast({ title: 'Vorlage erfolgreich erstellt' });
    },
    onError: () => {
      toast({ title: 'Fehler beim Erstellen der Vorlage', variant: 'destructive' });
    }
  });

  // Vorlage aktualisieren
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/supplier-email-templates/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Fehler beim Aktualisieren der Vorlage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-email-templates', supplierId] });
      resetForm();
      toast({ title: 'Vorlage erfolgreich aktualisiert' });
    },
    onError: () => {
      toast({ title: 'Fehler beim Aktualisieren der Vorlage', variant: 'destructive' });
    }
  });

  // Vorlage löschen
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/supplier-email-templates/${templateId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Vorlage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-email-templates', supplierId] });
      toast({ title: 'Vorlage erfolgreich gelöscht' });
    },
    onError: () => {
      toast({ title: 'Fehler beim Löschen der Vorlage', variant: 'destructive' });
    }
  });

  // Als Standard setzen
  const setDefaultMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/supplier-email-templates/${templateId}/set-default`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Fehler beim Setzen der Standard-Vorlage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-email-templates', supplierId] });
      toast({ title: 'Standard-Vorlage erfolgreich gesetzt' });
    },
    onError: () => {
      toast({ title: 'Fehler beim Setzen der Standard-Vorlage', variant: 'destructive' });
    }
  });

  const resetForm = () => {
    setFormData({
      templateName: '',
      subjectTemplate: '',
      contentTemplate: '',
      templateType: 'standard',
      isDefault: false
    });
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleEdit = (template: SupplierEmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      templateName: template.templateName,
      subjectTemplate: template.subjectTemplate,
      contentTemplate: template.contentTemplate,
      templateType: template.templateType,
      isDefault: template.isDefault
    });
    setIsCreating(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.templateName || !formData.subjectTemplate || !formData.contentTemplate) {
      toast({ title: 'Bitte füllen Sie alle Pflichtfelder aus', variant: 'destructive' });
      return;
    }

    if (editingTemplate) {
      updateTemplateMutation.mutate({ ...formData, id: editingTemplate.id });
    } else {
      createTemplateMutation.mutate(formData);
    }
  };

  // Vorlagen nach Typ gruppieren
  const templatesByType = templates?.reduce((acc: any, template: SupplierEmailTemplate) => {
    if (!acc[template.templateType]) acc[template.templateType] = [];
    acc[template.templateType].push(template);
    return acc;
  }, {}) || {};

  const templateTypes = [
    { value: 'standard', label: 'Standard' },
    { value: 'urgent', label: 'Dringend' },
    { value: 'reorder', label: 'Nachbestellung' }
  ];

  if (isLoading) {
    return <div>E-Mail-Vorlagen werden geladen...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">E-Mail-Vorlagen</h3>
          <p className="text-sm text-muted-foreground">
            Verwalten Sie E-Mail-Vorlagen für Bestellungen an {supplierName}
          </p>
        </div>
        <Button onClick={() => {
          setFormData({
            templateName: 'Standard Bestellung',
            subjectTemplate: 'Bestellung {orderNumber} – Lieferung am {deliveryDate}',
            contentTemplate: `Sehr geehrte Damen und Herren,

hiermit bestellen wir bei Ihnen folgende Artikel:

Bestellnummer: {orderNumber}
Bestelldatum: {orderDate}
Geplante Lieferung: {deliveryDate}
Lieferart: {deliveryType}

Lieferadresse:
{deliveryAddress}

Rechnungsadresse:
Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden

Bestellte Artikel:
{itemsList}

Kostenübersicht:
Nettosumme: {netAmount} €
zzgl. {vatRate} % MwSt.: {vatAmount} €
Gesamtsumme brutto: {totalAmount} €

Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten {deliveryType}.

Für Rückfragen stehen wir jederzeit zur Verfügung.

Mit freundlichen Grüßen
Felix Zschoge

Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden
Tel.: +49 173 4385330
E-Mail: felix@proviantomat.de

Unternehmensdaten:
USt-IdNr.: DE353967134
Steuernummer: 202/108/12994`,
            templateType: 'standard',
            isDefault: false
          });
          setEditingTemplate(null);
          setIsCreating(true);
        }} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Neue Vorlage
        </Button>
      </div>

      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTemplate ? 'Vorlage bearbeiten' : 'Neue E-Mail-Vorlage erstellen'}
            </CardTitle>
            <CardDescription>
              Erstellen Sie eine neue Vorlage für Bestellungs-E-Mails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="templateName">Vorlagenname *</Label>
                  <Input
                    id="templateName"
                    value={formData.templateName}
                    onChange={(e) => setFormData(prev => ({ ...prev, templateName: e.target.value }))}
                    placeholder="z.B. Standard Bestellung"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="templateType">Vorlagen-Typ</Label>
                  <Select
                    value={formData.templateType}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, templateType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subjectTemplate">Betreff-Vorlage *</Label>
                <Input
                  id="subjectTemplate"
                  value={formData.subjectTemplate}
                  onChange={(e) => setFormData(prev => ({ ...prev, subjectTemplate: e.target.value }))}
                  placeholder="z.B. Bestellung {orderNumber} vom {orderDate}"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Verfügbare Platzhalter: {`{orderNumber}, {orderDate}, {supplierName}, {deliveryDate}, {deliveryType}`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contentTemplate">Inhalt-Vorlage *</Label>
                <Textarea
                  id="contentTemplate"
                  value={formData.contentTemplate}
                  onChange={(e) => setFormData(prev => ({ ...prev, contentTemplate: e.target.value }))}
                  placeholder="Sehr geehrter {supplierName}, hiermit bestellen wir..."
                  rows={8}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Verfügbare Platzhalter: {`{orderNumber}, {orderDate}, {supplierName}, {supplierNumber}, {deliveryDate}, {deliveryType}, {deliveryAddress}, {warehouseAddress}, {itemsList}, {netAmount}, {vatRate}, {vatAmount}, {totalAmount}`}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                />
                <Label htmlFor="isDefault">Als Standard-Vorlage für diesen Typ setzen</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}>
                  {editingTemplate ? 'Aktualisieren' : 'Erstellen'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Abbrechen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="standard" className="w-full">
        <TabsList>
          {templateTypes.map(type => (
            <TabsTrigger key={type.value} value={type.value}>
              {type.label}
              {templatesByType[type.value] && (
                <Badge variant="secondary" className="ml-2">
                  {templatesByType[type.value].length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {templateTypes.map(type => (
          <TabsContent key={type.value} value={type.value} className="space-y-4">
            {templatesByType[type.value]?.length > 0 ? (
              templatesByType[type.value].map((template: SupplierEmailTemplate) => (
                <Card key={template.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{template.templateName}</CardTitle>
                        {template.isDefault && (
                          <Badge variant="default" className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Standard
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!template.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultMutation.mutate(template.id)}
                            className="flex items-center gap-1"
                          >
                            <StarOff className="h-4 w-4" />
                            Als Standard setzen
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template)}
                          className="flex items-center gap-1"
                        >
                          <Edit2 className="h-4 w-4" />
                          Bearbeiten
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                          className="flex items-center gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Löschen
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Betreff:</Label>
                        <p className="text-sm text-muted-foreground">{template.subjectTemplate}</p>
                      </div>
                      <Separator />
                      <div>
                        <Label className="text-sm font-medium">Inhalt:</Label>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {template.contentTemplate.length > 200 
                            ? template.contentTemplate.substring(0, 200) + '...'
                            : template.contentTemplate
                          }
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <p className="text-muted-foreground">
                    Keine {type.label}-Vorlagen vorhanden
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setFormData(prev => ({ 
                        ...prev, 
                        templateType: type.value,
                        subjectTemplate: '',
                        contentTemplate: ''
                      }));
                      setIsCreating(true);
                    }}
                  >
                    Erste Vorlage erstellen
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
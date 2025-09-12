import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Edit, Trash2, Eye, Truck, Wrench, Euro, Coins, Package, Calendar, BarChart3, AlertCircle, CheckCircle } from 'lucide-react';
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
import { 
  EnhancedDailyReportData,
  OrderDelivery,
  MachineStatusAlert,
  formatCurrency,
  formatDate,
  getSeverityColor,
  getStatusColor
} from '@/types/emailTypes';

interface EmailTemplate {
  id?: number;
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const EmailTemplatesManager: React.FC = () => {
  const [newTemplate, setNewTemplate] = useState<EmailTemplate>({
    name: '',
    description: '',
    subjectTemplate: 'Täglicher Proviantomat-Statusbericht - {date}',
    htmlTemplate: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Täglicher Proviantomat-Statusbericht</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .section { margin-bottom: 20px; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; }
        .section-title { color: #495057; font-size: 18px; margin-bottom: 10px; border-bottom: 2px solid #dee2e6; padding-bottom: 5px; }
        .alert-high { color: #dc3545; font-weight: bold; }
        .alert-medium { color: #fd7e14; font-weight: bold; }
        .alert-low { color: #28a745; font-weight: bold; }
        .summary-box { background: #e9ecef; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .delivery-item { background: #f8f9fa; padding: 8px; margin: 5px 0; border-left: 4px solid #007bff; }
        .machine-alert { background: #fff3cd; padding: 8px; margin: 5px 0; border-left: 4px solid #ffc107; }
        .critical-alert { background: #f8d7da; border-left-color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏪 Täglicher Proviantomat-Statusbericht</h1>
        <p><strong>📅 Datum:</strong> {date}</p>
        <p><strong>⏰ Erstellt um:</strong> {time}</p>
    </div>
    
    <!-- ENHANCED: Verkäufe & Performance -->
    <div class="section">
        <h2 class="section-title">💰 Verkäufe & Umsatz</h2>
        <div class="summary-box">
            <p><strong>Gesamtumsatz:</strong> {sales_total}€</p>
            <p><strong>Anzahl Verkäufe:</strong> {sales_count}</p>
            <p><strong>Durchschnitt pro Verkauf:</strong> {sales_average}€</p>
        </div>
        {sales_details}
    </div>

    <!-- ENHANCED: Erweiterte Bestellungen & Lieferungen -->
    <div class="section">
        <h2 class="section-title">🚚 Bestellungen & Lieferungen</h2>
        
        <h3>✅ Heute erwartete Lieferungen</h3>
        {erweiterte_bestellungen_heute_erwartet}
        
        <h3>⚠️ Verspätete Lieferungen</h3>
        {erweiterte_bestellungen_verspaetet}
        
        <h3>📦 Ausstehende Bestellungen</h3>
        {erweiterte_bestellungen_ausstehend}
        
        <div class="summary-box">
            <p><strong>Gesamt ausstehend:</strong> {bestellungen_total_count}</p>
            <p><strong>Gesamtwert ausstehend:</strong> {bestellungen_total_value}€</p>
            <p><strong>Kritische Verspätungen:</strong> {bestellungen_critical_delays}</p>
        </div>
    </div>

    <!-- ENHANCED: Automaten-Status & Alerts -->
    <div class="section">
        <h2 class="section-title">🔧 Automaten-Status & Alerts</h2>
        
        <h3>💰 Hoher Geldbestand</h3>
        {automaten_status_hoher_geldbestand}
        
        <h3>🪙 Münzgeld-Warnungen</h3>
        {automaten_status_muenzgeld_warnungen}
        
        <h3>⚠️ Technische Anomalien</h3>
        {automaten_status_technische_anomalien}
        
        <div class="summary-box">
            <p><strong>Gesamt Alerts:</strong> {automaten_alerts_total}</p>
            <p><strong>Betroffene Automaten:</strong> {automaten_betroffene}</p>
            <p><strong>Kritische Alerts:</strong> {automaten_kritische_alerts}</p>
        </div>
    </div>
    
    <!-- Bestände & Logistik -->
    <div class="section">
        <h2 class="section-title">📦 Bestände & Logistik</h2>
        
        <h3>🔴 Niedrige Lagerbestände</h3>
        {niedriger_lagerbestand}
        
        <h3>🛒 Nachzubestellende Artikel</h3>
        {nachzubestellende_artikel}
        
        <div class="summary-box">
            {bestaende_zusammenfassung}
        </div>
    </div>
    
    <!-- MHD-Alerts -->
    <div class="section">
        <h2 class="section-title">📅 MHD-Warnungen</h2>
        
        <h3>🚨 Kritisch (&lt; 5 Tage)</h3>
        {mhd_kritisch}
        
        <h3>⚠️ Bald abgelaufen (&lt; 14 Tage)</h3>
        {mhd_warnung}
        
        <div class="summary-box">
            {mhd_zusammenfassung}
        </div>
    </div>
    
    <!-- Wetter & Prognose -->
    <div class="section">
        <h2 class="section-title">🌤️ Wetter & Umsatzprognose</h2>
        <p>{weather_data}</p>
        <p>{umsatz_prognose}</p>
    </div>
    
    <!-- Zusammenfassung -->
    <div class="section">
        <h2 class="section-title">📊 Tages-Zusammenfassung</h2>
        <div class="summary-box">
            {tages_zusammenfassung}
        </div>
    </div>
    
    <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
        <p><strong>Mit freundlichen Grüßen</strong><br>
        Ihr automatisches Proviantomat-System</p>
        <p style="color: #6c757d; font-size: 12px;">
            📧 Automatisch generiert am {timestamp}<br>
            🔄 Nächster Bericht: Morgen um {next_report_time}
        </p>
    </div>
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

  // Lade Preview-Daten für Enhanced Templates
  const { data: dailyReportPreview, isLoading: previewLoading } = useQuery<EnhancedDailyReportData>({
    queryKey: ['/api/email/daily/preview'],
    enabled: true,
    refetchInterval: 60000 // Alle 60 Sekunden aktualisieren
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
        htmlTemplate: newTemplate.htmlTemplate,
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
    if (!newTemplate.name || !newTemplate.subjectTemplate || !newTemplate.htmlTemplate) {
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
                      value={newTemplate.htmlTemplate}
                      onChange={(e) => setNewTemplate({ ...newTemplate, htmlTemplate: e.target.value })}
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

      {/* Enhanced Template Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Live-Vorschau Enhanced Template
          </CardTitle>
          <CardDescription>
            Erweiterte Vorschau mit aktuellen Daten für die neuen Template-Bereiche
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-sm text-muted-foreground">Lade Enhanced Preview...</div>
            </div>
          ) : dailyReportPreview ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Enhanced Bestellungen Preview */}
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4 text-blue-500" />
                  Erweiterte Bestellungen Template-Vorschau
                </h3>
                
                {dailyReportPreview.sections.erweiterte_bestellungen && (
                  <div className="space-y-3 border rounded p-3 bg-blue-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Bestellungen & Lieferungen</span>
                      <Badge variant={dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.kritische_verspätungen > 0 ? "destructive" : "secondary"}>
                        {dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_ausstehend}
                      </Badge>
                    </div>

                    {/* Heute erwartete Lieferungen Preview */}
                    {dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Heute erwartet ({dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.length})
                        </div>
                        {dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.slice(0, 2).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs bg-white p-2 rounded border-l-2 border-green-500">
                            <div className="flex justify-between">
                              <span className="font-medium">{delivery.bestellnummer}</span>
                              <span className={`px-2 py-1 rounded text-xs ${getStatusColor(delivery.status)}`}>
                                {delivery.status}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{delivery.lieferant}</span>
                              <span>{formatCurrency(delivery.gesamtwert)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Verspätete Lieferungen Preview */}
                    {dailyReportPreview.sections.erweiterte_bestellungen.verspätet.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Verspätet ({dailyReportPreview.sections.erweiterte_bestellungen.verspätet.length})
                        </div>
                        {dailyReportPreview.sections.erweiterte_bestellungen.verspätet.slice(0, 1).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs bg-white p-2 rounded border-l-2 border-red-500">
                            <div className="flex justify-between">
                              <span className="font-medium">{delivery.bestellnummer}</span>
                              <span className="text-red-600 font-medium">{delivery.verspätung_tage} Tage</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Separator />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Template-Platzhalter:</span>
                        <code className="text-xs bg-gray-100 px-1 rounded">&#123;erweiterte_bestellungen_*&#125;</code>
                      </div>
                      <div className="flex justify-between">
                        <span>Ausstehend:</span>
                        <span>{dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_ausstehend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gesamtwert:</span>
                        <span>{formatCurrency(dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_wert_ausstehend)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Enhanced Automaten-Status Preview */}
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-orange-500" />
                  Automaten-Status Template-Vorschau
                </h3>
                
                {dailyReportPreview.sections.automaten_status && (
                  <div className="space-y-3 border rounded p-3 bg-orange-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Automaten-Status & Alerts</span>
                      <Badge variant={dailyReportPreview.sections.automaten_status.zusammenfassung.kritische_alerts > 0 ? "destructive" : "secondary"}>
                        {dailyReportPreview.sections.automaten_status.zusammenfassung.total_alerts}
                      </Badge>
                    </div>

                    {/* Hoher Geldbestand Preview */}
                    {dailyReportPreview.sections.automaten_status.hoher_geldbestand.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-yellow-600 flex items-center gap-1">
                          <Euro className="h-3 w-3" />
                          Hoher Geldbestand ({dailyReportPreview.sections.automaten_status.hoher_geldbestand.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.hoher_geldbestand.slice(0, 2).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs bg-white p-2 rounded border-l-2 border-yellow-500">
                            <div className="flex justify-between">
                              <span className="font-medium">{alert.automat}</span>
                              <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {alert.wert && alert.einheit && `${alert.wert} ${alert.einheit}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Technische Anomalien Preview */}
                    {dailyReportPreview.sections.automaten_status.technische_anomalien.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Technische Anomalien ({dailyReportPreview.sections.automaten_status.technische_anomalien.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.technische_anomalien.slice(0, 1).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs bg-white p-2 rounded border-l-2 border-red-500">
                            <div className="flex justify-between">
                              <span className="font-medium">{alert.automat}</span>
                              <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{alert.meldung}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Münzgeld Warnungen Preview */}
                    {dailyReportPreview.sections.automaten_status.münzgeld_warnungen.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-orange-600 flex items-center gap-1">
                          <Coins className="h-3 w-3" />
                          Münzgeld-Warnungen ({dailyReportPreview.sections.automaten_status.münzgeld_warnungen.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.münzgeld_warnungen.slice(0, 1).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs bg-white p-2 rounded border-l-2 border-orange-500">
                            <div className="flex justify-between">
                              <span className="font-medium">{alert.automat}</span>
                              <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Separator />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Template-Platzhalter:</span>
                        <code className="text-xs bg-gray-100 px-1 rounded">&#123;automaten_status_*&#125;</code>
                      </div>
                      <div className="flex justify-between">
                        <span>Gesamt Alerts:</span>
                        <span>{dailyReportPreview.sections.automaten_status.zusammenfassung.total_alerts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Betroffene Automaten:</span>
                        <span>{dailyReportPreview.sections.automaten_status.zusammenfassung.betroffene_automaten}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-8">
              Keine Enhanced Preview-Daten verfügbar
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
                  value={editingTemplate.htmlTemplate}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, htmlTemplate: e.target.value })}
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
                    srcDoc={previewTemplate.htmlTemplate}
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
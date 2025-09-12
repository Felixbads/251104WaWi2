import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { TestTube, Mail, Send, CheckCircle, AlertCircle, Eye, Truck, Wrench, Euro, Coins, Package, Calendar, BarChart3 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { 
  EnhancedDailyReportData,
  OrderDelivery,
  MachineStatusAlert,
  formatCurrency,
  formatDate,
  getSeverityColor,
  getStatusColor
} from '@/types/emailTypes';

interface TestEmailSenderProps {
  manual?: boolean;
}

export const TestEmailSender: React.FC<TestEmailSenderProps> = ({ manual = false }) => {
  const [testEmail, setTestEmail] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>();
  const { toast } = useToast();

  // Lade verfügbare Templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['/api/email/daily/templates'],
    select: (data: any) => data?.data || [],
  });

  // Lade Preview-Daten für täglichen E-Mail-Bericht
  const { data: dailyReportPreview, isLoading: previewLoading } = useQuery<EnhancedDailyReportData>({
    queryKey: ['/api/email/daily/preview'],
    enabled: true,
    refetchInterval: 60000 // Alle 60 Sekunden aktualisieren
  });

  // Sende Test-E-Mail
  const sendTestEmailMutation = useMutation({
    mutationFn: async ({ recipientEmail, templateId }: { recipientEmail: string; templateId?: number }) => {
      const response = await fetch('/api/email/daily/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail,
          templateId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler beim Senden der Test-E-Mail');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test-E-Mail gesendet",
        description: `Test-E-Mail wurde erfolgreich an ${testEmail} gesendet.`,
      });
      if (!manual) {
        setTestEmail('');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sende manuelle tägliche E-Mail
  const sendManualEmailMutation = useMutation({
    mutationFn: async (date?: string) => {
      const response = await fetch('/api/email/daily/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: date || new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler beim Senden der E-Mail');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "E-Mail gesendet",
        description: `Tägliche E-Mail wurde erfolgreich an ${data.data?.emailsSent || 0} Empfänger gesendet.`,
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

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: "E-Mail-Adresse erforderlich",
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
        variant: "destructive",
      });
      return;
    }

    await sendTestEmailMutation.mutateAsync({
      recipientEmail: testEmail,
      templateId: selectedTemplateId,
    });
  };

  const handleSendManualEmail = async () => {
    await sendManualEmailMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test/Manual Email Section */}
        <div>
          {manual ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Manuelle E-Mail-Benachrichtigung
                </CardTitle>
                <CardDescription>
                  Senden Sie eine tägliche E-Mail-Benachrichtigung manuell an alle konfigurierten Empfänger
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Diese Funktion sendet den aktuellen Tagesbericht an alle aktivierten E-Mail-Empfänger.
                    Stellen Sie sicher, dass Ihre E-Mail-Einstellungen korrekt konfiguriert sind.
                  </AlertDescription>
                </Alert>
                
                <div className="flex justify-center">
                  <Button
                    onClick={handleSendManualEmail}
                    disabled={sendManualEmailMutation.isPending}
                    size="lg"
                    className="flex items-center gap-2"
                    data-testid="button-send-manual-email"
                  >
                    <Send className="h-4 w-4" />
                    {sendManualEmailMutation.isPending ? 'Sende E-Mail...' : 'Tägliche E-Mail jetzt senden'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TestTube className="h-5 w-5" />
                  Test-E-Mail senden
                </CardTitle>
                <CardDescription>
                  Senden Sie eine Test-E-Mail, um Ihre Konfiguration zu überprüfen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Test-E-Mails verwenden Beispieldaten und werden nur an die angegebene E-Mail-Adresse gesendet.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="test-email">E-Mail-Adresse für Test</Label>
                    <Input
                      id="test-email"
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      data-testid="input-test-email"
                    />
                  </div>

                  {templates.length > 0 && (
                    <div>
                      <Label htmlFor="template-select">E-Mail-Vorlage (optional)</Label>
                      <select
                        id="template-select"
                        value={selectedTemplateId || ''}
                        onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md"
                        data-testid="select-template"
                      >
                        <option value="">Standard-Vorlage verwenden</option>
                        {templates.map((template: any) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendTestEmail}
                      disabled={sendTestEmailMutation.isPending || !testEmail}
                      className="flex items-center gap-2"
                      data-testid="button-send-test-email"
                    >
                      <Send className="h-4 w-4" />
                      {sendTestEmailMutation.isPending ? 'Sende Test-E-Mail...' : 'Test-E-Mail senden'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Enhanced Live Preview Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Live-Vorschau Tagesbericht
            </CardTitle>
            <CardDescription>
              Aktueller Inhalt des täglichen E-Mail-Berichts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-muted-foreground">Lade Bericht-Vorschau...</div>
              </div>
            ) : dailyReportPreview ? (
              <div className="space-y-4">
                {/* Berichts-Header */}
                <div className="border-b pb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{dailyReportPreview.betreff}</span>
                    <Badge variant="outline">{formatDate(dailyReportPreview.date)}</Badge>
                  </div>
                </div>

                {/* Verkäufe Section */}
                {dailyReportPreview.sections.verkäufe && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">Verkäufe</span>
                      <Badge variant="secondary">{dailyReportPreview.sections.verkäufe.anzahl_verkäufe}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 ml-6">
                      <div className="flex justify-between">
                        <span>Umsatz gesamt</span>
                        <span>{formatCurrency(dailyReportPreview.sections.verkäufe.umsatzsumme)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Verkäufe</span>
                        <span>{dailyReportPreview.sections.verkäufe.anzahl_verkäufe}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                {/* ENHANCED: Erweiterte Bestellungen */}
                {dailyReportPreview.sections.erweiterte_bestellungen && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Bestellungen & Lieferungen</span>
                      <Badge variant={dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.kritische_verspätungen > 0 ? "destructive" : "secondary"}>
                        {dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_ausstehend}
                      </Badge>
                    </div>

                    {/* Heute erwartete Lieferungen */}
                    {dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.length > 0 && (
                      <div className="space-y-1 ml-6">
                        <div className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Heute erwartet ({dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.length})
                        </div>
                        {dailyReportPreview.sections.erweiterte_bestellungen.heute_erwartet.slice(0, 2).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{delivery.bestellnummer}</span>
                              <span className={`px-1 rounded text-xs ${getStatusColor(delivery.status)}`}>
                                {delivery.status}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>{delivery.lieferant}</span>
                              <span>{formatCurrency(delivery.gesamtwert)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Verspätete Lieferungen */}
                    {dailyReportPreview.sections.erweiterte_bestellungen.verspätet.length > 0 && (
                      <div className="space-y-1 ml-6">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Verspätet ({dailyReportPreview.sections.erweiterte_bestellungen.verspätet.length})
                        </div>
                        {dailyReportPreview.sections.erweiterte_bestellungen.verspätet.slice(0, 2).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{delivery.bestellnummer}</span>
                              <span className="text-red-600">{delivery.verspätung_tage} Tage</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Zusammenfassung */}
                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2 ml-6">
                      <div className="flex justify-between">
                        <span>Ausstehende Bestellungen</span>
                        <span>{dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_ausstehend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gesamtwert</span>
                        <span>{formatCurrency(dailyReportPreview.sections.erweiterte_bestellungen.zusammenfassung.total_wert_ausstehend)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                {/* ENHANCED: Automaten-Status */}
                {dailyReportPreview.sections.automaten_status && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">Automaten-Status</span>
                      <Badge variant={dailyReportPreview.sections.automaten_status.zusammenfassung.kritische_alerts > 0 ? "destructive" : "secondary"}>
                        {dailyReportPreview.sections.automaten_status.zusammenfassung.total_alerts}
                      </Badge>
                    </div>

                    {/* Hoher Geldbestand */}
                    {dailyReportPreview.sections.automaten_status.hoher_geldbestand.length > 0 && (
                      <div className="space-y-1 ml-6">
                        <div className="text-xs font-medium text-yellow-600 flex items-center gap-1">
                          <Euro className="h-3 w-3" />
                          Hoher Geldbestand ({dailyReportPreview.sections.automaten_status.hoher_geldbestand.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.hoher_geldbestand.slice(0, 2).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{alert.automat}</span>
                              <span className={`px-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Münzgeld Warnungen */}
                    {dailyReportPreview.sections.automaten_status.münzgeld_warnungen.length > 0 && (
                      <div className="space-y-1 ml-6">
                        <div className="text-xs font-medium text-orange-600 flex items-center gap-1">
                          <Coins className="h-3 w-3" />
                          Münzgeld-Warnungen ({dailyReportPreview.sections.automaten_status.münzgeld_warnungen.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.münzgeld_warnungen.slice(0, 2).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{alert.automat}</span>
                              <span className={`px-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Technische Anomalien */}
                    {dailyReportPreview.sections.automaten_status.technische_anomalien.length > 0 && (
                      <div className="space-y-1 ml-6">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Technische Anomalien ({dailyReportPreview.sections.automaten_status.technische_anomalien.length})
                        </div>
                        {dailyReportPreview.sections.automaten_status.technische_anomalien.slice(0, 1).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{alert.automat}</span>
                              <span className={`px-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                            <div className="text-xs truncate">{alert.meldung}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Zusammenfassung */}
                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2 ml-6">
                      <div className="flex justify-between">
                        <span>Gesamt Alerts</span>
                        <span>{dailyReportPreview.sections.automaten_status.zusammenfassung.total_alerts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Betroffene Automaten</span>
                        <span>{dailyReportPreview.sections.automaten_status.zusammenfassung.betroffene_automaten}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Bestände & Logistik */}
                {dailyReportPreview.sections.bestände_logistik && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-sm">Bestände & Logistik</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 ml-6">
                      {dailyReportPreview.sections.bestände_logistik.niedriger_lagerbestand.length > 0 && (
                        <div className="flex justify-between">
                          <span>Niedrige Bestände</span>
                          <span>{dailyReportPreview.sections.bestände_logistik.niedriger_lagerbestand.length}</span>
                        </div>
                      )}
                      {dailyReportPreview.sections.bestände_logistik.nachzubestellende_artikel.length > 0 && (
                        <div className="flex justify-between">
                          <span>Nachbestellungen</span>
                          <span>{dailyReportPreview.sections.bestände_logistik.nachzubestellende_artikel.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MHD Alerts */}
                {dailyReportPreview.sections.bestände_logistik?.nahendes_mhd && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">MHD-Warnungen</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 ml-6">
                      <div className="flex justify-between">
                        <span>&lt; 5 Tage</span>
                        <span>{dailyReportPreview.sections.bestände_logistik.nahendes_mhd.lager["<5"].length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>&lt; 14 Tage</span>
                        <span>{dailyReportPreview.sections.bestände_logistik.nahendes_mhd.lager["<14"].length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                Keine Vorschau-Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, Clock, AlertTriangle, Package, TrendingDown, Calendar, CreditCard, Trash2, Coins, Wine, Thermometer, BarChart3, Euro, TrendingUp, Truck, Wrench, AlertCircle, CheckCircle } from "lucide-react";
import { 
  EnhancedPreviewData, 
  OrderDelivery, 
  MachineStatusAlert,
  formatCurrency, 
  formatDate, 
  getSeverityColor, 
  getStatusColor 
} from "@/types/emailTypes";

interface EmailNotificationSettings {
  id?: number;
  emailAddress: string;
  isActive: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  sendOnWeekdays: string[];
  includeMhdAlerts: boolean;
  includeStockAlerts: boolean;
  includeOrderAlerts: boolean;
  includeDeliveryAlerts: boolean;
  includePerformanceAlerts: boolean;
  sendTime: string;
}

// Using EnhancedPreviewData interface from types
// Legacy PreviewData is now part of EnhancedPreviewData for backward compatibility

interface EmailNotificationsSettingsProps {
  showHeader?: boolean;
}

export default function EmailNotificationsSettings({ showHeader = false }: EmailNotificationsSettingsProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<EmailNotificationSettings>({
    emailAddress: '',
    isActive: true,
    frequency: 'daily',
    sendOnWeekdays: ['1', '2', '3', '4', '5'], // Mo-Fr
    includeMhdAlerts: true,
    includeStockAlerts: true,
    includeOrderAlerts: true,
    includeDeliveryAlerts: true,
    includePerformanceAlerts: false,
    sendTime: '06:00'
  });

  // Aktuelle E-Mail-Einstellungen laden
  const { data: currentSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/email-notifications/settings'],
    enabled: true
  });

  // Live-Preview Daten laden
  const { data: previewData, isLoading: previewLoading } = useQuery<EnhancedPreviewData>({
    queryKey: ['/api/email-notifications/preview'],
    enabled: true,
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren
  });

  // Einstellungen speichern
  const saveSettings = useMutation({
    mutationFn: async (data: EmailNotificationSettings) => {
      const response = await fetch('/api/email-notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Fehler beim Speichern');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Einstellungen gespeichert",
        description: "Die E-Mail-Benachrichtigungen wurden erfolgreich konfiguriert."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email-notifications/settings'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Test-E-Mail senden
  const sendTestEmail = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/email-notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Fehler beim Test-Versand');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test-E-Mail gesendet",
        description: `Eine Test-E-Mail wurde an ${settings.emailAddress} gesendet.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Test fehlgeschlagen",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings(prev => ({
        ...prev,
        ...currentSettings,
        sendOnWeekdays: (currentSettings as any).sendOnWeekdays || prev.sendOnWeekdays || []
      }));
    }
  }, [currentSettings]);

  const weekdays = [
    { value: '1', label: 'Montag' },
    { value: '2', label: 'Dienstag' },
    { value: '3', label: 'Mittwoch' },
    { value: '4', label: 'Donnerstag' },
    { value: '5', label: 'Freitag' },
    { value: '6', label: 'Samstag' },
    { value: '0', label: 'Sonntag' }
  ];

  const handleWeekdayChange = (day: string, checked: boolean) => {
    if (checked) {
      setSettings(prev => ({
        ...prev,
        sendOnWeekdays: [...prev.sendOnWeekdays, day]
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        sendOnWeekdays: prev.sendOnWeekdays.filter(d => d !== day)
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.emailAddress) {
      toast({
        title: "E-Mail-Adresse erforderlich",
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
        variant: "destructive"
      });
      return;
    }
    saveSettings.mutate(settings);
  };

  if (settingsLoading) {
    return <div className="flex items-center justify-center h-96">Lade Einstellungen...</div>;
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center gap-2 mb-6">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold">E-Mail-Benachrichtigungen</h1>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Konfiguration */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Benachrichtigungs-Einstellungen</CardTitle>
            <CardDescription>
              Konfigurieren Sie Ihre automatischen E-Mail-Benachrichtigungen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* E-Mail-Adresse */}
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail-Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ihre.email@beispiel.de"
                  value={settings.emailAddress}
                  onChange={(e) => setSettings(prev => ({ ...prev, emailAddress: e.target.value }))}
                  required
                  data-testid="input-email-address"
                />
              </div>

              {/* Aktiv/Inaktiv */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={settings.isActive}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, isActive: checked }))}
                  data-testid="switch-email-active"
                />
                <Label htmlFor="active">Benachrichtigungen aktiviert</Label>
              </div>

              {/* Häufigkeit */}
              <div className="space-y-2">
                <Label>Häufigkeit</Label>
                <Select 
                  value={settings.frequency} 
                  onValueChange={(value: 'daily' | 'weekly' | 'monthly') => 
                    setSettings(prev => ({ ...prev, frequency: value }))
                  }
                >
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Täglich</SelectItem>
                    <SelectItem value="weekly">Wöchentlich</SelectItem>
                    <SelectItem value="monthly">Monatlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Versandzeit */}
              <div className="space-y-2">
                <Label htmlFor="sendTime">Versandzeit</Label>
                <Input
                  id="sendTime"
                  type="time"
                  value={settings.sendTime}
                  onChange={(e) => setSettings(prev => ({ ...prev, sendTime: e.target.value }))}
                  data-testid="input-send-time"
                />
              </div>

              {/* Wochentage (nur bei täglich/wöchentlich) */}
              {(settings.frequency === 'daily' || settings.frequency === 'weekly') && (
                <div className="space-y-2">
                  <Label>Versandtage</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {weekdays.map(day => (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day-${day.value}`}
                          checked={settings.sendOnWeekdays.includes(day.value)}
                          onCheckedChange={(checked) => handleWeekdayChange(day.value, !!checked)}
                          data-testid={`checkbox-weekday-${day.value}`}
                        />
                        <Label htmlFor={`day-${day.value}`} className="text-sm">
                          {day.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Benachrichtigungstypen */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Benachrichtigungsinhalte</Label>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mhdAlerts"
                      checked={settings.includeMhdAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeMhdAlerts: !!checked }))}
                      data-testid="checkbox-mhd-alerts"
                    />
                    <Label htmlFor="mhdAlerts" className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      MHD-Warnungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="stockAlerts"
                      checked={settings.includeStockAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeStockAlerts: !!checked }))}
                      data-testid="checkbox-stock-alerts"
                    />
                    <Label htmlFor="stockAlerts" className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-red-500" />
                      Lagerbestand-Warnungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orderAlerts"
                      checked={settings.includeOrderAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeOrderAlerts: !!checked }))}
                      data-testid="checkbox-order-alerts"
                    />
                    <Label htmlFor="orderAlerts" className="text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-500" />
                      Bestellungen & Lieferungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="deliveryAlerts"
                      checked={settings.includeDeliveryAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeDeliveryAlerts: !!checked }))}
                      data-testid="checkbox-delivery-alerts"
                    />
                    <Label htmlFor="deliveryAlerts" className="text-sm flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-green-500" />
                      Lieferbestätigungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="performanceAlerts"
                      checked={settings.includePerformanceAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includePerformanceAlerts: !!checked }))}
                      data-testid="checkbox-performance-alerts"
                    />
                    <Label htmlFor="performanceAlerts" className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      Performance-Kennzahlen
                    </Label>
                  </div>
                </div>
              </div>

              {/* Aktionen */}
              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={saveSettings.isPending}
                  className="w-full"
                  data-testid="button-save-settings"
                >
                  {saveSettings.isPending ? 'Speichert...' : 'Einstellungen speichern'}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => sendTestEmail.mutate()}
                  disabled={sendTestEmail.isPending || !settings.emailAddress}
                  className="w-full"
                  data-testid="button-send-test-email"
                >
                  {sendTestEmail.isPending ? 'Sendet...' : 'Test-E-Mail senden'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Live-Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Live-Vorschau</CardTitle>
            <CardDescription>
              Aktuelle Daten, die in der nächsten E-Mail enthalten wären
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-muted-foreground">Lade Vorschau...</div>
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                {/* MHD-Warnungen */}
                {settings.includeMhdAlerts && previewData.mhdAlerts && previewData.mhdAlerts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">MHD-Warnungen</span>
                      <Badge variant="destructive">{previewData.mhdAlerts.length}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {previewData.mhdAlerts.slice(0, 3).map((alert, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{alert.productName}</span>
                          <span>{alert.daysUntilExpiry} Tage</span>
                        </div>
                      ))}
                      {previewData.mhdAlerts.length > 3 && (
                        <div className="text-xs">... und {previewData.mhdAlerts.length - 3} weitere</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lagerbestand-Warnungen */}
                {settings.includeStockAlerts && previewData.stockAlerts && previewData.stockAlerts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-sm">Niedrige Bestände</span>
                      <Badge variant="destructive">{previewData.stockAlerts.length}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {previewData.stockAlerts.slice(0, 3).map((alert, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{alert.productName}</span>
                          <span>{alert.currentStock}/{alert.minimumStock}</span>
                        </div>
                      ))}
                      {previewData.stockAlerts.length > 3 && (
                        <div className="text-xs">... und {previewData.stockAlerts.length - 3} weitere</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Offene Bestellungen */}
                {settings.includeOrderAlerts && previewData.pendingOrders && previewData.pendingOrders.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Offene Bestellungen</span>
                      <Badge variant="secondary">{previewData.pendingOrders.length}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {previewData.pendingOrders.slice(0, 3).map((order, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{order.orderNumber}</span>
                          <span>{order.totalAmount.toFixed(2)}€</span>
                        </div>
                      ))}
                      {previewData.pendingOrders.length > 3 && (
                        <div className="text-xs">... und {previewData.pendingOrders.length - 3} weitere</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Performance-Kennzahlen */}
                {settings.includePerformanceAlerts && previewData.performanceMetrics && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-sm">Performance</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Gesamtumsatz</span>
                        <span>{formatCurrency(previewData.performanceMetrics.totalRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ø Tagesumsatz</span>
                        <span>{formatCurrency(previewData.performanceMetrics.averageDailySales)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ENHANCED: Erweiterte Bestellungen */}
                {settings.includeOrderAlerts && previewData.erweiterte_bestellungen && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Erweiterte Bestellübersicht</span>
                      <Badge variant="secondary">
                        {previewData.erweiterte_bestellungen.zusammenfassung.total_ausstehend}
                      </Badge>
                    </div>

                    {/* Heute erwartete Lieferungen */}
                    {previewData.erweiterte_bestellungen.heute_erwartet.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Heute erwartet ({previewData.erweiterte_bestellungen.heute_erwartet.length})
                        </div>
                        {previewData.erweiterte_bestellungen.heute_erwartet.slice(0, 2).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{delivery.bestellnummer}</span>
                              <span className={`px-1 rounded text-xs ${getStatusColor(delivery.status)}`}>
                                {delivery.status}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>{delivery.lieferant}</span>
                              <span>{formatCurrency(delivery.gesamtwert)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Verspätete Lieferungen */}
                    {previewData.erweiterte_bestellungen.verspätet.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Verspätet ({previewData.erweiterte_bestellungen.verspätet.length})
                        </div>
                        {previewData.erweiterte_bestellungen.verspätet.slice(0, 2).map((delivery: OrderDelivery, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{delivery.bestellnummer}</span>
                              <span className="text-red-600">{delivery.verspätung_tage} Tage</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>{delivery.lieferant}</span>
                              <span>{formatCurrency(delivery.gesamtwert)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Zusammenfassung */}
                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                      <div className="flex justify-between">
                        <span>Ausstehende Bestellungen</span>
                        <span>{previewData.erweiterte_bestellungen.zusammenfassung.total_ausstehend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gesamtwert ausstehend</span>
                        <span>{formatCurrency(previewData.erweiterte_bestellungen.zusammenfassung.total_wert_ausstehend)}</span>
                      </div>
                      {previewData.erweiterte_bestellungen.zusammenfassung.kritische_verspätungen > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Kritische Verspätungen</span>
                          <span>{previewData.erweiterte_bestellungen.zusammenfassung.kritische_verspätungen}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ENHANCED: Automaten-Status */}
                {settings.includePerformanceAlerts && previewData.automaten_status && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">Automaten-Status</span>
                      <Badge variant={previewData.automaten_status.zusammenfassung.kritische_alerts > 0 ? "destructive" : "secondary"}>
                        {previewData.automaten_status.zusammenfassung.total_alerts}
                      </Badge>
                    </div>

                    {/* Hoher Geldbestand */}
                    {previewData.automaten_status.hoher_geldbestand.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-yellow-600 flex items-center gap-1">
                          <Euro className="h-3 w-3" />
                          Hoher Geldbestand ({previewData.automaten_status.hoher_geldbestand.length})
                        </div>
                        {previewData.automaten_status.hoher_geldbestand.slice(0, 2).map((alert: MachineStatusAlert, index) => (
                          <div key={index} className="text-xs text-muted-foreground ml-4">
                            <div className="flex justify-between">
                              <span>{alert.automat}</span>
                              <span className={`px-1 rounded text-xs ${getSeverityColor(alert.schweregrad)}`}>
                                {alert.schweregrad}
                              </span>
                            </div>
                            <div className="text-xs">
                              {alert.wert && alert.einheit && `${alert.wert} ${alert.einheit}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Technische Anomalien */}
                    {previewData.automaten_status.technische_anomalien.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Technische Anomalien ({previewData.automaten_status.technische_anomalien.length})
                        </div>
                        {previewData.automaten_status.technische_anomalien.slice(0, 2).map((alert: MachineStatusAlert, index) => (
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

                    {/* Münzgeld Warnungen */}
                    {previewData.automaten_status.münzgeld_warnungen.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-orange-600 flex items-center gap-1">
                          <Coins className="h-3 w-3" />
                          Münzgeld-Warnungen ({previewData.automaten_status.münzgeld_warnungen.length})
                        </div>
                        {previewData.automaten_status.münzgeld_warnungen.slice(0, 2).map((alert: MachineStatusAlert, index) => (
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

                    {/* Zusammenfassung */}
                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                      <div className="flex justify-between">
                        <span>Gesamt Alerts</span>
                        <span>{previewData.automaten_status.zusammenfassung.total_alerts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Betroffene Automaten</span>
                        <span>{previewData.automaten_status.zusammenfassung.betroffene_automaten}</span>
                      </div>
                      {previewData.automaten_status.zusammenfassung.kritische_alerts > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Kritische Alerts</span>
                          <span>{previewData.automaten_status.zusammenfassung.kritische_alerts}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Keine Daten verfügbar */}
                {(!previewData.mhdAlerts || previewData.mhdAlerts.length === 0) &&
                 (!previewData.stockAlerts || previewData.stockAlerts.length === 0) &&
                 (!previewData.pendingOrders || previewData.pendingOrders.length === 0) && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Keine aktuellen Warnungen oder Benachrichtigungen
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
}
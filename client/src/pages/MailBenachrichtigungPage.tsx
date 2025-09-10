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
import { Mail, Clock, AlertTriangle, Package, TrendingDown, Calendar, CreditCard, Trash2, Coins, Wine, Thermometer, BarChart3, Euro, TrendingUp } from "lucide-react";

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

interface PreviewData {
  mhdAlerts: Array<{
    productName: string;
    expiryDate: string;
    daysUntilExpiry: number;
    quantity: number;
    location: string;
  }>;
  stockAlerts: Array<{
    productName: string;
    currentStock: number;
    minimumStock: number;
    location: string;
  }>;
  pendingOrders: Array<{
    orderNumber: string;
    supplierName: string;
    expectedDelivery: string;
    totalAmount: number;
  }>;
  recentDeliveries: Array<{
    orderNumber: string;
    supplierName: string;
    deliveredDate: string;
    products: string[];
  }>;
  performanceMetrics: {
    totalRevenue: number;
    topPerformingMachine: string;
    lowPerformingMachines: string[];
    averageDailySales: number;
  };
  // Neue Standort-Warnungen
  highCashAlerts?: Array<{
    machineName: string;
    cashAmount: number;
    threshold: number;
  }>;
  overdueCollections?: Array<{
    machineName: string;
    daysOverdue: number;
    lastCollection: string;
  }>;
  machineWarnings?: Array<{
    machineName: string;
    warningMessage: string;
    warningType: string;
  }>;
  // Zusätzliche Warnungstypen
  lowCoinAlerts?: Array<{
    machineName: string;
    lowCoinTubes: number;
    lastMaintenance: string;
  }>;
  alcoholSalesAlerts?: Array<{
    machineName: string;
    daysSinceLastSale: number;
    lastAlcoholProduct: string;
  }>;
  temperatureAlerts?: Array<{
    machineName: string;
    currentTemp: number;
    optimalRange: string;
    status: string;
  }>;
  // 🆕 Standort Status KPIs
  standortStatus?: {
    lowStockLocations: Array<{
      locationName: string;
      lowStockProducts: number;
      totalProducts: number;
      stockPercentage: string;
    }>;
    highCashLocations: Array<{
      locationName: string;
      cashAmount: string;
      lastEmptied: string;
      riskLevel: string;
    }>;
    mhdStatusOverview: Array<{
      locationName: string;
      criticalMhds: number;
      nearExpiryValue: string;
      nextExpiryDate: string;
    }>;
    sales24hOverview: Array<{
      locationName: string;
      sales24h: string;
      transactionCount: number;
      avgTransactionValue: string;
      trend: string;
    }>;
  };
}

export default function MailBenachrichtigungPage() {
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
  const { data: previewData, isLoading: previewLoading } = useQuery<PreviewData>({
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
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Mail className="h-6 w-6" />
        <h1 className="text-2xl font-bold">E-Mail-Benachrichtigungen</h1>
      </div>

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
                />
              </div>

              {/* Aktiv/Inaktiv */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={settings.isActive}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, isActive: checked }))}
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
                  <SelectTrigger>
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

              {/* Inhalte */}
              <div className="space-y-4">
                <Label className="text-base font-medium">E-Mail-Inhalte</Label>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mhd"
                      checked={settings.includeMhdAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeMhdAlerts: !!checked }))}
                    />
                    <Label htmlFor="mhd" className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      MHD-Warnungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="stock"
                      checked={settings.includeStockAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeStockAlerts: !!checked }))}
                    />
                    <Label htmlFor="stock" className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      Lagerbestands-Warnungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orders"
                      checked={settings.includeOrderAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeOrderAlerts: !!checked }))}
                    />
                    <Label htmlFor="orders" className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-green-500" />
                      Offene Bestellungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="deliveries"
                      checked={settings.includeDeliveryAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeDeliveryAlerts: !!checked }))}
                    />
                    <Label htmlFor="deliveries" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-purple-500" />
                      Kürzliche Lieferungen
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="performance"
                      checked={settings.includePerformanceAlerts}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includePerformanceAlerts: !!checked }))}
                    />
                    <Label htmlFor="performance" className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      Leistungs-Übersicht
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={saveSettings.isPending}
                  className="flex-1"
                >
                  {saveSettings.isPending ? 'Speichere...' : 'Einstellungen speichern'}
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => sendTestEmail.mutate()}
                  disabled={sendTestEmail.isPending || !settings.emailAddress}
                >
                  {sendTestEmail.isPending ? 'Sende...' : 'Test-E-Mail'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Live-Vorschau */}
        <Card>
          <CardHeader>
            <CardTitle>Live-Vorschau</CardTitle>
            <CardDescription>
              Aktuelle Daten, die in Ihren E-Mails enthalten wären
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="text-center py-8">Lade aktuelle Daten...</div>
            ) : (
              <div className="space-y-6">
                {/* MHD-Warnungen */}
                {settings.includeMhdAlerts && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <h3 className="font-medium">MHD-Warnungen</h3>
                      <Badge variant="outline">{previewData?.mhdAlerts?.length || 0}</Badge>
                    </div>
                    {previewData?.mhdAlerts?.length ? (
                      <div className="space-y-1 text-sm">
                        {previewData.mhdAlerts.slice(0, 3).map((alert, idx) => (
                          <div key={idx} className="p-2 bg-orange-50 rounded text-orange-800">
                            <strong>{alert.productName}</strong> - {alert.quantity}x 
                            <span className="ml-2 text-orange-600">
                              (läuft in {alert.daysUntilExpiry} Tagen ab)
                            </span>
                          </div>
                        ))}
                        {previewData.mhdAlerts.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            ...und {previewData.mhdAlerts.length - 3} weitere
                          </div>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>Keine MHD-Warnungen vorhanden</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Lagerbestands-Warnungen */}
                {settings.includeStockAlerts && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      <h3 className="font-medium">Niedrige Lagerbestände</h3>
                      <Badge variant="outline">{previewData?.stockAlerts?.length || 0}</Badge>
                    </div>
                    {previewData?.stockAlerts?.length ? (
                      <div className="space-y-1 text-sm">
                        {previewData.stockAlerts.slice(0, 3).map((alert, idx) => (
                          <div key={idx} className="p-2 bg-blue-50 rounded text-blue-800">
                            <strong>{alert.productName}</strong> - {alert.currentStock} / {alert.minimumStock}
                            <span className="ml-2 text-blue-600">({alert.location})</span>
                          </div>
                        ))}
                        {previewData.stockAlerts.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            ...und {previewData.stockAlerts.length - 3} weitere
                          </div>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>Alle Lagerbestände sind ausreichend</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Offene Bestellungen */}
                {settings.includeOrderAlerts && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-green-500" />
                      <h3 className="font-medium">Offene Bestellungen</h3>
                      <Badge variant="outline">{previewData?.pendingOrders?.length || 0}</Badge>
                    </div>
                    {previewData?.pendingOrders?.length ? (
                      <div className="space-y-1 text-sm">
                        {previewData.pendingOrders.slice(0, 3).map((order, idx) => (
                          <div key={idx} className="p-2 bg-green-50 rounded text-green-800">
                            <strong>{order.orderNumber}</strong> - {order.supplierName}
                            <span className="ml-2 text-green-600">
                              (erwartet: {new Date(order.expectedDelivery).toLocaleDateString('de-DE')})
                            </span>
                          </div>
                        ))}
                        {previewData.pendingOrders.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            ...und {previewData.pendingOrders.length - 3} weitere
                          </div>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>Keine offenen Bestellungen vorhanden</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Performance */}
                {settings.includePerformanceAlerts && previewData?.performanceMetrics && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <h3 className="font-medium">Leistungs-Übersicht</h3>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="p-2 bg-gray-50 rounded">
                        <strong>Gesamtumsatz:</strong> €{previewData.performanceMetrics.totalRevenue.toFixed(2)}
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <strong>Top-Automat:</strong> {previewData.performanceMetrics.topPerformingMachine}
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <strong>Ø Tagesumsatz:</strong> €{previewData.performanceMetrics.averageDailySales.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Standort-Warnungen (neu) */}
                {settings.includeDeliveryAlerts && (
                  <>
                    {/* Hohe Bargeldbestände */}
                    {previewData?.highCashAlerts?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-yellow-500" />
                          <h3 className="font-medium">Hohe Bargeldbestände</h3>
                          <Badge variant="outline">{previewData.highCashAlerts.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.highCashAlerts.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2 bg-yellow-50 rounded text-yellow-800">
                              <strong>{alert.machineName}</strong> - €{alert.cashAmount}
                              <span className="ml-2 text-yellow-600">(Schwelle: €{alert.threshold})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Überfällige Entleerungen */}
                    {previewData?.overdueCollections?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-red-500" />
                          <h3 className="font-medium">Überfällige Entleerungen</h3>
                          <Badge variant="outline">{previewData.overdueCollections.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.overdueCollections.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2 bg-red-50 rounded text-red-800">
                              <strong>{alert.machineName}</strong> - {alert.daysOverdue} Tage überfällig
                              <span className="ml-2 text-red-600">(letzte Entleerung vor {alert.daysOverdue} Tagen)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* System-Warnungen */}
                    {previewData?.machineWarnings?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <h3 className="font-medium">System-Warnungen</h3>
                          <Badge variant="outline">{previewData.machineWarnings.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.machineWarnings.slice(0, 3).map((warning, idx) => (
                            <div key={idx} className="p-2 bg-orange-50 rounded text-orange-800">
                              <strong>{warning.machineName}</strong> - {warning.warningMessage}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Münzröhren-Warnungen */}
                    {previewData?.lowCoinAlerts?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-amber-500" />
                          <h3 className="font-medium">Niedrige Münzbestände</h3>
                          <Badge variant="outline">{previewData.lowCoinAlerts.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.lowCoinAlerts.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2 bg-amber-50 rounded text-amber-800">
                              <strong>{alert.machineName}</strong> - {alert.lowCoinTubes} Münzröhre(n) fast leer
                              <span className="ml-2 text-amber-600">(letzte Wartung: {new Date(alert.lastMaintenance).toLocaleDateString('de-DE')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Alkoholverkaufs-Alerts */}
                    {previewData?.alcoholSalesAlerts?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Wine className="h-4 w-4 text-purple-500" />
                          <h3 className="font-medium">Alkoholverkauf-Probleme</h3>
                          <Badge variant="outline">{previewData.alcoholSalesAlerts.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.alcoholSalesAlerts.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2 bg-purple-50 rounded text-purple-800">
                              <strong>{alert.machineName}</strong> - Kein Alkohol seit {alert.daysSinceLastSale} Tagen
                              <span className="ml-2 text-purple-600">(letztes Produkt: {alert.lastAlcoholProduct})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Temperatur-Warnungen */}
                    {previewData?.temperatureAlerts?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Thermometer className="h-4 w-4 text-blue-500" />
                          <h3 className="font-medium">Temperatur-Probleme</h3>
                          <Badge variant="outline">{previewData.temperatureAlerts.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.temperatureAlerts.slice(0, 3).map((alert, idx) => (
                            <div key={idx} className="p-2 bg-blue-50 rounded text-blue-800">
                              <strong>{alert.machineName}</strong> - {alert.currentTemp}°C 
                              <span className="ml-2 text-blue-600">(optimal: {alert.optimalRange})</span>
                              <Badge variant={alert.status === 'TOO_WARM' ? 'destructive' : 'secondary'} className="ml-2 text-xs">
                                {alert.status === 'TOO_WARM' ? 'ZU WARM' : 'ZU KALT'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}

                {/* 🆕 Neue Standort Status KPIs */}
                {previewData?.standortStatus && (
                  <div className="space-y-4 p-4 border-2 border-green-200 rounded-lg bg-green-50">
                    <h3 className="text-lg font-semibold text-green-800 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      📊 Standort Status KPIs
                    </h3>

                    {/* Warenbestände unter 80% */}
                    {previewData.standortStatus.lowStockLocations?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-orange-500" />
                          <h4 className="font-medium">Warenbestände unter 80%</h4>
                          <Badge variant="outline">{previewData.standortStatus.lowStockLocations.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.standortStatus.lowStockLocations.slice(0, 3).map((location: any, idx: number) => (
                            <div key={idx} className="p-2 bg-orange-50 rounded text-orange-800">
                              <strong>{location.locationName}</strong> - {location.stockPercentage}% Bestand
                              <span className="ml-2 text-orange-600">
                                ({location.lowStockProducts} von {location.totalProducts} Produkten kritisch)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MHD Status Übersicht */}
                    {previewData.standortStatus.mhdStatusOverview?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-red-500" />
                          <h4 className="font-medium">MHD Status Übersicht</h4>
                          <Badge variant="outline">{previewData.standortStatus.mhdStatusOverview.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.standortStatus.mhdStatusOverview.map((status: any, idx: number) => (
                            <div key={idx} className="p-2 bg-red-50 rounded text-red-800">
                              <strong>{status.locationName}</strong> - {status.criticalMhds} kritische MHDs
                              <span className="ml-2 text-red-600">
                                (Wert: €{status.nearExpiryValue} - Nächstes Ablaufdatum: {status.nextExpiryDate})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hohe Geldbestände */}
                    {previewData.standortStatus.highCashLocations?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Euro className="h-4 w-4 text-yellow-500" />
                          <h4 className="font-medium">Hohe Geldbestände &gt;300€</h4>
                          <Badge variant="outline">{previewData.standortStatus.highCashLocations.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.standortStatus.highCashLocations.map((location: any, idx: number) => (
                            <div key={idx} className="p-2 bg-yellow-50 rounded text-yellow-800">
                              <strong>{location.locationName}</strong> - €{location.cashAmount}
                              <span className="ml-2 text-yellow-600">
                                (Risiko: {location.riskLevel} - Letzte Entleerung: {location.lastEmptied})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 24h Verkäufe */}
                    {previewData.standortStatus.sales24hOverview?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <h4 className="font-medium">24h Verkäufe</h4>
                          <Badge variant="outline">{previewData.standortStatus.sales24hOverview.length}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {previewData.standortStatus.sales24hOverview.map((sales: any, idx: number) => (
                            <div key={idx} className="p-2 bg-green-50 rounded text-green-800">
                              <strong>{sales.locationName}</strong> - €{sales.sales24h}
                              <span className="ml-2 text-green-600">
                                ({sales.transactionCount} Transaktionen, ⌀ €{sales.avgTransactionValue}, Trend: {sales.trend})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
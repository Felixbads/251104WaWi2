/**
 * ERWEITERTE KONFIGURATION FÜR WIEDERKEHRENDE BESTELLUNGEN
 * 
 * Dialog für die detaillierte Konfiguration von wiederkehrenden Bestellungen
 * mit Bestelltyp-Auswahl, Prognose-Integration und E-Mail-Einstellungen
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Mail, Calendar, Package, TrendingUp, Clock, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RecurringOrderConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringOrder?: any;
  suppliers: any[];
  warehouses: any[];
  onSave: (data: any) => void;
}

export default function RecurringOrderConfigDialog({
  open,
  onOpenChange,
  recurringOrder,
  suppliers,
  warehouses,
  onSave
}: RecurringOrderConfigDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    // Basis-Informationen
    name: '',
    description: '',
    supplierId: '',
    warehouseId: '',
    
    // Bestelltyp-Konfiguration
    orderType: 'shipping', // 'shipping' oder 'goods_receipt'
    
    // Intervall-Konfiguration
    interval: 'weekly',
    intervalValue: 1,
    weekday: 'monday',
    dayOfMonth: 1,
    startDate: '',
    endDate: '',
    
    // Lieferlogik
    deliveryType: 'delivery',
    deliveryLogic: 'fixed',
    deliveryOffsetDays: 0,
    deliveryLocation: '',
    
    // Prognose-Integration
    forecastEnabled: false,
    forecastPeriodDays: 14,
    
    // E-Mail-Benachrichtigungen
    emailNotifications: '',
    emailTemplate: '',
    
    // Weitere Einstellungen
    priority: 'normal',
    category: '',
    tags: '',
    requiresApproval: false,
    autoCreateInGoods: true,
    notes: ''
  });

  const [emailList, setEmailList] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (recurringOrder) {
      setFormData({
        ...recurringOrder,
        emailNotifications: recurringOrder.emailNotifications || '',
        tags: recurringOrder.tags || ''
      });
      
      // Parse E-Mail-Liste
      if (recurringOrder.emailNotifications) {
        try {
          const emails = JSON.parse(recurringOrder.emailNotifications);
          setEmailList(Array.isArray(emails) ? emails : []);
        } catch {
          setEmailList([]);
        }
      }
    } else {
      // Neue Bestellung - setze Standardwerte
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        startDate: today,
        nextExecutionDate: today
      }));
    }
  }, [recurringOrder]);

  const handleSave = () => {
    // Validierung
    if (!formData.name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für die wiederkehrende Bestellung ein.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.supplierId) {
      toast({
        title: "Fehler", 
        description: "Bitte wählen Sie einen Lieferanten aus.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.warehouseId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Lager aus.", 
        variant: "destructive"
      });
      return;
    }

    // Sicherstellen dass suppliers und warehouses Arrays sind
    const suppliersArray = Array.isArray(suppliers) ? suppliers : [];
    const warehousesArray = Array.isArray(warehouses) ? warehouses : [];

    console.log('Suppliers array:', suppliersArray);
    console.log('Warehouses array:', warehousesArray);
    console.log('Selected supplier ID:', formData.supplierId);
    console.log('Selected warehouse ID:', formData.warehouseId);

    // Bereite Daten für Speicherung vor
    const saveData = {
      ...formData,
      emailNotifications: emailList.length > 0 ? JSON.stringify(emailList) : null,
      tags: formData.tags || null,
      supplierId: parseInt(formData.supplierId),
      warehouseId: parseInt(formData.warehouseId),
      supplierName: suppliersArray.find(s => s.id === parseInt(formData.supplierId))?.name || '',
      warehouseName: warehousesArray.find(w => w.id === parseInt(formData.warehouseId))?.name || '',
      // Standardwerte für erforderliche Felder setzen
      orderType: formData.orderType || 'shipping',
      interval: formData.interval || 'weekly',
      intervalValue: formData.intervalValue || 1,
      isActive: formData.isActive !== undefined ? formData.isActive : true,
      priority: formData.priority || 'normal',
      forecastEnabled: formData.forecastEnabled || false
    };

    console.log('Saving data:', saveData);
    onSave(saveData);
  };

  const addEmail = () => {
    if (newEmail && !emailList.includes(newEmail)) {
      setEmailList(prev => [...prev, newEmail]);
      setNewEmail('');
    }
  };

  const removeEmail = (email: string) => {
    setEmailList(prev => prev.filter(e => e !== email));
  };

  // Debug-Informationen ausgeben
  console.log('RecurringOrderConfigDialog - Suppliers:', suppliers);
  console.log('RecurringOrderConfigDialog - Warehouses:', warehouses);
  console.log('RecurringOrderConfigDialog - suppliers length:', suppliers?.length);
  console.log('RecurringOrderConfigDialog - warehouses length:', warehouses?.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {recurringOrder ? 'Wiederkehrende Bestellung bearbeiten' : 'Neue wiederkehrende Bestellung'}
          </DialogTitle>
          <div className="text-sm text-gray-500">
            Debug: {suppliers?.length || 0} Lieferanten, {warehouses?.length || 0} Lager geladen
          </div>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Grundlagen</TabsTrigger>
            <TabsTrigger value="schedule">Zeitplan</TabsTrigger>
            <TabsTrigger value="delivery">Lieferung</TabsTrigger>
            <TabsTrigger value="automation">Automatisierung</TabsTrigger>
          </TabsList>

          {/* GRUNDLAGEN TAB */}
          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Basis-Informationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Name der wiederkehrenden Bestellung *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="z.B. Bäckerei Montag"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Beschreibung</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optionale Beschreibung..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier">Lieferant * ({suppliers?.length || 0} verfügbar)</Label>
                    <Select value={formData.supplierId} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, supplierId: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Lieferant auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(suppliers) && suppliers.length > 0 ? suppliers.map(supplier => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        )) : (
                          <SelectItem value="loading" disabled>Lädt Lieferanten...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="warehouse">Lager * ({warehouses?.length || 0} verfügbar)</Label>
                    <Select value={formData.warehouseId} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, warehouseId: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Lager auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(warehouses) && warehouses.length > 0 ? warehouses.map(warehouse => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            {warehouse.name}
                          </SelectItem>
                        )) : (
                          <SelectItem value="loading" disabled>Lädt Lager...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Bestelltyp-Konfiguration
                </CardTitle>
                <CardDescription>
                  Bestimmen Sie, ob dies eine Versandbestellung oder eine interne Wareneingangsbestellung ist
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Bestelltyp</Label>
                  <Select value={formData.orderType} onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, orderType: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shipping">
                        <div className="flex flex-col">
                          <span>Versandbestellung</span>
                          <span className="text-xs text-muted-foreground">
                            Wird per E-Mail an Lieferanten gesendet
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="goods_receipt">
                        <div className="flex flex-col">
                          <span>Wareneingangsbestellung</span>
                          <span className="text-xs text-muted-foreground">
                            Nur intern, direkt zum Wareneingang
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.orderType === 'shipping' && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Versandbestellung</span>
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      Bestellung wird als Entwurf erstellt und kann per E-Mail an den Lieferanten gesendet werden.
                    </p>
                  </div>
                )}

                {formData.orderType === 'goods_receipt' && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-900">Wareneingangsbestellung</span>
                    </div>
                    <p className="text-xs text-green-700 mt-1">
                      Bestellung wird direkt als Wareneingang erstellt - keine E-Mail an Lieferanten.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ZEITPLAN TAB */}
          <TabsContent value="schedule" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Wiederholungsintervall
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Intervall</Label>
                    <Select value={formData.interval} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, interval: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                        <SelectItem value="biweekly">Alle 2 Wochen</SelectItem>
                        <SelectItem value="triweekly">Alle 3 Wochen</SelectItem>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.interval === 'weekly' && (
                    <div>
                      <Label>Wochentag</Label>
                      <Select value={formData.weekday} onValueChange={(value) => 
                        setFormData(prev => ({ ...prev, weekday: value }))
                      }>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monday">Montag</SelectItem>
                          <SelectItem value="tuesday">Dienstag</SelectItem>
                          <SelectItem value="wednesday">Mittwoch</SelectItem>
                          <SelectItem value="thursday">Donnerstag</SelectItem>
                          <SelectItem value="friday">Freitag</SelectItem>
                          <SelectItem value="saturday">Samstag</SelectItem>
                          <SelectItem value="sunday">Sonntag</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {formData.interval === 'monthly' && (
                    <div>
                      <Label>Tag des Monats</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.dayOfMonth}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          dayOfMonth: parseInt(e.target.value) || 1 
                        }))}
                      />
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Startdatum</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="endDate">Enddatum (optional)</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LIEFERUNG TAB */}
          <TabsContent value="delivery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Lieferlogik
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Lieferart</Label>
                  <Select value={formData.deliveryType} onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, deliveryType: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">Lieferung</SelectItem>
                      <SelectItem value="pickup">Abholung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Liefertermin-Logik</Label>
                  <Select value={formData.deliveryLogic} onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, deliveryLogic: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">
                        <div className="flex flex-col">
                          <span>Feste Lieferwoche</span>
                          <span className="text-xs text-muted-foreground">
                            Lieferung in der Woche der Bestellung
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="days_after_order">
                        <div className="flex flex-col">
                          <span>X Tage nach Bestellung</span>
                          <span className="text-xs text-muted-foreground">
                            Lieferung nach konfigurierbarer Anzahl Tage
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.deliveryLogic === 'days_after_order' && (
                  <div>
                    <Label htmlFor="deliveryOffset">Tage nach Bestellung</Label>
                    <Input
                      id="deliveryOffset"
                      type="number"
                      min="0"
                      max="30"
                      value={formData.deliveryOffsetDays}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        deliveryOffsetDays: parseInt(e.target.value) || 0 
                      }))}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="deliveryLocation">Lieferort (optional)</Label>
                  <Input
                    id="deliveryLocation"
                    value={formData.deliveryLocation}
                    onChange={(e) => setFormData(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                    placeholder="z.B. Lager 2, Rampe A"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AUTOMATISIERUNG TAB */}
          <TabsContent value="automation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Prognose-Integration
                </CardTitle>
                <CardDescription>
                  Automatische Berechnung der Bestellmengen basierend auf Verkaufsprognosen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="forecastEnabled"
                    checked={formData.forecastEnabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      forecastEnabled: checked 
                    }))}
                  />
                  <Label htmlFor="forecastEnabled">Prognose-basierte Mengenberechnung aktivieren</Label>
                </div>

                {formData.forecastEnabled && (
                  <div className="space-y-3 p-3 bg-blue-50 rounded-lg">
                    <div>
                      <Label htmlFor="forecastPeriod">Prognosezeitraum</Label>
                      <Select 
                        value={formData.forecastPeriodDays.toString()} 
                        onValueChange={(value) => 
                          setFormData(prev => ({ ...prev, forecastPeriodDays: parseInt(value) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 Tage</SelectItem>
                          <SelectItem value="14">14 Tage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="text-xs text-blue-700">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      Die Prognose überschreibt die Standard-Bestellmengen bei ausreichender Datenqualität.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  E-Mail-Benachrichtigungen
                </CardTitle>
                <CardDescription>
                  Automatische Benachrichtigungen bei Bestellerstellung
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="E-Mail-Adresse hinzufügen"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                  />
                  <Button onClick={addEmail} variant="outline">
                    Hinzufügen
                  </Button>
                </div>

                {emailList.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {emailList.map(email => (
                      <Badge 
                        key={email} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => removeEmail(email)}
                      >
                        {email} ×
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="requiresApproval"
                      checked={formData.requiresApproval}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        requiresApproval: checked 
                      }))}
                    />
                    <Label htmlFor="requiresApproval">Genehmigung vor Ausführung erforderlich</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="autoCreateInGoods"
                      checked={formData.autoCreateInGoods}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        autoCreateInGoods: checked 
                      }))}
                    />
                    <Label htmlFor="autoCreateInGoods">Automatisch in Wareneingang erstellen</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            {recurringOrder ? 'Speichern' : 'Erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SupplierPhotoUpload } from '@/components/SupplierPhotoUpload';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Supplier } from '@shared/schema';

interface SupplierEditDialogProps {
  supplier: Supplier;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedSupplier: Partial<Supplier>) => void;
}

export function SupplierEditDialog({ supplier, isOpen, onOpenChange, onSave }: SupplierEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateSupplierMutation = useMutation({
    mutationFn: async (data: Partial<Supplier>) => {
      console.log('[SupplierEditDialog] Speichere Lieferantendaten:', data);
      const response = await fetch(`/api/suppliers/${supplier.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[SupplierEditDialog] Server-Antwort:', result);
      return result;
    },
    onSuccess: (updatedSupplier) => {
      console.log('[SupplierEditDialog] Lieferant erfolgreich gespeichert:', updatedSupplier);
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers', supplier.id] });
      onSave(updatedSupplier);
      onOpenChange(false);
      toast({
        title: "Lieferant gespeichert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      console.error('[SupplierEditDialog] Fehler beim Speichern:', error);
      toast({
        title: "Fehler beim Speichern",
        description: `Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        variant: "destructive",
      });
    },
  });

  const [formData, setFormData] = useState({
    // Grundinformationen
    name: supplier.name || '',
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    website: supplier.website || '',
    
    // Adresse
    address: supplier.address || '',
    city: supplier.city || '',
    postalCode: supplier.postalCode || '',
    country: supplier.country || 'Deutschland',
    
    // Status und Beschreibungen
    status: supplier.status || 'active',
    shortDescription: supplier.shortDescription || '',
    description: supplier.description || '',
    notes: supplier.notes || '',
    
    // Geschäftsbedingungen
    paymentTerms: supplier.paymentTerms || '',
    deliveryTerms: supplier.deliveryTerms || '',
    minimumOrderValue: supplier.minimumOrderValue || 0,
    deliveryDays: supplier.deliveryDays || '',
    
    // Steuer- und Bankdaten
    taxId: supplier.taxId || '',
    accountNumber: supplier.accountNumber || '',
    bankDetails: supplier.bankDetails || '',
    
    // Lieferungsmethoden
    deliveryMethod: supplier.deliveryMethod || 'delivery',
    preferredDeliveryMethod: supplier.preferredDeliveryMethod || '',
    
    // Bestellungseinstellungen
    orderFrequency: supplier.orderFrequency || '',
    orderWeekday: supplier.orderWeekday || '',
    orderPreferences: supplier.orderPreferences || '',
    
    // Lieferungseinstellungen
    deliveryFrequency: supplier.deliveryFrequency || '',
    deliveryWeekday: supplier.deliveryWeekday || '',
    deliveryPreferences: supplier.deliveryPreferences || '',
    
    // E-Mail-Einstellungen
    orderEmailRecipient: supplier.orderEmailRecipient || '',
    orderEmailCc: supplier.orderEmailCc || '',
    orderEmailBcc: supplier.orderEmailBcc || '',
    emailTemplate: supplier.emailTemplate || '',
    emailSubjectTemplate: supplier.emailSubjectTemplate || '',
    emailSignature: supplier.emailSignature || '',
    
    // Preisanzeige-Einstellungen
    showPricesInOrders: supplier.showPricesInOrders !== false,
    hideOrderPrices: supplier.hideOrderPrices || false,
    
    // Medien
    photos: supplier.photos || []
  });

  const [activeTab, setActiveTab] = useState("general");

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validierungsfehler",
        description: "Lieferantenname ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    updateSupplierMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl h-[95vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold">
            Lieferant bearbeiten: {supplier.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            {/* Mobile-First Tab Navigation */}
            <div className="px-6 py-2 border-b">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto">
                <TabsTrigger value="general" className="text-xs lg:text-sm py-2">
                  Basis
                </TabsTrigger>
                <TabsTrigger value="contact" className="text-xs lg:text-sm py-2">
                  Kontakt
                </TabsTrigger>
                <TabsTrigger value="business" className="text-xs lg:text-sm py-2">
                  Geschäft
                </TabsTrigger>
                <TabsTrigger value="ordering" className="text-xs lg:text-sm py-2">
                  Bestellung
                </TabsTrigger>
                <TabsTrigger value="email" className="text-xs lg:text-sm py-2">
                  E-Mail
                </TabsTrigger>
                <TabsTrigger value="media" className="text-xs lg:text-sm py-2">
                  Medien
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Content Area */}
            <ScrollArea className="flex-1 px-6 py-4">
              {/* Basis-Tab */}
              <TabsContent value="general" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Grundinformationen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name" className="text-sm font-medium">Lieferantenname *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="mt-1"
                          placeholder="Name des Lieferanten"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="status" className="text-sm font-medium">Status</Label>
                        <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Status wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Aktiv</SelectItem>
                            <SelectItem value="inactive">Inaktiv</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="shortDescription" className="text-sm font-medium">Kurzbeschreibung</Label>
                        <Textarea
                          id="shortDescription"
                          value={formData.shortDescription}
                          onChange={(e) => handleInputChange('shortDescription', e.target.value)}
                          className="mt-1"
                          placeholder="Kurze Beschreibung des Lieferanten..."
                          rows={3}
                        />
                      </div>

                      <div>
                        <Label htmlFor="description" className="text-sm font-medium">Detaillierte Beschreibung</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleInputChange('description', e.target.value)}
                          className="mt-1"
                          placeholder="Detaillierte Beschreibung des Lieferanten..."
                          rows={4}
                        />
                      </div>

                      <div>
                        <Label htmlFor="notes" className="text-sm font-medium">Notizen</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => handleInputChange('notes', e.target.value)}
                          className="mt-1"
                          placeholder="Interne Notizen..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Kontakt-Tab */}
              <TabsContent value="contact" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Kontaktinformationen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="contactPerson" className="text-sm font-medium">Ansprechpartner</Label>
                      <Input
                        id="contactPerson"
                        value={formData.contactPerson}
                        onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                        className="mt-1"
                        placeholder="Name des Ansprechpartners"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phone" className="text-sm font-medium">Telefon</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          className="mt-1"
                          placeholder="+49 xxx xxxxx"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-sm font-medium">E-Mail</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className="mt-1"
                          placeholder="kontakt@lieferant.de"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="website" className="text-sm font-medium">Website</Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        className="mt-1"
                        placeholder="https://www.lieferant.de"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Adresse</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="address" className="text-sm font-medium">Straße und Hausnummer</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        className="mt-1"
                        placeholder="Musterstraße 123"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="postalCode" className="text-sm font-medium">PLZ</Label>
                        <Input
                          id="postalCode"
                          value={formData.postalCode}
                          onChange={(e) => handleInputChange('postalCode', e.target.value)}
                          className="mt-1"
                          placeholder="12345"
                        />
                      </div>
                      <div>
                        <Label htmlFor="city" className="text-sm font-medium">Stadt</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          className="mt-1"
                          placeholder="Musterstadt"
                        />
                      </div>
                      <div>
                        <Label htmlFor="country" className="text-sm font-medium">Land</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => handleInputChange('country', e.target.value)}
                          className="mt-1"
                          placeholder="Deutschland"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Business-Tab */}
              <TabsContent value="business" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Geschäftsbedingungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="paymentTerms" className="text-sm font-medium">Zahlungsbedingungen</Label>
                        <Input
                          id="paymentTerms"
                          value={formData.paymentTerms}
                          onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
                          className="mt-1"
                          placeholder="z.B. 30 Tage netto"
                        />
                      </div>
                      <div>
                        <Label htmlFor="deliveryTerms" className="text-sm font-medium">Lieferbedingungen</Label>
                        <Input
                          id="deliveryTerms"
                          value={formData.deliveryTerms}
                          onChange={(e) => handleInputChange('deliveryTerms', e.target.value)}
                          className="mt-1"
                          placeholder="z.B. frei Haus ab 100€"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="minimumOrderValue" className="text-sm font-medium">Mindestbestellwert (€)</Label>
                        <Input
                          id="minimumOrderValue"
                          type="number"
                          value={formData.minimumOrderValue}
                          onChange={(e) => handleInputChange('minimumOrderValue', parseFloat(e.target.value) || 0)}
                          className="mt-1"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="deliveryDays" className="text-sm font-medium">Lieferzeit</Label>
                        <Input
                          id="deliveryDays"
                          value={formData.deliveryDays}
                          onChange={(e) => handleInputChange('deliveryDays', e.target.value)}
                          className="mt-1"
                          placeholder="z.B. 2-3 Tage"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="taxId" className="text-sm font-medium">Steuernummer</Label>
                        <Input
                          id="taxId"
                          value={formData.taxId}
                          onChange={(e) => handleInputChange('taxId', e.target.value)}
                          className="mt-1"
                          placeholder="USt-ID"
                        />
                      </div>
                      <div>
                        <Label htmlFor="accountNumber" className="text-sm font-medium">Kontonummer</Label>
                        <Input
                          id="accountNumber"
                          value={formData.accountNumber}
                          onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                          className="mt-1"
                          placeholder="IBAN"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="bankDetails" className="text-sm font-medium">Bankverbindung</Label>
                      <Textarea
                        id="bankDetails"
                        value={formData.bankDetails}
                        onChange={(e) => handleInputChange('bankDetails', e.target.value)}
                        className="mt-1"
                        placeholder="Bankname, IBAN, BIC..."
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="deliveryMethod" className="text-sm font-medium">Liefermethode</Label>
                      <Select value={formData.deliveryMethod} onValueChange={(value) => handleInputChange('deliveryMethod', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Liefermethode wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delivery">Lieferung</SelectItem>
                          <SelectItem value="pickup">Abholung</SelectItem>
                          <SelectItem value="both">Beide</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="preferredDeliveryMethod" className="text-sm font-medium">Bevorzugte Liefermethode</Label>
                      <Input
                        id="preferredDeliveryMethod"
                        value={formData.preferredDeliveryMethod}
                        onChange={(e) => handleInputChange('preferredDeliveryMethod', e.target.value)}
                        className="mt-1"
                        placeholder="z.B. Spedition, Paketdienst"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Preisanzeige</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Preise in Bestellungen anzeigen</Label>
                        <p className="text-xs text-muted-foreground">
                          Zeigt Preise in Bestellungen an diesen Lieferanten
                        </p>
                      </div>
                      <Switch
                        checked={formData.showPricesInOrders}
                        onCheckedChange={(checked) => handleInputChange('showPricesInOrders', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Preise ausblenden</Label>
                        <p className="text-xs text-muted-foreground">
                          Blendet Preise komplett aus
                        </p>
                      </div>
                      <Switch
                        checked={formData.hideOrderPrices}
                        onCheckedChange={(checked) => handleInputChange('hideOrderPrices', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Ordering-Tab */}
              <TabsContent value="ordering" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bestellungseinstellungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="orderFrequency" className="text-sm font-medium">Bestellfrequenz</Label>
                        <Select value={formData.orderFrequency} onValueChange={(value) => handleInputChange('orderFrequency', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Frequenz wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Wöchentlich</SelectItem>
                            <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem>
                            <SelectItem value="monthly">Monatlich</SelectItem>
                            <SelectItem value="on-demand">Bei Bedarf</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="orderWeekday" className="text-sm font-medium">Bestelltag</Label>
                        <Select value={formData.orderWeekday} onValueChange={(value) => handleInputChange('orderWeekday', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Wochentag wählen" />
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
                    </div>

                    <div>
                      <Label htmlFor="orderPreferences" className="text-sm font-medium">Bestellpräferenzen</Label>
                      <Textarea
                        id="orderPreferences"
                        value={formData.orderPreferences}
                        onChange={(e) => handleInputChange('orderPreferences', e.target.value)}
                        className="mt-1"
                        placeholder="Spezielle Anforderungen für Bestellungen..."
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Lieferungseinstellungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="deliveryFrequency" className="text-sm font-medium">Lieferfrequenz</Label>
                        <Select value={formData.deliveryFrequency} onValueChange={(value) => handleInputChange('deliveryFrequency', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Frequenz wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Wöchentlich</SelectItem>
                            <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem>
                            <SelectItem value="monthly">Monatlich</SelectItem>
                            <SelectItem value="on-demand">Bei Bedarf</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="deliveryWeekday" className="text-sm font-medium">Liefertag</Label>
                        <Select value={formData.deliveryWeekday} onValueChange={(value) => handleInputChange('deliveryWeekday', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Wochentag wählen" />
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
                    </div>

                    <div>
                      <Label htmlFor="deliveryPreferences" className="text-sm font-medium">Lieferpräferenzen</Label>
                      <Textarea
                        id="deliveryPreferences"
                        value={formData.deliveryPreferences}
                        onChange={(e) => handleInputChange('deliveryPreferences', e.target.value)}
                        className="mt-1"
                        placeholder="Spezielle Anforderungen für Lieferungen..."
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Email-Tab */}
              <TabsContent value="email" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">E-Mail-Einstellungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="orderEmailRecipient" className="text-sm font-medium">Haupt-E-Mail für Bestellungen</Label>
                      <Input
                        id="orderEmailRecipient"
                        type="email"
                        value={formData.orderEmailRecipient}
                        onChange={(e) => handleInputChange('orderEmailRecipient', e.target.value)}
                        className="mt-1"
                        placeholder="bestellungen@lieferant.de"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="orderEmailCc" className="text-sm font-medium">CC-Empfänger</Label>
                        <Input
                          id="orderEmailCc"
                          type="email"
                          value={formData.orderEmailCc}
                          onChange={(e) => handleInputChange('orderEmailCc', e.target.value)}
                          className="mt-1"
                          placeholder="buchhaltung@lieferant.de"
                        />
                      </div>
                      <div>
                        <Label htmlFor="orderEmailBcc" className="text-sm font-medium">BCC-Empfänger</Label>
                        <Input
                          id="orderEmailBcc"
                          type="email"
                          value={formData.orderEmailBcc}
                          onChange={(e) => handleInputChange('orderEmailBcc', e.target.value)}
                          className="mt-1"
                          placeholder="archiv@lieferant.de"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">E-Mail-Templates</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="emailSubjectTemplate" className="text-sm font-medium">Betreff-Vorlage</Label>
                      <Input
                        id="emailSubjectTemplate"
                        value={formData.emailSubjectTemplate}
                        onChange={(e) => handleInputChange('emailSubjectTemplate', e.target.value)}
                        className="mt-1"
                        placeholder="Neue Bestellung #{orderNumber}"
                      />
                    </div>

                    <div>
                      <Label htmlFor="emailBodyTemplate" className="text-sm font-medium">E-Mail-Text-Vorlage</Label>
                      <Textarea
                        id="emailBodyTemplate"
                        value={formData.emailBodyTemplate}
                        onChange={(e) => handleInputChange('emailBodyTemplate', e.target.value)}
                        className="mt-1"
                        placeholder="Standardtext für E-Mails an diesen Lieferanten..."
                        rows={5}
                      />
                    </div>

                    <div>
                      <Label htmlFor="emailSignature" className="text-sm font-medium">E-Mail-Signatur</Label>
                      <Textarea
                        id="emailSignature"
                        value={formData.emailSignature}
                        onChange={(e) => handleInputChange('emailSignature', e.target.value)}
                        className="mt-1"
                        placeholder="Mit freundlichen Grüßen..."
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Media-Tab */}
              <TabsContent value="media" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Fotos und Dokumente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                      Foto-Upload wird implementiert
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>

            {/* Action Buttons - Fixed at Bottom */}
            <div className="border-t px-6 py-4 bg-background">
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="w-full sm:w-auto"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateSupplierMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {updateSupplierMutation.isPending ? 'Speichert...' : 'Speichern'}
                </Button>
              </div>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
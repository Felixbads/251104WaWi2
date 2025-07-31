import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SupplierPhotoUpload } from '@/components/SupplierPhotoUpload';

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
      return await apiRequest(`/api/suppliers/${supplier.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (updatedSupplier) => {
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
      console.error('Fehler beim Speichern:', error);
      toast({
        title: "Fehler",
        description: "Beim Speichern ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    },
  });

  const [formData, setFormData] = useState({
    name: supplier.name || '',
    shortDescription: supplier.shortDescription || '',
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    website: supplier.website || '',
    address: supplier.address || '',
    city: supplier.city || '',
    postalCode: supplier.postalCode || '',
    country: supplier.country || 'Deutschland',
    status: supplier.status || 'active',
    notes: supplier.notes || '',
    paymentTerms: supplier.paymentTerms || '',
    deliveryTerms: supplier.deliveryTerms || '',
    minimumOrderValue: supplier.minimumOrderValue || 0,
    deliveryDays: supplier.deliveryDays || '',
    taxId: supplier.taxId || '',
    bankDetails: supplier.bankDetails || '',
    photos: supplier.photos || [],
    showPricesInOrders: supplier.showPricesInOrders !== false, // Default true
    // Bestellungseinstellungen
    orderFrequency: supplier.orderFrequency || '',
    orderWeekday: supplier.orderWeekday || '',
    orderPreferences: supplier.orderPreferences || '',
    // Lieferungseinstellungen
    deliveryFrequency: supplier.deliveryFrequency || '',
    deliveryWeekday: supplier.deliveryWeekday || '',
    deliveryPreferences: supplier.deliveryPreferences || '',
    preferredDeliveryMethod: supplier.preferredDeliveryMethod || '',
    // E-Mail-Template-Felder
    emailTemplate: supplier.emailTemplate || '',
    emailSubjectTemplate: supplier.emailSubjectTemplate || '',
    orderEmailRecipient: supplier.orderEmailRecipient || '',
    orderEmailCc: supplier.orderEmailCc || '',
    orderEmailBcc: supplier.orderEmailBcc || '',
    emailSignature: supplier.emailSignature || ''
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lieferant bearbeiten: {supplier.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general">Allgemein</TabsTrigger>
            <TabsTrigger value="contact">Kontakt</TabsTrigger>
            <TabsTrigger value="terms">Konditionen</TabsTrigger>
            <TabsTrigger value="ordering">Bestellungen</TabsTrigger>
            <TabsTrigger value="email">E-Mail</TabsTrigger>
            <TabsTrigger value="media">Fotos</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Grundinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Lieferantenname *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="shortDescription">Kurzbeschreibung</Label>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => handleInputChange('shortDescription', e.target.value)}
                    placeholder="Kurze Beschreibung des Lieferanten..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Beschreibung</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Detaillierte Beschreibung des Lieferanten..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Kontaktinformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="contactPerson">Ansprechpartner</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">Stadt</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postalCode">PLZ</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Land</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="terms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Geschäftskonditionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="paymentTerms">Zahlungskonditionen</Label>
                  <Input
                    id="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
                    placeholder="z.B. 30 Tage netto"
                  />
                </div>

                <div>
                  <Label htmlFor="deliveryTerms">Lieferkonditionen</Label>
                  <Input
                    id="deliveryTerms"
                    value={formData.deliveryTerms}
                    onChange={(e) => handleInputChange('deliveryTerms', e.target.value)}
                    placeholder="z.B. frei Haus ab 100€"
                  />
                </div>

                <div>
                  <Label htmlFor="minimumOrderValue">Mindestbestellwert (€)</Label>
                  <Input
                    id="minimumOrderValue"
                    type="number"
                    step="0.01"
                    value={formData.minimumOrderValue}
                    onChange={(e) => handleInputChange('minimumOrderValue', parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="taxId">Steuernummer / USt-ID</Label>
                    <Input
                      id="taxId"
                      value={formData.taxId}
                      onChange={(e) => handleInputChange('taxId', e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="bankDetails">Bankverbindung</Label>
                    <Input
                      id="bankDetails"
                      value={formData.bankDetails}
                      onChange={(e) => handleInputChange('bankDetails', e.target.value)}
                      placeholder="IBAN, BIC, etc."
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="deliveryDays">Liefertage</Label>
                  <Input
                    id="deliveryDays"
                    value={formData.deliveryDays}
                    onChange={(e) => handleInputChange('deliveryDays', e.target.value)}
                    placeholder="z.B. Mo, Mi, Fr"
                  />
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="showPricesInOrders"
                      checked={formData.showPricesInOrders}
                      onChange={(e) => handleInputChange('showPricesInOrders', e.target.checked)}
                      className="w-5 h-5 text-blue-600 bg-white border-2 border-blue-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <label htmlFor="showPricesInOrders" className="text-base font-medium text-blue-900">
                        Euro-Werte in Bestellungen anzeigen
                      </label>
                      <p className="text-sm text-blue-700">
                        Wenn deaktiviert, werden in Bestell-E-Mails an diesen Lieferanten keine Preise angezeigt
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="ordering" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bestelleinstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="orderFrequency">Bestellfrequenz</Label>
                    <Select value={formData.orderFrequency} onValueChange={(value) => handleInputChange('orderFrequency', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Bestellfrequenz wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                        <SelectItem value="biweekly">2-Wöchentlich</SelectItem>
                        <SelectItem value="on-demand">Nach Bedarf</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="orderWeekday">Bestelltag</Label>
                    <Select value={formData.orderWeekday} onValueChange={(value) => handleInputChange('orderWeekday', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wochentag wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Montag</SelectItem>
                        <SelectItem value="tuesday">Dienstag</SelectItem>
                        <SelectItem value="wednesday">Mittwoch</SelectItem>
                        <SelectItem value="thursday">Donnerstag</SelectItem>
                        <SelectItem value="friday">Freitag</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="orderPreferences">Bestellnotizen</Label>
                  <Textarea
                    id="orderPreferences"
                    value={formData.orderPreferences}
                    onChange={(e) => handleInputChange('orderPreferences', e.target.value)}
                    placeholder="Besondere Bestellpräferenzen..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Liefereinstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="deliveryFrequency">Lieferfrequenz</Label>
                    <Select value={formData.deliveryFrequency} onValueChange={(value) => handleInputChange('deliveryFrequency', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Lieferfrequenz wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                        <SelectItem value="biweekly">2-Wöchentlich</SelectItem>
                        <SelectItem value="on-demand">Nach Bedarf</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="deliveryWeekday">Liefertag</Label>
                    <Select value={formData.deliveryWeekday} onValueChange={(value) => handleInputChange('deliveryWeekday', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wochentag wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Montag</SelectItem>
                        <SelectItem value="tuesday">Dienstag</SelectItem>
                        <SelectItem value="wednesday">Mittwoch</SelectItem>
                        <SelectItem value="thursday">Donnerstag</SelectItem>
                        <SelectItem value="friday">Freitag</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="preferredDeliveryMethod">Bevorzugte Lieferart</Label>
                  <Select value={formData.preferredDeliveryMethod} onValueChange={(value) => handleInputChange('preferredDeliveryMethod', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Lieferart wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">Lieferung</SelectItem>
                      <SelectItem value="pickup">Abholung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="deliveryPreferences">Liefernotizen</Label>
                  <Textarea
                    id="deliveryPreferences"
                    value={formData.deliveryPreferences}
                    onChange={(e) => handleInputChange('deliveryPreferences', e.target.value)}
                    placeholder="Besondere Lieferpräferenzen..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>E-Mail-Einstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="orderEmailRecipient">Bestell-E-Mail Empfänger</Label>
                  <Input
                    id="orderEmailRecipient"
                    type="email"
                    value={formData.orderEmailRecipient}
                    onChange={(e) => handleInputChange('orderEmailRecipient', e.target.value)}
                    placeholder="bestellungen@lieferant.de"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="orderEmailCc">CC (Kopie)</Label>
                    <Input
                      id="orderEmailCc"
                      type="email"
                      value={formData.orderEmailCc}
                      onChange={(e) => handleInputChange('orderEmailCc', e.target.value)}
                      placeholder="chef@lieferant.de"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="orderEmailBcc">BCC (Blindkopie)</Label>
                    <Input
                      id="orderEmailBcc"
                      type="email"
                      value={formData.orderEmailBcc}
                      onChange={(e) => handleInputChange('orderEmailBcc', e.target.value)}
                      placeholder="buchhaltung@lieferant.de"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="emailSubjectTemplate">E-Mail Betreff</Label>
                  <Input
                    id="emailSubjectTemplate"
                    value={formData.emailSubjectTemplate}
                    onChange={(e) => handleInputChange('emailSubjectTemplate', e.target.value)}
                    placeholder="Bestellung #{orderNumber} vom {date}"
                  />
                </div>
                
                <div>
                  <Label htmlFor="emailSignature">E-Mail Signatur</Label>
                  <Textarea
                    id="emailSignature"
                    value={formData.emailSignature}
                    onChange={(e) => handleInputChange('emailSignature', e.target.value)}
                    placeholder="Mit freundlichen Grüßen..."
                    rows={4}
                  />
                </div>
                
                <div>
                  <Label htmlFor="emailTemplate">E-Mail Vorlage (HTML)</Label>
                  <Textarea
                    id="emailTemplate"
                    value={formData.emailTemplate}
                    onChange={(e) => handleInputChange('emailTemplate', e.target.value)}
                    placeholder="Benutzerdefinierte E-Mail Vorlage..."
                    rows={6}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="media" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Lieferanten-Fotos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Aktuelles Foto</Label>
                  <div className="mt-2 p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                    Foto-Upload wird implementiert
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="photoUpload">Neues Foto hochladen</Label>
                  <Input
                    id="photoUpload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // TODO: Implement photo upload functionality
                        console.log('Photo upload:', file);
                      }
                    }}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Unterstützte Formate: JPG, PNG, WebP (max. 5MB)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={updateSupplierMutation.isPending}>
            {updateSupplierMutation.isPending ? 'Speichere...' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
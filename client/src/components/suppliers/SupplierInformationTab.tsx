import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Building2, 
  Phone, 
  Mail, 
  Globe, 
  MapPin, 
  FileText, 
  Save, 
  Upload,
  Edit,
  ImageIcon,
  X
} from 'lucide-react';

interface SupplierInformationTabProps {
  supplier: any;
  supplierId: number;
}

const SupplierInformationTab: React.FC<SupplierInformationTabProps> = ({ supplier, supplierId }) => {
  const [formData, setFormData] = useState({
    name: supplier?.name || '',
    contactPerson: supplier?.contactPerson || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    website: supplier?.website || '',
    address: supplier?.address || '',
    postalCode: supplier?.postalCode || '',
    city: supplier?.city || '',
    country: supplier?.country || 'Deutschland',
    description: supplier?.description || '',
    notes: supplier?.notes || '',
    taxNumber: supplier?.taxNumber || '',
    vatNumber: supplier?.vatNumber || '',
    bankAccount: supplier?.bankAccount || '',
    paymentTerms: supplier?.paymentTerms || ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for updating supplier information
  const updateSupplierMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      console.log('Sending supplier update:', data);
      return await apiRequest(`/api/suppliers/${supplierId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Erfolgreich gespeichert",
        description: "Die Lieferanteninformationen wurden erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}`] });
    },
    onError: (error) => {
      console.error('Error updating supplier:', error);
      toast({
        title: "Fehler beim Speichern",
        description: "Die Änderungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    },
  });

  // Mutation for uploading supplier image
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('entityType', 'supplier');
      formData.append('entityId', supplierId.toString());

      return await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Bild hochgeladen",
        description: "Das Lieferantenbild wurde erfolgreich hochgeladen.",
      });
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}`] });
    },
    onError: (error) => {
      console.error('Error uploading image:', error);
      toast({
        title: "Fehler beim Hochladen",
        description: "Das Bild konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    updateSupplierMutation.mutate(formData);
  };

  const handleImageUpload = () => {
    if (selectedFile) {
      setUploading(true);
      uploadImageMutation.mutate(selectedFile);
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header with Save Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lieferanteninformationen</h2>
          <p className="text-gray-600">Verwalten Sie alle Stammdaten des Lieferanten</p>
        </div>
        <Button 
          onClick={handleSave}
          disabled={updateSupplierMutation.isPending}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
        >
          <Save className="h-4 w-4 mr-2" />
          {updateSupplierMutation.isPending ? 'Speichert...' : 'Speichern'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Grunddaten
            </CardTitle>
            <CardDescription>
              Grundlegende Informationen über den Lieferanten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Firmenname <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Firmenname eingeben..."
              />
            </div>
            
            <div>
              <Label htmlFor="contactPerson">Ansprechpartner</Label>
              <Input
                id="contactPerson"
                value={formData.contactPerson}
                onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                placeholder="Name des Ansprechpartners..."
              />
            </div>

            <div>
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Kurze Beschreibung des Lieferanten..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Kontaktdaten
            </CardTitle>
            <CardDescription>
              Telefon, E-Mail und Website des Lieferanten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="phone">Telefonnummer</Label>
              <Input
                id="phone"
                type="text"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+49 123 456-789"
              />
            </div>
            
            <div>
              <Label htmlFor="email">E-Mail-Adresse</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="kontakt@lieferant.de"
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://www.lieferant.de"
              />
            </div>
          </CardContent>
        </Card>

        {/* Address Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adressdaten
            </CardTitle>
            <CardDescription>
              Vollständige Anschrift des Lieferanten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="address">Straße und Hausnummer</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Musterstraße 123"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="postalCode">PLZ</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => handleInputChange('postalCode', e.target.value)}
                  placeholder="01234"
                />
              </div>
              <div>
                <Label htmlFor="city">Stadt</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Musterstadt"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">Land</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => handleInputChange('country', e.target.value)}
                placeholder="Deutschland"
              />
            </div>
          </CardContent>
        </Card>

        {/* Image Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Lieferantenbild
            </CardTitle>
            <CardDescription>
              Logo oder Foto des Lieferanten hochladen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Images Display */}
            {supplier?.photos && supplier.photos.length > 0 && (
              <div className="space-y-2">
                <Label>Aktuelle Bilder:</Label>
                <div className="grid grid-cols-2 gap-2">
                  {supplier.photos.map((photo: any, index: number) => (
                    <div key={index} className="relative">
                      <img 
                        src={photo.url || photo.medium_url} 
                        alt={`Lieferant ${index + 1}`}
                        className="w-full h-24 object-cover rounded border"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="imageUpload">Neues Bild hochladen:</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="flex-1"
                />
                {selectedFile && (
                  <Button 
                    onClick={handleImageUpload}
                    disabled={uploading || uploadImageMutation.isPending}
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading ? 'Lädt...' : 'Hochladen'}
                  </Button>
                )}
              </div>
              {selectedFile && (
                <p className="text-sm text-gray-600">
                  Ausgewählt: {selectedFile.name}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Geschäftsdaten
            </CardTitle>
            <CardDescription>
              Steuerliche und finanzielle Informationen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="taxNumber">Steuernummer</Label>
              <Input
                id="taxNumber"
                value={formData.taxNumber}
                onChange={(e) => handleInputChange('taxNumber', e.target.value)}
                placeholder="123/456/78901"
              />
            </div>
            
            <div>
              <Label htmlFor="vatNumber">USt-ID</Label>
              <Input
                id="vatNumber"
                value={formData.vatNumber}
                onChange={(e) => handleInputChange('vatNumber', e.target.value)}
                placeholder="DE123456789"
              />
            </div>

            <div>
              <Label htmlFor="bankAccount">Bankverbindung</Label>
              <Input
                id="bankAccount"
                value={formData.bankAccount}
                onChange={(e) => handleInputChange('bankAccount', e.target.value)}
                placeholder="IBAN oder Kontonummer"
              />
            </div>

            <div>
              <Label htmlFor="paymentTerms">Zahlungsbedingungen</Label>
              <Input
                id="paymentTerms"
                value={formData.paymentTerms}
                onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
                placeholder="z.B. 14 Tage netto"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes and Additional Information */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Notizen und zusätzliche Informationen
            </CardTitle>
            <CardDescription>
              Interne Notizen und weitere wichtige Informationen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="notes">Interne Notizen</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Interne Notizen, besondere Vereinbarungen, Lieferzeiten usw..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Save Button */}
      <div className="flex justify-center pt-6">
        <Button 
          onClick={handleSave}
          disabled={updateSupplierMutation.isPending}
          className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg"
        >
          <Save className="h-5 w-5 mr-2" />
          {updateSupplierMutation.isPending ? 'Speichert...' : 'Alle Änderungen speichern'}
        </Button>
      </div>
    </div>
  );
};

export default SupplierInformationTab;
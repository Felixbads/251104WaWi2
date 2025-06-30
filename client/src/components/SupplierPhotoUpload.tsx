import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SupplierPhotoUploadProps {
  supplierId: number;
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export function SupplierPhotoUpload({ 
  supplierId, 
  photos, 
  onPhotosChange, 
  maxPhotos = 10 
}: SupplierPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;
    
    if (photos.length + files.length > maxPhotos) {
      toast({
        title: "Zu viele Dateien",
        description: `Maximal ${maxPhotos} Fotos erlaubt`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      for (const file of files) {
        console.log('[SUPPLIER_UPLOAD] Starting upload for:', file.name, file.size, 'bytes');
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          toast({
            title: "Datei zu groß",
            description: `${file.name} ist größer als 10MB`,
            variant: "destructive"
          });
          continue;
        }

        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        console.log('[SUPPLIER_UPLOAD] Base64 length:', base64.length);
        console.log('[SUPPLIER_UPLOAD] Starting API request to:', `/api/photos/upload/supplier/${supplierId}`);

        // Upload to supplier-specific endpoint
        const response = await fetch(`/api/photos/upload/supplier/${supplierId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            filename: file.name,
            data: base64,
            entityType: 'supplier',
            entityId: supplierId
          })
        });

        console.log('[SUPPLIER_UPLOAD] Response status:', response.status);
        console.log('[SUPPLIER_UPLOAD] Response ok:', response.ok);

        if (!response.ok) {
          const errorText = await response.text();
          console.log('[SUPPLIER_UPLOAD] Response error text:', errorText);
          throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('[SUPPLIER_UPLOAD] Upload successful:', result);

        // Add new photo URL to list
        if (result.urls && result.urls.medium) {
          const newPhotos = [...photos, result.urls.medium];
          onPhotosChange(newPhotos);
        }
      }

      toast({
        title: "Upload erfolgreich",
        description: `${files.length} Foto(s) hochgeladen`
      });

    } catch (error) {
      console.error('[SUPPLIER_UPLOAD] Upload error:', error);
      toast({
        title: "Upload fehlgeschlagen",
        description: "Fehler beim Hochladen der Fotos",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      // Clear file input
      event.target.value = '';
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors">
        <CardContent className="p-6">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Fotos hochladen</h3>
              <p className="text-sm text-gray-500">
                Klicken oder Dateien hierher ziehen
              </p>
              <p className="text-xs text-gray-400">
                JPEG, PNG, WebP • Max. 5MB pro Datei • {photos.length}/{maxPhotos} Fotos
              </p>
            </div>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              disabled={uploading || photos.length >= maxPhotos}
              className="hidden"
              id="supplier-file-upload"
            />
            <Button
              variant="outline"
              className="mt-4"
              disabled={uploading || photos.length >= maxPhotos}
              onClick={() => document.getElementById('supplier-file-upload')?.click()}
            >
              {uploading ? 'Uploading...' : 'Dateien auswählen'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Photo Gallery */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photoUrl, index) => (
            <div key={index} className="relative group">
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={photoUrl}
                  alt={`Lieferantenfoto ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder-image.png';
                  }}
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                onClick={() => removePhoto(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <ImageIcon className="mx-auto h-8 w-8 mb-2" />
          <p>Noch keine Fotos hochgeladen</p>
        </div>
      )}
    </div>
  );
}
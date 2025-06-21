import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Upload, Image } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  className?: string;
}

export function PhotoUpload({ photos, onPhotosChange, maxPhotos = 10, className = "" }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (photos.length + acceptedFiles.length > maxPhotos) {
      toast({
        title: "Zu viele Fotos",
        description: `Maximal ${maxPhotos} Fotos erlaubt`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      acceptedFiles.forEach(file => {
        formData.append('photos', file);
      });

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload fehlgeschlagen');
      }

      const result = await response.json();
      if (result.success) {
        const newPhotoUrls = result.photos.map((photo: any) => photo.url);
        onPhotosChange([...photos, ...newPhotoUrls]);
        toast({
          title: "Fotos hochgeladen",
          description: `${result.photos.length} Foto(s) erfolgreich hochgeladen`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload-Fehler",
        description: "Fehler beim Hochladen der Fotos",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [photos, onPhotosChange, maxPhotos, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    multiple: true,
    disabled: uploading || photos.length >= maxPhotos
  });

  const removePhoto = async (photoUrl: string, index: number) => {
    try {
      // Extract filename from URL
      const filename = photoUrl.split('/').pop();
      if (filename) {
        await fetch(`/api/photos/${filename}`, {
          method: 'DELETE',
        });
      }
      
      const newPhotos = photos.filter((_, i) => i !== index);
      onPhotosChange(newPhotos);
      
      toast({
        title: "Foto gelöscht",
        description: "Foto erfolgreich entfernt",
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Lösch-Fehler",
        description: "Fehler beim Löschen des Fotos",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={className}>
      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          {photos.map((photo, index) => (
            <Card key={index} className="relative group">
              <CardContent className="p-2">
                <img
                  src={photo}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-32 object-cover rounded"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removePhoto(photo, index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {photos.length < maxPhotos && (
        <Card>
          <CardContent className="p-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 hover:border-gray-400'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center space-y-4">
                {uploading ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                ) : (
                  <Upload className="h-8 w-8 text-gray-400" />
                )}
                <div>
                  <p className="text-lg font-medium">
                    {isDragActive ? 'Fotos hier ablegen...' : 'Fotos hochladen'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Klicken oder Dateien hierher ziehen
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    JPEG, PNG, WebP • Max. 5MB pro Datei • {photos.length}/{maxPhotos} Fotos
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
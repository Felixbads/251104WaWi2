import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2 } from "lucide-react";

interface ProductPhotoUploadProps {
  productId: number;
  onUploadSuccess?: (photoPath: string) => void;
  size?: "sm" | "md";
}

export function ProductPhotoUpload({ productId, onUploadSuccess, size = "sm" }: ProductPhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validierung
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie eine Bilddatei aus.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      toast({
        title: "Fehler", 
        description: "Die Datei ist zu groß. Maximale Größe: 10MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      console.log('[CLOUDINARY_UPLOAD] Starting upload for:', file.name, file.size, 'bytes');

      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Send to Cloudinary via our API
      console.log('[CLOUDINARY_UPLOAD] Starting API request to:', `/api/photos/upload/${productId}`);
      console.log('[CLOUDINARY_UPLOAD] File size:', file.size, 'bytes');
      console.log('[CLOUDINARY_UPLOAD] Base64 length:', base64Data.length);
      
      const response = await fetch(`/api/photos/upload/${productId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64Data,
          filename: file.name,
        }),
      });

      console.log('[CLOUDINARY_UPLOAD] Response status:', response.status);
      console.log('[CLOUDINARY_UPLOAD] Response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('[CLOUDINARY_UPLOAD] Upload successful:', result);
        
        toast({
          title: "Erfolg",
          description: "Foto erfolgreich hochgeladen",
        });

        // Callback aufrufen wenn vorhanden
        if (onUploadSuccess && (result.cloudinaryUrl || result.photoPath)) {
          onUploadSuccess(result.cloudinaryUrl || result.photoPath);
        }
      } else {
        const errorText = await response.text();
        console.error('[CLOUDINARY_UPLOAD] Response error text:', errorText);
        
        try {
          const error = JSON.parse(errorText);
          console.error('[CLOUDINARY_UPLOAD] Upload failed:', error);
          throw new Error(error.error || 'Upload fehlgeschlagen');
        } catch (parseError) {
          console.error('[CLOUDINARY_UPLOAD] Could not parse error response:', parseError);
          throw new Error(`Server Error ${response.status}: ${errorText}`);
        }
      }
    } catch (error) {
      console.error('[CLOUDINARY_UPLOAD] Upload error:', error);
      console.error('[CLOUDINARY_UPLOAD] Error details:', JSON.stringify(error));
      
      let errorMessage = "Upload fehlgeschlagen";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }
      
      toast({
        title: "Fehler",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Input zurücksetzen
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const buttonSize = size === "sm" ? "sm" : "default";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <div className="relative">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        disabled={isUploading}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        id={`photo-upload-${productId}`}
      />
      <Button
        variant="outline"
        size={buttonSize}
        disabled={isUploading}
        className="flex items-center gap-1"
        asChild
      >
        <label htmlFor={`photo-upload-${productId}`} className="cursor-pointer">
          {isUploading ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <Upload className={iconSize} />
          )}
          {size === "md" && (
            <span>{isUploading ? "Lädt..." : "Foto"}</span>
          )}
        </label>
      </Button>
    </div>
  );
}
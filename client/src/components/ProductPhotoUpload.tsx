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
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('productId', productId.toString());

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        
        toast({
          title: "Erfolg",
          description: "Foto erfolgreich hochgeladen",
        });

        // Callback aufrufen wenn vorhanden
        if (onUploadSuccess && result.photoPath) {
          onUploadSuccess(result.photoPath);
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Upload fehlgeschlagen');
      }
    } catch (error) {
      console.error('Upload-Fehler:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Upload fehlgeschlagen",
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
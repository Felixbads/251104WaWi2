import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';

type ExportImportButtonsProps = {
  type: 'suppliers' | 'products' | 'orders';
  label?: string;
  disableImport?: boolean;
  disableExport?: boolean;
  onSuccessfulImport?: () => void;
};

export const ExportImportButtons: React.FC<ExportImportButtonsProps> = ({ 
  type, 
  label = 'Export/Import', 
  disableImport = false,
  disableExport = false,
  onSuccessfulImport 
}) => {
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      // URL für den Export-Endpunkt
      const exportUrl = `/api/export/${type}`;
      
      // Direkt zum Herunterladen einer Datei mit einer GET-Anfrage
      window.location.href = exportUrl;
      
      // Kurze Verzögerung, bevor wir den Status zurücksetzen
      setTimeout(() => {
        setIsExporting(false);
      }, 1000);
    } catch (error) {
      console.error('Fehler beim Exportieren:', error);
      toast({
        title: 'Export fehlgeschlagen',
        description: 'Beim Exportieren der Daten ist ein Fehler aufgetreten.',
        variant: 'destructive'
      });
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: 'Keine Datei ausgewählt',
        description: 'Bitte wähle eine Datei aus, die importiert werden soll.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsUploading(true);
      
      // FormData verwenden, um die Datei hochzuladen
      const formData = new FormData();
      formData.append('file', file);
      
      // Anfrage an den Import-Endpunkt
      const response = await apiClient.post(`/api/import/${type}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Toast-Meldung anzeigen und Dialog schließen
      toast({
        title: 'Import erfolgreich',
        description: response.data.message || 'Die Daten wurden erfolgreich importiert.'
      });
      
      setIsImportDialogOpen(false);
      setFile(null);
      
      // Callback aufrufen, wenn vorhanden
      if (onSuccessfulImport) {
        onSuccessfulImport();
      }
    } catch (error: any) {
      console.error('Fehler beim Importieren:', error);
      toast({
        title: 'Import fehlgeschlagen',
        description: error.response?.data?.error || 'Beim Importieren der Daten ist ein Fehler aufgetreten.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex space-x-2">
      {!disableExport && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportieren
        </Button>
      )}
      
      {!disableImport && (
        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Importieren
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{label} importieren</DialogTitle>
              <DialogDescription>
                Wähle eine XLSX-Datei, die importiert werden soll.
                Der Import überschreibt keine Daten, die von Vendon importiert wurden.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              {file && (
                <p className="text-sm text-gray-500">
                  Ausgewählte Datei: {file.name}
                </p>
              )}
            </div>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsImportDialogOpen(false)}
                disabled={isUploading}
              >
                Abbrechen
              </Button>
              <Button 
                onClick={handleImport}
                disabled={!file || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importiere...
                  </>
                ) : (
                  'Importieren'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ExportImportButtons;
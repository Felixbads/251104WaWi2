import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OrderPDFButtonProps {
  orderId: number;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Button-Komponente zum Herunterladen einer Bestellung als PDF
 * Verwendet den neuen, direkten PDF-Endpunkt, der alle Daten selbst zusammensucht
 */
export function OrderPDFButton({ orderId, className, variant = 'outline', size = 'default' }: OrderPDFButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Handler zum Herunterladen des PDFs
  const handleDownloadPDF = async () => {
    try {
      setIsLoading(true);
      
      // Log für Debugging
      console.log(`PDF für Bestellung ${orderId} wird generiert...`);
      
      // Direkter Aufruf des PDF-Endpunkts mit orderId
      // Wir nutzen fetch mit blob-Response für Datei-Downloads
      const response = await fetch(`/api/pdf/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        // Fehler auslesen und als JSON interpretieren, falls möglich
        let errorDetail = 'Unbekannter Fehler';
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || errorData.message || 'PDF konnte nicht generiert werden';
        } catch (e) {
          errorDetail = `Server antwortete mit ${response.status}`;
        }
        
        throw new Error(`PDF konnte nicht generiert werden: ${errorDetail}`);
      }
      
      // PDF-Blob aus der Antwort extrahieren
      const blob = await response.blob();
      
      // Dateinamen aus dem Content-Disposition Header oder fallback verwenden
      let filename = `Bestellung_${orderId}.pdf`;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
      
      // Download-Link erstellen und klicken
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Aufräumen
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Erfolgsmeldung anzeigen
      toast({
        title: 'PDF erfolgreich erstellt',
        description: 'Das PDF wurde heruntergeladen.',
        variant: 'default',
      });
      
    } catch (error) {
      console.error('Fehler beim Herunterladen des PDFs:', error);
      toast({
        title: 'Fehler beim Erstellen des PDFs',
        description: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleDownloadPDF}
      disabled={isLoading}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          PDF wird generiert...
        </>
      ) : (
        <>
          <FileDown className="mr-2 h-4 w-4" />
          PDF herunterladen
        </>
      )}
    </Button>
  );
}
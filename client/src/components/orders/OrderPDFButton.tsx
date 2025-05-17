import React from 'react';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

interface OrderPDFButtonProps {
  orderId: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Direkte PDF-Download-Schaltfläche für Bestellungen
 * Verwendung:
 * <OrderPDFButton orderId={123}>PDF herunterladen</OrderPDFButton>
 */
export function OrderPDFButton({ orderId, children, className }: OrderPDFButtonProps) {
  
  const downloadPDF = async () => {
    try {
      // Direkter Download über den Endpunkt
      const response = await fetch(`/api/pdf/orders/${orderId}`);
      
      if (!response.ok) {
        // Fehlerbehandlung
        const errorData = await response.json();
        console.error("PDF-Fehler:", errorData);
        
        // Fehler als Alert anzeigen
        alert(`Fehler beim Erstellen des PDFs: ${errorData.error || 'Unbekannter Fehler'}`);
        return;
      }
      
      // Blob-Daten aus der Antwort extrahieren
      const blob = await response.blob();
      
      // Download-Link erstellen und klicken
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bestellung_${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Aufräumen
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error("Fehler beim PDF-Download:", error);
      alert("Fehler beim Herunterladen des PDFs. Bitte versuchen Sie es später erneut.");
    }
  };
  
  return (
    <Button 
      onClick={downloadPDF} 
      variant="outline"
      className={className}
      title="Bestellung als PDF herunterladen"
    >
      <FileDown className="mr-2 h-4 w-4" /> {children || "PDF"}
    </Button>
  );
}
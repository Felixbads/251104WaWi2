import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

// PDFGenerator Komponente für zuverlässige PDF-Erstellung
export function usePDFGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const toast = useToast();

  // Aufräumen beim Unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Hauptfunktion zur PDF-Generierung
  const generatePDF = async (orderId: number) => {
    if (!orderId) {
      toast({
        title: "Fehler",
        description: "Keine Bestellungs-ID angegeben",
        variant: "destructive"
      });
      return null;
    }

    setIsGenerating(true);
    
    try {
      console.log(`Starte PDF-Generierung für Bestellung ${orderId}...`);
      
      // 1. Daten vom neuen dediziertem PDF-Daten-Endpunkt abrufen
      const response = await fetch(`/api/orders/${orderId}/pdf-data`);
      
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der PDF-Daten: ${response.status} ${response.statusText}`);
      }
      
      const pdfData = await response.json();
      console.log(`PDF-Daten erfolgreich geladen:`, pdfData);
      
      if (!pdfData.order) {
        throw new Error("Bestellungsdaten konnten nicht geladen werden");
      }

      // Überprüfen, ob Items vorhanden sind
      const items = pdfData.items || [];
      const order = pdfData.order;
      const supplier = pdfData.supplier || { name: order.supplierName || "Unbekannter Lieferant" };
      const warehouse = pdfData.warehouse || { name: order.warehouseName || "Unbekanntes Lager" };
      
      // 2. QR-Code für die Bestellung generieren
      const portalUrl = `${window.location.origin}/order/${orderId}`;
      const qrDataUrl = await QRCode.toDataURL(portalUrl, {
        width: 150,
        margin: 1,
      });
      
      // 3. HTML-Vorlage für die PDF-Generierung erstellen
      const tempDiv = document.createElement('div');
      tempDiv.style.padding = '20px';
      tempDiv.style.maxWidth = '800px';
      tempDiv.style.margin = '0 auto';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      
      // 4. HTML-Inhalt generieren
      tempDiv.innerHTML = `
        <div style="width: 100%; padding: 20px; font-family: Arial, sans-serif;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h1 style="margin: 0; font-size: 24px; color: #333;">Bestellung ${order.orderNumber || `#${order.id}`}</h1>
              <p style="margin: 5px 0; font-size: 14px;">Datum: ${formatDate(order.orderDate)}</p>
            </div>
            <div style="text-align: right;">
              <img id="qrcode-placeholder" src="" alt="QR-Code" style="width: 80px; height: 80px;" />
            </div>
          </div>
          
          <div style="margin-top: 20px; display: flex; justify-content: space-between;">
            <div style="width: 48%;">
              <h3 style="margin: 0; font-size: 16px;">Lieferant:</h3>
              <p style="margin: 5px 0; font-size: 14px;">${supplier.name}</p>
              ${supplier.contactPerson ? `<p style="margin: 2px 0; font-size: 14px;">${supplier.contactPerson}</p>` : ''}
              ${supplier.address ? `<p style="margin: 2px 0; font-size: 14px;">${supplier.address}</p>` : ''}
              ${supplier.phone ? `<p style="margin: 2px 0; font-size: 14px;">Tel: ${supplier.phone}</p>` : ''}
              ${supplier.email ? `<p style="margin: 2px 0; font-size: 14px;">Email: ${supplier.email}</p>` : ''}
            </div>
            <div style="width: 48%;">
              <h3 style="margin: 0; font-size: 16px;">Lieferadresse:</h3>
              <p style="margin: 5px 0; font-size: 14px;">${warehouse.name}</p>
              ${warehouse.address ? `<p style="margin: 2px 0; font-size: 14px;">${warehouse.address}</p>` : ''}
              ${warehouse.contactPerson ? `<p style="margin: 2px 0; font-size: 14px;">Ansprechpartner: ${warehouse.contactPerson}</p>` : ''}
              ${warehouse.phone ? `<p style="margin: 2px 0; font-size: 14px;">Tel: ${warehouse.phone}</p>` : ''}
            </div>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px;">Bestellte Produkte:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <tr style="background-color: #f2f2f2; font-weight: bold;">
                <th style="text-align: left; padding: 8px; font-size: 14px;">Produkt</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Menge</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Preis</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Gesamt</th>
              </tr>
              ${items.length > 0 
                ? items.map(item => `
                  <tr style="border-bottom: 1px solid #ddd;">
                    <td style="text-align: left; padding: 8px; font-size: 14px;">${item.productName || (item.productDetails && (item.productDetails.name || item.productDetails.productName)) || "Unbekanntes Produkt"}</td>
                    <td style="text-align: right; padding: 8px; font-size: 14px;">${item.quantity || 0} ${item.unit || 'stk'}</td>
                    <td style="text-align: right; padding: 8px; font-size: 14px;">${(item.unitPrice || 0).toFixed(2)} €</td>
                    <td style="text-align: right; padding: 8px; font-size: 14px;">${(item.totalPrice || (item.unitPrice * item.quantity) || 0).toFixed(2)} €</td>
                  </tr>
                `).join('')
                : `<tr><td colspan="4" style="text-align: center; padding: 20px; font-size: 14px; font-style: italic;">Keine Produkte gefunden</td></tr>`
              }
              <tr style="font-weight: bold;">
                <td colspan="3" style="text-align: right; padding: 8px; font-size: 14px;">Gesamtsumme:</td>
                <td style="text-align: right; padding: 8px; font-size: 14px;">${
                  order.totalAmount 
                    ? order.totalAmount.toFixed(2) 
                    : (items.reduce((sum, item) => sum + (item.totalPrice || (item.unitPrice * item.quantity) || 0), 0)).toFixed(2)
                } €</td>
              </tr>
            </table>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px;">Zusätzliche Informationen:</h3>
            <p style="margin: 5px 0; font-size: 14px;">Lieferdatum: ${order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : 'Nicht festgelegt'}</p>
            <p style="margin: 5px 0; font-size: 14px;">Priorität: ${order.priority || 'Normal'}</p>
            ${order.notes ? `<p style="margin: 5px 0; font-size: 14px;">Anmerkungen: ${order.notes}</p>` : ''}
          </div>
        </div>
      `;
      
      // 5. Element temporär zum DOM hinzufügen
      document.body.appendChild(tempDiv);
      
      // 6. QR-Code einfügen (wird nicht richtig durch innerHTML gesetzt)
      const qrPlaceholder = tempDiv.querySelector('#qrcode-placeholder');
      if (qrPlaceholder) {
        qrPlaceholder.setAttribute('src', qrDataUrl);
      }
      
      // 7. HTML in Canvas umwandeln
      const canvas = await html2canvas(tempDiv, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      
      // 8. Temporäres Element wieder entfernen
      document.body.removeChild(tempDiv);
      
      // 9. PDF erstellen
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // 10. Berechnungen für die Bildanpassung
      const imgWidth = 190;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      // 11. Bild zum PDF hinzufügen
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      // 12. PDF als Blob speichern
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      
      // 13. URL für die Vorschau erstellen
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      
      // 14. Success-Meldung
      console.log("PDF erfolgreich generiert!");
      toast({
        title: "PDF erfolgreich generiert",
        description: "Das PDF wurde erstellt und kann nun heruntergeladen werden."
      });
      
      return { blob, url };
      
    } catch (error) {
      console.error("Fehler bei PDF-Generierung:", error);
      toast({
        title: "Fehler beim Generieren",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // PDF herunterladen
  const downloadPDF = (filename: string = "Bestellung.pdf") => {
    if (!pdfBlob) {
      toast({
        title: "Fehler",
        description: "Kein PDF zum Herunterladen verfügbar",
        variant: "destructive"
      });
      return;
    }
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // URL-Objekt wieder freigeben
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // PDF drucken
  const printPDF = () => {
    if (!pdfUrl) {
      toast({
        title: "Fehler",
        description: "Kein PDF zum Drucken verfügbar",
        variant: "destructive"
      });
      return;
    }
    
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  return {
    isGenerating,
    pdfBlob,
    pdfUrl,
    generatePDF,
    downloadPDF,
    printPDF,
  };
}
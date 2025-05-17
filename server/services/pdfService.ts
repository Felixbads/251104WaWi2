import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Einfache PDF-Generierung für Bestellungen
 * Verwendet jsPDF für direkte PDF-Erzeugung ohne Browser/Puppeteer
 */
export async function generatePdf(order: any): Promise<Buffer> {
  try {
    console.log('PDF-Generation gestartet für Bestellung:', order.orderNumber);
    console.log('Bestellungsdaten:', JSON.stringify(order, null, 2));
    
    // Neue PDF-Instanz erstellen
    const doc = new jsPDF();
    
    // Daten vorbereiten
    const items = order.orderItems || [];
    console.log(`Anzahl Bestellpositionen: ${items.length}`);
    
    const orderDate = formatDate(order.orderDate || new Date());
    const deliveryDate = formatDate(order.expectedDeliveryDate);
    const orderNumber = order.orderNumber || '';
    const supplierName = order.supplierName || '';
    const warehouseName = order.warehouseName || order.locationName || '';
    
    // Kopfzeile
    doc.setFontSize(16);
    doc.setTextColor(150, 50, 40);
    doc.text('Elbsandstein Proviant & Quartier GmbH', 15, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Bestellung ' + orderNumber, 15, 30);
    
    // Bestelldaten
    doc.setFontSize(10);
    doc.text('Lieferant: ' + supplierName, 15, 45);
    doc.text('Bestelldatum: ' + orderDate, 15, 55);
    doc.text('Lieferdatum: ' + deliveryDate, 15, 65);
    doc.text('Lieferort: ' + warehouseName, 15, 75);
    
    // Artikeltabelle
    const tableData = items.map((item: any) => [
      item.productId || '',
      item.productName || '',
      (item.quantity || 0).toString(),
      (item.unit || 'Stk.'),
      formatPrice(item.unitPrice || 0) + ' €',
      formatPrice((item.unitPrice || 0) * (item.quantity || 0)) + ' €'
    ]);
    
    // Summen berechnen
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.unitPrice || 0) * (item.quantity || 0);
    }, 0);
    
    const vatRate = 19; // Standard-MwSt
    const vatAmount = (totalAmount * vatRate) / 100;
    const totalWithTax = totalAmount + vatAmount;
    
    // Summenzeilen hinzufügen
    tableData.push(['', '', '', '', 'Netto:', formatPrice(totalAmount) + ' €']);
    tableData.push(['', '', '', '', 'MwSt ' + vatRate + '%:', formatPrice(vatAmount) + ' €']);
    tableData.push(['', '', '', '', 'Gesamt:', formatPrice(totalWithTax) + ' €']);
    
    // Tabelle zeichnen
    autoTable(doc, {
      startY: 85,
      head: [['Art.Nr.', 'Bezeichnung', 'Menge', 'Einheit', 'Preis', 'Gesamt']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 60 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20 },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      },
      foot: [['', '', '', '', '', '']],
      didDrawPage: (data) => {
        // Fußzeile
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('Elbsandstein Proviant & Quartier GmbH | Dresdner Str. 2b, 01814 Bad Schandau', 65, pageHeight - 10, { align: 'center' });
      }
    });
    
    // Als Buffer zurückgeben
    return Buffer.from(doc.output('arraybuffer'));
  } catch (error) {
    console.error('Fehler beim Generieren des PDFs:', error);
    throw error;
  }
}

// Hilfsfunktion zum Formatieren eines Datums
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Hilfsfunktion zum Formatieren eines Preises
function formatPrice(price: number): string {
  return price.toFixed(2).replace('.', ',');
}
/**
 * Hilfsfunktionen für die Generierung von E-Mail-Inhalten für Bestellungen
 */

/**
 * Erstellt eine E-Mail-Vorlage für eine Bestellung
 */
export function getOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard'): string {
  const now = new Date().toLocaleDateString('de-DE');
  const deliveryDate = order.expectedDeliveryDate 
    ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') 
    : 'so bald wie möglich';

  // Basis-Vorlage je nach Typ
  let template = '';
  
  switch(templateType) {
    case 'urgent':
    case 'dringend':
      template = `Sehr geehrte Damen und Herren,

DRINGENDE BESTELLUNG - Bitte um bevorzugte Bearbeitung!

hiermit bestellen wir dringend folgende Artikel mit der Bestellnummer ${order.orderNumber}:

{{orderItems}}

Bitte liefern Sie die Ware bis spätestens ${deliveryDate}.
Bei Rückfragen erreichen Sie uns unter der Telefonnummer: 030 123456789.

Vielen Dank für die schnelle Bearbeitung.

Mit freundlichen Grüßen
Ihr Proviantomat Team`;
      break;
      
    case 'reorder':
    case 'nachbestellung':
      template = `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen eine Nachbestellung zu unserer ursprünglichen Bestellung.

Bestellnummer: ${order.orderNumber}
Datum: ${now}

Folgende Artikel bestellen wir nach:

{{orderItems}}

Lieferung bitte bis zum ${deliveryDate}.

Mit freundlichen Grüßen
Ihr Proviantomat Team`;
      break;
      
    default: // Standard-Template
      template = `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{{orderItems}}

Bestellnummer: ${order.orderNumber}
Gewünschter Liefertermin: ${deliveryDate}

${order.notes ? 'Hinweise: ' + order.notes + '\n' : ''}
Mit freundlichen Grüßen
Ihr Proviantomat Team`;
  }
  
  return template;
}

/**
 * Erstellt eine HTML-Tabelle mit den Bestellpositionen
 */
export function createOrderItemsTable(items: any[]): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 'Keine Artikel in dieser Bestellung.';
  }
  
  // Einfache HTML-Tabelle erstellen
  let tableHtml = `
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
  <thead>
    <tr style="background-color: #f2f2f2;">
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Artikel</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Menge</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Einheit</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Einzelpreis</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamt</th>
    </tr>
  </thead>
  <tbody>`;
  
  // Zeilen für jeden Artikel hinzufügen
  items.forEach((item, index) => {
    const productName = item.productName || item.name || 'Unbekannter Artikel';
    const quantity = item.quantity || item.orderQuantity || 1;
    const unit = item.unit || 'Stk.';
    const price = typeof item.price === 'number' ? item.price : 
                 (typeof item.price === 'string' ? parseFloat(item.price) : 0);
    const total = price * quantity;
    
    const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    
    tableHtml += `
    <tr style="background-color: ${bgColor};">
      <td style="border: 1px solid #ddd; padding: 8px;">${productName}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${quantity}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${unit}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${price.toFixed(2)} €</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${total.toFixed(2)} €</td>
    </tr>`;
  });
  
  // Gesamtsumme berechnen
  const subtotal = items.reduce((sum, item) => {
    const quantity = item.quantity || item.orderQuantity || 1;
    const price = typeof item.price === 'number' ? item.price : 
                 (typeof item.price === 'string' ? parseFloat(item.price) : 0);
    return sum + (price * quantity);
  }, 0);
  
  // Tabelle abschließen mit Gesamtsumme
  tableHtml += `
  </tbody>
  <tfoot>
    <tr style="background-color: #f2f2f2; font-weight: bold;">
      <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtsumme:</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${subtotal.toFixed(2)} €</td>
    </tr>
  </tfoot>
</table>`;
  
  return tableHtml;
}

/**
 * Erzeugt den Betreff für eine Bestellungs-E-Mail
 */
export function getOrderEmailSubject(order: any, supplier: any, templateType: string = 'standard'): string {
  const supplierName = order.supplierName || supplier?.name || 'Unbekannt';
  
  switch (templateType) {
    case "dringend":
    case "urgent":
      return `DRINGEND: Bestellung ${order.orderNumber} - ${supplierName}`;
    case "nachbestellung":
    case "reorder":
      return `Nachbestellung ${order.orderNumber} - ${supplierName}`;
    default:
      return `Bestellung ${order.orderNumber} - ${supplierName}`;
  }
}
// Interface für E-Mail-Parameter
export interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Mock-Funktion für E-Mail-Versand (weil wir keine externe Bibliothek verwenden können)
 * In einer Produktionsumgebung würde hier ein richtiger E-Mail-Dienst angebunden werden
 * 
 * @param params - Die E-Mail-Parameter (Empfänger, Absender, Betreff, Text/HTML)
 * @returns Promise<boolean> - true bei Erfolg, false bei Fehler
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    console.log('==== SIMULIERTER E-MAIL-VERSAND ====');
    console.log(`Von: ${params.from}`);
    console.log(`An: ${params.to}`);
    console.log(`Betreff: ${params.subject}`);
    console.log('Inhalt: ' + (params.text || 'HTML-Inhalt (gekürzt)'));
    console.log('==== ENDE DER E-MAIL ====');
    
    // Simuliere einen erfolgreichen E-Mail-Versand
    return true;
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    return false;
  }
}

/**
 * Erstellt eine HTML-Tabelle aus Bestellpositionen
 * 
 * @param items - Array mit Bestellpositionen
 * @returns string - HTML-Code für die Tabelle
 */
export function createOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p>Keine Bestellpositionen vorhanden.</p>';
  }

  const tableRows = items.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.productName || 'Unbekanntes Produkt'}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.sku || item.supplierSku || '-'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity} ${item.unit || 'Stk.'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.totalPrice)}</td>
    </tr>
  `).join('');

  return `
    <table style="border-collapse: collapse; width: 100%; margin-top: 20px; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Pos.</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Artikel</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Art.-Nr.</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Menge</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Einzelpreis</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtpreis</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}

/**
 * Formatiert einen Betrag als Währung
 */
function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

/**
 * Erstellt den Standard-Betreff für eine Bestellung
 */
export function createOrderSubject(orderNumber: string, supplierName: string): string {
  return `Bestellung ${orderNumber} - ${supplierName}`;
}

// Unternehmensdetails
export const companyDetails = {
  name: "Elbsandstein Proviant & Quartier GmbH",
  address: "Seifhennersdorfer Str. 14",
  city: "01099 Dresden",
  phone: "0173 - 4385330",
  website: "www.proviantomat.de",
  brandName: "Proviantomat",
  contactPerson: "Felix Zschoge"
};

/**
 * Verschiedene E-Mail-Vorlagen für Bestellungen
 */
export const emailTemplates = {
  standard: (order: any, supplier: any, companyInfo = companyDetails) => {
    const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'Unbekannt';
    const expectedDeliveryDate = order.expectedDeliveryDate 
      ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') 
      : 'Nach Vereinbarung';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="padding: 20px; background-color: #f8f9fa; border-bottom: 3px solid #5c6ac4;">
          <h1 style="color: #333; margin: 0;">Bestellung: ${order.orderNumber}</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>hiermit bestellen wir folgende Artikel:</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #5c6ac4;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div>
                <strong>Bestellnummer:</strong> ${order.orderNumber}<br>
                <strong>Bestelldatum:</strong> ${orderDate}<br>
                <strong>Gewünschtes Lieferdatum:</strong> ${expectedDeliveryDate}
              </div>
              <div>
                <strong>Lieferant:</strong><br>
                ${supplier.name}<br>
                ${supplier.contactPerson || ''}<br>
                ${supplier.address || ''}<br>
                ${supplier.postalCode || ''} ${supplier.city || ''}<br>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 30px;">
            {{orderItems}}
          </div>
          
          <p>Bitte bestätigen Sie uns den Erhalt dieser Bestellung und das voraussichtliche Lieferdatum.</p>
          
          <p>Mit freundlichen Grüßen,<br>
          ${companyInfo.contactPerson}<br>
          ${companyInfo.brandName}</p>
        </div>
        
        <div style="padding: 0 20px 20px; border-top: 1px solid #eee; margin-top: 30px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            ${companyInfo.name}<br>
            ${companyInfo.address} | ${companyInfo.city} | ${companyInfo.phone}<br>
            ${companyInfo.website}
          </p>
        </div>
      </div>
    `;
  },
  
  dringend: (order: any, supplier: any, companyInfo = companyDetails) => {
    const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'Unbekannt';
    const expectedDeliveryDate = order.expectedDeliveryDate 
      ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') 
      : 'Nach Vereinbarung';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="padding: 20px; background-color: #ffebee; border-bottom: 3px solid #f44336;">
          <h1 style="color: #d32f2f; margin: 0;">DRINGEND: Bestellung ${order.orderNumber}</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p><strong>Diese Bestellung ist dringend und wir benötigen die Artikel schnellstmöglich!</strong></p>
          
          <p>Hiermit bestellen wir folgende Artikel:</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #ffebee; border-left: 4px solid #f44336;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div>
                <strong>Bestellnummer:</strong> ${order.orderNumber}<br>
                <strong>Bestelldatum:</strong> ${orderDate}<br>
                <strong>Gewünschtes Lieferdatum:</strong> <span style="color: #d32f2f; font-weight: bold;">${expectedDeliveryDate}</span>
              </div>
              <div>
                <strong>Lieferant:</strong><br>
                ${supplier.name}<br>
                ${supplier.contactPerson || ''}<br>
                ${supplier.address || ''}<br>
                ${supplier.postalCode || ''} ${supplier.city || ''}<br>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 30px;">
            {{orderItems}}
          </div>
          
          <p>Bitte bestätigen Sie den Erhalt dieser Bestellung umgehend und geben Sie uns das genaue Lieferdatum an.</p>
          
          <p>Vielen Dank für die schnelle Bearbeitung!</p>
          
          <p>Mit freundlichen Grüßen,<br>
          ${companyInfo.contactPerson}<br>
          ${companyInfo.brandName}</p>
        </div>
        
        <div style="padding: 0 20px 20px; border-top: 1px solid #eee; margin-top: 30px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            ${companyInfo.name}<br>
            ${companyInfo.address} | ${companyInfo.city} | ${companyInfo.phone}<br>
            ${companyInfo.website}
          </p>
        </div>
      </div>
    `;
  },
  
  nachbestellung: (order: any, supplier: any, companyInfo = companyDetails) => {
    const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'Unbekannt';
    const expectedDeliveryDate = order.expectedDeliveryDate 
      ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') 
      : 'Nach Vereinbarung';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="padding: 20px; background-color: #e3f2fd; border-bottom: 3px solid #2196f3;">
          <h1 style="color: #0d47a1; margin: 0;">Nachbestellung: ${order.orderNumber}</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>hiermit senden wir Ihnen eine Nachbestellung für unseren regulären Bedarf:</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196f3;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div>
                <strong>Bestellnummer:</strong> ${order.orderNumber}<br>
                <strong>Bestelldatum:</strong> ${orderDate}<br>
                <strong>Gewünschtes Lieferdatum:</strong> ${expectedDeliveryDate}
              </div>
              <div>
                <strong>Lieferant:</strong><br>
                ${supplier.name}<br>
                ${supplier.contactPerson || ''}<br>
                ${supplier.address || ''}<br>
                ${supplier.postalCode || ''} ${supplier.city || ''}<br>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 30px;">
            {{orderItems}}
          </div>
          
          <p>Bitte liefern Sie gemäß unserer regulären Konditionen. Bei Fragen stehen wir gerne zur Verfügung.</p>
          
          <p>Mit freundlichen Grüßen,<br>
          ${companyInfo.contactPerson}<br>
          ${companyInfo.brandName}</p>
        </div>
        
        <div style="padding: 0 20px 20px; border-top: 1px solid #eee; margin-top: 30px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            ${companyInfo.name}<br>
            ${companyInfo.address} | ${companyInfo.city} | ${companyInfo.phone}<br>
            ${companyInfo.website}
          </p>
        </div>
      </div>
    `;
  }
};

/**
 * Erstellt eine Standard-E-Mail-Vorlage für eine Bestellung
 */
export function createOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard'): string {
  // Wählt die entsprechende Vorlage oder die Standardvorlage, wenn der angegebene Typ nicht existiert
  const templateFunction = emailTemplates[templateType] || emailTemplates.standard;
  return templateFunction(order, supplier, companyDetails);
}
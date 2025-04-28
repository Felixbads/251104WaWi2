import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';

/**
 * Generiert ein PDF basierend auf einer Bestellung
 */
export async function generatePdf(order: any): Promise<Buffer> {
  try {
    // Template aus Datei laden (falls vorhanden) oder Standard-Template verwenden
    let templateHtml;
    const templatePath = path.join(process.cwd(), 'templates', 'order-template.hbs');
    
    if (fs.existsSync(templatePath)) {
      templateHtml = fs.readFileSync(templatePath, 'utf-8');
    } else {
      // Standard-Template aus String
      templateHtml = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .logo { margin-right: 20px; }
    .company-name { font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #9c3028; }
    .addresses { display: flex; justify-content: space-between; flex: 1; }
    .address-block { margin-bottom: 8px; width: 48%; }
    .meta, .items { width: 100%; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f3f3f3; }
    .footer { text-align: center; font-size: 10px; color: #666; margin-top: 32px; }
    .company-header { display: flex; align-items: center; margin-bottom: 15px; }
    .subtitle { font-size: 14px; color: #666; margin-top: -5px; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="company-header">
    <div class="logo">
      <img src="data:image/png;base64,{{logoBase64}}" alt="Proviantomat Logo" style="max-height:80px;" />
    </div>
    <div>
      <div class="company-name">Elbsandstein Proviant & Quartier GmbH</div>
      <div class="subtitle">Bestellung / Auftragsbestätigung</div>
    </div>
  </div>

  <div class="header">
    <div class="addresses">
      <div class="address-block">
        <strong>Absender:</strong><br/>
        Elbsandstein Proviant & Quartier GmbH<br/>
        Dresdner Str. 2b<br/>
        01814 Bad Schandau<br/>
        Telefon: 035022 / 500911<br/>
        E-Mail: info@elbsandstein-proviant.de
      </div>
      <div class="address-block">
        <strong>Lieferant:</strong><br/>
        {{supplierName}}<br/>
        {{supplierAddress}}<br/>
        {{#if supplierEmail}}{{supplierEmail}}{{/if}}
      </div>
    </div>
  </div>

  <div class="meta">
    <table>
      <tr>
        <th>Bestell-Nr.</th><td>{{orderNumber}}</td>
        <th>Datum</th><td>{{orderDate}}</td>
      </tr>
      <tr>
        <th>Lieferdatum</th><td>{{expectedDeliveryDate}}</td>
        <th>Priorität</th><td>{{priority}}</td>
      </tr>
      <tr>
        <th>Lieferort</th><td colspan="3">{{warehouseName}}</td>
      </tr>
      {{#if notes}}
      <tr>
        <th>Notizen</th><td colspan="3">{{notes}}</td>
      </tr>
      {{/if}}
    </table>
  </div>

  <div class="items">
    <table>
      <thead>
        <tr>
          <th>Pos.</th>
          <th>Art.-Nr.</th>
          <th>Bezeichnung</th>
          <th>Menge</th>
          <th>Einheit</th>
          <th>Einz.Preis</th>
          <th>Gesamtpreis</th>
        </tr>
      </thead>
      <tbody>
        {{#each orderItems}}
        <tr>
          <td>{{position}}</td>
          <td>{{productId}}</td>
          <td>{{productName}}</td>
          <td style="text-align:right">{{quantity}}</td>
          <td>{{unit}}</td>
          <td style="text-align:right">{{unitPrice}} €</td>
          <td style="text-align:right">{{totalPrice}} €</td>
        </tr>
        {{/each}}
        <tr>
          <td colspan="5"></td>
          <th style="text-align:right">Netto:</th>
          <td style="text-align:right">{{totalAmount}} €</td>
        </tr>
        <tr>
          <td colspan="5"></td>
          <th style="text-align:right">MwSt {{vatRate}}%:</th>
          <td style="text-align:right">{{vatAmount}} €</td>
        </tr>
        <tr style="font-weight:bold">
          <td colspan="5"></td>
          <th style="text-align:right">Gesamt:</th>
          <td style="text-align:right">{{totalWithTax}} €</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    Wir bitten um schnellstmögliche Lieferung. Bei Rückfragen stehen wir gerne zur Verfügung.<br>
    Elbsandstein Proviant & Quartier GmbH | Dresdner Str. 2b, 01814 Bad Schandau | Steuernummer: 210/108/11389
  </div>

</body>
</html>
      `;
    }
    
    // Logo als Base64 (falls vorhanden) laden
    let logoBase64 = '';
    const logoPath = path.join(process.cwd(), 'public', 'images', 'Proviantomat_Logo_rot.png');
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString('base64');
    }
    
    // Handlebars Template kompilieren
    const template = handlebars.compile(templateHtml);
    
    // Daten für das Template vorbereiten
    const orderItems = order.orderItems || [];
    const vatRate = 19; // Standard-MwSt-Satz
    
    // Berechnung der Summen
    const totalAmount = orderItems.reduce((sum: number, item: any) => {
      return sum + (item.unitPrice || 0) * (item.quantity || 0);
    }, 0);
    
    const vatAmount = (totalAmount * vatRate) / 100;
    const totalWithTax = totalAmount + vatAmount;
    
    // Daten für das Template
    const templateData = {
      logoBase64,
      orderNumber: order.orderNumber || '',
      orderDate: formatDate(order.orderDate || new Date()),
      expectedDeliveryDate: formatDate(order.expectedDeliveryDate),
      priority: order.priority || 'Normal',
      warehouseName: order.warehouseName || order.locationName || '',
      supplierName: order.supplierName || '',
      supplierAddress: order.supplierAddress || '',
      supplierEmail: order.supplierEmail || '',
      notes: order.notes || '',
      orderItems: orderItems.map((item: any, index: number) => ({
        position: index + 1,
        productId: item.productId || '',
        productName: item.productName || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'Stk.',
        unitPrice: formatPrice(item.unitPrice || 0),
        totalPrice: formatPrice((item.unitPrice || 0) * (item.quantity || 0))
      })),
      totalAmount: formatPrice(totalAmount),
      vatRate,
      vatAmount: formatPrice(vatAmount),
      totalWithTax: formatPrice(totalWithTax)
    };
    
    // HTML generieren
    const html = template(templateData);
    
    // Im Debug-Modus die generierte HTML-Datei speichern
    if (process.env.NODE_ENV === 'development') {
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      fs.writeFileSync(path.join(tempDir, `order_${order.orderNumber || order.id}_template.html`), html);
    }
    
    // PDF mit Puppeteer generieren
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // HTML setzen
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // PDF generieren
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    });
    
    await browser.close();
    
    return pdfBuffer;
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
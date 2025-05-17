/**
 * Zuverlässiger PDF-Generierungsdienst (Neue Version)
 * 
 * Dieser Service arbeitet direkt mit der Datenbank und ist komplett unabhängig 
 * vom State der Anwendung. Er erzeugt zuverlässig PDFs für Bestellungen.
 */

import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { orders, orderItems, products, suppliers, warehouses } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Firmendaten für Elbsandstein Proviant
const companyData = {
  name: "Elbsandstein Proviant & Quartier GmbH",
  address: "Dresdner Str. 2b",
  city: "01814 Bad Schandau",
  country: "Deutschland",
  phone: "035022 / 500911",
  email: "info@elbsandstein-proviant.de",
  website: "www.elbsandstein-proviant.de",
  taxId: "210/108/11389"
};

// Logo als Base64 damit es immer verfügbar ist, unabhängig von externen Dateien
const logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjUwIiB2aWV3Qm94PSIwIDAgMjAwIDUwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgogIDx0ZXh0IHg9IjEwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzljMzAyOCI+RWxic2FuZHN0ZWluPC90ZXh0PgogIDxwYXRoIGQ9Ik0xMCA0MCBMMTkwIDQwIiBzdHJva2U9IiM5YzMwMjgiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=';

/**
 * Lädt alle Daten einer Bestellung direkt aus der Datenbank
 * Dieser Ansatz umgeht alle Zwischenschichten für maximale Zuverlässigkeit
 */
async function getCompleteOrderData(orderId: number) {
  console.log(`[PDF] Lade vollständige Bestelldaten für ID ${orderId} direkt aus der Datenbank`);
  
  try {
    // 1. Basisdaten der Bestellung laden
    const orderData = await db.query.orders.findFirst({
      where: eq(orders.id, orderId)
    });
    
    if (!orderData) {
      throw new Error(`Bestellung mit ID ${orderId} nicht gefunden`);
    }
    
    // 2. Bestellpositionen laden
    const itemsData = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    console.log(`[PDF] ${itemsData.length} Bestellpositionen für Bestellung ${orderData.orderNumber} gefunden`);
    
    // 3. Lieferantendaten laden (falls vorhanden)
    let supplierData = null;
    if (orderData.supplierId) {
      supplierData = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, orderData.supplierId)
      });
    }
    
    // 4. Lagerdaten laden (falls vorhanden)
    let warehouseData = null;
    if (orderData.locationId) {
      warehouseData = await db.query.warehouses.findFirst({
        where: eq(warehouses.id, orderData.locationId)
      });
    }
    
    // 5. Für jede Bestellposition die vollständigen Produktdaten laden
    const enrichedItems = await Promise.all(
      itemsData.map(async (item, index) => {
        // Produktdaten laden, wenn eine ID vorhanden ist
        let productData = null;
        if (item.productId) {
          try {
            productData = await db.query.products.findFirst({
              where: eq(products.id, item.productId)
            });
          } catch (err) {
            console.error(`[PDF] Fehler beim Laden des Produkts ID ${item.productId}:`, err);
          }
        }
        
        // Bestellposition anreichern
        return {
          ...item,
          positionNumber: index + 1, // 1-basierte Position
          productName: item.productName || 
                      (productData?.productName) || 
                      (productData && 'name' in productData ? productData.name : null) || 
                      "Produkt ohne Namen",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          totalPrice: (item.totalPrice) || ((item.quantity || 1) * (item.unitPrice || 0)),
          unit: item.unit || "Stk.",
          vatRate: item.vatRate || 19
        };
      })
    );
    
    // 6. Gesamtbeträge berechnen
    const totalAmount = enrichedItems.reduce((sum, item) => {
      return sum + (item.totalPrice || (item.quantity * item.unitPrice));
    }, 0);
    
    const vatAmount = enrichedItems.reduce((sum, item) => {
      const itemTotal = item.totalPrice || (item.quantity * item.unitPrice);
      const vatRate = item.vatRate || 19;
      return sum + (itemTotal * vatRate / 100);
    }, 0);
    
    // 7. Vollständiges Datenobjekt zusammenstellen
    return {
      ...orderData,
      orderItems: enrichedItems,
      supplierName: orderData.supplierName || supplierData?.name || "Unbekannter Lieferant",
      supplierAddress: supplierData?.address || "",
      supplierEmail: supplierData?.email || "",
      locationName: orderData.locationName || warehouseData?.name || "Hauptlager",
      supplier: supplierData,
      location: warehouseData,
      totalAmount: totalAmount,
      vatAmount: vatAmount,
      totalWithTax: totalAmount + vatAmount
    };
  } catch (error) {
    console.error("[PDF] Fehler beim Laden der Bestelldaten:", error);
    throw new Error(`Konnte Bestelldaten nicht laden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
}

// Helper-Funktionen für das Template
Handlebars.registerHelper('formatDate', function(date: string | Date | null | undefined) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
});

Handlebars.registerHelper('formatCurrency', function(value: number | null | undefined) {
  if (value === null || value === undefined) return '0,00';
  return value.toFixed(2).replace('.', ',');
});

Handlebars.registerHelper('add', function(a: number, b: number) {
  return a + b;
});

/**
 * Generiert ein PDF für eine Bestellung direkt aus der Datenbank
 * @param orderId Die ID der Bestellung
 * @returns Ein Buffer mit dem PDF-Inhalt
 */
export async function generatePdf(orderId: number): Promise<Buffer> {
  try {
    // 1. Alle Daten für die Bestellung direkt aus der Datenbank laden
    const orderData = await getCompleteOrderData(orderId);
    console.log(`[PDF] Vollständige Daten für Bestellung ${orderId} geladen, erstelle PDF...`);
    
    // 2. HTML-Template für die PDF-Generierung
    const templateHtml = `<!DOCTYPE html>
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
    .text-right { text-align: right; }
  </style>
</head>
<body>
  <div class="company-header">
    <div class="logo">
      <img src="${logoBase64}" alt="Logo" height="50">
    </div>
    <div>
      <div class="company-name">{{company.name}}</div>
      <div>{{company.address}}, {{company.city}}</div>
    </div>
  </div>

  <h1>Bestellung {{order.orderNumber}}</h1>
  <div class="subtitle">vom {{formatDate order.orderDate}}</div>

  <div class="addresses">
    <div class="address-block">
      <h3>Lieferant</h3>
      <div>{{order.supplierName}}</div>
      {{#if order.supplierAddress}}<div>{{order.supplierAddress}}</div>{{/if}}
      {{#if order.supplierEmail}}<div>E-Mail: {{order.supplierEmail}}</div>{{/if}}
    </div>

    <div class="address-block">
      <h3>Lieferort</h3>
      <div>{{order.locationName}}</div>
    </div>
  </div>

  <div class="meta">
    <table>
      <tr>
        <th>Bestelldatum</th>
        <th>Gewünschtes Lieferdatum</th>
        <th>Priorität</th>
        <th>Status</th>
      </tr>
      <tr>
        <td>{{formatDate order.orderDate}}</td>
        <td>{{#if order.expectedDeliveryDate}}{{formatDate order.expectedDeliveryDate}}{{else}}-{{/if}}</td>
        <td>{{#if order.priority}}{{order.priority}}{{else}}-{{/if}}</td>
        <td>{{order.status}}</td>
      </tr>
    </table>
  </div>

  <h3>Bestellte Produkte</h3>
  {{#if order.orderItems.length}}
  <div class="items">
    <table>
      <tr>
        <th>Pos.</th>
        <th>Artikel-Nr.</th>
        <th>Produkt</th>
        <th>Menge</th>
        <th>Einheit</th>
        <th>Einzelpreis</th>
        <th>Gesamt</th>
      </tr>
      {{#each order.orderItems}}
      <tr>
        <td class="text-right">{{positionNumber}}</td>
        <td>{{productId}}</td>
        <td>{{productName}}</td>
        <td class="text-right">{{quantity}}</td>
        <td>{{unit}}</td>
        <td class="text-right">{{formatCurrency unitPrice}} €</td>
        <td class="text-right">{{formatCurrency totalPrice}} €</td>
      </tr>
      {{/each}}
    </table>
  </div>

  <div style="margin-top: 20px; text-align: right;">
    <table style="width: 300px; margin-left: auto;">
      <tr>
        <th>Gesamtsumme (netto)</th>
        <td class="text-right">{{formatCurrency order.totalAmount}} €</td>
      </tr>
      <tr>
        <th>MwSt. (19%)</th>
        <td class="text-right">{{formatCurrency order.vatAmount}} €</td>
      </tr>
      <tr>
        <th>Gesamtsumme (brutto)</th>
        <td class="text-right">{{formatCurrency order.totalWithTax}} €</td>
      </tr>
    </table>
  </div>
  {{else}}
  <div style="border: 1px solid #ddd; padding: 20px; text-align: center; color: #888;">
    <p>Keine Produkte in dieser Bestellung.</p>
  </div>
  {{/if}}

  {{#if order.notes}}
  <div style="margin-top: 20px;">
    <h3>Anmerkungen</h3>
    <div style="border: 1px solid #ddd; padding: 10px;">
      {{order.notes}}
    </div>
  </div>
  {{/if}}

  <div class="footer">
    <p>{{company.name}} - {{company.address}}, {{company.city}} - Tel: {{company.phone}} - E-Mail: {{company.email}}</p>
    <p>USt-IdNr: {{company.taxId}} - {{company.website}}</p>
  </div>
</body>
</html>`;

    // 3. Template kompilieren und HTML generieren
    const compiledTemplate = Handlebars.compile(templateHtml);
    const templateData = {
      company: companyData,
      order: orderData
    };
    
    const html = compiledTemplate(templateData);
    
    // 4. Puppeteer starten und PDF generieren
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // 5. PDF konfigurieren und generieren
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();
    
    console.log(`[PDF] PDF erfolgreich generiert (${pdfBuffer.length} Bytes)`);
    return pdfBuffer;
    
  } catch (error) {
    console.error('[PDF] Fehler bei der PDF-Generierung:', error);
    throw new Error(`PDF-Generierung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
}

/**
 * Legacy-Kompatibilitätsfunktion, die das neue Format nutzt
 */
export async function generateOrderPDF(orderData: any): Promise<Buffer> {
  console.log('[PDF] Legacy-Funktion wurde aufgerufen, verwende neue PDF-Generierungsfunktion');
  if (!orderData || !orderData.id) {
    throw new Error('Ungültige Bestellungsdaten: ID fehlt');
  }
  return generatePdf(orderData.id);
}
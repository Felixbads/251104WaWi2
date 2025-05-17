/**
 * PDF-Generierungsdienst
 * Dieser Service kümmert sich um die Generierung von PDFs für Bestellungen
 */

import { compile } from 'handlebars';
import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// Standard-Daten für die Firma
const companyData = {
  name: "Landfein GmbH",
  address: "Hauptstraße 1",
  city: "01445 Radebeul",
  country: "Deutschland",
  phone: "+49 (0) 351 123456",
  email: "info@landfein.de",
  website: "www.landfein.de",
  taxId: "DE123456789"
};

const logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjUwIiB2aWV3Qm94PSIwIDAgMjAwIDUwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgogIDx0ZXh0IHg9IjEwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzljMzAyOCI+TGFuZGZlaW48L3RleHQ+CiAgPHBhdGggZD0iTTEwIDQwIEwxOTAgNDAiIHN0cm9rZT0iIzljMzAyOCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPg==';

// Template-Cache
let compiledTemplate: HandlebarsTemplateDelegate | null = null;

/**
 * Generiert ein PDF aus einer Bestellung
 * @param orderData - Die Bestelldaten mit Bestellpositionen
 * @returns Ein Buffer mit dem generierten PDF
 */
export async function generatePdf(orderData: any): Promise<Buffer> {
  try {
    console.log('PDF-Generierung gestartet mit Daten:', JSON.stringify(orderData, null, 2));

    // Prüfe, ob orderItems vorhanden sind
    if (!orderData.orderItems || orderData.orderItems.length === 0) {
      console.warn('Keine Bestellpositionen für PDF gefunden');
    }

    // Template kompilieren (mit Caching)
    if (!compiledTemplate) {
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
  </style>
</head>
<body>
  <div class="company-header">
    <div class="logo">
      <img src="${logoBase64}" alt="Logo" height="50">
    </div>
    <div>
      <div class="company-name">{{company.name}}</div>
      <div>{{company.address}}, {{company.city}}, {{company.country}}</div>
    </div>
  </div>

  <h1>Bestellung {{order.orderNumber}}</h1>
  <div class="subtitle">vom {{formatDate order.orderDate}}</div>

  <div class="addresses">
    <div class="address-block">
      <h3>Lieferant</h3>
      <div>{{order.supplierName}}</div>
      {{#if order.supplier}}
        {{#if order.supplier.address}}<div>{{order.supplier.address}}</div>{{/if}}
        {{#if order.supplier.city}}
          <div>
            {{#if order.supplier.postalCode}}{{order.supplier.postalCode}}{{/if}} 
            {{order.supplier.city}}
          </div>
        {{/if}}
        {{#if order.supplier.country}}<div>{{order.supplier.country}}</div>{{/if}}
      {{/if}}
    </div>

    <div class="address-block">
      <h3>Lieferort</h3>
      <div>{{order.locationName}}</div>
      {{#if order.location}}
        {{#if order.location.address}}<div>{{order.location.address}}</div>{{/if}}
        {{#if order.location.city}}
          <div>
            {{#if order.location.postalCode}}{{order.location.postalCode}}{{/if}} 
            {{order.location.city}}
          </div>
        {{/if}}
      {{/if}}
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
        <th>Produkt</th>
        <th>Menge</th>
        <th>Einheit</th>
        <th>Einzelpreis</th>
        <th>Gesamt</th>
        <th>MwSt.</th>
      </tr>
      {{#each order.orderItems}}
      <tr>
        <td>{{positionNumber}}</td>
        <td>{{productName}}</td>
        <td>{{quantity}}</td>
        <td>{{unit}}</td>
        <td>{{formatCurrency unitPrice}} €</td>
        <td>{{formatCurrency totalPrice}} €</td>
        <td>{{vatRate}}%</td>
      </tr>
      {{/each}}
    </table>
  </div>

  <div style="margin-top: 20px; text-align: right;">
    <table style="width: 300px; margin-left: auto;">
      <tr>
        <th>Gesamtsumme (netto)</th>
        <td>{{formatCurrency order.totalAmount}} €</td>
      </tr>
      <tr>
        <th>MwSt.</th>
        <td>{{formatCurrency order.vatAmount}} €</td>
      </tr>
      <tr>
        <th>Gesamtsumme (brutto)</th>
        <td>{{formatCurrency (add order.totalAmount order.vatAmount)}} €</td>
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
    <p>USt-IdNr: {{company.taxId}} - www.landfein.de</p>
  </div>
</body>
</html>`;

      // Helper-Funktionen für das Template registrieren
      const helpers = {
        formatDate: function(date: string | Date | null | undefined) {
          if (!date) return '-';
          const d = new Date(date);
          return d.toLocaleDateString('de-DE');
        },
        formatCurrency: function(value: number | null | undefined) {
          if (value === null || value === undefined) return '0,00';
          return value.toFixed(2).replace('.', ',');
        },
        add: function(a: number, b: number) {
          return a + b;
        }
      };

      // Kompiliere das Template mit Handlebars
      compiledTemplate = compile(templateHtml);
      Object.entries(helpers).forEach(([name, fn]) => {
        // @ts-ignore
        compile.registerHelper(name, fn);
      });
    }

    // Berechne den Gesamtbetrag und die MwSt. falls nicht angegeben
    let totalAmount = orderData.totalAmount || 0;
    let vatAmount = orderData.vatAmount || 0;

    // Berechne Gesamtbetrag und MwSt. aus den Bestellpositionen, falls vorhanden
    if (orderData.orderItems && orderData.orderItems.length > 0 && !totalAmount) {
      totalAmount = orderData.orderItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
      
      // Standard-MwSt. von 19% anwenden, wenn keine spezifischen Sätze angegeben sind
      vatAmount = orderData.orderItems.reduce((sum: number, item: any) => {
        const vatRate = item.vatRate || 19;
        return sum + ((item.totalPrice || 0) * vatRate / 100);
      }, 0);
    }

    // Vollständige Daten für das Template
    const templateData = {
      company: companyData,
      order: {
        ...orderData,
        totalAmount,
        vatAmount
      }
    };

    // HTML generieren
    const html = compiledTemplate(templateData);

    // Puppeteer starten und PDF generieren
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // PDF konfigurieren und generieren
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();
    
    console.log(`PDF erfolgreich generiert (${pdfBuffer.length} Bytes)`);
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Fehler bei der PDF-Generierung:', error);
    throw new Error(`PDF-Generierung fehlgeschlagen: ${error.message}`);
  }
}
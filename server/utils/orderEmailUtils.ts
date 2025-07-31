import { createTransport } from 'nodemailer';
import { orders, orderItems, suppliers, purchaseConditions } from '../../shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';

// Prüfen, ob SendGrid-API-Key vorhanden ist
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Standard-E-Mail-Absender
const DEFAULT_FROM_EMAIL = 'orders@proviantomat.de';

/**
 * Formatiert ein Datum nach deutschem Format
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  } catch (error) {
    console.error('Fehler beim Formatieren des Datums:', error);
    return '';
  }
}

/**
 * Erstellt die HTML-Tabelle für Bestellpositionen
 */
export function createOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p>Keine Positionen in dieser Bestellung.</p>';
  }

  // HTML-Tabelle erstellen mit separater "Art.-Nr. Lieferant"-Spalte
  let tableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: center;">Pos.</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Art.-Nr.</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Bezeichnung</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Art.-Nr. Lieferant</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Menge</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Einheit</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Zeilen für jede Position
  items.forEach((item, index) => {
    const quantity = item.quantity || 0;
    const positionNumber = index + 1;

    tableHtml += `
      <tr>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: center;">${positionNumber}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.sku || '-'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.productName || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.supplier_article_number || '-'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${quantity}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.unit || 'Stk.'}</td>
      </tr>
    `;
  });

  // Summenzeile
  const totalAmount = items.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 0)), 0);

  tableHtml += `
      </tbody>
      <tfoot>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtbetrag (netto):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount)}</td>
        </tr>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">MwSt. (19%):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount * 0.19)}</td>
        </tr>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtbetrag (brutto):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount * 1.19)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return tableHtml;
}

/**
 * Formatiert einen Betrag als Euro-Währung
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

function generateStandardEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string, isPickup: boolean): string {
  let content = `Sehr geehrte Damen und Herren,

hiermit möchten wir folgende Bestellung aufgeben:

Bestellnummer: ${order.orderNumber}
Bestelldatum: ${orderDate}
${isPickup ? 'Gewünschter Abholtermin' : 'Gewünschter Liefertermin'}: ${deliveryDate}

${isPickup ? 'Abholort' : 'Lieferadresse'}:
${order.deliveryLocation || order.warehouseName || 'Elbsandstein Proviant & Quartier GmbH'}
${order.deliveryAddress || 'Pirnaer Str. 19\n01829 Stadt Wehlen\nDeutschland'}

Lieferart: ${isPickup ? 'Abholung' : 'Lieferung'}

Bestellpositionen:
`;
  return content;
}

function generateUrgentEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string, isPickup: boolean): string {
  let content = `*** DRINGENDE BESTELLUNG ***

Sehr geehrte Damen und Herren,

bitte bearbeiten Sie diese Bestellung mit HÖCHSTER PRIORITÄT:

Bestellnummer: ${order.orderNumber}
Bestelldatum: ${orderDate}
${isPickup ? 'DRINGENDER Abholtermin' : 'DRINGENDER Liefertermin'}: ${deliveryDate}

${isPickup ? 'Abholort' : 'Lieferadresse'}:
${order.deliveryLocation || order.warehouseName || 'Elbsandstein Proviant & Quartier GmbH'}
${order.deliveryAddress || 'Pirnaer Str. 19\n01829 Stadt Wehlen\nDeutschland'}

Lieferart: ${isPickup ? 'Abholung' : 'Lieferung'}

DRINGENDE Bestellpositionen:
`;
  return content;
}

/**
 * Erstellt eine E-Mail-Vorlage für eine Bestellung
 */
export function createOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard'): string {
  // Template je nach Typ auswählen
  let template = '';

  switch (templateType) {
    case 'urgent':
    case 'dringend':
      template = `<h2 style="color: #e11d48;">!! DRINGENDE BESTELLUNG !!</h2>
        <p>Sehr geehrter Lieferant {{supplierName}},</p>
        <p><strong>wir benötigen dringend folgende Artikel und bitten um schnellstmögliche Lieferung:</strong></p>
        {{orderItems}}
        <p>Bitte bestätigen Sie den Empfang dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
        <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
        <p>Mit freundlichen Grüßen<br>Ihr Proviantomat Team</p>`;
      break;

    case 'reorder':
    case 'nachbestellung':
      template = `<h2 style="color: #0891b2;">Nachbestellung</h2>
        <p>Sehr geehrter Lieferant {{supplierName}},</p>
        <p>hiermit bestellen wir in Ergänzung zu unserer vorherigen Bestellung folgende Artikel:</p>
        {{orderItems}}
        <p>Diese Bestellung bezieht sich auf unsere vorherige Bestellung <strong>{{orderNumber}}</strong> vom {{orderDate}}.</p>
        <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
        <p>Mit freundlichen Grüßen<br>Ihr Proviantomat Team</p>`;
      break;

    default: // standard
      template = `<h2>Bestellung {{orderNumber}}</h2>
        <p>Sehr geehrter Lieferant {{supplierName}},</p>
        <p>hiermit bestellen wir folgende Artikel:</p>
        {{orderItems}}
        <p>Lieferadresse: {{warehouseName}}, {{warehouseAddress}}</p>
        <p>Bitte liefern Sie die Ware innerhalb der vereinbarten Lieferzeit.</p>
        <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
        <p>Mit freundlichen Grüßen<br>Ihr Proviantomat Team</p>`;
  }

  // Platzhalter ersetzen
  const compiled = template
    .replace('{{supplierName}}', supplier.name || order.supplierName || 'Unbekannt')
    .replace('{{orderNumber}}', order.orderNumber || `#${order.id}`)
    .replace('{{orderDate}}', formatDate(order.orderDate))
    .replace('{{warehouseName}}', order.warehouseName || 'Hauptlager')
    .replace('{{warehouseAddress}}', order.warehouseAddress || 'Keine Adresse angegeben');

  return compiled;
}

/**
 * Sendet eine E-Mail für eine Bestellung
 */
export async function sendOrderEmail(
  to: string, 
  from: string, 
  subject: string, 
  html: string, 
  orderId: number
): Promise<boolean> {
  try {
    console.log(`[sendOrderEmail] Sende E-Mail an: ${to}`);
    console.log(`[sendOrderEmail] Von: ${from}`);
    console.log(`[sendOrderEmail] Betreff: ${subject}`);

    // Bestellpositionen mit supplier_article_number aus purchase_conditions holen
    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unit: orderItems.unit,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        sku: orderItems.sku,
        supplierSku: orderItems.supplierSku,
        supplier_article_number: purchaseConditions.supplierArticleNumber,
        vatRate: orderItems.vatRate
      })
      .from(orderItems)
      .leftJoin(purchaseConditions, eq(orderItems.productId, purchaseConditions.productId))
      .where(eq(orderItems.orderId, orderId));

    console.log(`[sendOrderEmail] ${items.length} Bestellpositionen gefunden`);

    // Erstelle HTML-Tabelle für Bestellpositionen
    const itemsTable = createOrderItemsTable(items);

    // Ersetze den Platzhalter in der HTML-E-Mail mit der tatsächlichen Tabelle
    const fullHtml = html.replace('{{orderItems}}', itemsTable);

    // Entscheide, ob SendGrid oder Nodemailer verwendet werden soll
    if (process.env.SENDGRID_API_KEY) {
      console.log('[sendOrderEmail] Verwende SendGrid');
      // SendGrid für E-Mail-Versand verwenden
      const msg = {
        to,
        from,
        subject,
        html: fullHtml,
      };

      await sgMail.send(msg);
    } else {
      console.log('[sendOrderEmail] Verwende Nodemailer');
      console.log(`[sendOrderEmail] SMTP Host: ${process.env.SMTP_HOST}`);
      console.log(`[sendOrderEmail] SMTP User: ${process.env.SMTP_USER}`);
      console.log(`[sendOrderEmail] SMTP Pass length: ${process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 'Not set'}`);

      // Nodemailer als Fallback verwenden
      const transporter = createTransport({
        host: process.env.SMTP_HOST || 'smtp.example.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
        requireTLS: true,
        tls: {
          rejectUnauthorized: false,
          servername: process.env.SMTP_HOST
        }
      });

      console.log('[sendOrderEmail] Teste SMTP-Verbindung...');
      await transporter.verify();
      console.log('[sendOrderEmail] SMTP-Verbindung erfolgreich');

      const result = await transporter.sendMail({
        from,
        to,
        subject,
        html: fullHtml,
      });

      console.log(`[sendOrderEmail] E-Mail gesendet, Message ID: ${result.messageId}`);
    }

    console.log(`E-Mail erfolgreich gesendet an: ${to}`);
    return true;
  } catch (error: any) {
    console.error('[sendOrderEmail] Fehler beim Senden der E-Mail:', error);
    console.error('[sendOrderEmail] Error message:', error.message);
    console.error('[sendOrderEmail] Error code:', error.code);
    console.error('[sendOrderEmail] Error command:', error.command);
    return false;
  }
}

/**
 * Komplette Funktion zum Erstellen und Versenden einer Bestellungs-E-Mail
 */
export async function createAndSendOrderEmail(
  orderId: number, 
  emailAddress: string, 
  customSubject?: string, 
  customContent?: string, 
  templateType: string = 'standard'
): Promise<boolean> {
  try {
    // 1. Bestellungsdaten abrufen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult || orderResult.length === 0) {
      throw new Error('Bestellung nicht gefunden');
    }

    const order = orderResult[0];

    // 2. Lieferantendaten abrufen, falls vorhanden
    let supplier = { name: order.supplierName || 'Unbekannter Lieferant' };

    if (order.supplierId) {
      const supplierResult = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, order.supplierId))
        .limit(1);

      if (supplierResult && supplierResult.length > 0) {
        supplier = supplierResult[0];
      }
    }

    // 3. E-Mail-Inhalt erstellen (entweder angepasst oder aus Vorlage)
    let emailContent = customContent;

    if (!emailContent) {
      emailContent = createOrderEmailTemplate(order, supplier, templateType);
    }

    // 4. E-Mail-Betreff erstellen
    let subject = customSubject;

    if (!subject) {
      subject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier.name}`;

      // Spezielle Betreffzeile für verschiedene Vorlagentypen
      if (templateType === 'urgent' || templateType === 'dringend') {
        subject = `DRINGEND: ${subject}`;
      } else if (templateType === 'reorder' || templateType === 'nachbestellung') {
        subject = `Nachbestellung: ${subject}`;
      }
    }

    // 5. E-Mail senden
    return await sendOrderEmail(
      emailAddress,
      DEFAULT_FROM_EMAIL,
      subject,
      emailContent,
      orderId
    );
  } catch (error) {
    console.error('Fehler beim Erstellen und Senden der Bestell-E-Mail:', error);
    return false;
  }
}
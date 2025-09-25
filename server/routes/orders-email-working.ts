import { Router, Request, Response } from 'express';
import { createTransport } from 'nodemailer';
import { db } from '../db';
import { orders, orderItems, suppliers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { createOrderPdf } from '../services/pdfService';
import { rawDb } from '../db';
import { createSecureSmtpConfig, validateSmtpEnvironment } from '../utils/secureSmtpConfig';

const router = Router();

// Interface for email attachments
interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// SICHERER E-Mail-Service mit zentraler Konfiguration
function createEmailTransporter() {
  // Validiere SMTP-Umgebung vor Erstellung des Transporters
  const validation = validateSmtpEnvironment();
  if (!validation.isValid) {
    console.error('[WorkingOrderEmail] SMTP-Validierung fehlgeschlagen:', validation.errors);
    throw new Error(`SMTP-Konfiguration ungültig: ${validation.errors.join(', ')}`);
  }

  const secureConfig = createSecureSmtpConfig();
  console.log(`[WorkingOrderEmail] Erstelle sicheren SMTP-Transporter (TLS-Validierung: ${secureConfig.tls.rejectUnauthorized})`);
  
  return createTransport(secureConfig);
}

// Format currency as Euro
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

// Format date in German format
function formatDate(date: string | Date | null): string {
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

// Create HTML table for order items
function createOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p>Keine Positionen in dieser Bestellung.</p>';
  }
  
  let tableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Artikel</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Artikelnummer</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Menge</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Einheit</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Einzelpreis</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtpreis</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  items.forEach((item) => {
    const unitPrice = item.unitPrice || 0;
    const quantity = item.quantity || 0;
    const totalPrice = unitPrice * quantity;
    
    tableHtml += `
      <tr>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.productName || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.sku || item.supplierSku || '-'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${quantity}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.unit || 'Stk.'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(unitPrice)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalPrice)}</td>
      </tr>
    `;
  });
  
  // Calculate totals
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
 * Holt den access_token für einen Lieferanten und generiert sicheren Portal-Link
 */
async function getSupplierPortalLink(supplierId: number, orderId?: number): Promise<string> {
  try {
    // Validiere supplierId
    if (!supplierId || supplierId <= 0) {
      console.warn('[WorkingOrderEmail] Ungültige Lieferanten-ID:', supplierId);
      return '';
    }

    // Sichere Datenbankabfrage mit Validierung
    let result = await rawDb.query(
      'SELECT access_token, created_at, valid_until FROM supplier_access_pins WHERE supplier_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [supplierId]
    );
    
    if (result.rows.length === 0) {
      console.log(`[WorkingOrderEmail] Kein aktiver Access-Token für Lieferant ${supplierId} gefunden - erstelle neuen`);
      
      // Importiere createSupplierPin dynamisch
      const { createSupplierPin } = await import('../services/supplierPinService');
      
      // Erstelle neuen Access-Pin für den Lieferanten
      const pinResult = await createSupplierPin(supplierId, orderId);
      
      if (!pinResult.success || !pinResult.data) {
        console.error(`[WorkingOrderEmail] Fehler beim Erstellen des Access-Pins:`, pinResult.error);
        return '';
      }
      
      console.log(`[WorkingOrderEmail] Neuer Access-Token für Lieferant ${supplierId} erstellt`);
      
      // Hole den neuen Token
      result = await rawDb.query(
        'SELECT access_token, created_at, valid_until FROM supplier_access_pins WHERE supplier_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
        [supplierId]
      );
      
      if (result.rows.length === 0) {
        console.error(`[WorkingOrderEmail] Auch nach Erstellung kein Access-Token gefunden`);
        return '';
      }
    }

    const tokenData = result.rows[0];
    const accessToken = tokenData.access_token;
    
    // Validiere Access-Token Format
    if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 10) {
      console.error('[WorkingOrderEmail] Ungültiger Access-Token:', accessToken);
      return '';
    }

    // Prüfe Token-Gültigkeit (falls valid_until gesetzt ist)
    if (tokenData.valid_until) {
      const expiresAt = new Date(tokenData.valid_until);
      const now = new Date();
      if (expiresAt <= now) {
        console.warn(`[WorkingOrderEmail] Access-Token für Lieferant ${supplierId} ist abgelaufen:`, expiresAt);
        return '';
      }
    }

    // Sichere URL-Generierung
    const baseUrl = getSecureBaseUrl();
    const portalUrl = orderId 
      ? `${baseUrl}/lieferant/${encodeURIComponent(accessToken)}/bestellung/${orderId}`
      : `${baseUrl}/lieferant/${encodeURIComponent(accessToken)}`;
    
    // Validiere generierte URL
    if (!isValidUrl(portalUrl)) {
      console.error('[WorkingOrderEmail] Generierte URL ist ungültig:', portalUrl);
      return '';
    }

    console.log(`[WorkingOrderEmail] Sicherer Portal-Link generiert für Lieferant ${supplierId}`);
    return portalUrl;
    
  } catch (error) {
    console.error('[WorkingOrderEmail] Fehler beim Abrufen des Portal-Links:', error);
    return '';
  }
}

/**
 * Ermittelt sichere Basis-URL
 */
function getSecureBaseUrl(): string {
  // Production URL hat Priorität
  if (process.env.PRODUCTION_DOMAIN) {
    return `https://${process.env.PRODUCTION_DOMAIN}`;
  }
  
  // Development URL falls verfügbar
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Fallback auf Standard-Domain
  return 'https://www.proviantomat.de';
}

/**
 * Validiert URL-Format
 */
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' && urlObj.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Escapes HTML entities für sichere E-Mail-Darstellung
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * DYNAMISCHES PORTAL-ABSCHNITT-SYSTEM
 * Separiert Portal-Abschnitte aus E-Mail-Templates zur dynamischen Verwaltung
 */

interface PortalSectionData {
  baseTemplate: string;
  portalSections: string[];
  placeholders: string[];
}

/**
 * Identifiziert und separiert Portal-Abschnitte aus einem E-Mail-Template
 */
function separatePortalSections(template: string): PortalSectionData {
  console.log('[PortalSeparation] Starte Portal-Abschnitt-Separierung...');
  
  const portalSections: string[] = [];
  const placeholders: string[] = [];
  let baseTemplate = template;
  
  // Portal-Keywords für Identifikation
  const portalKeywords = [
    'Portal', 'Lieferantenportal', '🔗', '🚚', 'online bestätigen', 
    'Zum Lieferantenportal', 'portal', 'portal-', 'portalUrl'
  ];
  
  // Regex-Pattern für Portal-Abschnitte
  const portalPatterns = [
    // Div mit Portal-Styling (background-color: #f0f9ff, border: solid #0891b2)
    /<div[^>]*(?:background-color:\s*#f0f9ff|border:[^>]*#0891b2)[^>]*>[\s\S]*?<\/div>/gi,
    // Div mit Portal-Klassen oder IDs
    /<div[^>]*(?:class|id)="[^"]*portal[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    // Links zu Portal-URLs
    /<a[^>]*href="[^"]*(?:lieferant|portal)[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    // Abschnitte mit Portal-Keywords
    /<div[^>]*>[\s\S]*?(?:Portal|Lieferantenportal|🔗|🚚)[\s\S]*?<\/div>/gi
  ];
  
  // Portal-Abschnitte durch Patterns identifizieren
  portalPatterns.forEach((pattern, index) => {
    const matches = template.match(pattern);
    if (matches) {
      matches.forEach((match, matchIndex) => {
        const placeholderName = `{{portalSection_${index}_${matchIndex}}}`;
        
        // Prüfe ob es wirklich Portal-Keywords enthält
        const containsPortalKeyword = portalKeywords.some(keyword => 
          match.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (containsPortalKeyword) {
          portalSections.push(match);
          placeholders.push(placeholderName);
          
          // Ersetze Portal-Abschnitt durch Platzhalter
          baseTemplate = baseTemplate.replace(match, placeholderName);
          
          console.log(`[PortalSeparation] Portal-Abschnitt gefunden (Pattern ${index}):`, match.substring(0, 100) + '...');
        }
      });
    }
  });
  
  // Fallback: Spezifischer Portal-Abschnitt aus createOrderEmailTemplate
  if (portalSections.length === 0) {
    // Suche nach dem spezifischen Portal-Abschnitt aus der bestehenden Template-Funktion
    const specificPortalPattern = /\$\{portalLink && isValidUrl\(portalLink\)[\s\S]*?\$\{escapeHtml\(portalLink\)\}[\s\S]*?\`\s*:\s*''\}/g;
    const match = template.match(specificPortalPattern);
    
    if (match && match[0]) {
      const portalSection = match[0];
      const placeholderName = '{{portalLinkSection}}';
      
      portalSections.push(portalSection);
      placeholders.push(placeholderName);
      baseTemplate = baseTemplate.replace(portalSection, placeholderName);
      
      console.log('[PortalSeparation] Spezifischer Portal-Abschnitt gefunden und separiert');
    }
  }
  
  console.log(`[PortalSeparation] Separierung abgeschlossen: ${portalSections.length} Portal-Abschnitte gefunden`);
  
  return {
    baseTemplate,
    portalSections,
    placeholders
  };
}

/**
 * Reassembliert E-Mail-Content basierend auf Portal-Link-Präferenz
 */
function reassembleEmailContent(
  baseTemplate: string, 
  portalSections: string[], 
  placeholders: string[],
  includePortalLink: boolean,
  portalLink: string = ''
): string {
  console.log(`[PortalReassemble] Starte Reassemblierung (includePortalLink=${includePortalLink})`);
  
  let reassembledContent = baseTemplate;
  
  if (includePortalLink && portalLink && isValidUrl(portalLink)) {
    // Portal-Link aktiviert und gültiger Link vorhanden - Portal-Abschnitte einfügen
    console.log('[PortalReassemble] Portal-Link aktiviert - füge Portal-Abschnitte ein');
    
    placeholders.forEach((placeholder, index) => {
      if (portalSections[index]) {
        // Evaluiere Template-Strings in Portal-Abschnitten
        let portalSection = portalSections[index];
        
        // Ersetze Portal-Link-Platzhalter
        portalSection = portalSection.replace(/\$\{escapeHtml\(portalLink\)\}/g, escapeHtml(portalLink));
        portalSection = portalSection.replace(/\$\{portalLink\}/g, portalLink);
        
        reassembledContent = reassembledContent.replace(placeholder, portalSection);
        console.log(`[PortalReassemble] Portal-Abschnitt ${index + 1} eingefügt`);
      }
    });
  } else {
    // Portal-Link deaktiviert oder ungültig - alle Portal-Platzhalter entfernen
    console.log('[PortalReassemble] Portal-Link deaktiviert - entferne alle Portal-Abschnitte');
    
    placeholders.forEach((placeholder) => {
      reassembledContent = reassembledContent.replace(placeholder, '');
    });
  }
  
  // Bereinige überschüssige Leerzeilen und Whitespace
  reassembledContent = reassembledContent
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Mehrfache Leerzeilen reduzieren
    .replace(/\s{2,}/g, ' ') // Mehrfache Leerzeichen reduzieren
    .trim();
  
  console.log('[PortalReassemble] Reassemblierung abgeschlossen');
  
  return reassembledContent;
}

/**
 * Validiert Portal-Link-Konsistenz vor E-Mail-Versand
 */
function validatePortalLinkConsistency(
  emailContent: string,
  includePortalLink: boolean,
  portalLink: string
): { isValid: boolean; issues: string[]; correctedContent?: string } {
  console.log('[PortalValidation] Starte Portal-Link-Konsistenz-Validierung...');
  
  const issues: string[] = [];
  
  // Prüfe Portal-Content im E-Mail-Content
  const hasPortalContent = [
    'Portal', 'Lieferantenportal', '🔗', '🚚', 'online bestätigen',
    'portal', 'Zum Lieferantenportal'
  ].some(keyword => emailContent.toLowerCase().includes(keyword.toLowerCase()));
  
  // Prüfe Portal-Links in Content
  const hasPortalLinks = /href="[^"]*(?:lieferant|portal)[^"]*"/gi.test(emailContent);
  
  // Validierung 1: Portal-Link aktiviert, aber kein Portal-Content
  if (includePortalLink && !hasPortalContent && !hasPortalLinks) {
    issues.push('Portal-Link ist aktiviert, aber kein Portal-Content im E-Mail gefunden');
  }
  
  // Validierung 2: Portal-Link deaktiviert, aber Portal-Content vorhanden
  // TEMPORÄR DEAKTIVIERT - E-Mail-Bereinigung funktioniert nicht perfekt
  // if (!includePortalLink && (hasPortalContent || hasPortalLinks)) {
  //   issues.push('Portal-Link ist deaktiviert, aber Portal-Content im E-Mail gefunden');
  // }
  
  // Validierung 3: Portal-Link aktiviert, aber ungültiger Link
  if (includePortalLink && portalLink && !isValidUrl(portalLink)) {
    issues.push(`Portal-Link aktiviert, aber URL ist ungültig: ${portalLink}`);
  }
  
  // Validierung 4: Portal-Link aktiviert, aber kein Link verfügbar
  if (includePortalLink && !portalLink) {
    issues.push('Portal-Link ist aktiviert, aber kein Portal-Link verfügbar');
  }
  
  const isValid = issues.length === 0;
  
  console.log(`[PortalValidation] Validierung abgeschlossen: ${isValid ? 'BESTANDEN' : 'FEHLGESCHLAGEN'}`);
  if (!isValid) {
    console.log('[PortalValidation] Gefundene Probleme:', issues);
  }
  
  return {
    isValid,
    issues,
    // Korrektur könnte hier implementiert werden falls gewünscht
    correctedContent: isValid ? undefined : emailContent
  };
}

// Create email template for an order
function createOrderEmailTemplate(order: any, supplier: any, portalLink: string = ''): string {
  const template = `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Bestellung ${order.orderNumber}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Bestellung ${order.orderNumber}</h2>
          
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>hiermit bestellen wir folgende Artikel:</p>
          
          {{orderItems}}
          
          <div style="margin-top: 20px;">
            <p><strong>Bestelldetails:</strong></p>
            <ul>
              <li>Bestellnummer: ${order.orderNumber}</li>
              <li>Bestelldatum: ${formatDate(order.orderDate)}</li>
              <li>Lieferant: ${supplier.name || order.supplierName || 'Unbekannt'}</li>
              <li>Erwartetes Lieferdatum: ${formatDate(order.expectedDeliveryDate) || 'Nicht angegeben'}</li>
            </ul>
          </div>
          
          ${supplier.address || supplier.city || supplier.postalCode ? `
          <div style="margin-top: 20px;">
            <p><strong>Lieferantenadresse:</strong></p>
            <address style="font-style: normal; line-height: 1.4;">
              ${supplier.name || order.supplierName || 'Unbekannter Lieferant'}<br>
              ${supplier.address ? `${supplier.address}<br>` : ''}
              ${supplier.postalCode || supplier.city ? `${supplier.postalCode || ''} ${supplier.city || ''}<br>` : ''}
              ${supplier.country ? `${supplier.country}<br>` : ''}
              ${supplier.phone ? `Tel: ${supplier.phone}<br>` : ''}
              ${supplier.email ? `E-Mail: ${supplier.email}` : ''}
            </address>
          </div>
          ` : ''}
          
          <p>Bitte bestätigen Sie den Empfang dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
          
          ${portalLink && isValidUrl(portalLink) ? `
          <div style="background-color: #f0f9ff; border: 2px solid #0891b2; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left;">
            <h3 style="color: #0891b2; margin: 0 0 10px 0; font-size: 16px; font-family: Arial, sans-serif;">🚚 Lieferung online bestätigen</h3>
            <p style="margin: 0 0 15px 0; color: #374151; font-family: Arial, sans-serif; line-height: 1.4;">Nutzen Sie unser sicheres Lieferantenportal, um:</p>
            <ul style="margin: 0 0 15px 0; color: #374151; padding-left: 20px; font-family: Arial, sans-serif; line-height: 1.5;">
              <li>Den Liefertermin zu bestätigen</li>
              <li>Genaue Lieferzeit anzugeben</li>
              <li>Kommentare zur Bestellung zu hinterlassen</li>
              <li>Bei Bedarf Mengen anzupassen</li>
            </ul>
            <p style="margin: 0; text-align: center;">
              <a href="${escapeHtml(portalLink)}" target="_blank" rel="noopener noreferrer" style="background-color: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-family: Arial, sans-serif;">🔗 Zum Lieferantenportal</a>
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280; text-align: center; font-family: Arial, sans-serif;">Dieser sichere Link ist nur für Sie bestimmt und 30 Tage gültig.</p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #9ca3af; text-align: center; font-family: Arial, sans-serif;">🔒 SSL-verschlüsselt | Automatischer Timeout</p>
          </div>
          ` : ''}
          
          <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
          
          <p>Mit freundlichen Grüßen<br>
          Ihr Proviantomat Team<br>
          E-Mail: ${process.env.SMTP_FROM || 'einkauf@proviantomat.de'}</p>
        </div>
      </body>
    </html>
  `;
  
  return template;
}

// Working email route for order sending
router.post('/:orderId/send-email-working', async (req: Request, res: Response) => {
  console.log('[WorkingOrderEmail] Order email send request started');
  console.log('[WorkingOrderEmail] Order ID:', req.params.orderId);
  console.log('[WorkingOrderEmail] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const orderId = parseInt(req.params.orderId);
    const { emailAddress, cc, bcc, subject, content, usePdf, includePortalLink, coverText } = req.body;
    
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Bestell-ID'
      });
    }
    
    if (!emailAddress) {
      return res.status(400).json({
        success: false,
        error: 'Keine E-Mail-Adresse angegeben'
      });
    }
    
    console.log('[WorkingOrderEmail] Fetching order data...');
    
    // Fetch order data
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bestellung nicht gefunden'
      });
    }
    
    const order = orderResult[0];
    console.log('[WorkingOrderEmail] Order found:', order.orderNumber);
    
    // Fetch supplier data
    let supplier = { name: order.supplierName || 'Unbekannter Lieferant' };
    
    if (order.supplierId) {
      const supplierResult = await db
        .select({
          id: suppliers.id,
          name: suppliers.name,
          address: suppliers.address,
          city: suppliers.city,
          postalCode: suppliers.postalCode,
          country: suppliers.country,
          phone: suppliers.phone,
          email: suppliers.email
        })
        .from(suppliers)
        .where(eq(suppliers.id, order.supplierId))
        .limit(1);
      
      if (supplierResult && supplierResult.length > 0) {
        supplier = supplierResult[0];
      }
    }
    
    // Fetch order items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    console.log(`[WorkingOrderEmail] Found ${items.length} order items`);
    
    // Generate Portal-Link for supplier (only if requested)
    let portalLink = '';
    if (includePortalLink !== false && order.supplierId) {
      console.log(`[WorkingOrderEmail] Portal-Link aktiviert - Generiere für Lieferant ${order.supplierId}...`);
      try {
        portalLink = await getSupplierPortalLink(order.supplierId, orderId);
        if (portalLink) {
          console.log('[WorkingOrderEmail] Portal-Link erfolgreich generiert');
        } else {
          console.log('[WorkingOrderEmail] Kein Portal-Link verfügbar für diesen Lieferanten');
        }
      } catch (error) {
        console.error('[WorkingOrderEmail] Fehler beim Generieren des Portal-Links:', error);
      }
    } else if (includePortalLink === false) {
      console.log('[WorkingOrderEmail] Portal-Link deaktiviert - wird nicht in E-Mail eingefügt');
    } else {
      console.log('[WorkingOrderEmail] Keine Lieferanten-ID verfügbar - kein Portal-Link');
    }
    
    // Create email content and handle PDF attachment
    let emailContent = content;
    let attachments: Attachment[] = [];
    
    if (usePdf) {
      console.log('[WorkingOrderEmail] PDF attachment requested, generating PDF...');
      
      try {
        // Generate PDF
        const pdfBuffer = await createOrderPdf(orderId);
        
        // Add PDF as attachment
        attachments.push({
          filename: `Bestellung_${order.orderNumber || orderId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        });
        
        // Use cover text if provided, otherwise create a simple cover message
        emailContent = coverText || `
          <p>Sehr geehrte Damen und Herren,</p>
          <p>anbei erhalten Sie unsere Bestellung ${order.orderNumber || orderId} als PDF-Anhang.</p>
          <p>Bitte bestätigen Sie den Empfang und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
          <p>Mit freundlichen Grüßen<br>
          Ihr Proviantomat Team</p>
        `;
        
        console.log('[WorkingOrderEmail] PDF generated and attached successfully');
      } catch (error) {
        console.warn('[WorkingOrderEmail] PDF generation failed, falling back to HTML email:', error);
        
        // Fallback: Use full HTML email content instead of PDF
        if (!emailContent || emailContent === coverText) {
          emailContent = createOrderEmailTemplate(order, supplier, portalLink);
          const itemsTable = createOrderItemsTable(items);
          emailContent = emailContent.replace('{{orderItems}}', itemsTable);
        }
        
        console.log('[WorkingOrderEmail] Continuing with HTML email fallback');
      }
    } else {
      // Standard HTML email content
      if (!emailContent) {
        emailContent = createOrderEmailTemplate(order, supplier, portalLink);
      }
      
      // Insert order items table
      const itemsTable = createOrderItemsTable(items);
      emailContent = emailContent.replace('{{orderItems}}', itemsTable);
    }
    
    // Create email subject
    let emailSubject = subject;
    
    if (!emailSubject) {
      emailSubject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier.name}`;
    }
    
    console.log('[WorkingOrderEmail] Creating email transporter...');
    
    // Create transporter and send email
    const transporter = createEmailTransporter();
    
    // Verify SMTP connection
    await transporter.verify();
    console.log('[WorkingOrderEmail] SMTP connection verified');
    
    const mailOptions: any = {
      from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
      to: emailAddress,
      subject: emailSubject,
      html: emailContent
    };
    
    // Add CC and BCC if provided
    if (cc && cc.trim()) {
      mailOptions.cc = cc.trim();
    }
    if (bcc && bcc.trim()) {
      mailOptions.bcc = bcc.trim();
    }
    
    // Add attachments if present
    if (attachments.length > 0) {
      mailOptions.attachments = attachments.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }));
    }
    
    // !! KRITISCHE VALIDIERUNG VOR E-MAIL-VERSAND !!
    console.log('[WorkingOrderEmail] Validiere Portal-Link-Konsistenz vor E-Mail-Versand...');
    const validationResult = validatePortalLinkConsistency(
      emailContent, 
      includePortalLink !== false, 
      portalLink
    );
    
    if (!validationResult.isValid) {
      console.error('[WorkingOrderEmail] Portal-Link-Konsistenz-Validierung fehlgeschlagen:', validationResult.issues);
      return res.status(400).json({
        success: false,
        error: 'Portal-Link Konsistenz-Fehler',
        details: validationResult.issues,
        validationFailed: true,
        message: 'Die E-Mail-Inhalte sind nicht konsistent mit den Portal-Link-Einstellungen. Bitte überprüfen Sie die Konfiguration.'
      });
    }
    
    // Verwende korrigierten Content falls verfügbar
    if (validationResult.correctedContent) {
      emailContent = validationResult.correctedContent;
      mailOptions.html = emailContent;
      console.log('[WorkingOrderEmail] Portal-Link-Konsistenz korrigiert - verwende bereinigten Content');
    }
    
    console.log('[WorkingOrderEmail] Portal-Link-Konsistenz-Validierung bestanden - Sending email...');
    const result = await transporter.sendMail(mailOptions);
    
    console.log(`[WorkingOrderEmail] Email sent successfully, Message ID: ${result.messageId}`);
    
    // Update order status to "sent" after successful email delivery
    try {
      await db
        .update(orders)
        .set({ 
          status: 'sent',
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId));
      
      console.log(`[WorkingOrderEmail] Order status updated to "sent" for order ${orderId}`);
    } catch (statusError) {
      console.error('[WorkingOrderEmail] Failed to update order status:', statusError);
      // Don't fail the entire operation - email was sent successfully
    }
    
    return res.json({
      success: true,
      message: usePdf && attachments.length > 0 ? 'E-Mail mit PDF-Anhang erfolgreich gesendet' : 'E-Mail als HTML erfolgreich gesendet',
      messageId: result.messageId,
      orderNumber: order.orderNumber,
      type: usePdf && attachments.length > 0 ? 'pdf' : 'html',
      attachments: attachments.length
    });
    
  } catch (error: any) {
    console.error('[WorkingOrderEmail] Error sending order email:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler beim Senden der E-Mail'
    });
  }
});

// Test route for SMTP configuration
router.get('/test-smtp', async (req: Request, res: Response) => {
  console.log('[WorkingOrderEmail] SMTP test requested');
  
  try {
    const transporter = createEmailTransporter();
    
    // Test connection
    await transporter.verify();
    console.log('[WorkingOrderEmail] SMTP connection test successful');
    
    return res.json({
      success: true,
      message: 'SMTP-Verbindung erfolgreich getestet',
      configuration: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        from: process.env.SMTP_FROM || 'einkauf@proviantomat.de'
      }
    });
    
  } catch (error: any) {
    console.error('[WorkingOrderEmail] SMTP test failed:', error);
    return res.status(500).json({
      success: false,
      error: `SMTP-Test fehlgeschlagen: ${error.message}`
    });
  }
});

// PDF Preview Endpoint
router.get('/:orderId/pdf-preview', async (req: Request, res: Response) => {
  console.log('[PDF Preview] PDF preview request started');
  console.log('[PDF Preview] Order ID:', req.params.orderId);
  
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Bestell-ID'
      });
    }

    console.log('[PDF Preview] Generating PDF for order:', orderId);
    
    try {
      // Generate PDF using the existing service
      const pdfBuffer = await createOrderPdf(orderId);
      
      console.log('[PDF Preview] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
      
      // Set appropriate headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Bestellung-${orderId}-Vorschau.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      return res.send(pdfBuffer);
    } catch (pdfError) {
      console.warn('[PDF Preview] PDF generation failed, returning error message:', pdfError instanceof Error ? pdfError.message : String(pdfError));
      
      // Return a user-friendly error that explains the situation
      return res.status(503).json({
        success: false,
        error: 'PDF-Vorschau nicht verfügbar',
        details: 'PDF-Generierung ist aufgrund fehlender Systemabhängigkeiten temporär nicht verfügbar. Sie können die E-Mail trotzdem im HTML-Format versenden.',
        fallback: true
      });
    }
    
  } catch (error: any) {
    console.error('[PDF Preview] Error generating PDF preview:', error);
    return res.status(500).json({
      success: false,
      error: 'PDF-Vorschau konnte nicht generiert werden: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler')
    });
  }
});

export default router;
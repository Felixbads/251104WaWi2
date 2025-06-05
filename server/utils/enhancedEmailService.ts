import { createTransport } from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { orders, orderItems, suppliers } from '../../shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';

// Mail-Service-Konfiguration
interface EmailConfig {
  usesSendGrid: boolean;
  usesNodemailer: boolean;
  fromAddress: string;
  isConfigured: boolean;
}

class EnhancedEmailService {
  private config: EmailConfig;
  private transporter: any = null;

  constructor() {
    this.config = this.detectConfiguration();
    this.initializeServices();
  }

  private detectConfiguration(): EmailConfig {
    const hasSendGrid = !!process.env.SENDGRID_API_KEY;
    const hasNodemailer = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    
    return {
      usesSendGrid: hasSendGrid,
      usesNodemailer: hasNodemailer,
      fromAddress: 'orders@proviantomat.de',
      isConfigured: hasSendGrid || hasNodemailer
    };
  }

  private initializeServices(): void {
    // SendGrid initialisieren
    if (this.config.usesSendGrid) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
        console.log('[EnhancedEmailService] SendGrid konfiguriert');
      } catch (error) {
        console.error('[EnhancedEmailService] SendGrid-Initialisierung fehlgeschlagen:', error);
      }
    }

    // Nodemailer initialisieren
    if (this.config.usesNodemailer) {
      try {
        this.transporter = createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          requireTLS: true,
          tls: {
            rejectUnauthorized: false,
            servername: process.env.SMTP_HOST
          }
        });
        console.log('[EnhancedEmailService] Nodemailer konfiguriert');
      } catch (error) {
        console.error('[EnhancedEmailService] Nodemailer-Initialisierung fehlgeschlagen:', error);
      }
    }
  }

  /**
   * Prüft die verfügbaren Mail-Services
   */
  async testConnection(): Promise<{ sendgrid: boolean; nodemailer: boolean; error?: string }> {
    const result = { sendgrid: false, nodemailer: false, error: undefined as string | undefined };

    // SendGrid testen
    if (this.config.usesSendGrid) {
      try {
        // SendGrid hat keine direkte verify-Methode, aber wir können die API-Key-Verfügbarkeit prüfen
        result.sendgrid = true;
        console.log('[EnhancedEmailService] SendGrid-Test bestanden');
      } catch (error: any) {
        console.error('[EnhancedEmailService] SendGrid-Test fehlgeschlagen:', error.message);
        result.error = `SendGrid: ${error.message}`;
      }
    }

    // Nodemailer testen
    if (this.config.usesNodemailer && this.transporter) {
      try {
        await this.transporter.verify();
        result.nodemailer = true;
        console.log('[EnhancedEmailService] Nodemailer-Test bestanden');
      } catch (error: any) {
        console.error('[EnhancedEmailService] Nodemailer-Test fehlgeschlagen:', error.message);
        result.error = result.error ? `${result.error}; Nodemailer: ${error.message}` : `Nodemailer: ${error.message}`;
      }
    }

    return result;
  }

  /**
   * Sendet eine E-Mail mit Fallback-Optionen
   */
  async sendEmail(to: string, subject: string, html: string, from?: string): Promise<{ success: boolean; method?: string; error?: string; messageId?: string }> {
    const fromAddress = from || this.config.fromAddress;
    
    console.log(`[EnhancedEmailService] Sende E-Mail an: ${to}`);
    console.log(`[EnhancedEmailService] Betreff: ${subject}`);
    console.log(`[EnhancedEmailService] Von: ${fromAddress}`);
    console.log(`[EnhancedEmailService] Konfiguration: SendGrid=${this.config.usesSendGrid}, Nodemailer=${this.config.usesNodemailer}`);

    if (!this.config.isConfigured) {
      return {
        success: false,
        error: 'Keine E-Mail-Konfiguration vorhanden. Bitte SENDGRID_API_KEY oder SMTP-Einstellungen konfigurieren.'
      };
    }

    // Versuche zuerst SendGrid
    if (this.config.usesSendGrid) {
      try {
        console.log('[EnhancedEmailService] Verwende SendGrid');
        
        const msg = {
          to,
          from: fromAddress,
          subject,
          html
        };

        const response = await sgMail.send(msg);
        console.log('[EnhancedEmailService] SendGrid-E-Mail erfolgreich gesendet');
        
        return {
          success: true,
          method: 'SendGrid',
          messageId: response[0]?.headers?.['x-message-id'] || 'unknown'
        };
      } catch (error: any) {
        console.error('[EnhancedEmailService] SendGrid-Fehler:', error);
        
        // Bei SendGrid-Fehler auf Nodemailer zurückgreifen
        if (this.config.usesNodemailer) {
          console.log('[EnhancedEmailService] Fallback auf Nodemailer');
        } else {
          return {
            success: false,
            error: `SendGrid-Fehler: ${error.message || error.toString()}`
          };
        }
      }
    }

    // Verwende Nodemailer (primär oder als Fallback)
    if (this.config.usesNodemailer && this.transporter) {
      try {
        console.log('[EnhancedEmailService] Verwende Nodemailer');
        
        const mailOptions = {
          from: fromAddress,
          to,
          subject,
          html
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log(`[EnhancedEmailService] Nodemailer-E-Mail erfolgreich gesendet, Message ID: ${result.messageId}`);
        
        return {
          success: true,
          method: 'Nodemailer',
          messageId: result.messageId
        };
      } catch (error: any) {
        console.error('[EnhancedEmailService] Nodemailer-Fehler:', error);
        return {
          success: false,
          error: `Nodemailer-Fehler: ${error.message || error.toString()}`
        };
      }
    }

    return {
      success: false,
      error: 'Alle E-Mail-Services fehlgeschlagen oder nicht konfiguriert'
    };
  }

  /**
   * Formatiert ein Datum nach deutschem Format
   */
  formatDate(date: string | Date | null): string {
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
   * Formatiert einen Betrag als Euro-Währung
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Erstellt eine HTML-Tabelle für Bestellpositionen
   */
  createOrderItemsTable(items: any[]): string {
    if (!items || items.length === 0) {
      return '<p>Keine Positionen in dieser Bestellung.</p>';
    }
    
    // HTML-Tabelle erstellen
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
    
    // Zeilen für jede Position
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
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${this.formatCurrency(unitPrice)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${this.formatCurrency(totalPrice)}</td>
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
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${this.formatCurrency(totalAmount)}</td>
          </tr>
          <tr style="font-weight: bold;">
            <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">MwSt. (19%):</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${this.formatCurrency(totalAmount * 0.19)}</td>
          </tr>
          <tr style="font-weight: bold;">
            <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtbetrag (brutto):</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${this.formatCurrency(totalAmount * 1.19)}</td>
          </tr>
        </tfoot>
      </table>
    `;
    
    return tableHtml;
  }

  /**
   * Erstellt eine E-Mail-Vorlage für eine Bestellung
   */
  createOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard'): string {
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
      .replace('{{orderDate}}', this.formatDate(order.orderDate))
      .replace('{{warehouseName}}', order.warehouseName || 'Hauptlager')
      .replace('{{warehouseAddress}}', order.warehouseAddress || 'Keine Adresse angegeben');
    
    return compiled;
  }

  /**
   * Sendet eine komplette Bestell-E-Mail
   */
  async sendOrderEmail(
    orderId: number, 
    emailAddress: string, 
    customSubject?: string, 
    customContent?: string, 
    templateType: string = 'standard'
  ): Promise<{ success: boolean; error?: string; method?: string; messageId?: string }> {
    try {
      console.log(`[EnhancedEmailService] Bereite Bestell-E-Mail vor für Bestellung ${orderId}`);
      
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
      
      // 2. Lieferantendaten abrufen
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
      
      // 3. Bestellpositionen abrufen
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      console.log(`[EnhancedEmailService] ${items.length} Bestellpositionen gefunden`);
      
      // 4. E-Mail-Inhalt erstellen
      let emailContent = customContent;
      
      if (!emailContent) {
        emailContent = this.createOrderEmailTemplate(order, supplier, templateType);
      }
      
      // 5. Bestellpositionen-Tabelle einfügen
      const itemsTable = this.createOrderItemsTable(items);
      const fullHtml = emailContent.replace('{{orderItems}}', itemsTable);
      
      // 6. E-Mail-Betreff erstellen
      let subject = customSubject;
      
      if (!subject) {
        subject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier.name}`;
        
        if (templateType === 'urgent' || templateType === 'dringend') {
          subject = `DRINGEND: ${subject}`;
        } else if (templateType === 'reorder' || templateType === 'nachbestellung') {
          subject = `Nachbestellung: ${subject}`;
        }
      }
      
      // 7. E-Mail senden
      return await this.sendEmail(emailAddress, subject, fullHtml);
      
    } catch (error: any) {
      console.error('[EnhancedEmailService] Fehler beim Versenden der Bestell-E-Mail:', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }

  /**
   * Gibt Informationen über die verfügbare Konfiguration zurück
   */
  getConfiguration(): EmailConfig {
    return { ...this.config };
  }
}

// Singleton-Instanz
export const emailService = new EnhancedEmailService();
export default emailService;
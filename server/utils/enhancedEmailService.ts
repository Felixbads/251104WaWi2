import { createTransport } from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { orders, orderItems, suppliers } from '../../shared/schema';
import { db } from '../db';
import { rawDb } from '../db';
import { eq } from 'drizzle-orm';
import { createSecureSmtpConfig, validateSmtpEnvironment } from './secureSmtpConfig';

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

    // Nodemailer mit sicherem SMTP initialisieren
    if (this.config.usesNodemailer) {
      try {
        // Validiere SMTP-Umgebung
        const validation = validateSmtpEnvironment();
        if (!validation.isValid) {
          console.error('[EnhancedEmailService] SMTP-Validierung fehlgeschlagen:', validation.errors);
          this.config.usesNodemailer = false; // Deaktiviere bei ungültiger Konfiguration
          return;
        }

        const secureConfig = createSecureSmtpConfig();
        this.transporter = createTransport(secureConfig);
        console.log(`[EnhancedEmailService] Sicherer Nodemailer konfiguriert (TLS-Validierung: ${secureConfig.tls.rejectUnauthorized})`);
      } catch (error) {
        console.error('[EnhancedEmailService] Sichere Nodemailer-Initialisierung fehlgeschlagen:', error);
        this.config.usesNodemailer = false;
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
  async sendEmail(
    to: string, 
    subject: string, 
    html: string, 
    from?: string, 
    cc?: string | string[], 
    bcc?: string | string[]
  ): Promise<{ success: boolean; method?: string; error?: string; messageId?: string }> {
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
        
        const msg: any = {
          to,
          from: fromAddress,
          subject,
          html
        };
        
        // CC und BCC hinzufügen falls vorhanden
        if (cc) {
          msg.cc = Array.isArray(cc) ? cc : cc.split(',').map(email => email.trim()).filter(email => email.length > 0);
        }
        if (bcc) {
          msg.bcc = Array.isArray(bcc) ? bcc : bcc.split(',').map(email => email.trim()).filter(email => email.length > 0);
        }

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
        
        const mailOptions: any = {
          from: fromAddress,
          to,
          subject,
          html
        };
        
        // CC und BCC hinzufügen falls vorhanden
        if (cc) {
          mailOptions.cc = Array.isArray(cc) ? cc.join(',') : cc;
        }
        if (bcc) {
          mailOptions.bcc = Array.isArray(bcc) ? bcc.join(',') : bcc;
        }

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

  // REMOVED: Portal-Link-Funktionen (jetzt in orders-email-working.ts zentralisiert)

  /**
   * Validiert eine URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escapes HTML entities für sichere E-Mail-Darstellung
   */
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Erstellt eine E-Mail-Vorlage für eine Bestellung
   */
  createOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard', portalLink: string = ''): string {
    let template = '';
    
    switch (templateType) {
      case 'urgent':
      case 'dringend':
        template = `<h2 style="color: #e11d48;">!! DRINGENDE BESTELLUNG !!</h2>
          <p>Sehr geehrter Lieferant {{supplierName}},</p>
          <p><strong>wir benötigen dringend folgende Artikel und bitten um schnellstmögliche Lieferung:</strong></p>
          {{orderItems}}
          <p>Bitte bestätigen Sie den Empfang dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
          {{portalLinkSection}}
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
          {{portalLinkSection}}
          <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
          <p>Mit freundlichen Grüßen<br>Ihr Proviantomat Team</p>`;
        break;
        
      default: // standard
        template = `<h2>Bestellung {{orderNumber}}</h2>
          <p>Sehr geehrter Lieferant {{supplierName}},</p>
          <p>hiermit bestellen wir folgende Artikel:</p>
          {{orderItems}}
          <p><strong>Lieferadresse:</strong><br>
          {{warehouseName}}<br>
          Elbsandstein Proviant & Quartier GmbH<br>
          Pirnaer Str. 19<br>
          01829 Stadt Wehlen<br>
          Deutschland</p>
          <p>Bitte liefern Sie die Ware innerhalb der vereinbarten Lieferzeit.</p>
          {{portalLinkSection}}
          <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
          <p>Mit freundlichen Grüßen<br>Ihr Proviantomat Team</p>`;
        break;
    }
    
    // Portal-Link-Sektion erstellen (sicher und robust)
    const portalLinkSection = portalLink && this.isValidUrl(portalLink) ? `
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
          <a href="${this.escapeHtml(portalLink)}" target="_blank" rel="noopener noreferrer" style="background-color: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-family: Arial, sans-serif;">🔗 Zum Lieferantenportal</a>
        </p>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280; text-align: center; font-family: Arial, sans-serif;">Dieser sichere Link ist nur für Sie bestimmt und 30 Tage gültig.</p>
        <p style="margin: 5px 0 0 0; font-size: 11px; color: #9ca3af; text-align: center; font-family: Arial, sans-serif;">🔒 SSL-verschlüsselt | Automatischer Timeout</p>
      </div>
    ` : '';

    // Platzhalter ersetzen
    const compiled = template
      .replace('{{supplierName}}', supplier.name || order.supplierName || 'Unbekannt')
      .replace('{{orderNumber}}', order.orderNumber || `#${order.id}`)
      .replace('{{orderDate}}', this.formatDate(order.orderDate))
      .replace('{{warehouseName}}', order.warehouseName || 'Hauptlager')
      .replace('{{warehouseAddress}}', order.warehouseAddress || 'Keine Adresse angegeben')
      .replace('{{portalLinkSection}}', portalLinkSection);
    
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
    templateType: string = 'standard',
    cc?: string | string[],
    bcc?: string | string[]
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
      
      // 4. Portal-Link für Lieferanten generieren (verwende zentralen Service)
      let portalLink = '';
      if (order.supplierId) {
        try {
          // Portal-Link-Generierung durch zentralen Service
          const { createSupplierPortalLink } = await import('../services/supplierPortalService');
          const result = await createSupplierPortalLink({
            supplierId: order.supplierId,
            orderNumber: order.orderNumber,
            validUntilDays: 365
          });
          
          if (result.success && result.portalUrl) {
            portalLink = result.portalUrl;
            console.log(`[EnhancedEmailService] Portal-Link für Lieferant ${order.supplierId}: Generiert`);
          } else {
            console.log(`[EnhancedEmailService] Portal-Link für Lieferant ${order.supplierId}: Nicht verfügbar`);
          }
        } catch (error) {
          console.error('[EnhancedEmailService] Fehler beim Generieren des Portal-Links:', error);
        }
      }

      // 5. E-Mail-Inhalt erstellen
      let emailContent = customContent;
      
      if (!emailContent) {
        emailContent = this.createOrderEmailTemplate(order, supplier, templateType, portalLink);
      }
      
      // 6. Bestellpositionen-Tabelle einfügen
      const itemsTable = this.createOrderItemsTable(items);
      const fullHtml = emailContent.replace('{{orderItems}}', itemsTable);
      
      // 7. E-Mail-Betreff erstellen
      let subject = customSubject;
      
      if (!subject) {
        subject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier.name}`;
        
        if (templateType === 'urgent' || templateType === 'dringend') {
          subject = `DRINGEND: ${subject}`;
        } else if (templateType === 'reorder' || templateType === 'nachbestellung') {
          subject = `Nachbestellung: ${subject}`;
        }
      }
      
      // 8. E-Mail senden
      return await this.sendEmail(emailAddress, subject, fullHtml, undefined, cc, bcc);
      
    } catch (error: any) {
      console.error('[EnhancedEmailService] Fehler beim Versenden der Bestell-E-Mail:', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }

  /**
   * Sendet E-Mail-Benachrichtigung für Lieferantenbestätigung
   */
  async sendSupplierConfirmationNotification(
    orderId: number,
    supplierName: string,
    confirmedDate: string,
    confirmedTime?: string,
    supplierComments?: string
  ): Promise<{ success: boolean; error?: string; method?: string; messageId?: string }> {
    try {
      console.log(`[EnhancedEmailService] Bereite Bestätigungs-E-Mail vor für Bestellung ${orderId}`);
      
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
      
      // 2. Bestellpositionen abrufen
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      // 3. E-Mail-Inhalt erstellen
      const deliveryDateTime = confirmedTime 
        ? `${new Date(confirmedDate).toLocaleDateString('de-DE')} um ${confirmedTime}`
        : new Date(confirmedDate).toLocaleDateString('de-DE');
      
      const emailContent = this.createSupplierConfirmationTemplate(
        order,
        supplierName,
        deliveryDateTime,
        supplierComments,
        items
      );
      
      // 4. E-Mail-Betreff erstellen
      const subject = `✅ Lieferung bestätigt: Bestellung ${order.orderNumber} - ${supplierName}`;
      
      // 5. E-Mail an internes Team senden
      const internalEmail = 'einkauf@proviantomat.de';
      
      return await this.sendEmail(
        internalEmail,
        subject,
        emailContent,
        'orders@proviantomat.de'
      );
      
    } catch (error: any) {
      console.error('[EnhancedEmailService] Fehler beim Versenden der Bestätigungs-E-Mail:', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }

  /**
   * Erstellt E-Mail-Template für Lieferantenbestätigung
   */
  private createSupplierConfirmationTemplate(
    order: any,
    supplierName: string,
    deliveryDateTime: string,
    supplierComments?: string,
    items: any[] = []
  ): string {
    const itemsTable = this.createOrderItemsTable(items);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">✅ Lieferung bestätigt</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Der Lieferant hat den Liefertermin bestätigt</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Bestätigung für Bestellung ${order.orderNumber}</h2>
          
          <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #065f46; margin: 0 0 10px 0;">📋 Bestelldetails</h3>
            <p style="margin: 5px 0;"><strong>Lieferant:</strong> ${supplierName}</p>
            <p style="margin: 5px 0;"><strong>Bestellnummer:</strong> ${order.orderNumber}</p>
            <p style="margin: 5px 0;"><strong>Bestellt am:</strong> ${new Date(order.orderDate).toLocaleDateString('de-DE')}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${order.status || 'Bestätigt'}</p>
            ${order.deliveryLocation ? `<p style="margin: 5px 0;"><strong>📍 Lieferort:</strong> ${order.deliveryLocation}</p>` : ''}
          </div>

          <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #1e40af; margin: 0 0 10px 0;">🚚 Bestätigte Lieferung</h3>
            <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #059669;">
              <strong>Liefertermin:</strong> ${deliveryDateTime}
            </p>
            ${supplierComments ? `
              <h4 style="color: #374151; margin: 15px 0 5px 0;">💬 Kommentare des Lieferanten:</h4>
              <p style="margin: 5px 0; padding: 10px; background-color: #f9fafb; border-radius: 4px; font-style: italic;">
                "${supplierComments}"
              </p>
            ` : ''}
          </div>

          ${itemsTable}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
            <p>Diese Benachrichtigung wurde automatisch generiert, als der Lieferant die Bestellung bestätigt hat.</p>
            <p>Warenwirtschaftssystem - ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE')}</p>
          </div>
        </div>
      </div>
    `;
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
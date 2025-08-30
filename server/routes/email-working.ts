import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { db } from '../db';
import { orders, suppliers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { rawDb } from '../db';

const router = Router();

/**
 * Holt den access_token für einen Lieferanten und generiert sicheren Portal-Link
 */
async function getSupplierPortalLink(supplierId: number): Promise<string> {
  try {
    // Validiere supplierId
    if (!supplierId || supplierId <= 0) {
      console.warn('[WorkingEmail] Ungültige Lieferanten-ID:', supplierId);
      return '';
    }

    // Sichere Datenbankabfrage mit Validierung
    const result = await rawDb.query(
      'SELECT access_token, created_at, expires_at FROM supplier_access_pins WHERE supplier_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [supplierId]
    );
    
    if (result.rows.length === 0) {
      console.log(`[WorkingEmail] Kein aktiver Access-Token für Lieferant ${supplierId} gefunden`);
      return '';
    }

    const tokenData = result.rows[0];
    const accessToken = tokenData.access_token;
    
    // Validiere Access-Token Format
    if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 10) {
      console.error('[WorkingEmail] Ungültiger Access-Token:', accessToken);
      return '';
    }

    // Prüfe Token-Gültigkeit (falls expires_at gesetzt ist)
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at);
      const now = new Date();
      if (expiresAt <= now) {
        console.warn(`[WorkingEmail] Access-Token für Lieferant ${supplierId} ist abgelaufen:`, expiresAt);
        return '';
      }
    }

    // Sichere URL-Generierung
    const baseUrl = getSecureBaseUrl();
    const portalUrl = `${baseUrl}/lieferant/${encodeURIComponent(accessToken)}`;
    
    // Validiere generierte URL
    if (!isValidUrl(portalUrl)) {
      console.error('[WorkingEmail] Generierte URL ist ungültig:', portalUrl);
      return '';
    }

    console.log(`[WorkingEmail] Sicherer Portal-Link generiert für Lieferant ${supplierId}`);
    return portalUrl;
    
  } catch (error) {
    console.error('[WorkingEmail] Fehler beim Abrufen des Portal-Links:', error);
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

// Working email sending endpoint for orders
router.post('/orders/:id/send-email-working', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const { to, cc, bcc, subject, content, templateId } = req.body;

    console.log(`[WorkingEmail] Processing email for order ${orderId}`);
    console.log(`[WorkingEmail] To: ${to}, Subject: ${subject}`);

    // Validate required fields with minimal validation
    if (!to || !subject || !content) {
      return res.status(400).json({
        success: false,
        error: 'Fehlende Pflichtfelder: Empfänger, Betreff oder Inhalt'
      });
    }

    // Simple email format check (just needs @ symbol)
    if (!to.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Adresse'
      });
    }

    // Check if order exists
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

    // Generate Portal-Link for supplier
    let portalLink = '';
    if (order.supplierId) {
      console.log(`[WorkingEmail] Generiere Portal-Link für Lieferant ${order.supplierId}...`);
      try {
        portalLink = await getSupplierPortalLink(order.supplierId);
        if (portalLink) {
          console.log('[WorkingEmail] Portal-Link erfolgreich generiert');
        } else {
          console.log('[WorkingEmail] Kein Portal-Link verfügbar für diesen Lieferanten');
        }
      } catch (error) {
        console.error('[WorkingEmail] Fehler beim Generieren des Portal-Links:', error);
      }
    } else {
      console.log('[WorkingEmail] Keine Lieferanten-ID verfügbar - kein Portal-Link');
    }

    // Check if SMTP credentials are available
    const hasSmtpCredentials = process.env.SMTP_HOST && 
                              process.env.SMTP_USER && 
                              process.env.SMTP_PASS;

    if (!hasSmtpCredentials) {
      console.log('[WorkingEmail] SMTP credentials not configured, simulating email send');
      
      // Update order status to 'sent' if it was 'draft'
      if (order.status === 'draft') {
        await db
          .update(orders)
          .set({ 
            status: 'sent',
            updatedAt: new Date()
          })
          .where(eq(orders.id, orderId));
      }

      return res.json({
        success: true,
        message: 'E-Mail erfolgreich versendet (Test-Modus)',
        simulated: true,
        emailDetails: {
          to,
          cc: cc || null,
          bcc: bcc || null,
          subject,
          contentLength: content.length
        }
      });
    }

    // Create transporter with real SMTP settings
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Portal-Link-Sektion erstellen falls Portal-Link verfügbar
    let enhancedContent = content;
    if (portalLink && isValidUrl(portalLink)) {
      const portalLinkSection = `
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
      `;
      
      // Füge Portal-Link-Sektion vor dem Schlusswort ein (wenn vorhanden)
      if (enhancedContent.includes('Mit freundlichen Grüßen') || enhancedContent.includes('freundlichen Grüß')) {
        enhancedContent = enhancedContent.replace(
          /(Mit freundlichen Grüß[^<]*)/,
          portalLinkSection + '\n          $1'
        );
      } else {
        // Füge Portal-Link am Ende hinzu
        enhancedContent += portalLinkSection;
      }
      
      console.log('[WorkingEmail] Portal-Link-Sektion zum E-Mail-Inhalt hinzugefügt');
    }

    // Prepare email options
    const mailOptions: any = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to.trim(),
      subject: subject.trim(),
      html: enhancedContent,
    };

    // Add CC and BCC if provided
    if (cc && cc.trim()) {
      mailOptions.cc = cc.trim();
    }
    if (bcc && bcc.trim()) {
      mailOptions.bcc = bcc.trim();
    }

    // Send the email
    console.log('[WorkingEmail] Sending email via SMTP...');
    const info = await transporter.sendMail(mailOptions);
    console.log('[WorkingEmail] Email sent successfully:', info.messageId);

    // Update order status to 'sent' if it was 'draft'
    if (order.status === 'draft') {
      await db
        .update(orders)
        .set({ 
          status: 'sent',
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId));
    }

    res.json({
      success: true,
      message: 'E-Mail erfolgreich versendet',
      messageId: info.messageId,
      emailDetails: {
        to,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        contentLength: content.length
      }
    });

  } catch (error) {
    console.error('[WorkingEmail] Error sending email:', error);
    
    // Return a more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der E-Mail',
      details: errorMessage
    });
  }
});

export default router;
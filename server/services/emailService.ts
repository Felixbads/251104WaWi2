/**
 * E-Mail-Service für das Versenden von E-Mails
 * Verwendet Nodemailer für den E-Mail-Versand
 */
import nodemailer from 'nodemailer';
import { promises as fs } from 'fs';
import path from 'path';

// Email-Konfiguration aus Umgebungsvariablen
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@automaten-app.de';

// Standardnachrichten für Fehler
const ERROR_MESSAGES = {
  MISSING_CREDENTIALS: 'E-Mail-Zugangsdaten sind nicht konfiguriert. Bitte E-Mail-Einstellungen überprüfen.',
  SEND_FAILED: 'E-Mail konnte nicht gesendet werden. Bitte erneut versuchen oder Support kontaktieren.',
  ATTACHMENT_FAILED: 'Anhang konnte nicht erstellt werden. Bitte erneut versuchen.'
};

// Transport-Konfiguration für Nodemailer
export const createTransporter = () => {
  // Prüfen, ob die erforderlichen Umgebungsvariablen gesetzt sind
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('E-Mail-Zugangsdaten fehlen. E-Mail-Versand ist deaktiviert.');
    return null;
  }

  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465, // true für Port 465, false für andere Ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
};

// Interface für E-Mail-Anhänge
interface Attachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

// Interface für E-Mail-Optionen
interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/**
 * Sendet eine E-Mail mit den angegebenen Optionen
 * @param options - E-Mail-Optionen (Empfänger, Betreff, Text, HTML, Anhänge)
 * @returns Promise mit dem Versandergebnis
 */
export const sendEmail = async (options: EmailOptions) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error(ERROR_MESSAGES.MISSING_CREDENTIALS);
  }

  try {
    const result = await transporter.sendMail({
      from: EMAIL_FROM,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text || '',
      html: options.html || '',
      attachments: options.attachments || [],
      replyTo: options.replyTo
    });

    console.log(`E-Mail erfolgreich gesendet: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    throw new Error(`${ERROR_MESSAGES.SEND_FAILED} Details: ${error.message}`);
  }
};

/**
 * Sendet eine Bestellbestätigung an den Lieferanten
 * @param order - Bestelldaten
 * @param supplierEmail - E-Mail-Adresse des Lieferanten
 * @param pdfBuffer - Buffer mit der PDF-Datei der Bestellung
 * @param options - Zusätzliche E-Mail-Optionen (optional)
 * @returns Promise mit dem Versandergebnis
 */
export const sendOrderConfirmation = async (
  order: any, 
  supplierEmail: string, 
  pdfBuffer: Buffer,
  options?: Partial<EmailOptions>
) => {
  if (!order || !supplierEmail || !pdfBuffer) {
    throw new Error('Fehlende Daten für Bestellbestätigung');
  }

  // Formatiere das Datum für die E-Mail
  const orderDate = order.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : 'DATUM_FEHLT';

  // HTML-Inhalt für die E-Mail
  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
          .footer { border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #777; }
          h1 { color: #0070f3; }
          p { margin: 10px 0; }
          .order-details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .btn { display: inline-block; background-color: #0070f3; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Bestellung #${order.orderNumber}</h1>
          </div>
          
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>anbei erhalten Sie unsere Bestellung ${order.orderNumber} vom ${orderDate}.</p>
          
          <div class="order-details">
            <p><strong>Bestellnummer:</strong> ${order.orderNumber}</p>
            <p><strong>Datum:</strong> ${orderDate}</p>
            <p><strong>Lieferant:</strong> ${order.supplierName || 'Nicht angegeben'}</p>
            <p><strong>Lieferort:</strong> ${order.locationName || 'Nicht angegeben'}</p>
          </div>
          
          <p>Bitte bestätigen Sie den Erhalt dieser Bestellung und informieren Sie uns über das voraussichtliche Lieferdatum.</p>
          
          <p>Mit freundlichen Grüßen<br>
          Nationalpark Zentrum</p>
          
          <div class="footer">
            <p>Dies ist eine automatisch generierte E-Mail. Bitte antworten Sie nicht direkt auf diese Nachricht.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  // Text-Inhalt für die E-Mail (für E-Mail-Clients, die kein HTML unterstützen)
  const textContent = `
    Bestellung #${order.orderNumber}
    
    Sehr geehrte Damen und Herren,
    
    anbei erhalten Sie unsere Bestellung ${order.orderNumber} vom ${orderDate}.
    
    Bestellnummer: ${order.orderNumber}
    Datum: ${orderDate}
    Lieferant: ${order.supplierName || 'Nicht angegeben'}
    Lieferort: ${order.locationName || 'Nicht angegeben'}
    
    Bitte bestätigen Sie den Erhalt dieser Bestellung und informieren Sie uns über das voraussichtliche Lieferdatum.
    
    Mit freundlichen Grüßen
    Nationalpark Zentrum
    
    ---
    Dies ist eine automatisch generierte E-Mail. Bitte antworten Sie nicht direkt auf diese Nachricht.
  `;

  // E-Mail-Optionen zusammenstellen
  const emailOptions: EmailOptions = {
    to: supplierEmail,
    subject: `Bestellung ${order.orderNumber} vom ${orderDate}`,
    text: textContent,
    html: htmlContent,
    attachments: [
      {
        filename: `Bestellung_${order.orderNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ],
    ...options
  };

  // E-Mail senden
  return await sendEmail(emailOptions);
};

/**
 * Testet die E-Mail-Konfiguration durch Senden einer Test-E-Mail
 * @param testEmail - E-Mail-Adresse für den Test
 * @returns Promise mit dem Versandergebnis
 */
export const testEmailConfiguration = async (testEmail: string) => {
  const testOptions: EmailOptions = {
    to: testEmail,
    subject: 'Test-E-Mail von Automaten-App',
    text: 'Dies ist eine Test-E-Mail, um die E-Mail-Konfiguration zu überprüfen.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0070f3;">Test-E-Mail</h1>
        <p>Dies ist eine Test-E-Mail, um die E-Mail-Konfiguration zu überprüfen.</p>
        <p>Wenn Sie diese E-Mail erhalten haben, ist die E-Mail-Konfiguration korrekt.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Dies ist eine automatisch generierte E-Mail. Bitte antworten Sie nicht auf diese Nachricht.
        </p>
      </div>
    `
  };

  return await sendEmail(testOptions);
};

// Export der Funktionen
export default {
  createTransporter,
  sendEmail,
  sendOrderConfirmation,
  testEmailConfiguration
};
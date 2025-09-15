import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// HTML escape function to prevent XSS and template injection
function escapeHtml(unsafe: string | number | undefined | null): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Load SMTP configuration from .env.smtp file with robust parsing
const envSmtpPath = path.join(process.cwd(), '.env.smtp');
if (fs.existsSync(envSmtpPath)) {
  const envSmtpContent = fs.readFileSync(envSmtpPath, 'utf8');
  const envLines = envSmtpContent.split('\n');
  
  envLines.forEach(line => {
    // Skip comments and empty lines
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
      return;
    }
    
    // Handle lines with = in the value by splitting only on first =
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim().replace(/^["']|["']$/g, ''); // Remove quotes
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Create nodemailer transporter with secure configuration
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Only reject in production
    minVersion: 'TLSv1.2' // Use modern TLS version
  },
  requireTLS: smtpPort !== 465 // Require STARTTLS for non-SSL ports
});

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface EmailParams {
  to: string;
  cc?: string;
  bcc?: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP configuration not found. Please check .env.smtp file.');
    return false;
  }

  try {
    const emailData: any = {
      from: params.from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
    };

    if (params.cc) {
      emailData.cc = params.cc.split(',').map((email: string) => email.trim()).filter((email: string) => email);
    }

    if (params.bcc) {
      emailData.bcc = params.bcc.split(',').map((email: string) => email.trim()).filter((email: string) => email);
    }

    if (params.text) {
      emailData.text = params.text;
    }

    if (params.html) {
      emailData.html = params.html;
    }

    if (params.attachments && params.attachments.length > 0) {
      emailData.attachments = params.attachments.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType || 'application/pdf'
      }));
    }

    await transporter.sendMail(emailData);
    console.log('Email sent successfully to:', params.to);
    return true;
  } catch (error) {
    console.error('SMTP email error:', error);
    return false;
  }
}

export function formatOrderDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function generateDefaultEmailTemplate(orderData: any): string {
  const { order, orderItems, warehouse, supplier } = orderData;
  
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .order-details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; }
          .item-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .item-table th, .item-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .item-table th { background-color: #f2f2f2; }
          .footer { background-color: #f4f4f4; padding: 15px; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Neue Bestellung</h2>
        </div>
        
        <div class="content">
          <div class="order-details">
            <h3>Bestelldetails</h3>
            <p><strong>Bestellnummer:</strong> ${escapeHtml(order.orderNumber || order.id)}</p>
            <p><strong>Bestelldatum:</strong> ${escapeHtml(formatOrderDate(new Date(order.orderDate)))}</p>
            <p><strong>Gewünschter Liefertermin:</strong> ${escapeHtml(order.expectedDeliveryDate ? formatOrderDate(new Date(order.expectedDeliveryDate)) : 'Nicht angegeben')}</p>
            <p><strong>Lieferort:</strong> ${escapeHtml(warehouse?.name || 'Nicht angegeben')}</p>
            ${order.comments ? `<p><strong>Kommentare:</strong> ${escapeHtml(order.comments)}</p>` : ''}
          </div>

          <h3>Bestellte Artikel</h3>
          <table class="item-table">
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Menge</th>
                <th>Gebindegröße</th>
                <th>Einzelpreis</th>
                <th>Gesamtpreis</th>
              </tr>
            </thead>
            <tbody>
              ${orderItems.map((item: any) => `
                <tr>
                  <td>${escapeHtml(item.productName || 'Unbekanntes Produkt')}</td>
                  <td>${escapeHtml(item.quantity)}</td>
                  <td>${escapeHtml(item.packageSize || '-')}</td>
                  <td>${escapeHtml(item.unitPrice?.toFixed(2) || '0.00')} €</td>
                  <td>${escapeHtml(item.totalPrice?.toFixed(2) || '0.00')} €</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="order-details">
            <p><strong>Gesamtsumme:</strong> ${escapeHtml(order.totalAmount?.toFixed(2) || '0.00')} €</p>
          </div>
        </div>

        <div class="footer">
          <p>Diese Bestellung wurde automatisch über das Bestellsystem erstellt.</p>
          <p>Bei Fragen wenden Sie sich bitte an: einkauf@proviantomat.de</p>
        </div>
      </body>
    </html>
  `;
}

export function generateDefaultSubject(orderDate: Date): string {
  return `Bestellung vom ${formatOrderDate(orderDate)}`;
}
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

// SMTP-Konfiguration - standardmäßig aktiviert, wenn SMTP-Einstellungen vorhanden sind
const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
console.log(`SMTP-Konfiguration: ${smtpConfigured ? 'Verfügbar' : 'Nicht verfügbar'}`);

// Einrichtung für Nodemailer (SMTP)
let smtpTransporter: Mail | null = null;

// SMTP-Konfiguration, wenn Zugangsdaten vorhanden sind
if (smtpConfigured) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // Zertifikatsfehler ignorieren (nur für Entwicklung, nicht für Produktion)
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log('SMTP-Transporter erfolgreich initialisiert');
    
    // Verbindung testen
    smtpTransporter.verify()
      .then(() => console.log('SMTP-Verbindung erfolgreich getestet'))
      .catch(err => console.error('SMTP-Verbindungstest fehlgeschlagen:', err));
  } catch (error) {
    console.error('Fehler beim Initialisieren des SMTP-Transporters:', error);
  }
} else {
  console.log('Keine SMTP-Konfiguration gefunden. E-Mails werden simuliert und lokal gespeichert.');
}

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Sendet eine E-Mail über SMTP oder simuliert sie für die Entwicklung
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  const from = params.from || 'info@elbsandstein-proviant.de';

  try {
    // Wenn SMTP konfiguriert ist, versuche E-Mail zu senden
    if (smtpConfigured && smtpTransporter) {
      const result = await smtpTransporter.sendMail({
        from: from,
        to: params.to,
        subject: params.subject,
        text: params.text || params.subject, // Fallback zum Betreff, wenn kein Text vorhanden
        html: params.html,
        attachments: params.attachments?.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType || 'application/pdf'
        }))
      });
      console.log(`E-Mail über SMTP erfolgreich gesendet an: ${params.to}`);
      console.log(`Nachrichten-ID: ${result.messageId}`);
      return true;
    }
    
    // 3. Fallback: Simuliere E-Mail-Versand für Entwicklungsumgebung
    console.log(`
    ========= E-MAIL SIMULIERT =========
    An: ${params.to}
    Von: ${from}
    Betreff: ${params.subject}
    Inhalt: ${params.text || params.html}
    Anhänge: ${params.attachments?.map(a => a.filename).join(', ') || 'Keine'}
    ====================================
    `);
    
    // Speichere simulierte E-Mail und Anhänge in temporärem Verzeichnis (nur für Entwicklung)
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Speichere E-Mail-Inhalt
    fs.writeFileSync(
      path.join(tempDir, `email_${timestamp}.txt`),
      `To: ${params.to}\nFrom: ${from}\nSubject: ${params.subject}\n\n${params.text || params.html}`
    );
    
    // Speichere Anhänge
    if (params.attachments && params.attachments.length > 0) {
      params.attachments.forEach((attachment, index) => {
        fs.writeFileSync(
          path.join(tempDir, `attachment_${timestamp}_${index}_${attachment.filename}`),
          attachment.content
        );
      });
    }
    
    return true;
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    return false;
  }
}
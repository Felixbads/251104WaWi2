import nodemailer from 'nodemailer';

// SMTP-Konfiguration - standardmäßig aktiviert, wenn SMTP-Einstellungen vorhanden sind
const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
console.log(`SMTP-Konfiguration: ${smtpConfigured ? 'Verfügbar' : 'Nicht verfügbar'}`);

// Einrichtung für Nodemailer (SMTP)
let transporter: any = null;

// SMTP-Konfiguration, wenn Zugangsdaten vorhanden sind
if (smtpConfigured) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Zertifikatsfehler ignorieren (nur für Entwicklung, nicht für Produktion)
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log('SMTP-Transporter erfolgreich initialisiert');
  } catch (error) {
    console.error('Fehler beim Initialisieren des SMTP-Transporters:', error);
  }
} else {
  console.log('Keine SMTP-Konfiguration gefunden. E-Mails werden simuliert und in der Konsole ausgegeben.');
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

/**
 * Vereinfachter E-Mail-Versand ohne PDF-Anhänge
 */
export async function sendSimpleEmail(options: EmailOptions): Promise<boolean> {
  try {
    const from = options.from || process.env.SMTP_USER || 'info@example.com';
    
    // Wenn SMTP konfiguriert ist, versuche E-Mail zu senden
    if (smtpConfigured && transporter) {
      await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      });
      console.log(`E-Mail erfolgreich gesendet an: ${options.to}`);
      return true;
    }
    
    // Fallback: Simuliere E-Mail-Versand für Entwicklungsumgebung
    console.log(`
    ========= E-MAIL SIMULIERT =========
    An: ${options.to}
    Von: ${from}
    Betreff: ${options.subject}
    Inhalt: 
    ${options.text}
    ====================================
    `);
    
    return true;
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    return false;
  }
}
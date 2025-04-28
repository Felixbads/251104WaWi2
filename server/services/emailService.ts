import { MailService } from '@sendgrid/mail';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';

// SMTP-Konfiguration
const useSmtp = process.env.USE_SMTP === 'true';

// Einrichtung für SendGrid
let mailService: MailService | null = null;

// Prüfen, ob SendGrid API-Key vorhanden ist
if (process.env.SENDGRID_API_KEY) {
  mailService = new MailService();
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid E-Mail-Service initialisiert');
} else {
  console.log('SendGrid API-Key nicht gefunden, verwende Fallback-Methode für E-Mails');
}

// Einrichtung für Nodemailer (SMTP)
let smtpTransporter: any = null;

// SMTP-Konfiguration, falls aktiviert
if (useSmtp) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
    });
    console.log('SMTP-Transporter initialisiert');
  } catch (error) {
    console.error('Fehler beim Initialisieren des SMTP-Transporters:', error);
  }
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
 * Sendet eine E-Mail über SendGrid oder SMTP
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  const from = params.from || 'info@elbsandstein-proviant.de';

  try {
    // 1. Versuch: SendGrid API verwenden
    if (mailService) {
      await mailService.send({
        to: params.to,
        from: from,
        subject: params.subject,
        text: params.text || params.subject, // Fallback zum Betreff, wenn kein Text vorhanden
        html: params.html,
        attachments: params.attachments?.map(attachment => ({
          content: attachment.content.toString('base64'),
          filename: attachment.filename,
          type: attachment.contentType || 'application/pdf',
          disposition: 'attachment'
        }))
      });
      console.log(`E-Mail über SendGrid gesendet an: ${params.to}`);
      return true;
    }
    
    // 2. Versuch: SMTP verwenden
    if (useSmtp && smtpTransporter) {
      await smtpTransporter.sendMail({
        from: from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        attachments: params.attachments?.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType
        }))
      });
      console.log(`E-Mail über SMTP gesendet an: ${params.to}`);
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
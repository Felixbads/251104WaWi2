import { Router, Request, Response } from 'express';
import { createTransport } from 'nodemailer';

const router = Router();

// Direct email sending route with complete isolation from other routers
router.post('/send', async (req: Request, res: Response) => {
  console.log('[DirectEmail] Isolated email send started - ROUTE HIT!');
  console.log('[DirectEmail] Request URL:', req.originalUrl);
  console.log('[DirectEmail] Request method:', req.method);
  console.log('[DirectEmail] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { to, subject, content, from } = req.body;
    
    // Validate required fields
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Keine E-Mail-Adresse angegeben'
      });
    }
    
    if (!subject) {
      return res.status(400).json({
        success: false,
        error: 'Kein Betreff angegeben'
      });
    }
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Kein Inhalt angegeben'
      });
    }

    // Check SMTP configuration
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpSecure = process.env.SMTP_SECURE === 'true';
    const smtpFrom = from || process.env.SMTP_FROM || 'einkauf@proviantomat.de';

    console.log('[DirectEmail] SMTP Configuration:');
    console.log(`- Host: ${smtpHost}`);
    console.log(`- Port: ${smtpPort}`);
    console.log(`- Secure: ${smtpSecure}`);
    console.log(`- User: ${smtpUser ? '***' : 'NOT SET'}`);
    console.log(`- Pass: ${smtpPass ? '***' : 'NOT SET'}`);
    console.log(`- From: ${smtpFrom}`);

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(500).json({
        success: false,
        error: 'SMTP-Konfiguration unvollständig',
        details: 'SMTP_HOST, SMTP_USER und SMTP_PASS müssen konfiguriert sein'
      });
    }

    // Create transporter
    const transporter = createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false,
        servername: smtpHost
      }
    });

    console.log('[DirectEmail] Testing SMTP connection...');
    
    // Test connection
    try {
      await transporter.verify();
      console.log('[DirectEmail] SMTP connection successful');
    } catch (error: any) {
      console.error('[DirectEmail] SMTP connection failed:', error.message);
      return res.status(500).json({
        success: false,
        error: 'SMTP-Verbindung fehlgeschlagen',
        details: error.message
      });
    }

    // Send email
    console.log('[DirectEmail] Sending email...');
    const info = await transporter.sendMail({
      from: smtpFrom,
      to: to,
      subject: subject,
      html: content,
      text: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
    });

    console.log('[DirectEmail] Email sent successfully:', info.messageId);

    res.json({
      success: true,
      message: 'E-Mail erfolgreich gesendet',
      messageId: info.messageId,
      method: 'SMTP'
    });

  } catch (error: any) {
    console.error('[DirectEmail] Email send failed:', error);
    res.status(500).json({
      success: false,
      error: 'E-Mail-Versand fehlgeschlagen',
      details: error.message || 'Unbekannter Fehler beim E-Mail-Versand'
    });
  }
});

export default router;
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// E-Mail senden
router.post('/send', authenticateUser, async (req, res) => {
  const { to, subject, text, html, attachments } = req.body;

  // Validieren
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'Empfänger, Betreff und Inhalt sind erforderlich' });
  }

  try {
    // Nodemailer-Transporter erstellen
    // In einer Produktionsumgebung würden diese Werte aus Umgebungsvariablen kommen
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password',
      },
    });

    // E-Mail-Optionen
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@example.com',
      to,
      subject,
      text,
      html,
      attachments: attachments || [],
    };

    // E-Mail senden
    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, message: 'E-Mail erfolgreich versendet' });
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    return res.status(500).json({ 
      error: 'E-Mail konnte nicht gesendet werden',
      details: (error as Error).message
    });
  }
});

export default router;
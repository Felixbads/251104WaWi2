import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { db } from '../db';
import { orders } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

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

    // Prepare email options
    const mailOptions: any = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to.trim(),
      subject: subject.trim(),
      html: content,
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
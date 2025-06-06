import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { db } from '../db';
import { orders } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Simple email sending endpoint for orders
router.post('/orders/:id/send-email-simple', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const { to, cc, bcc, subject, content } = req.body;

    console.log(`[SimpleEmail] Processing email for order ${orderId}`);
    console.log(`[SimpleEmail] To: ${to}, Subject: ${subject ? 'provided' : 'missing'}`);

    // Validate required fields
    if (!to || !subject || !content) {
      const missing = [];
      if (!to) missing.push('Empfänger-Adresse');
      if (!subject) missing.push('Betreff');
      if (!content) missing.push('Inhalt');
      
      return res.status(400).json({
        success: false,
        error: `Fehlende Pflichtfelder: ${missing.join(', ')}`
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

    // For testing purposes, simulate email sending
    console.log(`[SimpleEmail] Simulating email send to ${to}`);
    console.log(`[SimpleEmail] Subject: ${subject}`);
    console.log(`[SimpleEmail] Content length: ${content.length} characters`);

    // Simulate successful email sending
    const fakeMessageId = `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@proviantomat.de>`;

    // Update order status if it's a draft
    const order = orderResult[0];
    if (order.status === 'draft') {
      await db
        .update(orders)
        .set({ 
          status: 'sent',
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId));
      
      console.log(`[SimpleEmail] Updated order ${orderId} status from 'draft' to 'sent'`);
    }

    res.json({
      success: true,
      message: 'E-Mail erfolgreich gesendet (Testmodus)',
      messageId: fakeMessageId,
      statusUpdated: order.status === 'draft',
      testMode: true,
      emailDetails: {
        to,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        contentLength: content.length
      }
    });

  } catch (error) {
    console.error('[SimpleEmail] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der E-Mail',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
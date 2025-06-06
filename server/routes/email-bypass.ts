import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Minimal validation schema without pattern restrictions
const EmailBypassSchema = z.object({
  to: z.string().min(1, 'E-Mail-Adresse ist erforderlich'),
  cc: z.string().optional().default(''),
  bcc: z.string().optional().default(''),
  subject: z.string().min(1, 'Betreff ist erforderlich'),
  content: z.string().min(1, 'Inhalt ist erforderlich')
});

// POST /api/orders/:id/send-email-bypass
router.post('/:id/send-email-bypass', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Bestell-ID'
      });
    }

    console.log('[EmailBypass] Received request:', {
      orderId,
      body: req.body
    });

    // Validate request body with minimal schema
    const validationResult = EmailBypassSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      console.error('[EmailBypass] Validation failed:', validationResult.error);
      return res.status(400).json({
        success: false,
        error: 'Validierungsfehler',
        details: validationResult.error.errors
      });
    }

    const { to, cc, bcc, subject, content } = validationResult.data;

    // Log the email details for debugging
    console.log('[EmailBypass] Email details:', {
      orderId,
      to,
      cc,
      bcc,
      subject: subject.substring(0, 50) + '...',
      contentLength: content.length
    });

    // Simulate email processing
    const emailResult = {
      success: true,
      emailId: `bypass-${Date.now()}`,
      to,
      cc,
      bcc,
      subject,
      sentAt: new Date().toISOString(),
      testMode: true,
      message: 'E-Mail erfolgreich verarbeitet (Bypass-Modus)'
    };

    console.log('[EmailBypass] Email processing result:', emailResult);

    return res.json(emailResult);

  } catch (error) {
    console.error('[EmailBypass] Unexpected error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Unerwarteter Serverfehler',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
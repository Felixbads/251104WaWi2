import { Router } from 'express';
import { emailService } from '../utils/enhancedEmailService';
import { db } from '../db';
import { orders } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// E-Mail-Konfiguration testen
router.get('/email/test-config', async (req, res) => {
  try {
    const config = emailService.getConfiguration();
    const connectionTest = await emailService.testConnection();
    
    res.json({
      configuration: config,
      connectionTest,
      isReady: config.isConfigured && (connectionTest.sendgrid || connectionTest.nodemailer)
    });
  } catch (error: any) {
    console.error('[EnhancedEmailRoute] Fehler beim Testen der E-Mail-Konfiguration:', error);
    res.status(500).json({
      error: 'Fehler beim Testen der E-Mail-Konfiguration',
      details: error.message
    });
  }
});

// Fallback route to handle existing frontend calls
router.post('/orders/:id/send-email', async (req, res) => {
  console.log('[EnhancedEmailRoute] Handling order email send request for order:', req.params.id);
  console.log('[EnhancedEmailRoute] Request body:', req.body);
  
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { to, subject, content, supplierEmail, cc, bcc } = req.body;

    console.log('[EnhancedEmailRoute] Attempting to send email with enhanced service...');
    
    // Use the enhanced email service to send the email with correct parameters
    const result = await emailService.sendEmail(
      to || supplierEmail,
      subject || `Bestellung - Order ${orderId}`,
      content || 'Bestelldetails werden verarbeitet...',
      process.env.SMTP_FROM || 'einkauf@proviantomat.de',
      cc,
      bcc
    );

    console.log('[EnhancedEmailRoute] Email send result:', result);

    if (result.success) {
      res.json({
        success: true,
        message: 'E-Mail erfolgreich gesendet',
        messageId: result.messageId,
        method: result.method
      });
    } else {
      console.error('[EnhancedEmailRoute] Email send failed:', result.error);
      res.status(500).json({
        success: false,
        error: 'E-Mail konnte nicht gesendet werden',
        details: result.error || 'Unbekannter Fehler bei der E-Mail-Übertragung'
      });
    }
  } catch (error: any) {
    console.error('[EnhancedEmailRoute] Exception in order email send:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der E-Mail',
      details: error.message || 'Unbekannter Serverfehler'
    });
  }
});

// Verbesserte Bestell-E-Mail-Route (Enhanced endpoint)
router.post('/orders/:id/send-email-enhanced', async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { to, subject, content, templateType = 'standard', cc, bcc } = req.body;
    
    // Eingabevalidierung
    if (isNaN(orderId)) {
      return res.status(400).json({ 
        success: false,
        error: "Ungültige Bestellungs-ID" 
      });
    }
    
    if (!to || !to.includes('@')) {
      return res.status(400).json({ 
        success: false,
        error: "Eine gültige E-Mail-Adresse des Empfängers muss angegeben werden" 
      });
    }
    
    console.log(`[EnhancedEmailRoute] Starte E-Mail-Versand für Bestellung ${orderId} an ${to}`);
    
    // E-Mail-Konfiguration prüfen
    const config = emailService.getConfiguration();
    console.log(`[EnhancedEmailRoute] Konfiguration: SendGrid=${config.usesSendGrid}, Nodemailer=${config.usesNodemailer}, Configured=${config.isConfigured}`);
    
    if (!config.isConfigured) {
      return res.status(500).json({
        success: false,
        error: 'Keine E-Mail-Konfiguration vorhanden. Bitte konfigurieren Sie SendGrid-API-Key oder SMTP-Einstellungen.',
        needsConfiguration: true,
        configurationHelp: {
          sendgrid: 'Setzen Sie SENDGRID_API_KEY Environment Variable',
          smtp: 'Setzen Sie SMTP_HOST, SMTP_USER, SMTP_PASS Environment Variables'
        }
      });
    }
    
    // Verbindungstest (optional, für bessere Fehlerdiagnose)
    let connectionStatus = null;
    try {
      connectionStatus = await emailService.testConnection();
      console.log(`[EnhancedEmailRoute] Verbindungstest: SendGrid=${connectionStatus.sendgrid}, Nodemailer=${connectionStatus.nodemailer}`);
      
      if (!connectionStatus.sendgrid && !connectionStatus.nodemailer) {
        console.warn(`[EnhancedEmailRoute] Alle Verbindungstests fehlgeschlagen: ${connectionStatus.error}`);
      }
    } catch (testError) {
      console.warn('[EnhancedEmailRoute] Verbindungstest nicht möglich, versuche trotzdem zu senden:', testError);
    }
    
    // E-Mail senden
    console.log(`[EnhancedEmailRoute] Sende E-Mail mit Template: ${templateType}`);
    const result = await emailService.sendOrderEmail(
      orderId,
      to,
      subject,
      content,
      templateType,
      cc,
      bcc
    );
    
    console.log(`[EnhancedEmailRoute] E-Mail-Resultat:`, result);
    
    if (result.success) {
      // Bestellstatus aktualisieren
      try {
        const orderResult = await db
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);
        
        if (orderResult && orderResult.length > 0) {
          const order = orderResult[0];
          
          if (order.status === 'draft') {
            // Statushistorie verwalten
            let currentHistory = [];
            try {
              if (order.statusHistory) {
                if (typeof order.statusHistory === 'string') {
                  currentHistory = JSON.parse(order.statusHistory);
                } else if (Array.isArray(order.statusHistory)) {
                  currentHistory = order.statusHistory;
                }
              }
            } catch (parseError) {
              console.error("Fehler beim Parsen der Statushistorie:", parseError);
              currentHistory = [];
            }
            
            // Neuen Statuseintrag erstellen
            const newStatusEntry = {
              status: "sent",
              timestamp: new Date().toISOString(),
              note: `E-Mail an ${to} gesendet via ${result.method || 'unbekannte Methode'}`,
              messageId: result.messageId
            };
            
            await db
              .update(orders)
              .set({
                status: 'sent',
                updatedAt: new Date(),
                statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
              })
              .where(eq(orders.id, orderId));
            
            console.log(`[EnhancedEmailRoute] Bestellstatus für ${orderId} erfolgreich auf 'sent' aktualisiert`);
          }
        }
      } catch (statusError) {
        console.error('[EnhancedEmailRoute] Fehler beim Aktualisieren des Bestellstatus:', statusError);
        // E-Mail wurde erfolgreich gesendet, Status-Update ist sekundär
      }
      
      res.json({ 
        success: true, 
        message: `E-Mail wurde erfolgreich über ${result.method || 'unbekannte Methode'} gesendet.`,
        details: {
          method: result.method,
          messageId: result.messageId,
          recipient: to,
          orderId: orderId,
          templateUsed: templateType
        }
      });
    } else {
      // E-Mail-Versand fehlgeschlagen
      console.error(`[EnhancedEmailRoute] E-Mail-Versand fehlgeschlagen: ${result.error}`);
      
      res.status(500).json({ 
        success: false, 
        error: result.error || 'E-Mail konnte nicht gesendet werden.',
        details: {
          method: result.method,
          recipient: to,
          orderId: orderId,
          configurationStatus: config,
          connectionStatus: connectionStatus
        }
      });
    }
  } catch (error: any) {
    console.error('[EnhancedEmailRoute] Unerwarteter Fehler beim E-Mail-Versand:', error);
    res.status(500).json({ 
      success: false, 
      error: `Unerwarteter Fehler beim E-Mail-Versand: ${error.message || error.toString()}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
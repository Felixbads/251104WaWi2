/**
 * E-Mail-Routen für den Versand von E-Mails aus dem Frontend
 */
import { Request, Response, Router } from "express";
import { z } from "zod";
import emailService from "../services/emailService";
import { storage } from "../storage";

const router = Router();

// Schema für die E-Mail-Validierung
const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(3),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string().optional()
  })).optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  replyTo: z.string().email().optional()
});

// Schema für die Bestellbestätigung
const orderConfirmationSchema = z.object({
  orderId: z.number().positive(),
  supplierEmail: z.string().email(),
  pdfBase64: z.string(), // Base64-kodierte PDF-Datei
  additionalNotes: z.string().optional()
});

// Testet die E-Mail-Konfiguration
router.post("/test", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email || !z.string().email().safeParse(email).success) {
      return res.status(400).json({ 
        success: false, 
        error: "Ungültige E-Mail-Adresse" 
      });
    }
    
    const result = await emailService.testEmailConfiguration(email);
    
    res.json({
      success: true,
      message: "Test-E-Mail erfolgreich gesendet",
      result
    });
  } catch (error) {
    console.error("Fehler beim Senden der Test-E-Mail:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Fehler beim Senden der Test-E-Mail"
    });
  }
});

// Sendet eine allgemeine E-Mail
router.post("/send", async (req: Request, res: Response) => {
  try {
    const emailData = emailSchema.parse(req.body);
    
    // Konvertiere Base64-kodierte Anhänge in Buffer
    if (emailData.attachments) {
      emailData.attachments = emailData.attachments.map(attachment => ({
        ...attachment,
        content: Buffer.from(attachment.content, 'base64')
      }));
    }
    
    const result = await emailService.sendEmail(emailData);
    
    res.json({
      success: true,
      message: "E-Mail erfolgreich gesendet",
      result
    });
  } catch (error) {
    console.error("Fehler beim Senden der E-Mail:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "Ungültige Daten für den E-Mail-Versand",
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || "Fehler beim Senden der E-Mail"
    });
  }
});

// Sendet eine Bestellbestätigung per E-Mail
router.post("/order-confirmation", async (req: Request, res: Response) => {
  try {
    const { orderId, supplierEmail, pdfBase64, additionalNotes } = orderConfirmationSchema.parse(req.body);
    
    // Bestellung aus der Datenbank abrufen
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Bestellung nicht gefunden"
      });
    }
    
    // PDF-Daten aus Base64 konvertieren
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // Zusätzliche E-Mail-Optionen
    const emailOptions: any = {};
    if (additionalNotes) {
      emailOptions.text = additionalNotes;
    }
    
    // Bestellbestätigung senden
    const result = await emailService.sendOrderConfirmation(
      order,
      supplierEmail,
      pdfBuffer,
      emailOptions
    );
    
    // Bestellung aktualisieren - Status auf "ordered" setzen, wenn aktuell "open"
    if (order.status === "open") {
      await storage.updateOrder(orderId, {
        status: "ordered",
        statusHistory: JSON.stringify([
          ...(order.statusHistory ? JSON.parse(order.statusHistory) : []),
          {
            status: "ordered",
            timestamp: new Date().toISOString(),
            user: req.user?.username || "System",
            note: "Bestellung per E-Mail an Lieferanten gesendet"
          }
        ])
      });
    }
    
    res.json({
      success: true,
      message: "Bestellbestätigung erfolgreich gesendet",
      result
    });
  } catch (error) {
    console.error("Fehler beim Senden der Bestellbestätigung:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "Ungültige Daten für die Bestellbestätigung",
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || "Fehler beim Senden der Bestellbestätigung"
    });
  }
});

export default router;
import express from 'express';
import { storage } from '../storage';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { sendEmail } from '../services/emailService';
import { z } from 'zod';

// Mock-generatePdf-Funktion für die Entwicklung
async function generatePdf(order: any): Promise<Buffer> {
  const mockPdfContent = `
    Bestellung: ${order.orderNumber}
    Datum: ${new Date().toLocaleDateString()}
    
    Dies ist ein Test-PDF für die Bestellung.
  `;
  return Buffer.from(mockPdfContent);
}

const router = express.Router();

// Für die Entwicklung: keine Authentifizierung erforderlich

// E-Mail-Templates API
const templates = [
  {
    id: 1,
    name: 'Standard Bestellung',
    subject: 'Neue Bestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Bestellung mit der Nummer {{orderNumber}}.

Details entnehmen Sie bitte dem angehängten PDF-Dokument.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`
  },
  {
    id: 2,
    name: 'Dringende Bestellung',
    subject: 'DRINGEND: Bestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere DRINGENDE Bestellung mit der Nummer {{orderNumber}}.

Bitte beachten Sie, dass wir die Ware bis zum angegeben Liefertermin benötigen.
Details entnehmen Sie bitte dem angehängten PDF-Dokument.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`
  },
  {
    id: 3,
    name: 'Nachbestellung',
    subject: 'Nachbestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Nachbestellung mit der Nummer {{orderNumber}}.

Diese Bestellung ergänzt unsere vorherige Bestellung. Details entnehmen Sie bitte dem angehängten PDF-Dokument.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`
  }
];

// API zum Abrufen aller E-Mail-Templates
router.get('/mail-templates', (req, res) => {
  // Sende eine Liste aller verfügbaren Templates
  res.json(templates.map(template => ({
    id: template.id,
    name: template.name
  })));
});

// API zum Abrufen eines spezifischen E-Mail-Templates
router.get('/mail-templates/:id', (req, res) => {
  const templateId = parseInt(req.params.id);
  const template = templates.find(t => t.id === templateId);
  
  if (!template) {
    return res.status(404).json({ error: 'Template nicht gefunden' });
  }
  
  res.json(template);
});

// API zum Senden einer E-Mail mit Bestellung
router.post('/orders/:id/email', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { supplierEmail, subject, content, additionalNotes } = req.body;
    
    // Validiere die Anfrage
    if (!supplierEmail || !supplierEmail.includes('@')) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
    }
    
    // Bestellung aus der Datenbank abrufen
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // PDF für diese Bestellung generieren
    const pdfBuffer = await generatePdf(order);
    
    // E-Mail mit PDF-Anhang senden
    await sendEmail({
      to: supplierEmail,
      subject: subject || `Bestellung ${order.orderNumber} von Elbsandstein Proviant & Quartier GmbH`,
      text: content || `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Bestellung mit der Nummer ${order.orderNumber}.

${additionalNotes ? `Anmerkungen: ${additionalNotes}\n\n` : ''}
Details entnehmen Sie bitte dem angehängten PDF-Dokument.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`,
      attachments: [
        {
          filename: `Bestellung_${order.orderNumber}.pdf`,
          content: pdfBuffer
        }
      ]
    });
    
    // Bestellung als "gesendet" markieren
    if (storage.markOrderAsSent) {
      await storage.markOrderAsSent(orderId);
    } else {
      console.log('Methode markOrderAsSent nicht verfügbar, Status wird nicht aktualisiert');
    }
    
    res.json({ success: true, message: 'E-Mail erfolgreich gesendet' });
  } catch (error: any) {
    console.error('Fehler beim Senden der E-Mail:', error);
    res.status(500).json({ error: `Fehler beim Senden der E-Mail: ${error.message}` });
  }
});

// API zum Abrufen einer E-Mail-Vorlage für eine Bestellung
router.get('/orders/:id/email-template', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const templateType = req.query.type || 'standard';
    
    // Bestellung aus der Datenbank abrufen
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // Passende Vorlage finden
    let template;
    if (templateType === 'dringend') {
      template = templates[1]; // Dringende Bestellung
    } else if (templateType === 'nachbestellung') {
      template = templates[2]; // Nachbestellung
    } else {
      template = templates[0]; // Standard
    }
    
    // Platzhalter ersetzen
    let subject = template.subject.replace('{{orderNumber}}', order.orderNumber);
    let content = template.content.replace('{{orderNumber}}', order.orderNumber);
    
    if (order.supplierName) {
      content = content.replace('{{supplierName}}', order.supplierName);
    }
    
    res.json({
      subject,
      content
    });
  } catch (error: any) {
    console.error('Fehler beim Laden der E-Mail-Vorlage:', error);
    res.status(500).json({ error: `Fehler beim Laden der E-Mail-Vorlage: ${error.message}` });
  }
});

export default router;
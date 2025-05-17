import express from 'express';
import { storage } from '../storage';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import fs from 'fs';
import path from 'path';
import { sendEmail } from '../services/emailService';
import { generateOrderPDF } from '../services/pdfService';
import { z } from 'zod';

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
    console.log(`Generiere PDF für Bestellung ${orderId}...`);
    const pdfBuffer = await generatePdf(order);
    console.log(`PDF erfolgreich generiert (${pdfBuffer.length} Bytes)`);
    
    // PDF in temp Verzeichnis speichern, damit wir es inspizieren können
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(path.join(tempDir, `bestellung_${order.orderNumber}.pdf`), pdfBuffer);
    console.log(`PDF gespeichert in temp/bestellung_${order.orderNumber}.pdf`);
    
    // E-Mail mit PDF-Anhang senden
    console.log(`Sende E-Mail an ${supplierEmail}...`);
    const emailSent = await sendEmail({
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
    
    console.log(`E-Mail-Versand Status: ${emailSent ? 'Erfolgreich' : 'Fehlgeschlagen'}`);
    
    // Wenn kein SMTP-Server konfiguriert ist, zeige Hinweis an
    if (!process.env.SMTP_HOST) {
      console.log('HINWEIS: SMTP nicht konfiguriert - E-Mail wurde nur simuliert');
    }
    
    // Bestellung als "gesendet" markieren
    try {
      if (storage.markOrderAsSent) {
        const updatedOrder = await storage.markOrderAsSent(orderId);
        console.log(`Bestellung ${orderId} auf "sent" gesetzt:`, updatedOrder?.status);
        
        if (!updatedOrder) {
          console.error(`Fehler: Bestellung mit ID ${orderId} nicht gefunden`);
        } else if (updatedOrder.status !== 'sent') {
          console.error(`Status wurde nicht korrekt aktualisiert, bleibt: ${updatedOrder.status}`);
        }
      } else {
        console.warn('Methode markOrderAsSent nicht verfügbar');
      }
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Bestellstatus:`, error);
      // Trotzdem fortfahren, da die E-Mail ja versendet wurde
    }
    
    // SMTP-Konfiguration prüfen und entsprechende Nachricht zurückgeben
    const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;
    const message = smtpConfigured 
      ? 'E-Mail erfolgreich versendet' 
      : 'E-Mail-Versand simuliert (kein SMTP-Server konfiguriert)';
    
    res.json({ 
      success: true, 
      message: message,
      orderStatus: 'sent',
      emailSimulated: !smtpConfigured
    });
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
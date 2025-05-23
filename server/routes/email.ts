import express from 'express';
import { storage } from '../storage';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import fs from 'fs';
import path from 'path';
import { sendEmail } from '../services/emailService';
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
router.post('/orders/:id/send-email', async (req, res) => {
  console.log(`[EMAIL ROUTE] POST /orders/${req.params.id}/send-email aufgerufen`);
  console.log(`[EMAIL ROUTE] Request body:`, req.body);
  try {
    const orderId = parseInt(req.params.id);
    const { to, supplierEmail, subject, content, additionalNotes } = req.body;
    const emailAddress = to || supplierEmail; // Frontend sendet 'to', Backend erwartet 'supplierEmail'
    
    // Validiere die Anfrage
    if (!emailAddress || !emailAddress.includes('@')) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
    }
    
    // Bestellung aus der Datenbank abrufen
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // Bestellpositionen abrufen
    const orderItems = await storage.getOrderItems(orderId);
    console.log(`${orderItems.length} Bestellpositionen gefunden für Bestellung ${order.orderNumber}`);
    
    // Formatiere die Bestellpositionen als Text
    let itemsText = '';
    if (orderItems.length > 0) {
      itemsText = '\nBestellpositionen:\n';
      itemsText += '----------------------------------------------------\n';
      itemsText += 'Pos | Produktname | Menge | Einzelpreis | Gesamtpreis\n';
      itemsText += '----------------------------------------------------\n';
      
      orderItems.forEach((item, index) => {
        const unitPrice = item.unitPrice ? `${item.unitPrice.toFixed(2)} €` : 'k.A.';
        const totalPrice = item.totalPrice ? `${item.totalPrice.toFixed(2)} €` : 'k.A.';
        itemsText += `${index + 1} | ${item.productName} | ${item.quantity} ${item.unit || 'stk'} | ${unitPrice} | ${totalPrice}\n`;
      });
      
      // Gesamtsumme
      const totalAmount = orderItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      itemsText += '----------------------------------------------------\n';
      itemsText += `Gesamtbetrag: ${totalAmount.toFixed(2)} €\n\n`;
    } else {
      itemsText = '\nKeine Bestellpositionen vorhanden.\n\n';
    }
    
    // Lieferantendaten anzeigen, falls vorhanden
    let supplierText = '';
    if (order.supplierName) {
      supplierText = `\nLieferant: ${order.supplierName}\n`;
    }
    
    // Lieferdatum anzeigen, falls vorhanden
    let deliveryText = '';
    if (order.expectedDeliveryDate) {
      const deliveryDate = new Date(order.expectedDeliveryDate);
      deliveryText = `\nGewünschtes Lieferdatum: ${deliveryDate.toLocaleDateString('de-DE')}\n`;
    }
    
    // E-Mail mit Bestelldetails im Text senden
    console.log(`Sende E-Mail an ${emailAddress}...`);
    const emailSent = await sendEmail({
      to: emailAddress,
      subject: subject || `Bestellung ${order.orderNumber} von Elbsandstein Proviant & Quartier GmbH`,
      text: content || `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Bestellung mit der Nummer ${order.orderNumber}.

${supplierText}${deliveryText}
${additionalNotes ? `Anmerkungen: ${additionalNotes}\n\n` : ''}
${itemsText}
Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`,
      // Keine Anhänge mehr
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

// API zum Abrufen einer vollständigen E-Mail-Vorlage für eine Bestellung
router.get('/orders/:id/email-template', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const templateType = req.query.type || 'standard';
    
    // Bestellung aus der Datenbank abrufen
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    // Bestellpositionen abrufen
    const orderItems = await storage.getOrderItems(orderId);
    
    // Passende Vorlage finden
    let template;
    if (templateType === 'dringend') {
      template = templates[1]; // Dringende Bestellung
    } else if (templateType === 'nachbestellung') {
      template = templates[2]; // Nachbestellung
    } else {
      template = templates[0]; // Standard
    }
    
    // Vollständige Bestelldetails für E-Mail zusammenstellen
    const orderDate = new Date(order.createdAt).toLocaleDateString('de-DE');
    const deliveryDate = order.expectedDeliveryDate ? 
      new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 
      'Noch nicht festgelegt';
    
    // Bestellpositionen formatieren
    let itemsList = '';
    let totalAmount = 0;
    
    orderItems.forEach(item => {
      const itemTotal = item.quantity * item.unitPrice;
      totalAmount += itemTotal;
      itemsList += `<li>${item.quantity} ${item.unit} ${item.productName} (${item.unitPrice.toFixed(2)} € je ${item.unit})</li>`;
    });
    
    // Vollständige E-Mail mit allen Bestelldaten erstellen
    let subject = template.subject.replace('{{orderNumber}}', order.orderNumber);
    
    let content = `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

<ul>${itemsList}</ul>

<strong>Bestelldetails:</strong>
• Bestellnummer: ${order.orderNumber}
• Bestelldatum: ${orderDate}
• Gewünschter Liefertermin: ${deliveryDate}
• Gesamtwert: ${totalAmount.toFixed(2)} €
• Priorität: ${order.priority || 'Normal'}

${order.notes ? `<strong>Zusätzliche Hinweise:</strong>\n${order.notes}\n\n` : ''}

Bitte bestätigen Sie den Eingang dieser Bestellung.

Mit freundlichen Grüßen
Ihr Proviantomat Team`;
    
    res.json({
      subject,
      content,
      availableTemplates: templates.map(t => ({ id: t.id, name: t.name })),
      orderDetails: {
        orderNumber: order.orderNumber,
        orderDate,
        deliveryDate,
        totalAmount: totalAmount.toFixed(2),
        itemsCount: orderItems.length,
        supplierName: order.supplierName
      }
    });
  } catch (error: any) {
    console.error('Fehler beim Laden der E-Mail-Vorlage:', error);
    res.status(500).json({ error: `Fehler beim Laden der E-Mail-Vorlage: ${error.message}` });
  }
});

export default router;
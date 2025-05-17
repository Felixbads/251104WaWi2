import express from 'express';
import { storage } from '../storage';
import { sendSimpleEmail } from '../services/simplifiedEmailService';

const router = express.Router();

// API zum Senden einer einfachen E-Mail mit Bestelldetails (ohne PDF-Anhang)
router.post('/orders/:id/simple-email', async (req, res) => {
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
    console.log(`Sende einfache E-Mail an ${supplierEmail}...`);
    const emailText = content || `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen unsere Bestellung mit der Nummer ${order.orderNumber}.

${supplierText}${deliveryText}
${additionalNotes ? `Anmerkungen: ${additionalNotes}\n\n` : ''}
${itemsText}
Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`;

    const emailSent = await sendSimpleEmail({
      to: supplierEmail,
      subject: subject || `Bestellung ${order.orderNumber} von Elbsandstein Proviant & Quartier GmbH`,
      text: emailText
    });
    
    console.log(`E-Mail-Versand Status: ${emailSent ? 'Erfolgreich' : 'Fehlgeschlagen'}`);
    
    // Wenn kein SMTP-Server konfiguriert ist, zeige Hinweis an
    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
    const message = smtpConfigured 
      ? 'E-Mail erfolgreich versendet' 
      : 'E-Mail-Versand simuliert (kein SMTP-Server konfiguriert)';
    
    // Bestellung als "gesendet" markieren
    try {
      if (storage.markOrderAsSent) {
        const updatedOrder = await storage.markOrderAsSent(orderId);
        console.log(`Bestellung ${orderId} auf "sent" gesetzt:`, updatedOrder?.status);
      } else {
        console.warn('Methode markOrderAsSent nicht verfügbar');
      }
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Bestellstatus:`, error);
      // Trotzdem fortfahren, da die E-Mail ja versendet wurde
    }
    
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

export default router;
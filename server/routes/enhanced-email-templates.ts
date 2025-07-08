import express from 'express';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { db } from '../db';
import { orders, orderItems, products, suppliers, warehouses } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

const router = express.Router();

// Get enhanced email template for order
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { template = 'standard', showPrices = 'true', deliveryType = 'delivery' } = req.query;
    const showPricesInEmail = showPrices === 'true';
    const isPickup = deliveryType === 'pickup';

    // Get order details - simplified query
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, parseInt(orderId)))
      .limit(1);
    
    if (orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult[0];

    // Get order items - simplified query  
    const itemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, parseInt(orderId)));
    
    const items = itemsResult;

    // Determine final price visibility
    const finalShowPrices = showPricesInEmail;

    // Generate email content based on template type
    let subject = '';
    let content = '';

    // Safe date formatting with fallbacks
    const orderDate = order.orderDate || order.createdAt 
      ? format(new Date(order.orderDate || order.createdAt), 'dd.MM.yyyy', { locale: de })
      : format(new Date(), 'dd.MM.yyyy', { locale: de });
    
    const deliveryDate = order.expectedDeliveryDate 
      ? format(new Date(order.expectedDeliveryDate), 'dd.MM.yyyy', { locale: de })
      : 'Nach Absprache';

    switch (template) {
      case 'urgent':
        subject = `DRINGEND: Bestellung ${order.orderNumber} - ${order.supplierName}`;
        content = generateUrgentEmailContent(order, items, finalShowPrices, orderDate, deliveryDate, isPickup);
        break;
      case 'standard':
      default:
        subject = `Bestellung ${order.orderNumber} - ${order.supplierName}`;
        content = generateStandardEmailContent(order, items, finalShowPrices, orderDate, deliveryDate, isPickup);
        break;
    }

    res.json({
      subject,
      content,
      supplierEmail: order.supplierName ? `${order.supplierName.toLowerCase().replace(/\s+/g, '')}@example.com` : 'supplier@example.com',
      orderDetails: {
        orderNumber: order.orderNumber,
        orderDate: orderDate,
        deliveryDate: deliveryDate,
        totalAmount: finalShowPrices && order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : 'Preis auf Anfrage',
        itemsCount: items.length,
        supplierName: order.supplierName
      }
    });

  } catch (error) {
    console.error('Error generating email template:', error);
    res.status(500).json({ error: 'Fehler beim Generieren der E-Mail-Vorlage' });
  }
});

function generateStandardEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string, isPickup: boolean): string {
  let content = `Sehr geehrte Damen und Herren,

hiermit möchten wir folgende Bestellung aufgeben:

Bestellnummer: ${order.orderNumber}
Bestelldatum: ${orderDate}
${isPickup ? 'Gewünschter Abholtermin' : 'Gewünschter Liefertermin'}: ${deliveryDate}

${isPickup ? 'Abholort' : 'Lieferadresse'}:
${order.deliveryLocation || order.warehouseName || 'Elbsandstein Proviant & Quartier GmbH'}
Pirnaer Str. 19
01829 Stadt Wehlen
Deutschland

Lieferart: ${isPickup ? 'Abholung' : 'Lieferung'}

Bestellpositionen:
`;

  // Add items
  items.forEach((item, index) => {
    const productName = `Artikel ${item.productId}`;
    const quantity = `${item.quantity} ${item.unit || 'Stk'}`;
    
    if (showPrices && item.unitPrice) {
      const unitPrice = `${parseFloat(item.unitPrice).toFixed(2)} €`;
      const totalPrice = `${parseFloat(item.totalPrice || (item.quantity * item.unitPrice)).toFixed(2)} €`;
      content += `${index + 1}. ${productName} - ${quantity} à ${unitPrice} = ${totalPrice}\n`;
    } else {
      content += `${index + 1}. ${productName} - ${quantity}\n`;
    }
  });

  if (showPrices && order.totalAmount) {
    content += `\nGESAMTSUMME: ${order.totalAmount.toFixed(2)} €\n`;
  }

  if (order.notes) {
    content += `\nBesondere Hinweise:\n${order.notes}\n`;
  }

  content += `
Mit freundlichen Grüßen
Ihr Automatenbetreiber-Team

---
Diese E-Mail wurde automatisch generiert.`;

  return content;
}

function generateUrgentEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string, isPickup: boolean): string {
  let content = `*** DRINGENDE BESTELLUNG ***

Sehr geehrte Damen und Herren,

bitte bearbeiten Sie diese Bestellung mit HÖCHSTER PRIORITÄT:

Bestellnummer: ${order.orderNumber}
Bestelldatum: ${orderDate}
${isPickup ? 'DRINGENDER Abholtermin' : 'DRINGENDER Liefertermin'}: ${deliveryDate}

${isPickup ? 'Abholort' : 'Lieferadresse'}:
${order.deliveryLocation || order.warehouseName || 'Elbsandstein Proviant & Quartier GmbH'}
Pirnaer Str. 19
01829 Stadt Wehlen
Deutschland

Lieferart: ${isPickup ? 'Abholung' : 'Lieferung'}

DRINGENDE Bestellpositionen:
`;

  // Add items
  items.forEach((item, index) => {
    const productName = `Artikel ${item.productId}`;
    const quantity = `${item.quantity} ${item.unit || 'Stk'}`;
    
    if (showPrices && item.unitPrice) {
      const unitPrice = `${parseFloat(item.unitPrice).toFixed(2)} €`;
      const totalPrice = `${parseFloat(item.totalPrice || (item.quantity * item.unitPrice)).toFixed(2)} €`;
      content += `${index + 1}. ${productName} - ${quantity} à ${unitPrice} = ${totalPrice}\n`;
    } else {
      content += `${index + 1}. ${productName} - ${quantity}\n`;
    }
  });

  if (showPrices && order.totalAmount) {
    content += `\nGESAMTSUMME: ${order.totalAmount.toFixed(2)} €\n`;
  }

  if (order.notes) {
    content += `\nBesondere Hinweise:\n${order.notes}\n`;
  }

  content += `
*** BITTE UMGEHEND BEARBEITEN ***

Mit dringenden Grüßen
Ihr Automatenbetreiber-Team

---
Diese E-Mail wurde automatisch generiert.`;

  return content;
}

export default router;
import express from 'express';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Enhanced email template generator with price visibility control
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { template = 'standard', showPrices = 'true' } = req.query;
    const showPricesInEmail = showPrices === 'true';

    // Get order details
    const orderQuery = `
      SELECT 
        o.*,
        s.name as supplier_name,
        s.email as supplier_email,
        s.show_prices_in_orders,
        w.name as warehouse_name
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      WHERE o.id = $1
    `;
    
    const orderResult = await db.execute(sql`${orderQuery}`, [orderId]);
    if (orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult[0];

    // Get order items
    const itemsQuery = `
      SELECT 
        oi.*,
        p.name as product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `;
    
    const itemsResult = await db.execute(sql`${itemsQuery}`, [orderId]);
    const items = itemsResult;

    // Determine if prices should be shown (respecting supplier settings)
    const finalShowPrices = showPricesInEmail && (order.show_prices_in_orders !== false);

    // Generate email content based on template type
    let subject = '';
    let content = '';

    const orderDate = format(new Date(order.created_at), 'dd.MM.yyyy', { locale: de });
    const deliveryDate = order.expected_delivery_date 
      ? format(new Date(order.expected_delivery_date), 'dd.MM.yyyy', { locale: de })
      : 'Nach Absprache';

    switch (template) {
      case 'urgent':
        subject = `DRINGEND: Bestellung ${order.order_number} - ${order.supplier_name}`;
        content = generateUrgentEmailContent(order, items, finalShowPrices, orderDate, deliveryDate);
        break;
      case 'standard':
      default:
        subject = `Bestellung ${order.order_number} - ${order.supplier_name}`;
        content = generateStandardEmailContent(order, items, finalShowPrices, orderDate, deliveryDate);
        break;
    }

    res.json({
      subject,
      content,
      supplierEmail: order.supplier_email || '',
      orderDetails: {
        orderNumber: order.order_number,
        orderDate,
        deliveryDate,
        totalAmount: finalShowPrices ? `${order.total_amount.toFixed(2)} €` : 'Preis auf Anfrage',
        itemsCount: items.length,
        supplierName: order.supplier_name
      }
    });

  } catch (error) {
    console.error('Error generating email template:', error);
    res.status(500).json({ error: 'Fehler beim Generieren der E-Mail-Vorlage' });
  }
});

function generateStandardEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string): string {
  let content = `Sehr geehrte Damen und Herren,

hiermit möchten wir folgende Bestellung aufgeben:

Bestellnummer: ${order.order_number}
Bestelldatum: ${orderDate}
Gewünschter Liefertermin: ${deliveryDate}
Lieferort: ${order.delivery_location || order.warehouse_name}

BESTELLPOSITIONEN:
`;

  // Add items
  items.forEach((item, index) => {
    const productName = item.product_name || `Produkt-ID ${item.product_id}`;
    const quantity = `${item.quantity} ${item.unit || 'Stk'}`;
    
    if (showPrices) {
      const unitPrice = `${parseFloat(item.unit_price || 0).toFixed(2)} €`;
      const totalPrice = `${parseFloat(item.total_price || 0).toFixed(2)} €`;
      content += `${index + 1}. ${productName} - ${quantity} à ${unitPrice} = ${totalPrice}\n`;
    } else {
      content += `${index + 1}. ${productName} - ${quantity}\n`;
    }
  });

  if (showPrices) {
    content += `\nGESAMTSUMME: ${order.total_amount.toFixed(2)} €\n`;
  }

  if (order.notes) {
    content += `\nBesondere Hinweise:\n${order.notes}\n`;
  }

  content += `\nBitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.

Mit freundlichen Grüßen
Ihr Bestellteam`;

  return content;
}

function generateUrgentEmailContent(order: any, items: any[], showPrices: boolean, orderDate: string, deliveryDate: string): string {
  let content = `DRINGENDE BESTELLUNG - BITTE SOFORT BEARBEITEN

Sehr geehrte Damen und Herren,

wir benötigen DRINGEND die folgende Bestellung:

Bestellnummer: ${order.order_number}
Bestelldatum: ${orderDate}
DRINGENDER Liefertermin: ${deliveryDate}
Lieferort: ${order.delivery_location || order.warehouse_name}

DRINGENDE BESTELLPOSITIONEN:
`;

  // Add items
  items.forEach((item, index) => {
    const productName = item.product_name || `Produkt-ID ${item.product_id}`;
    const quantity = `${item.quantity} ${item.unit || 'Stk'}`;
    
    if (showPrices) {
      const unitPrice = `${parseFloat(item.unit_price || 0).toFixed(2)} €`;
      const totalPrice = `${parseFloat(item.total_price || 0).toFixed(2)} €`;
      content += `${index + 1}. ${productName} - ${quantity} à ${unitPrice} = ${totalPrice}\n`;
    } else {
      content += `${index + 1}. ${productName} - ${quantity}\n`;
    }
  });

  if (showPrices) {
    content += `\nGESAMTSUMME: ${order.total_amount.toFixed(2)} €\n`;
  }

  if (order.notes) {
    content += `\nBesondere Hinweise:\n${order.notes}\n`;
  }

  content += `\nBITTE BESTÄTIGEN SIE DEN ERHALT DIESER DRINGENDEN BESTELLUNG UMGEHEND!

Mit freundlichen Grüßen
Ihr Bestellteam`;

  return content;
}

export default router;
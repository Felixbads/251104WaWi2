import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Logging-Funktion für den Bestellprozess
function logOrderProcess(step: string, data: any, orderId?: number) {
  const timestamp = new Date().toISOString();
  const logMessage = `[ORDER-V4] ${timestamp} - ${step}${orderId ? ` (Order #${orderId})` : ''}: ${JSON.stringify(data)}`;
  console.log(logMessage);
}

// 1. Neue Bestellung erstellen
router.post('/create', async (req, res) => {
  const client = await pool.connect();
  
  try {
    logOrderProcess('START_ORDER_CREATION', { body: req.body });
    
    const { warehouseId, supplierId, orderItems, expectedDeliveryDate, notes = '' } = req.body;
    
    // Validierung
    if (!warehouseId || !supplierId) {
      logOrderProcess('VALIDATION_ERROR', { error: 'Missing warehouse or supplier' });
      return res.status(400).json({ error: 'Lager und Lieferant sind erforderlich' });
    }
    
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      logOrderProcess('VALIDATION_ERROR', { error: 'No order items' });
      return res.status(400).json({ error: 'Mindestens ein Artikel muss bestellt werden' });
    }
    
    await client.query('BEGIN');
    logOrderProcess('TRANSACTION_STARTED', { warehouseId, supplierId });
    
    // Bestellnummer generieren
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const orderNumberQuery = `
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE order_number LIKE 'ORD-${today}-%'
    `;
    const orderNumberResult = await client.query(orderNumberQuery);
    const orderCount = parseInt(orderNumberResult.rows[0].count) + 1;
    const orderNumber = `ORD-${today}-${orderCount.toString().padStart(3, '0')}`;
    
    logOrderProcess('ORDER_NUMBER_GENERATED', { orderNumber });
    
    // Gesamtbetrag berechnen
    let totalAmount = 0;
    for (const item of orderItems) {
      totalAmount += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
    }
    
    logOrderProcess('TOTAL_CALCULATED', { totalAmount, itemCount: orderItems.length });
    
    // Bestellung erstellen
    const orderQuery = `
      INSERT INTO orders (
        order_number, warehouse_id, supplier_id, order_date, 
        expected_delivery_date, total_amount, status, notes
      ) VALUES ($1, $2, $3, NOW(), $4, $5, 'draft', $6)
      RETURNING id, order_number
    `;
    
    const orderResult = await client.query(orderQuery, [
      orderNumber, warehouseId, supplierId, expectedDeliveryDate, totalAmount, notes
    ]);
    
    const orderId = orderResult.rows[0].id;
    logOrderProcess('ORDER_CREATED', { orderId, orderNumber }, orderId);
    
    // Bestellpositionen erstellen
    for (const item of orderItems) {
      const itemQuery = `
        INSERT INTO order_items (
          order_id, product_id, quantity, unit_price, 
          total_price, product_name, unit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const itemPrice = parseFloat(item.price) || 0;
      const itemQuantity = parseInt(item.quantity) || 0;
      const itemTotal = itemPrice * itemQuantity;
      
      await client.query(itemQuery, [
        orderId, item.productId, itemQuantity, itemPrice, 
        itemTotal, item.productName, item.unit || 'stk'
      ]);
      
      logOrderProcess('ORDER_ITEM_CREATED', { 
        productId: item.productId, 
        productName: item.productName,
        quantity: itemQuantity,
        price: itemPrice 
      }, orderId);
    }
    
    await client.query('COMMIT');
    logOrderProcess('ORDER_COMPLETED', { orderId, orderNumber, totalAmount }, orderId);
    
    res.json({
      success: true,
      order: {
        id: orderId,
        orderNumber: orderNumber,
        totalAmount: totalAmount,
        status: 'draft'
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logOrderProcess('ORDER_ERROR', { error: error.message });
    console.error('Fehler bei Bestellerstellung:', error);
    res.status(500).json({ error: 'Fehler bei der Bestellerstellung' });
  } finally {
    client.release();
  }
});

// 2. Bestellung per E-Mail versenden
router.post('/:orderId/send-email', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { recipientEmail } = req.body;
    
    logOrderProcess('EMAIL_SEND_STARTED', { orderId, recipientEmail }, parseInt(orderId));
    
    // Bestelldaten laden
    const orderQuery = `
      SELECT o.*, w.name as warehouse_name, w.address as warehouse_address,
             s.name as supplier_name, s.email as supplier_email
      FROM orders o
      JOIN warehouses w ON o.warehouse_id = w.id
      JOIN suppliers s ON o.supplier_id = s.id
      WHERE o.id = $1
    `;
    
    const orderResult = await pool.query(orderQuery, [orderId]);
    if (orderResult.rows.length === 0) {
      logOrderProcess('EMAIL_ERROR', { error: 'Order not found' }, parseInt(orderId));
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult.rows[0];
    
    // Bestellpositionen laden
    const itemsQuery = `
      SELECT oi.*, p.product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `;
    
    const itemsResult = await pool.query(itemsQuery, [orderId]);
    const orderItems = itemsResult.rows;
    
    logOrderProcess('ORDER_DATA_LOADED', { 
      orderNumber: order.order_number,
      itemCount: orderItems.length,
      supplier: order.supplier_name 
    }, parseInt(orderId));
    
    // E-Mail-Inhalt erstellen
    const emailSubject = `Neue Bestellung ${order.order_number} von Proviantomat`;
    
    let emailBody = `
Sehr geehrte Damen und Herren,

hiermit möchten wir folgende Bestellung aufgeben:

Bestellnummer: ${order.order_number}
Bestelldatum: ${new Date(order.order_date).toLocaleDateString('de-DE')}
Gewünschtes Lieferdatum: ${new Date(order.expected_delivery_date).toLocaleDateString('de-DE')}

Lieferadresse:
${order.warehouse_name}
${order.warehouse_address || 'Adresse wird nachgereicht'}

Bestellpositionen:
`;

    let totalAmount = 0;
    orderItems.forEach((item, index) => {
      const itemTotal = parseFloat(item.total_price) || 0;
      totalAmount += itemTotal;
      emailBody += `${index + 1}. ${item.product_name || 'Unbekanntes Produkt'}
   Menge: ${item.quantity} ${item.unit || 'Stk'}
   Einzelpreis: ${parseFloat(item.unit_price).toFixed(2)} €
   Gesamtpreis: ${itemTotal.toFixed(2)} €

`;
    });

    emailBody += `
Gesamtsumme: ${totalAmount.toFixed(2)} €

${order.notes ? `Anmerkungen: ${order.notes}` : ''}

Bitte bestätigen Sie uns den Erhalt dieser Bestellung und das voraussichtliche Lieferdatum.

Mit freundlichen Grüßen
Ihr Proviantomat-Team
`;

    // E-Mail versenden (hier würde normalerweise nodemailer verwendet)
    logOrderProcess('EMAIL_CONTENT_PREPARED', { 
      subject: emailSubject,
      bodyLength: emailBody.length,
      totalAmount 
    }, parseInt(orderId));
    
    // Status auf 'sent' setzen
    await pool.query(
      'UPDATE orders SET status = $1, sent_date = NOW() WHERE id = $2',
      ['sent', orderId]
    );
    
    logOrderProcess('EMAIL_SENT_STATUS_UPDATED', { status: 'sent' }, parseInt(orderId));
    
    res.json({
      success: true,
      message: 'E-Mail erfolgreich versendet',
      emailContent: {
        subject: emailSubject,
        body: emailBody,
        recipient: recipientEmail
      }
    });
    
  } catch (error) {
    logOrderProcess('EMAIL_SEND_ERROR', { error: error.message });
    console.error('Fehler beim E-Mail-Versand:', error);
    res.status(500).json({ error: 'Fehler beim E-Mail-Versand' });
  }
});

// 3. Wareneingang erfassen
router.post('/:orderId/goods-receipt', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { orderId } = req.params;
    const { receivedItems } = req.body;
    
    logOrderProcess('GOODS_RECEIPT_STARTED', { 
      orderId, 
      receivedItemsCount: receivedItems?.length 
    }, parseInt(orderId));
    
    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      return res.status(400).json({ error: 'Keine Wareneingangsdaten erhalten' });
    }
    
    await client.query('BEGIN');
    
    // Bestellung laden
    const orderQuery = 'SELECT * FROM orders WHERE id = $1';
    const orderResult = await client.query(orderQuery, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult.rows[0];
    
    // Für jede erhaltene Position
    for (const item of receivedItems) {
      const { productId, receivedQuantity, expiryDate, batchNumber = null } = item;
      
      if (!productId || !receivedQuantity || receivedQuantity <= 0) {
        logOrderProcess('GOODS_RECEIPT_VALIDATION_ERROR', { item });
        continue;
      }
      
      // Batch erstellen
      const batchQuery = `
        INSERT INTO product_batches (
          product_id, warehouse_id, batch_number, expiry_date,
          initial_quantity, current_quantity, status, received_date
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
        RETURNING id
      `;
      
      const batchResult = await client.query(batchQuery, [
        productId, order.warehouse_id, batchNumber, expiryDate,
        receivedQuantity, receivedQuantity
      ]);
      
      const batchId = batchResult.rows[0].id;
      
      logOrderProcess('BATCH_CREATED', {
        batchId,
        productId,
        warehouseId: order.warehouse_id,
        quantity: receivedQuantity,
        expiryDate
      }, parseInt(orderId));
      
      // Lagerbestand aktualisieren oder erstellen
      const inventoryUpdateQuery = `
        INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity, status)
        VALUES ($1, $2, $3, 5, 'active')
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET 
          quantity = inventory_items.quantity + $3,
          last_updated = NOW()
      `;
      
      await client.query(inventoryUpdateQuery, [
        order.warehouse_id, productId, receivedQuantity
      ]);
      
      logOrderProcess('INVENTORY_UPDATED', {
        warehouseId: order.warehouse_id,
        productId,
        addedQuantity: receivedQuantity
      }, parseInt(orderId));
    }
    
    // Bestellstatus aktualisieren
    await client.query(
      'UPDATE orders SET status = $1, received_date = NOW() WHERE id = $2',
      ['received', orderId]
    );
    
    await client.query('COMMIT');
    
    logOrderProcess('GOODS_RECEIPT_COMPLETED', { 
      orderId,
      processedItems: receivedItems.length,
      newStatus: 'received'
    }, parseInt(orderId));
    
    res.json({
      success: true,
      message: 'Wareneingang erfolgreich erfasst',
      processedItems: receivedItems.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logOrderProcess('GOODS_RECEIPT_ERROR', { error: error.message });
    console.error('Fehler beim Wareneingang:', error);
    res.status(500).json({ error: 'Fehler beim Wareneingang' });
  } finally {
    client.release();
  }
});

// 4. Bestellungen auflisten
router.get('/', async (req, res) => {
  try {
    logOrderProcess('LIST_ORDERS_REQUESTED', { query: req.query });
    
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT o.*, w.name as warehouse_name, s.name as supplier_name,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE o.status = $1';
      params.push(status);
    }
    
    query += ' GROUP BY o.id, w.name, s.name ORDER BY o.order_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    logOrderProcess('ORDERS_LISTED', { 
      count: result.rows.length,
      status: status || 'all'
    });
    
    res.json({
      success: true,
      orders: result.rows
    });
    
  } catch (error) {
    logOrderProcess('LIST_ORDERS_ERROR', { error: error.message });
    console.error('Fehler beim Laden der Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Bestellungen' });
  }
});

// 5. Einzelne Bestellung abrufen
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    logOrderProcess('GET_ORDER_DETAILS', { orderId }, parseInt(orderId));
    
    // Bestellung mit Details laden
    const orderQuery = `
      SELECT o.*, w.name as warehouse_name, w.address as warehouse_address,
             s.name as supplier_name, s.email as supplier_email
      FROM orders o
      JOIN warehouses w ON o.warehouse_id = w.id
      JOIN suppliers s ON o.supplier_id = s.id
      WHERE o.id = $1
    `;
    
    const orderResult = await pool.query(orderQuery, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult.rows[0];
    
    // Bestellpositionen laden
    const itemsQuery = `
      SELECT oi.*, p.product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `;
    
    const itemsResult = await pool.query(itemsQuery, [orderId]);
    
    logOrderProcess('ORDER_DETAILS_LOADED', {
      orderNumber: order.order_number,
      status: order.status,
      itemCount: itemsResult.rows.length
    }, parseInt(orderId));
    
    res.json({
      success: true,
      order: {
        ...order,
        items: itemsResult.rows
      }
    });
    
  } catch (error) {
    logOrderProcess('GET_ORDER_ERROR', { error: error.message });
    console.error('Fehler beim Laden der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Bestellung' });
  }
});

export default router;
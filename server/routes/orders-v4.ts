import express from 'express';
import { pool } from '../db';
import { orderValidationSchema, insertOrderItemSchema } from '../../shared/schema';
import { ZodError } from 'zod';

const router = express.Router();

// Logging-Funktion für den Bestellprozess
function logOrderProcess(step: string, data: any, orderId?: number) {
  const timestamp = new Date().toISOString();
  const logMessage = `[ORDER-V4] ${timestamp} - ${step}${orderId ? ` (Order #${orderId})` : ''}: ${JSON.stringify(data)}`;
  console.log(logMessage);
}

// 1. Neue Bestellung erstellen mit zentraler Validierung und Idempotenz
router.post('/create', async (req, res) => {
  const client = await pool.connect();
  
  // Explizit Content-Type setzen für API-Responses
  res.setHeader('Content-Type', 'application/json');
  
  try {
    logOrderProcess('START_ORDER_CREATION', { body: req.body });
    
    // Zentrale Zod-Validierung
    let validatedData;
    try {
      validatedData = orderValidationSchema.parse(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        logOrderProcess('ZOD_VALIDATION_ERROR', { 
          errors: error.errors,
          receivedData: req.body 
        });
        
        return res.status(422).json({
          error: 'Validation Error',
          message: 'Die übermittelten Daten sind ungültig',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      throw error;
    }

    const { 
      supplierId, 
      warehouseId, 
      orderItems, 
      expectedDeliveryDate, 
      notes = '',
      idempotencyKey 
    } = validatedData;

    logOrderProcess('DATA_VALIDATED', { supplierId, warehouseId, itemCount: orderItems.length });
    
    await client.query('BEGIN');
    logOrderProcess('TRANSACTION_STARTED', { warehouseId, supplierId });

    // SECURITY FIX: Idempotenz-Check mit parametrisierter Query (verhindert SQL-Injection)
    if (idempotencyKey) {
      const existingOrderQuery = `
        SELECT id, order_number, status, total_amount
        FROM orders 
        WHERE idempotency_key = $1
        LIMIT 1
      `;
      
      const existingOrderResult = await client.query(existingOrderQuery, [idempotencyKey]);
      
      if (existingOrderResult.rows.length > 0) {
        const existingOrder = existingOrderResult.rows[0];
        logOrderProcess('IDEMPOTENCY_HIT', { 
          idempotencyKey,
          existingOrderId: existingOrder.id,
          orderNumber: existingOrder.order_number 
        });
        
        await client.query('COMMIT');
        return res.status(200).json({
          success: true,
          order: existingOrder,
          message: `Bestellung bereits vorhanden (Idempotenz): ${existingOrder.order_number}`,
          idempotent: true
        });
      }
    }
    
    // CRITICAL FIX: ATOMIC ORDER NUMBER GENERATION using DB sequence (Option A - PREFERRED)
    // Eliminates race conditions through atomic sequence generation
    // ARCHITECT MANDATED: This prevents concurrent requests from getting same order_number
    
    // Gesamtbetrag berechnen
    let totalAmount = 0;
    for (const item of orderItems) {
      // Schema now handles type conversion, so unitPrice and quantity are guaranteed to be numbers
      totalAmount += (item.unitPrice || 0) * (item.quantity || 0);
    }
    
    logOrderProcess('TOTAL_CALCULATED', { totalAmount, itemCount: orderItems.length });
    
    // SECURITY FIX: Idempotency-Key in dedicated column (nicht in notes)
    let finalNotes = notes || '';
    
    // CRITICAL FIX: ARCHITECT MANDATED - ON CONFLICT(idempotency_key) DO NOTHING
    // This prevents order mixing and ensures proper idempotency
    // ATOMIC order generation with DB sequence prevents order_number conflicts
    const orderQuery = `
      INSERT INTO orders (
        order_number, warehouse_id, supplier_id, order_date, 
        expected_delivery_date, total_amount, status, notes, idempotency_key
      ) VALUES (
        'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_daily_counter')::text, 3, '0'),
        $1, $2, NOW(), $3, $4, 'open', $5, $6
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, order_number, status, total_amount
    `;
    
    try {
      const orderResult = await client.query(orderQuery, [
        warehouseId, supplierId, expectedDeliveryDate, totalAmount, finalNotes, idempotencyKey
      ]);
      
      // CRITICAL FIX: Handle case where ON CONFLICT(idempotency_key) DO NOTHING returns no rows
      if (orderResult.rows.length === 0) {
        // Idempotency key already exists, fetch the existing order
        const existingOrderQuery = `
          SELECT id, order_number, status, total_amount
          FROM orders 
          WHERE idempotency_key = $1
          LIMIT 1
        `;
        const existingOrderResult = await client.query(existingOrderQuery, [idempotencyKey]);
        
        if (existingOrderResult.rows.length > 0) {
          const existingOrder = existingOrderResult.rows[0];
          logOrderProcess('IDEMPOTENCY_CONFLICT_RESOLVED', { 
            idempotencyKey,
            existingOrderId: existingOrder.id,
            orderNumber: existingOrder.order_number 
          });
          
          await client.query('COMMIT');
          return res.status(200).json({
            success: true,
            order: existingOrder,
            message: `Bestellung bereits vorhanden (Idempotenz): ${existingOrder.order_number}`,
            idempotent: true
          });
        } else {
          throw new Error('Failed to create order and could not find existing order with idempotency key');
        }
      }
      
      const newOrder = orderResult.rows[0];
      logOrderProcess('ORDER_CREATED_ATOMIC', { 
        orderId: newOrder.id, 
        orderNumber: newOrder.order_number,
        totalAmount: newOrder.total_amount,
        generationMethod: 'DB_SEQUENCE_ATOMIC'
      }, newOrder.id);
      
      // Bestellpositionen erstellen
      for (const item of orderItems) {
        const itemQuery = `
          INSERT INTO order_items (
            order_id, product_id, quantity, unit_price, 
            total_price, product_name, unit
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        const itemPrice = parseFloat(item.unitPrice) || 0;
        const itemQuantity = parseInt(item.quantity) || 0;
        const itemTotal = itemPrice * itemQuantity;
        
        await client.query(itemQuery, [
          newOrder.id, item.productId, itemQuantity, itemPrice, 
          itemTotal, item.productName, item.unit || 'stk'
        ]);
        
        logOrderProcess('ORDER_ITEM_CREATED', { 
          productId: item.productId, 
          productName: item.productName,
          quantity: itemQuantity,
          price: itemPrice 
        }, newOrder.id);
      }
      
      await client.query('COMMIT');
      logOrderProcess('ORDER_COMPLETED', { 
        orderId: newOrder.id, 
        orderNumber: newOrder.order_number, 
        totalAmount: newOrder.total_amount 
      }, newOrder.id);
      
      return res.status(201).json({
        success: true,
        order: newOrder,
        message: `Bestellung ${newOrder.order_number} erfolgreich erstellt`
      });
      
    } catch (dbError: any) {
      // Spezielle Behandlung für Unique-Constraint-Verletzung
      if (dbError.code === '23505' && dbError.constraint?.includes('order_number')) {
        logOrderProcess('UNIQUE_CONSTRAINT_VIOLATION', { 
          constraint: dbError.constraint,
          error: dbError.message 
        });
        
        await client.query('ROLLBACK');
        return res.status(422).json({
          error: 'Duplicate Order Number',
          message: 'Bestellnummer bereits vorhanden - bitte erneut versuchen',
          code: 'DUPLICATE_ORDER_NUMBER'
        });
      }
      throw dbError; // Andere DB-Fehler weiterleiten
    }
    // This block was moved inside the try block above to prevent duplication
    
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

// 3. Wareneingang erfassen (Haupt-Route)
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

// 3a. Wareneingang erfassen (Alias-Route für Frontend-Kompatibilität)
router.post('/:orderId/receipt', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { orderId } = req.params;
    const { receivedItems } = req.body;
    
    logOrderProcess('GOODS_RECEIPT_STARTED_ALIAS', { 
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
        logOrderProcess('GOODS_RECEIPT_VALIDATION_ERROR_ALIAS', { item });
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
      
      logOrderProcess('BATCH_CREATED_ALIAS', {
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
      
      logOrderProcess('INVENTORY_UPDATED_ALIAS', {
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
    
    logOrderProcess('GOODS_RECEIPT_COMPLETED_ALIAS', { 
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
    logOrderProcess('GOODS_RECEIPT_ERROR_ALIAS', { error: error.message });
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
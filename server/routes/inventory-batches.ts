import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// POST /api/inventory/batches - Create batch from goods receipt
router.post('/batches', async (req, res) => {
  try {
    const { orderId, items } = req.body;
    
    if (!orderId || !items || !Array.isArray(items)) {
      return res.status(400).json({
        error: 'Ungültige Anfrage',
        message: 'Bestellungs-ID und Items sind erforderlich'
      });
    }

    const createdBatches = [];

    for (const item of items) {
      if (item.id && item.deliveredQuantity !== undefined) {
        // Produktinformationen abrufen
        const orderItemResult = await pool.query(`
          SELECT oi.product_id, oi.quantity_delivered, o.warehouse_id, o.supplier_id, o.actual_delivery_date
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.id = $1 AND o.id = $2
        `, [item.id, orderId]);

        if (orderItemResult.rows.length > 0) {
          const { product_id, quantity_delivered, warehouse_id, supplier_id, actual_delivery_date } = orderItemResult.rows[0];
          
          // Batch-Nummer generieren
          const batchNumber = `BAT-${orderId}-${item.id}-${Date.now()}`;
          
          // Product Batch erstellen
          const batchResult = await pool.query(`
            INSERT INTO product_batches (
              product_id, warehouse_id, batch_number, 
              initial_quantity, current_quantity, 
              received_date, expiry_date, order_id, supplier_id,
              status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *
          `, [
            product_id, warehouse_id, batchNumber,
            quantity_delivered, quantity_delivered,
            actual_delivery_date || new Date(),
            item.expiryDate || null,
            orderId, supplier_id,
            'active'
          ]);

          createdBatches.push(batchResult.rows[0]);
          console.log(`✅ Batch ${batchNumber} erstellt für Produkt ${product_id}, Menge: ${quantity_delivered}, MHD: ${item.expiryDate || 'nicht angegeben'}`);
        }
      }
    }

    return res.json({
      success: true,
      message: `${createdBatches.length} Chargen erfolgreich erstellt`,
      batches: createdBatches
    });

  } catch (error) {
    console.error('Fehler beim Erstellen der Chargen:', error);
    return res.status(500).json({
      error: 'Datenbankfehler',
      message: error.message
    });
  }
});

// GET /api/inventory/batches/:orderId - Get batches for order
router.get('/batches/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    const result = await pool.query(`
      SELECT 
        pb.id,
        pb.product_id,
        p.product_name,
        pb.batch_number,
        pb.initial_quantity,
        pb.current_quantity,
        pb.received_date,
        pb.expiry_date,
        pb.status,
        pb.created_at,
        w.name as warehouse_name,
        s.name as supplier_name
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN warehouses w ON pb.warehouse_id = w.id
      LEFT JOIN suppliers s ON pb.supplier_id = s.id
      WHERE pb.order_id = $1
      ORDER BY pb.created_at DESC
    `, [orderId]);

    return res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Chargen:', error);
    return res.status(500).json({
      error: 'Datenbankfehler',
      message: error.message
    });
  }
});

export default router;
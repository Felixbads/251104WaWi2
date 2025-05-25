import { Router } from 'express';
import { rawDb } from '../db';

const router = Router();

// Wareneingang für eine Bestellung protokollieren
router.post('/orders/:orderId/warehouse-receipt', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryDate, notes, items } = req.body;

    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({ 
        error: 'Ungültige Bestellungs-ID',
        message: 'Bitte geben Sie eine gültige Bestellungs-ID an'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Keine Wareneingang-Positionen',
        message: 'Keine Positionen für den Wareneingang angegeben'
      });
    }

    console.log(`Protokolliere Wareneingang für Bestellung ${orderId} mit ${items.length} Positionen`);

    // Bestellung und Lager-Informationen laden
    const orderResult = await rawDb.query(`
      SELECT o.*, w.id as warehouse_id, w.name as warehouse_name
      FROM orders o
      LEFT JOIN warehouses w ON o.location_id = w.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Bestellung nicht gefunden',
        message: `Bestellung mit ID ${orderId} existiert nicht`
      });
    }

    const order = orderResult.rows[0];
    const warehouseId = order.warehouse_id || order.location_id;

    if (!warehouseId) {
      return res.status(400).json({
        error: 'Kein Lager zugeordnet',
        message: 'Der Bestellung ist kein Lager zugeordnet'
      });
    }

    // Transaktion starten
    await rawDb.query('BEGIN');
    
    try {
      await client.query('BEGIN');

      // Wareneingang-Datensatz erstellen
      const receiptResult = await client.query(`
        INSERT INTO warehouse_receipts (
          order_id,
          warehouse_id,
          delivery_date,
          notes,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, 'completed', NOW())
        RETURNING *
      `, [orderId, warehouseId, deliveryDate || new Date(), notes || '']);

      const receiptId = receiptResult.rows[0].id;

      // Für jede Position: Wareneingang-Position erstellen und Lagerbestand aktualisieren
      for (const item of items) {
        const { productId, orderedQuantity, receivedQuantity, expirationDate, unit } = item;

        if (!productId || receivedQuantity === undefined) {
          console.warn(`Ungültige Position übersprungen: ${JSON.stringify(item)}`);
          continue;
        }

        // Wareneingang-Position erstellen
        await client.query(`
          INSERT INTO warehouse_receipt_items (
            receipt_id,
            product_id,
            ordered_quantity,
            received_quantity,
            expiration_date,
            unit
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [receiptId, productId, orderedQuantity, receivedQuantity, expirationDate, unit || 'Stück']);

        // Lagerbestand aktualisieren (nur wenn Menge > 0)
        if (receivedQuantity > 0) {
          // Prüfen, ob bereits ein Lagerbestand für dieses Produkt existiert
          const inventoryResult = await client.query(`
            SELECT * FROM inventory_items 
            WHERE warehouse_id = $1 AND product_id = $2
          `, [warehouseId, productId]);

          if (inventoryResult.rows.length > 0) {
            // Bestand erhöhen
            await client.query(`
              UPDATE inventory_items 
              SET quantity = quantity + $1,
                  last_updated = NOW()
              WHERE warehouse_id = $2 AND product_id = $3
            `, [receivedQuantity, warehouseId, productId]);
          } else {
            // Neuen Lagerbestand erstellen
            await client.query(`
              INSERT INTO inventory_items (
                warehouse_id,
                product_id,
                quantity,
                minimum_stock,
                maximum_stock,
                last_updated
              ) VALUES ($1, $2, $3, 0, 100, NOW())
            `, [warehouseId, productId, receivedQuantity]);
          }

          // Lagerbewegung protokollieren
          await client.query(`
            INSERT INTO warehouse_movements (
              warehouse_id,
              product_id,
              movement_type,
              quantity,
              status,
              notes,
              performed_by,
              created_at
            ) VALUES ($1, $2, 'receipt', $3, 'completed', $4, 1, NOW())
          `, [warehouseId, productId, receivedQuantity, `Wareneingang Bestellung #${orderId}`]);
        }
      }

      // Bestellstatus auf 'received' oder 'partial_received' setzen
      const totalOrdered = items.reduce((sum, item) => sum + (item.orderedQuantity || 0), 0);
      const totalReceived = items.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
      
      const newStatus = totalReceived >= totalOrdered ? 'received' : 'partial_received';
      
      await client.query(`
        UPDATE orders 
        SET status = $1, 
            delivery_date = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [newStatus, deliveryDate || new Date(), orderId]);

      await client.query('COMMIT');

      console.log(`Wareneingang erfolgreich protokolliert: Bestellung ${orderId}, ${items.length} Positionen, Status: ${newStatus}`);

      res.json({
        success: true,
        message: 'Wareneingang erfolgreich protokolliert',
        data: {
          receiptId,
          orderId: Number(orderId),
          warehouseId,
          status: newStatus,
          totalItems: items.length,
          totalReceived,
          totalOrdered
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Fehler beim Protokollieren des Wareneingangs:', error);
    res.status(500).json({
      error: 'Fehler beim Wareneingang',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Wareneingang-Historie für eine Bestellung abrufen
router.get('/orders/:orderId/warehouse-receipts', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({ 
        error: 'Ungültige Bestellungs-ID'
      });
    }

    const receiptsResult = await rawDb.query(`
      SELECT 
        wr.*,
        w.name as warehouse_name,
        COUNT(wri.id) as item_count,
        SUM(wri.received_quantity) as total_received
      FROM warehouse_receipts wr
      LEFT JOIN warehouses w ON wr.warehouse_id = w.id
      LEFT JOIN warehouse_receipt_items wri ON wr.id = wri.receipt_id
      WHERE wr.order_id = $1
      GROUP BY wr.id, w.name
      ORDER BY wr.created_at DESC
    `, [orderId]);

    res.json(receiptsResult.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Wareneingang-Historie:', error);
    res.status(500).json({
      error: 'Fehler beim Laden der Historie',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
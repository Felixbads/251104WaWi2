import express, { Request, Response } from 'express';
import { db, rawDb } from '../db';
import { 
  inventoryBatches, 
  inventoryMovements, 
  refills, 
  refillDetails,
  refillBatchMovements,
  machines,
  warehouses,
  products,
  users
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { format } from 'date-fns';

const router = express.Router();

interface AuthRequest extends Request {
  user?: any;
}

// GET - Get warehouse inventory with batch information
router.get('/warehouse-inventory-batches/:warehouseId', async (req: AuthRequest, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Query to get inventory batches with product information
    const query = `
      SELECT 
        ib.id,
        ib.product_id as "productId",
        p.product_name as "productName",
        ib.batch_number as "batchNumber",
        ib.expiry_date as "expiryDate",
        ib.quantity,
        ib.status,
        ib.warehouse_id as "warehouseId"
      FROM inventory_batches ib
      JOIN products p ON ib.product_id = p.id
      WHERE ib.warehouse_id = $1
        AND ib.status = 'active'
        AND ib.quantity > 0
      ORDER BY ib.expiry_date ASC, ib.batch_number ASC
    `;

    const result = await rawDb.query(query, [warehouseId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lagerbestände:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerbestände',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST - Perform refill from warehouse to machine
router.post('/warehouse-refills', async (req: AuthRequest, res: Response) => {
  const transaction = await rawDb.query('BEGIN');
  
  try {
    const { warehouseId, machineId, items } = req.body;
    const userId = req.user?.id || 1; // Default to system user if not authenticated
    const userName = req.user?.username || 'System';
    
    if (!warehouseId || !machineId || !items || items.length === 0) {
      await rawDb.query('ROLLBACK');
      return res.status(400).json({ error: 'Unvollständige Daten für Refill' });
    }

    // Create refill record
    const refillResult = await db.insert(refills)
      .values({
        machineId,
        datetime: Math.floor(Date.now() / 1000),
        refillType: 'manual',
        refillNumber: `REF-${Date.now()}`,
        rawData: JSON.stringify({ warehouseId, performedBy: userName }),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    const refillId = refillResult[0].id;
    const refillHistoryItems = [];

    // Process each item
    for (const item of items) {
      const { productId, batchNumber, expiryDate, quantity } = item;

      // Get current batch inventory
      const batchQuery = `
        SELECT * FROM inventory_batches 
        WHERE warehouse_id = $1 
          AND product_id = $2 
          AND batch_number = $3 
          AND status = 'active'
        LIMIT 1
      `;
      
      const batchResult = await rawDb.query(batchQuery, [warehouseId, productId, batchNumber]);
      
      if (batchResult.rows.length === 0) {
        await rawDb.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Charge ${batchNumber} nicht im Lager gefunden` 
        });
      }

      const batch = batchResult.rows[0];
      const stockBefore = batch.quantity;
      const stockAfter = stockBefore - quantity;

      if (stockAfter < 0) {
        await rawDb.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Nicht genügend Bestand für Charge ${batchNumber}. Verfügbar: ${stockBefore}, Angefordert: ${quantity}` 
        });
      }

      // Update batch inventory
      await rawDb.query(
        `UPDATE inventory_batches 
         SET quantity = $1, updated_at = NOW() 
         WHERE id = $2`,
        [stockAfter, batch.id]
      );

      // Create refill detail
      const refillDetailResult = await db.insert(refillDetails)
        .values({
          refillId,
          productId,
          productName: item.productName,
          quantity,
          previousQuantity: stockBefore,
          rawData: JSON.stringify({ 
            batchNumber, 
            expiryDate,
            stockBefore,
            stockAfter 
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Create refill batch movement record
      await db.insert(refillBatchMovements)
        .values({
          refillId,
          refillDetailId: refillDetailResult[0].id,
          batchId: batch.id,
          quantity,
          movementType: 'OUT',
          batchNumber,
          expiryDate: new Date(expiryDate),
          performedBy: userId,
          createdAt: new Date()
        });

      // Create inventory movement record
      await db.insert(inventoryMovements)
        .values({
          sourceWarehouseId: warehouseId,
          destinationWarehouseId: null,
          machineId,
          productId,
          quantity,
          movementType: 'REFILL',
          direction: 'OUT',
          referenceType: 'REFILL',
          referenceId: refillId.toString(),
          batchId: batch.id,
          batchNumber,
          expiryDate: new Date(expiryDate),
          previousStock: stockBefore,
          currentStock: stockAfter,
          performedBy: userId,
          performedAt: new Date(),
          status: 'completed',
          notes: `Refill zum Automat ${machineId} durch ${userName}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });

      // Add to history items for response
      refillHistoryItems.push({
        productName: item.productName,
        quantity,
        batchNumber,
        expiryDate,
        stockBefore,
        stockAfter
      });
    }

    await rawDb.query('COMMIT');

    res.json({
      success: true,
      refillId,
      items: refillHistoryItems,
      message: `Refill erfolgreich durchgeführt. ${items.length} Artikel transferiert.`
    });

  } catch (error) {
    await rawDb.query('ROLLBACK');
    console.error('Fehler beim Durchführen des Refills:', error);
    res.status(500).json({ 
      error: 'Fehler beim Durchführen des Refills',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET - Get refill history
router.get('/refill-history', async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const query = `
      SELECT 
        r.id,
        r.machine_id as "machineId",
        m.machine_name as "machineName",
        r.datetime as "performedAt",
        r.raw_data as "rawData",
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'productName', rd.product_name,
              'quantity', rd.quantity,
              'batchNumber', rbm.batch_number,
              'expiryDate', rbm.expiry_date,
              'stockBefore', rd.previous_quantity,
              'stockAfter', rd.previous_quantity - rd.quantity
            ) ORDER BY rd.id
          ) FILTER (WHERE rd.id IS NOT NULL), 
          '[]'::json
        ) as items
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN refill_details rd ON rd.refill_id = r.id
      LEFT JOIN refill_batch_movements rbm ON rbm.refill_detail_id = rd.id
      WHERE r.refill_type = 'manual'
      GROUP BY r.id, r.machine_id, m.machine_name, r.datetime, r.raw_data
      ORDER BY r.datetime DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await rawDb.query(query, [limit, offset]);
    
    // Parse the raw data to extract warehouse and user information
    const refillHistory = result.rows.map(row => {
      let warehouseId = null;
      let warehouseName = 'Unbekannt';
      let performedBy = 'System';
      
      try {
        const rawData = JSON.parse(row.rawData || '{}');
        warehouseId = rawData.warehouseId;
        performedBy = rawData.performedBy || 'System';
      } catch (e) {
        // Ignore parsing errors
      }

      return {
        id: row.id,
        machineId: row.machineId,
        machineName: row.machineName,
        warehouseId,
        warehouseName,
        performedBy,
        performedAt: new Date(row.performedAt * 1000).toISOString(),
        items: row.items
      };
    });

    // Get warehouse names if we have warehouse IDs
    const warehouseIds = [...new Set(refillHistory.map(r => r.warehouseId).filter(Boolean))];
    if (warehouseIds.length > 0) {
      const warehouseQuery = `
        SELECT id, name FROM warehouses WHERE id = ANY($1)
      `;
      const warehouseResult = await rawDb.query(warehouseQuery, [warehouseIds]);
      const warehouseMap = new Map(warehouseResult.rows.map(w => [w.id, w.name]));
      
      refillHistory.forEach(r => {
        if (r.warehouseId && warehouseMap.has(r.warehouseId)) {
          r.warehouseName = warehouseMap.get(r.warehouseId);
        }
      });
    }

    res.json(refillHistory);
  } catch (error) {
    console.error('Fehler beim Abrufen der Refill-Historie:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Refill-Historie',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET - Get MHD warnings (expired or expiring soon products)
router.get('/mhd-warnings', async (req: AuthRequest, res: Response) => {
  try {
    const daysAhead = parseInt(req.query.daysAhead as string) || 30;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const query = `
      SELECT 
        ib.id,
        ib.warehouse_id as "warehouseId",
        w.name as "warehouseName",
        ib.product_id as "productId",
        p.product_name as "productName",
        ib.batch_number as "batchNumber",
        ib.expiry_date as "expiryDate",
        ib.quantity,
        ib.status,
        CASE 
          WHEN ib.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN ib.expiry_date <= $1 THEN 'expiring_soon'
          ELSE 'ok'
        END as "warningStatus"
      FROM inventory_batches ib
      JOIN products p ON ib.product_id = p.id
      JOIN warehouses w ON ib.warehouse_id = w.id
      WHERE ib.status = 'active'
        AND ib.quantity > 0
        AND ib.expiry_date <= $1
      ORDER BY ib.expiry_date ASC, w.name ASC, p.product_name ASC
    `;

    const result = await rawDb.query(query, [futureDate.toISOString()]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der MHD-Warnungen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der MHD-Warnungen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
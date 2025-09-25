import express, { Request, Response } from 'express';
import { db, rawDb } from '../db';
import { 
  stockBatches, 
  stockMovements, 
  refillTrackings, 
  refillTrackingItems,
  warehouses,
  machineWarehouseAssignments
} from '@shared/warehouse3.schema';
import { machines, products, users } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { CentralizedInventoryMovement, createFillMovement } from '../services/centralizedInventoryMovement';

const router = express.Router();

// Initialize centralized inventory movement service
const inventoryService = new CentralizedInventoryMovement(db, rawDb);


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
        pb.id,
        pb.product_id as "productId",
        p.product_name as "productName",
        pb.batch_number as "batchNumber",
        pb.expiry_date as "expiryDate",
        pb.current_quantity as quantity, -- Map for compatibility
        pb.status,
        pb.warehouse_id as "warehouseId"
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      WHERE pb.warehouse_id = $1
        AND pb.status = 'active'
        AND pb.current_quantity > 0
      ORDER BY pb.expiry_date ASC, pb.batch_number ASC
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

// Business error class for proper HTTP status handling
class BusinessError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'BusinessError';
  }
}

// POST - Perform refill from warehouse to machine
router.post('/warehouse-refills', async (req: AuthRequest, res: Response) => {
  try {
    const { machineId: rawMachineId, items } = req.body; // Remove warehouseId from request body
    const userId = req.user?.id || 1; // Default to system user if not authenticated
    const userName = req.user?.username || req.user?.email || 'System';
    
    // Fix: Type coercion and validation
    const machineId = parseInt(rawMachineId);
    
    if (!machineId || !items || items.length === 0 || isNaN(machineId)) {
      throw new BusinessError('Unvollständige Daten für Refill oder ungültige Maschinen-ID', 400);
    }

    // Use single Drizzle transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // TASK 7: Enforce warehouse from machine assignment, not URL parameter
      const assignmentResult = await tx
        .select({ warehouseId: machineWarehouseAssignments.warehouseId })
        .from(machineWarehouseAssignments)
        .where(eq(machineWarehouseAssignments.machineId, machineId))
        .limit(1);

      if (assignmentResult.length === 0) {
        throw new BusinessError(`Automat ${machineId} ist keinem Lager zugewiesen. Bitte kontaktieren Sie den Administrator.`, 400);
      }

      const warehouseId = assignmentResult[0].warehouseId;

      // Create refill record using warehouse3 refillTrackings schema
      const refillResult = await tx.insert(refillTrackings)
        .values({
          machineId,
          warehouseId,
          refillDate: new Date(),
          status: 'completed',
          notes: `Manual refill by ${userName}`,
          performedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const refillId = refillResult[0].id;
      const refillHistoryItems = [];

      // Process each item using centralized FIFO inventory service
      for (const item of items) {
        const { productId, batchNumber, expiryDate, quantity } = item;
        
        // Validate item data
        if (!productId || !quantity || quantity <= 0) {
          throw new BusinessError(`Ungültige Item-Daten: productId=${productId}, quantity=${quantity}`, 400);
        }

        // Use centralized FIFO inventory service for movement
        const movementResult = await createFillMovement(
          productId,
          warehouseId,
          quantity,
          userId,
          machineId,
          tx
        );

        // Create refill detail using warehouse3 refillTrackingItems schema
        const refillDetailResult = await tx.insert(refillTrackingItems)
          .values({
            refillId,
            productId,
            batchId: movementResult.batchesProcessed[0]?.batchId,
            quantity,
            stockBefore: movementResult.movement.beforeQty,
            stockAfter: movementResult.movement.afterQty,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        // Add to history items for response with batch info from FIFO processing
        const primaryBatch = movementResult.batchesProcessed[0];
        refillHistoryItems.push({
          productName: item.productName,
          quantity,
          batchNumber: primaryBatch?.batchNumber || batchNumber,
          expiryDate: primaryBatch?.expiryDate || expiryDate,
          stockBefore: movementResult.movement.beforeQty,
          stockAfter: movementResult.movement.afterQty
        });
      }

      // Return success response data from transaction
      return {
        success: true,
        refillId,
        items: refillHistoryItems,
        message: `Refill erfolgreich durchgeführt. ${items.length} Artikel transferiert.`
      };
    });

    // Send response with transaction result
    res.json(result);

  } catch (error) {
    console.error('Fehler beim Durchführen des Refills:', error);
    
    // Proper HTTP status handling for business vs system errors
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ 
        error: error.message
      });
    }
    
    // System/unexpected errors get 500
    res.status(500).json({ 
      error: 'Unerwarteter Fehler beim Durchführen des Refills',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET - Get refill history (shows actual Vendon refills with proper operators)
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
        r.operator as "performedBy",
        r.refill_type as "refillType",
        r.refill_number as "refillNumber",
        -- Get related inventory movements for this refill (Fixed: Remove DISTINCT/ORDER BY conflict)
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'productName', p.product_name,
              'quantity', im.quantity,
              'batchNumber', im.batch_number,
              'expiryDate', im.expiry_date,
              'warehouseId', im.source_warehouse_id,
              'warehouseName', w.name,
              'stockBefore', im.previous_stock,
              'stockAfter', im.current_stock,
              'withdrawalTime', im.performed_at
            ) ORDER BY im.performed_at DESC
          ) FILTER (WHERE im.id IS NOT NULL), 
          '[]'::json
        ) as items
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN inventory_movements im ON im.reference_type = 'REFILL' 
        AND im.reference_id = r.id::text
        AND im.direction = 'OUT'
      LEFT JOIN products p ON p.id = im.product_id
      LEFT JOIN warehouses w ON w.id = im.source_warehouse_id
      WHERE r.operator IS NOT NULL 
        AND r.operator != ''
        AND r.datetime >= (CURRENT_DATE - INTERVAL '30 days')
      GROUP BY r.id, r.machine_id, m.machine_name, r.datetime, r.operator, r.refill_type, r.refill_number
      ORDER BY r.datetime DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await rawDb.query(query, [limit, offset]);
    
    const refillHistory = result.rows.map(row => ({
      id: row.id,
      machineId: row.machineId,
      machineName: row.machineName || 'Unbekannter Automat',
      performedBy: row.performedBy || 'Unbekannter Operator',
      performedAt: new Date(row.performedAt * 1000).toISOString(),
      refillType: row.refillType,
      refillNumber: row.refillNumber,
      items: row.items
    }));

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
        pb.id,
        pb.warehouse_id as "warehouseId",
        w.name as "warehouseName",
        pb.product_id as "productId",
        p.product_name as "productName",
        pb.batch_number as "batchNumber",
        pb.expiry_date as "expiryDate",
        pb.current_quantity as quantity, -- Fix: use current_quantity
        pb.status,
        CASE 
          WHEN pb.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN pb.expiry_date <= $1 THEN 'expiring_soon'
          ELSE 'ok'
        END as "warningStatus"
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      JOIN warehouses w ON pb.warehouse_id = w.id
      WHERE pb.status = 'active'
        AND pb.current_quantity > 0
        AND pb.expiry_date <= $1
      ORDER BY pb.expiry_date ASC, w.name ASC, p.product_name ASC
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

// POST - Link warehouse inventory to an existing Vendon refill
router.post('/link-warehouse-to-refill', async (req: AuthRequest, res: Response) => {
  try {
    const { refillId, warehouseId, items } = req.body;
    const userId = req.user?.id || 1;
    
    if (!refillId || !warehouseId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Unvollständige Daten für Warehouse-Refill-Verknüpfung' });
    }

    // Use unified Drizzle transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Verify refill exists
      const refillResult = await tx.execute(sql`SELECT * FROM refills WHERE id = ${refillId}`);
      if (refillResult.rows.length === 0) {
        throw new BusinessError('Refill nicht gefunden', 404);
      }

      const refill = refillResult.rows[0];
      const inventoryMovements = [];

      // Process each item using centralized service (no manual batch updates)
      for (const item of items) {
        const { productId, batchNumber, quantity } = item;
        
        // Validate item data
        if (!productId || !quantity || quantity <= 0) {
          throw new BusinessError(`Ungültige Item-Daten: productId=${productId}, quantity=${quantity}`, 400);
        }

        // Use centralized service - it handles FIFO, batch validation, and updates
        const movementResult = await inventoryService.createInventoryMovement({
          movementType: 'FILL',
          productId,
          warehouseId,
          qtyDelta: -quantity,
          actorUserId: userId,
          machineId: refill.machine_id,
          occurredAt: new Date(refill.datetime * 1000),
          source: 'REFILL',
          direction: 'OUT',
          referenceId: refillId.toString(),
          status: 'completed',
          notes: `Nachträgliche Zuordnung zu Refill ${refill.refill_number || refill.id} durch ${refill.operator}`,
          batchNumber,
          expiryDate: item.expiryDate
        }, tx);

        inventoryMovements.push({
          productId,
          batchNumber: movementResult.batchesProcessed[0]?.batchNumber || batchNumber,
          quantity,
          stockBefore: movementResult.movement.beforeQty,
          stockAfter: movementResult.movement.afterQty,
          withdrawalTime: new Date(refill.datetime * 1000).toISOString()
        });
      }

      return {
        refillId,
        operator: refill.operator,
        refillTime: new Date(refill.datetime * 1000).toISOString(),
        inventoryMovements
      };
    });

    res.json({
      success: true,
      ...result,
      message: `Lagerentnahme erfolgreich zu Refill verknüpft. ${items.length} Artikel zugeordnet.`
    });

  } catch (error) {
    console.error('Fehler beim Verknüpfen der Lagerentnahme:', error);
    
    // Proper HTTP status handling for business vs system errors
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ 
        error: error.message
      });
    }
    
    // System/unexpected errors get 500
    res.status(500).json({ 
      error: 'Unerwarteter Fehler beim Verknüpfen der Lagerentnahme',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET - Get recent refills without warehouse linkage (for linking)
router.get('/unlinked-refills', async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const query = `
      SELECT 
        r.id,
        r.machine_id as "machineId",
        m.machine_name as "machineName",
        r.datetime,
        r.operator,
        r.refill_type as "refillType",
        r.refill_number as "refillNumber",
        -- Check if this refill already has inventory movements
        COUNT(im.id) as "linkedInventoryCount"
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN inventory_movements im ON im.reference_type = 'REFILL' 
        AND im.reference_id = r.id::text
      WHERE r.operator IS NOT NULL 
        AND r.operator != ''
        AND r.datetime >= (CURRENT_DATE - INTERVAL '7 days')
      GROUP BY r.id, r.machine_id, m.machine_name, r.datetime, r.operator, r.refill_type, r.refill_number
      HAVING COUNT(im.id) = 0  -- Only show refills without inventory movements
      ORDER BY r.datetime DESC
      LIMIT $1
    `;

    const result = await rawDb.query(query, [limit]);
    
    const unlinkedRefills = result.rows.map(row => ({
      id: row.id,
      machineId: row.machineId,
      machineName: row.machineName || 'Unbekannter Automat',
      operator: row.operator,
      datetime: new Date(row.datetime * 1000).toISOString(),
      refillType: row.refillType,
      refillNumber: row.refillNumber
    }));

    res.json(unlinkedRefills);
  } catch (error) {
    console.error('Fehler beim Abrufen der unverknüpften Refills:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der unverknüpften Refills',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST - Auto-assign existing refills to warehouse inventory (for demo/testing)
router.post('/auto-assign-existing-refills', async (req: AuthRequest, res: Response) => {
  try {
    // Get recent refills without inventory linkage
    const refillsQuery = `
      SELECT 
        r.id,
        r.machine_id,
        m.machine_name,
        r.datetime,
        r.operator,
        r.refill_type,
        r.refill_number
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN inventory_movements im ON im.reference_type = 'REFILL' 
        AND im.reference_id = r.id::text
      WHERE r.operator IS NOT NULL 
        AND r.operator != ''
        AND r.datetime >= (CURRENT_DATE - INTERVAL '7 days')
        AND im.id IS NULL  -- Only refills without inventory movements
      ORDER BY r.datetime DESC
      LIMIT 20
    `;

    const refillsResult = await rawDb.query(refillsQuery);
    const refills = refillsResult.rows;

    if (refills.length === 0) {
      return res.json({ 
        success: true, 
        message: 'Keine unverknüpften Refills gefunden',
        assignedRefills: []
      });
    }

    // Get available inventory batches from Stolpen warehouse (ID 4)
    const batchesQuery = `
      SELECT 
        pb.id,
        pb.product_id,
        p.product_name,
        pb.batch_number,
        pb.current_quantity as quantity, -- Map to quantity for compatibility
        pb.current_quantity, -- Also add for code compatibility
        pb.expiry_date,
        pb.warehouse_id
      FROM product_batches pb
      LEFT JOIN products p ON p.id = pb.product_id
      WHERE pb.warehouse_id = 4 
        AND pb.status = 'active'
        AND pb.current_quantity > 0
      ORDER BY pb.expiry_date ASC  -- FIFO - oldest first
    `;

    const batchesResult = await rawDb.query(batchesQuery);
    const batches = batchesResult.rows;

    const assignedRefills = [];
    const productAssignments = {
      2: 'Cola Classic',
      3: 'Fruchtaufstriche',
      4: 'Soljanka', 
      5: 'Linseneintopf',
      6: 'Pasta Lucia Tomatensauce',
      7: 'Pasta Lucia Tomatenpesto',
      8: 'Nudossi'
    };

    // Process each refill
    for (const refill of refills) {
      // Randomly assign 2-4 products per refill
      const numProducts = Math.floor(Math.random() * 3) + 2; // 2-4 products
      const selectedProductIds = Object.keys(productAssignments)
        .sort(() => 0.5 - Math.random())
        .slice(0, numProducts);

      const refillMovements = [];

      for (const productId of selectedProductIds) {
        // Find available batch for this product
        const availableBatch = batches.find(b => 
          b.product_id == productId && 
          b.quantity > 0
        );

        if (!availableBatch) continue;

        // Random quantity between 5-20 pieces
        const quantity = Math.floor(Math.random() * 16) + 5;

        try {
          // Use centralized service - it handles FIFO, batch selection, and updates
          const movementResult = await inventoryService.createInventoryMovement({
            movementType: 'FILL',
            productId: parseInt(productId),
            warehouseId: 4, // Stolpen warehouse
            qtyDelta: -quantity,
            actorUserId: 1, // System user
            machineId: refill.machine_id,
            occurredAt: new Date(refill.datetime * 1000),
            source: 'REFILL',
            direction: 'OUT',
            referenceId: refill.id.toString(),
            status: 'completed',
            notes: `Automatische Zuordnung zu Refill ${refill.refill_number || refill.id} durch ${refill.operator}`
          });

          refillMovements.push({
            productName: availableBatch.product_name,
            batchNumber: movementResult.batchesProcessed[0]?.batchNumber || availableBatch.batch_number,
            quantity,
            stockBefore: movementResult.movement.beforeQty,
            stockAfter: movementResult.movement.afterQty,
            expiryDate: movementResult.batchesProcessed[0]?.expiryDate || availableBatch.expiry_date
          });
        } catch (movementError) {
          console.warn(`Skipping product ${productId} for refill ${refill.id}: insufficient inventory`);
          // Continue with next product if this one fails due to insufficient inventory
        }
      }

      assignedRefills.push({
        refillId: refill.id,
        machineName: refill.machine_name,
        operator: refill.operator,
        datetime: new Date(refill.datetime * 1000).toISOString(),
        movements: refillMovements
      });
    }

    res.json({
      success: true,
      message: `${assignedRefills.length} Refills erfolgreich zu Lagerbeständen zugeordnet`,
      assignedRefills,
      totalMovements: assignedRefills.reduce((sum, r) => sum + r.movements.length, 0)
    });

  } catch (error) {
    console.error('Fehler bei der automatischen Refill-Zuordnung:', error);
    
    // Proper HTTP status handling for business vs system errors
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ 
        error: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Unerwarteter Fehler bei der automatischen Refill-Zuordnung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
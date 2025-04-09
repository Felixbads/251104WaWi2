import express, { Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gte, desc, asc, lt, isNull, min, sql } from 'drizzle-orm';
import { inventoryBatches, products, warehouses, machines, inventoryMovements } from '@shared/schema';

const router = express.Router();

// GET /api/inventory-batches - Alle Inventar-Batches abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const expiringSoon = req.query.expiringSoon === 'true';
    const currentDate = new Date();
    
    // Setzt das Ablaufdatum für "bald ablaufend" auf 14 Tage in der Zukunft
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + 14);
    
    let query = db.select()
      .from(inventoryBatches)
      .leftJoin(products, eq(inventoryBatches.productId, products.id))
      .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id));
    
    // Filter anwenden
    if (productId) {
      query = query.where(eq(inventoryBatches.productId, productId));
    }
    
    if (warehouseId) {
      query = query.where(eq(inventoryBatches.warehouseId, warehouseId));
    }
    
    if (expiringSoon) {
      query = query.where(
        and(
          // Nur Batches mit einem Ablaufdatum
          lt(inventoryBatches.expiryDate, expiryThreshold),
          gte(inventoryBatches.expiryDate, currentDate),
          // Nur Batches mit einer Menge > 0
          gte(inventoryBatches.quantity, 1)
        )
      );
    }
    
    // Nach Ablaufdatum sortieren (aufsteigend = zuerst ablaufende)
    query = query.orderBy(asc(inventoryBatches.expiryDate));
    
    const batches = await query;
    
    // Formatiere das Ergebnis
    const formattedBatches = batches.map((row) => ({
      id: row.inventory_batches.id,
      batchNumber: row.inventory_batches.batchNumber,
      productId: row.inventory_batches.productId,
      warehouseId: row.inventory_batches.warehouseId,
      quantity: row.inventory_batches.quantity,
      expiryDate: row.inventory_batches.expiryDate,
      receivedDate: row.inventory_batches.receivedDate,
      notes: row.inventory_batches.notes,
      locationInWarehouse: row.inventory_batches.locationInWarehouse,
      status: row.inventory_batches.status,
      createdAt: row.inventory_batches.createdAt,
      updatedAt: row.inventory_batches.updatedAt,
      productName: row.products?.name || null,
      warehouseName: row.warehouses?.name || null
    }));
    
    res.json(formattedBatches);
  } catch (error) {
    console.error('Fehler beim Abrufen der Inventar-Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Inventar-Batches',
      details: (error as Error).message 
    });
  }
});

// GET /api/inventory-batches/next-expiring - Nächste ablaufende Batches für jedes Produkt oder Lager
router.get('/next-expiring', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const currentDate = new Date();
    
    // SQL für die Abfrage
    const query = `
      WITH RankedBatches AS (
        SELECT 
          pb.*,
          p.name as product_name,
          ROW_NUMBER() OVER (
            PARTITION BY pb.product_id
            ORDER BY pb.expiry_date ASC NULLS LAST
          ) as row_num
        FROM inventory_batches pb
        LEFT JOIN products p ON pb.product_id = p.id
        WHERE 
          pb.quantity > 0
          AND (pb.expiry_date IS NULL OR pb.expiry_date >= NOW())
          ${warehouseId ? `AND pb.warehouse_id = ${warehouseId}` : ''}
          ${productId ? `AND pb.product_id = ${productId}` : ''}
      )
      SELECT * FROM RankedBatches
      WHERE row_num = 1
      ORDER BY expiry_date ASC NULLS LAST;
    `;
    
    const nextExpiringBatches = await db.execute(query);
    
    // Formatiere das Ergebnis
    const formattedBatches = nextExpiringBatches.map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      quantity: row.quantity,
      expiryDate: row.expiry_date,
      receivedDate: row.received_date,
      notes: row.notes,
      locationInWarehouse: row.location_in_warehouse,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productName: row.product_name || null
    }));
    
    res.json(formattedBatches);
  } catch (error) {
    console.error('Fehler beim Abrufen der nächsten ablaufenden Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der nächsten ablaufenden Batches',
      details: (error as Error).message 
    });
  }
});

// GET /api/inventory-batches/:id - Einen Batch anhand seiner ID abrufen
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Batch-ID' });
    }
    
    const batch = await db.select()
      .from(inventoryBatches)
      .leftJoin(products, eq(inventoryBatches.productId, products.id))
      .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id))
      .where(eq(inventoryBatches.id, id))
      .limit(1);
    
    if (batch.length === 0) {
      return res.status(404).json({ error: 'Batch nicht gefunden' });
    }
    
    // Formatiere das Ergebnis
    const formattedBatch = {
      id: batch[0].inventory_batches.id,
      batchNumber: batch[0].inventory_batches.batchNumber,
      productId: batch[0].inventory_batches.productId,
      warehouseId: batch[0].inventory_batches.warehouseId,
      quantity: batch[0].inventory_batches.quantity,
      expiryDate: batch[0].inventory_batches.expiryDate,
      receivedDate: batch[0].inventory_batches.receivedDate,
      notes: batch[0].inventory_batches.notes,
      locationInWarehouse: batch[0].inventory_batches.locationInWarehouse,
      status: batch[0].inventory_batches.status,
      createdAt: batch[0].inventory_batches.createdAt,
      updatedAt: batch[0].inventory_batches.updatedAt,
      productName: batch[0].products?.name || null,
      warehouseName: batch[0].warehouses?.name || null
    };
    
    res.json(formattedBatch);
  } catch (error) {
    console.error(`Fehler beim Abrufen des Batches mit ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Abrufen des Batches mit ID ${req.params.id}`,
      details: (error as Error).message 
    });
  }
});

// GET /api/inventory-batches/product/:productId/warehouse/:warehouseId - Alle Batches für ein Produkt in einem Lager abrufen
router.get('/product/:productId/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.productId);
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(productId) || isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Produkt-ID oder Lager-ID" });
    }
    
    // Hole alle Batches des Produkts im Lager
    const batches = await db.select()
      .from(inventoryBatches)
      .leftJoin(products, eq(inventoryBatches.productId, products.id))
      .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id))
      .where(
        and(
          eq(inventoryBatches.productId, productId),
          eq(inventoryBatches.warehouseId, warehouseId)
        )
      )
      // Sortiere nach Ablaufdatum (FIFO-Prinzip)
      .orderBy(asc(inventoryBatches.expiryDate));
    
    if (!batches || batches.length === 0) {
      return res.json([]);
    }
    
    // Formatiere Batches für die Antwort
    const formattedBatches = batches.map(batch => {
      return {
        id: batch.inventory_batches.id,
        batchNumber: batch.inventory_batches.batchNumber,
        productId: batch.inventory_batches.productId,
        warehouseId: batch.inventory_batches.warehouseId,
        quantity: batch.inventory_batches.quantity,
        receivedDate: batch.inventory_batches.receivedDate,
        expiryDate: batch.inventory_batches.expiryDate,
        locationInWarehouse: batch.inventory_batches.locationInWarehouse,
        status: batch.inventory_batches.status,
        notes: batch.inventory_batches.notes,
        createdAt: batch.inventory_batches.createdAt,
        updatedAt: batch.inventory_batches.updatedAt,
        productName: batch.products?.name || 'Unbekanntes Produkt',
        warehouseName: batch.warehouses?.name || 'Unbekanntes Lager'
      };
    });
    
    // Sende die Antwort
    res.json(formattedBatches);
    
  } catch (error) {
    console.error("Fehler beim Abrufen der Produkt-Batches:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Produkt-Batches", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/inventory-batches/:id/movements - Bewegungen für einen Batch abrufen
router.get('/:id/movements', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.id);
    
    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'Ungültige Batch-ID' });
    }
    
    // Hole alle Bewegungen für diesen Batch
    const movements = await db.select({
      id: inventoryMovements.id,
      batchId: inventoryMovements.batchId,
      productId: inventoryMovements.productId,
      quantity: inventoryMovements.quantity,
      movementType: inventoryMovements.movementType,
      performedAt: inventoryMovements.performedAt,
      sourceWarehouseId: inventoryMovements.sourceWarehouseId,
      destinationWarehouseId: inventoryMovements.destinationWarehouseId,
      machineId: inventoryMovements.machineId,
      notes: inventoryMovements.notes
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.batchId, batchId))
    .orderBy(desc(inventoryMovements.performedAt));
    
    // Erweitere die Bewegungen mit zusätzlichen Informationen
    const enhancedMovements = await Promise.all(movements.map(async (movement) => {
      // Erzeuge ein Objekt zur Rückgabe
      const enhancedMovement = { ...movement };
      
      // Füge Maschinennamen hinzu, falls vorhanden
      if (movement.machineId) {
        const machineData = await db.select()
          .from(machines)
          .where(eq(machines.id, movement.machineId))
          .limit(1);
          
        if (machineData.length > 0) {
          enhancedMovement.machineName = machineData[0].name;
        }
      }
      
      // Füge Quell-Lagernamen hinzu, falls vorhanden
      if (movement.sourceWarehouseId) {
        const sourceData = await db.select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.sourceWarehouseId))
          .limit(1);
          
        if (sourceData.length > 0) {
          enhancedMovement.sourceWarehouseName = sourceData[0].name;
        }
      }
      
      // Füge Ziel-Lagernamen hinzu, falls vorhanden
      if (movement.destinationWarehouseId) {
        const destData = await db.select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.destinationWarehouseId))
          .limit(1);
          
        if (destData.length > 0) {
          enhancedMovement.destinationWarehouseName = destData[0].name;
        }
      }
      
      return enhancedMovement;
    }));
    
    res.json(enhancedMovements);
  } catch (error) {
    console.error('Fehler beim Abrufen der Batch-Bewegungen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Batch-Bewegungen',
      details: (error as Error).message 
    });
  }
});

export default router;
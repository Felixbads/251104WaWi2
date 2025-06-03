import express from 'express';
import { db } from '../db';
import * as schema from '../../shared/schema';
import { eq, count, sql } from 'drizzle-orm';

const router = express.Router();

// Get general warehouse statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total warehouse count and inventory stats
    const warehouseStats = await db
      .select({
        totalWarehouses: count(schema.warehouses.id),
        activeWarehouses: sql<number>`COUNT(CASE WHEN ${schema.warehouses.isActive} = true THEN 1 END)`,
      })
      .from(schema.warehouses);

    const inventoryStats = await db
      .select({
        totalInventoryItems: count(schema.inventoryItems.id),
        totalQuantity: sql<number>`COALESCE(SUM(${schema.inventoryItems.quantity}), 0)`,
        lowStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} <= ${schema.inventoryItems.reorderPoint} THEN 1 END)`,
        outOfStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} = 0 THEN 1 END)`,
      })
      .from(schema.inventoryItems)
      .innerJoin(schema.warehouses, eq(schema.inventoryItems.warehouseId, schema.warehouses.id))
      .where(eq(schema.warehouses.isActive, true));

    const stats = {
      ...warehouseStats[0],
      ...inventoryStats[0]
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Fehler beim Laden der Lagerstatistiken:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden der Lagerstatistiken' });
  }
});

// Get statistics for a specific warehouse
router.get('/:id/stats', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Check if warehouse exists
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Calculate warehouse statistics
    const statsQuery = await db.select({
      totalProducts: count(schema.inventoryItems.id),
      totalQuantity: sql<number>`COALESCE(SUM(${schema.inventoryItems.quantity}), 0)`,
      lowStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} <= ${schema.inventoryItems.reorderPoint} THEN 1 END)`,
      outOfStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} = 0 THEN 1 END)`,
      activeItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.status} = 'active' THEN 1 END)`
    })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.warehouseId, warehouseId));

    const stats = statsQuery[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      activeItems: 0
    };

    return res.status(200).json({
      warehouseId,
      warehouseName: warehouse.name,
      isActive: warehouse.isActive,
      status: warehouse.status,
      ...stats
    });
  } catch (error) {
    console.error('Fehler beim Laden der Lagerstatistiken:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden der Lagerstatistiken' });
  }
});

// Get warehouse information
router.get('/:id/info', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Das angeforderte Lager konnte nicht gefunden werden.' });
    }

    return res.status(200).json(warehouse);
  } catch (error) {
    console.error('Fehler beim Laden der Lager-Informationen:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden der Lager-Informationen' });
  }
});

// Get warehouse inventory
router.get('/:id', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    const inventoryItems = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.warehouseId, warehouseId),
      with: {
        product: true
      },
      orderBy: [schema.inventoryItems.productId]
    });

    return res.status(200).json(inventoryItems);
  } catch (error) {
    console.error('Fehler beim Laden des Lagerbestands:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden des Lagerbestands' });
  }
});

export default router;
import express from 'express';
import { db } from '../db';
import { syncMachineInventoryWithWarehouse } from '../services/inventorySynchronizer';

const router = express.Router();

/**
 * Allgemeine Fehlerbehandlungsfunktion für API-Routen
 */
const asyncHandler = (fn: Function) => (req: any, res: any, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * API-Route für Basisinformationen eines Lagers
 * GET /api/inventory/warehouse/:id/info
 */
router.get('/api/inventory/warehouse/:id/info', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  const query = `
    SELECT 
      w.id, 
      w.name, 
      w.address, 
      w.postal_code, 
      w.city, 
      w.description,
      w.is_active,
      w.created_at,
      w.updated_at
    FROM 
      warehouses w
    WHERE 
      w.id = $1
  `;

  const result = await db.query(query, [warehouseId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Lager nicht gefunden' });
  }

  res.json(result.rows[0]);
}));

/**
 * API-Route für Lagerstatistik
 * GET /api/inventory/warehouse/:id/stats
 */
router.get('/api/inventory/warehouse/:id/stats', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  const query = `
    WITH inventory_stats AS (
      SELECT 
        COUNT(DISTINCT i.product_id) as product_count,
        SUM(CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN 1 ELSE 0 END) as critical_item_count,
        SUM(i.quantity * COALESCE(p.price, 0)) as inventory_value
      FROM 
        inventory_items i
      LEFT JOIN
        products p ON i.product_id = p.id
      WHERE 
        i.warehouse_id = $1
    ),
    machine_count AS (
      SELECT 
        COUNT(DISTINCT machine_id) as machine_count
      FROM 
        machine_warehouse_assignments
      WHERE 
        warehouse_id = $1
    )
    SELECT 
      i.product_count,
      i.critical_item_count,
      i.inventory_value,
      m.machine_count
    FROM 
      inventory_stats i, machine_count m
  `;

  const result = await db.query(query, [warehouseId]);
  
  if (result.rows.length === 0) {
    return res.json({
      productCount: 0,
      criticalItemCount: 0,
      inventoryValue: 0,
      machineCount: 0
    });
  }

  const stats = result.rows[0];
  
  res.json({
    productCount: parseInt(stats.product_count) || 0,
    criticalItemCount: parseInt(stats.critical_item_count) || 0,
    inventoryValue: parseFloat(stats.inventory_value) || 0,
    machineCount: parseInt(stats.machine_count) || 0
  });
}));

/**
 * API-Route für Lagerbestand
 * GET /api/inventory/warehouse/:id
 */
router.get('/api/inventory/warehouse/:id', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  const query = `
    SELECT 
      i.id,
      i.product_id,
      p.name as product_name,
      p.sku,
      p.category,
      i.quantity,
      i.min_quantity,
      (SELECT COUNT(*) FROM product_batches WHERE product_id = i.product_id AND warehouse_id = i.warehouse_id) as batch_count,
      p.price,
      i.updated_at
    FROM 
      inventory_items i
    JOIN
      products p ON i.product_id = p.id
    WHERE 
      i.warehouse_id = $1
    ORDER BY
      p.name ASC
  `;

  const result = await db.query(query, [warehouseId]);
  res.json(result.rows);
}));

/**
 * API-Route für Bestandsbewegungen eines Lagers
 * GET /api/inventory/warehouse/:id/movements
 */
router.get('/api/inventory/warehouse/:id/movements', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }
  
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const query = `
    SELECT 
      m.id,
      m.product_id,
      p.name as product_name,
      m.quantity,
      m.movement_type,
      m.source_type,
      m.source_id,
      m.destination_type,
      m.destination_id,
      m.reference_type,
      m.reference_id,
      m.reason,
      m.performed_at,
      m.performed_by,
      m.notes
    FROM 
      inventory_movements m
    JOIN
      products p ON m.product_id = p.id
    WHERE 
      (m.source_type = 'warehouse' AND m.source_id = $1) OR
      (m.destination_type = 'warehouse' AND m.destination_id = $1)
    ORDER BY
      m.performed_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await db.query(query, [warehouseId, limit, offset]);
  res.json(result.rows);
}));

/**
 * API-Route zum Synchronisieren des Lagerbestands mit einem Automaten
 * POST /api/inventory/sync-machine/:id
 */
router.post('/api/inventory/sync-machine/:id', asyncHandler(async (req: any, res: any) => {
  const machineId = parseInt(req.params.id);
  if (isNaN(machineId)) {
    return res.status(400).json({ message: 'Ungültige Automaten-ID' });
  }

  try {
    const result = await syncMachineInventoryWithWarehouse(machineId);
    
    res.json({
      success: true,
      machineId,
      message: 'Bestandsabgleich erfolgreich durchgeführt',
      details: result
    });
  } catch (error: any) {
    console.error('Fehler beim Bestandsabgleich:', error);
    res.status(500).json({ 
      success: false,
      message: 'Fehler beim Bestandsabgleich', 
      error: error.message 
    });
  }
}));

export default router;
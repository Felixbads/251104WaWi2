import { Router } from 'express';
import { db } from '../db';
import { inventoryMovements, products, warehouses } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/inventory-movements
 * Retrieves all inventory movements/transfers with chronological listing
 */
router.get('/', async (req, res) => {
  try {
    console.log('[INVENTORY_MOVEMENTS] Fetching all inventory movements');

    // Execute query to get all inventory movements with product and warehouse details
    const movements = await db
      .select({
        id: inventoryMovements.id,
        productId: inventoryMovements.productId,
        productName: products.productName,
        sourceWarehouseId: inventoryMovements.sourceWarehouseId,
        destinationWarehouseId: inventoryMovements.destinationWarehouseId,
        quantity: inventoryMovements.quantity,
        movementType: inventoryMovements.movementType,
        direction: inventoryMovements.direction,
        status: inventoryMovements.status,
        notes: inventoryMovements.notes,
        locationFrom: inventoryMovements.locationFrom,
        locationTo: inventoryMovements.locationTo,
        createdAt: inventoryMovements.createdAt,
        updatedAt: inventoryMovements.updatedAt,
        performedAt: inventoryMovements.performedAt,
        batchNumber: inventoryMovements.batchNumber,
        referenceType: inventoryMovements.referenceType,
        referenceId: inventoryMovements.referenceId
      })
      .from(inventoryMovements)
      .leftJoin(products, eq(inventoryMovements.productId, products.id))
      .orderBy(desc(inventoryMovements.createdAt));

    console.log(`[INVENTORY_MOVEMENTS] Found ${movements.length} inventory movements`);

    // Get warehouse names for source and destination
    const warehouseIds = new Set<number>();
    movements.forEach(movement => {
      if (movement.sourceWarehouseId) warehouseIds.add(movement.sourceWarehouseId);
      if (movement.destinationWarehouseId) warehouseIds.add(movement.destinationWarehouseId);
    });

    const warehouseMap = new Map<number, string>();
    if (warehouseIds.size > 0) {
      const warehouseData = await db
        .select({ id: warehouses.id, name: warehouses.name })
        .from(warehouses)
        .where(eq(warehouses.id, Array.from(warehouseIds)[0])); // Simple approach for now
      
      warehouseData.forEach(wh => warehouseMap.set(wh.id, wh.name));
    }

    // Enrich movements with warehouse names
    const enrichedMovements = movements.map(movement => ({
      ...movement,
      sourceWarehouseName: movement.sourceWarehouseId ? warehouseMap.get(movement.sourceWarehouseId) || `Lager ${movement.sourceWarehouseId}` : null,
      destinationWarehouseName: movement.destinationWarehouseId ? warehouseMap.get(movement.destinationWarehouseId) || `Lager ${movement.destinationWarehouseId}` : null,
      displayType: getMovementDisplayType(movement.movementType, movement.direction),
      displayDescription: getMovementDescription(movement)
    }));

    res.json(enrichedMovements);
  } catch (error) {
    console.error('[INVENTORY_MOVEMENTS] Error fetching inventory movements:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch inventory movements',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Helper function to get display type for movement
 */
function getMovementDisplayType(movementType: string | null, direction: string | null): string {
  if (movementType === 'transfer') return 'Umlagerung';
  if (movementType === 'disposal') return 'Entsorgung';
  if (movementType === 'adjustment') return 'Korrektur';
  if (direction === 'in') return 'Eingang';
  if (direction === 'out') return 'Ausgang';
  return 'Unbekannt';
}

/**
 * Helper function to get movement description
 */
function getMovementDescription(movement: any): string {
  const { movementType, sourceWarehouseId, destinationWarehouseId, notes } = movement;
  
  if (movementType === 'transfer' && sourceWarehouseId && destinationWarehouseId) {
    return `Transfer von Lager ${sourceWarehouseId} zu Lager ${destinationWarehouseId}`;
  }
  
  if (movementType === 'disposal') {
    return `Entsorgung aus Lager ${sourceWarehouseId || destinationWarehouseId}`;
  }
  
  if (notes) {
    return notes;
  }
  
  return 'Keine Beschreibung verfügbar';
}

export default router;
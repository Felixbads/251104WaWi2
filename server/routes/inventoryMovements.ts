import { Router } from 'express';
import { db } from '../db';
import { inventoryMovements, inventoryTransfers, inventoryTransferItems, products, warehouses } from '../../shared/schema';
import { eq, desc, or } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/inventory-movements
 * Retrieves all inventory movements/transfers with chronological listing
 */
router.get('/', async (req, res) => {
  try {
    const { productId, warehouseId, batchId, batchIds } = req.query;
    
    console.log('[INVENTORY_MOVEMENTS] Query params:', { productId, warehouseId, batchId, batchIds });

    let movementsQuery = db
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
      .leftJoin(products, eq(inventoryMovements.productId, products.id));

    // Filter by productId if provided
    if (productId) {
      movementsQuery = movementsQuery.where(eq(inventoryMovements.productId, parseInt(productId as string)));
    }

    // Filter by warehouseId if provided (either source or destination)
    if (warehouseId) {
      const whId = parseInt(warehouseId as string);
      movementsQuery = movementsQuery.where(
        or(
          eq(inventoryMovements.sourceWarehouseId, whId),
          eq(inventoryMovements.destinationWarehouseId, whId)
        )
      );
    }

    const movements = await movementsQuery.orderBy(desc(inventoryMovements.createdAt));

    // Get inventory transfers with their items
    const transfers = await db
      .select({
        transferId: inventoryTransfers.id,
        sourceWarehouseId: inventoryTransfers.sourceWarehouseId,
        targetWarehouseId: inventoryTransfers.targetWarehouseId,
        status: inventoryTransfers.status,
        notes: inventoryTransfers.notes,
        createdAt: inventoryTransfers.createdAt,
        completedAt: inventoryTransfers.completedAt,
        productId: inventoryTransferItems.productId,
        productName: inventoryTransferItems.productName,
        quantity: inventoryTransferItems.quantity,
        reason: inventoryTransferItems.reason
      })
      .from(inventoryTransfers)
      .leftJoin(inventoryTransferItems, eq(inventoryTransfers.id, inventoryTransferItems.transferId))
      .orderBy(desc(inventoryTransfers.createdAt));

    // Convert transfers to movement format
    const transferMovements = transfers.map(transfer => ({
      id: `transfer-${transfer.transferId}`,
      productId: transfer.productId,
      productName: transfer.productName,
      sourceWarehouseId: transfer.sourceWarehouseId,
      destinationWarehouseId: transfer.targetWarehouseId,
      quantity: transfer.quantity,
      movementType: 'transfer',
      direction: 'transfer',
      status: transfer.status,
      notes: transfer.notes || transfer.reason,
      locationFrom: null,
      locationTo: null,
      createdAt: transfer.createdAt,
      updatedAt: transfer.createdAt,
      performedAt: transfer.completedAt,
      batchNumber: null,
      referenceType: 'transfer',
      referenceId: transfer.transferId
    }));

    // Combine and sort all movements
    const allMovements = [...movements, ...transferMovements].sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    console.log(`[INVENTORY_MOVEMENTS] Found ${movements.length} movements and ${transferMovements.length} transfers`);

    // Get warehouse names for source and destination from all movements
    const warehouseIds = new Set<number>();
    allMovements.forEach(movement => {
      if (movement.sourceWarehouseId) warehouseIds.add(movement.sourceWarehouseId);
      if (movement.destinationWarehouseId) warehouseIds.add(movement.destinationWarehouseId);
    });

    const warehouseMap = new Map<number, string>();
    if (warehouseIds.size > 0) {
      const warehouseData = await db
        .select({ id: warehouses.id, name: warehouses.name })
        .from(warehouses);
      
      warehouseData.forEach(wh => warehouseMap.set(wh.id, wh.name));
    }

    // Enrich all movements with warehouse names
    const enrichedMovements = allMovements.map(movement => ({
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
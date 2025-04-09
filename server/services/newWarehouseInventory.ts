/**
 * New Warehouse Inventory Service
 * 
 * This service provides a complete rebuild of the warehouse inventory system
 * with a consistent approach to inventory management and synchronization.
 */

import { db } from '../db';
import { logDebug, logError, logQuery } from '../utils/bugTracker';

/**
 * Types for inventory management
 */
interface WarehouseStats {
  warehouseId: number;
  productCount: number;
  criticalItemCount: number;
  inventoryValue: number;
  machineCount: number;
}

interface InventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  productName: string;
  quantity: number;
  minQuantity: number;
  price: number | null;
  batchCount: number;
  lastMovementDate: string | null;
  isCritical: boolean;
}

interface InventoryMovement {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  movementType: string;
  sourceWarehouseId: number | null;
  destinationWarehouseId: number | null;
  machineId: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  performedAt: string;
  performedBy: string | null;
}

/**
 * Get warehouse statistics with accurate inventory counts
 * This replaces the previous problematic implementation
 */
export async function getWarehouseStatistics(warehouseId: number): Promise<WarehouseStats> {
  logDebug('WarehouseStats', `Fetching warehouse statistics for ID: ${warehouseId}`);
  
  try {
    const query = `
      WITH inventory_stats AS (
        SELECT 
          COUNT(DISTINCT i.product_id) as product_count,
          COUNT(CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) AND i.product_id IS NOT NULL THEN 1 END) as critical_item_count,
          COALESCE(SUM(i.quantity * COALESCE(p.price, 0)), 0) as inventory_value
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
        COALESCE(i.product_count, 0) as product_count,
        COALESCE(i.critical_item_count, 0) as critical_item_count,
        COALESCE(i.inventory_value, 0) as inventory_value,
        COALESCE(m.machine_count, 0) as machine_count
      FROM 
        (SELECT 1) dummy
      LEFT JOIN inventory_stats i ON true
      LEFT JOIN machine_count m ON true
    `;
    
    logQuery('getWarehouseStatistics', query, [warehouseId]);
    const result = await db.query(query, [warehouseId]);
    
    if (!result.rows || result.rows.length === 0) {
      logDebug('WarehouseStats', `No stats found for warehouse ID: ${warehouseId}, returning defaults`);
      return {
        warehouseId,
        productCount: 0,
        criticalItemCount: 0,
        inventoryValue: 0,
        machineCount: 0
      };
    }

    const stats = result.rows[0];
    
    const formattedStats: WarehouseStats = {
      warehouseId,
      productCount: parseInt(stats.product_count) || 0,
      criticalItemCount: parseInt(stats.critical_item_count) || 0,
      inventoryValue: parseFloat(stats.inventory_value) || 0,
      machineCount: parseInt(stats.machine_count) || 0
    };
    
    logDebug('WarehouseStats', `Statistics for warehouse ${warehouseId}:`, formattedStats);
    return formattedStats;
  } catch (error) {
    logError('WarehouseStats', `Error fetching statistics for warehouse ${warehouseId}`, error);
    throw error;
  }
}

/**
 * Get inventory items for a warehouse with complete product information
 */
export async function getWarehouseInventory(warehouseId: number): Promise<InventoryItem[]> {
  logDebug('WarehouseInventory', `Fetching inventory for warehouse ID: ${warehouseId}`);
  
  try {
    const query = `
      SELECT 
        i.id,
        i.warehouse_id,
        i.product_id,
        p.product_name,
        i.quantity,
        i.min_quantity,
        p.price,
        (SELECT COUNT(*) FROM product_batches pb 
          WHERE pb.product_id = i.product_id AND pb.warehouse_id = i.warehouse_id) as batch_count,
        (SELECT MAX(im.performed_at) FROM inventory_movements im 
          WHERE im.product_id = i.product_id AND 
            (im.source_warehouse_id = i.warehouse_id OR 
             im.destination_warehouse_id = i.warehouse_id)) as last_movement_date,
        CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN true ELSE false END as is_critical
      FROM 
        inventory_items i
      JOIN 
        products p ON i.product_id = p.id
      WHERE 
        i.warehouse_id = $1
      ORDER BY 
        p.product_name ASC
    `;
    
    logQuery('getWarehouseInventory', query, [warehouseId]);
    const result = await db.query(query, [warehouseId]);
    
    const inventory: InventoryItem[] = result.rows.map(row => ({
      id: parseInt(row.id),
      warehouseId: parseInt(row.warehouse_id),
      productId: parseInt(row.product_id),
      productName: row.product_name,
      quantity: parseInt(row.quantity) || 0,
      minQuantity: parseInt(row.min_quantity) || 0,
      price: row.price !== null ? parseFloat(row.price) : null,
      batchCount: parseInt(row.batch_count) || 0,
      lastMovementDate: row.last_movement_date,
      isCritical: row.is_critical
    }));
    
    logDebug('WarehouseInventory', `Found ${inventory.length} inventory items for warehouse ${warehouseId}`);
    return inventory;
  } catch (error) {
    logError('WarehouseInventory', `Error fetching inventory for warehouse ${warehouseId}`, error);
    throw error;
  }
}

/**
 * Get inventory movements for a warehouse with complete information
 */
export async function getWarehouseMovements(warehouseId: number, limit: number = 50, offset: number = 0): Promise<InventoryMovement[]> {
  logDebug('WarehouseMovements', `Fetching movements for warehouse ID: ${warehouseId}, limit: ${limit}, offset: ${offset}`);
  
  try {
    const query = `
      SELECT 
        im.id,
        im.product_id,
        p.product_name,
        im.quantity,
        im.movement_type,
        im.source_warehouse_id,
        im.destination_warehouse_id,
        im.machine_id,
        im.reference_type,
        im.reference_id,
        im.notes,
        im.performed_at,
        im.performed_by
      FROM 
        inventory_movements im
      JOIN 
        products p ON im.product_id = p.id
      WHERE 
        (im.source_warehouse_id = $1) OR
        (im.destination_warehouse_id = $1)
      ORDER BY 
        im.performed_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    logQuery('getWarehouseMovements', query, [warehouseId, limit, offset]);
    const result = await db.query(query, [warehouseId, limit, offset]);
    
    const movements: InventoryMovement[] = result.rows.map(row => ({
      id: parseInt(row.id),
      productId: parseInt(row.product_id),
      productName: row.product_name,
      quantity: parseInt(row.quantity) || 0,
      movementType: row.movement_type,
      sourceWarehouseId: row.source_warehouse_id !== null ? parseInt(row.source_warehouse_id) : null,
      destinationWarehouseId: row.destination_warehouse_id !== null ? parseInt(row.destination_warehouse_id) : null,
      machineId: row.machine_id !== null ? parseInt(row.machine_id) : null,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      notes: row.notes,
      performedAt: row.performed_at,
      performedBy: row.performed_by
    }));
    
    logDebug('WarehouseMovements', `Found ${movements.length} movements for warehouse ${warehouseId}`);
    return movements;
  } catch (error) {
    logError('WarehouseMovements', `Error fetching movements for warehouse ${warehouseId}`, error);
    throw error;
  }
}

/**
 * Synchronize machine inventory with warehouse
 * This is a complete rewrite to ensure proper synchronization
 */
export async function syncMachineWithWarehouse(machineId: number): Promise<any> {
  logDebug('MachineSyncNew', `Starting machine-warehouse sync for machine ID: ${machineId}`);
  
  try {
    // Start transaction
    await db.query('BEGIN');
    
    // 1. Find the assigned warehouse
    const assignmentQuery = `
      SELECT warehouse_id 
      FROM machine_warehouse_assignments 
      WHERE machine_id = $1
      LIMIT 1
    `;
    
    logQuery('MachineSyncNew', assignmentQuery, [machineId]);
    const assignmentResult = await db.query(assignmentQuery, [machineId]);
    
    if (assignmentResult.rows.length === 0) {
      throw new Error(`No warehouse assignment found for machine ${machineId}`);
    }
    
    const warehouseId = assignmentResult.rows[0].warehouse_id;
    logDebug('MachineSyncNew', `Machine ${machineId} is assigned to warehouse ${warehouseId}`);
    
    // 2. Get current machine inventory
    const machineInventoryQuery = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        ms.product_id,
        p.product_name,
        ms.quantity,
        ms.max_capacity,
        ms.min_quantity
      FROM 
        machine_stock ms
      JOIN 
        machines m ON ms.machine_id = m.id
      JOIN 
        products p ON ms.product_id = p.id
      WHERE 
        ms.machine_id = $1
    `;
    
    logQuery('MachineSyncNew', machineInventoryQuery, [machineId]);
    const machineInventoryResult = await db.query(machineInventoryQuery, [machineId]);
    const machineItems = machineInventoryResult.rows;
    
    logDebug('MachineSyncNew', `Found ${machineItems.length} items in machine ${machineId}`);
    
    // 3. Process each machine item
    const syncResults = [];
    let totalUpdates = 0;
    let totalNewItems = 0;
    
    for (const item of machineItems) {
      // Check if product exists in warehouse inventory
      const warehouseInventoryQuery = `
        SELECT id, quantity, min_quantity 
        FROM inventory_items 
        WHERE warehouse_id = $1 AND product_id = $2
        LIMIT 1
      `;
      
      logQuery('MachineSyncNew', warehouseInventoryQuery, [warehouseId, item.product_id]);
      const warehouseInventoryResult = await db.query(warehouseInventoryQuery, [warehouseId, item.product_id]);
      
      // If product doesn't exist in warehouse, create it
      if (warehouseInventoryResult.rows.length === 0) {
        logDebug('MachineSyncNew', `Product ${item.product_id} (${item.product_name}) not found in warehouse ${warehouseId}, creating new inventory item`);
        
        const insertQuery = `
          INSERT INTO inventory_items (
            warehouse_id, product_id, quantity, min_quantity, 
            last_updated, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, NOW(), NOW(), NOW()
          ) RETURNING id
        `;
        
        // Set minimum quantity to match machine's minimum quantity
        const minQuantity = item.min_quantity || 0;
        
        logQuery('MachineSyncNew', insertQuery, [warehouseId, item.product_id, item.quantity, minQuantity]);
        const insertResult = await db.query(insertQuery, [warehouseId, item.product_id, item.quantity, minQuantity]);
        
        // Record sync movement
        await recordSyncMovement(
          item.product_id,
          item.quantity,
          'machine',
          machineId,
          'warehouse',
          warehouseId,
          machineId,
          item.machine_name,
          `Initial sync from machine to warehouse`
        );
        
        syncResults.push({
          productId: item.product_id,
          productName: item.product_name,
          machineQuantity: item.quantity,
          warehouseQuantity: item.quantity,
          action: 'new_item_created'
        });
        
        totalNewItems++;
      } else {
        // Product exists in warehouse - updating quantities is handled by movements
        logDebug('MachineSyncNew', `Product ${item.product_id} (${item.product_name}) found in warehouse ${warehouseId}, recording sync movement`);

        // Always record a movement to capture the machine's current state
        await recordSyncMovement(
          item.product_id,
          item.quantity,
          'machine',
          machineId,
          'warehouse',
          warehouseId,
          machineId,
          item.machine_name,
          `Periodic sync from machine to warehouse`
        );
        
        syncResults.push({
          productId: item.product_id,
          productName: item.product_name,
          machineQuantity: item.quantity,
          warehouseQuantity: warehouseInventoryResult.rows[0].quantity,
          action: 'sync_recorded'
        });
        
        totalUpdates++;
      }
    }
    
    // 4. Commit transaction
    await db.query('COMMIT');
    
    // 5. Return sync results
    const result = {
      success: true,
      machineId,
      warehouseId,
      totalProducts: machineItems.length,
      newItemsCreated: totalNewItems,
      itemsUpdated: totalUpdates,
      details: syncResults
    };
    
    logDebug('MachineSyncNew', `Sync completed successfully for machine ${machineId}`, result);
    return result;
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    logError('MachineSyncNew', `Error during sync for machine ${machineId}`, error);
    throw error;
  }
}

/**
 * Record a sync movement between machine and warehouse
 */
async function recordSyncMovement(
  productId: number,
  quantity: number,
  sourceType: string,
  sourceId: number,
  destinationType: string,
  destinationId: number,
  referenceId: number,
  machineName: string,
  notes: string
): Promise<number> {
  // Determine the appropriate warehouse_id and machine_id fields based on source and destination types
  let sourceWarehouseId = null;
  let destinationWarehouseId = null;
  let machineId = null;
  
  if (sourceType === 'warehouse') {
    sourceWarehouseId = sourceId;
  } else if (sourceType === 'machine') {
    machineId = sourceId;
  }
  
  if (destinationType === 'warehouse') {
    destinationWarehouseId = destinationId;
  } else if (destinationType === 'machine') {
    machineId = destinationId;
  }
  
  const movementQuery = `
    INSERT INTO inventory_movements (
      product_id, quantity, movement_type, 
      source_warehouse_id, destination_warehouse_id, 
      machine_id, reference_type, reference_id, 
      notes, performed_at, performed_by
    ) VALUES (
      $1, $2, 'sync', 
      $3, $4, 
      $5, 'machine_sync', $6, 
      $7, NOW(), 'system'
    ) RETURNING id
  `;
  
  logQuery('recordSyncMovement', movementQuery, [
    productId, quantity, sourceWarehouseId, destinationWarehouseId, 
    machineId, referenceId, notes
  ]);
  
  const result = await db.query(movementQuery, [
    productId, quantity, sourceWarehouseId, destinationWarehouseId, 
    machineId, referenceId, notes
  ]);
  
  return result.rows[0].id;
}
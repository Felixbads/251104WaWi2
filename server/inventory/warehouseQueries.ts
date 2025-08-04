import { db } from '../db';

/**
 * Holt Basisinformationen zu einem Lager
 * @param warehouseId ID des Lagers
 */
export async function getWarehouseInfo(warehouseId: number) {
  try {
    const query = `
      SELECT id, name, description, address, postal_code, city, type
      FROM warehouses
      WHERE id = $1
    `;
    
    const result = await db.query(query, [warehouseId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Fehler beim Abrufen der Lagerinformationen:', error);
    throw new Error('Die Lagerinformationen konnten nicht abgerufen werden');
  }
}

/**
 * Holt die Statistikdaten für ein bestimmtes Lager
 * @param warehouseId ID des Lagers
 */
export async function getWarehouseStats(warehouseId: number) {
  try {
    // Anzahl der verschiedenen Produkte im Lager
    const productCountQuery = `
      SELECT COUNT(DISTINCT product_id) as product_count
      FROM inventory_items
      WHERE warehouse_id = $1
    `;
    
    // Anzahl der Produkte mit kritischem Bestand
    const criticalItemsQuery = `
      SELECT COUNT(*) as critical_count
      FROM inventory_items
      WHERE warehouse_id = $1 AND min_quantity > 0 AND quantity <= min_quantity
    `;
    
    // Anzahl der zugeordneten Automaten
    const machineCountQuery = `
      SELECT COUNT(*) as machine_count
      FROM machine_warehouse_assignments
      WHERE warehouse_id = $1
    `;
    
    // Gesamtwert des Lagerbestands
    const inventoryValueQuery = `
      SELECT COALESCE(SUM(i.quantity * p.price), 0) as total_value
      FROM inventory_items i
      JOIN products p ON i.product_id = p.id
      WHERE i.warehouse_id = $1
    `;
    
    const productCountResult = await db.query(productCountQuery, [warehouseId]);
    const criticalItemsResult = await db.query(criticalItemsQuery, [warehouseId]);
    const machineCountResult = await db.query(machineCountQuery, [warehouseId]);
    const inventoryValueResult = await db.query(inventoryValueQuery, [warehouseId]);
    
    return {
      productCount: parseInt(productCountResult.rows[0]?.product_count || '0', 10),
      criticalItemCount: parseInt(criticalItemsResult.rows[0]?.critical_count || '0', 10),
      machineCount: parseInt(machineCountResult.rows[0]?.machine_count || '0', 10),
      inventoryValue: parseFloat(inventoryValueResult.rows[0]?.total_value || '0')
    };
  } catch (error) {
    console.error('Fehler beim Abrufen der Lagerstatistik:', error);
    throw new Error('Die Statistikdaten konnten nicht abgerufen werden');
  }
}

/**
 * Holt alle Lagerinventardaten mit Produktdetails
 * @param warehouseId ID des Lagers
 */
export async function getWarehouseInventory(warehouseId: number) {
  try {
    const query = `
      SELECT 
        i.id,
        i.product_id,
        i.warehouse_id,
        i.quantity,
        i.min_quantity,
        p.name as product_name,
        p.category,
        p.sku,
        (
          SELECT COUNT(*) 
          FROM product_batches 
          WHERE product_id = i.product_id AND warehouse_id = i.warehouse_id
        ) as batch_count
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
    return result.rows;
  } catch (error) {
    console.error('Fehler beim Abrufen des Lagerinventars:', error);
    throw new Error('Das Lagerinventar konnte nicht abgerufen werden');
  }
}

/**
 * Holt die Bestandsbewegungen für ein bestimmtes Lager
 * @param warehouseId ID des Lagers
 * @param limit Maximale Anzahl der zurückgegebenen Einträge (optional)
 */
export async function getWarehouseMovements(warehouseId: number, limit = 100) {
  try {
    const query = `
      SELECT 
        m.id,
        m.product_id,
        p.name as product_name,
        m.performed_at,
        m.quantity,
        m.source_type,
        m.source_id,
        m.destination_type,
        m.destination_id,
        m.movement_type,
        m.reference_type,
        m.reason,
        m.notes,
        m.performed_by,
        u.name as performed_by_name
      FROM 
        inventory_movements m
      JOIN 
        products p ON m.product_id = p.id
      LEFT JOIN 
        users u ON m.performed_by = u.id
      WHERE 
        (m.source_type = 'warehouse' AND m.source_id = $1) OR
        (m.destination_type = 'warehouse' AND m.destination_id = $1)
      ORDER BY 
        m.performed_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [warehouseId, limit]);
    return result.rows;
  } catch (error) {
    console.error('Fehler beim Abrufen der Lagerbestandsbewegungen:', error);
    throw new Error('Die Bestandsbewegungen konnten nicht abgerufen werden');
  }
}

/**
 * Synchronisiert den Bestand zwischen einem Automaten und seinem zugeordneten Lager
 * @param machineId ID des Automaten
 */
export async function syncMachineInventoryWithWarehouse(machineId: number) {
  try {
    // Prüfe zunächst, ob der Automat einem Lager zugeordnet ist
    const assignmentQuery = `
      SELECT warehouse_id 
      FROM machine_warehouse_assignments 
      WHERE machine_id = $1
    `;
    
    const assignmentResult = await db.query(assignmentQuery, [machineId]);
    
    if (assignmentResult.rows.length === 0) {
      throw new Error(`Automat ${machineId} ist keinem Lager zugeordnet`);
    }
    
    const warehouseId = assignmentResult.rows[0].warehouse_id;
    
    // Hole den aktuellen Bestand im Automaten
    const machineInventoryQuery = `
      SELECT product_id, quantity
      FROM machine_inventory
      WHERE machine_id = $1
    `;
    
    const machineInventory = await db.query(machineInventoryQuery, [machineId]);
    
    // Beginne eine Transaktion für den Abgleich
    await db.query('BEGIN');
    
    try {
      // Für jedes Produkt im Automaten
      for (const item of machineInventory.rows) {
        const { product_id, quantity } = item;
        
        // Überprüfe, ob das Produkt im Lagerbestand existiert
        const warehouseItemQuery = `
          SELECT id, quantity 
          FROM inventory_items 
          WHERE warehouse_id = $1 AND product_id = $2
        `;
        
        const warehouseItemResult = await db.query(warehouseItemQuery, [warehouseId, product_id]);
        
        if (warehouseItemResult.rows.length === 0) {
          // Produkt existiert nicht im Lager, erstelle es
          await db.query(
            `INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity) 
             VALUES ($1, $2, 0, 0)`,
            [warehouseId, product_id]
          );
        }
        
        // Schreibe eine Bestandsabgleichsbewegung, wenn nötig
        const discrepancyCheckQuery = `
          SELECT 
            (
              SELECT COALESCE(SUM(quantity), 0) 
              FROM inventory_movements 
              WHERE 
                source_type = 'warehouse' AND 
                source_id = $1 AND 
                destination_type = 'machine' AND 
                destination_id = $2 AND 
                product_id = $3
            ) - 
            (
              SELECT COALESCE(SUM(quantity), 0) 
              FROM inventory_movements 
              WHERE 
                source_type = 'machine' AND 
                source_id = $2 AND 
                destination_type = 'warehouse' AND 
                destination_id = $1 AND 
                product_id = $3
            ) AS theoretical_consumption
        `;
        
        const discrepancyResult = await db.query(discrepancyCheckQuery, [warehouseId, machineId, product_id]);
        const theoreticalConsumption = discrepancyResult.rows[0].theoretical_consumption || 0;
        
        if (theoreticalConsumption > 0) {
          // Es wurden mehr Produkte aus dem Lager entnommen als zurückgebracht,
          // erstelle eine Bestandsabgleichsbewegung
          await db.query(
            `INSERT INTO inventory_movements 
             (product_id, quantity, source_type, source_id, destination_type, destination_id, 
              movement_type, reference_type, reason, performed_at) 
             VALUES ($1, $2, 'machine', $3, 'disposal', 0, 'OUT', 'reconciliation', 'Automatischer Abgleich', NOW())`,
            [product_id, theoreticalConsumption, machineId]
          );
        }
      }
      
      await db.query('COMMIT');
      return { success: true, message: 'Lagerbestand erfolgreich synchronisiert' };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Fehler bei der Synchronisierung des Lagerbestands:', error);
    throw new Error('Der Lagerbestand konnte nicht synchronisiert werden');
  }
}
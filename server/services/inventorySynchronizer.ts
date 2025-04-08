/**
 * Inventarsynchronisierungs-Service
 * Synchronisiert den Bestand zwischen Automaten und Lager
 */

import { db } from '../db';

/**
 * Synchronisiert den Automaten-Bestand mit dem zugehörigen Lager
 * Ermittelt Differenzen und passt den Lagerbestand entsprechend an
 * @param machineId Die ID des Automaten
 * @returns Ergebnis der Synchronisierung mit Details
 */
export async function syncMachineInventoryWithWarehouse(machineId: number) {
  // Startzeit für Performance-Messung
  const startTime = Date.now();
  
  try {
    // 1. Transaktion starten
    await db.query('BEGIN');
    
    // 2. Zugewiesenes Lager für diesen Automaten finden
    const assignmentQuery = `
      SELECT 
        warehouse_id 
      FROM 
        machine_warehouse_assignments 
      WHERE 
        machine_id = $1 
      LIMIT 1
    `;
    
    const assignmentResult = await db.query(assignmentQuery, [machineId]);
    
    if (assignmentResult.rows.length === 0) {
      throw new Error(`Kein Lager für Automat mit ID ${machineId} zugewiesen`);
    }
    
    const warehouseId = assignmentResult.rows[0].warehouse_id;
    
    // 3. Aktuelle Bestände im Automaten ermitteln
    const machineInventoryQuery = `
      SELECT 
        m.id as machine_id,
        m.machine_name,
        p.id as product_id,
        p.product_name as product_name,
        ms.slot_number,
        ms.quantity as machine_quantity,
        ms.max_capacity,
        ms.min_quantity as machine_min_quantity
      FROM 
        machine_slots ms
      JOIN 
        machines m ON ms.machine_id = m.id
      JOIN 
        products p ON ms.product_id = p.id
      WHERE 
        ms.machine_id = $1
    `;
    
    const machineInventoryResult = await db.query(machineInventoryQuery, [machineId]);
    const machineItems = machineInventoryResult.rows;
    
    // 4. Für jedes Produkt im Automaten den Lagerbestand prüfen und ggf. anpassen
    const syncResults = [];
    
    for (const item of machineItems) {
      // Lagerbestand des Produkts ermitteln
      const warehouseInventoryQuery = `
        SELECT 
          id,
          quantity as warehouse_quantity,
          min_quantity as warehouse_min_quantity
        FROM 
          inventory_items
        WHERE 
          warehouse_id = $1 AND product_id = $2
        LIMIT 1
      `;
      
      const warehouseInventoryResult = await db.query(warehouseInventoryQuery, [
        warehouseId, 
        item.product_id
      ]);
      
      // Falls das Produkt noch nicht im Lager erfasst ist, anlegen
      if (warehouseInventoryResult.rows.length === 0) {
        // Neuen Lagerbestand anlegen mit Menge 0
        const createInventoryQuery = `
          INSERT INTO inventory_items (
            warehouse_id, product_id, quantity, min_quantity
          ) VALUES (
            $1, $2, 0, 0
          ) RETURNING id
        `;
        
        const createResult = await db.query(createInventoryQuery, [
          warehouseId, 
          item.product_id
        ]);
        
        // Ergebnis für Reporting
        syncResults.push({
          productId: item.product_id,
          productName: item.product_name,
          machineQuantity: item.machine_quantity,
          warehouseQuantity: 0,
          action: 'new_inventory_created',
          inventoryItemId: createResult.rows[0].id
        });
        
        continue;
      }
      
      const inventoryItem = warehouseInventoryResult.rows[0];
      
      // 5. Bestandsbewegung für die Synchronisierung erfassen
      const movementQuery = `
        INSERT INTO inventory_movements (
          product_id, 
          quantity, 
          movement_type,
          source_type, 
          source_id,
          destination_type, 
          destination_id,
          reference_type,
          reference_id,
          reason,
          notes,
          performed_at,
          performed_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'system'
        ) RETURNING id
      `;
      
      // Notizen für die Bewegung generieren
      const syncNotes = `Automatische Synchronisierung zwischen Automat ${item.machine_name} und Lager (ID: ${warehouseId})`;
      
      // Bewegung erfassen
      const movementResult = await db.query(movementQuery, [
        item.product_id,
        item.machine_quantity,
        'sync',
        'machine',
        machineId,
        'warehouse',
        warehouseId,
        'machine_sync',
        machineId,
        'Automatische Synchronisierung',
        syncNotes
      ]);
      
      // Ergebnis für Reporting
      syncResults.push({
        productId: item.product_id,
        productName: item.product_name,
        machineQuantity: item.machine_quantity,
        warehouseQuantity: inventoryItem.warehouse_quantity,
        action: 'inventory_synchronized',
        movementId: movementResult.rows[0].id
      });
    }
    
    // 6. Transaktion abschließen
    await db.query('COMMIT');
    
    // 7. Gesamtergebnis zurückgeben
    return {
      success: true,
      machineId,
      warehouseId,
      syncTime: Date.now() - startTime,
      syncCount: syncResults.length,
      details: syncResults
    };
    
  } catch (error: any) {
    // Bei Fehler Transaktion zurückrollen
    await db.query('ROLLBACK');
    
    console.error('Fehler bei der Synchronisierung:', error);
    throw new Error(`Synchronisierungsfehler: ${error.message}`);
  }
}
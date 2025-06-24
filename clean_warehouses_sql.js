/**
 * Skript zur Bereinigung und intelligenten Neusynchronisierung der Lagerbestände
 * Dieses Skript verwendet SQL-Abfragen, um Lagerbestände zu bereinigen und
 * nur die Produkte hinzuzufügen, die mit den Automaten verbunden sind.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Löscht alle Lagerbestände für ein bestimmtes Lager
 */
async function clearWarehouseInventory(warehouseId) {
  console.log(`Lösche alle Bestandseinträge für Lager ${warehouseId}...`);
  
  const result = await pool.query(
    'DELETE FROM inventory_items WHERE warehouse_id = $1 RETURNING *',
    [warehouseId]
  );
  
  console.log(`${result.rowCount} Bestandseinträge wurden gelöscht.`);
  return result.rowCount;
}

/**
 * Synchronisiert intelligentes für ein bestimmtes Lager
 * basierend auf den verknüpften Automaten und deren Produkten
 */
async function syncWarehouseInventory(warehouseId) {
  console.log(`Synchronisiere Lager ${warehouseId}...`);
  
  // SQL-Abfrage, um Produkte zu ermitteln, die mit Automaten des Lagers verbunden sind
  const query = `
    WITH warehouse_machines AS (
      -- Automaten für das Lager ermitteln
      SELECT machine_id 
      FROM machine_warehouse_assignments 
      WHERE warehouse_id = $1
    ),
    slot_products AS (
      -- Produkte aus Automaten-Slots
      SELECT DISTINCT p.id, p.product_name
      FROM products p
      JOIN vendon_product_slots vps ON p.vendon_id = vps.product_id::text
      JOIN warehouse_machines wm ON vps.machine_id = wm.machine_id
    ),
    transaction_products AS (
      -- Produkte aus Transaktionen
      SELECT DISTINCT p.id, p.product_name
      FROM products p
      JOIN vendon_transactions vt ON 
        (vt.product_id::text = p.vendon_id OR 
         vt.product_name = p.product_name OR
         vt.name = p.product_name)
      JOIN warehouse_machines wm ON vt.machine_id = wm.machine_id
    ),
    all_products AS (
      -- Alle Produkte vereinigen
      SELECT id, product_name FROM slot_products
      UNION
      SELECT id, product_name FROM transaction_products
    )
    -- Nur Produkte einfügen, die noch nicht im Lager sind
    INSERT INTO inventory_items 
      (warehouse_id, product_id, quantity, min_quantity, reorder_point, status, created_at, updated_at)
    SELECT 
      $1, ap.id, 0, 0, 0, 'active', NOW(), NOW()
    FROM all_products ap
    LEFT JOIN inventory_items ii ON ii.warehouse_id = $1 AND ii.product_id = ap.id
    WHERE ii.id IS NULL
    RETURNING product_id;
  `;
  
  const result = await pool.query(query, [warehouseId]);
  
  console.log(`${result.rowCount} neue Produkte wurden dem Lager ${warehouseId} hinzugefügt.`);
  
  // Detaillierte Information, welche Produkte hinzugefügt wurden
  if (result.rowCount > 0) {
    const productIds = result.rows.map(row => row.product_id).join(',');
    const productsQuery = `
      SELECT id, product_name 
      FROM products 
      WHERE id IN (${productIds})
    `;
    
    const productsResult = await pool.query(productsQuery);
    console.log('Hinzugefügte Produkte:');
    productsResult.rows.forEach(product => {
      console.log(`- ${product.product_name} (ID: ${product.id})`);
    });
  }
  
  return result.rowCount;
}

/**
 * Bereinigt und synchronisiert ein einzelnes Lager
 */
async function cleanAndSyncWarehouse(warehouseId) {
  try {
    console.log(`=== Bereinigung und Neusynchronisierung für Lager ${warehouseId} ===`);
    
    // Lagerbestand löschen
    const deletedCount = await clearWarehouseInventory(warehouseId);
    
    // Neusynchronisierung durchführen
    const addedCount = await syncWarehouseInventory(warehouseId);
    
    console.log(`=== Zusammenfassung für Lager ${warehouseId} ===`);
    console.log(`- ${deletedCount} Bestandseinträge wurden gelöscht`);
    console.log(`- ${addedCount} Produkte wurden neu hinzugefügt`);
    console.log('Bereinigung und Neusynchronisierung erfolgreich abgeschlossen.');
    
    return { success: true, deletedCount, addedCount };
  } catch (error) {
    console.error(`Fehler bei der Bereinigung von Lager ${warehouseId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Holt eine Liste aller aktiven Lager
 */
async function getAllWarehouses() {
  try {
    const result = await pool.query(
      "SELECT id, name FROM warehouses WHERE status = 'active' ORDER BY id"
    );
    return result.rows;
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager:', error);
    return [];
  }
}

/**
 * Bereinigt und synchronisiert alle Lager
 */
async function cleanAndSyncAllWarehouses() {
  try {
    console.log('=== Bereinigung und Neusynchronisierung aller Lager ===');
    
    // Alle Lager abrufen
    const warehouses = await getAllWarehouses();
    console.log(`${warehouses.length} aktive Lager gefunden.`);
    
    if (warehouses.length === 0) {
      console.log('Keine Lager zum Bereinigen gefunden.');
      return { success: true, message: 'Keine Lager gefunden.' };
    }
    
    // Statistik für die Zusammenfassung
    const results = [];
    
    // Jedes Lager einzeln verarbeiten
    for (const warehouse of warehouses) {
      console.log(`\n----- Verarbeite Lager ${warehouse.id}: ${warehouse.name} -----`);
      const result = await cleanAndSyncWarehouse(warehouse.id);
      results.push({
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        ...result
      });
    }
    
    // Zusammenfassung ausgeben
    console.log('\n=== Zusammenfassung ===');
    console.log(`Gesamt: ${warehouses.length} Lager`);
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`Erfolgreiche Bereinigungen: ${successCount}`);
    console.log(`Fehlgeschlagene Bereinigungen: ${failureCount}`);
    console.log('Bereinigung und Neusynchronisierung aller Lager abgeschlossen.');
    
    return { success: true, results };
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    return { success: false, error: error.message };
  } finally {
    // Verbindung schließen
    await pool.end();
  }
}

// Haupt-Einstiegspunkt für das Skript
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'all') {
    // Alle Lager bereinigen
    await cleanAndSyncAllWarehouses();
  } else {
    // Einzelnes Lager bereinigen
    const warehouseId = parseInt(args[0]);
    
    if (isNaN(warehouseId)) {
      console.error('Ungültige Lager-ID. Bitte geben Sie eine Zahl an oder "all" für alle Lager.');
      process.exit(1);
    }
    
    await cleanAndSyncWarehouse(warehouseId);
  }
}

// Skript ausführen
main().catch(error => {
  console.error('Schwerwiegender Fehler:', error);
  process.exit(1);
});
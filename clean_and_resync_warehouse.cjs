/**
 * Dieses Skript löscht alle Lagerbestände für ein bestimmtes Lager und führt dann
 * eine saubere Neusynchronisierung durch, bei der nur die tatsächlich benötigten
 * Produkte basierend auf den zugeordneten Automaten hinzugefügt werden.
 * 
 * Verwendung: node clean_and_resync_warehouse.cjs [warehouseId]
 * Beispiel: node clean_and_resync_warehouse.cjs 4
 */

const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Helper-Funktion zum Normalisieren von Produktnamen für den Vergleich
 */
function normalizeProductName(name) {
  if (!name) return '';
  
  // Normalisieren: Alles Kleinbuchstaben, keine Sonderzeichen, keine doppelten Leerzeichen
  return name
    .toLowerCase()
    .replace(/['']/g, '') // Apostrophe entfernen
    .replace(/\./g, '') // Punkte entfernen
    .replace(/,/g, '') // Kommas entfernen
    .replace(/\s+/g, ' ') // Mehrfache Leerzeichen durch ein einzelnes ersetzen
    .trim();
}

/**
 * Löscht alle Bestandseinträge für ein bestimmtes Lager
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
 * Ermittelt alle Automaten, die mit einem bestimmten Lager verknüpft sind
 */
async function getMachinesForWarehouse(warehouseId) {
  const result = await pool.query(
    'SELECT machine_id FROM machine_warehouse_assignments WHERE warehouse_id = $1',
    [warehouseId]
  );
  
  return result.rows.map(row => row.machine_id);
}

/**
 * Ermittelt alle Produkte, die in einem bestimmten Automaten verwendet werden
 */
async function getProductsForMachine(machineId) {
  const result = await pool.query(`
    SELECT DISTINCT p.id, p.name, p.normalized_name
    FROM products p
    JOIN vendon_product_slots vps ON p.vendon_product_id = vps.product_id
    WHERE vps.machine_id = $1
  `, [machineId]);
  
  return result.rows;
}

/**
 * Ermittelt alle Produkte aus Transaktionen für einen bestimmten Automaten
 */
async function getProductsFromTransactions(machineId) {
  const result = await pool.query(`
    SELECT DISTINCT p.id, p.name, p.normalized_name
    FROM products p
    JOIN vendon_transactions vt ON 
      (vt.product_id = p.vendon_product_id OR 
       vt.product_name = p.name OR 
       vt.name = p.name)
    WHERE vt.machine_id = $1
  `, [machineId]);
  
  return result.rows;
}

/**
 * Fügt ein Produkt zum Lagerbestand hinzu, wenn es noch nicht vorhanden ist
 */
async function addProductToInventory(warehouseId, productId, productName) {
  try {
    // Überprüfen, ob der Eintrag bereits existiert
    const existingResult = await pool.query(
      'SELECT id FROM inventory_items WHERE warehouse_id = $1 AND product_id = $2',
      [warehouseId, productId]
    );
    
    if (existingResult.rowCount > 0) {
      console.log(`Produkt ${productName} (ID: ${productId}) ist bereits im Lager ${warehouseId} vorhanden.`);
      return false;
    }
    
    // Neuen Eintrag erstellen
    await pool.query(`
      INSERT INTO inventory_items 
        (warehouse_id, product_id, quantity, min_quantity, reorder_point, status, created_at, updated_at)
      VALUES 
        ($1, $2, 0, 0, 0, 'active', NOW(), NOW())
    `, [warehouseId, productId]);
    
    console.log(`Produkt ${productName} (ID: ${productId}) wurde dem Lager ${warehouseId} hinzugefügt.`);
    return true;
  } catch (error) {
    console.error(`Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, error);
    return false;
  }
}

/**
 * Findet ein Produkt anhand des normalisierten Namens
 */
async function findProductByNormalizedName(normalizedName) {
  const result = await pool.query(
    'SELECT id, name FROM products WHERE normalized_name = $1 LIMIT 1',
    [normalizedName]
  );
  
  return result.rows[0] || null;
}

/**
 * Führt eine intelligente Synchronisierung für ein Lager durch, basierend auf den verknüpften Automaten
 */
async function syncProductsForWarehouse(warehouseId) {
  console.log(`Starte Synchronisierung für Lager ${warehouseId}...`);
  
  // 1. Alle Automaten für das Lager ermitteln
  const machineIds = await getMachinesForWarehouse(warehouseId);
  console.log(`${machineIds.length} Automaten sind mit dem Lager ${warehouseId} verknüpft.`);
  
  if (machineIds.length === 0) {
    console.log(`Keine Automaten für Lager ${warehouseId} gefunden. Synchronisierung übersprungen.`);
    return 0;
  }
  
  // Für die Verfolgung bereits hinzugefügter Produkte
  const addedProducts = new Set();
  let addedCount = 0;
  
  // 2. Für jeden Automaten die Produkte ermitteln und zum Lager hinzufügen
  for (const machineId of machineIds) {
    console.log(`Verarbeite Automat ${machineId}...`);
    
    // 2.1 Produkte aus Automaten-Slots
    const slotProducts = await getProductsForMachine(machineId);
    console.log(`${slotProducts.length} Produkte in Slots des Automaten ${machineId} gefunden.`);
    
    for (const product of slotProducts) {
      // Nur hinzufügen, wenn noch nicht geschehen
      if (!addedProducts.has(product.id)) {
        const added = await addProductToInventory(warehouseId, product.id, product.name);
        if (added) addedCount++;
        addedProducts.add(product.id);
      }
    }
    
    // 2.2 Produkte aus Transaktionen
    const transactionProducts = await getProductsFromTransactions(machineId);
    console.log(`${transactionProducts.length} Produkte in Transaktionen des Automaten ${machineId} gefunden.`);
    
    for (const product of transactionProducts) {
      // Nur hinzufügen, wenn noch nicht geschehen
      if (!addedProducts.has(product.id)) {
        const added = await addProductToInventory(warehouseId, product.id, product.name);
        if (added) addedCount++;
        addedProducts.add(product.id);
      }
    }
  }
  
  console.log(`Synchronisierung für Lager ${warehouseId} abgeschlossen. ${addedCount} neue Produkte wurden hinzugefügt.`);
  return addedCount;
}

/**
 * Hauptfunktion zum Bereinigen und Neusynchronisieren eines Lagers
 */
async function cleanAndResyncWarehouse(warehouseId) {
  try {
    console.log(`=== Bereinigung und Neusynchronisierung für Lager ${warehouseId} ===`);
    
    // Lagerbestand löschen
    const deletedCount = await clearWarehouseInventory(warehouseId);
    
    if (deletedCount > 0 || true) {
      // Neusynchronisierung durchführen
      const addedCount = await syncProductsForWarehouse(warehouseId);
      
      console.log(`=== Zusammenfassung für Lager ${warehouseId} ===`);
      console.log(`- ${deletedCount} Bestandseinträge wurden gelöscht`);
      console.log(`- ${addedCount} Produkte wurden neu hinzugefügt`);
      console.log('Bereinigung und Neusynchronisierung erfolgreich abgeschlossen.');
    } else {
      console.log(`Keine Bestandseinträge für Lager ${warehouseId} gefunden. Neusynchronisierung übersprungen.`);
    }
  } catch (error) {
    console.error('Fehler bei der Bereinigung und Neusynchronisierung:', error);
  } finally {
    // Verbindung schließen
    await pool.end();
  }
}

// Hauptprogramm
async function main() {
  // Warenhaus-ID aus Kommandozeilenargumenten lesen
  const args = process.argv.slice(2);
  let warehouseId = args[0];
  
  if (!warehouseId) {
    console.error('Bitte geben Sie eine Lager-ID an.');
    console.log('Verwendung: node clean_and_resync_warehouse.cjs [warehouseId]');
    console.log('Beispiel: node clean_and_resync_warehouse.cjs 4');
    process.exit(1);
  }
  
  warehouseId = parseInt(warehouseId);
  
  if (isNaN(warehouseId)) {
    console.error('Ungültige Lager-ID. Bitte geben Sie eine Zahl an.');
    process.exit(1);
  }
  
  // Lager bereinigen und neu synchronisieren
  await cleanAndResyncWarehouse(warehouseId);
}

// Skript ausführen
main().catch(error => {
  console.error('Unerwarteter Fehler:', error);
  process.exit(1);
});
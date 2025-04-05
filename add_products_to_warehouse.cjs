/**
 * Skript zum manuellen Hinzufügen von Produkten zu einem Lager
 * 
 * Dieses Skript fügt eine Liste von Produkten basierend auf ihren IDs
 * zu einem bestimmten Lager hinzu. Es wird die createInventoryItem-Methode
 * des Datenbank-Speichers verwenden.
 */

// SQL für direkte Datenbank-Abfragen
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Führt eine SQL-Abfrage aus und gibt die Ergebnisse zurück
 */
async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Fügt ein Produkt zum angegebenen Lager hinzu
 */
async function addProductToWarehouse(productId, warehouseId) {
  try {
    // Überprüfen, ob das Produkt existiert
    const productResult = await executeQuery(
      'SELECT * FROM products WHERE id = $1',
      [productId]
    );
    
    if (productResult.rows.length === 0) {
      console.error(`Produkt mit ID ${productId} nicht gefunden`);
      return null;
    }
    
    const product = productResult.rows[0];
    
    // Überprüfen, ob das Lager existiert
    const warehouseResult = await executeQuery(
      'SELECT * FROM warehouses WHERE id = $1',
      [warehouseId]
    );
    
    if (warehouseResult.rows.length === 0) {
      console.error(`Lager mit ID ${warehouseId} nicht gefunden`);
      return null;
    }
    
    const warehouse = warehouseResult.rows[0];
    
    // Überprüfen, ob das Produkt bereits im Lager existiert
    const existingItemResult = await executeQuery(
      'SELECT * FROM inventory_items WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId]
    );
    
    if (existingItemResult.rows.length > 0) {
      console.log(`Produkt "${product.product_name}" (ID: ${productId}) existiert bereits im Lager ${warehouseId} (${warehouse.name})`);
      return existingItemResult.rows[0];
    }
    
    // Datum für created_at und updated_at
    const now = new Date();
    
    // Inventareintrag erstellen
    const insertResult = await executeQuery(
      `INSERT INTO inventory_items 
      (warehouse_id, product_id, quantity, min_quantity, status, notes, created_at, updated_at, last_count_date) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *`,
      [
        warehouseId, 
        productId, 
        0, // Standardmenge
        5, // Minimalbestand
        'active', // Status
        `Manuell hinzugefügt am ${now.toISOString().split('T')[0]}`, // Notizen
        now, // created_at
        now, // updated_at
        now  // last_count_date
      ]
    );
    
    if (insertResult.rows.length > 0) {
      const newItem = insertResult.rows[0];
      console.log(`Produkt "${product.product_name}" (ID: ${productId}) erfolgreich zu Lager ${warehouseId} (${warehouse.name}) hinzugefügt mit ID ${newItem.id}`);
      return newItem;
    } else {
      console.error(`Fehler beim Erstellen des Inventareintrags für Produkt "${product.product_name}" (ID: ${productId}) in Lager ${warehouseId} (${warehouse.name})`);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, error);
    console.error(error.stack || error);
    return null;
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const warehouseId = process.argv[2] || 4; // Standard ist Lager mit ID 4
  
  // Die Produkt-IDs, die hinzugefügt werden sollen
  // Wenn über die Kommandozeile zusätzliche IDs angegeben wurden, verwende diese
  let productIds = [5, 6, 7, 8, 9, 10]; // Beispiel-IDs
  
  if (process.argv.length > 3) {
    // Alle weiteren Parameter als Produkt-IDs interpretieren
    productIds = process.argv.slice(3).map(id => parseInt(id));
  }
  
  console.log(`Starte Hinzufügen von ${productIds.length} Produkten zum Lager ${warehouseId}...`);
  
  // Verarbeitung aller Produkte
  let added = 0;
  let errors = 0;
  
  for (const productId of productIds) {
    const result = await addProductToWarehouse(productId, warehouseId);
    if (result) {
      added++;
    } else {
      errors++;
    }
  }
  
  console.log(`\nZusammenfassung:`);
  console.log(`- ${added} Produkte erfolgreich hinzugefügt`);
  console.log(`- ${errors} Fehler aufgetreten`);
  console.log(`\nFertig!`);
  
  // Verbindung schließen
  process.exit(0);
}

// Ausführen des Skripts
main().catch(error => {
  console.error("Kritischer Fehler:", error);
  process.exit(1);
});
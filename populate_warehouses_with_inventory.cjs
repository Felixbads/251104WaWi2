/**
 * Umfassendes Skript zum Befüllen aller Lager mit Beispielprodukten, Mengen und Chargen
 * 
 * Dieses Skript:
 * - Holt alle verfügbaren Lager und Produkte
 * - Fügt für jedes Lager eine Auswahl von Produkten hinzu
 * - Erstellt für jedes Produkt mehrere Chargen mit unterschiedlichen MHD-Daten
 * - Setzt realistische Mengen und Bestände
 */

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
 * Generiert ein zufälliges Datum in der Zukunft (für MHD)
 */
function generateRandomExpiryDate() {
  const today = new Date();
  const daysInFuture = Math.floor(Math.random() * 365) + 30; // 30-395 Tage in der Zukunft
  const expiryDate = new Date(today);
  expiryDate.setDate(today.getDate() + daysInFuture);
  return expiryDate.toISOString().split('T')[0]; // YYYY-MM-DD Format
}

/**
 * Generiert ein zufälliges Eingangsdatum (zwischen heute und 30 Tage zurück)
 */
function generateRandomReceivedDate() {
  const today = new Date();
  const daysBack = Math.floor(Math.random() * 30); // 0-30 Tage zurück
  const receivedDate = new Date(today);
  receivedDate.setDate(today.getDate() - daysBack);
  return receivedDate.toISOString().split('T')[0];
}

/**
 * Generiert eine zufällige Chargennummer
 */
function generateBatchNumber(productId, index) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return `CHG-${year}${month}-P${productId}-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Fügt ein Produkt zu einem Lager hinzu (inventory_items)
 */
async function addInventoryItem(productId, warehouseId, totalQuantity) {
  try {
    // Überprüfen, ob bereits vorhanden
    const existingResult = await executeQuery(
      'SELECT * FROM inventory_items WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId]
    );
    
    if (existingResult.rows.length > 0) {
      // Update der Menge
      await executeQuery(
        'UPDATE inventory_items SET quantity = $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3',
        [totalQuantity, productId, warehouseId]
      );
      return existingResult.rows[0].id;
    } else {
      // Neuer Eintrag
      const insertResult = await executeQuery(
        `INSERT INTO inventory_items 
        (warehouse_id, product_id, quantity, min_quantity, max_quantity, reorder_point, status, created_at, updated_at, last_count_date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW()) 
        RETURNING id`,
        [
          warehouseId, 
          productId, 
          totalQuantity, 
          Math.max(5, Math.floor(totalQuantity * 0.2)), // 20% des Bestandes als Minimum
          totalQuantity * 2, // Doppelte Menge als Maximum
          Math.max(10, Math.floor(totalQuantity * 0.3)), // 30% als Nachbestellpunkt
          'active'
        ]
      );
      return insertResult.rows[0].id;
    }
  } catch (error) {
    console.error(`Fehler beim Hinzufügen von Inventory Item (Produkt ${productId}, Lager ${warehouseId}):`, error.message);
    return null;
  }
}

/**
 * Erstellt eine Produktcharge (inventory_batches)
 */
async function createInventoryBatch(warehouseId, productId, quantity, batchNumber) {
  try {
    const expiryDate = generateRandomExpiryDate();
    const receivedDate = generateRandomReceivedDate();
    
    // Überprüfen, ob Charge bereits existiert
    const existingResult = await executeQuery(
      'SELECT * FROM inventory_batches WHERE batch_number = $1 AND product_id = $2 AND warehouse_id = $3',
      [batchNumber, productId, warehouseId]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`  Charge ${batchNumber} existiert bereits, überspringe...`);
      return existingResult.rows[0].id;
    }
    
    const insertResult = await executeQuery(
      `INSERT INTO inventory_batches 
      (warehouse_id, product_id, quantity, batch_number, expiry_date, incoming_date, status, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) 
      RETURNING id`,
      [
        warehouseId,
        productId,
        quantity,
        batchNumber,
        expiryDate,
        receivedDate,
        'active'
      ]
    );
    
    console.log(`    ✓ Charge ${batchNumber}: ${quantity} Stück (MHD: ${expiryDate})`);
    return insertResult.rows[0].id;
  } catch (error) {
    console.error(`Fehler beim Erstellen der Charge ${batchNumber}:`, error.message);
    return null;
  }
}

/**
 * Befüllt ein Lager mit Produkten und Chargen
 */
async function populateWarehouse(warehouse, products) {
  console.log(`\n🏭 Befülle Lager: ${warehouse.name} (ID: ${warehouse.id})`);
  
  // Auswahl von 30-50% der verfügbaren Produkte für dieses Lager
  const selectedProducts = products
    .sort(() => 0.5 - Math.random()) // Zufällige Reihenfolge
    .slice(0, Math.floor(products.length * (0.3 + Math.random() * 0.2))); // 30-50%
  
  console.log(`  📦 Füge ${selectedProducts.length} von ${products.length} verfügbaren Produkten hinzu`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const product of selectedProducts) {
    try {
      // Zufällige Gesamtmenge für dieses Produkt (10-200 Stück)
      const totalQuantity = Math.floor(Math.random() * 190) + 10;
      
      // Inventory Item erstellen/aktualisieren
      const inventoryItemId = await addInventoryItem(product.id, warehouse.id, totalQuantity);
      
      if (!inventoryItemId) {
        errorCount++;
        continue;
      }
      
      console.log(`  📋 ${product.product_name} (${totalQuantity} Stück gesamt)`);
      
      // 2-4 Chargen pro Produkt erstellen
      const batchCount = Math.floor(Math.random() * 3) + 2; // 2-4 Chargen
      let remainingQuantity = totalQuantity;
      
      for (let i = 0; i < batchCount && remainingQuantity > 0; i++) {
        const batchQuantity = i === batchCount - 1 
          ? remainingQuantity // Letzte Charge bekommt den Rest
          : Math.floor(remainingQuantity / (batchCount - i)) + Math.floor(Math.random() * 10) - 5;
        
        const actualBatchQuantity = Math.max(1, Math.min(batchQuantity, remainingQuantity));
        const batchNumber = generateBatchNumber(product.id, i);
        
        const batchId = await createInventoryBatch(
          warehouse.id, 
          product.id, 
          actualBatchQuantity, 
          batchNumber
        );
        
        if (batchId) {
          remainingQuantity -= actualBatchQuantity;
        }
      }
      
      successCount++;
    } catch (error) {
      console.error(`  ❌ Fehler bei Produkt ${product.product_name}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`  ✅ ${successCount} Produkte erfolgreich hinzugefügt, ${errorCount} Fehler`);
}

/**
 * Hauptfunktion
 */
async function main() {
  try {
    console.log('🚀 Starte umfassendes Lager-Befüllung...\n');
    
    // Alle Lager abrufen
    const warehousesResult = await executeQuery('SELECT * FROM warehouses WHERE is_active = true ORDER BY name');
    const warehouses = warehousesResult.rows;
    
    console.log(`📋 Gefundene Lager: ${warehouses.length}`);
    warehouses.forEach(w => console.log(`  - ${w.name} (ID: ${w.id})`));
    
    // Alle Produkte abrufen
    const productsResult = await executeQuery(`
      SELECT id, vendon_id, product_name, supplier_name, category, price 
      FROM products 
      WHERE status IS NULL OR status != 'inactive' 
      ORDER BY product_name
    `);
    const products = productsResult.rows;
    
    console.log(`\n📦 Gefundene Produkte: ${products.length}`);
    
    // Jedes Lager befüllen
    for (const warehouse of warehouses) {
      await populateWarehouse(warehouse, products);
    }
    
    // Zusammenfassung erstellen
    console.log('\n📊 Erstellte Zusammenfassung:');
    
    const summaryResult = await executeQuery(`
      SELECT 
        w.name as warehouse_name,
        COUNT(DISTINCT ii.product_id) as unique_products,
        SUM(ii.quantity) as total_quantity,
        COUNT(ib.id) as total_batches
      FROM warehouses w
      LEFT JOIN inventory_items ii ON w.id = ii.warehouse_id
      LEFT JOIN inventory_batches ib ON w.id = ib.warehouse_id
      WHERE w.is_active = true
      GROUP BY w.id, w.name
      ORDER BY w.name
    `);
    
    for (const row of summaryResult.rows) {
      console.log(`  🏭 ${row.warehouse_name}:`);
      console.log(`     - ${row.unique_products || 0} verschiedene Produkte`);
      console.log(`     - ${row.total_quantity || 0} Stück Gesamtbestand`);
      console.log(`     - ${row.total_batches || 0} Chargen`);
    }
    
    console.log('\n✅ Lager-Befüllung abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Skript ausführen
main().catch(error => {
  console.error("❌ Unbehandelter Fehler:", error);
  process.exit(1);
});
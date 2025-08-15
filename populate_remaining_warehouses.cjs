/**
 * Verbessertes Skript zum Befüllen der verbleibenden Lager
 * - Realistischere Mengen
 * - Weniger Chargen pro Produkt (max 3)
 * - Nur die Lager befüllen, die noch leer sind
 */

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

function generateRandomExpiryDate() {
  const today = new Date();
  const daysInFuture = Math.floor(Math.random() * 180) + 30; // 30-210 Tage
  const expiryDate = new Date(today);
  expiryDate.setDate(today.getDate() + daysInFuture);
  return expiryDate.toISOString().split('T')[0];
}

function generateRandomReceivedDate() {
  const today = new Date();
  const daysBack = Math.floor(Math.random() * 15); // 0-15 Tage zurück
  const receivedDate = new Date(today);
  receivedDate.setDate(today.getDate() - daysBack);
  return receivedDate.toISOString().split('T')[0];
}

function generateBatchNumber(productId, warehouseId, index) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return `W${warehouseId}-P${productId}-${year}${month}-${String(index + 1).padStart(2, '0')}`;
}

async function populateWarehouse(warehouse, products) {
  console.log(`\n🏭 Befülle Lager: ${warehouse.name} (ID: ${warehouse.id})`);
  
  // Auswahl von 40-60% der verfügbaren Produkte
  const selectedProducts = products
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.floor(products.length * (0.4 + Math.random() * 0.2)));
  
  console.log(`  📦 Füge ${selectedProducts.length} Produkte hinzu`);
  
  let successCount = 0;
  
  for (const product of selectedProducts) {
    try {
      // Realistische Gesamtmenge (5-80 Stück)
      const totalQuantity = Math.floor(Math.random() * 75) + 5;
      
      // Inventory Item erstellen
      await executeQuery(
        `INSERT INTO inventory_items 
        (warehouse_id, product_id, quantity, min_quantity, max_quantity, reorder_point, status, created_at, updated_at, last_count_date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
        ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
        quantity = EXCLUDED.quantity, updated_at = NOW()`,
        [
          warehouse.id, 
          product.id, 
          totalQuantity, 
          Math.max(2, Math.floor(totalQuantity * 0.2)),
          totalQuantity * 2,
          Math.max(5, Math.floor(totalQuantity * 0.3)),
          'active'
        ]
      );
      
      // 1-3 Chargen pro Produkt
      const batchCount = Math.floor(Math.random() * 3) + 1; // 1-3 Chargen
      let remainingQuantity = totalQuantity;
      
      for (let i = 0; i < batchCount && remainingQuantity > 0; i++) {
        const batchQuantity = i === batchCount - 1 
          ? remainingQuantity
          : Math.ceil(remainingQuantity / (batchCount - i));
        
        const actualBatchQuantity = Math.min(batchQuantity, remainingQuantity);
        const batchNumber = generateBatchNumber(product.id, warehouse.id, i);
        
        await executeQuery(
          `INSERT INTO inventory_batches 
          (warehouse_id, product_id, quantity, batch_number, expiry_date, incoming_date, status, created_at, updated_at) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (batch_number, product_id, warehouse_id) DO NOTHING`,
          [
            warehouse.id,
            product.id,
            actualBatchQuantity,
            batchNumber,
            generateRandomExpiryDate(),
            generateRandomReceivedDate(),
            'active'
          ]
        );
        
        remainingQuantity -= actualBatchQuantity;
      }
      
      successCount++;
      
      if (successCount % 20 === 0) {
        console.log(`  ✅ ${successCount} Produkte verarbeitet...`);
      }
      
    } catch (error) {
      console.error(`  ❌ Fehler bei Produkt ${product.product_name}:`, error.message);
    }
  }
  
  console.log(`  ✅ ${successCount} Produkte erfolgreich hinzugefügt`);
}

async function main() {
  try {
    console.log('🚀 Starte Befüllung der verbleibenden Lager...\n');
    
    // Nur Lager ohne oder mit wenigen Produkten abrufen
    const warehousesResult = await executeQuery(`
      SELECT w.* 
      FROM warehouses w
      LEFT JOIN inventory_items ii ON w.id = ii.warehouse_id
      WHERE w.is_active = true
      GROUP BY w.id
      HAVING COUNT(ii.id) < 50 OR COUNT(ii.id) IS NULL
      ORDER BY w.name
    `);
    const warehouses = warehousesResult.rows;
    
    console.log(`📋 Zu befüllende Lager: ${warehouses.length}`);
    warehouses.forEach(w => console.log(`  - ${w.name} (ID: ${w.id})`));
    
    if (warehouses.length === 0) {
      console.log('✅ Alle Lager sind bereits ausreichend befüllt!');
      return;
    }
    
    // Alle Produkte abrufen
    const productsResult = await executeQuery(`
      SELECT id, vendon_id, product_name, supplier_name, category 
      FROM products 
      WHERE status IS NULL OR status != 'inactive' 
      ORDER BY product_name
    `);
    const products = productsResult.rows;
    
    console.log(`📦 Verfügbare Produkte: ${products.length}`);
    
    // Jedes leere Lager befüllen
    for (const warehouse of warehouses) {
      await populateWarehouse(warehouse, products);
    }
    
    // Endgültige Zusammenfassung
    console.log('\n📊 Finale Übersicht:');
    
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
    
    console.log('\n✅ Befüllung abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main().catch(error => {
  console.error("❌ Unbehandelter Fehler:", error);
  process.exit(1);
});
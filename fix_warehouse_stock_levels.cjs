/**
 * Korrektur-Skript für Lagerbestände
 * Stellt sicher, dass jedes Produkt mindestens 100 Stück mit 2-3 Chargen hat
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
  const daysInFuture = Math.floor(Math.random() * 300) + 60; // 60-360 Tage in der Zukunft
  const expiryDate = new Date(today);
  expiryDate.setDate(today.getDate() + daysInFuture);
  return expiryDate.toISOString().split('T')[0];
}

function generateRandomReceivedDate() {
  const today = new Date();
  const daysBack = Math.floor(Math.random() * 30); // 0-30 Tage zurück
  const receivedDate = new Date(today);
  receivedDate.setDate(today.getDate() - daysBack);
  return receivedDate.toISOString().split('T')[0];
}

function generateBatchNumber(warehouseId, productId, index) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  return `W${warehouseId}P${productId}${year}${month}${day}${String(index + 1).padStart(2, '0')}`;
}

async function fixWarehouseStockLevels() {
  console.log('🔧 Starte Korrektur der Lagerbestände...\n');
  
  try {
    // Alle aktiven Lager abrufen
    const warehousesResult = await executeQuery(`
      SELECT id, name FROM warehouses WHERE is_active = true ORDER BY name
    `);
    
    console.log(`📋 Bearbeite ${warehousesResult.rows.length} Lager:\n`);
    
    for (const warehouse of warehousesResult.rows) {
      console.log(`🏭 Korrigiere Lager: ${warehouse.name} (ID: ${warehouse.id})`);
      
      // Alle Produkte in diesem Lager abrufen
      const inventoryResult = await executeQuery(`
        SELECT 
          ii.id as inventory_id,
          ii.product_id,
          ii.quantity as current_quantity,
          p.product_name
        FROM inventory_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.warehouse_id = $1
        ORDER BY p.product_name
      `, [warehouse.id]);
      
      console.log(`  📦 Gefundene Produkte: ${inventoryResult.rows.length}`);
      
      let updatedProducts = 0;
      let addedBatches = 0;
      
      for (const item of inventoryResult.rows) {
        const targetQuantity = Math.floor(Math.random() * 100) + 100; // 100-200 Stück
        
        if (item.current_quantity < 100) {
          // Bestand auf mindestens 100 setzen
          await executeQuery(`
            UPDATE inventory_items 
            SET quantity = $1, updated_at = NOW()
            WHERE id = $2
          `, [targetQuantity, item.inventory_id]);
          
          updatedProducts++;
        }
        
        // Alte Chargen für dieses Produkt löschen
        await executeQuery(`
          DELETE FROM inventory_batches 
          WHERE warehouse_id = $1 AND product_id = $2
        `, [warehouse.id, item.product_id]);
        
        // 2-3 neue Chargen erstellen
        const batchCount = Math.floor(Math.random() * 2) + 2; // 2-3 Chargen
        let remainingQuantity = targetQuantity;
        
        for (let i = 0; i < batchCount; i++) {
          const batchQuantity = i === batchCount - 1 
            ? remainingQuantity // Letzte Charge bekommt den Rest
            : Math.floor(remainingQuantity / (batchCount - i)) + Math.floor(Math.random() * 20) - 10;
          
          const actualBatchQuantity = Math.max(10, Math.min(batchQuantity, remainingQuantity));
          
          if (actualBatchQuantity > 0) {
            const batchNumber = generateBatchNumber(warehouse.id, item.product_id, i);
            
            await executeQuery(`
              INSERT INTO inventory_batches (
                warehouse_id, product_id, quantity, batch_number, 
                expiry_date, incoming_date, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
            `, [
              warehouse.id,
              item.product_id,
              actualBatchQuantity,
              batchNumber,
              generateRandomExpiryDate(),
              generateRandomReceivedDate()
            ]);
            
            remainingQuantity -= actualBatchQuantity;
            addedBatches++;
          }
        }
        
        if (updatedProducts % 50 === 0) {
          console.log(`    ⏳ ${updatedProducts} Produkte aktualisiert...`);
        }
      }
      
      console.log(`  ✅ ${updatedProducts} Produkte aktualisiert, ${addedBatches} Chargen erstellt\n`);
    }
    
    // Finale Zusammenfassung
    console.log('📊 Neue Lagerbestandsübersicht:\n');
    
    const summaryResult = await executeQuery(`
      SELECT 
        w.name as warehouse_name,
        COUNT(DISTINCT ii.product_id) as unique_products,
        SUM(ii.quantity) as total_quantity,
        COUNT(ib.id) as total_batches,
        AVG(ii.quantity)::int as avg_quantity_per_product,
        MIN(ii.quantity) as min_quantity,
        MAX(ii.quantity) as max_quantity
      FROM warehouses w
      LEFT JOIN inventory_items ii ON w.id = ii.warehouse_id
      LEFT JOIN inventory_batches ib ON w.id = ib.warehouse_id AND ib.status = 'active'
      WHERE w.is_active = true
      GROUP BY w.id, w.name
      ORDER BY w.name
    `);
    
    for (const row of summaryResult.rows) {
      console.log(`🏭 ${row.warehouse_name}:`);
      console.log(`   - ${row.unique_products || 0} verschiedene Produkte`);
      console.log(`   - ${row.total_quantity || 0} Stück Gesamtbestand`);
      console.log(`   - ${row.total_batches || 0} aktive Chargen`);
      console.log(`   - Ø ${row.avg_quantity_per_product || 0} Stück/Produkt`);
      console.log(`   - Min/Max: ${row.min_quantity || 0} - ${row.max_quantity || 0} Stück`);
      console.log('');
    }
    
    console.log('✅ Lagerbestandskorrektur erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler bei der Lagerbestandskorrektur:', error);
    console.error(error.stack);
  }
}

async function main() {
  try {
    await fixWarehouseStockLevels();
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
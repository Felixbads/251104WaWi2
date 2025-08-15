/**
 * Schnelle Korrektur der Lagerbestände mit direkten SQL-Updates
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

async function quickFixStockLevels() {
  console.log('⚡ Starte schnelle Lagerbestandskorrektur...\n');
  
  try {
    // 1. Alle inventory_items auf mindestens 100 setzen
    console.log('🔄 Aktualisiere Lagerbestände...');
    const updateResult = await executeQuery(`
      UPDATE inventory_items 
      SET 
        quantity = CASE 
          WHEN quantity < 100 THEN 100 + FLOOR(RANDOM() * 100)
          ELSE quantity
        END,
        updated_at = NOW()
      WHERE quantity < 100
    `);
    console.log(`✅ ${updateResult.rowCount} Produkte auf mindestens 100 Stück aktualisiert`);
    
    // 2. Alte Chargen löschen
    console.log('🗑️ Lösche alte Chargen...');
    await executeQuery(`DELETE FROM inventory_batches WHERE status = 'active'`);
    
    // 3. Neue Chargen für alle Lager-Produkt-Kombinationen erstellen
    console.log('📦 Erstelle neue Chargen...');
    
    const warehousesResult = await executeQuery(`
      SELECT id, name FROM warehouses WHERE is_active = true
    `);
    
    let totalBatches = 0;
    
    for (const warehouse of warehousesResult.rows) {
      console.log(`  🏭 Bearbeite ${warehouse.name}...`);
      
      // Für jedes Produkt in diesem Lager 2-3 Chargen erstellen
      const batchInsertResult = await executeQuery(`
        INSERT INTO inventory_batches (
          warehouse_id, product_id, quantity, batch_number, 
          expiry_date, incoming_date, status, created_at, updated_at
        )
        SELECT 
          $1 as warehouse_id,
          ii.product_id,
          CASE 
            WHEN batch_num = 1 THEN FLOOR(ii.quantity * 0.4)
            WHEN batch_num = 2 THEN FLOOR(ii.quantity * 0.4) 
            ELSE ii.quantity - FLOOR(ii.quantity * 0.4) - FLOOR(ii.quantity * 0.4)
          END as quantity,
          'W' || $1 || 'P' || ii.product_id || '2025' || LPAD(EXTRACT(month FROM NOW())::text, 2, '0') || LPAD(EXTRACT(day FROM NOW())::text, 2, '0') || LPAD(batch_num::text, 2, '0') as batch_number,
          (NOW() + INTERVAL '60 days' + (RANDOM() * INTERVAL '240 days'))::date as expiry_date,
          (NOW() - (RANDOM() * INTERVAL '30 days'))::date as incoming_date,
          'active' as status,
          NOW() as created_at,
          NOW() as updated_at
        FROM inventory_items ii
        CROSS JOIN generate_series(1, 2 + FLOOR(RANDOM() * 2)::int) AS batch_num
        WHERE ii.warehouse_id = $1 AND ii.quantity > 0
      `, [warehouse.id]);
      
      console.log(`    ✅ ${batchInsertResult.rowCount} Chargen erstellt`);
      totalBatches += batchInsertResult.rowCount;
    }
    
    console.log(`\n📊 Gesamt: ${totalBatches} neue Chargen erstellt\n`);
    
    // 4. Finale Zusammenfassung
    console.log('📊 Neue Lagerbestandsübersicht:\n');
    
    const summaryResult = await executeQuery(`
      SELECT 
        w.name as warehouse_name,
        COUNT(DISTINCT ii.product_id) as unique_products,
        SUM(ii.quantity) as total_quantity,
        COUNT(ib.id) as total_batches,
        ROUND(AVG(ii.quantity)) as avg_quantity_per_product,
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
    
    console.log('✅ Schnelle Lagerbestandskorrektur erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler bei der Korrektur:', error);
    console.error(error.stack);
  }
}

async function main() {
  try {
    await quickFixStockLevels();
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
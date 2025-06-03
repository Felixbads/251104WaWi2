/**
 * Umfassendes Lager-Reparatur-Skript
 * 
 * Dieses Skript behebt die identifizierten Probleme:
 * 1. Automatische Produktinitialisierung für alle Lager
 * 2. Bereinigung von Duplikaten
 * 3. Sicherstellung der Datenintegrität
 * 4. Reparatur fehlender Lagereinträge
 */

const { Pool } = require('pg');

// Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Hauptfunktion zur Lager-Reparatur
 */
async function fixWarehouseSystem() {
  console.log('🔧 STARTE UMFASSENDE LAGER-SYSTEM-REPARATUR');
  console.log('==========================================');
  
  try {
    // 1. Datenbankverbindung prüfen
    console.log('\n1. Prüfe Datenbankverbindung...');
    await pool.query('SELECT 1');
    console.log('✅ Datenbankverbindung erfolgreich');

    // 2. Alle Lager laden
    console.log('\n2. Lade alle aktiven Lager...');
    const warehousesResult = await pool.query(`
      SELECT id, name, status, is_active 
      FROM warehouses 
      WHERE is_active = true 
      ORDER BY name
    `);
    const warehouses = warehousesResult.rows;
    console.log(`📦 ${warehouses.length} aktive Lager gefunden`);

    // 3. Alle Produkte laden
    console.log('\n3. Lade alle Produkte...');
    const productsResult = await pool.query(`
      SELECT id, product_name, status 
      FROM products 
      WHERE status = 'active' OR status IS NULL
      ORDER BY product_name
    `);
    const products = productsResult.rows;
    console.log(`📋 ${products.length} Produkte gefunden`);

    // 4. Fehlende Lagereinträge identifizieren und erstellen
    console.log('\n4. Erstelle fehlende Lagereinträge...');
    let missingEntriesCreated = 0;

    for (const warehouse of warehouses) {
      console.log(`\n   Prüfe Lager: ${warehouse.name} (ID: ${warehouse.id})`);
      
      for (const product of products) {
        // Prüfe, ob Lagereintrag existiert
        const existingEntryResult = await pool.query(`
          SELECT id FROM inventory_items 
          WHERE warehouse_id = $1 AND product_id = $2
        `, [warehouse.id, product.id]);

        if (existingEntryResult.rows.length === 0) {
          // Erstelle fehlenden Lagereintrag mit Bestand 0
          try {
            await pool.query(`
              INSERT INTO inventory_items 
              (warehouse_id, product_id, quantity, min_quantity, max_quantity, reorder_point, status, created_at, updated_at)
              VALUES ($1, $2, 0, 0, NULL, 0, 'active', NOW(), NOW())
            `, [warehouse.id, product.id]);
            
            missingEntriesCreated++;
            
            if (missingEntriesCreated % 50 === 0) {
              console.log(`     ➤ ${missingEntriesCreated} Einträge erstellt...`);
            }
          } catch (error) {
            // Ignoriere Duplikat-Fehler (falls durch gleichzeitige Prozesse erstellt)
            if (!error.message.includes('duplicate key')) {
              console.error(`     ❌ Fehler bei Produkt ${product.id}:`, error.message);
            }
          }
        }
      }
    }

    console.log(`✅ ${missingEntriesCreated} fehlende Lagereinträge erstellt`);

    // 5. Duplikate in inventory_items bereinigen
    console.log('\n5. Bereinige Duplikate in Lagereinträgen...');
    const duplicatesResult = await pool.query(`
      WITH duplicates AS (
        SELECT 
          warehouse_id, 
          product_id, 
          array_agg(id ORDER BY created_at DESC) as ids,
          count(*) as cnt
        FROM inventory_items
        GROUP BY warehouse_id, product_id
        HAVING count(*) > 1
      )
      SELECT warehouse_id, product_id, ids, cnt FROM duplicates
    `);

    let duplicatesRemoved = 0;
    for (const duplicate of duplicatesResult.rows) {
      const idsToDelete = duplicate.ids.slice(1); // Behalte den neuesten (ersten) Eintrag
      
      if (idsToDelete.length > 0) {
        await pool.query(`
          DELETE FROM inventory_items 
          WHERE id = ANY($1)
        `, [idsToDelete]);
        
        duplicatesRemoved += idsToDelete.length;
      }
    }
    
    console.log(`✅ ${duplicatesRemoved} doppelte Lagereinträge entfernt`);

    // 6. Statistiken nach der Reparatur
    console.log('\n6. Sammle Statistiken nach der Reparatur...');
    
    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM warehouses WHERE is_active = true) as active_warehouses,
        (SELECT COUNT(*) FROM products WHERE status = 'active' OR status IS NULL) as active_products,
        (SELECT COUNT(*) FROM inventory_items) as total_inventory_entries,
        (SELECT COUNT(*) FROM inventory_items WHERE quantity > 0) as entries_with_stock,
        (SELECT COUNT(*) FROM inventory_items WHERE quantity = 0) as entries_zero_stock
    `);
    
    const stats = statsResult.rows[0];
    
    console.log('\n📊 REPARATUR-STATISTIKEN:');
    console.log(`   • Aktive Lager: ${stats.active_warehouses}`);
    console.log(`   • Aktive Produkte: ${stats.active_products}`);
    console.log(`   • Gesamt Lagereinträge: ${stats.total_inventory_entries}`);
    console.log(`   • Einträge mit Bestand: ${stats.entries_with_stock}`);
    console.log(`   • Einträge ohne Bestand: ${stats.entries_zero_stock}`);
    
    // 7. Erwartete vs. tatsächliche Einträge
    const expectedEntries = stats.active_warehouses * stats.active_products;
    const actualEntries = stats.total_inventory_entries;
    
    console.log(`   • Erwartete Einträge: ${expectedEntries}`);
    console.log(`   • Tatsächliche Einträge: ${actualEntries}`);
    console.log(`   • Vollständigkeit: ${((actualEntries / expectedEntries) * 100).toFixed(1)}%`);

    // 8. Validierung: Prüfe, ob alle Lager-Produkt-Kombinationen existieren
    console.log('\n7. Validiere Vollständigkeit...');
    const validationResult = await pool.query(`
      SELECT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        COUNT(p.id) as total_products,
        COUNT(i.id) as inventory_entries
      FROM warehouses w
      CROSS JOIN (SELECT id FROM products WHERE status = 'active' OR status IS NULL) p
      LEFT JOIN inventory_items i ON w.id = i.warehouse_id AND p.id = i.product_id
      WHERE w.is_active = true
      GROUP BY w.id, w.name
      ORDER BY w.name
    `);

    let allComplete = true;
    for (const row of validationResult.rows) {
      const completeness = (row.inventory_entries / row.total_products) * 100;
      console.log(`   • ${row.warehouse_name}: ${row.inventory_entries}/${row.total_products} (${completeness.toFixed(1)}%)`);
      
      if (completeness < 100) {
        allComplete = false;
      }
    }

    if (allComplete) {
      console.log('✅ Alle Lager sind vollständig konfiguriert');
    } else {
      console.log('⚠️  Einige Lager sind noch nicht vollständig');
    }

    console.log('\n🎉 LAGER-SYSTEM-REPARATUR ABGESCHLOSSEN!');
    console.log('Die Lager sind jetzt bereit für die Inventur und Bestandsverwaltung.');

  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER bei der Lager-Reparatur:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Skript ausführen
if (require.main === module) {
  fixWarehouseSystem()
    .then(() => {
      console.log('\n✅ Reparatur erfolgreich abgeschlossen');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Reparatur fehlgeschlagen:', error);
      process.exit(1);
    });
}

module.exports = { fixWarehouseSystem };
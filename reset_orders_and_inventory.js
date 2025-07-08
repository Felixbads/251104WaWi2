
/**
 * Skript zum Löschen aller Bestellungen und Auffüllen aller Lager
 * mit 150 Stück von jedem aktiven Produkt, das in Automaten verkauft wird
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';

// Datenbankverbindung
const db = createClient({
  url: process.env.DATABASE_URL || 'file:./local.db',
});

async function resetOrdersAndInventory() {
  console.log('🚀 Starte Reset der Bestellungen und Lagerauffüllung...');
  
  try {
    // 1. Alle Bestellungen und Bestellpositionen löschen
    console.log('📦 Lösche alle Bestellungen...');
    
    // Zuerst Bestellpositionen löschen (wegen Foreign Key)
    const orderItemsResult = await db.execute('DELETE FROM order_items');
    console.log(`✅ ${orderItemsResult.rowsAffected} Bestellpositionen gelöscht`);
    
    // Dann Bestellungen löschen
    const ordersResult = await db.execute('DELETE FROM orders');
    console.log(`✅ ${ordersResult.rowsAffected} Bestellungen gelöscht`);
    
    // 2. Alle bestehenden Lagerbestände löschen
    console.log('🗑️ Lösche alle bestehenden Lagerbestände...');
    const inventoryResult = await db.execute('DELETE FROM inventory_items');
    console.log(`✅ ${inventoryResult.rowsAffected} Lagerbestände gelöscht`);
    
    // 3. Alle Chargen löschen
    console.log('🗑️ Lösche alle Produktchargen...');
    const batchesResult = await db.execute('DELETE FROM product_batches');
    console.log(`✅ ${batchesResult.rowsAffected} Chargen gelöscht`);
    
    // 4. Alle aktiven Lager abrufen
    console.log('🏢 Lade alle aktiven Lager...');
    const warehousesResult = await db.execute(`
      SELECT id, name 
      FROM warehouses 
      WHERE is_active = true OR is_active IS NULL
      ORDER BY id
    `);
    
    const warehouses = warehousesResult.rows;
    console.log(`📍 ${warehouses.length} aktive Lager gefunden`);
    
    // 5. Alle aktiven Produkte abrufen, die in Automaten verkauft werden
    console.log('📦 Lade alle aktiven Produkte aus Automaten...');
    const productsResult = await db.execute(`
      SELECT DISTINCT p.id, p.product_name, p.sku, p.price, p.unit
      FROM products p
      INNER JOIN machine_slots ms ON p.id = ms.product_id
      WHERE p.is_active = true OR p.is_active IS NULL
      ORDER BY p.id
    `);
    
    const products = productsResult.rows;
    console.log(`🛍️ ${products.length} aktive Produkte in Automaten gefunden`);
    
    // 6. Für jedes Lager und jedes Produkt einen Bestand von 150 anlegen
    console.log('📊 Erstelle Lagerbestände...');
    
    let totalInventoryItems = 0;
    
    for (const warehouse of warehouses) {
      console.log(`🏢 Bearbeite Lager: ${warehouse.name} (ID: ${warehouse.id})`);
      
      for (const product of products) {
        try {
          // Lagerbestand anlegen
          await db.execute(`
            INSERT INTO inventory_items (
              warehouse_id, 
              product_id, 
              quantity, 
              min_quantity, 
              reorder_point,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `, [warehouse.id, product.id, 150, 20, 30]);
          
          totalInventoryItems++;
          
          // Produktcharge anlegen (für MHD-Verwaltung)
          const batchNumber = `INIT-${warehouse.id}-${product.id}-${Date.now()}`;
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 Jahr Haltbarkeit
          
          await db.execute(`
            INSERT INTO product_batches (
              product_id,
              warehouse_id,
              batch_number,
              initial_quantity,
              current_quantity,
              expiry_date,
              received_date,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'))
          `, [
            product.id, 
            warehouse.id, 
            batchNumber, 
            150, 
            150, 
            expiryDate.toISOString()
          ]);
          
        } catch (error) {
          console.warn(`⚠️ Fehler bei Produkt ${product.product_name} in Lager ${warehouse.name}:`, error.message);
        }
      }
      
      console.log(`✅ Lager ${warehouse.name}: ${products.length} Produkte hinzugefügt`);
    }
    
    // 7. Zusammenfassung
    console.log('\n🎉 Reset erfolgreich abgeschlossen!');
    console.log('📊 Zusammenfassung:');
    console.log(`   • ${ordersResult.rowsAffected} Bestellungen gelöscht`);
    console.log(`   • ${orderItemsResult.rowsAffected} Bestellpositionen gelöscht`);
    console.log(`   • ${inventoryResult.rowsAffected} alte Lagerbestände gelöscht`);
    console.log(`   • ${batchesResult.rowsAffected} alte Chargen gelöscht`);
    console.log(`   • ${warehouses.length} Lager bearbeitet`);
    console.log(`   • ${products.length} verschiedene Produkte`);
    console.log(`   • ${totalInventoryItems} neue Lagerbestände erstellt`);
    console.log(`   • Jedes Produkt hat 150 Stück in jedem Lager`);
    
  } catch (error) {
    console.error('❌ Fehler beim Reset:', error);
    throw error;
  }
}

// Skript ausführen
resetOrdersAndInventory()
  .then(() => {
    console.log('✨ Vorgang abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Kritischer Fehler:', error);
    process.exit(1);
  });

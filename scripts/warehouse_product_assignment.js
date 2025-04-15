/**
 * LAGER-PRODUKT-ZUWEISUNG OPTIMIEREN
 * 
 * Dieses Skript überprüft und verbessert die Zuweisung von Produkten zu Lagern
 * Es stellt sicher, dass jedes Produkt in jedem Lager nur einmal vorhanden ist
 * und dass die warehouses-Eigenschaft in der Produkttabelle korrekt ist
 */

const { Pool } = require('pg');
const util = require('util');

// Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Promise-basierte Abfrage
const query = util.promisify(pool.query).bind(pool);

async function optimizeWarehouseProductAssignments() {
  console.log("STARTE LAGER-PRODUKT-ZUWEISUNG OPTIMIERUNG...");
  console.log("=============================================");
  
  try {
    // 1. Datenbankverbindung prüfen
    console.log("Prüfe Datenbankverbindung...");
    await query('SELECT 1');
    console.log("✅ Datenbankverbindung erfolgreich hergestellt\n");
    
    // 2. Aktuelle Inventar-Einträge laden
    console.log("Lade aktuelle Inventareinträge...");
    const inventoryResult = await query(`
      SELECT i.id, i.product_id, i.warehouse_id, i.quantity, 
             p.product_name, w.name as warehouse_name
      FROM inventory_items i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      ORDER BY i.warehouse_id, i.product_id
    `);
    
    const inventoryItems = inventoryResult.rows;
    console.log(`${inventoryItems.length} Inventareinträge gefunden.\n`);
    
    // 3. Auf doppelte Produkte pro Lager prüfen
    console.log("Prüfe auf doppelte Produkte pro Lager...");
    
    // Gruppieren nach Lager und Produkt
    const groupedInventory = {};
    
    for (const item of inventoryItems) {
      const key = `${item.warehouse_id}-${item.product_id}`;
      
      if (!groupedInventory[key]) {
        groupedInventory[key] = [];
      }
      
      groupedInventory[key].push(item);
    }
    
    // Identifiziere Duplikate
    const duplicateEntries = [];
    
    for (const [key, items] of Object.entries(groupedInventory)) {
      if (items.length > 1) {
        duplicateEntries.push({
          key,
          items,
          warehouseId: items[0].warehouse_id,
          productId: items[0].product_id,
          productName: items[0].product_name,
          warehouseName: items[0].warehouse_name
        });
      }
    }
    
    console.log(`${duplicateEntries.length} Produkte mit mehrfachen Inventareinträgen im selben Lager gefunden.\n`);
    
    // 4. Bereinige doppelte Inventareinträge
    if (duplicateEntries.length > 0) {
      console.log("Bereinige doppelte Inventareinträge...");
      
      for (const entry of duplicateEntries) {
        console.log(`  Produkt "${entry.productName}" in Lager "${entry.warehouseName}" hat ${entry.items.length} Einträge`);
        
        // Behalte den ältesten Eintrag und addiere Mengen
        const keepItem = entry.items[0]; // ältester/erster Eintrag
        let totalQuantity = keepItem.quantity;
        
        // ID der zu behaltenden Position
        const keepId = keepItem.id;
        
        // IDs der zu löschenden Positionen
        const deleteIds = entry.items.slice(1).map(item => {
          totalQuantity += item.quantity;
          return item.id;
        });
        
        // Menge aktualisieren
        console.log(`    Aktualisiere Inventareintrag ${keepId} mit Gesamtmenge ${totalQuantity}`);
        await query('UPDATE inventory_items SET quantity = $1 WHERE id = $2', [totalQuantity, keepId]);
        
        // Überschüssige Einträge löschen
        if (deleteIds.length > 0) {
          console.log(`    Lösche ${deleteIds.length} überflüssige Inventareinträge: ${deleteIds.join(', ')}`);
          await query('DELETE FROM inventory_items WHERE id = ANY($1)', [deleteIds]);
        }
      }
      
      console.log("✅ Alle doppelten Inventareinträge bereinigt.\n");
    }
    
    // 5. Warehouses-Eigenschaft für jedes Produkt aktualisieren
    console.log("Aktualisiere 'warehouses' für jedes Produkt...");
    
    // Prüfe, ob die warehouses Spalte in der Produkt-Tabelle existiert
    const checkColumnResult = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'warehouses'
    `);
    
    // Wenn die Spalte nicht existiert, füge sie hinzu
    if (checkColumnResult.rows.length === 0) {
      console.log("  'warehouses' Spalte existiert nicht in der Produkttabelle, füge sie hinzu...");
      await query('ALTER TABLE products ADD COLUMN warehouses INTEGER[]');
    }
    
    // Hole alle Produkte
    const productsResult = await query('SELECT id, product_name FROM products');
    const products = productsResult.rows;
    
    console.log(`  Aktualisiere warehouses-Eigenschaft für ${products.length} Produkte...`);
    
    // Aktualisiere jedes Produkt
    let updatedProducts = 0;
    
    for (const product of products) {
      // Finde alle Lager für dieses Produkt
      const warehousesResult = await query(`
        SELECT DISTINCT warehouse_id 
        FROM inventory_items 
        WHERE product_id = $1
      `, [product.id]);
      
      const warehouseIds = warehousesResult.rows.map(row => row.warehouse_id);
      
      // Aktualisiere die warehouses-Eigenschaft
      await query('UPDATE products SET warehouses = $1 WHERE id = $2', [warehouseIds, product.id]);
      updatedProducts++;
      
      if (updatedProducts % 100 === 0) {
        console.log(`    ${updatedProducts}/${products.length} Produkte aktualisiert...`);
      }
    }
    
    console.log(`✅ warehouses-Eigenschaft für alle ${updatedProducts} Produkte aktualisiert.\n`);
    
    // 6. Gesamtstatistik aktualisieren
    console.log("Aktualisiere Systeminformationen...");
    
    const statsUpdateQuery = `
      UPDATE system_stats 
      SET value = (SELECT COUNT(*) FROM products), 
          last_updated = NOW() 
      WHERE key = 'products_count'
    `;
    
    await query(statsUpdateQuery);
    
    // 7. Abschlussbericht
    console.log("\n==============================================");
    console.log("OPTIMIERUNG ABGESCHLOSSEN");
    console.log("==============================================");
    
    // Ermittle Statistiken
    const productCountResult = await query('SELECT COUNT(*) FROM products');
    const inventoryCountResult = await query('SELECT COUNT(*) FROM inventory_items');
    
    const productCount = parseInt(productCountResult.rows[0].count);
    const inventoryCount = parseInt(inventoryCountResult.rows[0].count);
    
    console.log(`Gesamtanzahl Produkte: ${productCount}`);
    console.log(`Gesamtanzahl Inventareinträge: ${inventoryCount}`);
    console.log(`Durchschnittliche Inventareinträge pro Produkt: ${(inventoryCount / productCount).toFixed(2)}`);
    
    console.log("\n🎉 LAGER-PRODUKT-ZUWEISUNG ERFOLGREICH OPTIMIERT! 🎉");
    console.log("Die Konsistenz zwischen Produkten und Lagern wurde wiederhergestellt.");
    
  } catch (error) {
    console.error("KRITISCHER FEHLER:", error);
  } finally {
    // Verbindung schließen
    await pool.end();
  }
}

// Skript ausführen
optimizeWarehouseProductAssignments().then(() => {
  console.log("\nOptimierungsprozess abgeschlossen.");
  process.exit(0);
}).catch(err => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
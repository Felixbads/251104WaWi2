/**
 * SOFORTIGE BEREINIGUNG VON DUPLIKATEN
 * 
 * Dieses Skript identifiziert und entfernt Produktduplikate auf Basis normalisierter Namen.
 * Es ist für den sofortigen Einsatz konzipiert, um das Problem der Duplikate zu beheben.
 */

const { Pool } = require('pg');
const util = require('util');

// Verbindung zur Datenbank
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Promise-basierte Abfrage
const query = util.promisify(pool.query).bind(pool);

// Normalisierungsfunktion für Produktnamen
function normalizeProductName(name) {
  if (!name) return '';
  
  // Zu Kleinbuchstaben konvertieren und Leerzeichen am Anfang/Ende entfernen
  let normalized = name.trim().toLowerCase();
  
  // Mehrfache Leerzeichen durch einzelne ersetzen
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Spezielle Normalisierungen für Volumenangaben
  normalized = normalized.replace(/(\d+)[,\.](\d+)\s*l/g, '$1$2l');
  normalized = normalized.replace(/0[,\.](\d+)\s*l/g, '0$1l');
  
  // Kommas in Listen durch Leerzeichen ersetzen
  normalized = normalized.replace(/,\s*/g, ' ');
  
  // Standardisiere Markierungen für "verschiedene Sorten"
  normalized = normalized.replace(/ver(\.|sch\.|schiedene)?\s*sorten/g, 'ver sorten');
  
  // Entferne spezielle Markierungen in eckigen Klammern und standardisiere sie
  normalized = normalized.replace(/\[\s*vegan\s*\]/gi, 'vegan');
  normalized = normalized.replace(/\[\s*natursüß\s*\]/gi, 'natursüß');
  normalized = normalized.replace(/\[\s*edamer\s*art\s*\]/gi, 'edamer art');
  normalized = normalized.replace(/\[\s*bergkäse\s*\]/gi, 'bergkäse');
  normalized = normalized.replace(/\[\s*camenbert\s*art\s*\]/gi, 'camenbert art');
  
  // Apostroph-Normalisierung (entferne Apostrophe)
  normalized = normalized.replace(/['']/g, '');
  
  // Sonderzeichen entfernen
  normalized = normalized.replace(/[^\wäöüßÄÖÜ\s\-\(\)]/g, '');
  
  // Standardisiere Klammern
  normalized = normalized.replace(/\(\s+/g, '(');
  normalized = normalized.replace(/\s+\)/g, ')');
  normalized = normalized.replace(/\(([^,\)]*),([^\)]*)\)/g, '($1 $2)');
  
  // Überflüssige Leerzeichen entfernen
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

async function fixImmediateDuplicates() {
  console.log("\n==== SOFORTIGE BEREINIGUNG VON PRODUKTDUPLIKATEN ====\n");
  
  try {
    // 1. Prüfe, ob die normalisierte_name Spalte existiert
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'normalized_name'
    `;
    const columnResult = await query(checkColumnQuery);
    const hasNormalizedColumn = columnResult.rows.length > 0;
    
    // 2. Spalte hinzufügen falls sie nicht existiert
    if (!hasNormalizedColumn) {
      console.log("Die 'normalized_name' Spalte existiert noch nicht. Füge sie hinzu...");
      await query(`ALTER TABLE products ADD COLUMN normalized_name TEXT`);
      console.log("✅ Spalte hinzugefügt\n");
    } else {
      console.log("Die 'normalized_name' Spalte existiert bereits.\n");
    }
    
    // 3. Alle Produkte abrufen
    console.log("Alle Produkte werden abgerufen...");
    const productsResult = await query(`
      SELECT id, product_name, vendon_id, warehouses FROM products WHERE product_name IS NOT NULL
    `);
    const products = productsResult.rows;
    console.log(`${products.length} Produkte gefunden\n`);
    
    // 4. Normalisiere die Namen und finde Duplikate
    console.log("Produkte werden analysiert und normalisierte Namen berechnet...");
    const normalizedProducts = [];
    const normalizedNameMap = new Map();
    
    for (const product of products) {
      if (!product.product_name) continue;
      
      const normalizedName = normalizeProductName(product.product_name);
      product.normalized_name = normalizedName;
      normalizedProducts.push(product);
      
      // Gruppiere Produkte nach normalisierten Namen
      if (!normalizedNameMap.has(normalizedName)) {
        normalizedNameMap.set(normalizedName, []);
      }
      normalizedNameMap.get(normalizedName).push(product);
    }
    
    // 5. Aktualisiere die normalized_name Spalte für alle Produkte
    console.log("Aktualisiere normalized_name Spalte für alle Produkte...");
    const BATCH_SIZE = 100;
    let updatedCount = 0;
    
    for (let i = 0; i < normalizedProducts.length; i += BATCH_SIZE) {
      const batch = normalizedProducts.slice(i, i + BATCH_SIZE);
      for (const product of batch) {
        await query(`
          UPDATE products SET normalized_name = $1 WHERE id = $2
        `, [product.normalized_name, product.id]);
        updatedCount++;
      }
      console.log(`${updatedCount}/${normalizedProducts.length} Produkte aktualisiert...`);
    }
    
    // 6. Suche nach Duplikatgruppen
    const duplicateGroups = [];
    
    for (const [normalizedName, products] of normalizedNameMap.entries()) {
      if (products.length > 1) {
        // Sortiere nach ID (niedrigste zuerst)
        products.sort((a, b) => a.id - b.id);
        duplicateGroups.push({
          name: normalizedName,
          products
        });
      }
    }
    
    // 7. Zeige Duplikatbericht
    console.log(`\n==== DUPLIKATBERICHT ====`);
    console.log(`${duplicateGroups.length} Duplikatgruppen mit insgesamt ${duplicateGroups.reduce((acc, group) => acc + group.products.length - 1, 0)} zu bereinigende Duplikate gefunden.\n`);
    
    // 8. Zeige einige Beispiele
    const MAX_EXAMPLES = 5;
    const examples = duplicateGroups.slice(0, MAX_EXAMPLES);
    
    for (let i = 0; i < examples.length; i++) {
      const group = examples[i];
      console.log(`Gruppe ${i+1}: "${group.name}"`);
      
      for (let j = 0; j < group.products.length; j++) {
        const product = group.products[j];
        console.log(`  ${j === 0 ? '✅ Behalten' : '❌ Entfernen'} ID: ${product.id} - "${product.product_name}"`);
      }
      console.log();
    }
    
    if (duplicateGroups.length > MAX_EXAMPLES) {
      console.log(`... und ${duplicateGroups.length - MAX_EXAMPLES} weitere Gruppen.\n`);
    }
    
    // 9. Bereinige Duplikate
    if (duplicateGroups.length > 0) {
      console.log("Starte Bereinigung...\n");
      
      let fixed = 0;
      let errors = 0;
      
      for (const group of duplicateGroups) {
        const keepProduct = group.products[0]; // Das erste Produkt (niedrigste ID) behalten
        const duplicateProducts = group.products.slice(1); // Alle anderen entfernen
        
        console.log(`Bearbeite Gruppe "${group.name}":`);
        console.log(`  Behalte Produkt ID ${keepProduct.id}: "${keepProduct.product_name}"`);
        
        // Warehouses-Set für das Produkt das wir behalten
        const keepWarehouses = new Set(keepProduct.warehouses || []);
        
        for (const duplicate of duplicateProducts) {
          try {
            console.log(`  Bereinige Duplikat ID ${duplicate.id}: "${duplicate.product_name}"`);
            
            // 1. Sammle Warehouse-IDs vom Duplikat
            const duplicateWarehouses = new Set(duplicate.warehouses || []);
            for (const warehouseId of duplicateWarehouses) {
              keepWarehouses.add(warehouseId);
            }
            
            // 2. Aktualisiere inventory_items auf das zu behaltende Produkt
            await query(`
              UPDATE inventory_items 
              SET product_id = $1
              WHERE product_id = $2 AND 
                    NOT EXISTS (
                      SELECT 1 FROM inventory_items 
                      WHERE product_id = $1 AND warehouse_id = inventory_items.warehouse_id
                    )
            `, [keepProduct.id, duplicate.id]);
            
            // 3. Aktualisiere product_batches auf das zu behaltende Produkt mit neuen Batch-Nummern
            const batchesResult = await query(
              'SELECT * FROM product_batches WHERE product_id = $1',
              [duplicate.id]
            );
            
            for (const batch of batchesResult.rows) {
              const newBatchNumber = `MERGED-${batch.batch_number}-${Date.now()}`;
              await query(`
                UPDATE product_batches 
                SET product_id = $1, batch_number = $2 
                WHERE id = $3
              `, [keepProduct.id, newBatchNumber, batch.id]);
            }
            
            // 4. Aktualisiere transactions auf das zu behaltende Produkt
            await query(`
              UPDATE transactions 
              SET product_id = $1 
              WHERE product_id = $2
            `, [keepProduct.id, duplicate.id]);
            
            // 5. Aktualisiere product_movements auf das zu behaltende Produkt
            await query(`
              UPDATE product_movements 
              SET product_id = $1 
              WHERE product_id = $2
            `, [keepProduct.id, duplicate.id]);
            
            // 6. Aktualisiere order_items auf das zu behaltende Produkt
            await query(`
              UPDATE order_items 
              SET product_id = $1 
              WHERE product_id = $2
            `, [keepProduct.id, duplicate.id]);
            
            // 7. Lösche übriggebliebene inventory_items für das Duplikat
            await query(`
              DELETE FROM inventory_items 
              WHERE product_id = $1
            `, [duplicate.id]);
            
            // 8. Lösche das Duplikat
            await query(`
              DELETE FROM products 
              WHERE id = $1
            `, [duplicate.id]);
            
            fixed++;
            console.log(`  ✅ Erfolgreich bereinigt`);
          } catch (error) {
            console.error(`  ❌ Fehler beim Bereinigen: ${error.message}`);
            errors++;
          }
        }
        
        // 9. Aktualisiere warehouses für das behaltene Produkt
        try {
          const warehouseArray = Array.from(keepWarehouses);
          await query(`
            UPDATE products 
            SET warehouses = $1 
            WHERE id = $2
          `, [warehouseArray, keepProduct.id]);
          console.log(`  ✅ Warehouses für Produkt ${keepProduct.id} aktualisiert: ${warehouseArray.join(', ')}`);
        } catch (warehouseError) {
          console.error(`  ❌ Fehler beim Aktualisieren der warehouses: ${warehouseError.message}`);
        }
        
        console.log();
      }
      
      // 10. Erstelle einen Index auf der normalized_name Spalte
      console.log("Erstelle Index auf normalized_name Spalte...");
      try {
        await query(`
          CREATE INDEX IF NOT EXISTS idx_products_normalized_name 
          ON products(normalized_name)
        `);
        console.log("✅ Index erstellt\n");
      } catch (indexError) {
        console.error(`❌ Fehler beim Erstellen des Index: ${indexError.message}\n`);
      }
      
      // 11. Abschlussbericht
      console.log(`==== ABSCHLUSSBERICHT ====`);
      console.log(`${fixed} von ${duplicateGroups.reduce((acc, group) => acc + group.products.length - 1, 0)} Duplikaten erfolgreich bereinigt.`);
      
      if (errors > 0) {
        console.log(`${errors} Fehler sind aufgetreten.`);
      }
      
      // 12. Prüfe, ob alle Duplikate entfernt wurden
      const finalCheckResult = await query(`
        SELECT COUNT(*) total,
               COUNT(DISTINCT normalized_name) unique_names
        FROM products
        WHERE normalized_name IS NOT NULL
      `);
      
      const { total, unique_names } = finalCheckResult.rows[0];
      
      console.log(`\nProdukte in der Datenbank: ${total}`);
      console.log(`Eindeutige normalisierte Namen: ${unique_names}`);
      
      if (total === parseInt(unique_names)) {
        console.log("\n🎉 ERFOLG! Alle Duplikate wurden erfolgreich entfernt.");
      } else {
        console.log(`\n⚠️ Es verbleiben noch ${total - unique_names} Duplikate in der Datenbank.`);
        console.log("Führen Sie dieses Skript erneut aus, um alle Duplikate zu entfernen.");
      }
    } else {
      console.log("Keine Duplikate gefunden. Die Datenbank ist bereits sauber.");
    }
    
  } catch (error) {
    console.error("Kritischer Fehler bei der Bereinigung:", error);
  } finally {
    await pool.end();
  }
}

// Skript ausführen
fixImmediateDuplicates().then(() => {
  console.log("\nBereinigungsprozess abgeschlossen.");
  process.exit(0);
}).catch(err => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
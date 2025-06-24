/**
 * SOFORTIGE DUPLIKATBEREINIGUNG
 * Dieses Skript entfernt sofort alle Produktduplikate aus dem System
 * Es nutzt direkte SQL-Abfragen für optimale Effizienz
 */

const { Pool } = require('pg');
const util = require('util');
const readline = require('readline');

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Promise-basierte Abfrage
const query = util.promisify(pool.query).bind(pool);

// Hilfsfunktion zur Normalisierung von Produktnamen
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
  
  // Entferne Markierungen in eckigen Klammern
  normalized = normalized.replace(/\[\s*vegan\s*\]/gi, 'vegan');
  normalized = normalized.replace(/\[\s*natursüß\s*\]/gi, 'natursüß');
  normalized = normalized.replace(/\[\s*edamer\s*art\s*\]/gi, 'edamer art');
  normalized = normalized.replace(/\[\s*bergkäse\s*\]/gi, 'bergkäse');
  normalized = normalized.replace(/\[\s*camenbert\s*art\s*\]/gi, 'camenbert art');
  
  // Apostroph-Normalisierung
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

async function cleanupAllDuplicateProducts() {
  console.log("STARTE KRITISCHE DUPLIKAT-ENTFERNUNG...");
  console.log("========================================");
  
  try {
    // 1. Vorbereitende Abfragen ausführen
    console.log("Prüfe Datenbankverbindung...");
    await query('SELECT NOW()');
    console.log("✅ Datenbankverbindung erfolgreich hergestellt");
    
    // 2. Alle Produkte mit normalisierten Namen holen
    console.log("\nHole alle Produkte aus der Datenbank...");
    const result = await query('SELECT * FROM products ORDER BY id');
    const allProducts = result.rows;
    console.log(`${allProducts.length} Produkte gefunden.`);
    
    // 3. Normalisiere alle Produktnamen und gruppiere sie
    console.log("\nNormalisiere Produktnamen und identifiziere Duplikate...");
    const productGroups = {};
    
    for (const product of allProducts) {
      if (!product.product_name) continue;
      
      const normalizedName = normalizeProductName(product.product_name);
      if (!productGroups[normalizedName]) {
        productGroups[normalizedName] = [];
      }
      productGroups[normalizedName].push(product);
    }
    
    // 4. Duplikatgruppen identifizieren
    const duplicateGroups = [];
    let totalDuplicates = 0;
    
    for (const [normalizedName, products] of Object.entries(productGroups)) {
      if (products.length > 1) {
        duplicateGroups.push({
          name: normalizedName,
          products: products.sort((a, b) => a.id - b.id) // Sortiere nach ID (niedrigste zuerst)
        });
        totalDuplicates += products.length - 1;
      }
    }
    
    console.log(`\n${duplicateGroups.length} Duplikatgruppen mit insgesamt ${totalDuplicates} zu entfernenden Duplikaten gefunden.`);
    
    // 5. Übersicht der Duplikate
    for (let i = 0; i < Math.min(5, duplicateGroups.length); i++) {
      const group = duplicateGroups[i];
      console.log(`\nBeispielgruppe ${i+1}: "${group.name}" mit ${group.products.length} Einträgen:`);
      
      for (let j = 0; j < group.products.length; j++) {
        const product = group.products[j];
        console.log(`  ${j === 0 ? '✅ BEHALTEN' : '❌ ENTFERNEN'} ID ${product.id}: "${product.product_name}"`);
      }
    }
    
    if (duplicateGroups.length > 5) {
      console.log(`\n... und ${duplicateGroups.length - 5} weitere Duplikatgruppen.`);
    }
    
    // 6. Bereinigung ausführen
    console.log("\n========================================");
    console.log("STARTE DUPLIKAT-BEREINIGUNG");
    console.log("========================================");
    
    let successfulRemovals = 0;
    let failedRemovals = 0;
    
    for (const group of duplicateGroups) {
      const keepProduct = group.products[0]; // Behalte das erste Produkt (niedrigste ID)
      
      console.log(`\nBearbeite Gruppe "${group.name}":`);
      console.log(`  Behalte Produkt ID ${keepProduct.id}: "${keepProduct.product_name}"`);
      
      // Pro Duplikatgruppe
      for (let i = 1; i < group.products.length; i++) {
        const duplicateProduct = group.products[i];
        console.log(`  Entferne Duplikat ID ${duplicateProduct.id}: "${duplicateProduct.product_name}"`);
        
        try {
          // A. Inventareinträge migrieren
          await query(`
            UPDATE inventory_items 
            SET product_id = $1 
            WHERE product_id = $2 AND NOT EXISTS (
              SELECT 1 FROM inventory_items 
              WHERE product_id = $1 AND warehouse_id = inventory_items.warehouse_id
            )
          `, [keepProduct.id, duplicateProduct.id]);
          
          // B. Batches migrieren mit neuen Batch-Nummern
          const batches = await query(
            'SELECT * FROM product_batches WHERE product_id = $1',
            [duplicateProduct.id]
          );
          
          for (const batch of batches.rows) {
            const newBatchNumber = `MERGED-${batch.batch_number}-${Date.now()}`;
            
            await query(`
              UPDATE product_batches 
              SET product_id = $1, batch_number = $2
              WHERE id = $3
            `, [keepProduct.id, newBatchNumber, batch.id]);
          }
          
          // C. Transaktionen migrieren
          await query(`
            UPDATE transactions 
            SET product_id = $1 
            WHERE product_id = $2
          `, [keepProduct.id, duplicateProduct.id]);
          
          // D. Produktbewegungen migrieren
          await query(`
            UPDATE product_movements 
            SET product_id = $1 
            WHERE product_id = $2
          `, [keepProduct.id, duplicateProduct.id]);
          
          // E. Bestellpositionen migrieren
          await query(`
            UPDATE order_items 
            SET product_id = $1 
            WHERE product_id = $2
          `, [keepProduct.id, duplicateProduct.id]);
          
          // F. Inventareinträge löschen, die jetzt dupliziert wären
          await query(`
            DELETE FROM inventory_items 
            WHERE product_id = $1
          `, [duplicateProduct.id]);
          
          // G. Duplikat-Produkt löschen
          await query(`
            DELETE FROM products 
            WHERE id = $1
          `, [duplicateProduct.id]);
          
          successfulRemovals++;
          console.log(`    ✅ Erfolgreich migriert und entfernt`);
        } catch (error) {
          failedRemovals++;
          console.error(`    ❌ Fehler: ${error.message}`);
        }
      }
    }
    
    // 7. Abschlussbericht
    console.log("\n========================================");
    console.log("BEREINIGUNGSBERICHT");
    console.log("========================================");
    console.log(`Insgesamt ${successfulRemovals} Duplikate erfolgreich bereinigt.`);
    if (failedRemovals > 0) {
      console.log(`${failedRemovals} Duplikate konnten nicht bereinigt werden.`);
    }
    
    // 8. Überprüfe den Erfolg
    const finalCheck = await query('SELECT COUNT(*) FROM products');
    const finalProductCount = parseInt(finalCheck.rows[0].count);
    
    const uniqueNamesCheck = await query(`
      SELECT COUNT(DISTINCT LOWER(TRIM(product_name))) 
      FROM products 
      WHERE product_name IS NOT NULL
    `);
    const uniqueNamesCount = parseInt(uniqueNamesCheck.rows[0].count);
    
    console.log(`\nAktuelle Anzahl Produkte: ${finalProductCount}`);
    console.log(`Anzahl einzigartiger Produktnamen (grobe Schätzung): ${uniqueNamesCount}`);
    
    if (finalProductCount <= uniqueNamesCount + 5) { // Kleine Toleranz für Fälle, die normalisiert nicht eindeutig sind
      console.log("\n🎉 BEREINIGUNG ERFOLGREICH ABGESCHLOSSEN! 🎉");
      console.log("Die Produktdatenbank enthält jetzt keine signifikanten Duplikate mehr.");
    } else {
      console.log("\n⚠️ BEREINIGUNG TEILWEISE ERFOLGREICH");
      console.log(`Es gibt noch ungefähr ${finalProductCount - uniqueNamesCount} Duplikate, die nicht bereinigt wurden.`);
      console.log("Diese können durch erneute Ausführung des Skripts oder manuell bereinigt werden.");
    }
    
  } catch (error) {
    console.error("KRITISCHER FEHLER:", error);
  } finally {
    await pool.end();
  }
}

// Skript ausführen
cleanupAllDuplicateProducts().then(() => {
  console.log("\nBereinigungsprozess abgeschlossen.");
}).catch(err => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
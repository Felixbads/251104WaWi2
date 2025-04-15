/**
 * Dieses Skript bereinigt Duplikate in der Produktdatenbank
 * Es erkennt Duplikate basierend auf normalisierten Produktnamen
 * und behält nur einen Eintrag, während alle anderen entfernt werden
 */

import { storage } from "../server/storage";
import { normalizeProductName } from "../server/utils/stringUtils";
import { rawDb } from "../server/db";
import * as readline from 'readline';

// Hilfsfunktion um Benutzerinput einzulesen
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function cleanupDuplicateProducts(forceDeletion: boolean = false) {
  console.log("Starte gründliche Bereinigung von Duplikaten in der Produktdatenbank...");
  
  try {
    // 1. Alle Produkte abrufen
    console.log("Hole alle Produkte aus der Datenbank...");
    const query = 'SELECT * FROM products ORDER BY id';
    const result = await rawDb.query(query);
    const allProducts = result.rows;
    console.log(`Insgesamt ${allProducts.length} Produkte in der Datenbank gefunden.`);

    // 2. Produkte nach normalisierten Namen gruppieren
    const normalizedNameMap = new Map<string, any[]>();
    
    for (const product of allProducts) {
      // Normalisieren des Produktnamens für konsistenten Vergleich
      const normalizedName = normalizeProductName(product.productName || "");
      
      if (!normalizedName) {
        console.log(`Warnung: Produkt ID ${product.id} hat keinen Namen, wird übersprungen.`);
        continue;
      }
      
      // Gruppierung nach normalisierten Namen
      if (!normalizedNameMap.has(normalizedName)) {
        normalizedNameMap.set(normalizedName, []);
      }
      
      normalizedNameMap.get(normalizedName)!.push(product);
    }
    
    // 3. Identifiziere Duplikate
    let duplicateGroupCount = 0;
    let totalDuplicates = 0;
    const duplicateGroups: {name: string, products: any[]}[] = [];
    
    for (const [normalizedName, products] of normalizedNameMap.entries()) {
      if (products.length > 1) {
        duplicateGroupCount++;
        totalDuplicates += products.length - 1;
        duplicateGroups.push({
          name: normalizedName,
          products: products
        });
      }
    }
    
    console.log(`\n--------- Duplikatbericht ---------`);
    console.log(`${duplicateGroupCount} Produktgruppen mit Duplikaten gefunden.`);
    console.log(`Insgesamt ${totalDuplicates} überschüssige Duplikate zu entfernen.`);
    
    // 4. Detaillierte Duplikatinformationen anzeigen
    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i];
      console.log(`\nGruppe ${i+1}: "${group.name}" hat ${group.products.length} Duplikate:`);
      
      // Sortieren nach ID (niedrigste zuerst)
      group.products.sort((a, b) => a.id - b.id);
      
      for (let j = 0; j < group.products.length; j++) {
        const product = group.products[j];
        console.log(`  ${j === 0 ? '✅' : '❌'} ID ${product.id}: "${product.productName}" (${product.vendonId || 'Keine VendonID'})`);
      }
    }
    
    // 5. Bestätigung des Benutzers einholen, es sei denn forceDeletion ist true
    let confirmDelete = forceDeletion;
    if (!forceDeletion) {
      const answer = await askQuestion("\nMöchten Sie ALLE Duplikate entfernen und nur einen Eintrag pro Produkt behalten? (j/n): ");
      confirmDelete = answer.toLowerCase() === 'j';
    }
    
    // 6. Duplikate entfernen wenn bestätigt
    if (confirmDelete) {
      console.log("\nBeginn der Bereinigung...");
      
      let removed = 0;
      const errors: string[] = [];
      
      // Für jede Duplikatgruppe
      for (const group of duplicateGroups) {
        // Das erste Produkt behalten (niedrigste ID) und alle anderen entfernen
        const keepProduct = group.products[0];
        
        // Alle anderen Produkte in der Gruppe entfernen
        for (let i = 1; i < group.products.length; i++) {
          const duplicateProduct = group.products[i];
          
          try {
            // 6.1 Warehouse-Zuordnungen aktualisieren
            console.log(`Aktualisiere Warehouse-Zuordnungen von Produkt ${duplicateProduct.id} zu ${keepProduct.id}...`);
            
            // Inventareinträge für das Duplikat finden
            const inventoryQuery = `
              SELECT * FROM inventory_items WHERE product_id = $1
            `;
            const inventoryResult = await rawDb.query(inventoryQuery, [duplicateProduct.id]);
            const inventoryItems = inventoryResult.rows;
            
            // Für jedes Inventar prüfen, ob es bereits einen Eintrag mit dem beizubehaltenden Produkt gibt
            for (const item of inventoryItems) {
              const warehouseId = item.warehouse_id;
              
              // Prüfen, ob bereits ein Eintrag existiert
              const existingQuery = `
                SELECT * FROM inventory_items 
                WHERE product_id = $1 AND warehouse_id = $2
              `;
              const existingResult = await rawDb.query(existingQuery, [keepProduct.id, warehouseId]);
              
              if (existingResult.rows.length === 0) {
                // Kein existierender Eintrag, also den vorhandenen aktualisieren
                console.log(`  Aktualisiere Inventory-Item ${item.id} zu Produkt ${keepProduct.id}...`);
                const updateQuery = `
                  UPDATE inventory_items 
                  SET product_id = $1 
                  WHERE id = $2
                `;
                await rawDb.query(updateQuery, [keepProduct.id, item.id]);
              } else {
                // Es gibt bereits einen Eintrag, also löschen wir den Duplikat-Eintrag
                console.log(`  Lösche überschüssiges Inventory-Item ${item.id}...`);
                const deleteQuery = `
                  DELETE FROM inventory_items 
                  WHERE id = $1
                `;
                await rawDb.query(deleteQuery, [item.id]);
              }
            }
            
            // 6.2 Batches aktualisieren
            const batchQuery = `
              SELECT * FROM product_batches WHERE product_id = $1
            `;
            const batchResult = await rawDb.query(batchQuery, [duplicateProduct.id]);
            const batches = batchResult.rows;
            
            for (const batch of batches) {
              const warehouseId = batch.warehouse_id;
              
              // Generiere eine neue Batch-Nummer um Konflikte zu vermeiden
              const newBatchNumber = `MERGED-${batch.batch_number}-${Date.now()}`;
              
              console.log(`  Aktualisiere Batch ${batch.id} zu Produkt ${keepProduct.id} mit neuer Batch-Nummer ${newBatchNumber}...`);
              const updateBatchQuery = `
                UPDATE product_batches 
                SET product_id = $1, batch_number = $2 
                WHERE id = $3
              `;
              await rawDb.query(updateBatchQuery, [keepProduct.id, newBatchNumber, batch.id]);
            }
            
            // 6.3 Transaktionen aktualisieren
            console.log(`  Aktualisiere Transaktionen von Produkt ${duplicateProduct.id} zu ${keepProduct.id}...`);
            const updateTransactionsQuery = `
              UPDATE transactions 
              SET product_id = $1 
              WHERE product_id = $2
            `;
            await rawDb.query(updateTransactionsQuery, [keepProduct.id, duplicateProduct.id]);
            
            // 6.4 Produktbewegungen aktualisieren
            console.log(`  Aktualisiere Produktbewegungen von Produkt ${duplicateProduct.id} zu ${keepProduct.id}...`);
            const updateMovementsQuery = `
              UPDATE product_movements 
              SET product_id = $1 
              WHERE product_id = $2
            `;
            await rawDb.query(updateMovementsQuery, [keepProduct.id, duplicateProduct.id]);
            
            // 6.5 Orderitems aktualisieren
            console.log(`  Aktualisiere Bestellpositionen von Produkt ${duplicateProduct.id} zu ${keepProduct.id}...`);
            const updateOrderitemsQuery = `
              UPDATE order_items 
              SET product_id = $1 
              WHERE product_id = $2
            `;
            await rawDb.query(updateOrderitemsQuery, [keepProduct.id, duplicateProduct.id]);
            
            // 6.6 Jetzt können wir das duplizierte Produkt löschen
            console.log(`  Lösche Duplikat-Produkt ${duplicateProduct.id}...`);
            const deleteProductQuery = `
              DELETE FROM products WHERE id = $1
            `;
            await rawDb.query(deleteProductQuery, [duplicateProduct.id]);
            
            removed++;
            console.log(`✅ Produkt ${duplicateProduct.id} erfolgreich entfernt und Referenzen aktualisiert.`);
          } catch (error: any) {
            console.error(`❌ Fehler beim Entfernen von Produkt ${duplicateProduct.id}:`, error.message);
            errors.push(`Produkt ${duplicateProduct.id}: ${error.message}`);
          }
        }
      }
      
      console.log(`\n--------- Bereinigungsbericht ---------`);
      console.log(`${removed} von ${totalDuplicates} Duplikaten erfolgreich entfernt.`);
      
      if (errors.length > 0) {
        console.log(`\n${errors.length} Fehler aufgetreten:`);
        errors.forEach(err => console.log(`- ${err}`));
      }
    } else {
      console.log("Bereinigung abgebrochen. Keine Änderungen vorgenommen.");
    }
    
  } catch (error: any) {
    console.error("Fehler bei der Duplikatbereinigung:", error.message);
  }
}

// Skript ausführen mit Force-Flag (true bedeutet keine Benutzerabfrage)
cleanupDuplicateProducts(true).then(() => {
  console.log("\nDuplikatbereinigung abgeschlossen.");
  process.exit(0);
}).catch(err => {
  console.error("Kritischer Fehler:", err);
  process.exit(1);
});
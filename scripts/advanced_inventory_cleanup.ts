/**
 * Erweitertes Lagerbestandsbereinigungsskript
 * 
 * Dieses Skript berücksichtigt alle Fremdreferenzen in der Datenbank,
 * einschließlich purchase_conditions, bevor es Produktduplikate entfernt.
 * 
 * Anwendung: npx tsx scripts/advanced_inventory_cleanup.ts
 */

import { db } from '../server/db';
import { products, machineStocks, inventoryCountItems, inventoryItems, warehouses } from '../shared/schema';
import { eq, sql, inArray, desc, isNull, isNotNull, and } from 'drizzle-orm';

// Konfiguration
const BATCH_SIZE = 3;  // Anzahl der Duplikat-Gruppen pro Batch
const PROCESS_LIMIT = 50;  // Maximale Anzahl zu verarbeitender Duplikatgruppen

/**
 * Normalisiert einen Produktnamen für Vergleichszwecke
 */
const normalizeProductName = (name: string | null): string => {
  if (!name) return '';
  return name.toLowerCase().trim();
};

/**
 * Hauptfunktion zur umfassenden Bereinigung
 */
async function advancedInventoryCleanup() {
  console.log('=================================================');
  console.log('ERWEITERTE LAGERBESTAND- UND PRODUKTBEREINIGUNG');
  console.log('=================================================');
  console.log('\nStarte erweiterte Bereinigung...');
  
  const startTime = Date.now();

  // Statistiken
  let totalProductDuplicatesRemoved = 0;
  let totalInventoryItemsUpdated = 0;
  let totalInventoryDuplicatesRemoved = 0;
  let totalInventoryCountItemsUpdated = 0;
  let totalMachineStocksUpdated = 0;
  let totalPurchaseConditionsUpdated = 0;
  
  try {
    // Hole alle Produkte
    console.log('\n1. PRODUKTDUPLIKATE IDENTIFIZIEREN');
    console.log('----------------------------------');
    console.log('Lade alle Produkte aus der Datenbank...');
    const allProducts = await db.select().from(products).orderBy(desc(products.id));
    console.log(`${allProducts.length} Produkte gefunden.`);

    // Hole alle Lager
    console.log('\nLade alle Lager...');
    const allWarehouses = await db.select().from(warehouses);
    console.log(`${allWarehouses.length} Lager gefunden.`);

    // Hole alle Lagerbestandseinträge
    console.log('\nLade alle Lagerbestandseinträge...');
    const allInventoryItems = await db.select().from(inventoryItems);
    console.log(`${allInventoryItems.length} Lagerbestandseinträge gefunden.`);

    // Gruppiere Produkte nach normalisiertem Namen
    console.log('\nIdentifiziere Produktduplikate...');
    const productGroups: Record<string, typeof allProducts> = {};
    allProducts.forEach(product => {
      if (!product.productName) return;
      
      const normalizedName = normalizeProductName(product.productName);
      if (!productGroups[normalizedName]) {
        productGroups[normalizedName] = [];
      }
      productGroups[normalizedName].push(product);
    });

    // Finde Gruppen mit Duplikaten
    const duplicateGroups = Object.entries(productGroups)
      .filter(([_, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    console.log(`${duplicateGroups.length} Produktgruppen mit Duplikaten gefunden.`);
    
    if (duplicateGroups.length > 0) {
      console.log('\nTop 10 Produkte mit den meisten Duplikaten:');
      duplicateGroups.slice(0, 10).forEach(([name, group]) => {
        console.log(`  - "${name}": ${group.length} Duplikate`);
      });
    }

    // 2. Verarbeite Duplikate in Batches, mit Limit
    console.log('\n2. PRODUKTDUPLIKATE UND REFERENZEN BEREINIGEN (IN BATCHES)');
    console.log('-----------------------------------------------------');
    
    const groupsToProcess = duplicateGroups.slice(0, PROCESS_LIMIT);
    const totalBatches = Math.ceil(groupsToProcess.length / BATCH_SIZE);
    
    console.log(`Verarbeite ${groupsToProcess.length} von ${duplicateGroups.length} Duplikat-Gruppen in ${totalBatches} Batches (${BATCH_SIZE} pro Batch)`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, groupsToProcess.length);
      const currentBatch = groupsToProcess.slice(batchStart, batchEnd);
      
      console.log(`\nBatch ${batchIndex + 1}/${totalBatches}: Verarbeite ${currentBatch.length} Duplikat-Gruppen...`);
      
      // Verarbeite jede Gruppe von Duplikaten in diesem Batch
      for (const [normalizedName, group] of currentBatch) {
        try {
          // Wähle das primäre Produkt (bevorzugt mit vendonId)
          const productsWithVendonId = group.filter(p => p.vendonId);
          const primaryProduct = productsWithVendonId.length > 0 
            ? productsWithVendonId[0] 
            : group[0];
          
          // Bereite IDs der zu löschenden Duplikate vor
          const duplicateIds = group
            .filter(p => p.id !== primaryProduct.id)
            .map(p => p.id);
          
          if (duplicateIds.length === 0) continue;

          console.log(`\nProdukt "${normalizedName}" (ID: ${primaryProduct.id}):`);
          console.log(`  - ${duplicateIds.length} Duplikate werden auf Primär-ID ${primaryProduct.id} konsolidiert`);

          // Für jedes Lager...
          for (const warehouse of allWarehouses) {
            // 2.1 Aktualisiere Lagerbestandseinträge
            try {
              // Finde inventory_items, die auf die Duplikate verweisen
              const affectedInventoryItems = await db.select()
                .from(inventoryItems)
                .where(
                  and(
                    inArray(inventoryItems.productId, duplicateIds),
                    eq(inventoryItems.warehouseId, warehouse.id)
                  )
                );

              if (affectedInventoryItems.length > 0) {
                console.log(`  - ${affectedInventoryItems.length} inventory_items in Lager ${warehouse.id} (${warehouse.name}) gefunden für diese Duplikate`);
                
                // Prüfe, ob es bereits einen Eintrag für das Primärprodukt in diesem Lager gibt
                const existingPrimaryItem = await db.select()
                  .from(inventoryItems)
                  .where(
                    and(
                      eq(inventoryItems.productId, primaryProduct.id),
                      eq(inventoryItems.warehouseId, warehouse.id)
                    )
                  );
                
                if (existingPrimaryItem.length > 0) {
                  // Es gibt bereits einen Eintrag für das Primärprodukt - konsolidiere die Mengen
                  const primaryInventoryItem = existingPrimaryItem[0];
                  
                  // Berechne die Gesamtmenge aller Duplikate
                  const totalQuantity = affectedInventoryItems.reduce((sum, item) => {
                    return sum + (item.quantity || 0);
                  }, primaryInventoryItem.quantity || 0);
                  
                  // Aktualisiere den primären Eintrag mit der Gesamtmenge
                  await db.update(inventoryItems)
                    .set({ 
                      quantity: totalQuantity,
                      updatedAt: new Date()
                    })
                    .where(eq(inventoryItems.id, primaryInventoryItem.id));
                  
                  console.log(`  - Primärer Lagerbestandseintrag aktualisiert auf Gesamtmenge ${totalQuantity}`);
                  
                  // Lösche die doppelten Lagerbestandseinträge
                  const duplicateItemIds = affectedInventoryItems.map(item => item.id);
                  
                  await db.delete(inventoryItems)
                    .where(inArray(inventoryItems.id, duplicateItemIds));
                  
                  console.log(`  - ${duplicateItemIds.length} doppelte Lagerbestandseinträge gelöscht`);
                  
                  totalInventoryItemsUpdated++;
                  totalInventoryDuplicatesRemoved += duplicateItemIds.length;
                } else {
                  // Es gibt keinen Eintrag für das Primärprodukt - erstelle einen neuen
                  // Berechne die Gesamtmenge aller Duplikate
                  const totalQuantity = affectedInventoryItems.reduce((sum, item) => {
                    return sum + (item.quantity || 0);
                  }, 0);
                  
                  // Erstelle einen neuen Eintrag für das Primärprodukt
                  await db.insert(inventoryItems).values({
                    productId: primaryProduct.id,
                    warehouseId: warehouse.id,
                    quantity: totalQuantity,
                    minimumQuantity: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  });
                  
                  console.log(`  - Neuer Lagerbestandseintrag erstellt mit Gesamtmenge ${totalQuantity}`);
                  
                  // Lösche die doppelten Lagerbestandseinträge
                  const duplicateItemIds = affectedInventoryItems.map(item => item.id);
                  
                  await db.delete(inventoryItems)
                    .where(inArray(inventoryItems.id, duplicateItemIds));
                  
                  console.log(`  - ${duplicateItemIds.length} doppelte Lagerbestandseinträge gelöscht`);
                  
                  totalInventoryItemsUpdated++;
                  totalInventoryDuplicatesRemoved += duplicateItemIds.length;
                }
              }
            } catch (error) {
              console.error(`  - Fehler beim Aktualisieren von inventory_items in Lager ${warehouse.id}:`, error);
            }
          }

          // 2.2 Aktualisiere Referenzen in machine_stocks
          try {
            // Finde machine_stocks mit Verweisen auf die Duplikate
            const affectedMachineStocks = await db.select()
              .from(machineStocks)
              .where(inArray(machineStocks.productVendonId, duplicateIds.map(id => id.toString())));

            if (affectedMachineStocks.length > 0) {
              console.log(`  - ${affectedMachineStocks.length} machine_stocks Einträge gefunden für Duplikate`);
              
              // Update machine_stocks records
              for (const stock of affectedMachineStocks) {
                await db.update(machineStocks)
                  .set({ 
                    productVendonId: primaryProduct.vendonId || primaryProduct.id.toString(),
                    updatedAt: new Date()
                  })
                  .where(eq(machineStocks.id, stock.id));
              }
              
              totalMachineStocksUpdated += affectedMachineStocks.length;
              console.log(`  - ${affectedMachineStocks.length} machine_stocks Einträge aktualisiert`);
            }
          } catch (error) {
            console.error(`  - Fehler beim Aktualisieren von machine_stocks:`, error);
          }

          // 2.3 Aktualisiere Referenzen in inventory_count_items
          try {
            // Finde inventory_count_items mit Verweisen auf die Duplikate
            const affectedInventoryCountItems = await db.select()
              .from(inventoryCountItems)
              .where(inArray(inventoryCountItems.productId, duplicateIds));

            if (affectedInventoryCountItems.length > 0) {
              console.log(`  - ${affectedInventoryCountItems.length} inventory_count_items Einträge gefunden für Duplikate`);
              
              // Update inventory_count_items Einträge
              for (const item of affectedInventoryCountItems) {
                await db.update(inventoryCountItems)
                  .set({ 
                    productId: primaryProduct.id
                  })
                  .where(eq(inventoryCountItems.id, item.id));
              }
              
              totalInventoryCountItemsUpdated += affectedInventoryCountItems.length;
              console.log(`  - ${affectedInventoryCountItems.length} inventory_count_items Einträge auf Primärprodukt aktualisiert`);
            }
          } catch (error) {
            console.error(`  - Fehler beim Aktualisieren von inventory_count_items:`, error);
          }

          // 2.4 Aktualisiere Referenzen in purchase_conditions
          try {
            // Finde purchase_conditions mit Verweisen auf die Duplikate
            // SQL-Abfrage, da purchase_conditions nicht im Schema definiert ist
            const affectedPurchaseConditionsResult = await db.execute(
              sql`SELECT id, product_id FROM purchase_conditions WHERE product_id IN (${sql.join(duplicateIds)})`
            );
            
            const affectedPurchaseConditions = affectedPurchaseConditionsResult.rows;

            if (affectedPurchaseConditions && affectedPurchaseConditions.length > 0) {
              console.log(`  - ${affectedPurchaseConditions.length} purchase_conditions Einträge gefunden für Duplikate`);
              
              // Update purchase_conditions Einträge
              for (const condition of affectedPurchaseConditions) {
                await db.execute(
                  sql`UPDATE purchase_conditions SET product_id = ${primaryProduct.id} WHERE id = ${condition.id}`
                );
              }
              
              totalPurchaseConditionsUpdated += affectedPurchaseConditions.length;
              console.log(`  - ${affectedPurchaseConditions.length} purchase_conditions Einträge auf Primärprodukt aktualisiert`);
            }
          } catch (error) {
            console.error(`  - Fehler beim Aktualisieren von purchase_conditions:`, error);
          }

          // 2.5 Aktualisiere weitere mögliche Referenzen
          // Prüfe auf andere Tabellen mit Fremdschlüsselreferenzen zu products
          try {
            // Identifiziere alle anderen Tabellen mit product_id-Feldern (SQL-Metaabfrage)
            const tablesWithProductIdResult = await db.execute(
              sql`
              SELECT 
                tc.table_name, 
                kcu.column_name
              FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
              WHERE 
                tc.constraint_type = 'FOREIGN KEY' 
                AND ccu.table_name = 'products'
                AND tc.table_name NOT IN ('inventory_items', 'inventory_count_items', 'machine_stocks', 'purchase_conditions')
                AND tc.table_schema = 'public'
              `
            );

            const otherTables = tablesWithProductIdResult.rows;
            
            if (otherTables && otherTables.length > 0) {
              console.log(`  - Weitere ${otherTables.length} Tabellen mit Fremdschlüsselreferenzen gefunden`);
              
              for (const table of otherTables) {
                try {
                  const tableName = table.table_name;
                  const columnName = table.column_name;
                  
                  // Finde betroffene Einträge
                  const affectedEntriesResult = await db.execute(
                    sql`SELECT id FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(columnName)} IN (${sql.join(duplicateIds)})`
                  );
                  
                  const affectedEntries = affectedEntriesResult.rows;
                  
                  if (affectedEntries && affectedEntries.length > 0) {
                    console.log(`  - ${affectedEntries.length} Einträge in Tabelle ${tableName} gefunden`);
                    
                    // Update Einträge
                    await db.execute(
                      sql`UPDATE ${sql.identifier(tableName)} SET ${sql.identifier(columnName)} = ${primaryProduct.id} WHERE ${sql.identifier(columnName)} IN (${sql.join(duplicateIds)})`
                    );
                    
                    console.log(`  - ${affectedEntries.length} Einträge in Tabelle ${tableName} aktualisiert`);
                  }
                } catch (updateError) {
                  console.error(`  - Fehler beim Aktualisieren von ${table.table_name}:`, updateError);
                }
              }
            }
          } catch (metaError) {
            console.error(`  - Fehler bei der Identifizierung weiterer Tabellen:`, metaError);
          }

          // 2.6 Lösche die Produktduplikate
          try {
            await db.delete(products)
              .where(inArray(products.id, duplicateIds));
            
            totalProductDuplicatesRemoved += duplicateIds.length;
            console.log(`  - ${duplicateIds.length} duplizierte Produkte gelöscht`);
          } catch (error) {
            console.error(`  - Fehler beim Löschen der Duplikate:`, error);
            
            // Bei Fehler versuche, einzelne Produkte zu löschen, um zu identifizieren, welches Probleme bereitet
            console.log(`  - Versuche einzelnes Löschen, um problematische IDs zu identifizieren...`);
            
            let singleDeleteSuccess = 0;
            let singleDeleteFailure = 0;
            
            for (const id of duplicateIds) {
              try {
                await db.delete(products)
                  .where(eq(products.id, id));
                singleDeleteSuccess++;
              } catch (singleError) {
                singleDeleteFailure++;
                console.error(`  - Konnte Produkt ID ${id} nicht löschen: ${singleError.message}`);
              }
            }
            
            console.log(`  - Einzelnes Löschen: ${singleDeleteSuccess} erfolgreich, ${singleDeleteFailure} fehlgeschlagen`);
            totalProductDuplicatesRemoved += singleDeleteSuccess;
          }
        } catch (groupError) {
          console.error(`Fehler bei der Verarbeitung der Gruppe "${normalizedName}":`, groupError);
        }
      }
      
      console.log(`\nBatch ${batchIndex + 1}/${totalBatches} abgeschlossen.`);
      console.log(`Zwischenstand: ${totalProductDuplicatesRemoved} Produktduplikate entfernt.`);
      
      // Kurze Pause zwischen Batches, um der Datenbank Zeit zur Verarbeitung zu geben
      if (batchIndex < totalBatches - 1) {
        console.log('Kurze Pause vor dem nächsten Batch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 3. Finde und bereinige doppelte inventory_items (gleiches Produkt/Lager mit mehreren Einträgen)
    console.log('\n3. DOPPELTE LAGERBESTÄNDE KONSOLIDIEREN');
    console.log('-------------------------------------');
    
    // Erneut alle inventory_items laden (nach Aktualisierungen)
    const updatedInventoryItems = await db.select().from(inventoryItems);
    
    // Gruppiere nach Kombination von productId und warehouseId
    const inventoryItemGroups: Record<string, typeof updatedInventoryItems> = {};
    updatedInventoryItems.forEach(item => {
      const key = `${item.productId}_${item.warehouseId}`;
      if (!inventoryItemGroups[key]) {
        inventoryItemGroups[key] = [];
      }
      inventoryItemGroups[key].push(item);
    });
    
    // Finde Gruppen mit Duplikaten (mehrere Einträge für gleiches Produkt/Lager)
    const duplicateInventoryGroups = Object.entries(inventoryItemGroups)
      .filter(([_, group]) => group.length > 1);
    
    console.log(`${duplicateInventoryGroups.length} Gruppen mit doppelten Lagerbestandseinträgen gefunden.`);
    
    // Konsolidiere doppelte Lagerbestandseinträge
    let consolidatedInventoryGroups = 0;
    let removedInventoryDuplicates = 0;
    
    for (const [key, group] of duplicateInventoryGroups) {
      console.log(`\nKonsolidiere Lagerbestandsgruppe ${key} mit ${group.length} Einträgen...`);
      
      // Wähle den primären Eintrag (nehme den neuesten oder mit höchster ID)
      const primaryItem = group.reduce((best, current) => {
        return current.id > best.id ? current : best;
      }, group[0]);
      
      // Berechne die Gesamtmenge aller Einträge in der Gruppe
      const totalQuantity = group.reduce((sum, item) => sum + (item.quantity || 0), 0);
      
      // Aktualisiere den primären Eintrag mit der Gesamtmenge
      await db.update(inventoryItems)
        .set({ 
          quantity: totalQuantity,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, primaryItem.id));
      
      console.log(`  - Primärer Eintrag ID ${primaryItem.id} aktualisiert auf Gesamtmenge ${totalQuantity}`);
      
      // Lösche die Duplikate
      const duplicateItemIds = group
        .filter(item => item.id !== primaryItem.id)
        .map(item => item.id);
      
      if (duplicateItemIds.length > 0) {
        await db.delete(inventoryItems)
          .where(inArray(inventoryItems.id, duplicateItemIds));
        
        removedInventoryDuplicates += duplicateItemIds.length;
        console.log(`  - ${duplicateItemIds.length} doppelte Einträge gelöscht`);
      }
      
      consolidatedInventoryGroups++;
    }

    // 4. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    // Hole die aktuellen Anzahlen nach der Bereinigung
    const finalProductCount = await db.select({ count: sql`count(*)` })
      .from(products)
      .then(result => Number(result[0].count));
    
    const finalInventoryItemCount = await db.select({ count: sql`count(*)` })
      .from(inventoryItems)
      .then(result => Number(result[0].count));
    
    console.log('\n=== ZUSAMMENFASSUNG DER GESAMTBEREINIGUNG ===');
    console.log(`Ursprüngliche Produkte: ${allProducts.length} -> Nach Bereinigung: ${finalProductCount}`);
    console.log(`Ursprüngliche Lagereinträge: ${allInventoryItems.length} -> Nach Bereinigung: ${finalInventoryItemCount}`);
    console.log(`Produktduplikate entfernt: ${totalProductDuplicatesRemoved}`);
    console.log(`Lagerbestandseinträge aktualisiert: ${totalInventoryItemsUpdated}`);
    console.log(`Doppelte Lagerbestandseinträge entfernt: ${totalInventoryDuplicatesRemoved + removedInventoryDuplicates}`);
    console.log(`Inventory Count Items aktualisiert: ${totalInventoryCountItemsUpdated}`);
    console.log(`Machine Stocks aktualisiert: ${totalMachineStocksUpdated}`);
    console.log(`Purchase Conditions aktualisiert: ${totalPurchaseConditionsUpdated}`);
    console.log(`Reduktion um: ${Math.round((1 - finalProductCount / allProducts.length) * 100)}% (Produkte)`);
    console.log(`Reduktion um: ${Math.round((1 - finalInventoryItemCount / allInventoryItems.length) * 100)}% (Lagereinträge)`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    
    console.log('\nDie erweiterte Bereinigung wurde abgeschlossen!');
    console.log('Weitere Duplikatgruppen können mit weiteren Durchläufen bereinigt werden.');
    
  } catch (error) {
    console.error('Unerwarteter Fehler bei der Bereinigung:', error);
  }
}

// Führe die Funktion aus
advancedInventoryCleanup().then(() => {
  console.log('Bereinigung abgeschlossen. Beende Programm...');
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
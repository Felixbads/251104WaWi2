/**
 * Stapelweise Lagerbestandsbereinigung
 * 
 * Diese optimierte Version des Bereinigungsskripts verarbeitet Duplikate in Batches,
 * um Timeouts zu vermeiden und eine zuverlässigere Ausführung zu gewährleisten.
 * 
 * Anwendung: npx tsx scripts/batched_inventory_cleanup.ts
 */

import { db } from '../server/db';
import { products, machineStocks, inventoryCountItems, inventoryItems, warehouses } from '../shared/schema';
import { eq, sql, inArray, desc, isNull, isNotNull, and } from 'drizzle-orm';

// Konfigurationsparameter
const BATCH_SIZE = 5;  // Anzahl der Duplikat-Gruppen pro Batch

/**
 * Normalisiert einen Produktnamen für Vergleichszwecke
 */
const normalizeProductName = (name: string | null): string => {
  if (!name) return '';
  return name.toLowerCase().trim();
};

/**
 * Hauptfunktion zur stapelweisen Bereinigung
 */
async function batchedInventoryCleanup() {
  console.log('=================================================');
  console.log('STAPELWEISE LAGERBESTAND- UND PRODUKTBEREINIGUNG');
  console.log('=================================================');
  console.log('\nStarte optimierte Bereinigung...');
  
  const startTime = Date.now();

  // Statistiken
  let totalProductDuplicatesRemoved = 0;
  let totalInventoryItemsUpdated = 0;
  let totalInventoryDuplicatesRemoved = 0;
  let totalInventoryCountItemsUpdated = 0;
  let totalMachineStocksUpdated = 0;
  
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

    // 2. Verarbeite Duplikate in Batches
    console.log('\n2. PRODUKTDUPLIKATE UND REFERENZEN BEREINIGEN (IN BATCHES)');
    console.log('-----------------------------------------------------');
    
    const totalBatches = Math.ceil(duplicateGroups.length / BATCH_SIZE);
    console.log(`Verarbeite ${duplicateGroups.length} Duplikat-Gruppen in ${totalBatches} Batches (${BATCH_SIZE} pro Batch)`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, duplicateGroups.length);
      const currentBatch = duplicateGroups.slice(batchStart, batchEnd);
      
      console.log(`\nBatch ${batchIndex + 1}/${totalBatches}: Verarbeite ${currentBatch.length} Duplikat-Gruppen...`);
      
      // Verarbeite jede Gruppe von Duplikaten in diesem Batch
      for (const [normalizedName, group] of currentBatch) {
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

        // 2.4 Lösche die Produktduplikate
        try {
          await db.delete(products)
            .where(inArray(products.id, duplicateIds));
          
          totalProductDuplicatesRemoved += duplicateIds.length;
          console.log(`  - ${duplicateIds.length} duplizierte Produkte gelöscht`);
        } catch (error) {
          console.error(`  - Fehler beim Löschen der Duplikate:`, error);
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
    console.log(`Reduktion um: ${Math.round((1 - finalProductCount / allProducts.length) * 100)}% (Produkte)`);
    console.log(`Reduktion um: ${Math.round((1 - finalInventoryItemCount / allInventoryItems.length) * 100)}% (Lagereinträge)`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    
    console.log('\nDie stapelweise Bereinigung wurde erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung:', error);
  }
}

// Führe die Funktion aus
batchedInventoryCleanup().then(() => {
  console.log('Bereinigung abgeschlossen. Beende Programm...');
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
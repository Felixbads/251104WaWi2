/**
 * Gezieltes Bereinigungsskript für eine einzelne Produktgruppe
 * 
 * Dieses Skript bereinigt alle Duplikate für ein spezifisches Produkt,
 * identifiziert durch seinen normalisierten Namen.
 * 
 * Anwendung: npx tsx scripts/cleanup_single_product.ts "<normalisierter_produktname>"
 * Beispiel:   npx tsx scripts/cleanup_single_product.ts "wehlner milch 0,5l (milchhof fiedler, wehlen)"
 */

import { db } from '../server/db';
import { products, machineStocks, inventoryCountItems, inventoryItems, warehouses } from '../shared/schema';
import { eq, sql, inArray, desc, isNull, isNotNull, and, like } from 'drizzle-orm';

/**
 * Normalisiert einen Produktnamen für Vergleichszwecke
 */
const normalizeProductName = (name: string | null): string => {
  if (!name) return '';
  return name.toLowerCase().trim();
};

/**
 * Hauptfunktion zur Bereinigung eines einzelnen Produkts
 */
async function cleanupSingleProduct(normalizedProductName: string) {
  if (!normalizedProductName) {
    console.error('Fehler: Es wurde kein Produktname angegeben.');
    console.log('Verwendung: npx tsx scripts/cleanup_single_product.ts "<normalisierter_produktname>"');
    return;
  }

  console.log(`=================================================`);
  console.log(`GEZIELTE BEREINIGUNG FÜR: "${normalizedProductName}"`);
  console.log(`=================================================`);
  
  const startTime = Date.now();

  try {
    // Hole alle Lager
    console.log('\nLade alle Lager...');
    const allWarehouses = await db.select().from(warehouses);
    console.log(`${allWarehouses.length} Lager gefunden.`);

    // Finde alle Produkte mit dem angegebenen normalisierten Namen
    console.log(`\nSuche Produkte mit normalisiertem Namen "${normalizedProductName}"...`);
    
    const matchingProducts = await db.select()
      .from(products)
      .where(sql`LOWER(TRIM(product_name)) = ${normalizedProductName}`)
      .orderBy(desc(products.id));
    
    if (matchingProducts.length <= 1) {
      console.log(`Keine Duplikate gefunden für "${normalizedProductName}". Es gibt ${matchingProducts.length} Produkt(e) mit diesem Namen.`);
      return;
    }
    
    console.log(`${matchingProducts.length} Produkte mit diesem Namen gefunden.`);
    
    // Wähle das primäre Produkt (bevorzugt mit vendonId)
    const productsWithVendonId = matchingProducts.filter(p => p.vendonId);
    const primaryProduct = productsWithVendonId.length > 0 
      ? productsWithVendonId[0] 
      : matchingProducts[0];
    
    // Bereite IDs der zu löschenden Duplikate vor
    const duplicateIds = matchingProducts
      .filter(p => p.id !== primaryProduct.id)
      .map(p => p.id);
    
    console.log(`\nPrimäres Produkt ausgewählt: ID ${primaryProduct.id}, Name: "${primaryProduct.productName}"`);
    console.log(`${duplicateIds.length} Duplikate werden auf dieses Produkt konsolidiert.`);

    // Für jedes Lager...
    for (const warehouse of allWarehouses) {
      // 1. Aktualisiere Lagerbestandseinträge
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
          console.log(`\nInventar-Update für Lager ${warehouse.id} (${warehouse.name}):`);
          console.log(`  - ${affectedInventoryItems.length} betroffene inventory_items gefunden`);
          
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
          }
        }
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von inventory_items in Lager ${warehouse.id}:`, error);
      }
    }

    // 2. Aktualisiere Referenzen in machine_stocks
    try {
      // Finde machine_stocks mit Verweisen auf die Duplikate
      const affectedMachineStocks = await db.select()
        .from(machineStocks)
        .where(inArray(machineStocks.productVendonId, duplicateIds.map(id => id.toString())));

      if (affectedMachineStocks.length > 0) {
        console.log(`\nMachine Stocks Update:`);
        console.log(`  - ${affectedMachineStocks.length} betroffene machine_stocks gefunden`);
        
        // Update machine_stocks records
        for (const stock of affectedMachineStocks) {
          await db.update(machineStocks)
            .set({ 
              productVendonId: primaryProduct.vendonId || primaryProduct.id.toString(),
              updatedAt: new Date()
            })
            .where(eq(machineStocks.id, stock.id));
        }
        
        console.log(`  - ${affectedMachineStocks.length} machine_stocks aktualisiert`);
      }
    } catch (error) {
      console.error(`\nFehler beim Aktualisieren von machine_stocks:`, error);
    }

    // 3. Aktualisiere Referenzen in inventory_count_items
    try {
      // Finde inventory_count_items mit Verweisen auf die Duplikate
      const affectedInventoryCountItems = await db.select()
        .from(inventoryCountItems)
        .where(inArray(inventoryCountItems.productId, duplicateIds));

      if (affectedInventoryCountItems.length > 0) {
        console.log(`\nInventory Count Items Update:`);
        console.log(`  - ${affectedInventoryCountItems.length} betroffene inventory_count_items gefunden`);
        
        // Update inventory_count_items Einträge
        for (const item of affectedInventoryCountItems) {
          await db.update(inventoryCountItems)
            .set({ 
              productId: primaryProduct.id
            })
            .where(eq(inventoryCountItems.id, item.id));
        }
        
        console.log(`  - ${affectedInventoryCountItems.length} inventory_count_items auf Primärprodukt aktualisiert`);
      }
    } catch (error) {
      console.error(`\nFehler beim Aktualisieren von inventory_count_items:`, error);
    }

    // 4. Lösche die Produktduplikate
    try {
      console.log(`\nLösche Produktduplikate...`);
      await db.delete(products)
        .where(inArray(products.id, duplicateIds));
      
      console.log(`  - ${duplicateIds.length} duplizierte Produkte gelöscht`);
    } catch (error) {
      console.error(`\nFehler beim Löschen der Duplikate:`, error);
    }

    // 5. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    console.log(`\n=== ZUSAMMENFASSUNG ===`);
    console.log(`Produktname: "${primaryProduct.productName}"`);
    console.log(`Primär-ID: ${primaryProduct.id}`);
    console.log(`Entfernte Duplikate: ${duplicateIds.length}`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    
    console.log(`\nProdukt "${normalizedProductName}" wurde erfolgreich bereinigt.`);
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung:', error);
  }
}

// Führe die Funktion mit dem übergebenen Produktnamen aus
const productName = process.argv[2];
cleanupSingleProduct(productName).then(() => {
  console.log('\nBereinigung abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
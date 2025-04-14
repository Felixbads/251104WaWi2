/**
 * Skript zur Bereinigung von Produktduplikaten in der Datenbank
 * 
 * Dieses Skript identifiziert Produktduplikate basierend auf normalisierte Namen
 * und konsolidiert sie zu einem einzigen Produkt mit korrekt gesetztem vendonId.
 * Anschließend werden die Verweise in machine_stocks aktualisiert.
 * 
 * Anwendung: node scripts/cleanup_product_duplicates.js
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { products, machineStocks, stocks } from '../shared/schema.js';
import { eq, sql, inArray, desc, like, ilike } from 'drizzle-orm';

/**
 * Hauptfunktion zur Bereinigung von Produktduplikaten
 */
async function cleanupProductDuplicates() {
  console.log('Starte Bereinigung von Produktduplikaten...');
  const startTime = Date.now();

  try {
    // 1. Hole alle Produkte aus der Datenbank
    console.log('Lade alle Produkte aus der Datenbank...');
    const allProducts = await db.select().from(products).orderBy(desc(products.id));
    console.log(`${allProducts.length} Produkte gefunden.`);

    // 2. Normalisiere Produktnamen für Vergleich
    const normalizeProductName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim();
    };

    // 3. Gruppiere Produkte nach normalisiertem Namen
    console.log('Suche Duplikate basierend auf normalisiertem Namen...');
    const productGroups = {};
    const productsWithoutName = [];

    allProducts.forEach(product => {
      if (!product.productName) {
        productsWithoutName.push(product);
        return;
      }

      const normalizedName = normalizeProductName(product.productName);
      if (!productGroups[normalizedName]) {
        productGroups[normalizedName] = [];
      }
      productGroups[normalizedName].push(product);
    });

    // 4. Identifiziere Duplikate (Gruppen mit mehr als einem Produkt)
    const duplicateGroups = Object.entries(productGroups)
      .filter(([name, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length); // Sortiere nach Anzahl der Duplikate

    console.log(`${duplicateGroups.length} Produktgruppen mit Duplikaten gefunden.`);
    
    // Zusammenfassung der höchsten Duplikate
    if (duplicateGroups.length > 0) {
      console.log('\nTop 10 Produkte mit den meisten Duplikaten:');
      duplicateGroups.slice(0, 10).forEach(([name, group]) => {
        console.log(`  - "${name}": ${group.length} Duplikate`);
      });
    }

    // 5. Bereinigen der Duplikate
    console.log('\nBereinige Duplikate...');
    let totalDuplicatesRemoved = 0;
    let machineStocksUpdated = 0;
    let stocksUpdated = 0;

    for (const [normalizedName, group] of duplicateGroups) {
      // Wähle das primäre Produkt aus (bevorzuge das mit vendonId oder das neueste)
      const productsWithVendonId = group.filter(p => p.vendonId);
      
      // Wähle das primäre Produkt (bevorzuge eines mit vendonId)
      const primaryProduct = productsWithVendonId.length > 0 
        ? productsWithVendonId[0] 
        : group[0];
      
      // Bereite IDs der zu löschenden Duplikate vor
      const duplicateIds = group
        .filter(p => p.id !== primaryProduct.id)
        .map(p => p.id);
      
      if (duplicateIds.length === 0) {
        continue; // Nichts zu tun
      }

      console.log(`\nProdukt "${normalizedName}" (ID: ${primaryProduct.id}):`);
      console.log(`  - ${duplicateIds.length} Duplikate werden auf Primär-ID ${primaryProduct.id} konsolidiert`);

      // 6. Aktualisiere Referenzen in machine_stocks
      try {
        // Finde machine_stocks mit Verweisen auf die Duplikate
        const affectedMachineStocks = await db.select()
          .from(machineStocks)
          .where(inArray(sql`${machineStocks.productVendonId}::int`, duplicateIds.map(id => id.toString())));

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
          
          machineStocksUpdated += affectedMachineStocks.length;
          console.log(`  - ${affectedMachineStocks.length} machine_stocks Einträge aktualisiert`);
        }
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von machine_stocks:`, error);
      }

      // 7. Aktualisiere Referenzen in stocks, falls vorhanden
      try {
        // Finde stocks mit Verweisen auf die Duplikate
        const affectedStocks = await db.select()
          .from(stocks)
          .where(inArray(sql`${stocks.productId}::int`, duplicateIds));

        if (affectedStocks.length > 0) {
          console.log(`  - ${affectedStocks.length} stocks Einträge gefunden für Duplikate`);
          
          // Update stocks records
          for (const stock of affectedStocks) {
            await db.update(stocks)
              .set({ 
                productId: primaryProduct.id,
                updatedAt: new Date()
              })
              .where(eq(stocks.id, stock.id));
          }
          
          stocksUpdated += affectedStocks.length;
          console.log(`  - ${affectedStocks.length} stocks Einträge aktualisiert`);
        }
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von stocks:`, error);
      }

      // 8. Lösche die Duplikate
      try {
        const result = await db.delete(products)
          .where(inArray(products.id, duplicateIds));
        
        totalDuplicatesRemoved += duplicateIds.length;
        console.log(`  - ${duplicateIds.length} duplizierte Produkte gelöscht`);
      } catch (error) {
        console.error(`  - Fehler beim Löschen der Duplikate:`, error);
      }
    }

    // 9. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    console.log('\n=== Zusammenfassung der Bereinigung ===');
    console.log(`Ursprüngliche Produktanzahl: ${allProducts.length}`);
    console.log(`Bereinigte Duplikate: ${totalDuplicatesRemoved}`);
    console.log(`Neue Produktanzahl: ${allProducts.length - totalDuplicatesRemoved}`);
    console.log(`MachineStocks aktualisiert: ${machineStocksUpdated}`);
    console.log(`Stocks aktualisiert: ${stocksUpdated}`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);

    console.log('\nDie Bereinigung wurde erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung von Produktduplikaten:', error);
  }
}

// Führe die Funktion aus
cleanupProductDuplicates().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
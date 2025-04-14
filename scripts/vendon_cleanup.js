/**
 * Hauptskript zur Bereinigung von Vendon-Duplikaten und Lagerbeständen
 * 
 * Dieses Skript führt eine vollständige Bereinigung durch:
 * 1. Identifiziert Produktduplikate basierend auf normalisiertem Namen
 * 2. Konsolidiert Duplikate und aktualisiert Referenzen in machine_stocks
 * 3. Bereinigt ungültige und duplizierte Lagerbestände
 * 
 * Anwendung: node scripts/vendon_cleanup.js
 */

import { db } from '../server/db.ts';
import { products, machineStocks, stocks } from '../shared/schema.ts';
import { eq, sql, inArray, desc, like, ilike } from 'drizzle-orm';

/**
 * Hauptfunktion zur Bereinigung von Produktduplikaten und Lagerbeständen
 */
async function cleanupVendonData() {
  console.log('==============================================');
  console.log('VENDON DUPLIKAT- UND LAGERBESTAND-BEREINIGUNG');
  console.log('==============================================');
  console.log('\nStarte Bereinigung...');
  
  const startTime = Date.now();

  try {
    // 1. Hole alle Produkte aus der Datenbank
    console.log('\n1. PRODUKTDUPLIKATE IDENTIFIZIEREN');
    console.log('------------------------------------');
    console.log('Lade alle Produkte aus der Datenbank...');
    const allProducts = await db.select().from(products).orderBy(desc(products.id));
    console.log(`${allProducts.length} Produkte gefunden.`);

    // 2. Normalisiere Produktnamen für Vergleich
    const normalizeProductName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim();
    };

    // 3. Gruppiere Produkte nach normalisiertem Namen
    console.log('\nSuche Duplikate basierend auf normalisiertem Namen...');
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
    console.log('\n2. PRODUKTDUPLIKATE BEREINIGEN');
    console.log('-----------------------------');
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
        await db.delete(products)
          .where(inArray(products.id, duplicateIds));
        
        totalDuplicatesRemoved += duplicateIds.length;
        console.log(`  - ${duplicateIds.length} duplizierte Produkte gelöscht`);
      } catch (error) {
        console.error(`  - Fehler beim Löschen der Duplikate:`, error);
      }
    }

    // 9. Bereinige Lagerbestände (machine_stocks)
    console.log('\n3. LAGERBESTÄNDE BEREINIGEN');
    console.log('---------------------------');
    
    // Hole aktualisierte Produktliste nach der Duplikatbereinigung
    const cleanedProducts = await db.select().from(products);
    const validProductIds = new Set();
    const validVendonIds = new Set();
    
    cleanedProducts.forEach(product => {
      validProductIds.add(product.id);
      if (product.vendonId) {
        validVendonIds.add(product.vendonId);
      } else {
        validVendonIds.add(product.id.toString());
      }
    });
    
    // Hole alle machine_stocks Einträge
    console.log('Lade alle Lagerbestände aus der Datenbank...');
    const allMachineStocks = await db.select().from(machineStocks);
    console.log(`${allMachineStocks.length} Lagerbestand-Einträge gefunden.`);
    
    // Identifiziere ungültige Einträge (Produkte, die nicht mehr existieren)
    console.log('\nIdentifiziere Einträge mit ungültigen Produktreferenzen...');
    const invalidStocks = allMachineStocks.filter(stock => {
      return !validVendonIds.has(stock.productVendonId);
    });
    
    console.log(`${invalidStocks.length} Einträge mit ungültigen Produktreferenzen gefunden.`);
    
    // Lösche ungültige Einträge
    if (invalidStocks.length > 0) {
      console.log('Lösche Einträge mit ungültigen Produktreferenzen...');
      const invalidStockIds = invalidStocks.map(stock => stock.id);
      
      await db.delete(machineStocks)
        .where(inArray(machineStocks.id, invalidStockIds));
      
      console.log(`${invalidStocks.length} Einträge mit ungültigen Referenzen gelöscht.`);
    }
    
    // Identifiziere Duplikate anhand von (machineId + productVendonId)
    console.log('\nSuche nach Duplikaten in den Lagerbeständen...');
    
    // Gruppiere nach Kombination aus machineId und productVendonId
    const stockGroups = {};
    allMachineStocks.forEach(stock => {
      if (invalidStocks.some(invalidStock => invalidStock.id === stock.id)) {
        return; // Überspringe bereits als ungültig identifizierte Einträge
      }
      
      const key = `${stock.machineId}_${stock.productVendonId}`;
      if (!stockGroups[key]) {
        stockGroups[key] = [];
      }
      stockGroups[key].push(stock);
    });
    
    // Filtere Gruppen mit mehr als einem Eintrag (Duplikate)
    const duplicateStockGroups = Object.entries(stockGroups)
      .filter(([key, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    
    console.log(`${duplicateStockGroups.length} Gruppen mit Duplikaten in den Lagerbeständen gefunden.`);
    
    // Bereinige Duplikate in Lagerbeständen
    let consolidatedGroups = 0;
    let removedStockDuplicates = 0;
    
    for (const [key, group] of duplicateStockGroups) {
      console.log(`\nKonsolidiere Gruppe "${key}" mit ${group.length} Einträgen...`);
      
      // Wähle das primäre Objekt (neuestes oder mit höchster Menge)
      const primaryStock = group.reduce((best, current) => {
        // Bevorzuge den neuesten Eintrag, bei gleichem Datum bevorzuge den mit höherer Menge
        if (!best.lastSync && current.lastSync) return current;
        if (best.lastSync && current.lastSync && current.lastSync > best.lastSync) return current;
        if (best.quantity < current.quantity) return current;
        return best;
      }, group[0]);
      
      console.log(`  - Primärer Eintrag ID ${primaryStock.id} ausgewählt (Menge: ${primaryStock.quantity})`);
      
      // Berechne die Gesamtmenge aller Einträge in der Gruppe
      const totalQuantity = group.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
      console.log(`  - Gesamtmenge aller Einträge: ${totalQuantity}`);
      
      // Erstelle eine Liste der zu löschenden Duplikate
      const duplicateStockIds = group
        .filter(stock => stock.id !== primaryStock.id)
        .map(stock => stock.id);
      
      // Aktualisiere den primären Eintrag mit der Gesamtmenge
      await db.update(machineStocks)
        .set({ 
          quantity: totalQuantity,
          updatedAt: new Date()
        })
        .where(eq(machineStocks.id, primaryStock.id));
      
      console.log(`  - Primärer Eintrag auf Gesamtmenge ${totalQuantity} aktualisiert`);
      
      // Lösche die Duplikate
      if (duplicateStockIds.length > 0) {
        await db.delete(machineStocks)
          .where(inArray(machineStocks.id, duplicateStockIds));
        
        removedStockDuplicates += duplicateStockIds.length;
        console.log(`  - ${duplicateStockIds.length} Duplikate gelöscht`);
      }
      
      consolidatedGroups++;
    }

    // 10. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    console.log('\n=== ZUSAMMENFASSUNG DER BEREINIGUNG ===');
    console.log(`Ursprüngliche Produktanzahl: ${allProducts.length}`);
    console.log(`Bereinigte Produktduplikate: ${totalDuplicatesRemoved}`);
    console.log(`Neue Produktanzahl: ${allProducts.length - totalDuplicatesRemoved}`);
    console.log(`MachineStocks aktualisiert: ${machineStocksUpdated}`);
    console.log(`Stocks aktualisiert: ${stocksUpdated}`);
    console.log(`Ungültige Lagerbestände gelöscht: ${invalidStocks.length}`);
    console.log(`Duplizierte Lagerbestände konsolidiert: ${removedStockDuplicates}`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);

    console.log('\nDie Bereinigung wurde erfolgreich abgeschlossen!');
    console.log('\nWichtige Hinweise:');
    console.log('- Wenn noch Probleme mit Duplikaten auftreten, führen Sie das Skript erneut aus.');
    console.log('- Die verbesserte syncProducts-Funktion verhindert neue Duplikate.');
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung:', error);
  }
}

// Führe die Funktion aus
cleanupVendonData().then(() => {
  console.log('Bereinigung abgeschlossen. Beende Programm...');
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
/**
 * Bereinigung der Lagerbestände (machine_stocks) nach der Produktbereinigung
 * 
 * Dieses Skript bereinigt die Lagerbestände, indem es:
 * 1. Produkte mit ungültigen Referenzen entfernt
 * 2. Duplikate in den Lagerbeständen (gleiche Maschine, gleiches Produkt) zusammenführt
 * 
 * Anwendung: node scripts/cleanup_machine_stocks.js
 */

require('dotenv').config();
const { db } = require('../server/db');
const { products, machineStocks, machines } = require('../shared/schema');
const { eq, sql, inArray, desc, like, ilike, and, isNull } = require('drizzle-orm');

/**
 * Hauptfunktion zur Bereinigung der Lagerbestände
 */
async function cleanupMachineStocks() {
  console.log('Starte Bereinigung der Lagerbestände...');
  const startTime = Date.now();

  try {
    // 1. Hole alle machine_stocks Einträge
    console.log('Lade alle Lagerbestände aus der Datenbank...');
    const allMachineStocks = await db.select().from(machineStocks).orderBy(desc(machineStocks.id));
    console.log(`${allMachineStocks.length} Lagerbestand-Einträge gefunden.`);

    // 2. Hole alle gültigen Produkte für Referenzprüfung
    console.log('Lade alle Produkte zur Referenzprüfung...');
    const allProducts = await db.select().from(products);
    const validProductVendonIds = new Set();
    const productIdToVendonId = new Map();
    
    allProducts.forEach(product => {
      if (product.vendonId) {
        validProductVendonIds.add(product.vendonId);
        productIdToVendonId.set(product.id.toString(), product.vendonId);
      } else {
        // Wenn kein vendonId, verwende die ID als vendonId (Fallback)
        validProductVendonIds.add(product.id.toString());
        productIdToVendonId.set(product.id.toString(), product.id.toString());
      }
    });
    
    // 3. Identifiziere ungültige Einträge (Produkte, die nicht mehr existieren)
    console.log('Identifiziere Einträge mit ungültigen Produktreferenzen...');
    const invalidStocks = allMachineStocks.filter(stock => {
      return !validProductVendonIds.has(stock.productVendonId);
    });
    
    console.log(`${invalidStocks.length} Einträge mit ungültigen Produktreferenzen gefunden.`);
    
    // 4. Lösche ungültige Einträge
    if (invalidStocks.length > 0) {
      console.log('Lösche Einträge mit ungültigen Produktreferenzen...');
      const invalidStockIds = invalidStocks.map(stock => stock.id);
      
      await db.delete(machineStocks)
        .where(inArray(machineStocks.id, invalidStockIds));
      
      console.log(`${invalidStocks.length} Einträge mit ungültigen Referenzen gelöscht.`);
    }
    
    // 5. Identifiziere Duplikate anhand von (machineId + productVendonId)
    console.log('Suche nach Duplikaten in den Lagerbeständen...');
    
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
    const duplicateGroups = Object.entries(stockGroups)
      .filter(([key, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    
    console.log(`${duplicateGroups.length} Gruppen mit Duplikaten in den Lagerbeständen gefunden.`);
    
    // 6. Bereinige Duplikate
    let consolidatedGroups = 0;
    let removedDuplicates = 0;
    
    for (const [key, group] of duplicateGroups) {
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
      const duplicateIds = group
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
      if (duplicateIds.length > 0) {
        await db.delete(machineStocks)
          .where(inArray(machineStocks.id, duplicateIds));
        
        removedDuplicates += duplicateIds.length;
        console.log(`  - ${duplicateIds.length} Duplikate gelöscht`);
      }
      
      consolidatedGroups++;
    }
    
    // 7. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    console.log('\n=== Zusammenfassung der Lagerbestand-Bereinigung ===');
    console.log(`Ursprüngliche Anzahl an Lagerbestandseinträgen: ${allMachineStocks.length}`);
    console.log(`Gelöschte ungültige Einträge: ${invalidStocks.length}`);
    console.log(`Konsolidierte Duplikatgruppen: ${consolidatedGroups}`);
    console.log(`Entfernte Duplikate: ${removedDuplicates}`);
    console.log(`Neue Anzahl an Lagerbestandseinträgen: ${allMachineStocks.length - invalidStocks.length - removedDuplicates}`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    
    console.log('\nDie Bereinigung der Lagerbestände wurde erfolgreich abgeschlossen!');
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung der Lagerbestände:', error);
  }
}

// Führe die Funktion aus
cleanupMachineStocks().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
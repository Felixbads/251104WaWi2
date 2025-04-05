/**
 * Skript zum Testen des automatischen Lagerabgleichs
 */

const { db } = require('./server/db');
const { storage } = require('./server/storage');

// Manueller Lagerabgleich ohne Abhängigkeit vom warehouseReconciliation-Modul
async function reconcileWarehouseProducts() {
  console.log("Starte manuellen Lagerabgleich...");
  const startTime = Date.now();
  
  let warehousesChecked = 0;
  let machinesChecked = 0;
  let productsFound = 0;
  let productsAdded = 0;
  let errors = 0;
  
  try {
    // 1. Hole alle Maschinen und Lager-Zuordnungen
    const assignments = await storage.getMachineWarehouseAssignments();
    console.log(`${assignments.length} Maschinen-Lager-Zuordnungen gefunden`);
    
    // 2. Für jede Zuordnung, hole Produkte und füge sie dem Lager hinzu
    for (const assignment of assignments) {
      const warehouseId = Number(assignment.warehouseId);
      const machineId = Number(assignment.machineId);
      
      if (!warehouseId || !machineId) continue;
      
      machinesChecked++;
      warehousesChecked++;
      
      try {
        // 3. Hole Produkte dieser Maschine
        const transactions = await storage.getTransactionsByMachine(machineId, 100);
        console.log(`${transactions.length} Transaktionen für Maschine ${machineId} gefunden`);
        
        // 4. Identifiziere einmalige Produkt-IDs
        const productIds = new Set();
        
        for (const transaction of transactions) {
          if (transaction.productId) {
            productIds.add(Number(transaction.productId));
            productsFound++;
          }
        }
        
        console.log(`${productIds.size} einzigartige Produkte für Lager ${warehouseId} identifiziert`);
        
        // 5. Hole existierende Inventar-Einträge
        const existingItems = await storage.getInventoryItemsByWarehouse(warehouseId);
        const existingProductIds = new Set(
          existingItems.map(item => item.productId ? Number(item.productId) : -1)
        );
        
        console.log(`${existingProductIds.size} existierende Produkte in Lager ${warehouseId}`);
        
        // 6. Finde fehlende Produkte
        const missingProductIds = [...productIds].filter(id => !existingProductIds.has(id));
        
        console.log(`${missingProductIds.length} fehlende Produkte in Lager ${warehouseId}`);
        
        // 7. Füge fehlende Produkte hinzu
        for (const productId of missingProductIds) {
          try {
            // Prüfe, ob das Produkt existiert
            const product = await storage.getProduct(productId);
            
            if (!product) {
              console.log(`Produkt mit ID ${productId} nicht gefunden`);
              continue;
            }
            
            // Erstelle Inventar-Eintrag
            const inventoryItem = {
              warehouseId,
              productId,
              quantity: 0,
              minQuantity: 5,
              status: "active",
              notes: `Automatisch hinzugefügt am ${new Date().toISOString().split('T')[0]}`,
              lastCountDate: new Date()
            };
            
            // Füge Eintrag hinzu
            const newItem = await storage.createInventoryItem(inventoryItem);
            
            if (newItem && newItem.id) {
              productsAdded++;
              console.log(`✅ Produkt ${productId} (${product.productName}) zu Lager ${warehouseId} hinzugefügt mit ID ${newItem.id}`);
            } else {
              errors++;
              console.error(`❌ Fehler beim Hinzufügen von Produkt ${productId} zu Lager ${warehouseId}`);
            }
          } catch (error) {
            errors++;
            console.error(`Fehler beim Verarbeiten von Produkt ${productId}:`, error);
          }
        }
      } catch (error) {
        errors++;
        console.error(`Fehler beim Verarbeiten von Maschine ${machineId}:`, error);
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    return {
      processingTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors
    };
  } catch (error) {
    console.error('Kritischer Fehler:', error);
    return {
      processingTime: Date.now() - startTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors: errors + 1
    };
  }
}

async function main() {
  console.log('Starte automatischen Lagerabgleich...');
  
  try {
    const result = await reconcileWarehouseProducts();
    
    console.log('Ergebnis des Lagerabgleichs:');
    console.log('----------------------------------------');
    console.log(`Verarbeitungszeit: ${result.processingTime}ms`);
    console.log(`Lager geprüft: ${result.warehousesChecked}`);
    console.log(`Automaten geprüft: ${result.machinesChecked}`);
    console.log(`Produkte gefunden: ${result.productsFound}`);
    console.log(`Produkte hinzugefügt: ${result.productsAdded}`);
    console.log(`Fehler: ${result.errors}`);
    console.log('----------------------------------------');
    console.log('Lagerabgleich abgeschlossen!');
  } catch (error) {
    console.error('Fehler beim Ausführen des Lagerabgleichs:', error);
  }
}

main().catch(console.error);
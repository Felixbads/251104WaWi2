/**
 * Skript zum manuellen Auslösen des Lagerabgleichs
 */
const { storage } = require('./server/storage');
const { reconcileWarehouseProducts } = require('./server/services/warehouseReconciliation');
const { rawDb } = require('./server/db');

async function triggerWarehouseReconciliation() {
  try {
    console.log('Starte manuellen Lagerabgleich für alle Lager...');
    
    // Hole alle aktiven Lager
    const warehouses = await storage.getWarehouses();
    console.log(`Gefunden: ${warehouses.length} aktive Lager`);
    
    // Führe für jedes Lager die Reconciliation durch
    for (const warehouse of warehouses) {
      console.log(`\nStarte Abgleich für Lager: ${warehouse.name} (ID: ${warehouse.id})`);
      const result = await reconcileWarehouseProducts(
        warehouse.id,       // Lager-ID
        true,               // syncAllProducts = true
        true                // forceCreateInventoryItems = true
      );
      
      console.log(`Abgleich für Lager ${warehouse.name} abgeschlossen:`);
      console.log(`- Produkte gefunden: ${result.productsFound}`);
      console.log(`- Produkte hinzugefügt: ${result.productsAdded}`);
      console.log(`- Produkte aus Portfolio: ${result.allProductsAdded}`);
      console.log(`- Inventory Items erstellt: ${result.inventoryItemsCreated}`);
      console.log(`- Fehler: ${result.errors}`);
    }
    
    console.log('\nLagerabgleich für alle Lager abgeschlossen!');
    
    // Prüfe anschließend, ob inventory_items erstellt wurden
    const inventoryItemCount = await checkInventoryItems();
    console.log(`\nAnzahl der inventory_items nach dem Abgleich: ${inventoryItemCount}`);
    
  } catch (error) {
    console.error('Fehler beim Ausführen des Lagerabgleichs:', error);
  }
}

async function checkInventoryItems() {
  try {
    // Direkte SQL-Abfrage, um die Anzahl der Einträge zu ermitteln
    const result = await rawDb.query('SELECT COUNT(*) FROM inventory_items');
    return result.rows[0].count;
  } catch (error) {
    console.error('Fehler beim Prüfen der inventory_items:', error);
    return 'Fehler';
  }
}

// Führe den Lagerabgleich aus
triggerWarehouseReconciliation();
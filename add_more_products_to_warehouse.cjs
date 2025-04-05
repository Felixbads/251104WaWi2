/**
 * Skript zum manuellen Hinzufügen von Produkten zu einem Lager.
 * Dieses Skript wird verwendet, wenn der automatische Lagerabgleich
 * nicht wie erwartet funktioniert.
 */

const { db } = require('./server/db');
const { storage } = require('./server/storage');

// IDs der Produkte, die wir zum Lager hinzufügen möchten
const productIdsToAdd = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

// ID des Lagers
const warehouseId = 4; // Bahnhof Bad Schandau

async function addProductsToWarehouse() {
  console.log(`Füge Produkte zu Lager #${warehouseId} hinzu...`);
  let addedCount = 0;
  let errorCount = 0;
  
  // Bereits im Lager vorhandene Produkte abrufen
  console.log("Prüfe bereits vorhandene Produkte im Lager...");
  const existingItems = await storage.getInventoryItemsByWarehouse(warehouseId);
  const existingProductIds = new Set(existingItems.map(item => item.productId ? Number(item.productId) : -1));
  
  console.log(`Lager hat bereits ${existingProductIds.size} Produkte`);
  
  for (const productId of productIdsToAdd) {
    // Prüfen, ob das Produkt bereits im Lager vorhanden ist
    if (existingProductIds.has(productId)) {
      console.log(`Produkt #${productId} ist bereits im Lager vorhanden, überspringe...`);
      continue;
    }
    
    try {
      // Hole Produktdaten
      const product = await storage.getProduct(productId);
      
      if (!product) {
        console.log(`Produkt #${productId} nicht gefunden, überspringe...`);
        continue;
      }
      
      console.log(`Füge Produkt "${product.productName}" (ID: ${productId}) zu Lager #${warehouseId} hinzu...`);
      
      // Erstelle Inventar-Eintrag für das Produkt
      const inventoryItem = {
        warehouseId: Number(warehouseId),
        productId: Number(productId),
        quantity: 0, // Anfangsbestand ist 0
        minQuantity: 5, // Standardwert für Mindestbestand
        status: "active",
        notes: `Manuell hinzugefügt am ${new Date().toISOString().split('T')[0]}`,
        lastCountDate: new Date()
      };
      
      // Füge Inventar-Eintrag hinzu
      const newItem = await storage.createInventoryItem(inventoryItem);
      
      if (newItem && newItem.id) {
        addedCount++;
        console.log(`✅ Produkt #${productId} "${product.productName}" erfolgreich zu Lager #${warehouseId} hinzugefügt mit ID ${newItem.id}`);
      } else {
        errorCount++;
        console.error(`❌ Fehler beim Hinzufügen von Produkt #${productId} "${product.productName}" zu Lager #${warehouseId}`);
      }
    } catch (error) {
      errorCount++;
      console.error(`Fehler beim Verarbeiten von Produkt #${productId}:`, error);
    }
  }
  
  console.log(`\nZusammenfassung:`);
  console.log(`--------------`);
  console.log(`Produkte hinzugefügt: ${addedCount}`);
  console.log(`Fehler: ${errorCount}`);
  console.log(`--------------`);
}

// Skript ausführen
addProductsToWarehouse()
  .then(() => {
    console.log("Skript abgeschlossen.");
    process.exit(0);
  })
  .catch(error => {
    console.error("Kritischer Fehler beim Ausführen des Skripts:", error);
    process.exit(1);
  });
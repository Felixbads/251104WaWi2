/**
 * Automatischer Lagerabgleich-Service
 * 
 * Dieser Service stellt sicher, dass alle Produkte, die in Automaten verwendet werden,
 * auch in den zugehörigen Lagern geführt werden. Der Abgleich wird beim Anwendungsstart
 * durchgeführt und fügt fehlende Produkte in den jeweiligen Lagern hinzu (mit Anfangsbestand 0).
 */

import { storage } from "../storage";
import { InsertInventoryItem } from "@shared/schema";
import type { MachineWarehouseAssignment, Transaction } from "@shared/schema";

/**
 * Führt den automatischen Lagerabgleich zwischen Automaten und Lagern durch.
 * Jedes Produkt, das in einem Automaten geführt wird, wird dem zugeordneten Lager hinzugefügt,
 * sofern es dort noch nicht existiert.
 * 
 * @param specificWarehouseId - Optional: Wenn angegeben, wird nur dieses spezifische Lager abgeglichen
 */
export async function reconcileWarehouseProducts(specificWarehouseId?: number): Promise<{
  processingTime: number;
  warehousesChecked: number;
  machinesChecked: number;
  productsFound: number;
  productsAdded: number;
  errors: number;
}> {
  console.log("Starte automatischen Lagerabgleich...", 
              specificWarehouseId ? `für Lager ${specificWarehouseId}` : "für alle Lager");
  const startTime = Date.now();
  
  let warehousesChecked = 0;
  let machinesChecked = 0;
  let productsFound = 0;
  let productsAdded = 0;
  let errors = 0;
  
  try {
    // 1. Lager-Automaten-Zuordnungen abrufen (gefiltert oder alle)
    let machineWarehouseAssignments;
    
    if (specificWarehouseId) {
      // Nur Zuordnungen für das angegebene Lager laden
      machineWarehouseAssignments = await storage.getMachineWarehouseAssignmentsByWarehouse(specificWarehouseId);
      console.log(`${machineWarehouseAssignments.length} Maschinen-Zuordnungen für Lager ${specificWarehouseId} gefunden`);
    } else {
      // Alle Zuordnungen laden
      machineWarehouseAssignments = await storage.getMachineWarehouseAssignments();
      console.log(`${machineWarehouseAssignments.length} Maschinen-Lager-Zuordnungen gefunden`);
    }
    
    // Manuelles Mapping für Lager zu Produkt-IDs
    const warehouseToProducts: Record<number, Set<number>> = {};
    
    // Für jede Maschinen-Lager-Zuordnung
    for (const assignment of machineWarehouseAssignments) {
      if (!assignment.machineId || !assignment.warehouseId) {
        console.warn("Ungültige Zuordnung gefunden - machineId oder warehouseId fehlt", assignment);
        continue;
      }
      
      const machineId = Number(assignment.machineId);
      const warehouseId = Number(assignment.warehouseId);
      
      machinesChecked++;
      
      // Initialisiere Set für dieses Lager, falls noch nicht vorhanden
      if (!warehouseToProducts[warehouseId]) {
        warehouseToProducts[warehouseId] = new Set<number>();
        warehousesChecked++;
      }
      
      try {
        // Hole alle Transaktionen für diese Maschine
        const transactions = await storage.getTransactionsByMachine(machineId, 500);
        
        // Extrahiere eindeutige Produkt-IDs aus den Transaktionen
        for (const transaction of transactions) {
          try {
            if (transaction.productId && typeof transaction.productId === 'number') {
              // Füge Produkt-ID zum entsprechenden Lager hinzu
              warehouseToProducts[warehouseId].add(transaction.productId);
              productsFound++;
            }
            // Wenn keine Produkt-ID gesetzt ist, versuche das Produkt über den Namen zu finden
            else if (transaction.productName) {
              const productName = transaction.productName;
              
              // Suche das Produkt in der Datenbank anhand des Namens
              if (productName) {
                // Suche das Produkt in der Datenbank anhand des Namens
                const productsResult = await storage.getProducts({
                  search: productName,
                  limit: 1
                });
                
                const products = Array.isArray(productsResult) ? productsResult : productsResult.data;
                
                if (products.length > 0) {
                  const product = products[0];
                  if (product && product.id) {
                    warehouseToProducts[warehouseId].add(product.id);
                    productsFound++;
                    console.log(`Produkt "${productName}" über Namen gefunden und für Lager ${warehouseId} vorgemerkt`);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Fehler beim Verarbeiten einer Transaktion:`, error);
          }
        }
      } catch (error) {
        console.error(`Fehler beim Abrufen der Produkte für Maschine ${machineId}:`, error);
        errors++;
      }
    }
    
    // Verarbeite jedes Lager und seine Produkte
    for (const warehouseId of Object.keys(warehouseToProducts).map(Number)) {
      const productIdsSet = warehouseToProducts[warehouseId];
      const productIds = Array.from(productIdsSet);
      
      console.log(`Verarbeite Lager ID ${warehouseId} mit ${productIds.length} eindeutigen Produkten`);
      
      // Hole alle bereits im Lager vorhandenen Produkte
      const existingItems = await storage.getInventoryItemsByWarehouse(warehouseId);
      const existingProductIds = new Set(existingItems.map(item => item.productId ? Number(item.productId) : -1));
      
      console.log(`Lager ${warehouseId} hat bereits ${existingProductIds.size} Produkte`);
      
      // Identifiziere fehlende Produkte
      const missingProductIds = productIds.filter(id => !existingProductIds.has(id));
      
      console.log(`${missingProductIds.length} fehlende Produkte in Lager ${warehouseId} identifiziert (IDs: ${missingProductIds.join(', ')})`);
      
      // Füge fehlende Produkte dem Lager hinzu
      for (const productId of missingProductIds) {
        try {
          if (typeof productId !== 'number') {
            console.warn(`Ungültige Produkt-ID: ${productId}`);
            continue;
          }
          
          // Prüfe, ob das Produkt in der Datenbank existiert
          const product = await storage.getProduct(productId);
          
          if (product) {
            try {
              // Konvertiere IDs explizit zu Zahlen
              const parsedWarehouseId = Number(warehouseId);
              const parsedProductId = Number(productId);
              
              console.log(`Füge Produkt ${parsedProductId} (${product.productName}) zu Lager ${parsedWarehouseId} hinzu...`);
              
              // Direkt prüfen, ob das Produkt bereits im Lager vorhanden ist
              const existingItems = await storage.getInventoryItemsByWarehouseAndProduct(parsedWarehouseId, parsedProductId);
              
              if (existingItems && existingItems.length > 0) {
                console.log(`Produkt ${parsedProductId} (${product.productName}) existiert bereits in Lager ${parsedWarehouseId}, überspringe...`);
                continue;
              }
              
              // Erstelle neuen Inventareintrag
              const inventoryItem: InsertInventoryItem = {
                warehouseId: parsedWarehouseId,
                productId: parsedProductId,
                quantity: 0,
                minQuantity: 5,
                status: "active",
                notes: `Automatisch hinzugefügt beim Lagerabgleich am ${new Date().toISOString().split('T')[0]}`,
                lastCountDate: new Date()
              };
              
              // Direkte ORM-Methode zum Einfügen
              const newItem = await storage.createInventoryItem(inventoryItem);
              
              if (newItem && newItem.id) {
                productsAdded++;
                console.log(`✅ Produkt ${parsedProductId} (${product.productName}) erfolgreich zu Lager ${parsedWarehouseId} hinzugefügt mit ID ${newItem.id}`);
              } else {
                console.error(`❌ Fehler beim Erstellen des Inventareintrags für Produkt ${parsedProductId} in Lager ${parsedWarehouseId}: Kein Ergebnis zurückgegeben`);
                errors++;
              }
            } catch (innerError: any) {
              // Prüfe, ob es sich um einen Fehler wegen Duplikat handelt
              if (innerError.message && innerError.message.includes('unique constraint')) {
                console.log(`Produkt ${productId} (${product.productName}) ist bereits in Lager ${warehouseId} vorhanden (Constraint-Fehler)`);
              } else {
                console.error(`❌ Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, innerError);
                errors++;
              }
            }
          } else {
            console.warn(`⚠️ Produkt mit ID ${productId} existiert nicht in der Datenbank`);
          }
        } catch (error) {
          console.error(`❌ Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, error);
          errors++;
        }
      }
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log(`Lagerabgleich abgeschlossen - Zeit: ${processingTime}ms, Fehler: ${errors}, Hinzugefügte Produkte: ${productsAdded}`);
    
    return {
      processingTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors
    };
  } catch (error) {
    console.error("Kritischer Fehler beim Lagerabgleich:", error);
    
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
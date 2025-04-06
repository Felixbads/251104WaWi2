/**
 * Automatischer Lagerabgleich-Service
 * 
 * Dieser Service stellt sicher, dass alle Produkte, die in Automaten verwendet werden,
 * auch in den zugehörigen Lagern geführt werden. Der Abgleich wird beim Anwendungsstart
 * durchgeführt und fügt fehlende Produkte in den jeweiligen Lagern hinzu (mit Anfangsbestand 0).
 */

import { storage } from "../storage";
import { InsertInventoryItem, InsertProductBatch } from "@shared/schema";
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
  skippedDuplicates: number;
}> {
  console.log("Starte automatischen Lagerabgleich...", 
              specificWarehouseId ? `für Lager ${specificWarehouseId}` : "für alle Lager");
  const startTime = Date.now();
  
  let warehousesChecked = 0;
  let machinesChecked = 0;
  let productsFound = 0;
  let productsAdded = 0;
  let errors = 0;
  let skippedDuplicates = 0;
  
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
    
    // Verbessertes Mapping für Lager zu Produkt-IDs mit zusätzlichen Informationen
    interface ProductInfo {
      id: number;
      name: string;
      found: boolean; // Flag, um zu markieren, dass das Produkt bereits verarbeitet wurde
    }
    
    const warehouseToProducts: Record<number, Map<number, ProductInfo>> = {};
    
    // Für jede Maschinen-Lager-Zuordnung
    for (const assignment of machineWarehouseAssignments) {
      if (!assignment.machineId || !assignment.warehouseId) {
        console.warn("Ungültige Zuordnung gefunden - machineId oder warehouseId fehlt", assignment);
        continue;
      }
      
      const machineId = Number(assignment.machineId);
      const warehouseId = Number(assignment.warehouseId);
      
      machinesChecked++;
      
      // Initialisiere Map für dieses Lager, falls noch nicht vorhanden
      if (!warehouseToProducts[warehouseId]) {
        warehouseToProducts[warehouseId] = new Map<number, ProductInfo>();
        warehousesChecked++;
      }
      
      try {
        // Hole alle Transaktionen für diese Maschine mit einem Limit von 250 (reduziert, um Überlastung zu vermeiden)
        const transactions = await storage.getTransactionsByMachine(machineId, 250);
        
        // Extrahiere eindeutige Produkt-IDs aus den Transaktionen
        for (const transaction of transactions) {
          try {
            if (transaction.productId && typeof transaction.productId === 'number') {
              // Füge Produkt-ID zum entsprechenden Lager hinzu, wenn es noch nicht dort ist
              if (!warehouseToProducts[warehouseId].has(transaction.productId)) {
                warehouseToProducts[warehouseId].set(transaction.productId, {
                  id: transaction.productId,
                  name: 'Unbekanntes Produkt', // Standard-Name falls kein Name verfügbar
                  found: false
                });
                productsFound++;
              }
            }
            // Wenn keine Produkt-ID gesetzt ist, versuche das Produkt über den Namen zu finden
            else if (transaction.productName) {
              const productName = transaction.productName;
              console.log(`Produktname direkt aus transaction.productName: "${productName}"`);
              
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
                    // Nur wenn dieses Produkt noch nicht im Set ist
                    if (!warehouseToProducts[warehouseId].has(product.id)) {
                      warehouseToProducts[warehouseId].set(product.id, {
                        id: product.id,
                        name: product.productName || productName,
                        found: false
                      });
                      productsFound++;
                      console.log(`Produkt "${productName}" über Namen gefunden und für Lager ${warehouseId} vorgemerkt`);
                    } else {
                      // Produkt bereits gefunden, nicht doppelt zählen
                      console.log(`Produkt "${productName}" bereits für Lager ${warehouseId} vorgemerkt`);
                    }
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
    
    // Verarbeite jedes Lager und seine Produkte - mit Batching, um die Datenbank zu entlasten
    for (const warehouseId of Object.keys(warehouseToProducts).map(Number)) {
      const productInfoMap = warehouseToProducts[warehouseId];
      const productCount = productInfoMap.size;
      
      console.log(`Verarbeite Lager ID ${warehouseId} mit ${productCount} eindeutigen Produkten`);
      
      // Hole alle bereits im Lager vorhandenen Produkte
      const existingItems = await storage.getInventoryItemsByWarehouse(warehouseId);
      const existingProductIds = new Set(existingItems.map(item => item.productId ? Number(item.productId) : -1));
      
      console.log(`Lager ${warehouseId} hat bereits ${existingProductIds.size} Produkte`);
      
      // Batch-Verarbeitung - maximal 50 Produkte auf einmal
      const BATCH_SIZE = 50;
      let processedCount = 0;
      
      // Array.from() konvertiert den Iterator zu einem Array, das wir dann durchlaufen können
      for (const [productId, productInfo] of Array.from(productInfoMap.entries())) {
        // Überprüfe, ob das Produkt bereits im Lager existiert
        if (existingProductIds.has(productId)) {
          skippedDuplicates++;
          continue;
        }
        
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
              
              // Erstelle eine virtuelle Batch für die Produkte aus Automaten
              // Mit einem speziellen Batch-Namen, der anzeigt, dass es sich um einen automatischen Abgleich handelt
              const batchNumber = `AUTO-${parsedProductId}-${new Date().getTime()}`;
              
              // Setze Ablaufdatum auf ein Jahr in der Zukunft für automatisch angelegte Batches
              const expiryDate = new Date();
              expiryDate.setFullYear(expiryDate.getFullYear() + 1);
              
              // Erstelle einen neuen Batch-Eintrag
              const newBatchData: InsertProductBatch = {
                warehouseId: parsedWarehouseId,
                productId: parsedProductId,
                batchNumber: batchNumber,
                initialQuantity: 0,
                currentQuantity: 0,
                receivedDate: new Date().toISOString().split('T')[0], // Als ISO-String im Format "YYYY-MM-DD"
                expiryDate: expiryDate.toISOString().split('T')[0], // Als ISO-String im Format "YYYY-MM-DD"
                status: 'active',
                notes: `Automatisch durch Lagerabgleich hinzugefügt (${new Date().toISOString().split('T')[0]})`,
                locationInWarehouse: 'Automatischer Abgleich'
              };
              
              console.log(`Creating batch for product ${parsedProductId} in warehouse ${parsedWarehouseId}`);
              
              try {
                // Erstelle die Batch über die Storage-Schnittstelle
                const newBatch = await storage.createProductBatch(newBatchData);
                
                if (newBatch && newBatch.id) {
                  productsAdded++;
                  console.log(`✅ Produkt ${parsedProductId} (${product.productName}) erfolgreich als Batch zu Lager ${parsedWarehouseId} hinzugefügt mit ID ${newBatch.id}`);
                  
                  // Für die Kompatibilität auch sicherstellen, dass ein inventory_item existiert
                  try {
                    // Prüfe, ob bereits ein inventory_item existiert
                    const existingItem = await storage.getInventoryItemByProductAndWarehouse(parsedProductId, parsedWarehouseId);
                    
                    if (!existingItem) {
                      // Erstelle auch einen inventory_item Eintrag für Rückwärtskompatibilität
                      const inventoryItem: InsertInventoryItem = {
                        warehouseId: parsedWarehouseId,
                        productId: parsedProductId,
                        quantity: 0,
                        minQuantity: 5,
                        status: "active",
                        notes: `Automatisch durch Lagerabgleich hinzugefügt (${new Date().toISOString().split('T')[0]})`,
                        lastCountDate: new Date()
                      };
                      
                      const newItem = await storage.createInventoryItem(inventoryItem);
                      if (newItem && newItem.id) {
                        console.log(`✅ Auch inventory_item für Produkt ${parsedProductId} in Lager ${parsedWarehouseId} erstellt (ID: ${newItem.id})`);
                      }
                    }
                  } catch (itemError: any) {
                    console.warn(`⚠️ Konnte inventory_item nicht überprüfen/erstellen: ${itemError?.message || 'Unbekannter Fehler'}`);
                  }
                } else {
                  console.error(`❌ Fehler beim Erstellen des Batch-Eintrags für Produkt ${parsedProductId} in Lager ${parsedWarehouseId}: Kein Ergebnis zurückgegeben`);
                  errors++;
                }
              } catch (createError: any) {
                // Behandle Unique-Constraint-Fehler
                if (createError.message && createError.message.includes('unique constraint')) {
                  console.log(`Batch für Produkt ${parsedProductId} (${product.productName}) ist bereits in Lager ${parsedWarehouseId} vorhanden (DB-Constraint)`);
                  skippedDuplicates++;
                } else {
                  throw createError; // Andere Fehler weiterwerfen
                }
              }
            } catch (innerError: any) {
              console.error(`❌ Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, innerError);
              errors++;
            }
          } else {
            console.warn(`⚠️ Produkt mit ID ${productId} existiert nicht in der Datenbank`);
          }
        } catch (error) {
          console.error(`❌ Fehler beim Hinzufügen von Produkt ${productId} zum Lager ${warehouseId}:`, error);
          errors++;
        }
        
        // Batch-Fortschritt überwachen
        processedCount++;
        if (processedCount % BATCH_SIZE === 0 || processedCount === productCount) {
          console.log(`Fortschritt: ${processedCount}/${productCount} Produkte verarbeitet für Lager ${warehouseId}`);
        }
      }
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log(`Lagerabgleich abgeschlossen - Zeit: ${processingTime}ms, Fehler: ${errors}, Hinzugefügte Produkte: ${productsAdded}, Übersprungene Duplikate: ${skippedDuplicates}`);
    
    return {
      processingTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors,
      skippedDuplicates
    };
  } catch (error) {
    console.error("Kritischer Fehler beim Lagerabgleich:", error);
    
    return {
      processingTime: Date.now() - startTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors: errors + 1,
      skippedDuplicates
    };
  }
}
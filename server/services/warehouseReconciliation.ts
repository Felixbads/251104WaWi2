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
                  name: transaction.name || 'Unbekanntes Produkt',
                  found: false
                });
                productsFound++;
              }
            }
            // Wenn keine Produkt-ID gesetzt ist, versuche das Produkt über den Namen zu finden
            else if (transaction.name) {
              const productName = transaction.name;
              console.log(`Produktname direkt aus transaction.name: "${productName}"`);
              
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
      
      for (const [productId, productInfo] of productInfoMap.entries()) {
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
              
              try {
                // Verwende try-catch mit dem Unique-Constraint, der jetzt auf DB-Ebene existiert
                const newItem = await storage.createInventoryItem(inventoryItem);
                
                if (newItem && newItem.id) {
                  productsAdded++;
                  console.log(`✅ Produkt ${parsedProductId} (${product.productName}) erfolgreich zu Lager ${parsedWarehouseId} hinzugefügt mit ID ${newItem.id}`);
                  
                  // Eintrag für Warenbewegung hinzufügen - wichtig für Nachverfolgung
                  await storage.createInventoryMovement({
                    inventoryItemId: newItem.id,
                    quantity: 0,
                    movementType: "initial",
                    referenceType: "warehouse_reconciliation",
                    referenceId: `reconcile_${startTime}`,
                    notes: `Initiale Anlage durch automatischen Lagerabgleich`,
                    createdBy: null,
                    createdAt: new Date()
                  });
                } else {
                  console.error(`❌ Fehler beim Erstellen des Inventareintrags für Produkt ${parsedProductId} in Lager ${parsedWarehouseId}: Kein Ergebnis zurückgegeben`);
                  errors++;
                }
              } catch (createError: any) {
                // Behandle Unique-Constraint-Fehler
                if (createError.message && createError.message.includes('unique constraint')) {
                  console.log(`Produkt ${parsedProductId} (${product.productName}) ist bereits in Lager ${parsedWarehouseId} vorhanden (DB-Constraint)`);
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
/**
 * Automatischer Lagerabgleich-Service
 * 
 * Dieser Service stellt sicher, dass alle Produkte, die in Automaten verwendet werden,
 * auch in den zugehörigen Lagern geführt werden. Der Abgleich wird beim Anwendungsstart
 * durchgeführt und fügt fehlende Produkte in den jeweiligen Lagern hinzu (mit Anfangsbestand 0).
 */

import { storage } from "../storage";
import { normalizeProductName } from "../utils/stringUtils";
import { InsertInventoryItem, InsertProductBatch } from "@shared/schema";
import type { MachineWarehouseAssignment, Transaction } from "@shared/schema";
import { rawDb } from "../db";

/**
 * Führt den automatischen Lagerabgleich zwischen Automaten und Lagern durch und fügt alle Produkte
 * aus dem Gesamtportfolio jedem Lager hinzu, mit Anfangsbestand 0 und einem Batch mit MHD.
 * 
 * @param specificWarehouseId - Optional: Wenn angegeben, wird nur dieses spezifische Lager abgeglichen
 * @param syncAllProducts - Optional: Wenn true, werden alle Produkte aus dem Gesamtportfolio hinzugefügt (standardmäßig false)
 * @param forceCreateInventoryItems - Optional: Wenn true, werden inventory_items für alle Produkte erstellt, auch wenn sie schon vorgemerkt sind
 */
export async function reconcileWarehouseProducts(
  specificWarehouseId?: number, 
  syncAllProducts: boolean = false, // Standardwert auf false geändert, um Duplikate zu vermeiden
  forceCreateInventoryItems: boolean = true
): Promise<{
  processingTime: number;
  warehousesChecked: number;
  machinesChecked: number;
  productsFound: number;
  productsAdded: number;
  errors: number;
  skippedDuplicates: number;
  allProductsAdded: number;
  inventoryItemsCreated: number;
}> {
  console.log("Starte automatischen Lagerabgleich...", 
              specificWarehouseId ? `für Lager ${specificWarehouseId}` : "für alle Lager",
              syncAllProducts ? "inklusive aller Produkte aus dem Gesamtportfolio" : "nur Automatenprodukte",
              forceCreateInventoryItems ? "mit Zwangserstellung von inventory_items" : "ohne Zwangserstellung von inventory_items");
              
  const startTime = Date.now();
  
  let warehousesChecked = 0;
  let machinesChecked = 0;
  let productsFound = 0;
  let productsAdded = 0;
  let errors = 0;
  let skippedDuplicates = 0;
  let allProductsAdded = 0;
  let inventoryItemsCreated = 0;
  
  try {
    // 1. Zuerst bestimmen wir die Liste der zu verarbeitenden Lager
    let warehousesToProcess: number[] = [];
    
    if (specificWarehouseId) {
      warehousesToProcess = [specificWarehouseId];
      console.log(`Verarbeite Lager mit ID ${specificWarehouseId}`);
    } else {
      // Alle aktiven Lager abrufen
      const allWarehouses = await storage.getWarehouses();
      warehousesToProcess = allWarehouses.map(w => w.id);
      console.log(`Verarbeite alle ${warehousesToProcess.length} aktiven Lager`);
    }
    
    // 2. Lager-Automaten-Zuordnungen abrufen (gefiltert oder alle)
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
      warehouses: Set<number>; // Set der Lager-IDs, in denen dieses Produkt enthalten ist
    }
    
    // Globale Map für alle Produkte, unabhängig vom Lager
    // Diese wird verwendet, um Duplikate lagersübergreifend zu erkennen
    const globalProductsMap = new Map<number, ProductInfo>();
    
    // Map für Zuordnung von normalisierten Produktnamen zu Produkt-IDs
    // Hilft dabei, Produkte mit gleichen Namen aber unterschiedlichen IDs zu erkennen
    // und verhindert das Erstellen von Duplikaten
    const normalizedNameToProductId = new Map<string, number>();
    
    // Initialisiere diese Map mit allen vorhandenen Produkten
    console.log("Initialisiere Map für normalisierte Produktnamen...");
    try {
      const allProductsQuery = 'SELECT id, product_name FROM products WHERE product_name IS NOT NULL';
      const productsResult = await rawDb.query(allProductsQuery);
      
      for (const product of productsResult.rows) {
        if (product.product_name) {
          const normalizedName = normalizeProductName(product.product_name);
          if (normalizedName && !normalizedNameToProductId.has(normalizedName)) {
            normalizedNameToProductId.set(normalizedName, product.id);
            console.log(`Produktname "${normalizedName}" zur ID ${product.id} zugeordnet`);
          } else if (normalizedName && normalizedNameToProductId.has(normalizedName)) {
            const existingId = normalizedNameToProductId.get(normalizedName);
            console.log(`WARNUNG: Duplikat gefunden! Produkt "${product.product_name}" (ID ${product.id}) hat gleichen normalisierten Namen wie ID ${existingId}`);
          }
        }
      }
      
      console.log(`✅ Insgesamt ${normalizedNameToProductId.size} normalisierte Produktnamen initialisiert`);
    } catch (error) {
      console.error("Fehler beim Initialisieren der normalisierten Produktnamen-Map:", error);
    }
    
    // Zuordnung von Lagern zu Produkten, für die lagerspezifische Verarbeitung
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
              const productId = transaction.productId;
              // Lagerübergreifende Prüfung mit globalProductsMap
              if (!globalProductsMap.has(productId)) {
                // Produkt noch nicht im globalen Register
                const productInfo = {
                  id: productId,
                  name: 'Unbekanntes Produkt', // Standard-Name falls kein Name verfügbar
                  found: false,
                  warehouses: new Set<number>([warehouseId])
                };
                globalProductsMap.set(productId, productInfo);
                
                // Füge Produkt-ID zum entsprechenden Lager hinzu
                warehouseToProducts[warehouseId].set(productId, productInfo);
                
                console.log(`Neues Produkt ${productId} global registriert und für Lager ${warehouseId} vorgemerkt`);
                productsFound++;
              } else {
                // Produkt bereits im globalen Register - füge nur Lager-Zuordnung hinzu wenn nötig
                const productInfo = globalProductsMap.get(productId)!;
                if (!productInfo.warehouses.has(warehouseId)) {
                  productInfo.warehouses.add(warehouseId);
                  warehouseToProducts[warehouseId].set(productId, productInfo);
                  console.log(`Bereits registriertes Produkt ${productId} (${productInfo.name}) für Lager ${warehouseId} vorgemerkt`);
                  productsFound++;
                } else {
                  console.log(`Produkt ${productId} (${productInfo.name}) bereits für Lager ${warehouseId} vorgemerkt`);
                }
              }
            }
            // Wenn keine Produkt-ID gesetzt ist, versuche das Produkt über den Namen zu finden
            else if (transaction.productName) {
              const rawProductName = transaction.productName;
              console.log(`Produktname direkt aus transaction.productName: "${rawProductName}"`);
              
              if (rawProductName) {
                try {
                  // Normalisiere den Produktnamen für die Suche
                  const productName = normalizeProductName(rawProductName);
                  console.log(`Suche Produkt mit normalisiertem Namen: "${productName}" (Original: "${rawProductName}")`);
                  const product = await storage.getProductByNormalizedName(productName);
                  
                  if (product && product.id) {
                    const productId = product.id;
                    // Lagerübergreifende Prüfung mit globalProductsMap
                    if (!globalProductsMap.has(productId)) {
                      // Produkt noch nicht im globalen Register
                      const productInfo = {
                        id: productId,
                        name: product.productName || productName,
                        found: false,
                        warehouses: new Set<number>([warehouseId])
                      };
                      globalProductsMap.set(productId, productInfo);
                      
                      // Füge Produkt-ID zum entsprechenden Lager hinzu
                      warehouseToProducts[warehouseId].set(productId, productInfo);
                      
                      productsFound++;
                      console.log(`Produkt "${productName}" über normalisierten Namen gefunden und für Lager ${warehouseId} vorgemerkt`);
                    } else {
                      // Produkt bereits im globalen Register - füge nur Lager-Zuordnung hinzu wenn nötig
                      const productInfo = globalProductsMap.get(productId)!;
                      if (!productInfo.warehouses.has(warehouseId)) {
                        productInfo.warehouses.add(warehouseId);
                        warehouseToProducts[warehouseId].set(productId, productInfo);
                        productsFound++;
                        console.log(`Produkt "${productName}" bereits global registriert und jetzt für Lager ${warehouseId} vorgemerkt`);
                      } else {
                        // Produkt bereits gefunden, nicht doppelt zählen
                        console.log(`Produkt "${productName}" bereits für Lager ${warehouseId} vorgemerkt`);
                      }
                    }
                  } else {
                    console.log(`Keine exakte Übereinstimmung für "${productName}" gefunden, versuche allgemeine Suche...`);
                    
                    // Wenn keine exakte Übereinstimmung gefunden wurde, versuche die Standardsuche
                    const productsResult = await rawDb.query('SELECT * FROM products WHERE product_name ILIKE $1 LIMIT 5', [`%${productName}%`]);
                    
                    const products = productsResult.rows;
                    
                    if (products.length > 0) {
                      const matchedProduct = products[0]; // Verwende das erste Ergebnis
                      if (matchedProduct && matchedProduct.id) {
                        // Nur wenn dieses Produkt noch nicht im Set ist
                        if (!warehouseToProducts[warehouseId].has(matchedProduct.id)) {
                          const productId = matchedProduct.id;
                          // Lagerübergreifende Prüfung mit globalProductsMap
                          if (!globalProductsMap.has(productId)) {
                            // Produkt noch nicht im globalen Register
                            const productInfo = {
                              id: productId,
                              name: matchedProduct.product_name || rawProductName,
                              found: false,
                              warehouses: new Set<number>([warehouseId])
                            };
                            globalProductsMap.set(productId, productInfo);
                            
                            // Füge Produkt-ID zum entsprechenden Lager hinzu
                            warehouseToProducts[warehouseId].set(productId, productInfo);
                            
                            console.log(`Produkt "${rawProductName}" über allgemeine Suche gefunden und im globalen Register hinzugefügt`);
                          } else {
                            // Produkt bereits im globalen Register - füge nur Lager-Zuordnung hinzu wenn nötig
                            const productInfo = globalProductsMap.get(productId)!;
                            if (!productInfo.warehouses.has(warehouseId)) {
                              productInfo.warehouses.add(warehouseId);
                              warehouseToProducts[warehouseId].set(productId, productInfo);
                              console.log(`Produkt "${rawProductName}" bereits global registriert und jetzt für Lager ${warehouseId} vorgemerkt`);
                            } else {
                              console.log(`Produkt "${rawProductName}" bereits für Lager ${warehouseId} vorgemerkt (aus globaler Suche)`);
                              continue; // Nicht doppelt zählen
                            }
                          }
                          productsFound++;
                          console.log(`Produkt "${rawProductName}" über allgemeine Suche gefunden (${matchedProduct.productName}) und für Lager ${warehouseId} vorgemerkt`);
                        }
                      }
                    }
                  }
                } catch (searchError) {
                  console.error(`Fehler bei der Produktsuche für "${rawProductName}":`, searchError);
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
    
    // Wenn syncAllProducts aktiviert ist, holen wir alle verfügbaren Produkte
    let allProducts: any[] = [];
    
    if (syncAllProducts) {
      console.log("Hole alle Produkte aus dem Gesamtportfolio...");
      try {
        // Direkte SQL-Abfrage für alle Produkte, um die Limitierung zu umgehen
        const query = 'SELECT * FROM products ORDER BY product_name';
        const result = await rawDb.query(query);
        allProducts = result.rows;
        console.log(`Insgesamt ${allProducts.length} Produkte im Gesamtportfolio gefunden (direktes SQL)`);
      } catch (error) {
        console.error("Fehler beim Abrufen aller Produkte:", error);
        errors++;
      }
    }
    
    // Verarbeite jedes Lager und seine Produkte - mit Batching, um die Datenbank zu entlasten
    for (const warehouseId of warehousesToProcess) {
      // Initialisiere die Map für dieses Lager, falls es noch nicht durch Automaten initialisiert wurde
      if (!warehouseToProducts[warehouseId]) {
        warehouseToProducts[warehouseId] = new Map<number, ProductInfo>();
        warehousesChecked++;
      }
      
      // Produktinfos für dieses Lager
      const productInfoMap = warehouseToProducts[warehouseId];
      
      console.log(`Verarbeite Lager ID ${warehouseId} mit ${productInfoMap.size} eindeutigen Produkten aus Automaten`);
      
      // Wenn syncAllProducts aktiviert ist, füge alle Produkte hinzu
      if (syncAllProducts) {
        for (const product of allProducts) {
          if (product.id && !productInfoMap.has(product.id)) {
            const productId = product.id;
            
            // Wenn dieses Produkt bereits im globalen Register ist, übernehme die Infos
            if (globalProductsMap.has(productId)) {
              const globalInfo = globalProductsMap.get(productId)!;
              globalInfo.warehouses.add(warehouseId);
              productInfoMap.set(productId, globalInfo);
            } else {
              // Neues Produkt global und für dieses Lager registrieren
              const productInfo = {
                id: productId,
                name: product.product_name || 'Unbekanntes Produkt',
                found: false,
                warehouses: new Set<number>([warehouseId])
              };
              globalProductsMap.set(productId, productInfo);
              productInfoMap.set(productId, productInfo);
            }
          }
        }
      }
      
      // Prüfe, welche Produkte bereits im Lager vorhanden sind, um Duplikate zu vermeiden
      const existingProductIds = new Set<number>();
      
      try {
        const existingItems = await storage.getInventoryItemsByWarehouse(warehouseId);
        
        for (const item of existingItems) {
          if (item.productId) {
            const productId = typeof item.productId === 'number' ? item.productId : Number(item.productId);
            existingProductIds.add(productId);
            
            // Markiere auch in der globalen Map, dass dieses Produkt bereits diesem Lager zugeordnet ist
            if (globalProductsMap.has(productId)) {
              const productInfo = globalProductsMap.get(productId)!;
              productInfo.warehouses.add(warehouseId);
            }
          }
        }
        
        console.log(`Lager ${warehouseId} hat bereits ${existingProductIds.size} Produkte`);
      } catch (error) {
        console.error(`Fehler beim Abrufen der existierenden Produkte für Lager ${warehouseId}:`, error);
        errors++;
      }
      
      // Optional um die Last auf die Datenbank zu reduzieren:
      const BATCH_SIZE = 50;
      let processedCount = 0;
      const productCount = productInfoMap.size;
      
      // Jetzt fügen wir alle Produkte zum Lager hinzu (sowohl Automaten als auch Gesamtportfolio)
      // Wir verwenden die gleiche Map (productInfoMap) für die Verarbeitung
      for (const [productId, productInfo] of productInfoMap.entries()) {
        // Überspringe das Produkt, wenn es bereits im Lager vorhanden ist
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
              
              // Prüfe zunächst, ob das Produkt bereits im Lagerbestand existiert und eine Menge > 0 hat
              const existingInventoryItem = await storage.getInventoryItemByProductAndWarehouse(parsedProductId, parsedWarehouseId);
              const productQuantity = existingInventoryItem?.quantity || 0;
              
              // Wenn die Menge 0 ist, erstelle keinen Batch - dies verhindert die Anzeige nicht vorhandener Produkte
              if (productQuantity <= 0) {
                console.log(`Überspringe Batch-Erstellung für Produkt ${parsedProductId} (${product.productName}) in Lager ${parsedWarehouseId}, da Menge 0 ist`);
                
                // Stelle sicher, dass ein inventory_item existiert (auch wenn keine Batch erstellt wird)
                try {
                  // Prüfe, ob bereits ein inventory_item existiert
                  if (!existingInventoryItem && forceCreateInventoryItems) {
                    // Erstelle ein inventory_item Eintrag für Rückwärtskompatibilität
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
                      inventoryItemsCreated++;
                      console.log(`✅ Inventory-Item für Produkt ${parsedProductId} in Lager ${parsedWarehouseId} mit Menge 0 erstellt (ID: ${newItem.id})`);
                    }
                  }
                } catch (itemError: any) {
                  console.warn(`⚠️ Konnte inventory_item nicht überprüfen/erstellen: ${itemError?.message || 'Unbekannter Fehler'}`);
                }
              } else {
                console.log(`Füge Produkt ${parsedProductId} (${product.productName}) mit Menge ${productQuantity} zu Lager ${parsedWarehouseId} hinzu...`);
                
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
                  initialQuantity: productQuantity, // Verwende aktuelle Produktmenge
                  currentQuantity: productQuantity, // Verwende aktuelle Produktmenge
                  receivedDate: new Date().toISOString().split('T')[0], // Als ISO-String im Format "YYYY-MM-DD"
                  expiryDate: expiryDate.toISOString().split('T')[0], // Als ISO-String im Format "YYYY-MM-DD"
                  status: 'active',
                  notes: `Automatisch durch Lagerabgleich hinzugefügt (${new Date().toISOString().split('T')[0]})`,
                  locationInWarehouse: 'Automatischer Abgleich'
                };
                
                console.log(`Creating batch for product ${parsedProductId} in warehouse ${parsedWarehouseId} with quantity ${productQuantity}`);
                
                try {
                  // Erstelle die Batch über die Storage-Schnittstelle
                  const newBatch = await storage.createProductBatch(newBatchData);
                  
                  if (newBatch && newBatch.id) {
                    // Zähle das Produkt entweder als Automatprodukt oder als Portfolio-Produkt
                    if (productInfoMap.get(parsedProductId)?.found) {
                      // Produkt aus Automaten
                      productsAdded++;
                      console.log(`✅ Produkt ${parsedProductId} (${product.productName}) aus Automat erfolgreich als Batch zu Lager ${parsedWarehouseId} hinzugefügt mit ID ${newBatch.id}`);
                    } else {
                      // Produkt aus dem Gesamtportfolio
                      allProductsAdded++;
                      console.log(`✅ Produkt ${parsedProductId} (${product.productName}) aus Gesamtportfolio erfolgreich als Batch zu Lager ${parsedWarehouseId} hinzugefügt mit ID ${newBatch.id}`);
                    }
                    
                    // Für die Kompatibilität auch sicherstellen, dass ein inventory_item existiert
                    try {
                      // Prüfe, ob bereits ein inventory_item existiert
                      const existingItem = await storage.getInventoryItemByProductAndWarehouse(parsedProductId, parsedWarehouseId);
                      
                      if (!existingItem) {
                        // Erstelle auch einen inventory_item Eintrag für Rückwärtskompatibilität
                        const inventoryItem: InsertInventoryItem = {
                          warehouseId: parsedWarehouseId,
                          productId: parsedProductId,
                          quantity: productQuantity,
                          minQuantity: 5,
                          status: "active",
                          notes: `Automatisch durch Lagerabgleich hinzugefügt (${new Date().toISOString().split('T')[0]})`,
                          lastCountDate: new Date()
                        };
                        
                        const newItem = await storage.createInventoryItem(inventoryItem);
                        if (newItem && newItem.id) {
                          inventoryItemsCreated++;
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
    
    console.log(`Lagerabgleich abgeschlossen - Zeit: ${processingTime}ms, Fehler: ${errors}, Hinzugefügte Produkte: ${productsAdded}, Übersprungene Duplikate: ${skippedDuplicates}, Aus Portfolioliste hinzugefügt: ${allProductsAdded}`);
    
    return {
      processingTime,
      warehousesChecked,
      machinesChecked,
      productsFound,
      productsAdded,
      errors,
      skippedDuplicates,
      allProductsAdded,
      inventoryItemsCreated
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
      skippedDuplicates,
      allProductsAdded,
      inventoryItemsCreated
    };
  }
}
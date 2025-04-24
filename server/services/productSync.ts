import { storage } from "../storage";
import { InsertProduct, InsertSyncLog, Product } from "@shared/schema";
import { VendonAPI } from "./vendonAPI";
import { acquireSyncLock, releaseSyncLock, SYNC_TYPE } from "./syncLock";

/**
 * Verbesserte Klasse für die Produkt-Synchronisierung, die direkt mit dem getProducts-Endpunkt arbeitet
 */
export class ProductSyncService {
  private api: VendonAPI;

  constructor(api?: VendonAPI) {
    this.api = api || new VendonAPI();
  }

  /**
   * Direkter Zugriff auf die API für Tests und manuelle Aufrufe
   */
  getApi() {
    return this.api;
  }

  /**
   * Führt eine vollständige Produktsynchronisierung durch
   * Diese Methode verwendet den korrekten getProducts-Endpunkt der Vendon-API
   */
  async syncProducts(forceUpdate = false): Promise<{ syncLogId: number; status: string; message: string }> {
    // Versuche, das Sync-Lock zu erwerben
    const lockAcquired = await acquireSyncLock(SYNC_TYPE.PRODUCTS);
    if (!lockAcquired) {
      return {
        syncLogId: -1,
        status: 'error',
        message: 'Eine andere Produktsynchronisierung läuft bereits. Bitte warten Sie, bis diese abgeschlossen ist.'
      };
    }
    
    try {
      // Erstelle einen Sync-Log-Eintrag
      const syncLog: InsertSyncLog = {
        syncType: 'products',
        entityType: 'products', // Unterstützt die neue entityType-Spalte
        startDate: new Date(),
        syncStatus: 'running',
      };

      const logEntry = await storage.createSyncLog(syncLog);
      const syncLogId = logEntry.id;

      console.log("Starte Produktsynchronisierung mit direktem API-Aufruf...");
      const startTime = Date.now();

      // Zähler für die Synchronisation
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;

      try {
        // 1. Rufe alle Produkte direkt über die API ab
        console.log("Rufe Produkte über getProducts-API ab...");
        const products = await this.api.getProducts();

        if (!products || !Array.isArray(products)) {
          throw new Error(`Ungültige Produktdaten von der API erhalten: ${typeof products}`);
        }

        itemsFound = products.length;
        console.log(`${itemsFound} Produkte von der API erhalten.`);

        // 2. Hole alle bestehenden Produkte aus der Datenbank für Duplikaterkennung
        const existingProducts = await storage.getProducts(0);
        const existingProductsMap = new Map<string, Product>();
        
        existingProducts.forEach(product => {
          if (product.vendonId) {
            existingProductsMap.set(product.vendonId, product);
          }
        });

        console.log(`${existingProducts.length} bestehende Produkte in der Datenbank gefunden.`);

        // 3. Verarbeite jedes Produkt
        for (const product of products) {
          try {
            // Grundlegende Validierung
            if (!product.id) {
              console.error("Produkt ohne ID übersprungen:", product);
              errors++;
              continue;
            }

            // Konvertiere die product.id zu einem String
            const vendonId = product.id.toString();

            // Extrahiere alle relevanten Felder aus dem API-Objekt
            const newProduct: InsertProduct = {
              vendonId: vendonId,
              productName: product.name || 'Unbenanntes Produkt',
              price: product.price || 0,
              category: product.category || null,
              description: product.description || null,
              status: product.status || 'active',
              sku: product.sku || null,
              barcode: product.barcode || null,
              supplierId: product.supplier_id || null,
              supplierName: product.supplier_name || null,
              supplierSku: product.supplier_sku || null,
              packageSize: product.package_size || null,
              shelfLifeDays: product.shelf_life_days || null,
              minOrderQuantity: product.min_order_quantity || null,
              vat: product.vat || null,
              depositPrice: product.deposit_price || null,
              depositVat: product.deposit_vat || null,
              productType: product.product_type || null,
              tags: product.tags || null,
              units: product.units || null,
              costPrice: product.cost_price || null,
              additionalData: JSON.stringify(product),
              vendonUpdatedAt: product.updated_at ? new Date(product.updated_at * 1000) : new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            };

            // Prüfe, ob das Produkt bereits existiert
            const existingProduct = existingProductsMap.get(vendonId);

            if (existingProduct) {
              // Produkt existiert bereits
              if (forceUpdate) {
                // Aktualisiere Produkt, wenn forceUpdate=true
                await storage.updateProduct(existingProduct.id, newProduct);
                itemsUpdated++;
                console.log(`Produkt "${newProduct.productName}" (ID: ${vendonId}) aktualisiert.`);
              } else {
                // Prüfe, ob das Produkt aktualisiert werden muss
                const existingUpdatedAt = existingProduct.updatedAt ? new Date(existingProduct.updatedAt) : new Date(0);
                const newUpdatedAt = newProduct.vendonUpdatedAt || new Date();
                
                if (newUpdatedAt > existingUpdatedAt) {
                  // Produkt ist neuer als das vorhandene
                  await storage.updateProduct(existingProduct.id, newProduct);
                  itemsUpdated++;
                  console.log(`Produkt "${newProduct.productName}" (ID: ${vendonId}) aktualisiert (neueres Datum).`);
                } else {
                  // Produkt ist nicht neuer
                  duplicates++;
                  console.log(`Produkt "${newProduct.productName}" (ID: ${vendonId}) übersprungen (nicht aktualisiert).`);
                }
              }
            } else {
              // Produkt existiert nicht, erstelle ein neues
              await storage.createProduct(newProduct);
              itemsSaved++;
              console.log(`Neues Produkt "${newProduct.productName}" (ID: ${vendonId}) erstellt.`);
            }
          } catch (err) {
            console.error(`Fehler bei der Verarbeitung des Produkts:`, err);
            errors++;
          }
        }

        // Berechne Statistiken
        const endTime = Date.now();
        const durationSeconds = (endTime - startTime) / 1000;

        // Aktualisiere den Sync-Log-Eintrag mit Erfolgsstatistiken
        await storage.updateSyncLog(syncLogId, {
          endDate: new Date(),
          itemsFound,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors,
          durationSeconds,
          syncStatus: 'completed'
        });

        console.log(`Produktsynchronisierung abgeschlossen. Dauer: ${durationSeconds}s`);
        console.log(`Zusammenfassung: ${itemsFound} gefunden, ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`);

        return {
          syncLogId,
          status: 'success',
          message: `${itemsFound} Produkte synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`
        };
      } catch (error) {
        // Fehlerbehandlung
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Fehler bei der Produktsynchronisierung:", error);

        await storage.updateSyncLog(syncLogId, {
          endDate: new Date(),
          syncStatus: 'error',
          errorMessage
        });

        return {
          syncLogId,
          status: 'error',
          message: `Produktsynchronisierung fehlgeschlagen: ${errorMessage}`
        };
      }
    } finally {
      // Sync-Lock freigeben, unabhängig vom Ergebnis
      await releaseSyncLock(SYNC_TYPE.PRODUCTS);
    }
  }

  /**
   * Führt eine geplante Produktsynchronisierung durch
   * Kann als Teil eines Cron-Jobs verwendet werden
   */
  async scheduledSync(forceUpdate = false): Promise<void> {
    console.log("Geplante Produktsynchronisierung wird ausgeführt...");
    try {
      const result = await this.syncProducts(forceUpdate);
      console.log("Geplante Produktsynchronisierung abgeschlossen:", result);
    } catch (error) {
      console.error("Fehler bei der geplanten Produktsynchronisierung:", error);
    }
  }
}

// Instanz für einfachen Zugriff exportieren
export const productSync = new ProductSyncService();
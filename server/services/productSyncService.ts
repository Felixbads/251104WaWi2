import { storage } from "../storage";
import { InsertProduct, InsertSyncLog, Product } from "@shared/schema";
import { VendonAPI } from "./vendonAPI";
import { acquireSyncLock, releaseSyncLock, SYNC_TYPE } from './syncLock';
import { db, rawSql } from '../db';
import { eq } from 'drizzle-orm';
import { products } from '@shared/schema';

/**
 * Verbesserter Service für Produktsynchronisierung
 * Implementiert regelmäßige Überprüfung und Aktualisierung der Produkte aus der Vendon API
 */
export class ProductSyncService {
  private api: VendonAPI;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;

  constructor(apiKey?: string) {
    this.api = new VendonAPI(apiKey);
  }

  /**
   * Zugriff auf die API-Instanz für manuelle Operationen
   */
  getApi(): VendonAPI {
    return this.api;
  }

  /**
   * Normalisiert Produktnamen für verbesserte Duplikatserkennung
   * @param name Der zu normalisierende Produktname
   */
  private normalizeProductName(name: string): string {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Startet den automatischen Synchronisierungsdienst
   * @param intervalMinutes Intervall in Minuten zwischen den Synchronisierungen
   */
  startAutoSync(intervalMinutes: number = 60): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    console.log(`Starte automatische Produktsynchronisierung mit Intervall von ${intervalMinutes} Minuten`);
    
    // Sofortige erste Synchronisierung
    this.syncProducts(false).catch(err => {
      console.error('Fehler bei initialer Produktsynchronisierung:', err);
    });

    // Regelmäßige Synchronisierung einrichten
    this.syncInterval = setInterval(() => {
      if (!this.isSyncing) {
        this.syncProducts(false).catch(err => {
          console.error('Fehler bei automatischer Produktsynchronisierung:', err);
        });
      } else {
        console.log('Überspringe geplante Synchronisierung, da bereits eine Synchronisierung läuft');
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stoppt den automatischen Synchronisierungsdienst
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Automatische Produktsynchronisierung gestoppt');
    }
  }

  /**
   * Status der Produktsynchronisierung
   */
  getSyncStatus(): { 
    active: boolean; 
    lastSync: Date | null; 
    isSyncing: boolean;
  } {
    return {
      active: this.syncInterval !== null,
      lastSync: this.lastSyncTime,
      isSyncing: this.isSyncing
    };
  }

  /**
   * Führt eine vollständige Produktsynchronisierung durch
   * @param forceUpdate Erzwingt Updates auch wenn keine Änderungen erkannt wurden
   */
  async syncProducts(forceUpdate = false): Promise<{ 
    syncLogId: number; 
    status: string; 
    message: string;
    stats?: {
      itemsFound: number;
      itemsSaved: number;
      itemsUpdated: number;
      duplicates: number;
      errors: number;
      durationSeconds: number;
    };
  }> {
    // Verhindert parallele Synchronisierungen
    if (this.isSyncing) {
      return {
        syncLogId: -1,
        status: 'error',
        message: 'Eine Produktsynchronisierung läuft bereits.'
      };
    }

    // Versuche, das Sync-Lock zu erwerben
    const lockAcquired = await acquireSyncLock(SYNC_TYPE.PRODUCTS);
    if (!lockAcquired) {
      return {
        syncLogId: -1,
        status: 'error',
        message: 'Eine andere Produktsynchronisierung läuft bereits. Bitte warten Sie, bis diese abgeschlossen ist.'
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    
    try {
      // Erstelle einen Sync-Log-Eintrag
      const syncLog: InsertSyncLog = {
        syncType: 'products',
        startDate: new Date(),
        syncStatus: 'running',
      };

      const logEntry = await storage.createSyncLog(syncLog);
      const syncLogId = logEntry.id;

      console.log("Starte Produktsynchronisierung mit Vendon API...");

      // Zähler für die Synchronisation
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;

      try {
        // 1. Hole alle bestehenden Produkte aus der Datenbank für schnelle Suche
        console.log("Hole bestehende Produkte aus der Datenbank...");
        
        // Optimiert mit Indizes: nach vendonId und nach normalisiertem Namen
        const existingProducts = await storage.getProducts(0);
        
        // Maps für schnellen Zugriff erstellen
        const existingByVendonId: Record<string, Product> = {};
        const existingByNormalizedName: Record<string, Product> = {};
        
        for (const product of existingProducts) {
          if (product.vendonId) {
            existingByVendonId[product.vendonId] = product;
          }
          
          const normalizedName = this.normalizeProductName(product.productName);
          if (normalizedName) {
            existingByNormalizedName[normalizedName] = product;
          }
        }
        
        console.log(`${existingProducts.length} bestehende Produkte gefunden`);

        // 2. Rufe alle Produkte über die Vendon API ab
        console.log("Rufe Produkte von der Vendon API ab...");
        const products = await this.api.getProducts();

        if (!products || !Array.isArray(products)) {
          throw new Error(`Ungültige Produktdaten von der API erhalten: ${typeof products}`);
        }

        itemsFound = products.length;
        console.log(`${itemsFound} Produkte von der API erhalten`);

        // 3. Verarbeite jedes Produkt
        const processedVendonIds = new Set<string>(); // Verfolgt bereits verarbeitete Vendon-IDs in diesem Durchlauf

        for (const product of products) {
          try {
            // Extrahiere wichtige Felder
            const vendonId = product.id?.toString() || '';
            
            // Überspringe Produkte ohne ID
            if (!vendonId) {
              console.warn("Produkt ohne ID übersprungen");
              errors++;
              continue;
            }
            
            // Überspringe, wenn wir dieses Produkt bereits in diesem Durchlauf verarbeitet haben
            if (processedVendonIds.has(vendonId)) {
              console.log(`Duplikat-Vendon-ID übersprungen: ${vendonId}`);
              duplicates++;
              continue;
            }
            
            // Als verarbeitet markieren
            processedVendonIds.add(vendonId);
            
            // Produktnamen extrahieren
            let productName = product.name || '';
            
            // Alternativen für den Produktnamen versuchen, wenn kein Name gefunden wird
            if (!productName) {
              productName = product.product_name || product.title || product.label || `Produkt ${vendonId}`;
            }
            
            const normalizedName = this.normalizeProductName(productName);
            
            // Optimierte Datenextraktion
            const productData: InsertProduct = {
              vendonId,
              productName,
              price: product.price ?? null,
              category: product.category ?? null,
              description: product.description ?? null,
              status: product.status ?? 'active',
              sku: product.sku ?? product.code ?? null,
              barcode: product.barcode ?? product.code ?? null,
              supplierId: product.supplier_id ?? null,
              supplierName: product.supplier_name ?? null,
              supplierSku: product.supplier_sku ?? null,
              articleSupplier: product.article_supplier ?? null,
              packageSize: product.package_size ?? null,
              shelfLifeDays: product.shelf_life_days ?? null,
              minOrderQuantity: product.min_order_quantity ?? null,
              vat: product.vat ?? null,
              depositPrice: product.deposit_price ?? null,
              depositVat: product.deposit_vat ?? null,
              productType: product.type ?? null,
              article: product.article ?? null,
              tags: product.tags ? JSON.stringify(product.tags) : null,
              units: product.units ?? null,
              recipe: product.recipe ? JSON.stringify(product.recipe) : null,
              costPrice: product.cost_price ?? null,
              warehouseLocation: product.warehouse_location ?? null,
              vendonUpdatedAt: product.updated_at ? new Date(product.updated_at * 1000) : null,
              accountId: product.account_id ?? null,
              accountName: product.account_name ?? null,
              accountTimezone: product.account_timezone ?? null,
              amountMax: product.amount_max ?? null,
              amountStandard: product.amount_standard ?? null,
              amountCritical: product.amount_critical ?? null,
              refillUnitSize: product.refill_unit_size ?? null,
              minRefill: product.min_refill ?? null,
              critical: product.critical ?? null,
              additionalData: product ? JSON.stringify(product) : null,
            };
            
            // Prüfen, ob das Produkt bereits existiert - zuerst nach Vendon-ID, dann nach Name
            const existingProduct = existingByVendonId[vendonId] || (normalizedName ? existingByNormalizedName[normalizedName] : null);
            
            if (existingProduct) {
              // Prüfen, ob ein Update überhaupt nötig ist
              if (forceUpdate || this.needsUpdate(existingProduct, productData)) {
                console.log(`Aktualisiere Produkt: ${productName} (ID: ${existingProduct.id}, vendonId: ${vendonId})`);
                
                // Zugehörige Produkt-ID verwenden
                const updatedProduct = await storage.updateProduct(existingProduct.id, {
                  ...productData,
                  updatedAt: new Date()
                });
                
                // Aktualisiere die lokalen Caches für nachfolgende Vergleiche
                existingByVendonId[vendonId] = updatedProduct;
                if (normalizedName) {
                  existingByNormalizedName[normalizedName] = updatedProduct;
                }
                
                itemsUpdated++;
              } else {
                console.log(`Produkt ${productName} (ID: ${existingProduct.id}) benötigt kein Update`);
              }
            } else {
              // Neues Produkt erstellen
              console.log(`Erstelle neues Produkt: ${productName} (vendonId: ${vendonId})`);
              
              const newProduct = await storage.createProduct({
                ...productData,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              
              // Aktualisiere die Caches
              existingByVendonId[vendonId] = newProduct;
              if (normalizedName) {
                existingByNormalizedName[normalizedName] = newProduct;
              }
              
              itemsSaved++;
            }
          } catch (error) {
            console.error(`Fehler bei der Verarbeitung des Produkts:`, error);
            errors++;
          }
        }
        
        // Gesamtdauer berechnen
        const endTime = Date.now();
        const durationSeconds = (endTime - startTime) / 1000;
        
        // Aktualisiere den Sync-Log-Eintrag
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
        
        console.log(`Produktsynchronisierung abgeschlossen in ${durationSeconds.toFixed(2)} Sekunden`);
        console.log(`Gefunden: ${itemsFound}, Neu: ${itemsSaved}, Aktualisiert: ${itemsUpdated}, Duplikate: ${duplicates}, Fehler: ${errors}`);
        
        // Aktualisiere den letzten Synchronisierungszeitpunkt
        this.lastSyncTime = new Date();
        
        return {
          syncLogId,
          status: 'success',
          message: `Produktsynchronisierung erfolgreich abgeschlossen. ${itemsSaved} neue Produkte, ${itemsUpdated} aktualisiert.`,
          stats: {
            itemsFound,
            itemsSaved,
            itemsUpdated,
            duplicates,
            errors,
            durationSeconds
          }
        };
        
      } catch (error) {
        console.error("Fehler bei der Produktsynchronisierung:", error);
        
        // Aktualisiere den Sync-Log-Eintrag mit dem Fehler
        await storage.updateSyncLog(syncLogId, {
          endDate: new Date(),
          syncStatus: 'error',
          syncMessage: error instanceof Error ? error.message : String(error)
        });
        
        return {
          syncLogId,
          status: 'error',
          message: `Fehler bei der Produktsynchronisierung: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    } finally {
      // Setze den Synchronisierungsstatus zurück und gib das Lock frei
      this.isSyncing = false;
      await releaseSyncLock(SYNC_TYPE.PRODUCTS);
    }
  }

  /**
   * Prüft, ob ein Produkt aktualisiert werden muss
   * @param existing Das bestehende Produkt aus der Datenbank
   * @param incoming Die neuen Produktdaten von der API
   */
  private needsUpdate(existing: Product, incoming: InsertProduct): boolean {
    // Liste der Felder, die für einen Vergleich relevant sind
    const fieldsToCompare: (keyof InsertProduct)[] = [
      'productName',
      'price',
      'category',
      'description',
      'status',
      'vat',
      'article',
      'tags',
      'units',
      'recipe',
      'costPrice',
      'vendonUpdatedAt'
    ];
    
    // Prüfe auf Änderungen in wichtigen Feldern
    for (const field of fieldsToCompare) {
      // Spezielle Behandlung für JSON-Felder
      if (field === 'tags' || field === 'recipe') {
        const existingValue = existing[field] ? JSON.stringify(JSON.parse(existing[field] as string)) : null;
        const incomingValue = incoming[field] ? JSON.stringify(JSON.parse(incoming[field] as string)) : null;
        
        if (existingValue !== incomingValue) {
          return true;
        }
        continue;
      }
      
      // Spezielle Behandlung für Datumswerte
      if (field === 'vendonUpdatedAt') {
        const existingDate = existing[field] ? new Date(existing[field] as Date).getTime() : null;
        const incomingDate = incoming[field] ? new Date(incoming[field] as Date).getTime() : null;
        
        if (existingDate !== incomingDate) {
          return true;
        }
        continue;
      }
      
      // Standardvergleich für andere Felder
      if (existing[field] !== incoming[field]) {
        return true;
      }
    }
    
    return false;
  }
}

// Exportiere eine Singleton-Instanz
export const productSyncService = new ProductSyncService();
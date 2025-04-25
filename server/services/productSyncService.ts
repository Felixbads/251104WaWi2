/**
 * Product Synchronization Service
 * 
 * Verwaltet die Synchronisierung von Produktdaten zwischen Vendon API und der lokalen Datenbank
 */

import { db } from '../db';
import { vendonAPI } from './vendonAPI';
import { products, syncLogs, type InsertProduct, type InsertSyncLog } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from '../storage';

export class ProductSyncService {
  /**
   * Führt eine vollständige Synchronisierung der Produkte durch
   * @returns SyncLog Eintrag
   */
  async syncAllProducts(): Promise<any> {
    // Erstelle einen Eintrag im SyncLog
    const syncLog: InsertSyncLog = {
      syncType: 'products',
      startDate: new Date(),
      syncStatus: 'running',
      itemsFound: 0,
      itemsSaved: 0,
      itemsUpdated: 0,
      errors: 0,
      duplicates: 0,
    };

    const syncLogEntry = await storage.createSyncLog(syncLog);
    console.log(`Produktsynchronisierung gestartet mit ID ${syncLogEntry.id}`);

    try {
      // 1. Hole bestehende Produkte aus der Datenbank
      console.log('Hole bestehende Produkte aus der Datenbank...');
      const existingProducts = await db.select().from(products);
      console.log(`${existingProducts.length} bestehende Produkte gefunden`);

      // 2. Rufe alle Produkte von der Vendon API ab
      console.log('Rufe Produkte von der Vendon API ab...');
      let vendonProducts: any[] = [];
      
      try {
        vendonProducts = await vendonAPI.getProducts();
        
        if (!vendonProducts || !Array.isArray(vendonProducts)) {
          console.error('Keine gültigen Produktdaten von der Vendon API erhalten');
          vendonProducts = [];
        }
      } catch (apiError) {
        console.error('Fehler beim Abrufen der Produkte:', apiError);
        // Fortfahren mit leerer Liste, damit wir zumindest die bestehenden Produkte behalten
      }

      console.log(`${vendonProducts.length} Produkte von der Vendon API abgerufen`);
      syncLog.itemsFound = vendonProducts.length;

      // 3. Synchronisiere jedes Produkt mit der Datenbank
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let errors = 0;

      for (const vendonProduct of vendonProducts) {
        try {
          const result = await this.syncProduct(vendonProduct);
          if (result) {
            const isNew = !existingProducts.some(p => p.vendonId === vendonProduct.id.toString());
            if (isNew) {
              itemsSaved++;
            } else {
              itemsUpdated++;
            }
          }
        } catch (error) {
          console.error(`Fehler bei der Synchronisierung des Produkts ${vendonProduct.id}:`, error);
          errors++;
        }
      }

      // Aktualisiere Zähler
      syncLog.itemsSaved = itemsSaved;
      syncLog.itemsUpdated = itemsUpdated;
      syncLog.errors = errors;

      // 4. Aktualisiere den SyncLog mit den Ergebnissen
      syncLog.endDate = new Date();
      syncLog.syncStatus = 'success';
      syncLog.durationSeconds = syncLog.startDate ? 
        (syncLog.endDate.getTime() - syncLog.startDate.getTime()) / 1000 : 0;
      
      await storage.updateSyncLog(syncLogEntry.id, syncLog);
      console.log(`Produktsynchronisierung abgeschlossen: ${syncLog.itemsSaved} neue, ${syncLog.itemsUpdated} aktualisierte Produkte, ${syncLog.errors} Fehler`);

      return {
        ...syncLogEntry,
        itemsSaved,
        itemsUpdated,
        errors,
        databaseProducts: existingProducts.length,
        vendonProducts: vendonProducts.length,
        totalProducts: existingProducts.length + itemsSaved
      };
    } catch (error) {
      console.error('Fehler bei der Produktsynchronisierung:', error);
      
      // Aktualisiere den SyncLog mit den Fehlern
      syncLog.endDate = new Date();
      syncLog.syncStatus = 'error';
      syncLog.durationSeconds = syncLog.startDate ? 
        (syncLog.endDate.getTime() - syncLog.startDate.getTime()) / 1000 : 0;
      syncLog.errorMessage = error instanceof Error ? error.message : String(error);
      
      await storage.updateSyncLog(syncLogEntry.id, syncLog);
      
      throw error;
    }
  }

  /**
   * Synchronisiert ein einzelnes Produkt mit der Datenbank
   * @param vendonProduct Produkt von der Vendon API
   * @returns Das synchronisierte Produkt
   */
  async syncProduct(vendonProduct: any): Promise<any> {
    try {
      console.log(`Synchronisiere Produkt mit Vendon ID ${vendonProduct.id}: ${vendonProduct.name}`);
      
      // Prüfe, ob das Produkt bereits in der Datenbank existiert
      const existingProduct = await db.select()
        .from(products)
        .where(eq(products.vendonId, vendonProduct.id.toString()))
        .limit(1);

      // Bereite die Produktdaten für die Datenbank vor
      const productData: Partial<InsertProduct> = {
        vendonId: vendonProduct.id.toString(),
        productName: vendonProduct.name,
        price: vendonProduct.price || 0,
        category: vendonProduct.category_name || 'Unbekannt',
        status: vendonProduct.status || 'active',
        description: vendonProduct.description || '',
        sku: vendonProduct.plu || '',
        barcode: vendonProduct.ean || '',
        // Extrahiere weitere Daten aus dem Produkt oder additionalData
        vat: vendonProduct.vat || 19,
        depositPrice: vendonProduct.deposit_price || 0,
        depositVat: vendonProduct.deposit_vat || 19,
        productType: vendonProduct.product_type || 'standard',
        article: vendonProduct.article || '',
        tags: vendonProduct.tags ? JSON.stringify(vendonProduct.tags) : '',
        units: vendonProduct.units || '',
        costPrice: vendonProduct.cost_price || 0,
        amountMax: vendonProduct.amount_max || 10,
        amountStandard: vendonProduct.amount_standard || 5,
        amountCritical: vendonProduct.amount_critical || 2,
        refillUnitSize: vendonProduct.refill_unit_size || 1,
        minRefill: vendonProduct.min_refill || 1,
        critical: vendonProduct.critical || false,
        // Speichere die vollständigen Rohdaten für spätere Referenz
        additionalData: JSON.stringify(vendonProduct),
        vendonUpdatedAt: vendonProduct.updated_at 
          ? new Date(vendonProduct.updated_at * 1000) 
          : new Date(),
      };

      let result;
      
      if (existingProduct.length > 0) {
        // Aktualisiere das bestehende Produkt
        const [updated] = await db.update(products)
          .set({
            ...productData,
            updatedAt: new Date(),
          })
          .where(eq(products.vendonId, vendonProduct.id.toString()))
          .returning();
        
        result = updated;
        console.log(`Produkt ${vendonProduct.id} (${vendonProduct.name}) aktualisiert`);
      } else {
        // Erstelle ein neues Produkt
        const [inserted] = await db.insert(products)
          .values({
            ...productData as InsertProduct,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        
        result = inserted;
        console.log(`Neues Produkt ${vendonProduct.id} (${vendonProduct.name}) erstellt`);
      }

      return result;
    } catch (error) {
      console.error(`Fehler bei der Synchronisierung des Produkts ${vendonProduct.id}:`, error);
      throw error;
    }
  }

  /**
   * Holt ein Produkt aus der Vendon API und synchronisiert es
   * @param vendonId ID des Produkts in der Vendon API
   * @returns Das synchronisierte Produkt
   */
  async syncProductById(vendonId: string): Promise<any> {
    try {
      console.log(`Rufe Produkt mit ID ${vendonId} von der Vendon API ab...`);
      const vendonProduct = await vendonAPI.getProduct(vendonId);
      
      if (!vendonProduct) {
        throw new Error(`Produkt mit ID ${vendonId} nicht in der Vendon API gefunden`);
      }
      
      return await this.syncProduct(vendonProduct);
    } catch (error) {
      console.error(`Fehler beim Abrufen und Synchronisieren des Produkts mit ID ${vendonId}:`, error);
      throw error;
    }
  }
}

// Exportiere eine Instanz der Klasse für einfache Verwendung
export const productSyncService = new ProductSyncService();
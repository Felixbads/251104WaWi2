/**
 * Vendon Delta Sync Service
 * 
 * Implementiert die Delta-Synchronisation mit Watermarks für Live-Sync
 * Ersetzt den traditionellen Zeitfenster-basierten Sync durch effizienten
 * updated_at-basierten Delta-Sync wie in der Spezifikation definiert.
 */

import { VendonAPI } from './vendonAPI';
import { storage } from '../storage';
import { watermarkStore } from './watermarkStore';

interface DeltaSyncResult {
  success: boolean;
  machineId: string;
  fetchedCount: number;
  upsertedCount: number;
  skippedCount: number;
  duration: number;
  errors: string[];
  message: string;
  newWatermark?: Date;
}

export class VendonDeltaSync {
  private vendonApi: VendonAPI;
  private logger: any;

  constructor() {
    this.vendonApi = new VendonAPI();
    this.logger = console;
  }

  /**
   * Führt Delta-Sync für eine spezifische Maschine durch
   * Verwendet search_time=updated und Watermarks für effizienten Sync
   */
  async syncMachine(machineId: string): Promise<DeltaSyncResult> {
    const startTime = Date.now();
    const result: DeltaSyncResult = {
      success: false,
      machineId,
      fetchedCount: 0,
      upsertedCount: 0,
      skippedCount: 0,
      duration: 0,
      errors: [],
      message: ''
    };

    this.logger.log(`🔄 Starte Delta-Sync für Maschine ${machineId}`);

    try {
      // Hole aktuellen Watermark für die Maschine
      const currentWatermark = await watermarkStore.getLastUpdatedAt(machineId);
      
      if (!currentWatermark) {
        // Erste Synchronisation - initialisiere Watermark mit gestern
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        await watermarkStore.initializeWatermark(machineId, yesterday);
        this.logger.log(`📅 Watermark für Maschine ${machineId} initialisiert: ${yesterday.toISOString()}`);
        
        // Führe initialen Sync für die letzten 24 Stunden durch
        return await this.performInitialSync(machineId, yesterday);
      }

      // Delta-Sync basierend auf Watermark
      return await this.performDeltaSync(machineId, currentWatermark);

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(`Kritischer Fehler beim Delta-Sync: ${error}`);
      result.message = `Delta-Sync fehlgeschlagen: ${error}`;
      this.logger.error(`❌ Delta-Sync-Fehler für Maschine ${machineId}:`, error);
    }

    return result;
  }

  /**
   * Initialer Sync für neue Maschinen (letzte 24 Stunden)
   */
  private async performInitialSync(machineId: string, fromDate: Date): Promise<DeltaSyncResult> {
    const startTime = Date.now();
    const toDate = new Date();
    
    this.logger.log(`🚀 Initialer Sync für Maschine ${machineId}: ${fromDate.toISOString()} - ${toDate.toISOString()}`);

    const result: DeltaSyncResult = {
      success: false,
      machineId,
      fetchedCount: 0,
      upsertedCount: 0,
      skippedCount: 0,
      duration: 0,
      errors: [],
      message: ''
    };

    try {
      let offset = 0;
      let hasMore = true;
      const pageSize = 500;

      while (hasMore) {
        const apiResponse = await this.vendonApi.getTransactionsEnhanced({
          machineId,
          fromTs: Math.floor(fromDate.getTime() / 1000),
          toTs: Math.floor(toDate.getTime() / 1000),
          limit: pageSize,
          offset: offset,
          sort: '-transaction_id' // Deterministische Pagination
        });

        const items = apiResponse.items || [];
        result.fetchedCount += items.length;

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        // Domain-Mapping und Upsert
        const domainTransactions = this.mapToDomain(items);
        const upsertedItems = await storage.upsertTransactionsBatch(domainTransactions);
        result.upsertedCount += upsertedItems.length;

        // Update Watermark mit dem höchsten updated_at aus den Items
        await watermarkStore.updateWatermarkFromTransactions(machineId, items);

        offset += items.length;

        if (items.length < pageSize) {
          hasMore = false;
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;
      result.message = `Initialer Sync erfolgreich: ${result.upsertedCount} Transaktionen verarbeitet`;
      
      this.logger.log(`✅ Initialer Sync für Maschine ${machineId} abgeschlossen: ${result.message}`);

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(`Initialer Sync Fehler: ${error}`);
      result.message = `Initialer Sync fehlgeschlagen: ${error}`;
      this.logger.error(`❌ Initialer Sync-Fehler für Maschine ${machineId}:`, error);
    }

    return result;
  }

  /**
   * Delta-Sync mit search_time=updated
   */
  private async performDeltaSync(machineId: string, lastWatermark: Date): Promise<DeltaSyncResult> {
    const startTime = Date.now();
    const now = new Date();
    
    this.logger.log(`⚡ Delta-Sync für Maschine ${machineId}: Watermark ${lastWatermark.toISOString()}`);

    const result: DeltaSyncResult = {
      success: false,
      machineId,
      fetchedCount: 0,
      upsertedCount: 0,
      skippedCount: 0,
      duration: 0,
      errors: [],
      message: ''
    };

    try {
      let offset = 0;
      let hasMore = true;
      const pageSize = 500;
      let maxUpdatedAt = lastWatermark;

      while (hasMore) {
        // Delta-Sync mit search_time=updated
        const apiResponse = await this.vendonApi.getTransactionsEnhanced({
          machineId,
          fromTs: Math.floor(lastWatermark.getTime() / 1000),
          toTs: Math.floor(now.getTime() / 1000),
          limit: pageSize,
          offset: offset,
          searchTime: 'updated', // Kernfunktion für Delta-Sync
          sort: '-transaction_id'
        });

        const items = apiResponse.items || [];
        result.fetchedCount += items.length;

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        // Filtere Items die neuer als der aktuelle Watermark sind
        const newItems = items.filter(item => {
          if (item.updated_at) {
            const itemUpdated = new Date(item.updated_at);
            return itemUpdated > lastWatermark;
          }
          return true; // Items ohne updated_at trotzdem verarbeiten
        });

        this.logger.log(`🔍 Delta-Sync: ${items.length} Items empfangen, ${newItems.length} sind neuer als Watermark`);

        if (newItems.length > 0) {
          // Domain-Mapping und Upsert nur für neue Items
          const domainTransactions = this.mapToDomain(newItems);
          const upsertedItems = await storage.upsertTransactionsBatch(domainTransactions);
          result.upsertedCount += upsertedItems.length;

          // Finde den neuesten updated_at Wert
          newItems.forEach(item => {
            if (item.updated_at) {
              const itemUpdated = new Date(item.updated_at);
              if (itemUpdated > maxUpdatedAt) {
                maxUpdatedAt = itemUpdated;
              }
            }
          });
        } else {
          result.skippedCount += items.length;
        }

        offset += items.length;

        if (items.length < pageSize) {
          hasMore = false;
        }
      }

      // Update Watermark nur wenn wir neuere Daten gefunden haben
      if (maxUpdatedAt > lastWatermark) {
        await watermarkStore.setWatermark(machineId, maxUpdatedAt);
        result.newWatermark = maxUpdatedAt;
        this.logger.log(`📌 Watermark für Maschine ${machineId} aktualisiert: ${maxUpdatedAt.toISOString()}`);
      }

      result.success = true;
      result.duration = Date.now() - startTime;
      result.message = result.upsertedCount > 0 
        ? `Delta-Sync erfolgreich: ${result.upsertedCount} neue Transaktionen`
        : `Delta-Sync erfolgreich: Keine neuen Transaktionen`;
      
      this.logger.log(`✅ Delta-Sync für Maschine ${machineId} abgeschlossen: ${result.message}`);

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(`Delta-Sync Fehler: ${error}`);
      result.message = `Delta-Sync fehlgeschlagen: ${error}`;
      this.logger.error(`❌ Delta-Sync-Fehler für Maschine ${machineId}:`, error);
    }

    return result;
  }

  /**
   * Sync für alle aktiven Maschinen
   */
  async syncAllMachines(): Promise<Record<string, DeltaSyncResult>> {
    this.logger.log(`🚀 Starte Delta-Sync für alle aktiven Maschinen`);

    try {
      // Hole alle aktiven Maschinen
      const machines = await storage.getMachines();
      const activeMachines = machines
        .filter(m => m.vendonId && m.isActive !== false)
        .map(m => m.vendonId as string);

      this.logger.log(`📋 Gefunden: ${activeMachines.length} aktive Maschinen für Delta-Sync`);

      const results: Record<string, DeltaSyncResult> = {};

      // Sequenziell verarbeiten um API-Limits zu respektieren
      for (const machineId of activeMachines) {
        try {
          results[machineId] = await this.syncMachine(machineId);
          
          // Kurze Pause zwischen Maschinen um API-Rate-Limits zu respektieren
          await this.sleep(100);
          
        } catch (error) {
          results[machineId] = {
            success: false,
            machineId,
            fetchedCount: 0,
            upsertedCount: 0,
            skippedCount: 0,
            duration: 0,
            errors: [`Maschinen-Sync Fehler: ${error}`],
            message: `Sync für ${machineId} fehlgeschlagen`
          };
        }
      }

      // Gesamtstatistik loggen
      const totalStats = Object.values(results).reduce((acc, result) => {
        return {
          successful: acc.successful + (result.success ? 1 : 0),
          failed: acc.failed + (result.success ? 0 : 1),
          totalFetched: acc.totalFetched + result.fetchedCount,
          totalUpserted: acc.totalUpserted + result.upsertedCount
        };
      }, { successful: 0, failed: 0, totalFetched: 0, totalUpserted: 0 });

      this.logger.log(`📊 Delta-Sync Zusammenfassung: ${totalStats.successful} erfolgreich, ${totalStats.failed} fehlgeschlagen, ${totalStats.totalUpserted} neue Transaktionen`);

      return results;

    } catch (error) {
      this.logger.error(`❌ Fehler beim Delta-Sync aller Maschinen:`, error);
      throw error;
    }
  }

  /**
   * Mappt Vendon API-Daten auf Domain-Modell
   */
  private mapToDomain(apiItems: any[]): any[] {
    return apiItems.map(item => ({
      vendonId: item.transaction_id || item.id,
      machineId: item.machine_id,
      machineName: item.machine_name,
      datetime: new Date(item.datetime || item.transaction_dt),
      transactionDt: item.transaction_dt ? new Date(item.transaction_dt) : null,
      registeredDt: item.registered_dt ? new Date(item.registered_dt) : null,
      updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
      productId: item.product_id,
      productName: item.product_name || 'Unbekanntes Produkt',
      selection: item.selection,
      quantity: item.quantity || 1,
      price: item.price || 0,
      priceVat: item.price_vat,
      priceWoVat: item.price_wo_vat,
      vat: item.vat,
      currency: item.currency || 'EUR',
      paymentMethod: item.payment_method,
      source: 'vendon_delta',
      extraData: JSON.stringify(item),
      status: 'completed'
    }));
  }

  /**
   * Sleep-Funktion für API-Rate-Limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sync-Status für alle Maschinen abrufen
   */
  async getSyncStatus(): Promise<Array<{ machineId: string; lastSync: Date | null; isHealthy: boolean }>> {
    try {
      const machines = await storage.getMachines();
      const status: Array<{ machineId: string; lastSync: Date | null; isHealthy: boolean }> = [];

      for (const machine of machines) {
        if (machine.vendonId) {
          const lastSync = await watermarkStore.getLastUpdatedAt(machine.vendonId);
          const isHealthy = lastSync ? (Date.now() - lastSync.getTime()) < (2 * 60 * 60 * 1000) : false; // 2 Stunden Threshold
          
          status.push({
            machineId: machine.vendonId,
            lastSync,
            isHealthy
          });
        }
      }

      return status;

    } catch (error) {
      this.logger.error('❌ Fehler beim Abrufen des Sync-Status:', error);
      return [];
    }
  }
}

// Singleton-Instanz exportieren
export const vendonDeltaSync = new VendonDeltaSync();
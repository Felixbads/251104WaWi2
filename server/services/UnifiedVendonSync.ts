/**
 * UNIFIED VENDON SYNC - ZENTRALER SYNCHRONISATIONS-ENGINE
 * 
 * Konsolidiert alle Vendon-Synchronisationslogik in einen einheitlichen Service.
 * Löst die Probleme der duplizierten Services und N+1-Abfragen.
 * 
 * Features:
 * - Zentrale API-Client-Verwaltung
 * - Batch-basierte Duplikatsprüfung
 * - Persistente verteilte Locks
 * - Transaktionssichere Bulk-Operationen
 * - Automatisches Recovery bei Fehlern
 * - Umfassendes Monitoring und Logging
 */

import { storage } from "../storage.js";
import { DuplicatePreventionService } from "./DuplicatePreventionService.js";
import { PersistentSyncLock } from "./PersistentSyncLock.js";
import { VendonAPI } from "./vendonAPI.js";
import { 
  InsertSyncLog, 
  InsertMachine, 
  InsertTransaction, 
  InsertEvent,
  InsertRefill
} from "@shared/schema";
import { rawDb } from "../db";

interface SyncOptions {
  batchSize?: number;
  maxRetries?: number;
  requestDelay?: number;
  forceUpdate?: boolean;
  enableRecovery?: boolean;
}

interface SyncResult {
  status: 'success' | 'partial' | 'error';
  message: string;
  stats: {
    found: number;
    saved: number;
    updated: number;
    duplicates: number;
    errors: number;
    duration: number;
  };
  errors?: string[];
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

export class UnifiedVendonSync {
  private readonly vendonApi: VendonAPI;
  private readonly duplicateService: DuplicatePreventionService;
  private readonly syncLock: PersistentSyncLock;
  
  // Konfiguration
  private readonly defaultOptions: Required<SyncOptions> = {
    batchSize: 500,
    maxRetries: 3,
    requestDelay: 1000,
    forceUpdate: false,
    enableRecovery: true
  };

  constructor(apiKey?: string) {
    this.vendonApi = new VendonAPI(apiKey);
    this.duplicateService = new DuplicatePreventionService();
    this.syncLock = new PersistentSyncLock();
    
    console.log('✨ UnifiedVendonSync initialisiert - bereit für zentralisierten Sync');
  }

  /**
   * Führt eine vollständige Synchronisation aller Datentypen durch
   */
  async runFullSync(options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const lockId = 'unified_full_sync';
    
    if (!await this.syncLock.acquire(lockId, 30)) {
      return {
        status: 'error',
        message: 'Sync bereits aktiv - Lock konnte nicht erworben werden',
        stats: { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 1, duration: 0 }
      };
    }

    const startTime = Date.now();
    let totalStats = { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration: 0 };
    const errors: string[] = [];

    try {
      console.log('🚀 Starte vollständige Unified Vendon Synchronisation...');
      
      // Synchronisiere Maschinen zuerst (benötigt für andere Entitäten)
      const machineResult = await this.syncMachines(opts);
      this.mergeStats(totalStats, machineResult.stats);
      if (machineResult.errors) errors.push(...machineResult.errors);

      // Synchronisiere Transaktionen (letzte 48h)
      const transactionRange: DateRange = {
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDate: new Date()
      };
      const transactionResult = await this.syncTransactions(transactionRange, opts);
      this.mergeStats(totalStats, transactionResult.stats);
      if (transactionResult.errors) errors.push(...transactionResult.errors);

      // Synchronisiere Refills (letzte 48h)
      const refillRange: DateRange = {
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDate: new Date()
      };
      const refillResult = await this.syncRefills(refillRange, opts);
      this.mergeStats(totalStats, refillResult.stats);
      if (refillResult.errors) errors.push(...refillResult.errors);

      // TODO: Events API-Endpunkt noch nicht implementiert
      console.log('⚠️ Events Sync übersprungen - API-Endpunkt nicht verfügbar');

      totalStats.duration = Date.now() - startTime;

      // Sync-Log erstellen
      await this.logSyncResult('full_sync', totalStats, errors);

      const status = errors.length > 0 ? 'partial' : 'success';
      const message = `Vollständiger Sync abgeschlossen: ${totalStats.saved} neue, ${totalStats.updated} aktualisiert, ${totalStats.duplicates} Duplikate (${totalStats.duration}ms)`;

      return {
        status,
        message,
        stats: totalStats,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      await this.logSyncResult('full_sync', { ...totalStats, duration, errors: 1 }, [errorMsg]);
      
      return {
        status: 'error',
        message: `Vollständiger Sync fehlgeschlagen: ${errorMsg}`,
        stats: { ...totalStats, duration, errors: 1 }
      };
    } finally {
      await this.syncLock.release(lockId);
    }
  }

  /**
   * Führt eine inkrementelle Synchronisation durch (nur neueste Daten)
   */
  async runIncrementalSync(fromDate?: Date, toDate?: Date, options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const lockId = 'unified_incremental_sync';
    
    if (!await this.syncLock.acquire(lockId, 15)) {
      return {
        status: 'error',
        message: 'Incrementeller Sync bereits aktiv',
        stats: { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 1, duration: 0 }
      };
    }

    const startTime = Date.now();
    const range: DateRange = {
      startDate: fromDate || new Date(Date.now() - 6 * 60 * 60 * 1000), // Default: letzte 6h
      endDate: toDate || new Date()
    };

    try {
      console.log(`🔄 Starte inkrementellen Sync: ${range.startDate.toISOString()} bis ${range.endDate.toISOString()}`);
      
      // Priorisierung: Transaktionen > Events > Refills
      const transactionResult = await this.syncTransactions(range, opts);
      
      const stats = transactionResult.stats;
      stats.duration = Date.now() - startTime;
      
      await this.logSyncResult('incremental_sync', stats, transactionResult.errors);
      
      return {
        status: transactionResult.status,
        message: `Incrementeller Sync: ${stats.saved} neue Transaktionen`,
        stats,
        errors: transactionResult.errors
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      return {
        status: 'error',
        message: `Incrementeller Sync fehlgeschlagen: ${errorMsg}`,
        stats: { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 1, duration }
      };
    } finally {
      await this.syncLock.release(lockId);
    }
  }

  /**
   * ENHANCED: Synchronisiert Transaktionen für einen Zeitraum mit dynamischen Zeitfenstern
   */
  async syncTransactions(range: DateRange, options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const stats = { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration: 0 };
    const errors: string[] = [];

    try {
      console.log(`🔄 ENHANCED Transaktionen-Sync: ${range.startDate.toISOString()} bis ${range.endDate.toISOString()}`);
      
      // DYNAMIC TIME WINDOW ALGORITHM
      let currentStartTime = Math.floor(range.startDate.getTime() / 1000);
      const finalEndTime = Math.floor(range.endDate.getTime() / 1000);
      
      // Dynamische Zeitfenster-Konfiguration (Standard: 2 Stunden)
      const baseTimeWindow = 2 * 60 * 60; // 2 Stunden in Sekunden
      let currentTimeWindow = baseTimeWindow;
      
      while (currentStartTime < finalEndTime) {
        const currentEndTime = Math.min(currentStartTime + currentTimeWindow, finalEndTime);
        
        console.log(`📅 Zeitfenster: ${new Date(currentStartTime * 1000).toISOString()} bis ${new Date(currentEndTime * 1000).toISOString()}`);
        
        // Timestamp-basierte Pagination für aktuelles Zeitfenster
        let offset = 0;
        let hasMore = true;
        let lastTransactionTimestamp = currentStartTime;
        
        while (hasMore && currentStartTime < finalEndTime) {
          try {
            // Enhanced API-Aufruf mit präziser Timestamp-Kontrolle
            const fromTimestamp = Math.max(currentStartTime, lastTransactionTimestamp);
            
            const apiResult = await this.vendonApi.getTransactions(
              new Date(fromTimestamp * 1000),
              new Date(currentEndTime * 1000),
              opts.batchSize
            );
            
            if (!apiResult || apiResult.length === 0) {
              hasMore = false;
              break;
            }

            stats.found += apiResult.length;
            
            // Kritische Erkennung: API-Limit erreicht?
            const hitApiLimit = apiResult.length === opts.batchSize;
            
            if (hitApiLimit && apiResult.length > 0) {
              console.log(`🔥 API-Limit erreicht (${opts.batchSize}) - aktiviere Timestamp-Fortsetzung`);
              
              // Sortiere nach Timestamp für präzise Fortsetzung
              const sortedTransactions = apiResult.sort((a, b) => {
                const timestampA = new Date(a.datetime || a.transaction_dt).getTime();
                const timestampB = new Date(b.datetime || b.transaction_dt).getTime();
                return timestampA - timestampB;
              });
              
              // Letzter Timestamp als neuer Startpunkt
              const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
              const lastTimestamp = new Date(lastTransaction.datetime || lastTransaction.transaction_dt).getTime();
              lastTransactionTimestamp = Math.floor(lastTimestamp / 1000) + 1;
              
              console.log(`⏭️ Fortsetzung ab: ${new Date(lastTransactionTimestamp * 1000).toISOString()}`);
            }
            
            // Batch-Verarbeitung mit Duplicate Prevention Service
            const processResult = await this.duplicateService.processTransactionBatch(
              apiResult, 
              opts.forceUpdate
            );
            
            stats.saved += processResult.saved;
            stats.updated += processResult.updated;
            stats.duplicates += processResult.duplicates;

            // KRITISCHE ERGÄNZUNG: Inventory-Reduktion für neue Transaktionen
            if (processResult.saved > 0) {
              console.log(`🔄 Erstelle Inventory-Bewegungen für ${processResult.saved} neue Verkäufe...`);
              await this.processInventoryReductionsForNewTransactions(apiResult);
            }
            
            if (processResult.errors.length > 0) {
              stats.errors += processResult.errors.length;
              errors.push(...processResult.errors);
            }

            // Entscheidung über Fortsetzung
            if (hitApiLimit) {
              // Bei API-Limit: Timestamp-basierte Fortsetzung
              hasMore = lastTransactionTimestamp < currentEndTime;
              offset = 0;
            } else {
              // Normal: Keine weiteren Daten in diesem Zeitfenster
              hasMore = false;
            }
            
            // Rate Limiting
            if (hasMore && opts.requestDelay > 0) {
              await this.sleep(opts.requestDelay);
            }
            
            console.log(`📊 Batch: ${processResult.saved} neue von ${apiResult.length} (${stats.duplicates} Duplikate gesamt)`);

          } catch (batchError) {
            const errorMsg = `Enhanced Batch-Fehler bei Timestamp ${currentStartTime}: ${batchError instanceof Error ? batchError.message : String(batchError)}`;
            errors.push(errorMsg);
            stats.errors++;
            
            console.error(errorMsg);
            
            // Kleineres Zeitfenster bei Fehlern
            if (currentTimeWindow > 900) { // Mindestens 15 Minuten
              currentTimeWindow = Math.floor(currentTimeWindow / 2);
              console.log(`🔧 Reduziere Zeitfenster auf ${currentTimeWindow / 60} Minuten`);
            }
            
            // Exponentielles Backoff
            await this.sleep(opts.requestDelay * Math.min(stats.errors, 4));
          }
        }

        // Zum nächsten Zeitfenster
        currentStartTime = currentEndTime;
        
        // Zeitfenster-Anpassung basierend auf Datendichte
        if (stats.found > 0) {
          const transactionsPerSecond = stats.found / ((currentEndTime - Math.floor(range.startDate.getTime() / 1000)) || 1);
          if (transactionsPerSecond > 0.1) { // Hohe Dichte
            currentTimeWindow = Math.max(900, Math.floor(currentTimeWindow * 0.8));
          } else if (transactionsPerSecond < 0.01) { // Niedrige Dichte  
            currentTimeWindow = Math.min(8 * 60 * 60, Math.floor(currentTimeWindow * 1.5));
          }
        }
      }

      stats.duration = Date.now() - startTime;
      
      const status = stats.errors > 0 ? 'partial' : 'success';
      const message = `Enhanced Transaktionen-Sync: ${stats.saved} neu, ${stats.duplicates} Duplikate (${stats.duration}ms)`;

      return { status, message, stats, errors: errors.length > 0 ? errors : undefined };

    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors++;
      
      const errorMsg = `Enhanced Transaktionen-Sync fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      
      return {
        status: 'error',
        message: errorMsg,
        stats,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Synchronisiert Events für einen Zeitraum
   * TODO: API-Endpunkt noch nicht implementiert in VendonAPI
   */
  async syncEvents(range: DateRange, options?: SyncOptions): Promise<SyncResult> {
    const duration = Date.now() - Date.now(); // 0ms
    console.log(`⚠️ Events-Sync übersprungen - API-Endpunkt noch nicht verfügbar`);
    
    return {
      status: 'success',
      message: 'Events-Sync übersprungen - API-Endpunkt nicht verfügbar',
      stats: { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration }
    };
  }

  /**
   * Synchronisiert Refills für einen Zeitraum
   */
  async syncRefills(range: DateRange, options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const stats = { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration: 0 };
    const errors: string[] = [];

    try {
      console.log('🔄 Synchronisiere Refills mit robuster API-Abfrage...');
      console.log(`📅 Zeitraum: ${range.startDate.toISOString()} bis ${range.endDate.toISOString()}`);
      
      // Verwende die neue robuste getRefills API-Methode
      const vendonRefills = await this.vendonApi.getRefills(range.startDate, range.endDate);
      
      if (!vendonRefills || vendonRefills.length === 0) {
        stats.duration = Date.now() - startTime;
        return {
          status: 'success',
          message: 'Keine Refills im gewählten Zeitraum gefunden',
          stats
        };
      }

      stats.found = vendonRefills.length;
      console.log(`📡 ${vendonRefills.length} Refills von API erhalten`);

      // Hole Maschinen-Mapping für Refill-Zuordnung
      const machines = await storage.getMachines();
      const machinesMap = new Map(machines.map(m => [String(m.vendonId), m.id]));
      
      // Verarbeite Refills in Batches
      const refillBatches = this.createBatches(vendonRefills, opts.batchSize);
      
      for (const batch of refillBatches) {
        try {
          const refillsToInsert: InsertRefill[] = [];
          
          for (const vendonRefill of batch) {
            try {
              // Maschinen-ID finden
              const machineId = machinesMap.get(String(vendonRefill.machine_id));
              if (!machineId) {
                console.warn(`⚠️ Refill ${vendonRefill.id}: Maschine ${vendonRefill.machine_id} nicht gefunden`);
                continue;
              }

              // Refill-Datensatz erstellen
              const newRefill: InsertRefill = {
                vendonId: String(vendonRefill.id),
                machineId: machineId,
                datetime: new Date(vendonRefill.datetime),
                operator: vendonRefill.user || null,
                extraData: JSON.stringify(vendonRefill)
              };

              refillsToInsert.push(newRefill);
              
            } catch (error) {
              stats.errors++;
              const errorMsg = `Fehler beim Verarbeiten des Refills ${vendonRefill.id}: ${error instanceof Error ? error.message : String(error)}`;
              errors.push(errorMsg);
              console.error(`❌ ${errorMsg}`);
            }
          }

          // Batch-Verarbeitung mit Duplikatsprüfung
          if (refillsToInsert.length > 0) {
            const processResult = await this.duplicateService.processRefillBatch(
              refillsToInsert,
              opts.forceUpdate
            );
            
            stats.saved += processResult.saved;
            stats.updated += processResult.updated;
            stats.duplicates += processResult.duplicates;
            
            if (processResult.errors.length > 0) {
              stats.errors += processResult.errors.length;
              errors.push(...processResult.errors);
            }
          }

        } catch (batchError) {
          stats.errors++;
          const errorMsg = `Batch-Verarbeitung fehlgeschlagen: ${batchError instanceof Error ? batchError.message : String(batchError)}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      stats.duration = Date.now() - startTime;

      // Sync-Log erstellen
      await this.logSyncResult('refills', stats, errors);

      const status = errors.length > 0 ? 'partial' : 'success';
      const message = `Refills-Sync abgeschlossen: ${stats.saved} neue, ${stats.updated} aktualisiert, ${stats.duplicates} Duplikate (${stats.duration}ms)`;

      console.log(`✅ ${message}`);

      return {
        status,
        message,
        stats,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors++;
      
      const errorMsg = `Refills-Sync fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      
      return {
        status: 'error',
        message: errorMsg,
        stats,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Synchronisiert Maschinen
   */
  async syncMachines(options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const stats = { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration: 0 };
    const errors: string[] = [];

    try {
      console.log('🔄 Synchronisiere Maschinen...');
      
      const machines = await this.vendonApi.getMachines();
      
      if (!machines || machines.length === 0) {
        stats.duration = Date.now() - startTime;
        return {
          status: 'success',
          message: 'Keine Maschinen von API erhalten',
          stats
        };
      }

      stats.found = machines.length;
      
      // Batch-Verarbeitung für Maschinen
      const processResult = await this.duplicateService.processMachineBatch(
        machines,
        opts.forceUpdate
      );
      
      stats.saved = processResult.saved;
      stats.updated = processResult.updated;
      stats.duplicates = processResult.duplicates;
      
      if (processResult.errors.length > 0) {
        stats.errors = processResult.errors.length;
        errors.push(...processResult.errors);
      }

      stats.duration = Date.now() - startTime;
      const status = stats.errors > 0 ? 'partial' : 'success';
      const message = `Maschinen-Sync: ${stats.saved} neu, ${stats.updated} aktualisiert`;

      return { status, message, stats, errors: errors.length > 0 ? errors : undefined };

    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors++;
      
      const errorMsg = `Maschinen-Sync fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      
      return {
        status: 'error',
        message: errorMsg,
        stats,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Hilfsmethoden
   */
  private mergeStats(target: any, source: any): void {
    target.found += source.found;
    target.saved += source.saved;
    target.updated += source.updated;
    target.duplicates += source.duplicates;
    target.errors += source.errors;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * KRITISCHE FUNKTION: Erstellt Inventory-Bewegungen für Verkäufe
   * Reduziert automatisch Lagerbestände wenn Produkte verkauft werden
   */
  private async processInventoryReductionsForNewTransactions(transactions: any[]): Promise<void> {
    console.log(`📦 Verarbeite Inventory-Reduktionen für ${transactions.length} Transaktionen...`);
    
    for (const transaction of transactions) {
      try {
        // Skip if no product name or quantity
        if (!transaction.product_name || !transaction.quantity) {
          continue;
        }

        // 1. Finde die Maschine und ihr zugewiesenes Lager
        const machineQuery = `
          SELECT 
            m.id as machine_id,
            m.machine_name,
            mwa.warehouse_id
          FROM machines m
          LEFT JOIN machine_warehouse_assignments mwa ON m.id = mwa.machine_id
          WHERE m.vendon_id = $1
          LIMIT 1
        `;
        
        const machineResult = await rawDb.query(machineQuery, [transaction.machine_id]);
        
        if (machineResult.rows.length === 0) {
          console.warn(`⚠️ Maschine ${transaction.machine_id} nicht gefunden für Transaktion ${transaction.transaction_id}`);
          continue;
        }
        
        const machine = machineResult.rows[0];
        if (!machine.warehouse_id) {
          console.warn(`⚠️ Kein Lager für Maschine ${machine.machine_name} zugewiesen`);
          continue;
        }

        // 2. Finde das Produkt
        const productQuery = `
          SELECT id FROM products 
          WHERE LOWER(product_name) = LOWER($1)
          LIMIT 1
        `;
        
        const productResult = await rawDb.query(productQuery, [transaction.product_name]);
        
        if (productResult.rows.length === 0) {
          console.warn(`⚠️ Produkt '${transaction.product_name}' nicht in Datenbank gefunden`);
          continue;
        }
        
        const productId = productResult.rows[0].id;

        // 3. Hole aktuellen Lagerbestand
        const inventoryQuery = `
          SELECT quantity FROM inventory_items 
          WHERE warehouse_id = $1 AND product_id = $2
          LIMIT 1
        `;
        
        const inventoryResult = await rawDb.query(inventoryQuery, [machine.warehouse_id, productId]);
        
        let currentStock = 0;
        if (inventoryResult.rows.length > 0) {
          currentStock = inventoryResult.rows[0].quantity;
        }

        const previousStock = currentStock;
        const soldQuantity = Math.abs(transaction.quantity); // Ensure positive
        const newStock = Math.max(0, currentStock - soldQuantity); // Prevent negative

        // 4. Aktualisiere Lagerbestand
        const updateQuery = `
          INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (warehouse_id, product_id)
          DO UPDATE SET 
            quantity = $3,
            updated_at = NOW()
        `;
        
        await rawDb.query(updateQuery, [machine.warehouse_id, productId, newStock]);

        // 5. Erstelle Inventory Movement für Verkauf
        const movementQuery = `
          INSERT INTO inventory_movements (
            product_id,
            source_warehouse_id,
            machine_id,
            movement_type,
            quantity,
            previous_stock,
            current_stock,
            reference_type,
            reference_id,
            notes,
            performed_at,
            initiated_by,
            correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        
        await rawDb.query(movementQuery, [
          productId,
          machine.warehouse_id, // source (Lager reduziert)
          machine.machine_id,   // Ziel-Maschine
          'SALE', // Neuer Movement-Type für Verkäufe
          -soldQuantity, // Negative quantity für Ausgang
          previousStock,
          newStock,
          'transaction',
          transaction.transaction_id,
          `VERKAUF: ${soldQuantity}x ${transaction.product_name} von ${machine.machine_name} (Preis: ${transaction.price})`,
          new Date(transaction.datetime || transaction.transaction_dt),
          'system',
          `sale_${transaction.transaction_id}`
        ]);

        console.log(`✅ Inventory reduziert: ${transaction.product_name} ${previousStock} → ${newStock} (${soldQuantity} verkauft)`);

      } catch (error: any) {
        console.error(`❌ Fehler bei Inventory-Reduktion für Transaktion ${transaction.transaction_id}:`, error.message);
        // Continue with other transactions even if one fails
      }
    }
  }

  private async logSyncResult(syncType: string, stats: any, errors?: string[]): Promise<void> {
    try {
      const syncLog: InsertSyncLog = {
        syncType,
        startDate: new Date(Date.now() - stats.duration),
        endDate: new Date(),
        itemsFound: stats.found,
        itemsSaved: stats.saved,
        itemsUpdated: stats.updated,
        duplicates: stats.duplicates,
        errors: stats.errors,
        durationSeconds: Math.round(stats.duration / 1000),
        syncStatus: stats.errors > 0 ? 'completed_with_errors' : 'completed',
        errorMessage: errors && errors.length > 0 ? errors.join('; ') : null,
        additionalData: JSON.stringify({ unifiedSync: true })
      };

      await storage.createSyncLog(syncLog);
    } catch (logError) {
      console.error('Fehler beim Erstellen des Sync-Logs:', logError);
    }
  }

  /**
   * Status-Abfragen
   */
  getActiveLocks(): Promise<any[]> {
    return this.syncLock.getActiveLocks();
  }
}

// Singleton-Instanz
let unifiedSyncInstance: UnifiedVendonSync | null = null;

export function getUnifiedVendonSyncInstance(apiKey?: string): UnifiedVendonSync {
  if (!unifiedSyncInstance) {
    unifiedSyncInstance = new UnifiedVendonSync(apiKey);
  }
  return unifiedSyncInstance;
}


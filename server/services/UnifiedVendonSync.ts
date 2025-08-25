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
    
    if (!await this.syncLock.acquire(lockId, 30 * 60)) {
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

      // TODO: Events und Refills API-Endpunkte sind noch nicht in VendonAPI implementiert
      console.log('⚠️ Events und Refills Sync übersprungen - API-Endpunkte nicht verfügbar');

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
    
    if (!await this.syncLock.acquire(lockId, 15 * 60)) {
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
   * Synchronisiert Transaktionen für einen Zeitraum
   */
  async syncTransactions(range: DateRange, options?: SyncOptions): Promise<SyncResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const stats = { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration: 0 };
    const errors: string[] = [];

    try {
      console.log(`🔄 Synchronisiere Transaktionen: ${range.startDate.toISOString()} bis ${range.endDate.toISOString()}`);
      
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        try {
          // API-Daten abrufen
          const apiResult = await this.vendonApi.getTransactions(
            range.startDate,
            range.endDate,
            opts.batchSize
          );
          
          if (!apiResult || apiResult.length === 0) {
            hasMore = false;
            break;
          }

          stats.found += apiResult.length;
          
          // Batch-Verarbeitung mit Duplicate Prevention Service
          const processResult = await this.duplicateService.processTransactionBatch(
            apiResult, 
            opts.forceUpdate
          );
          
          stats.saved += processResult.saved;
          stats.updated += processResult.updated;
          stats.duplicates += processResult.duplicates;
          
          if (processResult.errors.length > 0) {
            stats.errors += processResult.errors.length;
            errors.push(...processResult.errors);
          }

          // Pagination-Kontrolle
          hasMore = apiResult.length === opts.batchSize;
          offset += opts.batchSize;
          
          // Rate Limiting
          if (hasMore && opts.requestDelay > 0) {
            await this.sleep(opts.requestDelay);
          }

        } catch (batchError) {
          const errorMsg = `Batch-Fehler bei Offset ${offset}: ${batchError instanceof Error ? batchError.message : String(batchError)}`;
          errors.push(errorMsg);
          stats.errors++;
          
          console.error(errorMsg);
          
          // Bei Fehlern: exponentielles Backoff
          await this.sleep(opts.requestDelay * Math.min(stats.errors, 4));
        }
      }

      stats.duration = Date.now() - startTime;
      
      const status = stats.errors > 0 ? 'partial' : 'success';
      const message = `Transaktionen-Sync: ${stats.saved} neu, ${stats.duplicates} Duplikate`;

      return { status, message, stats, errors: errors.length > 0 ? errors : undefined };

    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors++;
      
      const errorMsg = `Transaktionen-Sync fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      
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
   * TODO: API-Endpunkt noch nicht implementiert in VendonAPI
   */
  async syncRefills(range: DateRange, options?: SyncOptions): Promise<SyncResult> {
    const duration = Date.now() - Date.now(); // 0ms
    console.log(`⚠️ Refills-Sync übersprungen - API-Endpunkt noch nicht verfügbar`);
    
    return {
      status: 'success',
      message: 'Refills-Sync übersprungen - API-Endpunkt nicht verfügbar',
      stats: { found: 0, saved: 0, updated: 0, duplicates: 0, errors: 0, duration }
    };
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


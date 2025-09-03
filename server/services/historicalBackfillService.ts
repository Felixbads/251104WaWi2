/**
 * HistoricalBackfillService für Vendon-Synchronisation
 * 
 * Implementiert den historischen Synchronisationsmodus wie in der Spezifikation definiert:
 * - Chunking in konfigurierbaren Zeit-Chunks (7-14 Tage)
 * - Idempotente Speicherung via Upsert mit Unique-Key (machine_id, vendon_id)
 * - Watermark-Store für Delta-Sync
 * - Deterministische Pagination mit sort=-transaction_id
 * - Robust error handling und Monitoring
 */

import { VendonAPI } from './vendonAPI';
import { storage } from '../storage';
import { watermarkStore } from './watermarkStore';
import { BackfillOptions } from '@shared/schema';

interface BackfillResult {
  success: boolean;
  totalFetched: number;
  totalUpserted: number;
  totalSkipped: number;
  duration: number;
  errors: string[];
  message: string;
}

interface BackfillProgress {
  machineId: string;
  currentWindow: { start: number; end: number };
  totalWindows: number;
  currentPage: number;
  totalPages: number;
  fetchedCount: number;
  upsertedCount: number;
  skippedCount: number;
  errorCount: number;
}

export class HistoricalBackfillService {
  private vendonApi: VendonAPI;
  private logger: any;

  constructor() {
    this.vendonApi = new VendonAPI();
    this.logger = console; // Could be replaced with structured logger
  }

  /**
   * Führt einen historischen Backfill für eine spezifische Maschine durch
   * Implementiert den Algorithmus aus der Spezifikation
   */
  async runBackfill(options: BackfillOptions): Promise<BackfillResult> {
    const startTime = Date.now();
    const result: BackfillResult = {
      success: false,
      totalFetched: 0,
      totalUpserted: 0,
      totalSkipped: 0,
      duration: 0,
      errors: [],
      message: ''
    };

    this.logger.log(`🚀 Starte historischen Backfill für Maschine ${options.machineId}`);
    this.logger.log(`📅 Zeitraum: ${new Date(options.fromTs * 1000).toISOString()} bis ${new Date(options.toTs * 1000).toISOString()}`);
    this.logger.log(`⚙️ Konfiguration: ${options.chunkDays} Tage Chunks, ${options.pageSize} Page Size, Dry-Run: ${options.dryRun}`);

    try {
      // Initialisiere Watermark falls nicht vorhanden
      await watermarkStore.initializeWatermark(options.machineId, new Date(options.fromTs * 1000));

      // Erstelle Zeit-Fenster für Chunking
      const windows = this.createTimeWindows(options.fromTs, options.toTs, options.chunkDays);
      this.logger.log(`📊 Erstellt ${windows.length} Zeit-Fenster für Verarbeitung`);

      for (let windowIndex = 0; windowIndex < windows.length; windowIndex++) {
        const window = windows[windowIndex];
        this.logger.log(`🔄 Verarbeite Fenster ${windowIndex + 1}/${windows.length}: ${new Date(window.start * 1000).toISOString()} - ${new Date(window.end * 1000).toISOString()}`);

        try {
          const windowResult = await this.processTimeWindow(options, window, windowIndex + 1, windows.length);
          
          result.totalFetched += windowResult.fetchedCount;
          result.totalUpserted += windowResult.upsertedCount;
          result.totalSkipped += windowResult.skippedCount;

          // Safety valve: Check for maxPagesPerWindow
          if (windowResult.totalPages > options.maxPagesPerWindow) {
            this.logger.warn(`⚠️ Safety valve aktiviert: ${windowResult.totalPages} Seiten > Limit ${options.maxPagesPerWindow}`);
            result.errors.push(`Safety valve: Window had ${windowResult.totalPages} pages, limit is ${options.maxPagesPerWindow}`);
          }

        } catch (windowError) {
          const errorMsg = `Fehler beim Verarbeiten von Fenster ${windowIndex + 1}: ${windowError}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;
      result.message = result.success 
        ? `Backfill erfolgreich: ${result.totalUpserted} Transaktionen verarbeitet`
        : `Backfill mit Fehlern: ${result.errors.length} Fehler aufgetreten`;

      this.logger.log(`✅ Backfill abgeschlossen: ${result.message}`);
      
      // B1) Strukturierte Logs mit allen geforderten Feldern
      this.logger.log(`📊 B1) Observability: { window: "completed", fetched: ${result.totalFetched}, upserted: ${result.totalUpserted}, skipped: ${result.totalSkipped}, duration_ms: ${result.duration}, errors: ${result.errors.length} }`);

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(`Kritischer Fehler: ${error}`);
      result.message = `Backfill fehlgeschlagen: ${error}`;
      this.logger.error(`❌ Kritischer Backfill-Fehler:`, error);
    }

    return result;
  }

  /**
   * Verarbeitet ein Zeit-Fenster mit Pagination
   */
  private async processTimeWindow(
    options: BackfillOptions,
    window: { start: number; end: number },
    windowIndex: number,
    totalWindows: number
  ): Promise<BackfillProgress> {
    let offset = 0;
    let page = 0;
    let hasMore = true;
    let fetchedCount = 0;
    let upsertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    while (hasMore && page < options.maxPagesPerWindow) {
      page++;
      
      try {
        // B1) Strukturierte Logs pro Page
        this.logger.log(`📄 B1) Page Processing: { window: "${windowIndex}/${totalWindows}", page: ${page}, offset: ${offset} }`);

        // API-Abruf mit Enhanced getTransactions
        const apiResponse = await this.vendonApi.getTransactionsEnhanced({
          machineId: options.machineId,
          fromTs: window.start,
          toTs: window.end,
          limit: options.pageSize,
          offset: offset,
          searchTime: 'updated', // Für Wiederläufe
          sort: '-transaction_id' // Deterministische Pagination
        });

        const items = apiResponse.items || [];
        fetchedCount += items.length;

        // B1) Strukturierte Logs für Page-Results  
        this.logger.log(`📊 B1) Page Result: { window: "${windowIndex}/${totalWindows}", page: ${page}, offset: ${offset}, fetched: ${items.length} }`);

        if (items.length === 0) {
          this.logger.log(`🔚 Keine weiteren Daten, Ende der Pagination`);
          hasMore = false;
          break;
        }

        // Domain-Mapping der API-Daten
        const domainTransactions = this.mapToDomain(items);

        if (!options.dryRun) {
          // Upsert mit idempotenter Speicherung
          try {
            const upsertedItems = await storage.upsertTransactionsBatch(domainTransactions);
            upsertedCount += upsertedItems.length;
            
            // Watermark nur bei Delta-Runs/Retry sinnvoll updaten
            const success = await watermarkStore.updateWatermarkFromTransactions(options.machineId, items);
            if (!success) {
              this.logger.warn(`⚠️ Watermark-Update fehlgeschlagen für Maschine ${options.machineId}`);
            }

          } catch (upsertError) {
            this.logger.error(`❌ Upsert-Fehler für Seite ${page}:`, upsertError);
            errorCount++;
            skippedCount += items.length;
          }
        } else {
          this.logger.log(`🔍 Dry-Run: ${items.length} Transaktionen würden verarbeitet`);
          skippedCount += items.length;
        }

        // Pagination fortsetzen
        offset += items.length;

        // Prüfe ob weniger Items zurückgekommen sind als erwartet (letzte Seite)
        if (items.length < options.pageSize) {
          this.logger.log(`🔚 Letzte Seite erreicht: ${items.length} < ${options.pageSize}`);
          hasMore = false;
        }

      } catch (pageError) {
        this.logger.error(`❌ Fehler auf Seite ${page}:`, pageError);
        errorCount++;
        hasMore = false; // Bei Fehlern abbrechen
      }
    }

    return {
      machineId: options.machineId,
      currentWindow: window,
      totalWindows: totalWindows,
      currentPage: page,
      totalPages: page,
      fetchedCount,
      upsertedCount,
      skippedCount,
      errorCount
    };
  }

  /**
   * Erstellt Zeit-Fenster für Chunking
   */
  private createTimeWindows(fromTs: number, toTs: number, chunkDays: number): Array<{ start: number; end: number }> {
    const windows: Array<{ start: number; end: number }> = [];
    const chunkSeconds = chunkDays * 24 * 60 * 60; // Tage in Sekunden

    let currentStart = fromTs;
    while (currentStart < toTs) {
      const currentEnd = Math.min(currentStart + chunkSeconds, toTs);
      windows.push({
        start: currentStart,
        end: currentEnd
      });
      currentStart = currentEnd;
    }

    return windows;
  }

  /**
   * Mappt Vendon API-Daten auf Domain-Modell
   * Feldzuweisungen inklusive updated_at
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
      source: 'vendon_historical',
      extraData: JSON.stringify(item),
      status: 'completed'
    }));
  }

  /**
   * Backfill für alle konfigurierten Maschinen
   * Mit optionaler Concurrency-Begrenzung
   */
  async runBackfillForAllMachines(
    baseOptions: Omit<BackfillOptions, 'machineId'>,
    concurrency: number = 2
  ): Promise<Record<string, BackfillResult>> {
    this.logger.log(`🚀 Starte Backfill für alle Maschinen mit Concurrency ${concurrency}`);
    
    try {
      // Hole alle konfigurierten Maschinen
      const machines = await storage.getMachines();
      const machineIds = machines
        .filter(m => m.vendonId)
        .map(m => m.vendonId as string);

      this.logger.log(`🎯 Gefunden: ${machineIds.length} Maschinen für Backfill`);

      const results: Record<string, BackfillResult> = {};
      
      // Verarbeite Maschinen in Batches entsprechend der Concurrency
      for (let i = 0; i < machineIds.length; i += concurrency) {
        const batch = machineIds.slice(i, i + concurrency);
        this.logger.log(`📦 Verarbeite Batch ${Math.floor(i / concurrency) + 1}: ${batch.join(', ')}`);

        // Parallele Ausführung für den aktuellen Batch
        const batchPromises = batch.map(async (machineId) => {
          const options: BackfillOptions = {
            ...baseOptions,
            machineId
          };
          
          const result = await this.runBackfill(options);
          return { machineId, result };
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((promiseResult, index) => {
          const machineId = batch[index];
          if (promiseResult.status === 'fulfilled') {
            results[machineId] = promiseResult.value.result;
          } else {
            results[machineId] = {
              success: false,
              totalFetched: 0,
              totalUpserted: 0,
              totalSkipped: 0,
              duration: 0,
              errors: [`Promise rejected: ${promiseResult.reason}`],
              message: `Backfill für ${machineId} fehlgeschlagen`
            };
          }
        });
      }

      this.logger.log(`✅ Backfill für alle Maschinen abgeschlossen`);
      return results;

    } catch (error) {
      this.logger.error(`❌ Fehler beim Backfill aller Maschinen:`, error);
      throw error;
    }
  }
}

// Singleton-Instanz exportieren
export const historicalBackfillService = new HistoricalBackfillService();
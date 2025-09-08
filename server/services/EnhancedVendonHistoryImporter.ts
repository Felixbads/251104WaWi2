/**
 * Enhanced Vendon Historical Transaction Importer
 * Behebt das 100-Transaktions-Limit durch intelligente dynamische Zeitfenster
 */

import { Pool } from 'pg';
import { VendonAPI } from './vendonAPI';
// Import wird zur Laufzeit geladen

interface ImportOptions {
  batchSize: number;
  maxRetries: number;
  requestDelay: number;
  timeWindowHours: number;
  enableResumable: boolean;
  logProgress: boolean;
}

interface ImportState {
  id: string;
  startDate: Date;
  endDate: Date;
  currentTimestamp: number;
  totalProcessed: number;
  totalSaved: number;
  totalDuplicates: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
  lastUpdated: Date;
  errors: string[];
}

interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    totalFound: number;
    totalSaved: number;
    totalDuplicates: number;
    totalErrors: number;
    duration: number;
    timeWindowsProcessed: number;
  };
  errors?: string[];
}

export class EnhancedVendonHistoryImporter {
  private pool: Pool;
  private vendonApi: VendonAPI;
  private duplicateService: any;
  
  private defaultOptions: ImportOptions = {
    batchSize: 100,
    maxRetries: 3,
    requestDelay: 1500,
    timeWindowHours: 2,
    enableResumable: true,
    logProgress: true
  };

  constructor(pool: Pool) {
    this.pool = pool;
    this.vendonApi = new VendonAPI();
    // Duplicate Service wird zur Laufzeit initialisiert
    this.initializeDuplicateService(pool);
  }

  private async initializeDuplicateService(pool: Pool) {
    try {
      const { DuplicatePreventionService } = await import('./DuplicatePreventionService');
      this.duplicateService = new DuplicatePreventionService(pool);
    } catch (error) {
      console.warn('DuplicatePreventionService nicht verfügbar, verwende Fallback-Implementierung');
      this.duplicateService = this.createFallbackDuplicateService(pool);
    }
  }

  private createFallbackDuplicateService(pool: Pool) {
    return {
      async processTransactionBatch(transactions: any[], forceUpdate: boolean = false) {
        // Vereinfachte Duplikats-Erkennung und Batch-Verarbeitung
        const vendonIds = transactions.map(t => t.transaction_id).filter(Boolean);
        
        // Prüfe existierende IDs
        const existingResult = await pool.query(
          'SELECT vendon_id FROM transactions WHERE vendon_id = ANY($1)',
          [vendonIds]
        );
        const existingIds = new Set(existingResult.rows.map(row => row.vendon_id));
        
        // Filtere neue Transaktionen
        const newTransactions = transactions.filter(t => 
          t.transaction_id && !existingIds.has(t.transaction_id)
        );
        
        let saved = 0;
        const errors: string[] = [];
        
        // Einfache Batch-Insertion
        for (const transaction of newTransactions) {
          try {
            await pool.query(`
              INSERT INTO transactions (
                vendon_id, machine_id, machine_name, datetime, 
                product_name, price, quantity, source, extra_data
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              transaction.transaction_id,
              transaction.machine_id || null,
              transaction.machine_name || '',
              new Date(transaction.datetime || transaction.transaction_dt),
              transaction.product_name || '',
              parseFloat(transaction.price || 0),
              parseInt(transaction.quantity || 1),
              'history-import',
              JSON.stringify(transaction)
            ]);
            saved++;
          } catch (error) {
            errors.push(`Fehler bei Transaktion ${transaction.transaction_id}: ${error}`);
          }
        }
        
        return {
          saved,
          updated: 0,
          duplicates: transactions.length - newTransactions.length,
          errors
        };
      }
    };
  }

  /**
   * Startet einen vollständigen historischen Import mit dynamischen Zeitfenstern
   */
  async importHistoricalTransactions(
    startDate: Date,
    endDate: Date,
    options?: Partial<ImportOptions>
  ): Promise<ImportResult> {
    const opts = { ...this.defaultOptions, ...options };
    const importId = `history_import_${Date.now()}`;
    const startTime = Date.now();
    
    console.log(`🚀 Starte Enhanced Historical Import: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    console.log(`📊 Konfiguration: Batch=${opts.batchSize}, Zeitfenster=${opts.timeWindowHours}h, Resumable=${opts.enableResumable}`);

    try {
      // Import-State initialisieren
      if (opts.enableResumable) {
        await this.initializeImportState(importId, startDate, endDate);
      }

      const result = await this.processTimeWindowsWithDynamicPagination(
        importId, 
        startDate, 
        endDate, 
        opts
      );

      if (opts.enableResumable) {
        await this.markImportCompleted(importId, result);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Historical Import abgeschlossen in ${duration}ms:`);
      console.log(`   📈 ${result.stats.totalFound} gefunden, ${result.stats.totalSaved} gespeichert, ${result.stats.totalDuplicates} Duplikate`);
      
      return {
        ...result,
        stats: { ...result.stats, duration }
      };

    } catch (error) {
      console.error('❌ Historical Import fehlgeschlagen:', error);
      
      if (opts.enableResumable) {
        await this.markImportFailed(importId, error);
      }

      return {
        success: false,
        message: `Import fehlgeschlagen: ${error}`,
        stats: {
          totalFound: 0,
          totalSaved: 0,
          totalDuplicates: 0,
          totalErrors: 1,
          duration: Date.now() - startTime,
          timeWindowsProcessed: 0
        },
        errors: [String(error)]
      };
    }
  }

  /**
   * Fortsetzung eines unterbrochenen Imports
   */
  async resumeImport(importId: string): Promise<ImportResult> {
    console.log(`🔄 Setze Import fort: ${importId}`);
    
    const state = await this.getImportState(importId);
    if (!state) {
      throw new Error(`Import-State nicht gefunden: ${importId}`);
    }

    if (state.status === 'completed') {
      return {
        success: true,
        message: 'Import bereits abgeschlossen',
        stats: {
          totalFound: state.totalProcessed,
          totalSaved: state.totalSaved,
          totalDuplicates: state.totalDuplicates,
          totalErrors: state.errors.length,
          duration: 0,
          timeWindowsProcessed: 0
        }
      };
    }

    // Fortsetzung ab letztem Timestamp
    const resumeDate = new Date(state.currentTimestamp * 1000);
    console.log(`⏭️ Setze fort ab: ${resumeDate.toISOString()}`);

    return this.importHistoricalTransactions(resumeDate, state.endDate, {
      enableResumable: true
    });
  }

  /**
   * CORE ALGORITHM: Dynamische Zeitfenster mit Timestamp-basierter Pagination
   */
  private async processTimeWindowsWithDynamicPagination(
    importId: string,
    startDate: Date,
    endDate: Date,
    options: ImportOptions
  ): Promise<ImportResult> {
    
    let currentStartTime = Math.floor(startDate.getTime() / 1000);
    const finalEndTime = Math.floor(endDate.getTime() / 1000);
    
    // Dynamische Zeitfenster-Konfiguration
    let currentTimeWindow = options.timeWindowHours * 60 * 60; // Stunden zu Sekunden
    const minTimeWindow = 15 * 60; // Minimum 15 Minuten
    const maxTimeWindow = 24 * 60 * 60; // Maximum 24 Stunden
    
    const stats = {
      totalFound: 0,
      totalSaved: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      timeWindowsProcessed: 0
    };
    const allErrors: string[] = [];

    while (currentStartTime < finalEndTime) {
      const currentEndTime = Math.min(currentStartTime + currentTimeWindow, finalEndTime);
      stats.timeWindowsProcessed++;
      
      console.log(`📅 Zeitfenster ${stats.timeWindowsProcessed}: ${new Date(currentStartTime * 1000).toISOString()} bis ${new Date(currentEndTime * 1000).toISOString()}`);
      console.log(`⏱️ Aktuelle Zeitfenster-Größe: ${currentTimeWindow / 3600} Stunden`);

      try {
        const windowResult = await this.processTimeWindowWithTimestampPagination(
          currentStartTime,
          currentEndTime,
          options
        );

        stats.totalFound += windowResult.found;
        stats.totalSaved += windowResult.saved;
        stats.totalDuplicates += windowResult.duplicates;
        stats.totalErrors += windowResult.errors;
        
        if (windowResult.errorMessages.length > 0) {
          allErrors.push(...windowResult.errorMessages);
        }

        // Update Import-State falls aktiviert
        if (options.enableResumable) {
          await this.updateImportState(importId, {
            currentTimestamp: currentEndTime,
            totalProcessed: stats.totalFound,
            totalSaved: stats.totalSaved,
            totalDuplicates: stats.totalDuplicates
          });
        }

        // Dynamische Zeitfenster-Anpassung basierend auf Transaktionsdichte
        if (windowResult.found > 0) {
          const transactionsPerHour = windowResult.found / (currentTimeWindow / 3600);
          
          if (transactionsPerHour > 80) {
            // Hohe Dichte: Kleinere Zeitfenster
            currentTimeWindow = Math.max(minTimeWindow, Math.floor(currentTimeWindow * 0.7));
            console.log(`🔧 Hohe Dichte erkannt - reduziere Zeitfenster auf ${currentTimeWindow / 3600} Stunden`);
          } else if (transactionsPerHour < 20) {
            // Niedrige Dichte: Größere Zeitfenster
            currentTimeWindow = Math.min(maxTimeWindow, Math.floor(currentTimeWindow * 1.3));
            console.log(`📈 Niedrige Dichte erkannt - vergrößere Zeitfenster auf ${currentTimeWindow / 3600} Stunden`);
          }
        }

        console.log(`✅ Zeitfenster abgeschlossen: ${windowResult.saved} neue, ${windowResult.duplicates} Duplikate`);

      } catch (windowError) {
        console.error(`❌ Fehler in Zeitfenster ${currentStartTime}-${currentEndTime}:`, windowError);
        stats.totalErrors++;
        allErrors.push(`Zeitfenster-Fehler: ${windowError}`);
        
        // Bei Fehlern: Zeitfenster verkleinern
        if (currentTimeWindow > minTimeWindow) {
          currentTimeWindow = Math.max(minTimeWindow, Math.floor(currentTimeWindow / 2));
          console.log(`🔧 Nach Fehler: Zeitfenster reduziert auf ${currentTimeWindow / 3600} Stunden`);
        }
      }

      // Zum nächsten Zeitfenster
      currentStartTime = currentEndTime;

      // Progress-Log
      if (options.logProgress) {
        const progressPercent = ((currentStartTime - Math.floor(startDate.getTime() / 1000)) / 
                               (finalEndTime - Math.floor(startDate.getTime() / 1000)) * 100).toFixed(1);
        console.log(`📊 Fortschritt: ${progressPercent}% - ${stats.totalSaved} gespeichert, ${stats.totalDuplicates} Duplikate`);
      }

      // Rate-Limiting zwischen Zeitfenstern
      if (currentStartTime < finalEndTime && options.requestDelay > 0) {
        await this.delay(options.requestDelay);
      }
    }

    const success = stats.totalErrors === 0 || stats.totalSaved > 0;
    const message = success ? 
      `Import erfolgreich: ${stats.totalSaved} neue Transaktionen importiert` :
      `Import mit Fehlern: ${stats.totalErrors} Fehler aufgetreten`;

    return {
      success,
      message,
      stats,
      errors: allErrors.length > 0 ? allErrors : undefined
    };
  }

  /**
   * Verarbeitet ein einzelnes Zeitfenster mit Timestamp-basierter Pagination
   */
  private async processTimeWindowWithTimestampPagination(
    startTimestamp: number,
    endTimestamp: number,
    options: ImportOptions
  ): Promise<{
    found: number;
    saved: number;
    duplicates: number;
    errors: number;
    errorMessages: string[];
  }> {
    
    let found = 0;
    let saved = 0;
    let duplicates = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    let currentTimestamp = startTimestamp;
    let hasMoreData = true;
    let retryCount = 0;

    while (hasMoreData && currentTimestamp < endTimestamp) {
      try {
        // API-Aufruf für aktuelles Timestamp-Segment
        const transactions = await this.vendonApi.getTransactions(
          new Date(currentTimestamp * 1000),
          new Date(endTimestamp * 1000),
          options.batchSize
        );

        if (!transactions || transactions.length === 0) {
          hasMoreData = false;
          break;
        }

        found += transactions.length;

        // Kritische Erkennung: Haben wir das API-Limit erreicht?
        const hitApiLimit = transactions.length === options.batchSize;

        if (hitApiLimit) {
          console.log(`🔥 API-Limit erreicht bei Timestamp ${new Date(currentTimestamp * 1000).toISOString()}`);
          
          // Sortiere Transaktionen nach Timestamp für präzise Fortsetzung
          const sortedTransactions = transactions.sort((a, b) => {
            const timestampA = new Date(a.datetime || a.transaction_dt).getTime();
            const timestampB = new Date(b.datetime || b.transaction_dt).getTime();
            return timestampA - timestampB;
          });

          // Letzter Timestamp + 1 Sekunde als neuer Startpunkt
          const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
          const lastTimestamp = new Date(lastTransaction.datetime || lastTransaction.transaction_dt).getTime();
          currentTimestamp = Math.floor(lastTimestamp / 1000) + 1;

          console.log(`⏭️ Timestamp-Fortsetzung ab: ${new Date(currentTimestamp * 1000).toISOString()}`);
        }

        // Batch-Verarbeitung
        const batchResult = await this.duplicateService.processTransactionBatch(transactions, false);
        
        saved += batchResult.saved;
        duplicates += batchResult.duplicates;
        
        if (batchResult.errors.length > 0) {
          errors += batchResult.errors.length;
          errorMessages.push(...batchResult.errors);
        }

        // Entscheide über Fortsetzung
        if (hitApiLimit) {
          // Bei API-Limit: Fortsetzen mit neuem Timestamp
          hasMoreData = currentTimestamp < endTimestamp;
        } else {
          // Normaler Fall: Alle Daten für dieses Zeitfenster verarbeitet
          hasMoreData = false;
        }

        // Rate-Limiting
        if (hasMoreData && options.requestDelay > 0) {
          await this.delay(options.requestDelay);
        }

        // Reset Retry-Counter bei Erfolg
        retryCount = 0;

        console.log(`📦 Batch: ${batchResult.saved} neue von ${transactions.length} (Duplikate: ${batchResult.duplicates})`);

      } catch (error) {
        console.error(`❌ Fehler bei Timestamp-Verarbeitung ${currentTimestamp}:`, error);
        
        retryCount++;
        errors++;
        errorMessages.push(`Timestamp ${currentTimestamp}: ${error}`);

        if (retryCount >= options.maxRetries) {
          console.error(`❌ Maximale Retry-Anzahl erreicht für Timestamp ${currentTimestamp}`);
          hasMoreData = false;
        } else {
          // Exponentielles Backoff für Retries
          const backoffDelay = options.requestDelay * Math.pow(2, retryCount - 1);
          console.log(`⏳ Retry ${retryCount}/${options.maxRetries} in ${backoffDelay}ms...`);
          await this.delay(backoffDelay);
        }
      }
    }

    return { found, saved, duplicates, errors, errorMessages };
  }

  // Import State Management Methoden

  private async initializeImportState(importId: string, startDate: Date, endDate: Date): Promise<void> {
    const query = `
      INSERT INTO sync_state (
        id, start_date, end_date, current_timestamp, 
        total_processed, total_saved, total_duplicates, 
        status, last_updated, errors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        current_timestamp = EXCLUDED.current_timestamp,
        status = 'running',
        last_updated = NOW()
    `;

    await this.pool.query(query, [
      importId,
      startDate,
      endDate,
      Math.floor(startDate.getTime() / 1000),
      0, 0, 0,
      'running',
      new Date(),
      JSON.stringify([])
    ]);
  }

  private async updateImportState(
    importId: string, 
    update: {
      currentTimestamp?: number;
      totalProcessed?: number;
      totalSaved?: number;
      totalDuplicates?: number;
    }
  ): Promise<void> {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (update.currentTimestamp) {
      updateFields.push(`current_timestamp = $${paramCount++}`);
      values.push(update.currentTimestamp);
    }
    if (update.totalProcessed !== undefined) {
      updateFields.push(`total_processed = $${paramCount++}`);
      values.push(update.totalProcessed);
    }
    if (update.totalSaved !== undefined) {
      updateFields.push(`total_saved = $${paramCount++}`);
      values.push(update.totalSaved);
    }
    if (update.totalDuplicates !== undefined) {
      updateFields.push(`total_duplicates = $${paramCount++}`);
      values.push(update.totalDuplicates);
    }

    updateFields.push(`last_updated = NOW()`);
    values.push(importId);

    const query = `UPDATE sync_state SET ${updateFields.join(', ')} WHERE id = $${paramCount}`;
    await this.pool.query(query, values);
  }

  private async getImportState(importId: string): Promise<ImportState | null> {
    const query = 'SELECT * FROM sync_state WHERE id = $1';
    const result = await this.pool.query(query, [importId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      currentTimestamp: row.current_timestamp,
      totalProcessed: row.total_processed,
      totalSaved: row.total_saved,
      totalDuplicates: row.total_duplicates,
      status: row.status,
      lastUpdated: row.last_updated,
      errors: JSON.parse(row.errors || '[]')
    };
  }

  private async markImportCompleted(importId: string, result: ImportResult): Promise<void> {
    const query = `
      UPDATE sync_state 
      SET status = 'completed', last_updated = NOW(), 
          total_processed = $2, total_saved = $3, total_duplicates = $4
      WHERE id = $1
    `;
    await this.pool.query(query, [
      importId, 
      result.stats.totalFound,
      result.stats.totalSaved, 
      result.stats.totalDuplicates
    ]);
  }

  private async markImportFailed(importId: string, error: any): Promise<void> {
    const query = `
      UPDATE sync_state 
      SET status = 'failed', last_updated = NOW(), 
          errors = $2
      WHERE id = $1
    `;
    await this.pool.query(query, [importId, JSON.stringify([String(error)])]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
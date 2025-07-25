/**
 * Targeted Historical Backfill Service
 * 
 * Implementiert eine systematische Rückwärts-Synchronisation von Vendon-Transaktionen
 * ab dem neuesten gespeicherten Transaktionsdatum bis zum 1. Juli 2023.
 * 
 * Basiert auf dem Prompt: Tag-für-Tag Rückwärts-Synchronisation mit Paging
 * bis alle historischen Transaktionen bis 1. Juli 2023 geladen sind.
 */

import { db } from "../db";
import { transactions, syncLogs } from "@shared/schema";
import { desc, sql } from "drizzle-orm";
import axios, { AxiosInstance } from "axios";
import { storage } from "../storage";
import { InsertTransaction, InsertSyncLog } from "@shared/schema";
import { format, subDays, isAfter, parseISO } from "date-fns";

export interface BackfillConfig {
  targetDate: string; // Format: 'YYYY-MM-DD', default: '2023-07-01'
  batchSize: number; // Transactions per API request, max 100
  requestDelay: number; // Delay between API requests in ms
  maxRetries: number; // Max retries per failed request
  enableDetailedLogging: boolean;
}

export interface BackfillProgress {
  currentDate: string;
  totalDaysToProcess: number;
  completedDays: number;
  totalTransactionsProcessed: number;
  totalTransactionsSaved: number;
  totalDuplicates: number;
  errorCount: number;
  estimatedCompletion: Date | null;
  isComplete: boolean;
}

export interface DayProcessingResult {
  date: string;
  transactionsFound: number;
  transactionsSaved: number;
  duplicates: number;
  pagesProcessed: number;
  success: boolean;
  error?: string;
}

export class TargetedHistoricalBackfill {
  private apiClient: AxiosInstance;
  private config: BackfillConfig;
  private progress: BackfillProgress;
  private syncLogId: number | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BackfillConfig> = {}) {
    // Initialize API client
    this.apiClient = axios.create({
      baseURL: 'https://cloud.vendon.net/rest/v1.8.0',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY || process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Default configuration
    this.config = {
      targetDate: config.targetDate || '2023-07-01',
      batchSize: Math.min(config.batchSize || 100, 100), // API limit is 100
      requestDelay: config.requestDelay || 1000, // 1 second between requests
      maxRetries: config.maxRetries || 3,
      enableDetailedLogging: config.enableDetailedLogging ?? true
    };

    // Initialize progress tracking
    this.progress = {
      currentDate: '',
      totalDaysToProcess: 0,
      completedDays: 0,
      totalTransactionsProcessed: 0,
      totalTransactionsSaved: 0,
      totalDuplicates: 0,
      errorCount: 0,
      estimatedCompletion: null,
      isComplete: false
    };
  }

  /**
   * Startet den gezielten historischen Backfill-Prozess
   */
  async startBackfill(): Promise<BackfillProgress> {
    if (this.isRunning) {
      throw new Error('Backfill-Prozess läuft bereits');
    }

    this.isRunning = true;
    this.log('🚀 Starte Targeted Historical Backfill');
    this.log(`Zieldatum: ${this.config.targetDate}`);
    this.log(`Batch-Größe: ${this.config.batchSize}`);

    try {
      // Ermittle den Startpunkt (neueste Transaction in der DB)
      const startDate = await this.determineStartDate();
      const targetDate = new Date(this.config.targetDate);
      
      if (!isAfter(startDate, targetDate)) {
        this.log('✅ Alle Daten bis zum Zieldatum sind bereits vorhanden');
        this.progress.isComplete = true;
        return this.progress;
      }

      // Berechne Gesamtzahl der zu verarbeitenden Tage
      this.progress.totalDaysToProcess = Math.ceil(
        (startDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      this.log(`📊 ${this.progress.totalDaysToProcess} Tage zu verarbeiten`);

      // Erstelle Sync-Log
      await this.initializeSyncLog(startDate, targetDate);

      // Starte die tägliche Rückwärts-Verarbeitung
      await this.processBackward(startDate, targetDate);

      // Finalisiere das Sync-Log
      await this.finalizeSyncLog();

      this.log('✅ Targeted Historical Backfill erfolgreich abgeschlossen');
      this.progress.isComplete = true;
      return this.progress;

    } catch (error) {
      this.log(`❌ Fehler beim Backfill: ${error}`);
      if (this.syncLogId) {
        await this.updateSyncLogError(error);
      }
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Ermittelt den Startpunkt basierend auf der neuesten Transaction in der DB
   */
  private async determineStartDate(): Promise<Date> {
    this.log('🔍 Ermittle neueste Transaction in der Datenbank...');

    const latestTransaction = await db
      .select({ datetime: transactions.datetime })
      .from(transactions)
      .orderBy(desc(transactions.datetime))
      .limit(1);

    if (latestTransaction.length === 0) {
      this.log('⚠️ Keine Transactionen in der Datenbank gefunden, starte von heute');
      return new Date();
    }

    const latestDate = new Date(latestTransaction[0].datetime);
    this.log(`📅 Neueste Transaction: ${format(latestDate, 'yyyy-MM-dd HH:mm:ss')}`);
    
    // Beginne einen Tag vor der neuesten Transaction
    const startDate = subDays(latestDate, 1);
    this.log(`📅 Backfill startet ab: ${format(startDate, 'yyyy-MM-dd')}`);
    
    return startDate;
  }

  /**
   * Verarbeitet die Tage rückwärts vom Startdatum bis zum Zieldatum
   */
  private async processBackward(startDate: Date, targetDate: Date): Promise<void> {
    let currentDate = new Date(startDate);

    while (isAfter(currentDate, targetDate)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      this.progress.currentDate = dateStr;

      this.log(`📅 Verarbeite Tag: ${dateStr}`);

      try {
        const dayResult = await this.processSingleDay(currentDate);
        
        this.progress.completedDays++;
        this.progress.totalTransactionsProcessed += dayResult.transactionsFound;
        this.progress.totalTransactionsSaved += dayResult.transactionsSaved;
        this.progress.totalDuplicates += dayResult.duplicates;

        if (dayResult.success) {
          this.log(`✅ Tag ${dateStr}: ${dayResult.transactionsSaved} neue, ${dayResult.duplicates} Duplikate, ${dayResult.pagesProcessed} Seiten`);
        } else {
          this.progress.errorCount++;
          this.log(`❌ Tag ${dateStr}: Fehler - ${dayResult.error}`);
        }

        // Fortschritt aktualisieren
        await this.updateSyncLogProgress();

        // Geschätzte Fertigstellung berechnen
        this.calculateEstimatedCompletion();

      } catch (error) {
        this.progress.errorCount++;
        this.log(`❌ Fehler bei Tag ${dateStr}: ${error}`);
      }

      // Gehe einen Tag zurück
      currentDate = subDays(currentDate, 1);

      // Pause zwischen Tagen
      if (this.config.requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.requestDelay));
      }
    }
  }

  /**
   * Verarbeitet einen einzelnen Tag mit Paging
   */
  private async processSingleDay(date: Date): Promise<DayProcessingResult> {
    const dateStr = format(date, 'yyyy-MM-dd');
    const startOfDay = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
    const endOfDay = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);

    let totalFound = 0;
    let totalSaved = 0;
    let totalDuplicates = 0;
    let offset = 0;
    let pagesProcessed = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        // API-Aufruf mit Pagination
        const response = await this.fetchVendonTransactions(
          startOfDay, 
          endOfDay, 
          this.config.batchSize, 
          offset
        );

        const transactionsData = response?.data || response?.result || [];
        
        if (!Array.isArray(transactionsData) || transactionsData.length === 0) {
          hasMore = false;
          break;
        }

        totalFound += transactionsData.length;
        pagesProcessed++;

        // Verarbeite die Transaktionen
        const saveResult = await this.saveTransactions(transactionsData, dateStr);
        totalSaved += saveResult.saved;
        totalDuplicates += saveResult.duplicates;

        // Prüfe ob weitere Seiten vorhanden sind
        hasMore = transactionsData.length === this.config.batchSize;
        offset += this.config.batchSize;

        // Pause zwischen API-Aufrufen
        if (hasMore && this.config.requestDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.requestDelay));
        }
      }

      return {
        date: dateStr,
        transactionsFound: totalFound,
        transactionsSaved: totalSaved,
        duplicates: totalDuplicates,
        pagesProcessed,
        success: true
      };

    } catch (error) {
      return {
        date: dateStr,
        transactionsFound: totalFound,
        transactionsSaved: totalSaved,
        duplicates: totalDuplicates,
        pagesProcessed,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Führt API-Aufruf zu Vendon durch mit Retry-Logik
   */
  private async fetchVendonTransactions(
    fromTimestamp: number,
    toTimestamp: number,
    limit: number,
    offset: number
  ): Promise<any> {
    const params = {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      limit,
      offset
    };

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.log(`📡 API-Aufruf: offset=${offset}, limit=${limit} (Versuch ${attempt}/${this.config.maxRetries})`);
        
        const response = await this.apiClient.get('/stats/vends', { params });
        
        return response.data;
      } catch (error) {
        this.log(`❌ API-Fehler (Versuch ${attempt}): ${error}`);
        
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Speichert Transaktionen in der Datenbank
   */
  private async saveTransactions(
    transactionsData: any[], 
    dateStr: string
  ): Promise<{ saved: number; duplicates: number }> {
    let saved = 0;
    let duplicates = 0;

    for (const txData of transactionsData) {
      try {
        // Prüfe auf Duplikate
        const existingTransaction = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(sql`vendon_id = ${txData.id}`)
          .limit(1);

        if (existingTransaction.length > 0) {
          duplicates++;
          continue;
        }

        // Erstelle Transaction-Objekt
        const transaction: InsertTransaction = {
          vendonId: txData.id,
          machineId: txData.machine_id,
          productId: txData.product_id,
          productName: txData.product_name || '',
          quantity: txData.quantity || 1,
          amount: parseFloat(txData.amount) || 0,
          price: parseFloat(txData.price) || 0,
          paymentMethod: txData.payment_method || 'UNKNOWN',
          datetime: new Date(txData.datetime),
          machineName: txData.machine_name || '',
          createdAt: new Date()
        };

        await storage.createTransaction(transaction);
        saved++;

      } catch (error) {
        this.log(`❌ Fehler beim Speichern der Transaction ${txData.id}: ${error}`);
      }
    }

    return { saved, duplicates };
  }

  /**
   * Initialisiert das Sync-Log
   */
  private async initializeSyncLog(startDate: Date, targetDate: Date): Promise<void> {
    const syncLog: InsertSyncLog = {
      syncType: 'targeted-historical-backfill',
      startDate: new Date(),
      syncStatus: 'running',
      additionalData: JSON.stringify({
        configuredStartDate: format(startDate, 'yyyy-MM-dd'),
        targetDate: format(targetDate, 'yyyy-MM-dd'),
        totalDaysToProcess: this.progress.totalDaysToProcess,
        config: this.config
      })
    };

    const logEntry = await storage.createSyncLog(syncLog);
    this.syncLogId = logEntry.id;
    this.log(`📋 Sync-Log erstellt mit ID: ${this.syncLogId}`);
  }

  /**
   * Aktualisiert den Sync-Log-Fortschritt
   */
  private async updateSyncLogProgress(): Promise<void> {
    if (!this.syncLogId) return;

    await storage.updateSyncLog(this.syncLogId, {
      itemsFound: this.progress.totalTransactionsProcessed,
      itemsSaved: this.progress.totalTransactionsSaved,
      duplicates: this.progress.totalDuplicates,
      errors: this.progress.errorCount,
      additionalData: JSON.stringify({
        ...JSON.parse((await storage.getSyncLogById(this.syncLogId))?.additionalData || '{}'),
        currentProgress: this.progress
      })
    });
  }

  /**
   * Finalisiert das Sync-Log bei erfolgreichem Abschluss
   */
  private async finalizeSyncLog(): Promise<void> {
    if (!this.syncLogId) return;

    await storage.updateSyncLog(this.syncLogId, {
      endDate: new Date(),
      syncStatus: 'completed',
      itemsFound: this.progress.totalTransactionsProcessed,
      itemsSaved: this.progress.totalTransactionsSaved,
      duplicates: this.progress.totalDuplicates,
      errors: this.progress.errorCount
    });
  }

  /**
   * Aktualisiert das Sync-Log bei Fehlern
   */
  private async updateSyncLogError(error: any): Promise<void> {
    if (!this.syncLogId) return;

    await storage.updateSyncLog(this.syncLogId, {
      endDate: new Date(),
      syncStatus: 'error',
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  /**
   * Berechnet die geschätzte Fertigstellung
   */
  private calculateEstimatedCompletion(): void {
    if (this.progress.completedDays === 0) return;

    const avgTimePerDay = (Date.now() - this.progress.currentDate.length) / this.progress.completedDays;
    const remainingDays = this.progress.totalDaysToProcess - this.progress.completedDays;
    const estimatedMs = remainingDays * avgTimePerDay;
    
    this.progress.estimatedCompletion = new Date(Date.now() + estimatedMs);
  }

  /**
   * Logging-Funktion
   */
  private log(message: string): void {
    if (this.config.enableDetailedLogging) {
      console.log(`[TargetedBackfill] ${message}`);
    }
  }

  /**
   * Gibt den aktuellen Fortschritt zurück
   */
  getProgress(): BackfillProgress {
    return { ...this.progress };
  }

  /**
   * Stoppt den laufenden Backfill-Prozess
   */
  stop(): void {
    this.isRunning = false;
    this.log('🛑 Backfill-Prozess gestoppt');
  }
}

// Export einer Standard-Instanz für den Service
export const targetedHistoricalBackfill = new TargetedHistoricalBackfill();
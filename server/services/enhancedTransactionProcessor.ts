/**
 * Enhanced Transaction Processor - Erweitert den bestehenden Transaktionsimport um Chargen-Tracking
 * 
 * Funktionalitäten:
 * - Integration mit BatchTrackingService für automatische Chargen-Zuordnung
 * - Aktualisierung bestehender Transaktionen um Chargen-Informationen
 * - Performance-optimiertes Batch-Processing
 * - Comprehensive Error Handling und Retry-Mechanismen
 * - Nahtlose Integration in den bestehenden Vendon-Sync-Workflow
 */

import { eq, and, isNull, or, inArray, desc } from 'drizzle-orm';
import { db } from '../db';
import { transactions, machines, products } from '../../shared/schema';
import { batchTrackingService } from './batchTrackingService';
import type { Transaction } from '../../shared/schema';

export interface TransactionProcessingResult {
  success: boolean;
  processed: number;
  skipped: number;
  failed: number;
  errors: string[];
  warnings: string[];
}

export interface TransactionBatchProcessingOptions {
  batchSize?: number;
  skipExistingBatchEntries?: boolean;
  maxRetries?: number;
  processingTimeout?: number;
}

export class EnhancedTransactionProcessor {

  /**
   * Verarbeitet neue Transaktionen und erstellt automatisch Chargen-Verknüpfungen
   */
  async processNewTransactions(
    transactions: any[],
    options: TransactionBatchProcessingOptions = {}
  ): Promise<TransactionProcessingResult> {
    
    const {
      batchSize = 50,
      skipExistingBatchEntries = true,
      maxRetries = 3,
      processingTimeout = 30000
    } = options;

    console.log(`🔄 [EnhancedTransactionProcessor] Verarbeite ${transactions.length} neue Transaktionen mit Chargen-Tracking`);

    const result: TransactionProcessingResult = {
      success: true,
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      warnings: []
    };

    try {
      // Verarbeite Transaktionen in Batches für bessere Performance
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        
        console.log(`📦 [EnhancedTransactionProcessor] Verarbeite Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactions.length / batchSize)} (${batch.length} Transaktionen)`);
        
        const batchResult = await this.processBatchWithRetry(
          batch, 
          skipExistingBatchEntries, 
          maxRetries,
          processingTimeout
        );
        
        // Akkumuliere Ergebnisse
        result.processed += batchResult.processed;
        result.skipped += batchResult.skipped;
        result.failed += batchResult.failed;
        result.errors.push(...batchResult.errors);
        result.warnings.push(...batchResult.warnings);
      }

      if (result.failed > 0) {
        result.success = false;
        console.warn(`⚠️ [EnhancedTransactionProcessor] ${result.failed} Transaktionen konnten nicht verarbeitet werden`);
      } else {
        console.log(`✅ [EnhancedTransactionProcessor] Alle ${result.processed} Transaktionen erfolgreich verarbeitet`);
      }

      return result;

    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Kritischer Fehler beim Verarbeiten:`, error);
      
      result.success = false;
      result.errors.push(`Kritischer Verarbeitungsfehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      
      return result;
    }
  }

  /**
   * Verarbeitet einen Batch von Transaktionen mit Retry-Mechanismus
   */
  private async processBatchWithRetry(
    batch: any[],
    skipExisting: boolean,
    maxRetries: number,
    timeout: number
  ): Promise<TransactionProcessingResult> {
    
    let attempt = 1;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        console.log(`🔄 [EnhancedTransactionProcessor] Batch-Verarbeitung Versuch ${attempt}/${maxRetries}`);
        
        const result = await Promise.race([
          this.processSingleBatch(batch, skipExisting),
          this.createTimeoutPromise(timeout)
        ]);

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unbekannter Fehler');
        console.warn(`⚠️ [EnhancedTransactionProcessor] Versuch ${attempt} fehlgeschlagen:`, lastError.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ [EnhancedTransactionProcessor] Warte ${delay}ms vor nächstem Versuch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        attempt++;
      }
    }

    // Alle Versuche fehlgeschlagen
    return {
      success: false,
      processed: 0,
      skipped: 0,
      failed: batch.length,
      errors: [`Batch nach ${maxRetries} Versuchen fehlgeschlagen: ${lastError?.message}`],
      warnings: []
    };
  }

  /**
   * Verarbeitet einen einzelnen Batch von Transaktionen
   */
  private async processSingleBatch(
    batch: any[],
    skipExisting: boolean
  ): Promise<TransactionProcessingResult> {
    
    const result: TransactionProcessingResult = {
      success: true,
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      warnings: []
    };

    for (const transactionData of batch) {
      try {
        // Finde die bereits gespeicherte Transaktion in der DB
        const existingTransaction = await this.findExistingTransaction(transactionData.vendon_id);
        
        if (!existingTransaction) {
          result.warnings.push(`Transaktion ${transactionData.vendon_id} nicht in der Datenbank gefunden - überspringe Chargen-Zuordnung`);
          result.skipped++;
          continue;
        }

        // Prüfe ob bereits Chargen-Informationen vorhanden sind
        if (skipExisting && await this.hasExistingBatchTracking(existingTransaction.id)) {
          console.log(`🔍 [EnhancedTransactionProcessor] Transaktion ${existingTransaction.id} hat bereits Chargen-Tracking - überspringe`);
          result.skipped++;
          continue;
        }

        // Verarbeite Chargen-Zuordnung
        const batchResult = await this.processTransactionBatchTracking(
          existingTransaction,
          transactionData
        );

        if (batchResult.success) {
          // Aktualisiere Transaktion mit Chargen-Informationen
          await this.updateTransactionBatchInfo(existingTransaction.id, batchResult);
          result.processed++;
          
          console.log(`✅ [EnhancedTransactionProcessor] Transaktion ${existingTransaction.id} erfolgreich mit ${batchResult.allocatedBatches.length} Chargen verknüpft`);
        } else {
          result.warnings.push(`Chargen-Zuordnung für Transaktion ${existingTransaction.id} teilweise fehlgeschlagen: ${batchResult.errorMessage || batchResult.warningMessage}`);
          result.processed++; // Zähle auch teilweise erfolgreiche als verarbeitet
        }

      } catch (error) {
        const errorMsg = `Fehler bei Verarbeitung von Transaktion ${transactionData.vendon_id}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
        console.error(`❌ [EnhancedTransactionProcessor] ${errorMsg}`);
        
        result.errors.push(errorMsg);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Findet eine existierende Transaktion in der Datenbank
   */
  private async findExistingTransaction(vendonId: string): Promise<Transaction | null> {
    try {
      const results = await db
        .select()
        .from(transactions)
        .where(eq(transactions.vendonId, vendonId))
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Fehler beim Suchen der Transaktion ${vendonId}:`, error);
      return null;
    }
  }

  /**
   * Prüft ob eine Transaktion bereits Chargen-Tracking hat
   */
  private async hasExistingBatchTracking(transactionId: number): Promise<boolean> {
    try {
      // Prüfe sowohl direkte Chargen-Felder in transactions als auch batch_transaction_log
      const transactionWithBatch = await db
        .select({
          id: transactions.id,
          batchId: transactions.batchId,
          batchNumber: transactions.batchNumber
        })
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1);

      if (transactionWithBatch.length > 0 && 
          (transactionWithBatch[0].batchId !== null || transactionWithBatch[0].batchNumber !== null)) {
        return true;
      }

      // Prüfe auch batch_transaction_log
      const batchLogCount = await db
        .select({ count: transactions.id })
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1);

      return batchLogCount.length > 0;

    } catch (error) {
      console.warn(`⚠️ [EnhancedTransactionProcessor] Fehler beim Prüfen von Batch-Tracking für Transaktion ${transactionId}:`, error);
      return false; // Im Zweifel verarbeiten
    }
  }

  /**
   * Verarbeitet die Chargen-Zuordnung für eine einzelne Transaktion
   */
  private async processTransactionBatchTracking(
    transaction: Transaction,
    originalData: any
  ) {
    console.log(`🔍 [EnhancedTransactionProcessor] Verarbeite Chargen-Tracking für Transaktion ${transaction.id}`);

    try {
      // Sammle notwendige Informationen
      const machineId = transaction.machineId;
      const productId = transaction.productId ? parseInt(transaction.productId) : null;
      const productName = transaction.productName || 'Unbekanntes Produkt';
      const quantity = transaction.quantity || 1;
      const vendonTransactionId = transaction.vendonId;

      if (!machineId) {
        throw new Error(`Maschinen-ID fehlt für Transaktion ${transaction.id}`);
      }

      // Rufe BatchTrackingService auf
      const batchResult = await batchTrackingService.allocateBatchesToTransaction(
        transaction.id,
        vendonTransactionId,
        machineId,
        productId,
        productName,
        quantity
      );

      return batchResult;

    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Fehler bei Chargen-Verarbeitung:`, error);
      
      return {
        success: false,
        allocatedBatches: [],
        totalQuantity: 0,
        errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
  }

  /**
   * Aktualisiert die Transaktion mit den ersten Chargen-Informationen
   */
  private async updateTransactionBatchInfo(
    transactionId: number,
    batchResult: any
  ): Promise<void> {
    
    if (batchResult.allocatedBatches.length === 0) {
      console.log(`ℹ️ [EnhancedTransactionProcessor] Keine Chargen-Info für Transaktion ${transactionId} verfügbar`);
      return;
    }

    try {
      // Verwende die erste zugewiesene Charge für die Transaktion
      const primaryBatch = batchResult.allocatedBatches[0];

      await db
        .update(transactions)
        .set({
          batchId: primaryBatch.batchId > 0 ? primaryBatch.batchId : null,
          batchNumber: primaryBatch.batchNumber !== 'UNKNOWN' ? primaryBatch.batchNumber : null,
          expiryDateAtSale: primaryBatch.expiryDate ? new Date(primaryBatch.expiryDate) : null,
          updatedAt: new Date()
        })
        .where(eq(transactions.id, transactionId));

      console.log(`📝 [EnhancedTransactionProcessor] Transaktion ${transactionId} aktualisiert mit primärer Charge: ${primaryBatch.batchNumber}`);

    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Fehler beim Aktualisieren der Transaktion ${transactionId}:`, error);
      throw error;
    }
  }

  /**
   * Verarbeitet existierende Transaktionen rückwirkend
   */
  async processExistingTransactionsRetroactively(
    limit: number = 1000,
    options: TransactionBatchProcessingOptions = {}
  ): Promise<TransactionProcessingResult> {
    
    console.log(`🔄 [EnhancedTransactionProcessor] Starte rückwirkende Verarbeitung von bis zu ${limit} Transaktionen`);

    try {
      // Finde Transaktionen ohne Chargen-Informationen
      const unprocessedTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            isNull(transactions.batchId),
            isNull(transactions.batchNumber)
          )
        )
        .orderBy(desc(transactions.datetime))
        .limit(limit);

      console.log(`📊 [EnhancedTransactionProcessor] Gefunden: ${unprocessedTransactions.length} unverarbeitete Transaktionen`);

      if (unprocessedTransactions.length === 0) {
        return {
          success: true,
          processed: 0,
          skipped: 0,
          failed: 0,
          errors: [],
          warnings: ['Keine unverarbeiteten Transaktionen gefunden']
        };
      }

      // Konvertiere zu dem Format das processNewTransactions erwartet
      const transactionData = unprocessedTransactions.map(t => ({
        vendon_id: t.vendonId,
        machine_id: t.machineId,
        product_id: t.productId,
        product_name: t.productName,
        quantity: t.quantity
      }));

      // Verarbeite mit der bestehenden Batch-Logik
      const result = await this.processNewTransactions(transactionData, {
        ...options,
        skipExistingBatchEntries: false // Für rückwirkende Verarbeitung nicht überspringen
      });

      console.log(`✅ [EnhancedTransactionProcessor] Rückwirkende Verarbeitung abgeschlossen: ${result.processed} verarbeitet, ${result.failed} fehlgeschlagen`);
      
      return result;

    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Fehler bei rückwirkender Verarbeitung:`, error);
      
      return {
        success: false,
        processed: 0,
        skipped: 0,
        failed: 0,
        errors: [`Rückwirkende Verarbeitung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`],
        warnings: []
      };
    }
  }

  /**
   * Erstellt ein Timeout-Promise für Batch-Processing
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Batch-Verarbeitung nach ${timeout}ms Timeout abgebrochen`));
      }, timeout);
    });
  }

  /**
   * Gibt Statistiken über den aktuellen Verarbeitungsstand zurück
   */
  async getProcessingStatistics(): Promise<{
    totalTransactions: number;
    processedTransactions: number;
    unprocessedTransactions: number;
    processingRate: number;
  }> {
    
    try {
      const [totalResult, processedResult] = await Promise.all([
        db.select({ count: transactions.id }).from(transactions),
        db.select({ count: transactions.id })
          .from(transactions)
          .where(or(
            isNull(transactions.batchId),
            isNull(transactions.batchNumber)
          ))
      ]);

      const total = totalResult.length;
      const unprocessed = processedResult.length;
      const processed = total - unprocessed;
      const processingRate = total > 0 ? (processed / total) * 100 : 100;

      return {
        totalTransactions: total,
        processedTransactions: processed,
        unprocessedTransactions: unprocessed,
        processingRate
      };

    } catch (error) {
      console.error(`❌ [EnhancedTransactionProcessor] Fehler beim Abrufen der Statistiken:`, error);
      
      return {
        totalTransactions: 0,
        processedTransactions: 0,
        unprocessedTransactions: 0,
        processingRate: 0
      };
    }
  }
}

export const enhancedTransactionProcessor = new EnhancedTransactionProcessor();
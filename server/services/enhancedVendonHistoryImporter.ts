/**
 * Enhanced Vendon Historical Transaction Importer
 * 
 * This service implements a robust historical transaction import system that:
 * - Handles the 100-transaction API limit intelligently
 * - Uses dynamic time windows to prevent data gaps
 * - Implements timestamp-based continuation for exact pagination
 * - Maintains compatibility with existing transaction storage
 * - Provides comprehensive progress tracking and error handling
 * 
 * Key Algorithm:
 * 1. Start with configurable time intervals (default: 2 hours)
 * 2. If response contains exactly 100 transactions, switch to timestamp-based pagination
 * 3. Sort transactions by timestamp and continue from last transaction + 1 second
 * 4. Only advance time window when batch contains < 100 transactions
 * 5. Resume capability through sync_state table
 */

import { db, rawDb } from '../db';
import { vendonAPI } from './vendonAPI';
import { syncState, syncLogs } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { format, addHours, startOfDay, endOfDay } from 'date-fns';

export interface HistoricalImportOptions {
  startDate: string;
  endDate?: string;
  timeIntervalHours?: number;
  batchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  requestDelayMs?: number;
}

export interface ImportStatistics {
  totalProcessed: number;
  totalSaved: number;
  totalDuplicates: number;
  totalErrors: number;
  daysProcessed: number;
  timeRangesProcessed: number;
  lastProcessedTimestamp?: number;
}

export class EnhancedVendonHistoryImporter {
  private readonly jobName = 'enhanced_vendon_history_import';
  private readonly vendonApi = vendonAPI;
  private syncLogId: number | null = null;
  
  private stats: ImportStatistics = {
    totalProcessed: 0,
    totalSaved: 0,
    totalDuplicates: 0,
    totalErrors: 0,
    daysProcessed: 0,
    timeRangesProcessed: 0
  };

  /**
   * Starts the enhanced historical import process
   */
  async startImport(options: HistoricalImportOptions): Promise<ImportStatistics> {
    console.log('🚀 Starting Enhanced Vendon Historical Transaction Import');
    console.log('Configuration:', options);

    try {
      // Create sync log entry
      await this.createSyncLog(options);

      // Get or initialize sync state
      const syncStateData = await this.getSyncState();
      
      // Perform the import
      await this.performImport(options, syncStateData);

      // Update sync log as completed
      await this.updateSyncLog('completed');
      
      console.log('✅ Enhanced Historical Import Completed');
      this.logFinalStatistics();
      
      return this.stats;
    } catch (error) {
      console.error('❌ Enhanced Historical Import Failed:', error);
      await this.updateSyncLog('failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Core import logic with dynamic time window handling
   */
  private async performImport(options: HistoricalImportOptions, syncStateData: any): Promise<void> {
    const startDate = new Date(options.startDate);
    const endDate = options.endDate ? new Date(options.endDate) : new Date();
    const timeIntervalHours = options.timeIntervalHours || 2;
    const batchSize = options.batchSize || 100;

    console.log(`Import range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`Time interval: ${timeIntervalHours} hours, Batch size: ${batchSize}`);

    // Resume from last processed point or start from beginning
    let currentStart = syncStateData.lastTimestamp 
      ? new Date(syncStateData.lastTimestamp * 1000)
      : startDate;

    while (currentStart < endDate) {
      // Calculate current time window
      let currentEnd = addHours(currentStart, timeIntervalHours);
      if (currentEnd > endDate) {
        currentEnd = endDate;
      }

      console.log(`\n📅 Processing time window: ${currentStart.toISOString()} to ${currentEnd.toISOString()}`);

      try {
        // Process this time window with intelligent pagination
        const windowResult = await this.processTimeWindow(
          currentStart, 
          currentEnd, 
          batchSize, 
          options
        );

        this.stats.timeRangesProcessed++;

        // If we got exactly the batch size, there might be more data in this window
        // The processTimeWindow function handles this internally
        if (windowResult.continueFromTimestamp) {
          // Continue from the last processed timestamp + 1 second
          currentStart = new Date((windowResult.continueFromTimestamp + 1) * 1000);
        } else {
          // Move to next time window
          currentStart = currentEnd;
        }

        // Update sync state with progress
        await this.updateSyncState(Math.floor(currentStart.getTime() / 1000));

        // Add delay between requests to avoid overwhelming the API
        if (options.requestDelayMs && options.requestDelayMs > 0) {
          await this.delay(options.requestDelayMs);
        }

      } catch (error) {
        console.error(`Error processing time window ${currentStart.toISOString()} to ${currentEnd.toISOString()}:`, error);
        this.stats.totalErrors++;
        
        // On error, skip to next time window to avoid infinite loops
        currentStart = currentEnd;
      }
    }
  }

  /**
   * Processes a single time window with intelligent pagination
   */
  private async processTimeWindow(
    startTime: Date, 
    endTime: Date, 
    batchSize: number, 
    options: HistoricalImportOptions
  ): Promise<{ continueFromTimestamp?: number }> {
    
    const fromTimestamp = Math.floor(startTime.getTime() / 1000);
    const toTimestamp = Math.floor(endTime.getTime() / 1000);
    
    let offset = 0;
    let hasMoreData = true;
    let pageCount = 0;
    let lastTransactionTimestamp: number | undefined;

    while (hasMoreData) {
      pageCount++;
      console.log(`  📄 Page ${pageCount} (offset: ${offset})`);

      try {
        // Make API request
        const response = await this.vendonApi.getVendTransactions({
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: batchSize,
          offset: offset
        });

        if (!response?.result || !Array.isArray(response.result)) {
          console.error('Invalid API response:', response);
          break;
        }

        const transactions = response.result;
        const transactionCount = transactions.length;
        
        console.log(`    Found ${transactionCount} transactions`);
        
        if (transactionCount === 0) {
          hasMoreData = false;
          break;
        }

        // Process and save transactions
        for (const transaction of transactions) {
          try {
            const saved = await this.saveTransaction(transaction);
            lastTransactionTimestamp = transaction.datetime;
          } catch (error) {
            console.error(`Error saving transaction ${transaction.transaction_id}:`, error);
            this.stats.totalErrors++;
          }
        }

        this.stats.totalProcessed += transactionCount;

        // Intelligent pagination decision
        if (transactionCount < batchSize) {
          // Got less than batch size, no more data in this window
          hasMoreData = false;
        } else if (transactionCount === batchSize) {
          // Got exactly batch size - might be more data
          // Sort transactions by timestamp to get the latest one
          const sortedTransactions = transactions.sort((a: any, b: any) => a.datetime - b.datetime);
          const latestTransaction = sortedTransactions[sortedTransactions.length - 1];
          
          if (latestTransaction && latestTransaction.datetime) {
            // Check if we're at the end of the time window
            if (latestTransaction.datetime >= toTimestamp) {
              // We've reached the end of the time window
              return { continueFromTimestamp: latestTransaction.datetime };
            } else {
              // Continue with next offset in the same time window
              offset += transactionCount;
            }
          } else {
            // No timestamp info, continue with offset
            offset += transactionCount;
          }
        }

      } catch (error) {
        console.error(`API request failed for page ${pageCount}:`, error);
        
        // Implement retry logic
        const maxRetries = options.maxRetries || 3;
        const retryDelay = options.retryDelayMs || 5000;
        
        let retryCount = 0;
        while (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying in ${retryDelay}ms (attempt ${retryCount}/${maxRetries})`);
          await this.delay(retryDelay);
          
          try {
            // Retry the same request
            continue;
          } catch (retryError) {
            if (retryCount === maxRetries) {
              console.error(`Max retries reached, skipping this batch`);
              hasMoreData = false;
              break;
            }
          }
        }
      }
    }

    return {};
  }

  /**
   * Saves a single transaction to the database with duplicate handling
   */
  private async saveTransaction(transaction: any): Promise<boolean> {
    try {
      const vendonId = String(transaction.transaction_id);

      const result = await rawDb.query(
        `INSERT INTO transactions (
          vendon_id, machine_id, machine_name, 
          datetime, transaction_dt, registered_dt,
          product_id, product_name, selection,
          stock_id, article, 
          quantity, price, price_vat, price_wo_vat, vat, currency,
          discount_code, discount_amount,
          payment_method, payment_type, source,
          transaction_data, note, metadata, extra_data
        ) 
        VALUES (
          $1, $2, $3, 
          to_timestamp($4), to_timestamp($5), to_timestamp($6),
          $7, $8, $9,
          $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26
        )
        ON CONFLICT (vendon_id) DO NOTHING
        RETURNING id`,
        [
          vendonId,
          transaction.machine_id,
          transaction.machine_name,
          transaction.datetime,
          transaction.transaction_dt || transaction.datetime,
          transaction.registered_dt || transaction.datetime,
          transaction.stock_id?.toString() || null,
          transaction.name || transaction.product_name,
          transaction.selection,
          transaction.stock_id,
          transaction.article,
          transaction.quantity || 1,
          transaction.price || 0,
          transaction.price_vat || 0,
          transaction.price_wo_vat || 0,
          transaction.vat || 0,
          transaction.currency || 'EUR',
          transaction.discount_code,
          transaction.discount_amount,
          transaction.payment_method,
          transaction.payment_type,
          'enhanced-history-import',
          transaction.transaction_data ? JSON.stringify(transaction.transaction_data) : null,
          transaction.note,
          transaction.metadata ? JSON.stringify(transaction.metadata) : null,
          JSON.stringify(transaction) // Store complete raw data for debugging
        ]
      );

      if (result.rows && result.rows.length > 0) {
        this.stats.totalSaved++;
        return true;
      } else {
        this.stats.totalDuplicates++;
        return false;
      }

    } catch (error) {
      console.error(`Error saving transaction:`, error);
      this.stats.totalErrors++;
      throw error;
    }
  }

  /**
   * Creates or retrieves sync state for resumable imports
   */
  private async getSyncState(): Promise<any> {
    try {
      const result = await db
        .select()
        .from(syncState)
        .where(eq(syncState.jobName, this.jobName))
        .limit(1);

      if (result.length > 0) {
        const state = result[0];
        console.log(`Resuming from timestamp: ${state.lastOffset}`);
        return {
          lastTimestamp: state.lastOffset,
          lastDate: state.lastDate
        };
      } else {
        console.log('No previous sync state found, starting fresh');
        return {
          lastTimestamp: null,
          lastDate: null
        };
      }
    } catch (error) {
      console.error('Error getting sync state:', error);
      return { lastTimestamp: null, lastDate: null };
    }
  }

  /**
   * Updates sync state with current progress
   */
  private async updateSyncState(timestamp: number): Promise<void> {
    try {
      await rawDb.query(
        `INSERT INTO sync_state (job_name, last_date, last_offset, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (job_name) 
         DO UPDATE SET 
           last_date = EXCLUDED.last_date,
           last_offset = EXCLUDED.last_offset,
           updated_at = EXCLUDED.updated_at`,
        [
          this.jobName,
          new Date(timestamp * 1000).toISOString().split('T')[0],
          timestamp
        ]
      );
    } catch (error) {
      console.error('Error updating sync state:', error);
    }
  }

  /**
   * Creates sync log entry
   */
  private async createSyncLog(options: HistoricalImportOptions): Promise<void> {
    try {
      const result = await rawDb.query(
        `INSERT INTO sync_logs (
          sync_type, start_date, end_date, sync_status, 
          items_found, items_saved, duplicates, errors,
          additional_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          'enhanced_history_import',
          new Date(options.startDate),
          options.endDate ? new Date(options.endDate) : new Date(),
          'running',
          0, 0, 0, 0,
          JSON.stringify(options)
        ]
      );

      if (result.rows && result.rows.length > 0) {
        this.syncLogId = result.rows[0].id;
        console.log(`Created sync log with ID: ${this.syncLogId}`);
      }
    } catch (error) {
      console.error('Error creating sync log:', error);
    }
  }

  /**
   * Updates sync log with final status
   */
  private async updateSyncLog(status: string, errorMessage?: string): Promise<void> {
    if (!this.syncLogId) return;

    try {
      await rawDb.query(
        `UPDATE sync_logs SET 
          sync_status = $1,
          items_found = $2,
          items_saved = $3,
          duplicates = $4,
          errors = $5,
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_date)),
          error_message = $6,
          updated_at = NOW()
         WHERE id = $7`,
        [
          status,
          this.stats.totalProcessed,
          this.stats.totalSaved,
          this.stats.totalDuplicates,
          this.stats.totalErrors,
          errorMessage || null,
          this.syncLogId
        ]
      );
    } catch (error) {
      console.error('Error updating sync log:', error);
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logs final import statistics
   */
  private logFinalStatistics(): void {
    console.log('\n📊 Final Import Statistics:');
    console.log(`   Total Processed: ${this.stats.totalProcessed}`);
    console.log(`   Total Saved: ${this.stats.totalSaved}`);
    console.log(`   Total Duplicates: ${this.stats.totalDuplicates}`);
    console.log(`   Total Errors: ${this.stats.totalErrors}`);
    console.log(`   Time Ranges Processed: ${this.stats.timeRangesProcessed}`);
  }
}

// Export singleton instance
export const enhancedVendonHistoryImporter = new EnhancedVendonHistoryImporter();
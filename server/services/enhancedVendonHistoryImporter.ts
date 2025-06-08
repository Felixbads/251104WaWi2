/**
 * Enhanced Vendon Historical Transaction Importer Service
 * 
 * This service provides a robust solution for importing historical Vendon transactions
 * that intelligently handles the 100-transaction API limit through dynamic time windows
 * and timestamp-based pagination.
 */

import pkg from 'pg';
const { Pool } = pkg;
import axios, { AxiosInstance } from 'axios';

export interface ImportConfig {
  startDate: Date;
  endDate: Date;
  timeIntervalHours: number;
  batchSize: number;
  requestDelay: number;
  retryDelay: number;
  maxRetries: number;
}

export interface ImportStats {
  totalRequests: number;
  totalTransactions: number;
  savedTransactions: number;
  duplicateTransactions: number;
  errorCount: number;
  startTime: Date;
  lastProgressTime: Date;
}

export interface ImportState {
  lastDate: Date;
  lastOffset: number;
  metadata: any;
}

export interface WindowResult {
  transactionCount: number;
  savedCount: number;
  duplicateCount: number;
  lastTimestamp?: number;
}

export class EnhancedVendonHistoryImporter {
  private pool: Pool;
  private apiClient: AxiosInstance;
  private config: ImportConfig;
  private stats: ImportStats;
  private syncLogId: number | null = null;

  constructor(config: Partial<ImportConfig> = {}) {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Initialize API client
    this.apiClient = axios.create({
      baseURL: 'https://api.vendon.net',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Default configuration
    this.config = {
      startDate: config.startDate || new Date('2022-01-01'),
      endDate: config.endDate || new Date(),
      timeIntervalHours: config.timeIntervalHours || 2,
      batchSize: Math.min(config.batchSize || 100, 100), // API limit
      requestDelay: config.requestDelay || 1000,
      retryDelay: config.retryDelay || 5000,
      maxRetries: config.maxRetries || 3
    };

    // Initialize statistics
    this.stats = {
      totalRequests: 0,
      totalTransactions: 0,
      savedTransactions: 0,
      duplicateTransactions: 0,
      errorCount: 0,
      startTime: new Date(),
      lastProgressTime: new Date()
    };
  }

  /**
   * Start the import process
   */
  async startImport(): Promise<ImportStats> {
    console.log('🚀 Starting Enhanced Vendon Historical Transaction Import');
    console.log(`Date Range: ${this.config.startDate.toISOString()} to ${this.config.endDate.toISOString()}`);

    try {
      // Initialize sync log
      await this.initializeSyncLog();
      
      // Check for resumable state
      const resumeState = await this.getResumeState();
      
      // Perform import
      await this.performImport(resumeState);
      
      // Complete import
      await this.completeImport();
      
      return this.stats;
      
    } catch (error) {
      console.error('❌ Import failed:', error);
      await this.handleError(error);
      throw error;
    }
  }

  /**
   * Initialize sync log entry
   */
  private async initializeSyncLog(): Promise<void> {
    const result = await this.pool.query(`
      INSERT INTO sync_logs (
        sync_type, sync_status, start_time, 
        sync_config, items_total, items_saved
      ) VALUES (
        'enhanced_vendon_history_import', 'running', NOW(),
        $1, 0, 0
      ) RETURNING id
    `, [JSON.stringify(this.config)]);
    
    this.syncLogId = result.rows[0].id;
    console.log(`📊 Initialized sync log ID: ${this.syncLogId}`);
  }

  /**
   * Get resumable import state
   */
  private async getResumeState(): Promise<ImportState | null> {
    const result = await this.pool.query(`
      SELECT last_date, last_offset, metadata
      FROM sync_state
      WHERE job_name = 'enhanced_vendon_history_import'
    `);
    
    if (result.rows.length > 0) {
      const state = result.rows[0];
      console.log(`🔄 Found resumable state from: ${state.last_date}`);
      return {
        lastDate: new Date(state.last_date),
        lastOffset: state.last_offset || 0,
        metadata: state.metadata ? JSON.parse(state.metadata) : {}
      };
    }
    
    return null;
  }

  /**
   * Perform the actual import with dynamic time windows
   */
  private async performImport(resumeState: ImportState | null): Promise<void> {
    let currentTime = resumeState ? resumeState.lastDate : this.config.startDate;
    let consecutiveEmptyWindows = 0;
    
    while (currentTime < this.config.endDate) {
      const windowEnd = new Date(currentTime);
      windowEnd.setHours(windowEnd.getHours() + this.config.timeIntervalHours);
      
      // Don't exceed end date
      if (windowEnd > this.config.endDate) {
        windowEnd.setTime(this.config.endDate.getTime());
      }
      
      console.log(`🔍 Processing window: ${currentTime.toISOString()} to ${windowEnd.toISOString()}`);
      
      try {
        const windowResult = await this.processTimeWindow(currentTime, windowEnd);
        
        if (windowResult.transactionCount === 0) {
          consecutiveEmptyWindows++;
          if (consecutiveEmptyWindows >= 10) {
            console.log('📭 Multiple empty windows detected, advancing larger time step...');
            currentTime.setDate(currentTime.getDate() + 1);
            consecutiveEmptyWindows = 0;
            continue;
          }
        } else {
          consecutiveEmptyWindows = 0;
        }
        
        // Check if we hit the API limit and need timestamp-based pagination
        if (windowResult.transactionCount === this.config.batchSize) {
          console.log('⚠️ API limit reached, switching to timestamp-based pagination...');
          currentTime = await this.handleHighDensityPeriod(currentTime, windowEnd, windowResult.lastTimestamp!);
        } else {
          // Normal advancement
          currentTime = windowEnd;
        }
        
        // Save progress
        await this.saveProgress(currentTime);
        
        // Show progress
        this.showProgress(currentTime);
        
        // Delay between requests
        await this.delay(this.config.requestDelay);
        
      } catch (error) {
        console.error(`❌ Error processing window: ${error}`);
        await this.handleRequestError(error);
        
        // Still advance to prevent infinite loops
        currentTime.setHours(currentTime.getHours() + this.config.timeIntervalHours);
      }
    }
    
    console.log('✅ Import window processing completed');
  }

  /**
   * Process a single time window
   */
  private async processTimeWindow(startTime: Date, endTime: Date): Promise<WindowResult> {
    const fromTimestamp = Math.floor(startTime.getTime() / 1000);
    const toTimestamp = Math.floor(endTime.getTime() / 1000);
    
    const transactions = await this.fetchTransactions(fromTimestamp, toTimestamp, this.config.batchSize, 0);
    
    if (transactions.length > 0) {
      const saveResult = await this.saveTransactions(transactions);
      console.log(`💾 Saved ${saveResult.saved}/${transactions.length} transactions (${saveResult.duplicates} duplicates)`);
      
      // Return the timestamp of the last transaction for potential continuation
      const sortedTransactions = transactions.sort((a, b) => a.datetime - b.datetime);
      const lastTimestamp = sortedTransactions[sortedTransactions.length - 1].datetime;
      
      return {
        transactionCount: transactions.length,
        savedCount: saveResult.saved,
        duplicateCount: saveResult.duplicates,
        lastTimestamp: lastTimestamp
      };
    }
    
    return {
      transactionCount: 0,
      savedCount: 0,
      duplicateCount: 0
    };
  }

  /**
   * Handle high-density periods with timestamp-based pagination
   */
  private async handleHighDensityPeriod(startTime: Date, endTime: Date, lastTimestamp: number): Promise<Date> {
    console.log('🎯 Entering high-density mode with timestamp-based pagination...');
    
    let currentTimestamp = lastTimestamp + 1; // Start from next second
    const endTimestamp = Math.floor(endTime.getTime() / 1000);
    let hasMoreInPeriod = true;
    
    while (hasMoreInPeriod && currentTimestamp < endTimestamp) {
      try {
        const transactions = await this.fetchTransactions(currentTimestamp, endTimestamp, this.config.batchSize, 0);
        
        if (transactions.length === 0) {
          hasMoreInPeriod = false;
          break;
        }
        
        const saveResult = await this.saveTransactions(transactions);
        console.log(`📥 High-density batch: ${saveResult.saved}/${transactions.length} saved`);
        
        if (transactions.length < this.config.batchSize) {
          // Less than batch size, we can continue normally
          hasMoreInPeriod = false;
        } else {
          // Still at batch size, continue with timestamp pagination
          const sortedTransactions = transactions.sort((a, b) => a.datetime - b.datetime);
          currentTimestamp = sortedTransactions[sortedTransactions.length - 1].datetime + 1;
        }
        
        await this.delay(this.config.requestDelay);
        
      } catch (error) {
        console.error(`❌ Error in high-density mode: ${error}`);
        await this.handleRequestError(error);
        break;
      }
    }
    
    // Return the next time to continue from
    return new Date(currentTimestamp * 1000);
  }

  /**
   * Fetch transactions from Vendon API
   */
  private async fetchTransactions(fromTimestamp: number, toTimestamp: number, limit: number, offset: number): Promise<any[]> {
    this.stats.totalRequests++;
    
    const response = await this.makeRequest('/stats/vends', {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      limit: limit,
      offset: offset
    });
    
    if (response.code === 200 && Array.isArray(response.result)) {
      this.stats.totalTransactions += response.result.length;
      return response.result;
    }
    
    throw new Error(`API returned unexpected response: ${JSON.stringify(response)}`);
  }

  /**
   * Make API request with retry logic
   */
  private async makeRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.apiClient.get(endpoint, { params });
        return response.data;
      } catch (error: any) {
        lastError = error;
        console.warn(`Request attempt ${attempt}/${this.config.maxRetries} failed: ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }
    
    this.stats.errorCount++;
    throw lastError;
  }

  /**
   * Save transactions to database
   */
  private async saveTransactions(transactions: any[]): Promise<{ saved: number; duplicates: number }> {
    let saved = 0;
    let duplicates = 0;
    
    for (const transaction of transactions) {
      try {
        const result = await this.pool.query(`
          INSERT INTO transactions (
            vendon_id, machine_id, machine_name, datetime, transaction_dt, registered_dt,
            product_id, product_name, selection, stock_id, article, quantity, price,
            price_vat, price_wo_vat, vat, currency, discount_code, discount_amount,
            payment_method, payment_type, source, transaction_data, note, metadata, extra_data
          ) VALUES (
            $1, $2, $3, to_timestamp($4), to_timestamp($5), to_timestamp($6),
            $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
            'enhanced-history-import', $22, $23, $24, $25
          )
          ON CONFLICT (vendon_id) DO NOTHING
          RETURNING id
        `, [
          transaction.transaction_id,
          transaction.machine_id,
          transaction.machine_name,
          transaction.datetime,
          transaction.transaction_dt || transaction.datetime,
          transaction.registered_dt || transaction.datetime,
          transaction.product_id,
          transaction.name,
          transaction.selection,
          transaction.stock_id,
          transaction.article,
          transaction.quantity || 1,
          transaction.price,
          transaction.price_vat,
          transaction.price_wo_vat,
          transaction.vat,
          transaction.currency || 'EUR',
          transaction.discount_code,
          transaction.discount_amount,
          transaction.payment_method,
          transaction.payment_type,
          JSON.stringify(transaction),
          null, // note
          null, // metadata
          JSON.stringify(transaction) // extra_data
        ]);
        
        if (result.rows.length > 0) {
          saved++;
        } else {
          duplicates++;
        }
        
      } catch (error) {
        console.error(`❌ Error saving transaction ${transaction.transaction_id}:`, error);
        this.stats.errorCount++;
      }
    }
    
    this.stats.savedTransactions += saved;
    this.stats.duplicateTransactions += duplicates;
    
    return { saved, duplicates };
  }

  /**
   * Save import progress
   */
  private async saveProgress(currentTime: Date): Promise<void> {
    await this.pool.query(`
      INSERT INTO sync_state (job_name, last_date, last_offset, updated_at, metadata)
      VALUES ('enhanced_vendon_history_import', $1, 0, NOW(), $2)
      ON CONFLICT (job_name) 
      DO UPDATE SET 
        last_date = EXCLUDED.last_date,
        last_offset = EXCLUDED.last_offset,
        updated_at = EXCLUDED.updated_at,
        metadata = EXCLUDED.metadata
    `, [currentTime, JSON.stringify(this.stats)]);
    
    // Update sync log
    if (this.syncLogId) {
      await this.pool.query(`
        UPDATE sync_logs 
        SET items_saved = $1, items_total = $2, updated_at = NOW()
        WHERE id = $3
      `, [this.stats.savedTransactions, this.stats.totalTransactions, this.syncLogId]);
    }
  }

  /**
   * Show progress information
   */
  private showProgress(currentTime: Date): void {
    const now = new Date();
    const elapsed = (now.getTime() - this.stats.startTime.getTime()) / 1000;
    const progressPercent = ((currentTime.getTime() - this.config.startDate.getTime()) / 
                            (this.config.endDate.getTime() - this.config.startDate.getTime())) * 100;
    
    // Only show progress every 30 seconds to avoid spam
    if (now.getTime() - this.stats.lastProgressTime.getTime() > 30000) {
      console.log(`\n📊 Progress Report:`);
      console.log(`  Current Time: ${currentTime.toISOString()}`);
      console.log(`  Progress: ${progressPercent.toFixed(2)}%`);
      console.log(`  Elapsed: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
      console.log(`  Total Requests: ${this.stats.totalRequests.toLocaleString()}`);
      console.log(`  Total Transactions: ${this.stats.totalTransactions.toLocaleString()}`);
      console.log(`  Saved: ${this.stats.savedTransactions.toLocaleString()}`);
      console.log(`  Duplicates: ${this.stats.duplicateTransactions.toLocaleString()}`);
      console.log(`  Errors: ${this.stats.errorCount}`);
      
      if (this.stats.totalTransactions > 0) {
        const rate = this.stats.totalTransactions / elapsed;
        console.log(`  Rate: ${rate.toFixed(2)} transactions/second`);
        
        const remaining = (this.config.endDate.getTime() - currentTime.getTime()) / 1000;
        const eta = remaining / ((currentTime.getTime() - this.config.startDate.getTime()) / 1000) * elapsed;
        console.log(`  ETA: ${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`);
      }
      
      this.stats.lastProgressTime = now;
    }
  }

  /**
   * Handle request errors
   */
  private async handleRequestError(error: any): Promise<void> {
    this.stats.errorCount++;
    
    // If it's a rate limit error, wait longer
    if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
      console.log('⏳ Rate limit detected, waiting 60 seconds...');
      await this.delay(60000);
    }
  }

  /**
   * Complete the import
   */
  private async completeImport(): Promise<void> {
    const endTime = new Date();
    const duration = (endTime.getTime() - this.stats.startTime.getTime()) / 1000;
    
    console.log('\n🎉 Import Completed Successfully!');
    console.log('================================');
    console.log(`Duration: ${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m ${Math.floor(duration % 60)}s`);
    console.log(`Total Requests: ${this.stats.totalRequests.toLocaleString()}`);
    console.log(`Total Transactions: ${this.stats.totalTransactions.toLocaleString()}`);
    console.log(`Saved Transactions: ${this.stats.savedTransactions.toLocaleString()}`);
    console.log(`Duplicate Transactions: ${this.stats.duplicateTransactions.toLocaleString()}`);
    console.log(`Errors: ${this.stats.errorCount}`);
    
    if (this.stats.totalTransactions > 0) {
      const rate = this.stats.totalTransactions / duration;
      console.log(`Average Rate: ${rate.toFixed(2)} transactions/second`);
    }
    
    // Update sync log
    if (this.syncLogId) {
      await this.pool.query(`
        UPDATE sync_logs 
        SET 
          sync_status = 'completed',
          end_time = NOW(),
          duration_seconds = $1,
          items_saved = $2,
          items_total = $3,
          error_count = $4,
          sync_result = $5
        WHERE id = $6
      `, [
        duration,
        this.stats.savedTransactions,
        this.stats.totalTransactions,
        this.stats.errorCount,
        JSON.stringify(this.stats),
        this.syncLogId
      ]);
    }
    
    // Clear resume state
    await this.pool.query(`DELETE FROM sync_state WHERE job_name = 'enhanced_vendon_history_import'`);
  }

  /**
   * Handle import errors
   */
  private async handleError(error: any): Promise<void> {
    if (this.syncLogId) {
      await this.pool.query(`
        UPDATE sync_logs 
        SET 
          sync_status = 'failed',
          end_time = NOW(),
          error_count = $1,
          error_message = $2,
          sync_result = $3
        WHERE id = $4
      `, [
        this.stats.errorCount,
        error.message,
        JSON.stringify(this.stats),
        this.syncLogId
      ]);
    }
  }

  /**
   * Get current import status
   */
  async getStatus(): Promise<ImportStats & { config: ImportConfig; syncLogId: number | null }> {
    return {
      ...this.stats,
      config: this.config,
      syncLogId: this.syncLogId
    };
  }

  /**
   * Stop the import (graceful shutdown)
   */
  async stop(): Promise<void> {
    console.log('🛑 Import stop requested...');
    // Implementation for graceful shutdown would go here
    // For now, just update the sync log
    if (this.syncLogId) {
      await this.pool.query(`
        UPDATE sync_logs 
        SET 
          sync_status = 'stopped',
          end_time = NOW(),
          sync_result = $1
        WHERE id = $2
      `, [JSON.stringify(this.stats), this.syncLogId]);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EnhancedVendonHistoryImporter;
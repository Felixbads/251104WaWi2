/**
 * Enhanced Vendon Historical Transaction Import Script
 * 
 * This script provides a robust solution for importing historical Vendon transactions
 * that intelligently handles the 100-transaction API limit through dynamic time windows
 * and timestamp-based pagination.
 * 
 * Key Features:
 * - Dynamic time window adjustment based on transaction density
 * - Timestamp-based continuation to prevent data gaps
 * - Resumable imports through sync_state persistence
 * - Comprehensive error handling and retry logic
 * - Real-time progress tracking and statistics
 * 
 * Usage:
 *   node import_vendon_history_enhanced.js --start-date=2022-01-01
 *   node import_vendon_history_enhanced.js --start-date=2022-01-01 --end-date=2022-12-31
 *   node import_vendon_history_enhanced.js --start-date=2022-01-01 --time-interval=4 --batch-size=50
 * 
 * Arguments:
 *   --start-date         Start date in YYYY-MM-DD format (required)
 *   --end-date          End date in YYYY-MM-DD format (default: today)
 *   --time-interval     Time window in hours (default: 2)
 *   --batch-size        Transactions per API request (default: 100, max: 100)
 *   --request-delay     Delay between API requests in ms (default: 1000)
 *   --retry-delay       Delay between retries in ms (default: 5000)
 *   --max-retries       Maximum retry attempts (default: 3)
 */

require('dotenv').config();
const { Pool } = require('pg');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('start-date', {
    describe: 'Start date for import (YYYY-MM-DD)',
    type: 'string',
    demandOption: true
  })
  .option('end-date', {
    describe: 'End date for import (YYYY-MM-DD)',
    type: 'string',
    default: new Date().toISOString().split('T')[0]
  })
  .option('time-interval', {
    describe: 'Time window in hours',
    type: 'number',
    default: 2
  })
  .option('batch-size', {
    describe: 'Transactions per API request (max 100)',
    type: 'number',
    default: 100
  })
  .option('request-delay', {
    describe: 'Delay between API requests in ms',
    type: 'number',
    default: 1000
  })
  .option('retry-delay', {
    describe: 'Delay between retries in ms',
    type: 'number',
    default: 5000
  })
  .option('max-retries', {
    describe: 'Maximum retry attempts',
    type: 'number',
    default: 3
  })
  .help()
  .argv;

// Validate arguments
if (argv.batchSize > 100) {
  console.error('Error: batch-size cannot exceed 100 (Vendon API limit)');
  process.exit(1);
}

if (!process.env.VENDON_API_KEY) {
  console.error('Error: VENDON_API_KEY environment variable is required');
  process.exit(1);
}

/**
 * Enhanced Vendon Historical Importer Class
 */
class EnhancedVendonHistoryImporter {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    this.apiKey = process.env.VENDON_API_KEY;
    this.baseUrl = 'https://api.vendon.net';
    
    // Configuration from command line
    this.config = {
      startDate: new Date(argv['start-date']),
      endDate: new Date(argv['end-date'] + ' 23:59:59'),
      timeIntervalHours: argv['time-interval'],
      batchSize: argv['batch-size'],
      requestDelay: argv['request-delay'],
      retryDelay: argv['retry-delay'],
      maxRetries: argv['max-retries']
    };
    
    // Import statistics
    this.stats = {
      totalRequests: 0,
      totalTransactions: 0,
      savedTransactions: 0,
      duplicateTransactions: 0,
      errorCount: 0,
      startTime: new Date(),
      lastProgressTime: new Date()
    };
    
    this.syncLogId = null;
  }

  /**
   * Main import execution
   */
  async import() {
    console.log('🚀 Enhanced Vendon Historical Transaction Import');
    console.log('=================================================');
    console.log(`Start Date: ${this.config.startDate.toISOString()}`);
    console.log(`End Date: ${this.config.endDate.toISOString()}`);
    console.log(`Time Interval: ${this.config.timeIntervalHours} hours`);
    console.log(`Batch Size: ${this.config.batchSize} transactions`);
    console.log();

    try {
      // Initialize sync log
      await this.initializeSyncLog();
      
      // Check for resumable state
      const resumeState = await this.getResumeState();
      
      // Perform import
      await this.performImport(resumeState);
      
      // Complete import
      await this.completeImport();
      
    } catch (error) {
      console.error('❌ Import failed:', error);
      await this.handleError(error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize sync log entry
   */
  async initializeSyncLog() {
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
  async getResumeState() {
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
  async performImport(resumeState) {
    let currentTime = resumeState ? resumeState.lastDate : this.config.startDate;
    let hasMoreData = true;
    let consecutiveEmptyWindows = 0;
    
    while (hasMoreData && currentTime < this.config.endDate) {
      const windowEnd = new Date(currentTime);
      windowEnd.setHours(windowEnd.getHours() + this.config.timeIntervalHours);
      
      // Don't exceed end date
      if (windowEnd > this.config.endDate) {
        windowEnd.setTime(this.config.endDate.getTime());
      }
      
      console.log(`\n🔍 Processing window: ${currentTime.toISOString()} to ${windowEnd.toISOString()}`);
      
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
          console.log('⚠️  API limit reached, switching to timestamp-based pagination...');
          currentTime = await this.handleHighDensityPeriod(currentTime, windowEnd, windowResult.lastTimestamp);
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
        console.error(`❌ Error processing window: ${error.message}`);
        await this.handleRequestError(error);
        
        // Still advance to prevent infinite loops
        currentTime.setHours(currentTime.getHours() + this.config.timeIntervalHours);
      }
    }
    
    console.log('\n✅ Import window processing completed');
  }

  /**
   * Process a single time window
   */
  async processTimeWindow(startTime, endTime) {
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
      duplicateCount: 0,
      lastTimestamp: null
    };
  }

  /**
   * Handle high-density periods with timestamp-based pagination
   */
  async handleHighDensityPeriod(startTime, endTime, lastTimestamp) {
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
        console.error(`❌ Error in high-density mode: ${error.message}`);
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
  async fetchTransactions(fromTimestamp, toTimestamp, limit, offset) {
    const url = `${this.baseUrl}/stats/vends`;
    const params = new URLSearchParams({
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      limit: limit,
      offset: offset
    });
    
    this.stats.totalRequests++;
    
    const response = await this.makeRequest(`${url}?${params}`);
    
    if (response.code === 200 && Array.isArray(response.result)) {
      this.stats.totalTransactions += response.result.length;
      return response.result;
    }
    
    throw new Error(`API returned unexpected response: ${JSON.stringify(response)}`);
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const fetch = await import('node-fetch').then(mod => mod.default);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Request attempt ${attempt}/${this.config.maxRetries} failed: ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
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
  async saveTransactions(transactions) {
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
        console.error(`❌ Error saving transaction ${transaction.transaction_id}: ${error.message}`);
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
  async saveProgress(currentTime) {
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
  showProgress(currentTime) {
    const now = new Date();
    const elapsed = (now - this.stats.startTime) / 1000;
    const progressPercent = ((currentTime - this.config.startDate) / (this.config.endDate - this.config.startDate)) * 100;
    
    // Only show progress every 30 seconds to avoid spam
    if (now - this.stats.lastProgressTime > 30000) {
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
        
        const remaining = (this.config.endDate - currentTime) / 1000;
        const eta = remaining / ((currentTime - this.config.startDate) / 1000) * elapsed;
        console.log(`  ETA: ${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`);
      }
      
      this.stats.lastProgressTime = now;
    }
  }

  /**
   * Handle request errors
   */
  async handleRequestError(error) {
    this.stats.errorCount++;
    
    // If it's a rate limit error, wait longer
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      console.log('⏳ Rate limit detected, waiting 60 seconds...');
      await this.delay(60000);
    }
  }

  /**
   * Complete the import
   */
  async completeImport() {
    const endTime = new Date();
    const duration = (endTime - this.stats.startTime) / 1000;
    
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
  async handleError(error) {
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
   * Cleanup resources
   */
  async cleanup() {
    await this.pool.end();
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main execution function
 */
async function main() {
  const importer = new EnhancedVendonHistoryImporter();
  await importer.import();
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Import failed:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedVendonHistoryImporter };
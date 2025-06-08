/**
 * Massive Historical Vendon Transaction Import (2022 - Present)
 * 
 * This script imports ALL historical transactions from 2022 to present day
 * using an optimized approach that handles the 100-transaction API limit
 * by using intelligent date chunking and progress tracking.
 */

require('dotenv').config();
const { Pool } = require('pg');

// Dynamic import for node-fetch (ES module)
let fetch;
(async () => {
  const nodeFetch = await import('node-fetch');
  fetch = nodeFetch.default;
})();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Vendon API configuration
const VENDON_API_BASE = 'https://cloud.vendon.net/rest/v1.8.0';
const VENDON_API_KEY = process.env.VENDON_API_KEY;

if (!VENDON_API_KEY) {
  console.error('❌ VENDON_API_KEY not found in environment variables');
  process.exit(1);
}

class MassiveHistoricalImporter {
  constructor() {
    this.totalImported = 0;
    this.totalProcessed = 0;
    this.duplicates = 0;
    this.errors = 0;
    this.startTime = new Date();
    this.currentDate = null;
    this.syncLogId = null;
  }

  /**
   * Initialize sync log for tracking progress
   */
  async initializeSyncLog(startDate, endDate) {
    const query = `
      INSERT INTO sync_logs (
        sync_type, start_date, end_date, sync_status, 
        items_found, items_saved, duplicates, errors,
        created_at, additional_data
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    
    const values = [
      'massive_historical_import',
      startDate,
      endDate,
      'running',
      0, 0, 0, 0,
      new Date(),
      JSON.stringify({
        message: 'Massive historical import from 2022 to present',
        strategy: 'intelligent_date_chunking'
      })
    ];
    
    const result = await pool.query(query, values);
    this.syncLogId = result.rows[0].id;
    console.log(`📊 Initialized sync log ID: ${this.syncLogId}`);
    return this.syncLogId;
  }

  /**
   * Update sync log with current progress
   */
  async updateSyncLog(status = 'running') {
    if (!this.syncLogId) return;
    
    const duration = (new Date() - this.startTime) / 1000;
    const query = `
      UPDATE sync_logs 
      SET 
        items_found = $1,
        items_saved = $2,
        duplicates = $3,
        errors = $4,
        duration_seconds = $5,
        sync_status = $6,
        additional_data = $7
      WHERE id = $8
    `;
    
    const additionalData = {
      totalProcessed: this.totalProcessed,
      totalImported: this.totalImported,
      currentDate: this.currentDate,
      rate_per_second: Math.round(this.totalProcessed / duration),
      estimated_completion: this.estimateCompletion()
    };
    
    const values = [
      this.totalProcessed,
      this.totalImported,
      this.duplicates,
      this.errors,
      duration,
      status,
      JSON.stringify(additionalData),
      this.syncLogId
    ];
    
    await pool.query(query, values);
  }

  /**
   * Estimate completion time
   */
  estimateCompletion() {
    const duration = (new Date() - this.startTime) / 1000;
    const rate = this.totalProcessed / duration;
    
    if (rate > 0 && this.currentDate) {
      const remainingDays = Math.ceil((new Date() - new Date(this.currentDate)) / (1000 * 60 * 60 * 24));
      const estimatedSeconds = remainingDays * 1000 / rate; // Assuming 1000 transactions per day average
      return `${Math.round(estimatedSeconds / 60)} minutes`;
    }
    return 'calculating...';
  }

  /**
   * Fetch transactions from Vendon API for a specific date range
   */
  async fetchTransactions(startDate, endDate, page = 1, pageSize = 100) {
    // Ensure fetch is loaded
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    const url = `${VENDON_API_BASE}/vendsTotals`;
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
      startDate: startDate,
      endDate: endDate
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${VENDON_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Insert transaction into database
   */
  async insertTransaction(transaction, machineId) {
    const query = `
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, transaction_dt, registered_dt,
        product_name, selection, stock_id, article, quantity, price, price_vat, price_wo_vat,
        vat, currency, discount_code, discount_amount, payment_method, source, extra_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (vendon_id) DO NOTHING
      RETURNING id
    `;

    const datetime = new Date(transaction.datetime * 1000);
    const transactionDt = transaction.transaction_dt ? new Date(transaction.transaction_dt * 1000) : null;
    const registeredDt = transaction.registered_dt ? new Date(transaction.registered_dt * 1000) : null;

    const values = [
      transaction.transaction_id.toString(),
      machineId,
      transaction.machine_name || '',
      datetime,
      transactionDt,
      registeredDt,
      transaction.product_name || '',
      transaction.selection || null,
      transaction.stock_id || null,
      transaction.article || null,
      transaction.quantity || 1,
      transaction.price || 0,
      transaction.price_vat || 0,
      transaction.price_wo_vat || 0,
      transaction.vat || 0,
      transaction.currency || 'EUR',
      transaction.discount_code || null,
      transaction.discount_amount || null,
      transaction.payment_method || null,
      'HISTORICAL_IMPORT',
      JSON.stringify(transaction)
    ];

    const result = await pool.query(query, values);
    return result.rows.length > 0;
  }

  /**
   * Get machine ID from machine_name or vendon machine_id
   */
  async getMachineId(vendonMachineId, machineName) {
    // First try to find by vendon_id
    let query = 'SELECT id FROM machines WHERE vendon_id = $1';
    let result = await pool.query(query, [vendonMachineId.toString()]);
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Try to find by machine name
    query = 'SELECT id FROM machines WHERE machine_name ILIKE $1';
    result = await pool.query(query, [`%${machineName}%`]);
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Create new machine if not found
    const insertQuery = `
      INSERT INTO machines (vendon_id, machine_name, location, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (vendon_id) DO UPDATE SET machine_name = EXCLUDED.machine_name
      RETURNING id
    `;
    
    const insertResult = await pool.query(insertQuery, [
      vendonMachineId.toString(),
      machineName || `Machine ${vendonMachineId}`,
      'Unknown',
      'active'
    ]);
    
    return insertResult.rows[0].id;
  }

  /**
   * Process a single day's transactions
   */
  async processSingleDay(date) {
    const dateStr = date.toISOString().split('T')[0];
    this.currentDate = dateStr;
    
    const startDateTime = `${dateStr}T00:00:00`;
    const endDateTime = `${dateStr}T23:59:59`;
    
    console.log(`📅 Processing ${dateStr}...`);
    
    let page = 1;
    let totalDayTransactions = 0;
    let hasMorePages = true;
    
    while (hasMorePages) {
      try {
        const response = await this.fetchTransactions(startDateTime, endDateTime, page, 100);
        
        if (!response.data || response.data.length === 0) {
          hasMorePages = false;
          break;
        }

        for (const transaction of response.data) {
          this.totalProcessed++;
          
          try {
            const machineId = await this.getMachineId(transaction.machine_id, transaction.machine_name);
            const inserted = await this.insertTransaction(transaction, machineId);
            
            if (inserted) {
              this.totalImported++;
              totalDayTransactions++;
            } else {
              this.duplicates++;
            }
          } catch (error) {
            this.errors++;
            console.error(`❌ Error processing transaction ${transaction.transaction_id}: ${error.message}`);
          }
        }

        // Check if we have more pages
        hasMorePages = response.data.length === 100 && response.data.length > 0;
        page++;
        
        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error fetching data for ${dateStr}, page ${page}: ${error.message}`);
        this.errors++;
        hasMorePages = false;
      }
    }
    
    console.log(`   ✓ ${dateStr}: ${totalDayTransactions} new transactions imported`);
    
    // Update progress every day
    await this.updateSyncLog();
  }

  /**
   * Generate all dates between start and end
   */
  generateDateRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  }

  /**
   * Main import process
   */
  async import(startDate = '2022-01-01', endDate = null) {
    if (!endDate) {
      endDate = new Date().toISOString().split('T')[0];
    }

    console.log('🚀 Massive Historical Vendon Transaction Import');
    console.log('='.repeat(60));
    console.log(`📅 Start Date: ${startDate}`);
    console.log(`📅 End Date: ${endDate}`);
    console.log('');

    try {
      await this.initializeSyncLog(new Date(startDate), new Date(endDate));
      
      const dates = this.generateDateRange(startDate, endDate);
      console.log(`📊 Total days to process: ${dates.length}`);
      console.log('');

      let dayCount = 0;
      for (const date of dates) {
        dayCount++;
        
        await this.processSingleDay(date);
        
        // Progress report every 10 days
        if (dayCount % 10 === 0) {
          const progress = (dayCount / dates.length * 100).toFixed(1);
          const elapsed = (new Date() - this.startTime) / 1000;
          const rate = this.totalProcessed / elapsed;
          
          console.log('');
          console.log(`📊 Progress Report (Day ${dayCount}/${dates.length})`);
          console.log(`   Progress: ${progress}%`);
          console.log(`   Total Processed: ${this.totalProcessed.toLocaleString()}`);
          console.log(`   Total Imported: ${this.totalImported.toLocaleString()}`);
          console.log(`   Duplicates: ${this.duplicates.toLocaleString()}`);
          console.log(`   Rate: ${Math.round(rate)} transactions/sec`);
          console.log(`   Estimated completion: ${this.estimateCompletion()}`);
          console.log('');
        }
      }

      // Final update
      await this.updateSyncLog('completed');
      
      const duration = (new Date() - this.startTime) / 1000;
      console.log('');
      console.log('🎉 Import Completed Successfully!');
      console.log('='.repeat(40));
      console.log(`📊 Total Processed: ${this.totalProcessed.toLocaleString()}`);
      console.log(`📊 Total Imported: ${this.totalImported.toLocaleString()}`);
      console.log(`📊 Duplicates: ${this.duplicates.toLocaleString()}`);
      console.log(`📊 Errors: ${this.errors.toLocaleString()}`);
      console.log(`⏱️  Duration: ${Math.round(duration)} seconds`);
      console.log(`⚡ Rate: ${Math.round(this.totalProcessed / duration)} transactions/sec`);
      console.log('');

    } catch (error) {
      console.error('❌ Import failed:', error);
      await this.updateSyncLog('failed');
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));
  
  const startDate = startDateArg ? startDateArg.split('=')[1] : '2022-01-01';
  const endDate = endDateArg ? endDateArg.split('=')[1] : null;

  const importer = new MassiveHistoricalImporter();
  
  try {
    await importer.import(startDate, endDate);
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run the import
if (require.main === module) {
  main();
}

module.exports = { MassiveHistoricalImporter };
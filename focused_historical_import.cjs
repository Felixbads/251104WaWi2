/**
 * Focused Historical Vendon Transaction Import
 * 
 * This script uses the correct /stats/vends API endpoint with Token authentication
 * to import historical transactions efficiently, focusing on filling data gaps.
 */

require('dotenv').config();
const { Pool } = require('pg');

// Dynamic import for node-fetch (ES module)
let fetch;

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

class FocusedHistoricalImporter {
  constructor() {
    this.totalImported = 0;
    this.totalProcessed = 0;
    this.duplicates = 0;
    this.errors = 0;
    this.startTime = new Date();
  }

  /**
   * Fetch transactions from Vendon API for a specific date range
   */
  async fetchTransactions(startDate, endDate, offset = 0, limit = 100) {
    // Ensure fetch is loaded
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
    // Convert dates to timestamps
    const fromTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const toTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const url = `${VENDON_API_BASE}/stats/vends`;
    const params = new URLSearchParams({
      from_timestamp: fromTimestamp.toString(),
      to_timestamp: toTimestamp.toString(),
      limit: limit.toString(),
      offset: offset.toString()
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Token ${VENDON_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.code === 200 && Array.isArray(result.result)) {
      return { data: result.result, total: result.paging?.total || 0 };
    } else {
      throw new Error(`Unexpected API response format: ${JSON.stringify(result)}`);
    }
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

    // Handle datetime - could be Unix timestamp or already a proper date
    let datetime;
    if (transaction.datetime) {
      if (typeof transaction.datetime === 'number') {
        datetime = new Date(transaction.datetime > 1577836800000 ? transaction.datetime : transaction.datetime * 1000);
      } else {
        datetime = new Date(transaction.datetime);
      }
    } else {
      datetime = new Date();
    }
    
    const transactionDt = transaction.transaction_dt ? new Date(transaction.transaction_dt * 1000) : null;
    const registeredDt = transaction.registered_dt ? new Date(transaction.registered_dt * 1000) : null;

    const values = [
      transaction.transaction_id.toString(),
      machineId,
      transaction.machine_name || '',
      datetime,
      transactionDt,
      registeredDt,
      transaction.name || 'Unknown Product',
      transaction.selection || null,
      transaction.stock_id ? transaction.stock_id.toString() : null,
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
   * Process a specific date range
   */
  async processDateRange(startDate, endDate) {
    const dateStr = `${startDate} to ${endDate}`;
    console.log(`📅 Processing ${dateStr}...`);
    
    let offset = 0;
    let totalRangeTransactions = 0;
    let hasMoreData = true;
    const limit = 100;
    
    while (hasMoreData) {
      try {
        const response = await this.fetchTransactions(startDate, endDate, offset, limit);
        
        if (!response.data || response.data.length === 0) {
          hasMoreData = false;
          break;
        }

        console.log(`  📦 Processing batch ${Math.floor(offset/limit) + 1}: ${response.data.length} transactions (total: ${response.total})`);

        for (const transaction of response.data) {
          this.totalProcessed++;
          
          try {
            const machineId = await this.getMachineId(transaction.machine_id, transaction.machine_name);
            const inserted = await this.insertTransaction(transaction, machineId);
            
            if (inserted) {
              this.totalImported++;
              totalRangeTransactions++;
            } else {
              this.duplicates++;
            }
          } catch (error) {
            this.errors++;
            console.error(`❌ Error processing transaction ${transaction.transaction_id}: ${error.message}`);
          }
        }

        // Check if we have more data
        hasMoreData = response.data.length === limit;
        offset += limit;
        
        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`❌ Error fetching data for ${dateStr}, offset ${offset}: ${error.message}`);
        this.errors++;
        hasMoreData = false;
      }
    }
    
    console.log(`   ✅ ${dateStr}: ${totalRangeTransactions} new transactions imported`);
    return totalRangeTransactions;
  }

  /**
   * Main import process for recent data (last 30 days to fill gaps)
   */
  async importRecentGaps() {
    console.log('🚀 Focused Historical Vendon Transaction Import');
    console.log('='.repeat(60));
    console.log('📅 Target: Recent gaps and current data');
    console.log('');

    try {
      // Import recent data (last 30 days to ensure we have current data)
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      console.log(`📊 Importing last 30 days: ${startDate.split('T')[0]} to ${endDate.split('T')[0]}`);
      const recentCount = await this.processDateRange(startDate, endDate);
      
      // Import historical data from 2022 where we have some data
      console.log('');
      console.log('📊 Importing 2022 historical data...');
      const historical2022Start = '2022-07-01T00:00:00.000Z';
      const historical2022End = '2022-12-31T23:59:59.999Z';
      
      const historical2022Count = await this.processDateRange(historical2022Start, historical2022End);
      
      // Import 2023 data
      console.log('');
      console.log('📊 Importing 2023 historical data...');
      const historical2023Start = '2023-01-01T00:00:00.000Z';
      const historical2023End = '2023-12-31T23:59:59.999Z';
      
      const historical2023Count = await this.processDateRange(historical2023Start, historical2023End);
      
      // Final summary
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
      throw error;
    }
  }

  /**
   * Import specific date range
   */
  async importDateRange(startDateStr, endDateStr) {
    console.log('🚀 Focused Historical Vendon Transaction Import');
    console.log('='.repeat(60));
    console.log(`📅 Start Date: ${startDateStr}`);
    console.log(`📅 End Date: ${endDateStr}`);
    console.log('');

    try {
      const startDate = new Date(startDateStr).toISOString();
      const endDate = new Date(endDateStr).toISOString();
      
      await this.processDateRange(startDate, endDate);
      
      // Final summary
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
  
  const importer = new FocusedHistoricalImporter();
  
  try {
    if (startDateArg && endDateArg) {
      const startDate = startDateArg.split('=')[1];
      const endDate = endDateArg.split('=')[1];
      await importer.importDateRange(startDate, endDate);
    } else {
      await importer.importRecentGaps();
    }
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

module.exports = { FocusedHistoricalImporter };
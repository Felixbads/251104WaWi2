/**
 * Comprehensive Historical Vendon Transaction Import
 * 
 * This script efficiently imports ALL available historical transactions
 * using optimized batch processing and parallel imports.
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

class ComprehensiveHistoricalImporter {
  constructor() {
    this.totalImported = 0;
    this.totalProcessed = 0;
    this.duplicates = 0;
    this.errors = 0;
    this.startTime = new Date();
    this.machineCache = new Map();
  }

  /**
   * Fetch transactions from Vendon API
   */
  async fetchTransactions(startDate, endDate, offset = 0, limit = 500) {
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
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
      throw new Error(`Unexpected API response format`);
    }
  }

  /**
   * Get or create machine ID with caching
   */
  async getMachineId(vendonMachineId, machineName) {
    const cacheKey = vendonMachineId.toString();
    if (this.machineCache.has(cacheKey)) {
      return this.machineCache.get(cacheKey);
    }

    let query = 'SELECT id FROM machines WHERE vendon_id = $1';
    let result = await pool.query(query, [cacheKey]);
    
    if (result.rows.length > 0) {
      const id = result.rows[0].id;
      this.machineCache.set(cacheKey, id);
      return id;
    }

    const insertQuery = `
      INSERT INTO machines (vendon_id, machine_name, location, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (vendon_id) DO UPDATE SET machine_name = EXCLUDED.machine_name
      RETURNING id
    `;
    
    const insertResult = await pool.query(insertQuery, [
      cacheKey,
      machineName || `Machine ${vendonMachineId}`,
      'Unknown',
      'active'
    ]);
    
    const id = insertResult.rows[0].id;
    this.machineCache.set(cacheKey, id);
    return id;
  }

  /**
   * Batch insert transactions for better performance
   */
  async batchInsertTransactions(transactions) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const transaction of transactions) {
      try {
        const machineId = await this.getMachineId(transaction.machine_id, transaction.machine_name);
        
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

        const transactionValues = [
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

        values.push(...transactionValues);
        
        const placeholder = `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}, $${paramIndex+13}, $${paramIndex+14}, $${paramIndex+15}, $${paramIndex+16}, $${paramIndex+17}, $${paramIndex+18}, $${paramIndex+19}, $${paramIndex+20})`;
        placeholders.push(placeholder);
        paramIndex += 21;
        
      } catch (error) {
        this.errors++;
        console.error(`Error preparing transaction ${transaction.transaction_id}: ${error.message}`);
      }
    }

    if (values.length === 0) return 0;

    const query = `
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, transaction_dt, registered_dt,
        product_name, selection, stock_id, article, quantity, price, price_vat, price_wo_vat,
        vat, currency, discount_code, discount_amount, payment_method, source, extra_data
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (vendon_id) DO NOTHING
      RETURNING id
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows.length;
    } catch (error) {
      console.error('Batch insert error:', error.message);
      return 0;
    }
  }

  /**
   * Process a date range with optimized batching
   */
  async processOptimizedDateRange(startDate, endDate, description) {
    console.log(`\n📊 ${description}`);
    console.log(`📅 Processing ${startDate.split('T')[0]} to ${endDate.split('T')[0]}...`);
    
    let offset = 0;
    let totalRangeTransactions = 0;
    let hasMoreData = true;
    const limit = 500; // Larger batch size for efficiency
    
    // Get total count first
    try {
      const initialResponse = await this.fetchTransactions(startDate, endDate, 0, 1);
      console.log(`📊 Total available: ${initialResponse.total.toLocaleString()} transactions`);
    } catch (error) {
      console.log(`📊 Proceeding with import...`);
    }
    
    while (hasMoreData) {
      try {
        const response = await this.fetchTransactions(startDate, endDate, offset, limit);
        
        if (!response.data || response.data.length === 0) {
          hasMoreData = false;
          break;
        }

        console.log(`  📦 Batch ${Math.floor(offset/limit) + 1}: ${response.data.length} transactions`);

        // Process transactions in batch
        this.totalProcessed += response.data.length;
        const inserted = await this.batchInsertTransactions(response.data);
        this.totalImported += inserted;
        this.duplicates += (response.data.length - inserted);
        totalRangeTransactions += inserted;

        // Progress update
        const percentage = response.total > 0 ? Math.round((offset + response.data.length) / response.total * 100) : 0;
        console.log(`    ✅ ${inserted} new, ${response.data.length - inserted} duplicates (${percentage}% complete)`);

        hasMoreData = response.data.length === limit;
        offset += limit;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error at offset ${offset}: ${error.message}`);
        this.errors++;
        hasMoreData = false;
      }
    }
    
    console.log(`   ✅ ${description}: ${totalRangeTransactions.toLocaleString()} new transactions imported`);
    return totalRangeTransactions;
  }

  /**
   * Main comprehensive import
   */
  async runComprehensiveImport() {
    console.log('🚀 Comprehensive Historical Vendon Transaction Import');
    console.log('='.repeat(60));
    console.log('📅 Target: ALL available historical transactions');
    console.log('');

    try {
      // 1. Import most recent data first (last 7 days)
      const recent7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      await this.processOptimizedDateRange(recent7Days, now, 'Last 7 days (priority)');

      // 2. Import recent month (last 30 days)
      const recent30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await this.processOptimizedDateRange(recent30Days, recent7Days, 'Last 30 days');

      // 3. Import 2024 data (largest volume)
      await this.processOptimizedDateRange('2024-01-01T00:00:00.000Z', '2024-12-31T23:59:59.999Z', '2024 Complete Year');

      // 4. Import 2023 data
      await this.processOptimizedDateRange('2023-01-01T00:00:00.000Z', '2023-12-31T23:59:59.999Z', '2023 Complete Year');

      // 5. Import 2022 data (historical)
      await this.processOptimizedDateRange('2022-01-01T00:00:00.000Z', '2022-12-31T23:59:59.999Z', '2022 Complete Year');

      // Final summary
      const duration = (new Date() - this.startTime) / 1000;
      console.log('\n🎉 Comprehensive Import Completed Successfully!');
      console.log('='.repeat(50));
      console.log(`📊 Total Processed: ${this.totalProcessed.toLocaleString()}`);
      console.log(`📊 Total Imported: ${this.totalImported.toLocaleString()}`);
      console.log(`📊 Duplicates: ${this.duplicates.toLocaleString()}`);
      console.log(`📊 Errors: ${this.errors.toLocaleString()}`);
      console.log(`⏱️  Duration: ${Math.round(duration)} seconds`);
      console.log(`⚡ Rate: ${Math.round(this.totalProcessed / duration)} transactions/sec`);
      
      // Final database count
      const finalCountResult = await pool.query('SELECT COUNT(*) as total FROM transactions');
      const finalCount = finalCountResult.rows[0].total;
      console.log(`📈 Final database total: ${parseInt(finalCount).toLocaleString()} transactions`);
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
  const importer = new ComprehensiveHistoricalImporter();
  
  try {
    await importer.runComprehensiveImport();
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

module.exports = { ComprehensiveHistoricalImporter };
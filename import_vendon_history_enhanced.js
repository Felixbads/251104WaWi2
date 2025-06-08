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
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Import TypeScript modules
require('esbuild-register');
const { enhancedVendonHistoryImporter } = require('./server/services/enhancedVendonHistoryImporter');

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
    describe: 'Time window size in hours',
    type: 'number',
    default: 2
  })
  .option('batch-size', {
    describe: 'Number of transactions per API request (max 100)',
    type: 'number',
    default: 100
  })
  .option('request-delay', {
    describe: 'Delay between API requests in milliseconds',
    type: 'number',
    default: 1000
  })
  .option('retry-delay', {
    describe: 'Delay between retry attempts in milliseconds',
    type: 'number',
    default: 5000
  })
  .option('max-retries', {
    describe: 'Maximum number of retry attempts',
    type: 'number',
    default: 3
  })
  .check((argv) => {
    // Validate start date
    const startDate = new Date(argv['start-date']);
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid start-date format. Use YYYY-MM-DD');
    }

    // Validate end date
    const endDate = new Date(argv['end-date']);
    if (isNaN(endDate.getTime())) {
      throw new Error('Invalid end-date format. Use YYYY-MM-DD');
    }

    // Validate date range
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Validate batch size
    if (argv['batch-size'] > 100) {
      throw new Error('Batch size cannot exceed 100 (Vendon API limitation)');
    }

    return true;
  })
  .help()
  .example('$0 --start-date=2022-01-01', 'Import from start of 2022 to today')
  .example('$0 --start-date=2022-01-01 --end-date=2022-12-31', 'Import entire year 2022')
  .example('$0 --start-date=2023-06-01 --time-interval=4 --batch-size=50', 'Import with 4-hour windows and 50-transaction batches')
  .argv;

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Enhanced Vendon Historical Transaction Import');
  console.log('================================================');
  
  // Display configuration
  console.log('\nConfiguration:');
  console.log(`  Start Date: ${argv['start-date']}`);
  console.log(`  End Date: ${argv['end-date']}`);
  console.log(`  Time Interval: ${argv['time-interval']} hours`);
  console.log(`  Batch Size: ${argv['batch-size']} transactions`);
  console.log(`  Request Delay: ${argv['request-delay']}ms`);
  console.log(`  Retry Delay: ${argv['retry-delay']}ms`);
  console.log(`  Max Retries: ${argv['max-retries']}`);
  
  // Validate API key
  if (!process.env.VENDON_API_KEY) {
    console.error('\n❌ Error: VENDON_API_KEY environment variable is required');
    console.error('Please set your Vendon API key:');
    console.error('  export VENDON_API_KEY="your-api-key"');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    // Prepare import options
    const options = {
      startDate: argv['start-date'],
      endDate: argv['end-date'],
      timeIntervalHours: argv['time-interval'],
      batchSize: argv['batch-size'],
      requestDelayMs: argv['request-delay'],
      retryDelayMs: argv['retry-delay'],
      maxRetries: argv['max-retries']
    };

    console.log('\n🔄 Starting Enhanced Import Process...');
    console.log('This may take a while for large date ranges.\n');

    // Execute the import
    const result = await enhancedVendonHistoryImporter.startImport(options);

    // Calculate total duration
    const durationSeconds = (Date.now() - startTime) / 1000;

    // Display final results
    console.log('\n✅ Import Completed Successfully!');
    console.log('==================================');
    console.log(`📊 Final Statistics:`);
    console.log(`   Total Processed: ${result.totalProcessed.toLocaleString()}`);
    console.log(`   Total Saved: ${result.totalSaved.toLocaleString()}`);
    console.log(`   Total Duplicates: ${result.totalDuplicates.toLocaleString()}`);
    console.log(`   Total Errors: ${result.totalErrors.toLocaleString()}`);
    console.log(`   Time Ranges Processed: ${result.timeRangesProcessed.toLocaleString()}`);
    console.log(`   Total Duration: ${durationSeconds.toFixed(2)} seconds`);

    // Calculate rates
    if (durationSeconds > 0) {
      const transactionsPerSecond = result.totalProcessed / durationSeconds;
      console.log(`   Import Rate: ${transactionsPerSecond.toFixed(2)} transactions/second`);
    }

    // Display success rate
    if (result.totalProcessed > 0) {
      const successRate = ((result.totalSaved / result.totalProcessed) * 100).toFixed(2);
      console.log(`   Success Rate: ${successRate}% (excluding duplicates)`);
    }

    console.log('\n💡 Next Steps:');
    console.log('   - Check the sync_logs table for detailed import history');
    console.log('   - Verify data integrity using the completeness check script');
    console.log('   - Set up incremental imports for ongoing synchronization');

  } catch (error) {
    console.error('\n❌ Import Failed');
    console.error('================');
    console.error('Error:', error.message);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify your Vendon API key is valid and active');
    console.error('   2. Check your internet connection');
    console.error('   3. Ensure the database is accessible');
    console.error('   4. Try a smaller date range to isolate issues');
    console.error('   5. Check the sync_logs table for partial progress');

    process.exit(1);
  }
}

// Execute main function
main().catch(error => {
  console.error('Critical error:', error);
  process.exit(1);
});
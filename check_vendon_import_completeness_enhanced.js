/**
 * Enhanced Vendon Import Completeness Verification
 * 
 * This script provides comprehensive analysis of historical transaction import completeness
 * and validates the effectiveness of the enhanced import system. It checks for:
 * - Transaction gaps by date and time
 * - API limit boundary verification (around 100-transaction windows)
 * - Data integrity validation between multiple import runs
 * - Performance metrics and import statistics
 * 
 * Usage:
 *   node check_vendon_import_completeness_enhanced.js [options]
 * 
 * Examples:
 *   node check_vendon_import_completeness_enhanced.js --start-date=2022-01-01
 *   node check_vendon_import_completeness_enhanced.js --full-analysis --machine-id=123
 *   node check_vendon_import_completeness_enhanced.js --validate-boundaries --verbose
 */

require('dotenv').config();
const { Pool } = require('pg');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('start-date', {
    describe: 'Start date for analysis (YYYY-MM-DD)',
    type: 'string',
    default: '2022-01-01'
  })
  .option('end-date', {
    describe: 'End date for analysis (YYYY-MM-DD)',
    type: 'string',
    default: new Date().toISOString().split('T')[0]
  })
  .option('machine-id', {
    describe: 'Specific machine ID to analyze',
    type: 'number'
  })
  .option('full-analysis', {
    describe: 'Perform comprehensive analysis including boundary checks',
    type: 'boolean',
    default: false
  })
  .option('validate-boundaries', {
    describe: 'Check for potential API limit boundary issues',
    type: 'boolean',
    default: false
  })
  .option('verbose', {
    describe: 'Enable verbose output',
    type: 'boolean',
    default: false
  })
  .option('export-gaps', {
    describe: 'Export gap data to CSV file',
    type: 'boolean',
    default: false
  })
  .help()
  .argv;

/**
 * Main analysis class
 */
class EnhancedCompletenessAnalyzer {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    this.results = {
      totalTransactions: 0,
      dateRange: { start: argv['start-date'], end: argv['end-date'] },
      gaps: [],
      boundaries: [],
      duplicates: [],
      statistics: {},
      recommendations: []
    };
  }

  /**
   * Run complete analysis
   */
  async analyze() {
    console.log('🔍 Enhanced Vendon Import Completeness Analysis');
    console.log('===============================================');
    console.log(`Date Range: ${argv['start-date']} to ${argv['end-date']}`);
    if (argv['machine-id']) {
      console.log(`Machine Filter: ${argv['machine-id']}`);
    }
    console.log();

    try {
      // Basic statistics
      await this.getBasicStatistics();
      
      // Check for date gaps
      await this.checkDateGaps();
      
      // Check for duplicates
      await this.checkDuplicates();
      
      // Validate transaction distribution
      await this.analyzeTransactionDistribution();
      
      if (argv['full-analysis']) {
        await this.checkSourceConsistency();
        await this.analyzeImportPerformance();
      }
      
      if (argv['validate-boundaries']) {
        await this.validateAPIBoundaries();
      }
      
      // Generate recommendations
      this.generateRecommendations();
      
      // Display results
      this.displayResults();
      
      if (argv['export-gaps']) {
        await this.exportGapsToCSV();
      }

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  /**
   * Get basic transaction statistics
   */
  async getBasicStatistics() {
    console.log('📊 Gathering basic statistics...');
    
    let query = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(DISTINCT vendon_id) as unique_transactions,
        COUNT(DISTINCT machine_id) as unique_machines,
        COUNT(DISTINCT DATE(datetime)) as days_with_data,
        MIN(datetime) as earliest_transaction,
        MAX(datetime) as latest_transaction,
        COUNT(DISTINCT source) as import_sources,
        AVG(price) as avg_price
      FROM transactions 
      WHERE datetime >= $1 AND datetime <= $2
    `;
    
    const params = [argv['start-date'], argv['end-date'] + ' 23:59:59'];
    
    if (argv['machine-id']) {
      query += ' AND machine_id = $3';
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    const stats = result.rows[0];
    
    this.results.totalTransactions = parseInt(stats.total_transactions);
    this.results.statistics = {
      totalTransactions: parseInt(stats.total_transactions),
      uniqueTransactions: parseInt(stats.unique_transactions),
      uniqueMachines: parseInt(stats.unique_machines),
      daysWithData: parseInt(stats.days_with_data),
      earliestTransaction: stats.earliest_transaction,
      latestTransaction: stats.latest_transaction,
      importSources: parseInt(stats.import_sources),
      averagePrice: parseFloat(stats.avg_price || 0)
    };

    // Calculate expected days
    const startDate = new Date(argv['start-date']);
    const endDate = new Date(argv['end-date']);
    const expectedDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    this.results.statistics.expectedDays = expectedDays;
    this.results.statistics.dataCompleteness = (this.results.statistics.daysWithData / expectedDays * 100).toFixed(2);

    if (argv.verbose) {
      console.log(`  Total Transactions: ${stats.total_transactions.toLocaleString()}`);
      console.log(`  Unique Transactions: ${stats.unique_transactions.toLocaleString()}`);
      console.log(`  Machines: ${stats.unique_machines}`);
      console.log(`  Days with Data: ${stats.days_with_data}/${expectedDays} (${this.results.statistics.dataCompleteness}%)`);
      console.log(`  Date Range: ${stats.earliest_transaction} to ${stats.latest_transaction}`);
      console.log(`  Import Sources: ${stats.import_sources}`);
    }
  }

  /**
   * Check for date gaps in transaction data
   */
  async checkDateGaps() {
    console.log('📅 Checking for date gaps...');
    
    let query = `
      WITH date_series AS (
        SELECT generate_series(
          $1::date,
          $2::date,
          '1 day'::interval
        )::date as expected_date
      ),
      actual_dates AS (
        SELECT 
          DATE(datetime) as transaction_date,
          COUNT(*) as transaction_count
        FROM transactions 
        WHERE datetime >= $1 AND datetime <= $2
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    
    if (argv['machine-id']) {
      query += ' AND machine_id = $3';
      params.push(argv['machine-id']);
    }
    
    query += `
        GROUP BY DATE(datetime)
      )
      SELECT 
        ds.expected_date,
        COALESCE(ad.transaction_count, 0) as actual_count
      FROM date_series ds
      LEFT JOIN actual_dates ad ON ds.expected_date = ad.transaction_date
      ORDER BY ds.expected_date
    `;
    
    const result = await this.pool.query(query, params);
    
    const gaps = result.rows.filter(row => row.actual_count === 0);
    this.results.gaps = gaps.map(gap => ({
      date: gap.expected_date,
      type: 'complete_day',
      severity: 'high'
    }));

    // Check for partial day gaps (hours with no transactions on active days)
    if (argv['full-analysis']) {
      await this.checkHourlyGaps();
    }

    if (argv.verbose) {
      console.log(`  Found ${gaps.length} complete day gaps`);
      if (gaps.length > 0 && gaps.length <= 10) {
        gaps.forEach(gap => console.log(`    Missing: ${gap.expected_date}`));
      } else if (gaps.length > 10) {
        console.log(`    First gap: ${gaps[0].expected_date}`);
        console.log(`    Last gap: ${gaps[gaps.length - 1].expected_date}`);
      }
    }
  }

  /**
   * Check for hourly gaps within active days
   */
  async checkHourlyGaps() {
    console.log('🕐 Checking for hourly gaps...');
    
    const query = `
      WITH hourly_data AS (
        SELECT 
          DATE(datetime) as transaction_date,
          EXTRACT(HOUR FROM datetime) as transaction_hour,
          COUNT(*) as transaction_count
        FROM transactions 
        WHERE datetime >= $1 AND datetime <= $2
        ${argv['machine-id'] ? 'AND machine_id = $3' : ''}
        GROUP BY DATE(datetime), EXTRACT(HOUR FROM datetime)
      ),
      active_days AS (
        SELECT DISTINCT transaction_date
        FROM hourly_data
        WHERE transaction_count > 0
      ),
      expected_hours AS (
        SELECT 
          ad.transaction_date,
          generate_series(0, 23) as expected_hour
        FROM active_days ad
      )
      SELECT 
        eh.transaction_date,
        eh.expected_hour,
        COALESCE(hd.transaction_count, 0) as actual_count
      FROM expected_hours eh
      LEFT JOIN hourly_data hd ON eh.transaction_date = hd.transaction_date 
                               AND eh.expected_hour = hd.transaction_hour
      WHERE COALESCE(hd.transaction_count, 0) = 0
      ORDER BY eh.transaction_date, eh.expected_hour
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    if (argv['machine-id']) {
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    
    // Group consecutive hours into gap periods
    const hourlyGaps = this.groupConsecutiveHours(result.rows);
    
    this.results.gaps.push(...hourlyGaps.map(gap => ({
      date: gap.date,
      hours: gap.hours,
      type: 'hourly_gap',
      severity: gap.hours.length > 4 ? 'medium' : 'low'
    })));

    if (argv.verbose) {
      console.log(`  Found ${hourlyGaps.length} hourly gap periods`);
    }
  }

  /**
   * Group consecutive hours into gap periods
   */
  groupConsecutiveHours(hourlyMisses) {
    const gaps = [];
    let currentGap = null;
    
    hourlyMisses.forEach(miss => {
      const date = miss.transaction_date;
      const hour = parseInt(miss.expected_hour);
      
      if (!currentGap || currentGap.date !== date || hour !== currentGap.lastHour + 1) {
        // Start new gap
        if (currentGap) gaps.push(currentGap);
        currentGap = {
          date,
          hours: [hour],
          lastHour: hour
        };
      } else {
        // Continue current gap
        currentGap.hours.push(hour);
        currentGap.lastHour = hour;
      }
    });
    
    if (currentGap) gaps.push(currentGap);
    return gaps;
  }

  /**
   * Check for duplicate transactions
   */
  async checkDuplicates() {
    console.log('🔍 Checking for duplicates...');
    
    const query = `
      SELECT 
        vendon_id,
        COUNT(*) as occurrence_count,
        array_agg(id) as transaction_ids,
        array_agg(source) as sources
      FROM transactions 
      WHERE datetime >= $1 AND datetime <= $2
      ${argv['machine-id'] ? 'AND machine_id = $3' : ''}
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    if (argv['machine-id']) {
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    
    this.results.duplicates = result.rows.map(row => ({
      vendonId: row.vendon_id,
      count: parseInt(row.occurrence_count),
      transactionIds: row.transaction_ids,
      sources: row.sources
    }));

    if (argv.verbose) {
      console.log(`  Found ${result.rows.length} duplicate vendon_ids`);
      if (result.rows.length > 0) {
        console.log(`  Most duplicated: ${result.rows[0].vendon_id} (${result.rows[0].occurrence_count} times)`);
      }
    }
  }

  /**
   * Analyze transaction distribution patterns
   */
  async analyzeTransactionDistribution() {
    console.log('📈 Analyzing transaction distribution...');
    
    const query = `
      SELECT 
        DATE(datetime) as transaction_date,
        COUNT(*) as daily_count,
        MIN(datetime) as first_transaction,
        MAX(datetime) as last_transaction,
        COUNT(DISTINCT machine_id) as active_machines
      FROM transactions 
      WHERE datetime >= $1 AND datetime <= $2
      ${argv['machine-id'] ? 'AND machine_id = $3' : ''}
      GROUP BY DATE(datetime)
      ORDER BY daily_count DESC
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    if (argv['machine-id']) {
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    
    if (result.rows.length > 0) {
      const counts = result.rows.map(row => parseInt(row.daily_count));
      const avgDaily = counts.reduce((a, b) => a + b, 0) / counts.length;
      const maxDaily = Math.max(...counts);
      const minDaily = Math.min(...counts);
      
      this.results.statistics.dailyDistribution = {
        average: avgDaily.toFixed(2),
        maximum: maxDaily,
        minimum: minDaily,
        busiestDay: result.rows[0].transaction_date,
        busiestDayCount: result.rows[0].daily_count
      };

      // Identify potential API boundary issues (days with exactly 100, 200, 300, etc. transactions)
      const boundaryDays = result.rows.filter(row => row.daily_count % 100 === 0 && row.daily_count >= 100);
      this.results.boundaries = boundaryDays.map(day => ({
        date: day.transaction_date,
        count: parseInt(day.daily_count),
        suspicion: 'api_limit_boundary',
        recommendation: 'Verify completeness for this date'
      }));

      if (argv.verbose) {
        console.log(`  Daily Average: ${avgDaily.toFixed(2)} transactions`);
        console.log(`  Busiest Day: ${result.rows[0].transaction_date} (${result.rows[0].daily_count} transactions)`);
        console.log(`  Potential boundary issues: ${boundaryDays.length} days`);
      }
    }
  }

  /**
   * Check source consistency across imports
   */
  async checkSourceConsistency() {
    console.log('🔄 Checking import source consistency...');
    
    const query = `
      SELECT 
        source,
        COUNT(*) as transaction_count,
        MIN(datetime) as earliest,
        MAX(datetime) as latest,
        COUNT(DISTINCT DATE(datetime)) as active_days
      FROM transactions 
      WHERE datetime >= $1 AND datetime <= $2
      ${argv['machine-id'] ? 'AND machine_id = $3' : ''}
      GROUP BY source
      ORDER BY transaction_count DESC
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    if (argv['machine-id']) {
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    
    this.results.statistics.sources = result.rows.map(row => ({
      source: row.source,
      count: parseInt(row.transaction_count),
      earliest: row.earliest,
      latest: row.latest,
      activeDays: parseInt(row.active_days)
    }));

    if (argv.verbose) {
      console.log('  Import Sources:');
      result.rows.forEach(row => {
        console.log(`    ${row.source}: ${row.transaction_count.toLocaleString()} transactions`);
      });
    }
  }

  /**
   * Analyze import performance from sync logs
   */
  async analyzeImportPerformance() {
    console.log('⚡ Analyzing import performance...');
    
    const query = `
      SELECT 
        sync_type,
        COUNT(*) as import_runs,
        AVG(items_saved) as avg_items_saved,
        AVG(duration_seconds) as avg_duration,
        SUM(items_saved) as total_items_saved,
        MAX(items_saved) as max_items_per_run,
        COUNT(CASE WHEN sync_status = 'completed' THEN 1 END) as successful_runs,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_runs
      FROM sync_logs 
      WHERE sync_type LIKE '%history%' OR sync_type LIKE '%enhanced%'
      GROUP BY sync_type
      ORDER BY total_items_saved DESC
    `;
    
    const result = await this.pool.query(query);
    
    this.results.statistics.importPerformance = result.rows.map(row => ({
      syncType: row.sync_type,
      importRuns: parseInt(row.import_runs),
      avgItemsSaved: parseFloat(row.avg_items_saved || 0),
      avgDuration: parseFloat(row.avg_duration || 0),
      totalItemsSaved: parseInt(row.total_items_saved || 0),
      maxItemsPerRun: parseInt(row.max_items_per_run || 0),
      successfulRuns: parseInt(row.successful_runs),
      failedRuns: parseInt(row.failed_runs),
      successRate: ((parseInt(row.successful_runs) / parseInt(row.import_runs)) * 100).toFixed(2)
    }));

    if (argv.verbose) {
      console.log('  Import Performance:');
      result.rows.forEach(row => {
        const successRate = ((parseInt(row.successful_runs) / parseInt(row.import_runs)) * 100).toFixed(2);
        console.log(`    ${row.sync_type}: ${row.total_items_saved.toLocaleString()} total items, ${successRate}% success rate`);
      });
    }
  }

  /**
   * Validate potential API boundary issues
   */
  async validateAPIBoundaries() {
    console.log('🚨 Validating API boundary conditions...');
    
    // Check for suspicious patterns that might indicate API limit issues
    const query = `
      WITH hourly_counts AS (
        SELECT 
          DATE(datetime) as transaction_date,
          EXTRACT(HOUR FROM datetime) as transaction_hour,
          COUNT(*) as hourly_count
        FROM transactions 
        WHERE datetime >= $1 AND datetime <= $2
        ${argv['machine-id'] ? 'AND machine_id = $3' : ''}
        GROUP BY DATE(datetime), EXTRACT(HOUR FROM datetime)
      )
      SELECT 
        transaction_date,
        transaction_hour,
        hourly_count
      FROM hourly_counts
      WHERE hourly_count % 100 = 0 AND hourly_count >= 100
      ORDER BY transaction_date, transaction_hour
    `;
    
    const params = [argv['start-date'], argv['end-date']];
    if (argv['machine-id']) {
      params.push(argv['machine-id']);
    }
    
    const result = await this.pool.query(query, params);
    
    const suspiciousHours = result.rows.map(row => ({
      date: row.transaction_date,
      hour: parseInt(row.transaction_hour),
      count: parseInt(row.hourly_count),
      suspicion: 'potential_api_limit',
      recommendation: 'Review this hour for potential incomplete data'
    }));
    
    this.results.boundaries.push(...suspiciousHours);

    if (argv.verbose) {
      console.log(`  Found ${suspiciousHours.length} potentially suspicious hours`);
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Data completeness recommendations
    if (parseFloat(this.results.statistics.dataCompleteness) < 95) {
      recommendations.push({
        priority: 'high',
        category: 'completeness',
        message: `Data completeness is ${this.results.statistics.dataCompleteness}%. Consider running enhanced historical import for missing dates.`,
        action: `node import_vendon_history_enhanced.js --start-date=${argv['start-date']} --end-date=${argv['end-date']}`
      });
    }
    
    // Gap recommendations
    if (this.results.gaps.length > 0) {
      const highPriorityGaps = this.results.gaps.filter(gap => gap.severity === 'high');
      if (highPriorityGaps.length > 0) {
        recommendations.push({
          priority: 'high',
          category: 'gaps',
          message: `Found ${highPriorityGaps.length} complete day gaps in transaction data.`,
          action: 'Run targeted imports for missing dates'
        });
      }
    }
    
    // Duplicate recommendations
    if (this.results.duplicates.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'duplicates',
        message: `Found ${this.results.duplicates.length} duplicate vendon_ids. This may indicate overlapping imports.`,
        action: 'Review import processes to prevent duplicates'
      });
    }
    
    // Boundary recommendations
    if (this.results.boundaries.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'boundaries',
        message: `Found ${this.results.boundaries.length} potential API boundary issues.`,
        action: 'Use enhanced importer to validate completeness around these periods'
      });
    }
    
    this.results.recommendations = recommendations;
  }

  /**
   * Display comprehensive results
   */
  displayResults() {
    console.log('\n📊 ANALYSIS RESULTS');
    console.log('==================');
    
    // Statistics summary
    console.log('\n📈 Statistics Summary:');
    console.log(`  Total Transactions: ${this.results.statistics.totalTransactions.toLocaleString()}`);
    console.log(`  Data Completeness: ${this.results.statistics.dataCompleteness}%`);
    console.log(`  Unique Machines: ${this.results.statistics.uniqueMachines}`);
    console.log(`  Days with Data: ${this.results.statistics.daysWithData}/${this.results.statistics.expectedDays}`);
    
    if (this.results.statistics.dailyDistribution) {
      console.log(`  Daily Average: ${this.results.statistics.dailyDistribution.average} transactions`);
      console.log(`  Busiest Day: ${this.results.statistics.dailyDistribution.busiestDay} (${this.results.statistics.dailyDistribution.busiestDayCount} transactions)`);
    }
    
    // Issues summary
    console.log('\n🚨 Issues Found:');
    console.log(`  Complete Day Gaps: ${this.results.gaps.filter(g => g.type === 'complete_day').length}`);
    console.log(`  Hourly Gaps: ${this.results.gaps.filter(g => g.type === 'hourly_gap').length}`);
    console.log(`  Duplicates: ${this.results.duplicates.length}`);
    console.log(`  Boundary Concerns: ${this.results.boundaries.length}`);
    
    // Import performance
    if (this.results.statistics.importPerformance) {
      console.log('\n⚡ Import Performance:');
      this.results.statistics.importPerformance.forEach(perf => {
        console.log(`  ${perf.syncType}: ${perf.successRate}% success rate, ${perf.totalItemsSaved.toLocaleString()} items`);
      });
    }
    
    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      this.results.recommendations.forEach(rec => {
        console.log(`  [${rec.priority.toUpperCase()}] ${rec.message}`);
        if (rec.action) {
          console.log(`    Action: ${rec.action}`);
        }
      });
    } else {
      console.log('\n✅ No critical issues found. Data appears complete and consistent.');
    }
    
    console.log('\n📋 Analysis Complete');
  }

  /**
   * Export gap data to CSV
   */
  async exportGapsToCSV() {
    const fs = require('fs');
    const filename = `vendon_gaps_${argv['start-date']}_${argv['end-date']}.csv`;
    
    let csvContent = 'Date,Type,Severity,Details\n';
    
    this.results.gaps.forEach(gap => {
      const details = gap.hours ? `Hours: ${gap.hours.join(',')}` : 'Complete day';
      csvContent += `${gap.date},${gap.type},${gap.severity},"${details}"\n`;
    });
    
    fs.writeFileSync(filename, csvContent);
    console.log(`\n📄 Gap data exported to: ${filename}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const analyzer = new EnhancedCompletenessAnalyzer();
  await analyzer.analyze();
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedCompletenessAnalyzer };
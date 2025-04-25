/**
 * Database Integrity Check Script
 * 
 * This script performs comprehensive integrity checks on the database:
 * - Validates foreign key relationships
 * - Identifies orphaned records
 * - Checks for data inconsistencies
 * - Verifies synchronization state
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const REPORT_DIR = path.join(__dirname, '../db_reports');
const REPAIR_SCRIPT_PATH = path.join(REPORT_DIR, 'repair_script.sql');
const MAX_ORPHANED_RECORDS = process.env.MAX_ORPHANED_RECORDS || 100;

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Connect to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper for running SQL queries
async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error(`Error executing query: ${sql}`);
    console.error(error);
    return [];
  }
}

// Get all tables in the database
async function getTables() {
  const sql = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  return await query(sql);
}

// Get foreign key relationships
async function getForeignKeys() {
  const sql = `
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY';
  `;
  return await query(sql);
}

// Check for orphaned records (records with FK references to non-existent parent records)
async function checkOrphanedRecords(foreignKeys) {
  console.log('\n=== Checking for orphaned records ===');
  const orphanedRecords = [];
  const repairStatements = [];
  
  for (const fk of foreignKeys) {
    // Skip foreign keys that reference the same table (self-references)
    if (fk.table_name === fk.foreign_table_name && fk.column_name === fk.foreign_column_name) {
      continue;
    }
    
    // Query to find orphaned records
    const checkSql = `
      SELECT count(*) as count, '${fk.table_name}' as table_name, '${fk.column_name}' as column_name
      FROM ${fk.table_name} t
      LEFT JOIN ${fk.foreign_table_name} ft ON t.${fk.column_name} = ft.${fk.foreign_column_name}
      WHERE t.${fk.column_name} IS NOT NULL
      AND ft.${fk.foreign_column_name} IS NULL;
    `;
    
    const result = await query(checkSql);
    
    if (result[0].count > 0) {
      console.log(`Found ${result[0].count} orphaned records in ${fk.table_name}.${fk.column_name} referencing ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      orphanedRecords.push({
        table: fk.table_name,
        column: fk.column_name,
        foreignTable: fk.foreign_table_name,
        foreignColumn: fk.foreign_column_name,
        count: parseInt(result[0].count)
      });
      
      // Create SQL to fix/delete orphaned records
      if (parseInt(result[0].count) < MAX_ORPHANED_RECORDS) {
        const fixSql = `
-- Fix orphaned records in ${fk.table_name}.${fk.column_name}
-- Original count: ${result[0].count}
UPDATE ${fk.table_name} 
SET ${fk.column_name} = NULL 
WHERE ${fk.column_name} IS NOT NULL 
AND NOT EXISTS (
  SELECT 1 FROM ${fk.foreign_table_name} 
  WHERE ${fk.foreign_column_name} = ${fk.table_name}.${fk.column_name}
);
`;
        repairStatements.push(fixSql);
      }
    }
  }
  
  if (orphanedRecords.length === 0) {
    console.log('No orphaned records found. All foreign key references are valid.');
  } else {
    // Write repair SQL to file
    fs.writeFileSync(
      REPAIR_SCRIPT_PATH, 
      `-- Database repair script generated on ${new Date().toISOString()}\n\n` +
      repairStatements.join('\n')
    );
    console.log(`Repair script generated at: ${REPAIR_SCRIPT_PATH}`);
  }
  
  return orphanedRecords;
}

// Check for synchronization gaps in time-series data
async function checkDataContinuity() {
  console.log('\n=== Checking data continuity ===');
  
  // Check for gaps in transaction data
  const transactionGapsSql = `
    WITH date_range AS (
      SELECT 
        date_trunc('day', min(datetime)) as min_date,
        date_trunc('day', max(datetime)) as max_date
      FROM transactions
    ),
    days AS (
      SELECT generate_series(min_date, max_date, '1 day'::interval) as day
      FROM date_range
    ),
    daily_counts AS (
      SELECT 
        date_trunc('day', datetime) as day,
        count(*) as transaction_count
      FROM transactions 
      GROUP BY 1
    )
    SELECT 
      d.day::date as date,
      COALESCE(dc.transaction_count, 0) as transaction_count,
      CASE WHEN dc.transaction_count IS NULL OR dc.transaction_count = 0 THEN true ELSE false END as is_gap
    FROM days d
    LEFT JOIN daily_counts dc ON d.day = dc.day
    ORDER BY d.day;
  `;
  
  const transactionGaps = await query(transactionGapsSql);
  const gapDays = transactionGaps.filter(row => row.is_gap);
  
  if (gapDays.length > 0) {
    console.log(`Found ${gapDays.length} days with no transaction data`);
    console.log('First 10 gap days:');
    gapDays.slice(0, 10).forEach(gap => {
      console.log(`  ${gap.date}`);
    });
    
    // Write gaps to report file
    const gapReport = path.join(REPORT_DIR, 'transaction_gaps.json');
    fs.writeFileSync(gapReport, JSON.stringify(gapDays, null, 2));
    console.log(`Full gap report written to: ${gapReport}`);
  } else {
    console.log('No gaps found in transaction data.');
  }
  
  return { gapDays };
}

// Check for table data consistency
async function checkDataConsistency() {
  console.log('\n=== Checking data consistency ===');
  
  // Check for products without names
  const unnnamedProductsSql = `
    SELECT id, vendon_id, status
    FROM products
    WHERE product_name IS NULL OR product_name = '';
  `;
  
  const unnamedProducts = await query(unnnamedProductsSql);
  if (unnamedProducts.length > 0) {
    console.log(`Found ${unnamedProducts.length} products without names`);
  } else {
    console.log('All products have names.');
  }
  
  // Check for duplicate Vendon IDs in products
  const duplicateProductsSql = `
    SELECT vendon_id, count(*) as count
    FROM products
    GROUP BY vendon_id
    HAVING count(*) > 1;
  `;
  
  const duplicateProducts = await query(duplicateProductsSql);
  if (duplicateProducts.length > 0) {
    console.log(`Found ${duplicateProducts.length} duplicate product Vendon IDs`);
    // Write to report file
    const duplicateReport = path.join(REPORT_DIR, 'duplicate_products.json');
    fs.writeFileSync(duplicateReport, JSON.stringify(duplicateProducts, null, 2));
    console.log(`Full duplicate product report written to: ${duplicateReport}`);
  } else {
    console.log('No duplicate product Vendon IDs found.');
  }
  
  return { unnamedProducts, duplicateProducts };
}

// Check sync logs for errors
async function checkSyncLogs() {
  console.log('\n=== Checking sync logs ===');
  
  // Check for sync logs with errors
  const errorLogsSql = `
    SELECT id, sync_type, start_date, end_date, items_found, items_saved, errors, sync_status, error_message
    FROM sync_logs
    WHERE errors > 0 OR sync_status = 'error'
    ORDER BY start_date DESC
    LIMIT 20;
  `;
  
  const errorLogs = await query(errorLogsSql);
  if (errorLogs.length > 0) {
    console.log(`Found ${errorLogs.length} sync logs with errors`);
    console.log('Most recent error logs:');
    errorLogs.slice(0, 5).forEach(log => {
      console.log(`  ID ${log.id}: ${log.sync_type} - ${log.sync_status} - ${log.error_message?.substring(0, 100) || 'No message'}`);
    });
    
    // Write to report file
    const errorLogsReport = path.join(REPORT_DIR, 'sync_error_logs.json');
    fs.writeFileSync(errorLogsReport, JSON.stringify(errorLogs, null, 2));
    console.log(`Full sync error logs written to: ${errorLogsReport}`);
  } else {
    console.log('No sync logs with errors found.');
  }
  
  // Check for stuck sync processes
  const stuckSyncsSql = `
    SELECT id, sync_type, start_date, sync_status, error_message
    FROM sync_logs
    WHERE sync_status = 'running'
    AND start_date < NOW() - INTERVAL '1 hour'
    ORDER BY start_date DESC;
  `;
  
  const stuckSyncs = await query(stuckSyncsSql);
  if (stuckSyncs.length > 0) {
    console.log(`Found ${stuckSyncs.length} stuck sync processes`);
    stuckSyncs.forEach(sync => {
      console.log(`  ID ${sync.id}: ${sync.sync_type} - Started at ${sync.start_date}`);
    });
  } else {
    console.log('No stuck sync processes found.');
  }
  
  return { errorLogs, stuckSyncs };
}

// Generate full database health report
async function generateHealthReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    database: process.env.PGDATABASE || 'unknown',
    summary: {
      orphanedRecords: results.orphanedRecords.length,
      dataGaps: results.dataContinuity.gapDays.length,
      unnamedProducts: results.dataConsistency.unnamedProducts.length,
      duplicateProducts: results.dataConsistency.duplicateProducts.length,
      syncErrors: results.syncLogs.errorLogs.length,
      stuckSyncs: results.syncLogs.stuckSyncs.length
    },
    details: results
  };
  
  // Write report to file
  const reportPath = path.join(REPORT_DIR, `health_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull health report written to: ${reportPath}`);
  
  // Summary
  console.log('\n=== Database Health Summary ===');
  console.log(`Orphaned Records: ${report.summary.orphanedRecords}`);
  console.log(`Data Gaps: ${report.summary.dataGaps}`);
  console.log(`Unnamed Products: ${report.summary.unnamedProducts}`);
  console.log(`Duplicate Products: ${report.summary.duplicateProducts}`);
  console.log(`Sync Errors: ${report.summary.syncErrors}`);
  console.log(`Stuck Syncs: ${report.summary.stuckSyncs}`);
  console.log(`\nOverall health score: ${calculateHealthScore(report.summary)}/100`);
}

// Calculate a health score based on issues found
function calculateHealthScore(summary) {
  // Start with 100 points and deduct for issues
  let score = 100;
  
  // Deduct for orphaned records
  if (summary.orphanedRecords > 0) {
    score -= Math.min(20, summary.orphanedRecords);
  }
  
  // Deduct for data gaps
  if (summary.dataGaps > 0) {
    score -= Math.min(15, summary.dataGaps / 2);
  }
  
  // Deduct for data consistency issues
  if (summary.unnamedProducts > 0) {
    score -= Math.min(10, summary.unnamedProducts);
  }
  
  if (summary.duplicateProducts > 0) {
    score -= Math.min(15, summary.duplicateProducts * 3);
  }
  
  // Deduct for sync issues
  if (summary.syncErrors > 0) {
    score -= Math.min(20, summary.syncErrors * 2);
  }
  
  if (summary.stuckSyncs > 0) {
    score -= Math.min(20, summary.stuckSyncs * 5);
  }
  
  return Math.max(0, Math.round(score));
}

// Main execution
async function main() {
  console.log('=== Database Integrity Check ===');
  console.log(`Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    const tables = await getTables();
    console.log(`\nFound ${tables.length} tables in database`);
    
    const foreignKeys = await getForeignKeys();
    console.log(`Found ${foreignKeys.length} foreign key relationships`);
    
    // Run all checks
    const results = {
      orphanedRecords: await checkOrphanedRecords(foreignKeys),
      dataContinuity: await checkDataContinuity(),
      dataConsistency: await checkDataConsistency(),
      syncLogs: await checkSyncLogs()
    };
    
    // Generate comprehensive health report
    await generateHealthReport(results);
    
    console.log('\nIntegrity check completed successfully.');
  } catch (error) {
    console.error('Error during integrity check:', error);
  } finally {
    await pool.end();
  }
}

main();
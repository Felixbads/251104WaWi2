/**
 * Automated Vendon API to Database Coverage Checker
 * Based on the German implementation plan
 * 
 * This script:
 * 1. Fetches sample data from Vendon API
 * 2. Extracts all API keys from the response
 * 3. Compares with database schema columns
 * 4. Reports missing mappings and coverage percentage
 */

import { pool } from '../server/db';
import { VendonAPI } from '../server/services/vendonAPI';
import { analyzeMappingCoverage } from '../server/services/enhancedVendonMapping';

interface CoverageResult {
  apiKeys: string[];
  dbColumns: string[];
  missingInDB: string[];
  mappedFields: string[];
  unmappedFields: string[];
  coveragePercentage: number;
  recommendations: string[];
}

/**
 * Normalizes API key to expected database column name (snake_case)
 */
function normalizeApiKeyToDbColumn(apiKey: string): string {
  return apiKey.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
}

/**
 * Main coverage checking function
 */
async function checkVendonApiDbCoverage(): Promise<CoverageResult> {
  console.log('🔍 Starting Vendon API to Database Coverage Analysis...');
  
  // Step 1: Get sample data from Vendon API
  console.log('📡 Fetching sample transactions from Vendon API...');
  const vendonAPI = new VendonAPI();
  
  let sampleTransactions: any[] = [];
  try {
    // Get last 50 transactions as sample
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    sampleTransactions = await vendonAPI.getTransactions(oneWeekAgo, new Date(), 50);
    
    if (!sampleTransactions || sampleTransactions.length === 0) {
      throw new Error('No sample transactions found');
    }
    
    console.log(`✅ Retrieved ${sampleTransactions.length} sample transactions`);
  } catch (error) {
    console.error('❌ Failed to fetch sample transactions:', error);
    throw error;
  }
  
  // Step 2: Extract unique API keys from all transactions
  console.log('🔎 Analyzing API response structure...');
  const apiKeys = new Set<string>();
  
  sampleTransactions.forEach(transaction => {
    Object.keys(transaction).forEach(key => apiKeys.add(key));
  });
  
  const apiKeysList = Array.from(apiKeys).sort();
  console.log(`📋 Found ${apiKeysList.length} unique API keys:`, apiKeysList);
  
  // Step 3: Get database columns for transactions table
  console.log('🗄️ Querying database schema...');
  const client = await pool.connect();
  
  let dbColumns: string[] = [];
  try {
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transactions'
      ORDER BY column_name
    `);
    
    dbColumns = result.rows.map(row => row.column_name);
    console.log(`🏛️ Found ${dbColumns.length} database columns`);
  } catch (error) {
    console.error('❌ Failed to query database schema:', error);
    throw error;
  } finally {
    client.release();
  }
  
  // Step 4: Compare API keys with database columns
  console.log('🔄 Comparing API keys with database columns...');
  const dbColumnsSet = new Set(dbColumns);
  const missingInDB: string[] = [];
  
  apiKeysList.forEach(apiKey => {
    const expectedColumn = normalizeApiKeyToDbColumn(apiKey);
    if (!dbColumnsSet.has(expectedColumn)) {
      missingInDB.push(`${apiKey} → ${expectedColumn}`);
    }
  });
  
  // Step 5: Analyze mapping function coverage
  console.log('🎯 Analyzing mapping function coverage...');
  const mappingAnalysis = analyzeMappingCoverage(sampleTransactions[0]);
  
  // Step 6: Generate recommendations
  const recommendations: string[] = [];
  
  if (missingInDB.length > 0) {
    recommendations.push(`Add ${missingInDB.length} missing database columns`);
    recommendations.push('Run database migration to add missing fields');
  }
  
  if (mappingAnalysis.unmappedFields.length > 0) {
    recommendations.push(`Update mapping function to handle ${mappingAnalysis.unmappedFields.length} unmapped fields`);
  }
  
  if (mappingAnalysis.coveragePercentage < 90) {
    recommendations.push('Consider improving mapping coverage to reach 90%+ target');
  }
  
  if (mappingAnalysis.coveragePercentage >= 95) {
    recommendations.push('✅ Excellent mapping coverage achieved!');
  }
  
  return {
    apiKeys: apiKeysList,
    dbColumns,
    missingInDB,
    mappedFields: mappingAnalysis.mappedFields,
    unmappedFields: mappingAnalysis.unmappedFields,
    coveragePercentage: mappingAnalysis.coveragePercentage,
    recommendations
  };
}

/**
 * Formats and displays the coverage report
 */
function displayCoverageReport(result: CoverageResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VENDON API TO DATABASE COVERAGE REPORT');
  console.log('='.repeat(60));
  
  console.log(`\n📡 API Keys Found: ${result.apiKeys.length}`);
  console.log(`🗄️ Database Columns: ${result.dbColumns.length}`);
  console.log(`🎯 Mapping Coverage: ${result.coveragePercentage}%`);
  
  if (result.missingInDB.length > 0) {
    console.log(`\n❌ Missing Database Columns (${result.missingInDB.length}):`);
    result.missingInDB.forEach(mapping => {
      console.log(`   ${mapping}`);
    });
  } else {
    console.log('\n✅ All API keys have corresponding database columns');
  }
  
  if (result.unmappedFields.length > 0) {
    console.log(`\n🔄 Unmapped Fields in Mapping Function (${result.unmappedFields.length}):`);
    result.unmappedFields.forEach(field => {
      console.log(`   ${field}`);
    });
  } else {
    console.log('\n✅ All API fields are handled by mapping function');
  }
  
  if (result.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    result.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Summary status
  if (result.missingInDB.length === 0 && result.coveragePercentage >= 95) {
    console.log('🎉 COVERAGE STATUS: EXCELLENT (95%+ coverage, no missing columns)');
  } else if (result.missingInDB.length === 0 && result.coveragePercentage >= 90) {
    console.log('✅ COVERAGE STATUS: GOOD (90%+ coverage, no missing columns)');
  } else if (result.missingInDB.length <= 3 && result.coveragePercentage >= 80) {
    console.log('⚠️ COVERAGE STATUS: ACCEPTABLE (minor gaps)');
  } else {
    console.log('❌ COVERAGE STATUS: NEEDS IMPROVEMENT');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<number> {
  try {
    console.log('🚀 Starting Vendon API Coverage Check...');
    
    const result = await checkVendonApiDbCoverage();
    displayCoverageReport(result);
    
    // Return exit code based on coverage
    if (result.missingInDB.length === 0 && result.coveragePercentage >= 90) {
      console.log('\n✅ Coverage check passed!');
      return 0;
    } else {
      console.log('\n⚠️ Coverage check completed with recommendations');
      return 1;
    }
    
  } catch (error) {
    console.error('\n❌ Coverage check failed:', error);
    return 1;
  }
}

// Execute if run directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { checkVendonApiDbCoverage, CoverageResult };
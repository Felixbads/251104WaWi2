#!/usr/bin/env node

/**
 * Test ETL Script: Populate Machine Daily Stats for testing
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function testPopulateStats() {
  console.log('🔄 Testing daily stats population...');
  
  try {
    // Get just first 5 active machines for testing
    const machines = await sql`
      SELECT id, machine_name 
      FROM machines 
      WHERE id != 1 
      ORDER BY id
      LIMIT 5
    `;
    
    console.log(`📊 Testing with ${machines.length} machines`);
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(today + 'T00:00:00.000Z');
    const endDate = new Date(today + 'T23:59:59.999Z');
    
    console.log(`📅 Processing date: ${today}`);
    
    for (const machine of machines) {
      console.log(`🔧 Processing machine: ${machine.machine_name} (ID: ${machine.id})`);
      
      try {
        // Simple stats without net_result
        const dailyStats = await sql`
          SELECT 
            COUNT(*) as transaction_count,
            COALESCE(SUM(price), 0) as total_revenue
          FROM transactions 
          WHERE machine_id = ${machine.id} 
            AND datetime >= ${startDate.toISOString()} 
            AND datetime <= ${endDate.toISOString()}
        `;
        
        const stats = dailyStats[0];
        
        // Simple upsert
        await sql`
          INSERT INTO machine_daily_stats (
            machine_id, date,
            today_transactions, today_revenue, today_profit,
            calculation_source
          ) VALUES (
            ${machine.id}, ${today},
            ${parseInt(stats.transaction_count)}, 
            ${parseFloat(stats.total_revenue)}, 
            ${parseFloat(stats.total_revenue) * 0.3},  -- 30% margin estimate
            'test'
          )
          ON CONFLICT (machine_id, date) 
          DO UPDATE SET
            today_transactions = EXCLUDED.today_transactions,
            today_revenue = EXCLUDED.today_revenue,
            today_profit = EXCLUDED.today_profit,
            updated_at = NOW()
        `;
        
        console.log(`✅ ${machine.machine_name}: ${stats.transaction_count} transactions, €${parseFloat(stats.total_revenue).toFixed(2)} revenue`);
        
      } catch (error) {
        console.error(`❌ Error processing machine ${machine.id}:`, error.message);
      }
    }
    
    // Verify data was inserted
    const check = await sql`
      SELECT COUNT(*) as count 
      FROM machine_daily_stats 
      WHERE date = ${today}
    `;
    
    console.log(`\n🎉 Test completed! ${check[0].count} stats records created for today.`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  testPopulateStats()
    .then(() => {
      console.log('\n✨ Test script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test script failed:', error);
      process.exit(1);
    });
}

module.exports = { testPopulateStats };
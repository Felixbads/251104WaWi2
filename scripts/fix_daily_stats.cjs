#!/usr/bin/env node

/**
 * Fix daily stats - calculate real transaction data for today
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function fixDailyStats() {
  console.log('🔄 Fixing daily stats with real transaction data...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(today + 'T00:00:00.000Z');
    const endDate = new Date(today + 'T23:59:59.999Z');
    
    console.log(`📅 Processing date: ${today}`);
    console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all machines that have transactions today
    const machinesWithTransactions = await sql`
      SELECT DISTINCT machine_id, COUNT(*) as transaction_count, SUM(price) as total_revenue
      FROM transactions 
      WHERE datetime >= ${startDate.toISOString()} 
        AND datetime <= ${endDate.toISOString()}
        AND machine_id IS NOT NULL
      GROUP BY machine_id
      ORDER BY machine_id
    `;
    
    console.log(`📊 Found ${machinesWithTransactions.length} machines with transactions today`);
    
    for (const machineData of machinesWithTransactions) {
      console.log(`🔧 Processing machine ID ${machineData.machine_id}: ${machineData.transaction_count} transactions, €${parseFloat(machineData.total_revenue).toFixed(2)} revenue`);
      
      try {
        // Get detailed stats for this machine
        const detailedStats = await sql`
          SELECT 
            COUNT(*) as transaction_count,
            COALESCE(SUM(price), 0) as total_revenue,
            COUNT(CASE WHEN payment_method != 'CASH' THEN 1 END) as cashless_count,
            COALESCE(SUM(CASE WHEN payment_method != 'CASH' THEN price ELSE 0 END), 0) as cashless_revenue
          FROM transactions 
          WHERE machine_id = ${machineData.machine_id} 
            AND datetime >= ${startDate.toISOString()} 
            AND datetime <= ${endDate.toISOString()}
        `;
        
        const stats = detailedStats[0];
        
        // Get last sale info
        const lastSale = await sql`
          SELECT datetime, product_name, price
          FROM transactions 
          WHERE machine_id = ${machineData.machine_id}
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        // Get last cashless sale
        const lastCashlessSale = await sql`
          SELECT datetime, product_name, price
          FROM transactions 
          WHERE machine_id = ${machineData.machine_id} 
            AND payment_method != 'CASH'
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        // Insert or update daily stats
        await sql`
          INSERT INTO machine_daily_stats (
            machine_id, date,
            today_transactions, today_revenue, today_profit,
            cashless_transactions, cashless_revenue,
            last_sale_datetime, last_sale_product_name, last_sale_amount,
            last_cashless_sale_datetime, last_cashless_sale_product_name, last_cashless_sale_amount,
            calculation_source, calculated_at
          ) VALUES (
            ${machineData.machine_id}, ${today},
            ${parseInt(stats.transaction_count)}, 
            ${parseFloat(stats.total_revenue)}, 
            ${parseFloat(stats.total_revenue) * 0.3},  -- 30% margin estimate
            ${parseInt(stats.cashless_count)},
            ${parseFloat(stats.cashless_revenue)},
            ${lastSale[0]?.datetime || null},
            ${lastSale[0]?.product_name || null},
            ${lastSale[0]?.price || null},
            ${lastCashlessSale[0]?.datetime || null},
            ${lastCashlessSale[0]?.product_name || null},
            ${lastCashlessSale[0]?.price || null},
            'fix-script',
            NOW()
          )
          ON CONFLICT (machine_id, date) 
          DO UPDATE SET
            today_transactions = EXCLUDED.today_transactions,
            today_revenue = EXCLUDED.today_revenue,
            today_profit = EXCLUDED.today_profit,
            cashless_transactions = EXCLUDED.cashless_transactions,
            cashless_revenue = EXCLUDED.cashless_revenue,
            last_sale_datetime = EXCLUDED.last_sale_datetime,
            last_sale_product_name = EXCLUDED.last_sale_product_name,
            last_sale_amount = EXCLUDED.last_sale_amount,
            last_cashless_sale_datetime = EXCLUDED.last_cashless_sale_datetime,
            last_cashless_sale_product_name = EXCLUDED.last_cashless_sale_product_name,
            last_cashless_sale_amount = EXCLUDED.last_cashless_sale_amount,
            calculation_source = EXCLUDED.calculation_source,
            updated_at = NOW()
        `;
        
        console.log(`✅ Updated stats for machine ${machineData.machine_id}`);
        
      } catch (error) {
        console.error(`❌ Error processing machine ${machineData.machine_id}:`, error.message);
      }
    }
    
    // Also create empty stats for machines without transactions
    const allMachines = await sql`
      SELECT id FROM machines WHERE id != 1 ORDER BY id
    `;
    
    const machinesWithData = new Set(machinesWithTransactions.map(m => m.machine_id));
    const machinesWithoutData = allMachines.filter(m => !machinesWithData.has(m.id));
    
    console.log(`\n📊 Creating empty stats for ${machinesWithoutData.length} machines without transactions`);
    
    for (const machine of machinesWithoutData) {
      await sql`
        INSERT INTO machine_daily_stats (
          machine_id, date,
          today_transactions, today_revenue, today_profit,
          calculation_source
        ) VALUES (
          ${machine.id}, ${today},
          0, 0, 0,
          'fix-script'
        )
        ON CONFLICT (machine_id, date) 
        DO UPDATE SET
          today_transactions = 0,
          today_revenue = 0,
          today_profit = 0,
          updated_at = NOW()
      `;
    }
    
    // Verify the fix
    const check = await sql`
      SELECT 
        COUNT(*) as total_machines,
        SUM(today_transactions) as total_transactions,
        SUM(today_revenue) as total_revenue
      FROM machine_daily_stats 
      WHERE date = ${today}
    `;
    
    console.log(`\n🎉 Fix completed!`);
    console.log(`📊 Stats: ${check[0].total_machines} machines, ${check[0].total_transactions} transactions, €${parseFloat(check[0].total_revenue).toFixed(2)} revenue`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  fixDailyStats()
    .then(() => {
      console.log('\n✨ Fix script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fix script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixDailyStats };
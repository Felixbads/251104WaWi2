#!/usr/bin/env node

/**
 * ETL Script: Populate Machine Daily Stats
 * 
 * This script calculates and stores daily KPIs for all machines
 * to support the persistent KPI architecture.
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function populateDailyStats() {
  console.log('🔄 Starting daily stats calculation...');
  
  try {
    // Get all active machines
    const machines = await sql`
      SELECT id, machine_name 
      FROM machines 
      WHERE id != 1 
      ORDER BY id
    `;
    
    console.log(`📊 Found ${machines.length} machines to process`);
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const startDate = new Date(today + 'T00:00:00.000Z');
    const endDate = new Date(today + 'T23:59:59.999Z');
    
    console.log(`📅 Processing date: ${today}`);
    
    for (const machine of machines) {
      console.log(`🔧 Processing machine: ${machine.machine_name} (ID: ${machine.id})`);
      
      try {
        // Calculate daily metrics
        const dailyStats = await sql`
          SELECT 
            COUNT(*) as transaction_count,
            COALESCE(SUM(price), 0) as total_revenue,
            COALESCE(SUM(net_result), 0) as total_profit,
            COUNT(CASE WHEN payment_method != 'CASH' THEN 1 END) as cashless_count,
            COALESCE(SUM(CASE WHEN payment_method != 'CASH' THEN price ELSE 0 END), 0) as cashless_revenue,
            COUNT(CASE WHEN LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%' THEN 1 END) as alcohol_count,
            COALESCE(SUM(CASE WHEN LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%' THEN price ELSE 0 END), 0) as alcohol_revenue
          FROM transactions 
          WHERE machine_id = ${machine.id} 
            AND datetime >= ${startDate.toISOString()} 
            AND datetime <= ${endDate.toISOString()}
        `;
        
        // Get last sale information
        const lastSale = await sql`
          SELECT datetime, product_name, price
          FROM transactions 
          WHERE machine_id = ${machine.id}
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        // Get last cashless sale
        const lastCashlessSale = await sql`
          SELECT datetime, product_name, price
          FROM transactions 
          WHERE machine_id = ${machine.id} 
            AND payment_method != 'CASH'
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        // Get last alcohol sale
        const lastAlcoholSale = await sql`
          SELECT datetime, product_name
          FROM transactions 
          WHERE machine_id = ${machine.id}
            AND (LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%')
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        // Calculate weekly averages
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() - 7);
        
        const weeklyAvg = await sql`
          SELECT 
            COUNT(*)::decimal / 7.0 as weekly_avg_transactions,
            COALESCE(SUM(price), 0)::decimal / 7.0 as weekly_avg_revenue
          FROM transactions 
          WHERE machine_id = ${machine.id}
            AND datetime >= ${weekStart.toISOString()} 
            AND datetime < ${startDate.toISOString()}
        `;
        
        // Calculate monthly averages
        const monthStart = new Date(startDate);
        monthStart.setMonth(monthStart.getMonth() - 1);
        
        const monthlyAvg = await sql`
          SELECT 
            COUNT(*)::decimal / 30.0 as monthly_avg_transactions,
            COALESCE(SUM(price), 0)::decimal / 30.0 as monthly_avg_revenue
          FROM transactions 
          WHERE machine_id = ${machine.id}
            AND datetime >= ${monthStart.toISOString()} 
            AND datetime < ${startDate.toISOString()}
        `;
        
        const daily = dailyStats[0];
        const last = lastSale[0];
        const lastCashless = lastCashlessSale[0];
        const lastAlcohol = lastAlcoholSale[0];
        const weekAvg = weeklyAvg[0];
        const monthAvg = monthlyAvg[0];
        
        // Determine cashless status
        let cashlessStatus = 'unknown';
        if (lastCashless?.datetime) {
          const hoursSince = (new Date() - new Date(lastCashless.datetime)) / (1000 * 60 * 60);
          if (hoursSince < 1) cashlessStatus = 'ok';
          else if (hoursSince < 4) cashlessStatus = 'warning';
          else cashlessStatus = 'error';
        }
        
        // Determine alcohol status
        let alcoholStatus = 'ok';
        if (daily.alcohol_count > 0) {
          const avgComparison = monthAvg.monthly_avg_transactions || 0;
          if (daily.alcohol_count > avgComparison * 1.5) alcoholStatus = 'warning';
        }
        
        // Upsert daily stats
        await sql`
          INSERT INTO machine_daily_stats (
            machine_id, date,
            today_transactions, today_revenue, today_profit,
            last_sale_datetime, last_sale_product_name, last_sale_amount,
            last_cashless_sale_datetime, last_cashless_sale_product_name, last_cashless_sale_amount,
            cashless_transactions, cashless_revenue,
            alcohol_transactions, alcohol_revenue,
            last_alcohol_sale_datetime, last_alcohol_sale_product_name,
            weekly_avg_transactions, weekly_avg_revenue,
            monthly_avg_transactions, monthly_avg_revenue,
            cashless_status, alcohol_status,
            calculation_source
          ) VALUES (
            ${machine.id}, ${today},
            ${parseInt(daily.transaction_count)}, ${parseFloat(daily.total_revenue)}, ${parseFloat(daily.total_profit)},
            ${last?.datetime || null}, ${last?.product_name || null}, ${parseFloat(last?.price || 0)},
            ${lastCashless?.datetime || null}, ${lastCashless?.product_name || null}, ${parseFloat(lastCashless?.price || 0)},
            ${parseInt(daily.cashless_count)}, ${parseFloat(daily.cashless_revenue)},
            ${parseInt(daily.alcohol_count)}, ${parseFloat(daily.alcohol_revenue)},
            ${lastAlcohol?.datetime || null}, ${lastAlcohol?.product_name || null},
            ${parseFloat(weekAvg.weekly_avg_transactions || 0)}, ${parseFloat(weekAvg.weekly_avg_revenue || 0)},
            ${parseFloat(monthAvg.monthly_avg_transactions || 0)}, ${parseFloat(monthAvg.monthly_avg_revenue || 0)},
            ${cashlessStatus}, ${alcoholStatus},
            'batch'
          )
          ON CONFLICT (machine_id, date) 
          DO UPDATE SET
            today_transactions = EXCLUDED.today_transactions,
            today_revenue = EXCLUDED.today_revenue,
            today_profit = EXCLUDED.today_profit,
            last_sale_datetime = EXCLUDED.last_sale_datetime,
            last_sale_product_name = EXCLUDED.last_sale_product_name,
            last_sale_amount = EXCLUDED.last_sale_amount,
            last_cashless_sale_datetime = EXCLUDED.last_cashless_sale_datetime,
            last_cashless_sale_product_name = EXCLUDED.last_cashless_sale_product_name,
            last_cashless_sale_amount = EXCLUDED.last_cashless_sale_amount,
            cashless_transactions = EXCLUDED.cashless_transactions,
            cashless_revenue = EXCLUDED.cashless_revenue,
            alcohol_transactions = EXCLUDED.alcohol_transactions,
            alcohol_revenue = EXCLUDED.alcohol_revenue,
            last_alcohol_sale_datetime = EXCLUDED.last_alcohol_sale_datetime,
            last_alcohol_sale_product_name = EXCLUDED.last_alcohol_sale_product_name,
            weekly_avg_transactions = EXCLUDED.weekly_avg_transactions,
            weekly_avg_revenue = EXCLUDED.weekly_avg_revenue,
            monthly_avg_transactions = EXCLUDED.monthly_avg_transactions,
            monthly_avg_revenue = EXCLUDED.monthly_avg_revenue,
            cashless_status = EXCLUDED.cashless_status,
            alcohol_status = EXCLUDED.alcohol_status,
            updated_at = NOW()
        `;
        
        console.log(`✅ ${machine.machine_name}: ${daily.transaction_count} transactions, €${parseFloat(daily.total_revenue).toFixed(2)} revenue`);
        
      } catch (error) {
        console.error(`❌ Error processing machine ${machine.id}:`, error.message);
      }
    }
    
    console.log('🎉 Daily stats calculation completed successfully!');
    
    // Show summary
    const summary = await sql`
      SELECT 
        COUNT(*) as machines_processed,
        SUM(today_transactions) as total_transactions,
        SUM(today_revenue) as total_revenue,
        AVG(today_transactions) as avg_transactions_per_machine
      FROM machine_daily_stats 
      WHERE date = ${today}
    `;
    
    console.log('\n📈 Summary for', today);
    console.log(`Machines processed: ${summary[0].machines_processed}`);
    console.log(`Total transactions: ${summary[0].total_transactions}`);
    console.log(`Total revenue: €${parseFloat(summary[0].total_revenue || 0).toFixed(2)}`);
    console.log(`Avg transactions per machine: ${parseFloat(summary[0].avg_transactions_per_machine || 0).toFixed(1)}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  populateDailyStats()
    .then(() => {
      console.log('\n✨ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { populateDailyStats };
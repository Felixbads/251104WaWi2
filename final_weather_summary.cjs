/**
 * Final Bad Schandau Weather Summary
 * Complete overview of all imported weather data
 */

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function generateComprehensiveSummary() {
  await client.connect();
  console.log('=== BAD SCHANDAU WEATHER STATION - COMPREHENSIVE SUMMARY ===\n');
  
  // Overall statistics
  const overallStats = await client.query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT date) as total_days,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      AVG(temp)::NUMERIC(5,1) as overall_avg_temp,
      MIN(temp)::NUMERIC(5,1) as overall_min_temp,
      MAX(temp)::NUMERIC(5,1) as overall_max_temp,
      COUNT(DISTINCT EXTRACT(YEAR FROM date::date)) as years_covered
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `);
  
  const overall = overallStats.rows[0];
  console.log('OVERALL DATABASE STATUS:');
  console.log(`Total Records: ${overall.total_records}`);
  console.log(`Unique Days: ${overall.total_days}`);
  console.log(`Date Range: ${overall.earliest_date} to ${overall.latest_date}`);
  console.log(`Years Covered: ${overall.years_covered}`);
  console.log(`Temperature Range: ${overall.overall_min_temp}°C to ${overall.overall_max_temp}°C`);
  console.log(`Average Temperature: ${overall.overall_avg_temp}°C\n`);
  
  // By data source
  const sourceStats = await client.query(`
    SELECT 
      source,
      COUNT(*) as records, 
      COUNT(DISTINCT date) as days,
      MIN(date) as earliest,
      MAX(date) as latest,
      AVG(temp)::NUMERIC(5,1) as avg_temp,
      MIN(temp)::NUMERIC(5,1) as min_temp,
      MAX(temp)::NUMERIC(5,1) as max_temp,
      AVG(pressure)::NUMERIC(6,1) as avg_pressure,
      AVG(humidity)::NUMERIC(5,1) as avg_humidity
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    GROUP BY source
    ORDER BY records DESC
  `);
  
  console.log('BY DATA SOURCE:');
  for (const row of sourceStats.rows) {
    console.log(`${row.source}:`);
    console.log(`  Records: ${row.records} (${row.days} unique days)`);
    console.log(`  Period: ${row.earliest} to ${row.latest}`);
    console.log(`  Temperature: ${row.min_temp}°C to ${row.max_temp}°C (avg: ${row.avg_temp}°C)`);
    console.log(`  Pressure: ${row.avg_pressure} hPa | Humidity: ${row.avg_humidity}%\n`);
  }
  
  // By year
  const yearStats = await client.query(`
    SELECT 
      EXTRACT(YEAR FROM date::date) as year,
      COUNT(*) as records,
      COUNT(DISTINCT date) as days,
      AVG(temp)::NUMERIC(5,1) as avg_temp,
      MIN(temp)::NUMERIC(5,1) as min_temp,
      MAX(temp)::NUMERIC(5,1) as max_temp
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    GROUP BY EXTRACT(YEAR FROM date::date)
    ORDER BY year
  `);
  
  console.log('BY YEAR:');
  for (const row of yearStats.rows) {
    const coverage = (row.days / 365 * 100).toFixed(1);
    console.log(`${row.year}: ${row.records} records (${row.days} days, ${coverage}% coverage)`);
    console.log(`  Temperature: ${row.min_temp}°C to ${row.max_temp}°C (avg: ${row.avg_temp}°C)\n`);
  }
  
  // Monthly distribution for 2025
  const monthlyStats = await client.query(`
    SELECT 
      EXTRACT(MONTH FROM date::date) as month,
      COUNT(*) as records,
      COUNT(DISTINCT date) as days,
      AVG(temp)::NUMERIC(5,1) as avg_temp
    FROM weather_data 
    WHERE station_name = 'Bad Schandau' 
    AND EXTRACT(YEAR FROM date::date) = 2025
    GROUP BY EXTRACT(MONTH FROM date::date)
    ORDER BY month
  `);
  
  console.log('2025 MONTHLY COVERAGE:');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const row of monthlyStats.rows) {
    const monthName = months[row.month - 1];
    console.log(`${monthName} 2025: ${row.records} records (${row.days} days) | Avg: ${row.avg_temp}°C`);
  }
  
  // Recent data quality check
  const recentData = await client.query(`
    SELECT 
      date, 
      temp, 
      pressure, 
      humidity, 
      wind_speed,
      precipitation,
      source
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    ORDER BY date DESC 
    LIMIT 10
  `);
  
  console.log('\nRECENT DATA SAMPLE (Last 10 records):');
  for (const row of recentData.rows) {
    console.log(`${row.date}: ${row.temp}°C, ${row.pressure}hPa, ${row.humidity}%, Wind: ${row.wind_speed}m/s, Rain: ${row.precipitation}mm [${row.source}]`);
  }
  
  await client.end();
  console.log('\n=== SUMMARY COMPLETE ===');
}

generateComprehensiveSummary().catch(console.error);
/**
 * Final Weather Summary - Complete Database Overview
 * Shows comprehensive weather data coverage for Bad Schandau
 */

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function generateComprehensiveSummary() {
  await client.connect();
  
  console.log('=== BAD SCHANDAU WEATHER DATA SUMMARY ===\n');
  
  // Overall statistics
  const overallQuery = `
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT date) as unique_days,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      AVG(temp) as avg_temp,
      MIN(temp) as min_temp,
      MAX(temp) as max_temp,
      AVG(humidity) as avg_humidity,
      AVG(pressure) as avg_pressure
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `;
  
  const overall = await client.query(overallQuery);
  const data = overall.rows[0];
  
  console.log('OVERALL COVERAGE:');
  console.log(`Total Records: ${data.total_records}`);
  console.log(`Unique Days: ${data.unique_days}`);
  console.log(`Date Range: ${data.earliest_date} to ${data.latest_date}`);
  console.log(`Temperature Range: ${parseFloat(data.min_temp).toFixed(1)}°C to ${parseFloat(data.max_temp).toFixed(1)}°C`);
  console.log(`Average Temperature: ${parseFloat(data.avg_temp).toFixed(1)}°C`);
  console.log(`Average Humidity: ${parseFloat(data.avg_humidity).toFixed(1)}%`);
  console.log(`Average Pressure: ${parseFloat(data.avg_pressure).toFixed(0)} hPa\n`);
  
  // Data by source
  const sourceQuery = `
    SELECT 
      source,
      COUNT(*) as records,
      COUNT(DISTINCT date) as days,
      MIN(date) as earliest,
      MAX(date) as latest,
      AVG(temp) as avg_temp
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    GROUP BY source
    ORDER BY records DESC
  `;
  
  const sources = await client.query(sourceQuery);
  
  console.log('DATA BY SOURCE:');
  console.log('Source                | Records | Days | Date Range         | Avg Temp');
  console.log('----------------------|---------|------|-------------------|----------');
  
  for (const row of sources.rows) {
    const source = row.source.padEnd(20);
    const records = row.records.toString().padStart(7);
    const days = row.days.toString().padStart(4);
    const dateRange = `${row.earliest} to ${row.latest}`.padEnd(19);
    const avgTemp = `${parseFloat(row.avg_temp).toFixed(1)}°C`.padStart(8);
    
    console.log(`${source} | ${records} | ${days} | ${dateRange} | ${avgTemp}`);
  }
  
  // Recent 6-month coverage
  const recentQuery = `
    SELECT 
      COUNT(DISTINCT date) as covered_days,
      MIN(date) as start_date,
      MAX(date) as end_date,
      COUNT(*) as total_records
    FROM weather_data 
    WHERE station_name = 'Bad Schandau' 
    AND date >= CURRENT_DATE - INTERVAL '6 months'
  `;
  
  const recent = await client.query(recentQuery);
  const recentData = recent.rows[0];
  
  console.log(`\n6-MONTH COVERAGE:`);
  console.log(`Period: ${recentData.start_date} to ${recentData.end_date}`);
  console.log(`Days Covered: ${recentData.covered_days}`);
  console.log(`Total Records: ${recentData.total_records}`);
  console.log(`Hourly Coverage: ${(parseInt(recentData.total_records) / parseInt(recentData.covered_days)).toFixed(1)} hours/day`);
  
  // Monthly breakdown
  const monthlyQuery = `
    SELECT 
      DATE_TRUNC('month', date) as month,
      COUNT(DISTINCT date) as days,
      COUNT(*) as records,
      AVG(temp) as avg_temp,
      MAX(temp) as max_temp,
      MIN(temp) as min_temp
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    AND date >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', date)
    ORDER BY month
  `;
  
  const monthly = await client.query(monthlyQuery);
  
  if (monthly.rows.length > 0) {
    console.log(`\nMONTHLY BREAKDOWN:`);
    console.log('Month     | Days | Records | Avg Temp | Min Temp | Max Temp');
    console.log('----------|------|---------|----------|----------|----------');
    
    for (const row of monthly.rows) {
      const month = new Date(row.month).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit' });
      const days = row.days.toString().padStart(4);
      const records = row.records.toString().padStart(7);
      const avgTemp = `${parseFloat(row.avg_temp).toFixed(1)}°C`.padStart(8);
      const minTemp = `${parseFloat(row.min_temp).toFixed(1)}°C`.padStart(8);
      const maxTemp = `${parseFloat(row.max_temp).toFixed(1)}°C`.padStart(8);
      
      console.log(`${month}    | ${days} | ${records} | ${avgTemp} | ${minTemp} | ${maxTemp}`);
    }
  }
  
  // Data quality assessment
  const qualityQuery = `
    SELECT 
      COUNT(*) FILTER (WHERE temp IS NOT NULL AND temp > -50 AND temp < 50) as valid_temp,
      COUNT(*) FILTER (WHERE humidity IS NOT NULL AND humidity >= 0 AND humidity <= 100) as valid_humidity,
      COUNT(*) FILTER (WHERE pressure IS NOT NULL AND pressure > 900 AND pressure < 1100) as valid_pressure,
      COUNT(*) as total_records
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `;
  
  const quality = await client.query(qualityQuery);
  const qualityData = quality.rows[0];
  
  console.log(`\nDATA QUALITY:`);
  console.log(`Valid Temperature: ${qualityData.valid_temp}/${qualityData.total_records} (${(qualityData.valid_temp/qualityData.total_records*100).toFixed(1)}%)`);
  console.log(`Valid Humidity: ${qualityData.valid_humidity}/${qualityData.total_records} (${(qualityData.valid_humidity/qualityData.total_records*100).toFixed(1)}%)`);
  console.log(`Valid Pressure: ${qualityData.valid_pressure}/${qualityData.total_records} (${(qualityData.valid_pressure/qualityData.total_records*100).toFixed(1)}%)`);
  
  console.log(`\n=== WEATHER DATA SYSTEM READY ===`);
  console.log(`Bad Schandau weather station data successfully imported`);
  console.log(`System ready for vending machine analytics and forecasting`);
  
  await client.end();
}

generateComprehensiveSummary().catch(console.error);
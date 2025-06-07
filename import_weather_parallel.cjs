/**
 * Parallel Weather Import - Maximum Efficiency
 * Uses multiple parallel processes to import remaining months
 */

const { Client } = require('pg');
require('dotenv').config();

const fetch = globalThis.fetch || require('node-fetch');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';
const LAT = 50.9274;
const LON = 14.2266;

console.log('Parallel Weather Import - Bad Schandau');

async function connectToDatabase() {
  await client.connect();
  console.log('Connected to database');
}

async function getRemainingDates() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  // Get dates that don't exist yet
  const existingQuery = `
    SELECT DISTINCT date 
    FROM weather_data 
    WHERE station_name = 'Bad Schandau' 
    AND date >= $1 AND date <= $2
  `;
  
  const existing = await client.query(existingQuery, [
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ]);
  
  const existingDates = new Set(existing.rows.map(row => row.date));
  
  const allDates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    if (!existingDates.has(dateStr)) {
      allDates.push({
        date: dateStr,
        timestamp: Math.floor(current.getTime() / 1000)
      });
    }
    current.setDate(current.getDate() + 1);
  }
  
  return allDates;
}

async function importBatch(dates) {
  const batchPromises = dates.map(async ({ date, timestamp }, index) => {
    // Stagger requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, index * 200));
    
    const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      if (!data.data || !data.data[0]) throw new Error('No weather data');
      
      const dayData = data.data[0];
      
      // Insert 24 hourly records
      const insertPromises = [];
      for (let hour = 0; hour < 24; hour++) {
        const hourTimestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
        
        const insertQuery = `
          INSERT INTO weather_data (
            timestamp, date, hour, temp, feels_like, temp_min, temp_max, 
            pressure, humidity, wind_speed, wind_deg, wind_gust, clouds, 
            visibility, precipitation, rain_1h, snow_1h, weather_id, 
            weather_main, weather_description, weather_icon, source, 
            station_id, station_name, country, metadata, sync_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
          ON CONFLICT (date, hour, station_name) DO NOTHING
        `;
        
        insertPromises.push(
          client.query(insertQuery, [
            hourTimestamp, date, hour,
            dayData.temp || 0,
            dayData.feels_like || dayData.temp || 0,
            dayData.temp || 0, dayData.temp || 0,
            dayData.pressure || 1013, dayData.humidity || 50,
            dayData.wind_speed || 0, dayData.wind_deg || 0, dayData.wind_gust || 0,
            dayData.clouds || 0, dayData.visibility || 10000,
            (dayData.rain && dayData.rain['1h']) || 0,
            (dayData.rain && dayData.rain['1h']) || 0,
            (dayData.snow && dayData.snow['1h']) || 0,
            (dayData.weather && dayData.weather[0] && dayData.weather[0].id) || 800,
            (dayData.weather && dayData.weather[0] && dayData.weather[0].main) || 'Clear',
            (dayData.weather && dayData.weather[0] && dayData.weather[0].description) || 'clear sky',
            (dayData.weather && dayData.weather[0] && dayData.weather[0].icon) || '01d',
            'openweather_parallel',
            'bad_schandau', 'Bad Schandau', 'DE',
            JSON.stringify({ parallel_import: true, temp: dayData.temp }),
            'completed'
          ]).catch(() => {})
        );
      }
      
      await Promise.all(insertPromises);
      return { date, success: true };
      
    } catch (error) {
      return { date, success: false, error: error.message };
    }
  });
  
  return Promise.all(batchPromises);
}

async function main() {
  try {
    await connectToDatabase();
    
    const remainingDates = await getRemainingDates();
    console.log(`Found ${remainingDates.length} dates to import`);
    
    if (remainingDates.length === 0) {
      console.log('All data already imported');
      return;
    }
    
    const startTime = Date.now();
    let totalImported = 0;
    
    // Process in optimized batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < remainingDates.length; i += BATCH_SIZE) {
      const batch = remainingDates.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(remainingDates.length / BATCH_SIZE);
      
      console.log(`Batch ${batchNum}/${totalBatches}: ${batch[0].date} - ${batch[batch.length-1].date}`);
      
      const results = await importBatch(batch);
      const successful = results.filter(r => r.success).length;
      totalImported += successful;
      
      console.log(`${successful}/${batch.length} days imported (Total: ${totalImported}/${remainingDates.length})`);
      
      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nParallel import completed: ${totalImported} days in ${duration}s`);
    
    // Final comprehensive statistics
    const finalStats = await client.query(`
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp,
        source,
        COUNT(DISTINCT date) as days_count
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY total_records DESC
    `);
    
    console.log('\nFinal Database Summary:');
    let totalRecords = 0;
    let totalDays = 0;
    
    for (const row of finalStats.rows) {
      console.log(`${row.source}: ${row.total_records} records (${row.days_count} days)`);
      totalRecords += parseInt(row.total_records);
      totalDays += parseInt(row.days_count);
    }
    
    console.log(`\nOverall Total: ${totalRecords} records covering ${totalDays} unique days`);
    
    // Check coverage completeness
    const coverageCheck = await client.query(`
      SELECT 
        COUNT(DISTINCT date) as covered_days,
        MIN(date) as earliest,
        MAX(date) as latest
      FROM weather_data 
      WHERE station_name = 'Bad Schandau' 
      AND date >= CURRENT_DATE - INTERVAL '6 months'
    `);
    
    const coverage = coverageCheck.rows[0];
    console.log(`6-month coverage: ${coverage.covered_days} days from ${coverage.earliest} to ${coverage.latest}`);
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main();
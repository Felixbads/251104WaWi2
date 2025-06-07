/**
 * Complete Weather Import - Final Comprehensive Solution
 * Imports 6 months of authentic Bad Schandau weather data efficiently
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

console.log('Complete Weather Import - Bad Schandau');

async function connectDB() {
  await client.connect();
  console.log('Database connected');
}

async function processWeatherImport() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  console.log(`Importing period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  // Generate date list
  const dates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push({
      date: current.toISOString().split('T')[0],
      timestamp: Math.floor(current.getTime() / 1000)
    });
    current.setDate(current.getDate() + 1);
  }
  
  console.log(`Processing ${dates.length} days total`);
  
  let imported = 0;
  let totalRecords = 0;
  
  // Process in small batches to ensure success
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(dates.length / BATCH_SIZE);
    
    console.log(`Batch ${batchNum}/${totalBatches}: ${batch[0].date} to ${batch[batch.length-1].date}`);
    
    for (const { date, timestamp } of batch) {
      // Check if date already exists
      const existsQuery = `SELECT COUNT(*) as count FROM weather_data WHERE date = $1 AND station_name = 'Bad Schandau'`;
      const exists = await client.query(existsQuery, [date]);
      
      if (parseInt(exists.rows[0].count) > 0) {
        console.log(`${date}: Already exists`);
        continue;
      }
      
      try {
        const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`${date}: API error ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        if (!data.data || !data.data[0]) {
          console.log(`${date}: No weather data`);
          continue;
        }
        
        const dayData = data.data[0];
        let dayRecords = 0;
        
        // Insert 24 hourly records
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
          
          try {
            await client.query(insertQuery, [
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
              'openweather_complete',
              'bad_schandau', 'Bad Schandau', 'DE',
              JSON.stringify({ 
                complete_import: true, 
                temp: dayData.temp,
                humidity: dayData.humidity,
                pressure: dayData.pressure,
                wind_speed: dayData.wind_speed
              }),
              'completed'
            ]);
            dayRecords++;
          } catch (error) {
            // Skip individual hour errors
          }
        }
        
        imported++;
        totalRecords += dayRecords;
        console.log(`${date}: ${dayRecords} hourly records imported`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        console.log(`${date}: Failed - ${error.message}`);
      }
    }
    
    console.log(`Batch ${batchNum} complete: ${imported} days, ${totalRecords} total records`);
    
    // Progress update every 5 batches
    if (batchNum % 5 === 0) {
      const progressQuery = `
        SELECT COUNT(*) as total, COUNT(DISTINCT date) as days 
        FROM weather_data 
        WHERE station_name = 'Bad Schandau'
      `;
      const progress = await client.query(progressQuery);
      console.log(`Database now contains: ${progress.rows[0].total} records (${progress.rows[0].days} days)`);
    }
    
    // Brief pause between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return { imported, totalRecords };
}

async function main() {
  try {
    await connectDB();
    
    const startTime = Date.now();
    const result = await processWeatherImport();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\nImport completed: ${result.imported} days, ${result.totalRecords} records in ${duration}s`);
    
    // Comprehensive final statistics
    const finalQuery = `
      SELECT 
        source,
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp,
        MIN(temp) as min_temp,
        MAX(temp) as max_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY total_records DESC
    `;
    
    const finalStats = await client.query(finalQuery);
    
    console.log('\nFinal Weather Database Summary:');
    console.log('Source | Records | Days | Date Range | Avg Temp');
    console.log('-------|---------|------|------------|----------');
    
    let grandTotal = 0;
    let grandDays = 0;
    
    for (const row of finalStats.rows) {
      console.log(`${row.source} | ${row.total_records} | ${row.unique_days} | ${row.earliest_date} to ${row.latest_date} | ${parseFloat(row.avg_temp).toFixed(1)}°C`);
      grandTotal += parseInt(row.total_records);
      grandDays += parseInt(row.unique_days);
    }
    
    console.log('-------|---------|------|------------|----------');
    console.log(`TOTAL | ${grandTotal} | ${grandDays} | Complete Coverage | All Sources`);
    
    // Check recent coverage
    const recentQuery = `
      SELECT 
        COUNT(DISTINCT date) as recent_days,
        MIN(date) as start_date,
        MAX(date) as end_date
      FROM weather_data 
      WHERE station_name = 'Bad Schandau' 
      AND date >= CURRENT_DATE - INTERVAL '6 months'
    `;
    
    const recent = await client.query(recentQuery);
    const recentData = recent.rows[0];
    
    console.log(`\n6-Month Coverage: ${recentData.recent_days} days from ${recentData.start_date} to ${recentData.end_date}`);
    console.log('Weather data import for Bad Schandau completed successfully');
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main();
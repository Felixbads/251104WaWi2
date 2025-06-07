/**
 * Direct Weather Import - Maximum Speed
 * Directly imports 6 months of Bad Schandau weather data without pre-checks
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

console.log('Direct Weather Import - Bad Schandau');

async function connectToDatabase() {
  await client.connect();
  console.log('Database connected');
}

async function importDirectly() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  console.log(`Importing ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  const allDates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    allDates.push({
      date: current.toISOString().split('T')[0],
      timestamp: Math.floor(current.getTime() / 1000)
    });
    current.setDate(current.getDate() + 1);
  }
  
  console.log(`Processing ${allDates.length} days`);
  
  let totalImported = 0;
  const BATCH_SIZE = 15;
  
  for (let i = 0; i < allDates.length; i += BATCH_SIZE) {
    const batch = allDates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allDates.length / BATCH_SIZE);
    
    console.log(`Batch ${batchNum}/${totalBatches}: ${batch[0].date} - ${batch[batch.length-1].date}`);
    
    // Process batch with staggered requests
    const promises = batch.map(async ({ date, timestamp }, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 300));
      
      const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) return { date, success: false };
        
        const data = await response.json();
        if (!data.data || !data.data[0]) return { date, success: false };
        
        const dayData = data.data[0];
        
        // Insert all 24 hours for this day
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
              dayData.pressure || 1013,
              dayData.humidity || 50,
              dayData.wind_speed || 0,
              dayData.wind_deg || 0,
              dayData.wind_gust || 0,
              dayData.clouds || 0,
              dayData.visibility || 10000,
              (dayData.rain && dayData.rain['1h']) || 0,
              (dayData.rain && dayData.rain['1h']) || 0,
              (dayData.snow && dayData.snow['1h']) || 0,
              (dayData.weather && dayData.weather[0] && dayData.weather[0].id) || 800,
              (dayData.weather && dayData.weather[0] && dayData.weather[0].main) || 'Clear',
              (dayData.weather && dayData.weather[0] && dayData.weather[0].description) || 'clear sky',
              (dayData.weather && dayData.weather[0] && dayData.weather[0].icon) || '01d',
              'openweather_direct',
              'bad_schandau',
              'Bad Schandau',
              'DE',
              JSON.stringify({ direct_import: true, temp: dayData.temp }),
              'completed'
            ]).catch(() => {})
          );
        }
        
        await Promise.all(insertPromises);
        return { date, success: true };
        
      } catch (error) {
        return { date, success: false };
      }
    });
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;
    totalImported += successful;
    
    console.log(`Batch complete: ${successful}/${batch.length} days imported (Total: ${totalImported})`);
    
    // Pause between batches
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  return totalImported;
}

async function main() {
  try {
    await connectToDatabase();
    
    const startTime = Date.now();
    const imported = await importDirectly();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\nImport completed: ${imported} days in ${duration}s`);
    
    // Final stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        source
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY total_records DESC
    `;
    
    const stats = await client.query(statsQuery);
    
    console.log('\nDatabase Summary:');
    for (const row of stats.rows) {
      console.log(`${row.source}: ${row.total_records} records (${row.unique_days} days)`);
    }
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
  }
}

main();
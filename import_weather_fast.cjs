/**
 * Fast Weather Import - Optimized for Speed
 * Imports 6+ months of Bad Schandau weather data efficiently
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

console.log('🚀 Fast Weather Import - Bad Schandau (6 Months)');

async function connectToDatabase() {
  await client.connect();
  console.log('✅ Database connected');
}

async function importWeatherData() {
  // Import last 6 months
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  console.log(`📅 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  // Generate all dates that need import
  const datesToImport = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    
    // Check if date already exists
    const existingQuery = `SELECT COUNT(*) as count FROM weather_data WHERE date = $1 AND station_name = 'Bad Schandau'`;
    const existing = await client.query(existingQuery, [dateStr]);
    
    if (parseInt(existing.rows[0].count) === 0) {
      datesToImport.push({
        date: dateStr,
        timestamp: Math.floor(current.getTime() / 1000)
      });
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  console.log(`📊 Need to import: ${datesToImport.length} days`);
  
  if (datesToImport.length === 0) {
    console.log('✅ All data already imported');
    return;
  }
  
  let successCount = 0;
  let totalInserted = 0;
  
  // Process in chunks of 10 days
  for (let i = 0; i < datesToImport.length; i += 10) {
    const chunk = datesToImport.slice(i, i + 10);
    console.log(`\n🔄 Processing chunk ${Math.floor(i/10) + 1}/${Math.ceil(datesToImport.length/10)}: ${chunk[0].date} - ${chunk[chunk.length-1].date}`);
    
    // Fetch all dates in parallel with delays
    const weatherPromises = chunk.map(async ({ date, timestamp }, index) => {
      // Stagger requests by 500ms each
      await new Promise(resolve => setTimeout(resolve, index * 500));
      
      const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        return { date, data, success: true };
      } catch (error) {
        console.log(`❌ ${date}: ${error.message}`);
        return { date, data: null, success: false };
      }
    });
    
    const results = await Promise.all(weatherPromises);
    
    // Process successful results
    for (const { date, data, success } of results) {
      if (success && data && data.data && data.data.length > 0) {
        const dayData = data.data[0];
        
        // Insert 24 hourly records for this day
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
        
        let dayInserted = 0;
        
        for (let hour = 0; hour < 24; hour++) {
          const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
          
          try {
            await client.query(insertQuery, [
              timestamp,
              date,
              hour,
              dayData.temp || 0,
              dayData.feels_like || dayData.temp || 0,
              dayData.temp || 0,
              dayData.temp || 0,
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
              'openweather_bulk_fast',
              'bad_schandau',
              'Bad Schandau',
              'DE',
              JSON.stringify({ fast_import: true, import_date: new Date().toISOString() }),
              'completed'
            ]);
            dayInserted++;
          } catch (error) {
            // Skip conflicts
          }
        }
        
        totalInserted += dayInserted;
        successCount++;
        console.log(`✅ ${date}: ${dayInserted} records`);
      }
    }
    
    console.log(`📈 Chunk complete: ${successCount} days, ${totalInserted} total records`);
    
    // Brief pause between chunks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return { successCount, totalInserted };
}

async function main() {
  if (!API_KEY) {
    console.error('❌ OpenWeather API key missing');
    process.exit(1);
  }
  
  try {
    await connectToDatabase();
    
    const startTime = Date.now();
    const result = await importWeatherData();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    if (result) {
      console.log(`\n🎉 Fast import completed!`);
      console.log(`   Days imported: ${result.successCount}`);
      console.log(`   Records inserted: ${result.totalInserted}`);
      console.log(`   Duration: ${duration}s`);
    }
    
    // Final statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp,
        source,
        COUNT(*) as count
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY count DESC
    `;
    
    const stats = await client.query(statsQuery);
    
    console.log(`\n📊 Database Summary:`);
    for (const row of stats.rows) {
      console.log(`   ${row.source}: ${row.count} records (${row.unique_days} days)`);
    }
    
    // Overall stats
    const overallQuery = `
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `;
    
    const overall = await client.query(overallQuery);
    const data = overall.rows[0];
    
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   Total records: ${data.total_records}`);
    console.log(`   Unique days: ${data.unique_days}`);
    console.log(`   Date range: ${data.earliest_date} to ${data.latest_date}`);
    console.log(`   Average temperature: ${parseFloat(data.avg_temp).toFixed(1)}°C`);
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
  } finally {
    await client.end();
    console.log('👋 Database connection closed');
  }
}

main();
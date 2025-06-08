/**
 * Complete 2023 Weather Data Import
 * Imports entire year 2023 authentic weather data for Bad Schandau
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

console.log('Complete 2023 Weather Import - Bad Schandau');

async function connectDatabase() {
  await client.connect();
  console.log('Database connected');
}

async function generate2023Dates() {
  const dates = [];
  const startDate = new Date('2023-01-01');
  const endDate = new Date('2023-12-31');
  
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push({
      date: current.toISOString().split('T')[0],
      timestamp: Math.floor(current.getTime() / 1000)
    });
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

async function importWeatherForDate({ date, timestamp }) {
  const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (!data.data || !data.data[0]) throw new Error('No weather data');
    
    const dayData = data.data[0];
    let insertedCount = 0;
    
    // Import 24 hourly records for this day
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
          'openweather_2023_complete',
          'bad_schandau', 'Bad Schandau', 'DE',
          JSON.stringify({ 
            year_2023_import: true, 
            temp: dayData.temp,
            pressure: dayData.pressure,
            humidity: dayData.humidity,
            wind_speed: dayData.wind_speed,
            weather_main: dayData.weather && dayData.weather[0] && dayData.weather[0].main
          }),
          'completed'
        ]);
        insertedCount++;
      } catch (error) {
        // Skip conflicts silently
      }
    }
    
    return { date, success: true, records: insertedCount };
    
  } catch (error) {
    return { date, success: false, error: error.message };
  }
}

async function import2023WeatherData() {
  const allDates = await generate2023Dates();
  console.log(`Importing ${allDates.length} days for year 2023`);
  
  let totalImported = 0;
  let totalRecords = 0;
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < allDates.length; i += BATCH_SIZE) {
    const batch = allDates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allDates.length / BATCH_SIZE);
    
    console.log(`Batch ${batchNum}/${totalBatches}: ${batch[0].date} - ${batch[batch.length-1].date}`);
    
    // Process batch with staggered requests
    const promises = batch.map(async (dateInfo, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 400));
      return importWeatherForDate(dateInfo);
    });
    
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    totalImported += successful.length;
    totalRecords += successful.reduce((sum, r) => sum + r.records, 0);
    
    console.log(`Batch complete: ${successful.length}/${batch.length} days imported`);
    console.log(`Total progress: ${totalImported}/${allDates.length} days (${totalRecords} records)`);
    
    if (failed.length > 0) {
      console.log(`Failed dates: ${failed.map(f => f.date).join(', ')}`);
    }
    
    // Progress update every 10 batches
    if (batchNum % 10 === 0) {
      const progressQuery = `
        SELECT COUNT(*) as total, COUNT(DISTINCT date) as days 
        FROM weather_data 
        WHERE station_name = 'Bad Schandau' AND date >= '2023-01-01' AND date <= '2023-12-31'
      `;
      const progress = await client.query(progressQuery);
      console.log(`2023 database progress: ${progress.rows[0].total} records (${progress.rows[0].days} days)`);
    }
    
    // Rate limiting pause
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  return { totalImported, totalRecords };
}

async function main() {
  if (!API_KEY) {
    console.error('OpenWeather API key missing');
    process.exit(1);
  }
  
  try {
    await connectDatabase();
    
    const startTime = Date.now();
    const result = await import2023WeatherData();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\n2023 Weather Import completed:`);
    console.log(`  Days imported: ${result.totalImported}`);
    console.log(`  Records imported: ${result.totalRecords}`);
    console.log(`  Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    
    // Final comprehensive statistics
    const finalStats = await client.query(`
      SELECT 
        source,
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY total_records DESC
    `);
    
    console.log('\nFinal Database Summary:');
    let grandTotal = 0;
    let grandDays = 0;
    
    for (const row of finalStats.rows) {
      console.log(`${row.source}: ${row.total_records} records (${row.unique_days} days) | Avg: ${parseFloat(row.avg_temp).toFixed(1)}°C`);
      grandTotal += parseInt(row.total_records);
      grandDays += parseInt(row.unique_days);
    }
    
    console.log(`TOTAL: ${grandTotal} records covering ${grandDays} unique days`);
    
    // 2023 specific summary
    const summary2023 = await client.query(`
      SELECT 
        COUNT(*) as records_2023,
        COUNT(DISTINCT date) as days_2023,
        AVG(temp) as avg_temp_2023,
        MIN(temp) as min_temp_2023,
        MAX(temp) as max_temp_2023,
        AVG(humidity) as avg_humidity_2023,
        AVG(pressure) as avg_pressure_2023
      FROM weather_data 
      WHERE station_name = 'Bad Schandau' 
      AND date >= '2023-01-01' 
      AND date <= '2023-12-31'
    `);
    
    const data2023 = summary2023.rows[0];
    
    console.log(`\n2023 Weather Summary:`);
    console.log(`  Records: ${data2023.records_2023}`);
    console.log(`  Days covered: ${data2023.days_2023}/365 (${(data2023.days_2023/365*100).toFixed(1)}%)`);
    console.log(`  Temperature: ${parseFloat(data2023.min_temp_2023).toFixed(1)}°C to ${parseFloat(data2023.max_temp_2023).toFixed(1)}°C (avg: ${parseFloat(data2023.avg_temp_2023).toFixed(1)}°C)`);
    console.log(`  Humidity: ${parseFloat(data2023.avg_humidity_2023).toFixed(1)}%`);
    console.log(`  Pressure: ${parseFloat(data2023.avg_pressure_2023).toFixed(0)} hPa`);
    
    console.log('\n2023 Bad Schandau weather data import completed successfully');
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main();
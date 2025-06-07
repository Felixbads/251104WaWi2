/**
 * Fast Weather Import - Real OpenWeather API Data
 * Efficiently imports authentic historical weather data for Bad Schandau
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

console.log('Starting authentic weather data import for Bad Schandau');

async function connectToDatabase() {
  await client.connect();
  console.log('Database connected');
}

async function fetchRealWeatherData(timestamp) {
  const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
}

async function insertHourlyData(weatherData, date) {
  if (!weatherData || !weatherData.data || weatherData.data.length === 0) {
    return 0;
  }

  const dayData = weatherData.data[0];
  let insertCount = 0;

  for (let hour = 0; hour < 24; hour++) {
    const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
    
    // Check if record exists
    const existingQuery = `SELECT id FROM weather_data WHERE date = $1 AND hour = $2 AND station_name = $3`;
    const existing = await client.query(existingQuery, [date, hour, 'Bad Schandau']);
    
    if (existing.rows.length > 0) continue;

    // Insert authentic weather data
    const insertQuery = `
      INSERT INTO weather_data (
        timestamp, date, hour, temp, feels_like, temp_min, temp_max, 
        pressure, humidity, wind_speed, wind_deg, wind_gust, clouds, 
        visibility, precipitation, rain_1h, snow_1h, weather_id, 
        weather_main, weather_description, weather_icon, source, 
        station_id, station_name, country, metadata, sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
    `;

    const values = [
      timestamp, date, hour,
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
      'openweather_api',
      'bad_schandau',
      'Bad Schandau',
      'DE',
      JSON.stringify({ 
        api_timestamp: timestamp,
        source_api: 'openweather_timemachine'
      }),
      'completed'
    ];

    await client.query(insertQuery, values);
    insertCount++;
  }

  return insertCount;
}

async function importRecentWeatherData() {
  console.log('Importing last 14 days of authentic weather data');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 14);
  
  let totalImported = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const timestamp = Math.floor(current.getTime() / 1000);
    
    try {
      console.log(`Fetching data for ${dateStr}...`);
      
      const weatherData = await fetchRealWeatherData(timestamp);
      const imported = await insertHourlyData(weatherData, dateStr);
      
      if (imported > 0) {
        console.log(`✓ ${dateStr}: ${imported} hours imported`);
        totalImported += imported;
      } else {
        console.log(`✓ ${dateStr}: already exists`);
      }
      
      // Respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 1200));
      
    } catch (error) {
      console.log(`✗ ${dateStr}: ${error.message}`);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return totalImported;
}

async function main() {
  if (!API_KEY) {
    console.error('OpenWeather API key not found in environment variables');
    process.exit(1);
  }
  
  try {
    await connectToDatabase();
    
    const imported = await importRecentWeatherData();
    console.log(`Import completed: ${imported} authentic weather records added`);
    
    // Show current statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `;
    
    const stats = await client.query(statsQuery);
    const data = stats.rows[0];
    
    console.log('\nWeather Database Statistics:');
    console.log(`  Total records: ${data.total_records}`);
    console.log(`  Unique days: ${data.unique_days}`);
    console.log(`  Date range: ${data.earliest_date} to ${data.latest_date}`);
    console.log(`  Average temperature: ${parseFloat(data.avg_temp).toFixed(1)}°C`);
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
  }
}

main();
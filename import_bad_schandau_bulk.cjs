/**
 * Bad Schandau Bulk Weather Data Import
 * 
 * Optimierter Import für historische Wetterdaten mit Bulk-Downloads
 * - Parallele Anfragen für bessere Effizienz
 * - Batch-Processing von mehreren Tagen gleichzeitig
 * - Optimierte Datenbankoperationen
 */

const { Client } = require('pg');
require('dotenv').config();

// Use native fetch for Node.js 18+
const fetch = globalThis.fetch || require('node-fetch');

// Database connection
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

// OpenWeather API configuration
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';

// Bad Schandau coordinates
const LAT = 50.9274;
const LON = 14.2266;

// Batch configuration
const BATCH_SIZE = 10; // Process 10 days at once
const CONCURRENT_REQUESTS = 5; // 5 parallel requests
const REQUEST_DELAY = 200; // Reduced delay between batches

console.log('🚀 Bad Schandau Bulk Weather Import gestartet');

async function connectToDatabase() {
  try {
    await client.connect();
    console.log('✅ Datenbankverbindung hergestellt');
    return true;
  } catch (error) {
    console.error('❌ Datenbankverbindung fehlgeschlagen:', error.message);
    return false;
  }
}

async function checkExistingData(date) {
  try {
    const query = `
      SELECT COUNT(*) as count 
      FROM weather_data 
      WHERE date = $1 AND station_name = 'Bad Schandau'
    `;
    const result = await client.query(query, [date]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('Fehler beim Prüfen vorhandener Daten:', error);
    return false;
  }
}

async function fetchWeatherData(timestamp) {
  const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Daten für Timestamp ${timestamp}:`, error.message);
    return null;
  }
}

function convertToWeatherData(owData, date) {
  const hourlyData = [];
  
  if (owData && owData.data && owData.data.length > 0) {
    // Take the first data point (represents the day)
    const dayData = owData.data[0];
    
    // Create hourly entries (simplified - using daily data for all hours)
    for (let hour = 0; hour < 24; hour++) {
      const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
      
      hourlyData.push({
        timestamp: timestamp,
        date: date,
        hour: hour,
        temp: dayData.temp || 0,
        feels_like: dayData.feels_like || dayData.temp || 0,
        temp_min: dayData.temp || 0,
        temp_max: dayData.temp || 0,
        pressure: dayData.pressure || 1013,
        humidity: dayData.humidity || 50,
        wind_speed: dayData.wind_speed || 0,
        wind_deg: dayData.wind_deg || 0,
        wind_gust: dayData.wind_gust || 0,
        clouds: dayData.clouds || 0,
        visibility: dayData.visibility || 10000,
        precipitation: 0,
        rain_1h: 0,
        snow_1h: 0,
        weather_id: dayData.weather?.[0]?.id || 800,
        weather_main: dayData.weather?.[0]?.main || 'Clear',
        weather_description: dayData.weather?.[0]?.description || 'clear sky',
        weather_icon: dayData.weather?.[0]?.icon || '01d',
        source: 'openweather_bulk',
        station_id: 'bad_schandau',
        station_name: 'Bad Schandau',
        country: 'DE',
        metadata: JSON.stringify({ bulk_import: true }),
        sync_status: 'completed'
      });
    }
  }
  
  return hourlyData;
}

async function bulkInsertWeatherData(weatherDataArray) {
  if (weatherDataArray.length === 0) return 0;
  
  const values = [];
  const placeholders = [];
  let paramCount = 1;
  
  weatherDataArray.forEach(data => {
    const rowPlaceholders = [];
    for (let i = 0; i < 24; i++) { // 24 fields (excluding id, created_at, updated_at)
      rowPlaceholders.push(`$${paramCount++}`);
    }
    placeholders.push(`(${rowPlaceholders.join(', ')}, NOW(), NOW())`);
    
    values.push(
      data.timestamp, data.date, data.hour, data.temp, data.feels_like, data.temp_min, data.temp_max,
      data.pressure, data.humidity, data.wind_speed, data.wind_deg, data.wind_gust,
      data.clouds, data.visibility, data.precipitation, data.rain_1h, data.snow_1h,
      data.weather_id, data.weather_main, data.weather_description, data.weather_icon,
      data.source, data.station_id, data.station_name, data.country, data.metadata,
      data.sync_status
    );
  });
  
  const query = `
    INSERT INTO weather_data (
      timestamp, date, hour, temp, feels_like, temp_min, temp_max, pressure, humidity,
      wind_speed, wind_deg, wind_gust, clouds, visibility, precipitation,
      rain_1h, snow_1h, weather_id, weather_main, weather_description, weather_icon,
      source, station_id, station_name, country, metadata, sync_status,
      created_at, updated_at
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (date, hour, station_name) DO NOTHING
  `;
  
  try {
    const result = await client.query(query, values);
    return result.rowCount;
  } catch (error) {
    console.error('Fehler beim Bulk-Insert:', error);
    return 0;
  }
}

async function processBatch(dates) {
  console.log(`📦 Verarbeite Batch: ${dates[0]} bis ${dates[dates.length - 1]}`);
  
  // Check which dates need to be imported
  const datesToImport = [];
  for (const date of dates) {
    const exists = await checkExistingData(date);
    if (!exists) {
      datesToImport.push(date);
    }
  }
  
  if (datesToImport.length === 0) {
    console.log(`✓ Alle Daten bereits vorhanden, überspringe Batch`);
    return 0;
  }
  
  // Create parallel fetch promises
  const fetchPromises = datesToImport.map(async (date) => {
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    const data = await fetchWeatherData(timestamp);
    return { date, data };
  });
  
  // Execute fetches in chunks to respect rate limits
  const chunks = [];
  for (let i = 0; i < fetchPromises.length; i += CONCURRENT_REQUESTS) {
    chunks.push(fetchPromises.slice(i, i + CONCURRENT_REQUESTS));
  }
  
  let allWeatherData = [];
  let importedDays = 0;
  
  for (const chunk of chunks) {
    const results = await Promise.all(chunk);
    
    for (const { date, data } of results) {
      if (data) {
        const weatherData = convertToWeatherData(data, date);
        allWeatherData = allWeatherData.concat(weatherData);
        importedDays++;
        console.log(`✅ ${date}: Daten abgerufen`);
      } else {
        console.log(`❌ ${date}: Fehler beim Abrufen`);
      }
    }
    
    // Small delay between chunks
    if (REQUEST_DELAY > 0) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }
  
  // Bulk insert all data
  if (allWeatherData.length > 0) {
    const inserted = await bulkInsertWeatherData(allWeatherData);
    console.log(`💾 ${inserted} Datensätze eingefügt für ${importedDays} Tage`);
  }
  
  return importedDays;
}

async function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

async function bulkImportWeatherData() {
  const startDate = '2022-01-01';
  const endDate = new Date().toISOString().split('T')[0];
  
  console.log(`📅 Zeitraum: ${startDate} bis ${endDate}`);
  
  // Generate all dates
  const allDates = await generateDateRange(startDate, endDate);
  console.log(`📊 Gesamte Tage: ${allDates.length}`);
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < allDates.length; i += BATCH_SIZE) {
    batches.push(allDates.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`📦 Anzahl Batches: ${batches.length}`);
  
  let totalImported = 0;
  let batchCount = 0;
  
  for (const batch of batches) {
    batchCount++;
    console.log(`\n🔄 Batch ${batchCount}/${batches.length}:`);
    
    const imported = await processBatch(batch);
    totalImported += imported;
    
    console.log(`📊 Fortschritt: ${batchCount}/${batches.length} Batches, ${totalImported} Tage importiert`);
    
    // Progress update delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n🎉 Bulk-Import abgeschlossen!`);
  console.log(`📊 Gesamt importierte Tage: ${totalImported}`);
  
  // Final statistics
  const query = `
    SELECT COUNT(*) as total_records, 
           COUNT(DISTINCT date) as unique_days,
           MIN(date) as earliest_date,
           MAX(date) as latest_date
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `;
  
  const result = await client.query(query);
  const stats = result.rows[0];
  
  console.log(`\n📈 Finale Statistiken:`);
  console.log(`   Gesamte Datensätze: ${stats.total_records}`);
  console.log(`   Einzigartige Tage: ${stats.unique_days}`);
  console.log(`   Frühestes Datum: ${stats.earliest_date}`);
  console.log(`   Spätestes Datum: ${stats.latest_date}`);
}

async function main() {
  if (!API_KEY) {
    console.error('❌ OPENWEATHER_API_KEY Umgebungsvariable nicht gefunden');
    process.exit(1);
  }
  
  const connected = await connectToDatabase();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    await bulkImportWeatherData();
  } catch (error) {
    console.error('❌ Fehler beim Bulk-Import:', error);
  } finally {
    await client.end();
    console.log('👋 Datenbankverbindung geschlossen');
  }
}

// Start the bulk import
main().catch(console.error);
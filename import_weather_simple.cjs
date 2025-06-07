/**
 * Simple Weather Data Import for Bad Schandau
 * Uses individual inserts with proper error handling
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

console.log('🌤️ Simple Weather Import gestartet');

async function connectToDatabase() {
  await client.connect();
  console.log('✅ Datenbankverbindung hergestellt');
}

async function insertWeatherRecord(data) {
  // Check if record already exists
  const existingQuery = `
    SELECT id FROM weather_data 
    WHERE date = $1 AND hour = $2 AND station_name = $3
  `;
  const existing = await client.query(existingQuery, [data.date, data.hour, data.station_name]);
  
  if (existing.rows.length > 0) {
    return; // Skip if already exists
  }
  
  const query = `
    INSERT INTO weather_data (
      timestamp, date, hour, temp, feels_like, temp_min, temp_max, 
      pressure, humidity, wind_speed, wind_deg, wind_gust, clouds, 
      visibility, precipitation, rain_1h, snow_1h, weather_id, 
      weather_main, weather_description, weather_icon, source, 
      station_id, station_name, country, metadata, sync_status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
    )
  `;
  
  const values = [
    data.timestamp, data.date, data.hour, data.temp, data.feels_like, 
    data.temp_min, data.temp_max, data.pressure, data.humidity, 
    data.wind_speed, data.wind_deg, data.wind_gust, data.clouds, 
    data.visibility, data.precipitation, data.rain_1h, data.snow_1h, 
    data.weather_id, data.weather_main, data.weather_description, 
    data.weather_icon, data.source, data.station_id, data.station_name, 
    data.country, data.metadata, data.sync_status
  ];
  
  await client.query(query, values);
}

async function fetchAndImportDay(date) {
  const timestamp = Math.floor(new Date(date).getTime() / 1000);
  const url = `${BASE_URL}?lat=${LAT}&lon=${LON}&dt=${timestamp}&appid=${API_KEY}&units=metric`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.data && data.data.length > 0) {
      const dayData = data.data[0];
      let insertCount = 0;
      
      // Insert 24 hourly records for the day
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
        
        const weatherRecord = {
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
          source: 'openweather_simple',
          station_id: 'bad_schandau',
          station_name: 'Bad Schandau',
          country: 'DE',
          metadata: JSON.stringify({ simple_import: true }),
          sync_status: 'completed'
        };
        
        await insertWeatherRecord(weatherRecord);
        insertCount++;
      }
      
      console.log(`✅ ${date}: ${insertCount} Stunden importiert`);
      return insertCount;
    }
  } catch (error) {
    console.log(`❌ ${date}: Fehler - ${error.message}`);
    return 0;
  }
}

async function importRecentDays() {
  console.log('📅 Importiere letzte 30 Tage für Test');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  let totalImported = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    
    // Check if data already exists
    const existingQuery = `
      SELECT COUNT(*) as count 
      FROM weather_data 
      WHERE date = $1 AND station_name = 'Bad Schandau'
    `;
    const existingResult = await client.query(existingQuery, [dateStr]);
    
    if (parseInt(existingResult.rows[0].count) === 0) {
      const imported = await fetchAndImportDay(dateStr);
      totalImported += imported;
      
      // Short delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log(`✓ ${dateStr}: Bereits vorhanden`);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  console.log(`🎉 Import abgeschlossen: ${totalImported} Datensätze importiert`);
  
  // Show final stats
  const statsQuery = `
    SELECT COUNT(*) as total_records, 
           COUNT(DISTINCT date) as unique_days,
           MIN(date) as earliest_date,
           MAX(date) as latest_date,
           AVG(temp) as avg_temp
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `;
  
  const stats = await client.query(statsQuery);
  const data = stats.rows[0];
  
  console.log(`\n📊 Aktuelle Statistiken:`);
  console.log(`   Gesamte Datensätze: ${data.total_records}`);
  console.log(`   Einzigartige Tage: ${data.unique_days}`);
  console.log(`   Zeitraum: ${data.earliest_date} bis ${data.latest_date}`);
  console.log(`   Durchschnittstemperatur: ${parseFloat(data.avg_temp).toFixed(1)}°C`);
}

async function main() {
  if (!API_KEY) {
    console.error('❌ OPENWEATHER_API_KEY fehlt');
    process.exit(1);
  }
  
  try {
    await connectToDatabase();
    await importRecentDays();
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  } finally {
    await client.end();
    console.log('👋 Datenbankverbindung geschlossen');
  }
}

main().catch(console.error);
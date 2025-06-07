/**
 * Bad Schandau Historische Wetterdaten Import
 * 
 * Dieses Script importiert vollständige stündliche Wetterdaten für Bad Schandau
 * von 2022 bis heute mit der OpenWeather API.
 */

const dotenv = require('dotenv');
const axios = require('axios');
const { Client } = require('pg');

// Umgebungsvariablen laden
dotenv.config();

// Bad Schandau Koordinaten
const BAD_SCHANDAU_LAT = 50.9196;
const BAD_SCHANDAU_LON = 14.1524;

// OpenWeather API Konfiguration
const API_KEY = process.env.OPENWEATHER_API_KEY;
const HISTORICAL_WEATHER_URL = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';

// Import-Konfiguration
const START_DATE = '2022-01-01'; // Vollständiger historischer Import ab 2022
const DELAY_BETWEEN_REQUESTS = 1100; // 1.1 Sekunden zwischen API-Anfragen

/**
 * Erstellt eine Datenbankverbindung
 */
async function createDbConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  return client;
}

/**
 * Wandelt ein Datum in Unix-Timestamp um
 */
function dateToTimestamp(dateString) {
  return Math.floor(new Date(dateString + 'T12:00:00Z').getTime() / 1000);
}

/**
 * Formatiert ein Datum als YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Fügt einen Tag zu einem Datum hinzu
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Prüft, ob Daten für ein bestimmtes Datum bereits vorhanden sind
 */
async function hasDataForDate(client, date) {
  const query = `
    SELECT COUNT(*) as count 
    FROM weather_data 
    WHERE date = $1 AND station_name = 'Bad Schandau'
  `;
  
  const result = await client.query(query, [date]);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Holt historische Wetterdaten von OpenWeather API
 */
async function fetchHistoricalWeather(timestamp) {
  if (!API_KEY) {
    throw new Error('OpenWeather API-Schlüssel fehlt');
  }

  try {
    console.log(`🌤️  Lade Daten für Timestamp ${timestamp}...`);
    
    const response = await axios.get(HISTORICAL_WEATHER_URL, {
      params: {
        lat: BAD_SCHANDAU_LAT,
        lon: BAD_SCHANDAU_LON,
        dt: timestamp,
        appid: API_KEY,
        units: 'metric',
        lang: 'de'
      }
    });

    if (response.status !== 200) {
      throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Daten:`, error.message);
    return null;
  }
}

/**
 * Speichert Wetterdaten in der Datenbank
 */
async function saveWeatherData(client, weatherData, date) {
  if (!weatherData || !weatherData.data || !Array.isArray(weatherData.data)) {
    console.warn(`Keine gültigen Daten für ${date}`);
    return 0;
  }

  let insertedCount = 0;

  for (const hourData of weatherData.data) {
    try {
      const dateTime = new Date(hourData.dt * 1000);
      const dateStr = formatDate(dateTime);
      const hour = dateTime.getHours();

      // Prüfen, ob Datensatz bereits existiert
      const existsQuery = `
        SELECT COUNT(*) as count 
        FROM weather_data 
        WHERE date = $1 AND hour = $2 AND station_name = 'Bad Schandau'
      `;
      
      const existsResult = await client.query(existsQuery, [dateStr, hour]);
      if (parseInt(existsResult.rows[0].count) > 0) {
        continue; // Überspringen, falls bereits vorhanden
      }

      // Datensatz einfügen
      const insertQuery = `
        INSERT INTO weather_data 
        (timestamp, date, hour, temp, humidity, pressure, wind_speed, wind_deg, clouds, visibility, precipitation, station_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;

      const values = [
        dateTime,
        dateStr,
        hour,
        hourData.temp || null,
        Math.round(hourData.humidity || 0),
        Math.round(hourData.pressure || 0),
        hourData.wind_speed || null,
        Math.round(hourData.wind_deg || 0),
        Math.round(hourData.clouds || 0),
        hourData.visibility || 10000,
        hourData.rain ? hourData.rain['1h'] : (hourData.snow ? hourData.snow['1h'] : null),
        'Bad Schandau',
        new Date(),
        new Date()
      ];

      await client.query(insertQuery, values);
      insertedCount++;

    } catch (error) {
      console.warn(`Fehler beim Speichern der Stunde ${hourData.dt}:`, error.message);
    }
  }

  return insertedCount;
}

/**
 * Importiert Wetterdaten für einen einzelnen Tag
 */
async function importDayData(client, date) {
  const dateString = formatDate(date);
  
  try {
    // Prüfen, ob bereits Daten vorhanden sind
    const hasData = await hasDataForDate(client, dateString);
    if (hasData) {
      console.log(`✓ ${dateString}: Bereits vorhanden, überspringe`);
      return { success: true, skipped: true, inserted: 0 };
    }

    // Unix Timestamp für den Tag (12:00 UTC)
    const timestamp = dateToTimestamp(dateString);
    
    // Historische Daten von OpenWeather abrufen
    const owData = await fetchHistoricalWeather(timestamp);
    
    if (!owData) {
      console.warn(`⚠️  ${dateString}: Keine Daten von API erhalten`);
      return { success: false, error: 'Keine API-Daten' };
    }

    // In Datenbank speichern
    const insertedCount = await saveWeatherData(client, owData, dateString);

    if (insertedCount === 0) {
      console.warn(`⚠️  ${dateString}: Keine gültigen Datensätze nach Verarbeitung`);
      return { success: false, error: 'Keine gültigen Datensätze' };
    }

    console.log(`✅ ${dateString}: ${insertedCount} Stunden importiert`);
    return { success: true, inserted: insertedCount };
    
  } catch (error) {
    console.error(`❌ ${dateString}: Fehler beim Import:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Hauptfunktion für den Import
 */
async function importBadSchandauWeatherHistory() {
  console.log('🌤️  Bad Schandau Wetterdaten Import gestartet');
  
  if (!API_KEY) {
    console.error('❌ OPENWEATHER_API_KEY nicht gefunden in Umgebungsvariablen');
    process.exit(1);
  }

  const client = await createDbConnection();
  console.log('✅ Datenbankverbindung hergestellt');

  const startDate = new Date(START_DATE);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Gestern (heute ist noch nicht vollständig)

  // Berechne Anzahl Tage
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  
  console.log(`📅 Zeitraum: ${START_DATE} bis ${formatDate(endDate)}`);
  console.log(`📊 Gesamte Tage: ${totalDays}`);
  console.log(`⏱️  Verzögerung: ${DELAY_BETWEEN_REQUESTS}ms zwischen Anfragen`);
  console.log('');

  let processedDays = 0;
  let skippedDays = 0;
  let errorDays = 0;
  let totalInserted = 0;

  // Tag für Tag durchgehen
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const result = await importDayData(client, currentDate);
    
    processedDays++;
    
    if (result.skipped) {
      skippedDays++;
    } else if (result.success) {
      totalInserted += result.inserted || 0;
    } else {
      errorDays++;
    }

    // Fortschritt anzeigen
    if (processedDays % 10 === 0 || currentDate >= endDate) {
      const progress = Math.round((processedDays / totalDays) * 100);
      console.log(`\n📈 Fortschritt: ${progress}% (${processedDays}/${totalDays} Tage)`);
      console.log(`   ✅ Importiert: ${totalInserted} Datensätze`);
      console.log(`   ⏭️  Übersprungen: ${skippedDays} Tage`);
      console.log(`   ❌ Fehler: ${errorDays} Tage\n`);
    }

    // Nächster Tag
    currentDate = addDays(currentDate, 1);
    
    // Verzögerung zwischen API-Anfragen
    if (currentDate <= endDate && !result.skipped) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }

  console.log('\n🎉 Import abgeschlossen!');
  console.log(`📊 Statistiken:`);
  console.log(`   - Verarbeitete Tage: ${processedDays}`);
  console.log(`   - Importierte Datensätze: ${totalInserted}`);
  console.log(`   - Übersprungene Tage: ${skippedDays}`);
  console.log(`   - Fehlerhafte Tage: ${errorDays}`);
  
  // Finale Datenbankstatistik
  try {
    const finalQuery = `
      SELECT COUNT(*) as count 
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `;
    const finalResult = await client.query(finalQuery);
    console.log(`   - Gesamte Bad Schandau Datensätze: ${finalResult.rows[0].count}`);
  } catch (error) {
    console.error('Fehler beim Abrufen der finalen Statistik:', error);
  }

  await client.end();
}

// Script ausführen
importBadSchandauWeatherHistory()
  .then(() => {
    console.log('\n✨ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script-Fehler:', error);
    process.exit(1);
  });
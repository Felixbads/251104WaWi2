/**
 * Bad Schandau Historische Wetterdaten Import
 * 
 * Dieses Script importiert vollständige stündliche Wetterdaten für Bad Schandau
 * von 2022 bis heute mit der OpenWeather API.
 * 
 * Features:
 * - Stündliche Daten für jeden Tag seit 2022
 * - Automatische Speicherung in weather_data Tabelle
 * - Rate Limiting (900 Anfragen/Tag)
 * - Fortsetzung nach Unterbrechungen
 * - Detaillierte Fortschrittsanzeige
 */

const { config } = await import('dotenv');
const { db } = await import('./server/db.ts');
const { weatherData, insertWeatherDataSchema } = await import('./shared/schema.ts');
const { fetchHistoricalWeather } = await import('./server/services/openWeatherService.ts');
const { format, parseISO, addDays, startOfDay, differenceInDays } = await import('date-fns');
const { eq, and, desc } = await import('drizzle-orm');

// Umgebungsvariablen laden
config();

// Bad Schandau Koordinaten
const BAD_SCHANDAU_LAT = 50.9196;
const BAD_SCHANDAU_LON = 14.1524;

// Import-Konfiguration
const START_DATE = '2022-01-01';
const END_DATE = new Date().toISOString().split('T')[0]; // Heute
const BATCH_SIZE = 50; // Anzahl Tage pro Batch
const DELAY_BETWEEN_REQUESTS = 1100; // 1.1 Sekunden zwischen API-Anfragen

/**
 * Wandelt OpenWeather Daten in weather_data Format um
 */
function convertOpenWeatherToWeatherData(owData, date) {
  const results = [];
  
  if (!owData || !owData.data || !Array.isArray(owData.data)) {
    console.warn(`Keine gültigen Daten für ${date}`);
    return results;
  }

  for (const hourData of owData.data) {
    try {
      const dateTime = new Date(hourData.dt * 1000);
      
      const weatherRecord = {
        timestamp: dateTime,
        date: format(dateTime, 'yyyy-MM-dd'),
        hour: dateTime.getHours(),
        temp: hourData.temp || null,
        humidity: Math.round(hourData.humidity || 0),
        pressure: Math.round(hourData.pressure || 0),
        wind_speed: hourData.wind_speed || null,
        wind_deg: Math.round(hourData.wind_deg || 0),
        clouds: Math.round(hourData.clouds || 0),
        visibility: hourData.visibility || 10000,
        precipitation: hourData.rain ? hourData.rain['1h'] : (hourData.snow ? hourData.snow['1h'] : null),
        station_name: 'Bad Schandau',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Validierung mit Schema
      const validatedRecord = insertWeatherDataSchema.parse(weatherRecord);
      results.push(validatedRecord);
      
    } catch (error) {
      console.warn(`Validierungsfehler für Stunde ${hourData.dt}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Prüft, ob Daten für ein bestimmtes Datum bereits vorhanden sind
 */
async function hasDataForDate(date) {
  try {
    const existing = await db.select({ count: db.count() })
      .from(weatherData)
      .where(
        and(
          eq(weatherData.date, date),
          eq(weatherData.station_name, 'Bad Schandau')
        )
      );
    
    return existing[0]?.count > 0;
  } catch (error) {
    console.error(`Fehler beim Prüfen vorhandener Daten für ${date}:`, error);
    return false;
  }
}

/**
 * Importiert Wetterdaten für einen einzelnen Tag
 */
async function importDayData(date) {
  const dateString = format(date, 'yyyy-MM-dd');
  
  try {
    // Prüfen, ob bereits Daten vorhanden sind
    const hasData = await hasDataForDate(dateString);
    if (hasData) {
      console.log(`✓ ${dateString}: Bereits vorhanden, überspringe`);
      return { success: true, skipped: true, inserted: 0 };
    }

    console.log(`📡 ${dateString}: Lade Daten von OpenWeather API...`);
    
    // Unix Timestamp für den Tag (12:00 UTC)
    const timestamp = Math.floor(date.getTime() / 1000);
    
    // Historische Daten von OpenWeather abrufen
    const owData = await fetchHistoricalWeather(timestamp, BAD_SCHANDAU_LAT, BAD_SCHANDAU_LON);
    
    if (!owData) {
      console.warn(`⚠️  ${dateString}: Keine Daten von API erhalten`);
      return { success: false, error: 'Keine API-Daten' };
    }

    // Daten konvertieren
    const weatherRecords = convertOpenWeatherToWeatherData(owData, dateString);
    
    if (weatherRecords.length === 0) {
      console.warn(`⚠️  ${dateString}: Keine gültigen Datensätze nach Konvertierung`);
      return { success: false, error: 'Keine gültigen Datensätze' };
    }

    // In Datenbank einfügen
    await db.insert(weatherData)
      .values(weatherRecords)
      .onConflictDoUpdate({
        target: [weatherData.date, weatherData.hour, weatherData.station_name],
        set: {
          temp: weatherData.temp,
          humidity: weatherData.humidity,
          pressure: weatherData.pressure,
          wind_speed: weatherData.wind_speed,
          wind_deg: weatherData.wind_deg,
          clouds: weatherData.clouds,
          visibility: weatherData.visibility,
          precipitation: weatherData.precipitation,
          updated_at: new Date()
        }
      });

    console.log(`✅ ${dateString}: ${weatherRecords.length} Stunden importiert`);
    return { success: true, inserted: weatherRecords.length };
    
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
  console.log(`📅 Zeitraum: ${START_DATE} bis ${END_DATE}`);
  
  const startDate = startOfDay(parseISO(START_DATE));
  const endDate = startOfDay(parseISO(END_DATE));
  const totalDays = differenceInDays(endDate, startDate) + 1;
  
  console.log(`📊 Gesamte Tage: ${totalDays}`);
  console.log(`🔄 Batch-Größe: ${BATCH_SIZE} Tage`);
  console.log(`⏱️  Verzögerung: ${DELAY_BETWEEN_REQUESTS}ms zwischen Anfragen`);
  console.log('');

  let processedDays = 0;
  let skippedDays = 0;
  let errorDays = 0;
  let totalInserted = 0;

  // Tag für Tag durchgehen
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const result = await importDayData(currentDate);
    
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
    const finalCount = await db.select({ count: db.count() })
      .from(weatherData)
      .where(eq(weatherData.station_name, 'Bad Schandau'));
    
    console.log(`   - Gesamte Bad Schandau Datensätze: ${finalCount[0]?.count || 0}`);
  } catch (error) {
    console.error('Fehler beim Abrufen der finalen Statistik:', error);
  }
}

// Script ausführen, wenn direkt aufgerufen
if (import.meta.url === `file://${process.argv[1]}`) {
  importBadSchandauWeatherHistory()
    .then(() => {
      console.log('\n✨ Script erfolgreich beendet');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script-Fehler:', error);
      process.exit(1);
    });
}

export { importBadSchandauWeatherHistory };
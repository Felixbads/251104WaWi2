/**
 * Dieses Skript erstellt nur die weather_data und holidays Tabellen in der Datenbank.
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen
dotenv.config();

// Erstelle PostgreSQL-Client
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function createTables() {
  try {
    // Verbindung zur Datenbank herstellen
    await client.connect();
    console.log('Verbindung zur Datenbank hergestellt');
    
    console.log('Erstelle weather_data und holidays Tabellen...');
    
    // Prüfen, ob die Tabellen bereits existieren
    const tablesExistQuery = `
      SELECT 
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'weather_data'
        ) as weather_exists, 
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'holidays'
        ) as holidays_exists
    `;
    
    const tablesExistResult = await client.query(tablesExistQuery);
    const tablesExist = tablesExistResult.rows[0];
    
    console.log('Tabellenprüfung:', tablesExist);
    
    if (tablesExist.weather_exists && tablesExist.holidays_exists) {
      console.log('Beide Tabellen existieren bereits!');
      await client.end();
      return;
    }
    
    // weather_data Tabelle erstellen
    if (!tablesExist.weather_exists) {
      console.log('Erstelle weather_data Tabelle...');
      const createWeatherDataTableQuery = `
        CREATE TABLE IF NOT EXISTS "weather_data" (
          "id" SERIAL PRIMARY KEY,
          "timestamp" TIMESTAMP NOT NULL,
          "date" DATE NOT NULL,
          "hour" INTEGER NOT NULL,
          "temp" REAL,
          "feels_like" REAL,
          "temp_min" REAL,
          "temp_max" REAL,
          "pressure" INTEGER,
          "humidity" INTEGER,
          "wind_speed" REAL,
          "wind_deg" INTEGER,
          "wind_gust" REAL,
          "clouds" INTEGER,
          "visibility" INTEGER,
          "precipitation" REAL,
          "rain_1h" REAL,
          "snow_1h" REAL,
          "weather_id" INTEGER,
          "weather_main" TEXT,
          "weather_description" TEXT,
          "weather_icon" TEXT,
          "source" TEXT NOT NULL DEFAULT 'historical',
          "station_id" TEXT,
          "station_name" TEXT,
          "country" TEXT,
          "metadata" TEXT,
          "sync_status" TEXT DEFAULT 'pending',
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE("date", "hour", "station_id")
        );
      `;
      
      await client.query(createWeatherDataTableQuery);
      console.log('weather_data Tabelle erfolgreich erstellt!');
    }
    
    // holidays Tabelle erstellen
    if (!tablesExist.holidays_exists) {
      console.log('Erstelle holidays Tabelle...');
      const createHolidaysTableQuery = `
        CREATE TABLE IF NOT EXISTS "holidays" (
          "id" SERIAL PRIMARY KEY,
          "date" DATE NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "type" TEXT NOT NULL,
          "is_official" BOOLEAN DEFAULT true,
          "country" TEXT DEFAULT 'DE',
          "state" TEXT,
          "region" TEXT,
          "year" INTEGER NOT NULL,
          "trimester" INTEGER,
          "month" INTEGER NOT NULL,
          "day" INTEGER NOT NULL,
          "weekday" INTEGER,
          "weekday_name" TEXT,
          "week" INTEGER,
          "metadata" TEXT,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE("date", "country", "state")
        );
      `;
      
      await client.query(createHolidaysTableQuery);
      console.log('holidays Tabelle erfolgreich erstellt!');
    }
    
    console.log('Tabellenerstellung abgeschlossen.');
    
    // Verbindung zur Datenbank schließen
    await client.end();
    console.log('Verbindung zur Datenbank geschlossen');
  } catch (error) {
    console.error('Fehler bei der Tabellenerstellung:', error);
    try {
      // Verbindung zur Datenbank schließen, wenn ein Fehler auftritt
      await client.end();
    } catch (endError) {
      console.error('Fehler beim Schließen der Datenbankverbindung:', endError);
    }
  }
}

createTables();
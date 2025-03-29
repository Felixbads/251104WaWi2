/**
 * OpenWeather Service für Wetterprognosen
 * 
 * Dieser Service stellt Funktionen bereit, um Wetterprognosen von der OpenWeather API abzurufen
 * und in der Datenbank zu speichern.
 */

import axios from 'axios';
import { format, parseISO, isValid, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { db } from '../db';
import { weatherData, insertWeatherDataSchema } from '@shared/schema';
import { count, and, eq, between } from 'drizzle-orm';

// API-Konfiguration
const API_KEY = process.env.OPENWEATHER_API_KEY || "";
const BASE_URL = "https://api.openweathermap.org/data/3.0/onecall";

// Konstanten
const DEFAULT_LOCATION = {
  name: "Bad Schandau",
  lat: 50.9199,
  lon: 14.1525,
  country: "DE"
};

/**
 * Aktuelle Wetterdaten und Prognosen von OpenWeather API abrufen
 * 
 * @param lat Breitengrad
 * @param lon Längengrad
 * @param exclude Teile der Antwort ausschließen (current,minutely,hourly,daily,alerts)
 * @returns API-Antwort oder null bei Fehler
 */
export async function fetchWeatherForecast(
  lat: number = DEFAULT_LOCATION.lat,
  lon: number = DEFAULT_LOCATION.lon,
  exclude: string = ""
): Promise<any | null> {
  try {
    console.log(`Rufe Wetterprognose ab für Koordinaten: ${lat}, ${lon}`);
    
    // Parameter für die API-Anfrage
    const params: Record<string, any> = {
      lat,
      lon,
      appid: API_KEY,
      units: "metric", // Metrische Einheiten (Celsius)
      lang: "de"       // Deutsche Sprache
    };
    
    if (exclude) {
      params.exclude = exclude;
    }
    
    // API-Anfrage senden
    const response = await axios.get(BASE_URL, { params });
    
    // Überprüfung und Verarbeitung der Antwort
    if (response.status === 200 && response.data) {
      console.log(`Wetterprognose erfolgreich abgerufen`);
      return response.data;
    } else {
      console.error(`Fehler bei der API-Anfrage: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Abrufen der Wetterprognose:`, error);
    return null;
  }
}

/**
 * Speichert Prognose-Wetterdaten in der Datenbank
 * 
 * @param forecastData API-Antwort mit Wetterprognosen
 * @param locationName Name des Standorts
 * @returns Anzahl der gespeicherten Datensätze
 */
export async function saveForecastData(
  forecastData: any,
  locationName: string = DEFAULT_LOCATION.name
): Promise<{ saved: number; errors: number; duplicates: number }> {
  let saved = 0;
  let errors = 0;
  let duplicates = 0;
  
  // Prüfen ob Daten vorhanden sind
  if (!forecastData) {
    console.warn("Keine Wetterprognosen zum Speichern vorhanden");
    return { saved, errors, duplicates };
  }
  
  // Stündliche Prognosen speichern
  if (forecastData.hourly && Array.isArray(forecastData.hourly)) {
    console.log(`Speichere ${forecastData.hourly.length} stündliche Wetterprognosen in die Datenbank`);
    
    for (const hourData of forecastData.hourly) {
      try {
        if (!hourData || !hourData.dt) {
          console.error("Ungültige Stundendaten in der Prognose");
          errors++;
          continue;
        }
        
        // Unix-Timestamp in Date-Objekt umwandeln
        const timestamp = new Date(hourData.dt * 1000);
        
        if (!isValid(timestamp)) {
          console.error("Ungültiger Zeitstempel:", hourData.dt);
          errors++;
          continue;
        }
        
        // Datum und Stunde extrahieren
        const date = format(timestamp, 'yyyy-MM-dd');
        const hour = parseInt(format(timestamp, 'HH'), 10);
        
        // Prüfen, ob der Datensatz bereits existiert
        const existingRecord = await db.query.weatherData.findFirst({
          where: and(
            eq(weatherData.date, date),
            eq(weatherData.hour, hour),
            eq(weatherData.source, "forecast"),
            eq(weatherData.station_name, locationName)
          )
        });
        
        if (existingRecord) {
          // Wenn der Datensatz bereits existiert, aktualisieren
          duplicates++;
          continue;
        }
        
        // Wetterdaten-Objekt erstellen und speichern
        const weatherDataObj = insertWeatherDataSchema.parse({
          timestamp,
          date,
          hour,
          temp: hourData.temp,
          feels_like: hourData.feels_like,
          pressure: hourData.pressure,
          humidity: hourData.humidity,
          dew_point: hourData.dew_point,
          clouds: hourData.clouds,
          uvi: hourData.uvi,
          visibility: hourData.visibility,
          wind_speed: hourData.wind_speed,
          wind_deg: hourData.wind_deg,
          wind_gust: hourData.wind_gust,
          weather_id: hourData.weather && hourData.weather[0] ? hourData.weather[0].id : null,
          weather_main: hourData.weather && hourData.weather[0] ? hourData.weather[0].main : null,
          weather_description: hourData.weather && hourData.weather[0] ? hourData.weather[0].description : null,
          weather_icon: hourData.weather && hourData.weather[0] ? hourData.weather[0].icon : null,
          precipitation: hourData.pop || 0, // Wahrscheinlichkeit für Niederschlag
          rain_1h: hourData.rain && hourData.rain["1h"] ? hourData.rain["1h"] : 0,
          snow_1h: hourData.snow && hourData.snow["1h"] ? hourData.snow["1h"] : 0,
          source: "forecast",
          station_id: "openweather",
          station_name: locationName,
          country: DEFAULT_LOCATION.country,
          metadata: JSON.stringify(hourData),
          sync_status: "completed"
        });
        
        await db.insert(weatherData).values(weatherDataObj);
        saved++;
      } catch (error) {
        console.error("Fehler beim Speichern der Stunden-Wetterprognose:", error);
        errors++;
      }
    }
  }
  
  // Tägliche Prognosen speichern
  if (forecastData.daily && Array.isArray(forecastData.daily)) {
    console.log(`Speichere ${forecastData.daily.length} tägliche Wetterprognosen in die Datenbank`);
    
    for (const dayData of forecastData.daily) {
      try {
        if (!dayData || !dayData.dt) {
          console.error("Ungültige Tagesdaten in der Prognose");
          errors++;
          continue;
        }
        
        // Unix-Timestamp in Date-Objekt umwandeln
        const timestamp = new Date(dayData.dt * 1000);
        
        if (!isValid(timestamp)) {
          console.error("Ungültiger Zeitstempel:", dayData.dt);
          errors++;
          continue;
        }
        
        // Datum extrahieren, für Tagesprognosen setzen wir Mittagszeit (12 Uhr)
        const date = format(timestamp, 'yyyy-MM-dd');
        const hour = 12;
        
        // Prüfen, ob der Datensatz bereits existiert
        const existingRecord = await db.query.weatherData.findFirst({
          where: and(
            eq(weatherData.date, date),
            eq(weatherData.hour, hour),
            eq(weatherData.source, "forecast_daily"),
            eq(weatherData.station_name, locationName)
          )
        });
        
        if (existingRecord) {
          // Wenn der Datensatz bereits existiert, aktualisieren
          duplicates++;
          continue;
        }
        
        // Wetterdaten-Objekt erstellen und speichern
        const weatherDataObj = insertWeatherDataSchema.parse({
          timestamp: new Date(timestamp.setHours(hour, 0, 0, 0)),
          date,
          hour,
          temp: dayData.temp.day,
          temp_min: dayData.temp.min,
          temp_max: dayData.temp.max,
          feels_like: dayData.feels_like.day,
          pressure: dayData.pressure,
          humidity: dayData.humidity,
          dew_point: dayData.dew_point,
          clouds: dayData.clouds,
          uvi: dayData.uvi,
          visibility: 10000, // Default, falls nicht vorhanden
          wind_speed: dayData.wind_speed,
          wind_deg: dayData.wind_deg,
          wind_gust: dayData.wind_gust,
          weather_id: dayData.weather && dayData.weather[0] ? dayData.weather[0].id : null,
          weather_main: dayData.weather && dayData.weather[0] ? dayData.weather[0].main : null,
          weather_description: dayData.weather && dayData.weather[0] ? dayData.weather[0].description : null,
          weather_icon: dayData.weather && dayData.weather[0] ? dayData.weather[0].icon : null,
          precipitation: dayData.pop || 0, // Wahrscheinlichkeit für Niederschlag
          rain_1h: dayData.rain || 0,
          snow_1h: dayData.snow || 0,
          source: "forecast_daily",
          station_id: "openweather",
          station_name: locationName,
          country: DEFAULT_LOCATION.country,
          metadata: JSON.stringify(dayData),
          sync_status: "completed"
        });
        
        await db.insert(weatherData).values(weatherDataObj);
        saved++;
      } catch (error) {
        console.error("Fehler beim Speichern der Tages-Wetterprognose:", error);
        errors++;
      }
    }
  }
  
  console.log(`Gespeichert: ${saved}, Fehler: ${errors}, Duplikate: ${duplicates}`);
  return { saved, errors, duplicates };
}

/**
 * Synchronisiert Wetterprognosen und speichert sie in der Datenbank
 * 
 * @param locationName Name des Standorts
 * @returns Synchronisationsergebnis
 */
export async function syncWeatherForecast(
  locationName: string = DEFAULT_LOCATION.name
): Promise<{ status: string; saved: number; errors: number; duplicates: number; message?: string }> {
  try {
    console.log(`Starte Synchronisation der Wetterprognosen für ${locationName}`);
    
    // Koordinaten für Bad Schandau verwenden
    const forecast = await fetchWeatherForecast();
    
    if (!forecast) {
      return { 
        status: "error", 
        saved: 0, 
        errors: 0, 
        duplicates: 0, 
        message: "Keine Wetterprognosen von der API erhalten" 
      };
    }
    
    // Prognosen speichern
    const { saved, errors, duplicates } = await saveForecastData(forecast, locationName);
    
    return {
      status: errors > 0 ? "warning" : "success",
      saved,
      errors,
      duplicates,
      message: `${saved} Wetterprognosen synchronisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler`
    };
  } catch (error) {
    console.error("Fehler bei der Synchronisation der Wetterprognosen:", error);
    return {
      status: "error",
      saved: 0,
      errors: 1,
      duplicates: 0,
      message: `Fehler bei der Synchronisation der Wetterprognosen: ${error}`
    };
  }
}
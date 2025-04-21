/**
 * OpenWeather API Service
 * 
 * Dieses Modul stellt Funktionen für den Zugriff auf die OpenWeather API bereit.
 * Es unterstützt aktuelle Wetterdaten, Wettervorhersagen und historische Wetterdaten.
 * Die Daten werden in der Datenbank gespeichert und können für Analysen verwendet werden.
 * 
 * API-Dokumentation: https://openweathermap.org/api/one-call-3
 * 
 * Wichtige Änderungen (April 2025):
 * - Rate Limiting: Maximale API-Anfragen begrenzt auf 1000/Tag
 * - Historische Daten: Rückwirkend ab 01.01.2023
 * - Zentrale Abfrage: Nur für Bad Schandau (50.9196, 14.1524)
 * - Forecast: 8-14 Tage Vorhersage für Prophet-Prognosemodell
 */

import axios from 'axios';
import { db } from '../db';
import { eq, sql, and, gt, lt, between, desc, asc } from 'drizzle-orm';
import { syncLogs } from '@shared/legacy-schema';

// Vorübergehende Typdefinitionen für das Wetter-Feature
// Diese sollten später in die korrekte Schema-Datei verschoben werden
type WeatherForecast = {
  id: number;
  date: string;
  hour: string;
  type: string;
  temperature: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  dew_point: number;
  clouds: number;
  uvi: number;
  visibility?: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather_id?: number;
  weather_main?: string;
  weather_description?: string;
  weather_icon?: string;
  pop?: number;
  rain_1h?: number;
  snow_1h?: number;
  timestamp: number;
  sunrise?: number;
  sunset?: number;
  moonrise?: number;
  moonset?: number;
  moon_phase?: number;
  source: string;
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
  metadata?: string;
};

type InsertWeatherForecast = Omit<WeatherForecast, 'id'>;

type WeatherHistorical = {
  id: number;
  date: string;
  hour: string;
  temperature: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  dew_point: number;
  clouds: number;
  uvi: number;
  visibility?: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather_id?: number;
  weather_main?: string;
  weather_description?: string;
  weather_icon?: string;
  rain_1h?: number;
  snow_1h?: number;
  timestamp: number;
  sunrise?: number;
  sunset?: number;
  source: string;
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
};

type InsertWeatherHistorical = Omit<WeatherHistorical, 'id'>;

type DataCoverage = {
  id: number;
  data_type: string;
  earliest_date: Date | null;
  latest_date: Date | null;
  count: number;
  quality: number | null;
  coverage_percentage: number;
  updated_at: Date;
};

// Mock-Tabellendefinitionen für die Typsicherheit
const weatherForecasts = {
  id: { name: 'id' },
  date: { name: 'date' },
  hour: { name: 'hour' },
  type: { name: 'type' },
  temperature: { name: 'temperature' },
  feels_like: { name: 'feels_like' },
  pressure: { name: 'pressure' },
  humidity: { name: 'humidity' },
  dew_point: { name: 'dew_point' },
  clouds: { name: 'clouds' },
  uvi: { name: 'uvi' },
  visibility: { name: 'visibility' },
  wind_speed: { name: 'wind_speed' },
  wind_deg: { name: 'wind_deg' },
  wind_gust: { name: 'wind_gust' },
  weather_id: { name: 'weather_id' },
  weather_main: { name: 'weather_main' },
  weather_description: { name: 'weather_description' },
  weather_icon: { name: 'weather_icon' },
  pop: { name: 'pop' },
  rain_1h: { name: 'rain_1h' },
  snow_1h: { name: 'snow_1h' },
  timestamp: { name: 'timestamp' },
  sunrise: { name: 'sunrise' },
  sunset: { name: 'sunset' },
  moonrise: { name: 'moonrise' },
  moonset: { name: 'moonset' },
  moon_phase: { name: 'moon_phase' },
  source: { name: 'source' },
  lat: { name: 'lat' },
  lon: { name: 'lon' },
  timezone: { name: 'timezone' },
  timezone_offset: { name: 'timezone_offset' },
  metadata: { name: 'metadata' },
};

const weatherHistorical = {
  id: { name: 'id' },
  date: { name: 'date' },
  hour: { name: 'hour' },
  temperature: { name: 'temperature' },
  feels_like: { name: 'feels_like' },
  pressure: { name: 'pressure' },
  humidity: { name: 'humidity' },
  dew_point: { name: 'dew_point' },
  clouds: { name: 'clouds' },
  uvi: { name: 'uvi' },
  visibility: { name: 'visibility' },
  wind_speed: { name: 'wind_speed' },
  wind_deg: { name: 'wind_deg' },
  wind_gust: { name: 'wind_gust' },
  weather_id: { name: 'weather_id' },
  weather_main: { name: 'weather_main' },
  weather_description: { name: 'weather_description' },
  weather_icon: { name: 'weather_icon' },
  rain_1h: { name: 'rain_1h' },
  snow_1h: { name: 'snow_1h' },
  timestamp: { name: 'timestamp' },
  sunrise: { name: 'sunrise' },
  sunset: { name: 'sunset' },
  source: { name: 'source' },
  lat: { name: 'lat' },
  lon: { name: 'lon' },
  timezone: { name: 'timezone' },
  timezone_offset: { name: 'timezone_offset' },
};

const dataCoverage = {
  id: { name: 'id' },
  data_type: { name: 'data_type' },
  earliest_date: { name: 'earliest_date' },
  latest_date: { name: 'latest_date' },
  count: { name: 'count' },
  quality: { name: 'quality' },
  coverage_percentage: { name: 'coverage_percentage' },
  updated_at: { name: 'updated_at' },
};
// Import-Statements korrekt positionieren
import { format, parseISO, isValid, subDays, addDays, isBefore, isAfter, differenceInDays, startOfDay } from 'date-fns';

// API-Konfiguration
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall';
const CURRENT_WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const HISTORICAL_WEATHER_URL = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';

// Default-Koordinaten für Bad Schandau
const DEFAULT_LAT = 50.9196; // Bad Schandau
const DEFAULT_LON = 14.1524; // Bad Schandau

// Wetter-Typen für die Datenabdeckungs-Tabelle
export const WEATHER_TYPE = {
  FORECAST: 'weather_forecast',
  HISTORICAL: 'weather_historical'
};

// Rate Limiting Konfiguration
const MAX_DAILY_REQUESTS = 900; // Maximale API-Anfragen pro Tag (von 1000 verfügbaren, 100 als Reserve)
let dailyRequestCount = 0;
let lastRequestCountReset = new Date();

/**
 * Gibt aktuelle API-Nutzungsstatistiken zurück
 * @returns Aktuelle API-Nutzungsstatistiken
 */
export function getApiUsageStats(): { 
  count: number, 
  limit: number, 
  remaining: number, 
  resetDate: string,
  percentage: number
} {
  const resetDate = lastRequestCountReset.toISOString();
  return {
    count: dailyRequestCount,
    limit: MAX_DAILY_REQUESTS,
    remaining: Math.max(0, MAX_DAILY_REQUESTS - dailyRequestCount),
    resetDate,
    percentage: Math.min(100, Math.round((dailyRequestCount / MAX_DAILY_REQUESTS) * 100))
  };
}

/**
 * Prüft, ob eine API-Anfrage gesendet werden kann (Rate Limiting)
 * @returns {boolean} True, wenn Anfrage gesendet werden kann, sonst False
 */
function canMakeRequest(): boolean {
  const now = new Date();
  
  // Zurücksetzen des Zählers, wenn ein neuer Tag beginnt
  if (now.getDate() !== lastRequestCountReset.getDate() || 
      now.getMonth() !== lastRequestCountReset.getMonth() ||
      now.getFullYear() !== lastRequestCountReset.getFullYear()) {
    dailyRequestCount = 0;
    lastRequestCountReset = now;
    console.log(`[OpenWeather] API-Anfragenzähler zurückgesetzt am ${format(now, 'yyyy-MM-dd HH:mm:ss')}`);
  }
  
  // Prüfen, ob das Limit erreicht ist
  if (dailyRequestCount >= MAX_DAILY_REQUESTS) {
    console.warn(`[OpenWeather] API-Anfragenlimit (${MAX_DAILY_REQUESTS}) erreicht. Weitere Anfragen werden bis morgen blockiert.`);
    return false;
  }
  
  return true;
}

/**
 * Aktuelle Wetterdaten und Vorhersage abrufen mit Rate Limiting
 * 
 * @param lat Breitengrad
 * @param lon Längengrad
 * @param units Einheiten (metric, imperial, standard)
 * @param lang Sprache (de, en, etc.)
 * @returns Wetterdaten oder null bei Fehler
 */
export async function fetchWeatherForecast(
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
  units: string = 'metric',
  lang: string = 'de'
): Promise<any | null> {
  if (!API_KEY) {
    console.error('[OpenWeather] API-Schlüssel fehlt');
    return null;
  }

  // Prüfen, ob eine Anfrage im Rahmen des Rate Limits gesendet werden kann
  if (!canMakeRequest()) {
    console.warn('[OpenWeather] Anfrage für Wettervorhersage wegen Rate Limiting abgelehnt');
    return null;
  }

  try {
    console.log(`[OpenWeather] Hole Vorhersagedaten für Bad Schandau (${lat}, ${lon})`);
    
    // API-Anfrage senden und Zähler erhöhen
    dailyRequestCount++;
    
    const response = await axios.get(`${BASE_URL}`, {
      params: {
        lat,
        lon,
        appid: API_KEY,
        units,
        lang,
        exclude: 'minutely' // Minutendaten ausschließen
      }
    });

    // Überprüfen auf API-Fehler
    if (response.status !== 200) {
      console.error(`[OpenWeather] API-Fehler: ${response.status} ${response.statusText}`);
      return null;
    }

    console.log(`[OpenWeather] Vorhersagedaten erfolgreich abgerufen. API-Anfragen heute: ${dailyRequestCount}/${MAX_DAILY_REQUESTS}`);
    return response.data;
  } catch (error) {
    console.error('[OpenWeather] Fehler beim Abrufen der Wettervorhersage:', error);
    return null;
  }
}

/**
 * Historische Wetterdaten abrufen mit Rate Limiting
 * 
 * @param date Datum für historische Daten (UNIX-Timestamp oder Datum)
 * @param lat Breitengrad
 * @param lon Längengrad
 * @param units Einheiten (metric, imperial, standard)
 * @param lang Sprache (de, en, etc.)
 * @returns Historische Wetterdaten oder null bei Fehler
 */
export async function fetchHistoricalWeather(
  date: string | Date | number,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
  units: string = 'metric',
  lang: string = 'de'
): Promise<any | null> {
  if (!API_KEY) {
    console.error('[OpenWeather] API-Schlüssel fehlt');
    return null;
  }

  // Prüfen, ob eine Anfrage im Rahmen des Rate Limits gesendet werden kann
  if (!canMakeRequest()) {
    console.warn('[OpenWeather] Anfrage für historische Wetterdaten wegen Rate Limiting abgelehnt');
    return null;
  }

  // Umwandlung des Datums in Unix-Timestamp
  let timestamp: number;
  let dateString: string;
  
  if (typeof date === 'number') {
    timestamp = date;
    dateString = new Date(timestamp * 1000).toISOString().split('T')[0];
  } else if (typeof date === 'string') {
    const parsedDate = parseISO(date);
    if (isValid(parsedDate)) {
      timestamp = Math.floor(parsedDate.getTime() / 1000);
      dateString = date;
    } else {
      console.error('[OpenWeather] Ungültiges Datumsformat:', date);
      return null;
    }
  } else if (date instanceof Date) {
    timestamp = Math.floor(date.getTime() / 1000);
    dateString = date.toISOString().split('T')[0];
  } else {
    console.error('[OpenWeather] Ungültiges Datumsformat:', date);
    return null;
  }

  try {
    console.log(`[OpenWeather] Hole historische Wetterdaten für ${dateString} (${lat}, ${lon})`);
    
    // API-Anfrage senden und Zähler erhöhen
    dailyRequestCount++;
    
    const response = await axios.get(`${HISTORICAL_WEATHER_URL}`, {
      params: {
        lat,
        lon,
        dt: timestamp,
        appid: API_KEY,
        units,
        lang
      }
    });

    // Überprüfen auf API-Fehler
    if (response.status !== 200) {
      console.error(`[OpenWeather] API-Fehler: ${response.status} ${response.statusText}`);
      return null;
    }

    console.log(`[OpenWeather] Historische Wetterdaten für ${dateString} erfolgreich abgerufen. API-Anfragen heute: ${dailyRequestCount}/${MAX_DAILY_REQUESTS}`);
    return response.data;
  } catch (error) {
    console.error(`[OpenWeather] Fehler beim Abrufen historischer Wetterdaten für Datum ${dateString}:`, error);
    return null;
  }
}

/**
 * Speichert Wettervorhersage in der Datenbank
 * 
 * @param forecastData API-Antwort mit Wettervorhersagedaten
 * @returns Statistik zur Speicherung
 */
export async function saveWeatherForecast(
  forecastData: any
): Promise<{ saved: number, duplicates: number, errors: number, status: string, message?: string }> {
  if (!forecastData) {
    return { 
      saved: 0, 
      duplicates: 0, 
      errors: 1, 
      status: 'error',
      message: 'Keine Daten zum Speichern vorhanden'
    };
  }

  const result = {
    saved: 0,
    duplicates: 0,
    errors: 0,
    status: 'success'
  };

  try {
    // Die aktuellen Wetterdaten speichern
    if (forecastData.current) {
      const currentData = forecastData.current;
      const currentDate = new Date(currentData.dt * 1000);
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      const formattedHour = format(currentDate, 'HH:00');

      // Prüfen, ob bereits Daten für diesen Zeitpunkt vorhanden sind
      const existingCurrent = await db.select({ id: weatherForecasts.id })
        .from(weatherForecasts)
        .where(
          and(
            eq(weatherForecasts.date, formattedDate),
            eq(weatherForecasts.hour, formattedHour),
            eq(weatherForecasts.type, 'current')
          )
        )
        .limit(1);

      if (existingCurrent.length === 0) {
        // Daten aufbereiten
        const currentWeather = currentData.weather && currentData.weather.length > 0 ? currentData.weather[0] : null;
        
        const insertData: InsertWeatherForecast = {
          date: formattedDate,
          hour: formattedHour,
          type: 'current',
          temperature: currentData.temp,
          feels_like: currentData.feels_like,
          pressure: currentData.pressure,
          humidity: currentData.humidity,
          dew_point: currentData.dew_point,
          clouds: currentData.clouds,
          uvi: currentData.uvi,
          visibility: currentData.visibility,
          wind_speed: currentData.wind_speed,
          wind_deg: currentData.wind_deg,
          wind_gust: currentData.wind_gust,
          weather_id: currentWeather ? currentWeather.id : null,
          weather_main: currentWeather ? currentWeather.main : null,
          weather_description: currentWeather ? currentWeather.description : null,
          weather_icon: currentWeather ? currentWeather.icon : null,
          rain_1h: currentData.rain ? currentData.rain['1h'] : null,
          snow_1h: currentData.snow ? currentData.snow['1h'] : null,
          timestamp: currentData.dt,
          sunrise: currentData.sunrise,
          sunset: currentData.sunset,
          source: 'openweather',
          lat: forecastData.lat,
          lon: forecastData.lon,
          timezone: forecastData.timezone,
          timezone_offset: forecastData.timezone_offset
        };

        // In die Datenbank einfügen
        await db.insert(weatherForecasts).values(insertData);
        result.saved++;
      } else {
        result.duplicates++;
      }
    }

    // Die stündlichen Vorhersagedaten speichern
    if (forecastData.hourly && Array.isArray(forecastData.hourly)) {
      for (const hourData of forecastData.hourly) {
        const hourDate = new Date(hourData.dt * 1000);
        const formattedDate = format(hourDate, 'yyyy-MM-dd');
        const formattedHour = format(hourDate, 'HH:00');

        // Prüfen, ob bereits Daten für diesen Zeitpunkt vorhanden sind
        const existingHour = await db.select({ id: weatherForecasts.id })
          .from(weatherForecasts)
          .where(
            and(
              eq(weatherForecasts.date, formattedDate),
              eq(weatherForecasts.hour, formattedHour),
              eq(weatherForecasts.type, 'hourly')
            )
          )
          .limit(1);

        if (existingHour.length === 0) {
          // Daten aufbereiten
          const hourWeather = hourData.weather && hourData.weather.length > 0 ? hourData.weather[0] : null;
          
          const insertData: InsertWeatherForecast = {
            date: formattedDate,
            hour: formattedHour,
            type: 'hourly',
            temperature: hourData.temp,
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
            weather_id: hourWeather ? hourWeather.id : null,
            weather_main: hourWeather ? hourWeather.main : null,
            weather_description: hourWeather ? hourWeather.description : null,
            weather_icon: hourWeather ? hourWeather.icon : null,
            pop: hourData.pop,
            rain_1h: hourData.rain ? hourData.rain['1h'] : null,
            snow_1h: hourData.snow ? hourData.snow['1h'] : null,
            timestamp: hourData.dt,
            source: 'openweather',
            lat: forecastData.lat,
            lon: forecastData.lon,
            timezone: forecastData.timezone,
            timezone_offset: forecastData.timezone_offset
          };

          // In die Datenbank einfügen
          await db.insert(weatherForecasts).values(insertData);
          result.saved++;
        } else {
          result.duplicates++;
        }
      }
    }

    // Die täglichen Vorhersagedaten speichern
    if (forecastData.daily && Array.isArray(forecastData.daily)) {
      for (const dayData of forecastData.daily) {
        const dayDate = new Date(dayData.dt * 1000);
        const formattedDate = format(dayDate, 'yyyy-MM-dd');
        const formattedHour = '00:00'; // Tägliche Daten werden der ersten Stunde zugeordnet

        // Prüfen, ob bereits Daten für diesen Zeitpunkt vorhanden sind
        const existingDay = await db.select({ id: weatherForecasts.id })
          .from(weatherForecasts)
          .where(
            and(
              eq(weatherForecasts.date, formattedDate),
              eq(weatherForecasts.hour, formattedHour),
              eq(weatherForecasts.type, 'daily')
            )
          )
          .limit(1);

        if (existingDay.length === 0) {
          // Daten aufbereiten
          const dayWeather = dayData.weather && dayData.weather.length > 0 ? dayData.weather[0] : null;
          
          const insertData: InsertWeatherForecast = {
            date: formattedDate,
            hour: formattedHour,
            type: 'daily',
            // Temperatur ist ein Objekt bei täglichen Daten
            temperature: dayData.temp.day,
            feels_like: dayData.feels_like.day,
            pressure: dayData.pressure,
            humidity: dayData.humidity,
            dew_point: dayData.dew_point,
            clouds: dayData.clouds,
            uvi: dayData.uvi,
            wind_speed: dayData.wind_speed,
            wind_deg: dayData.wind_deg,
            wind_gust: dayData.wind_gust,
            weather_id: dayWeather ? dayWeather.id : null,
            weather_main: dayWeather ? dayWeather.main : null,
            weather_description: dayWeather ? dayWeather.description : null,
            weather_icon: dayWeather ? dayWeather.icon : null,
            pop: dayData.pop,
            rain_1h: dayData.rain,
            snow_1h: dayData.snow,
            timestamp: dayData.dt,
            sunrise: dayData.sunrise,
            sunset: dayData.sunset,
            moonrise: dayData.moonrise,
            moonset: dayData.moonset,
            moon_phase: dayData.moon_phase,
            source: 'openweather',
            lat: forecastData.lat,
            lon: forecastData.lon,
            timezone: forecastData.timezone,
            timezone_offset: forecastData.timezone_offset,
            // Zusätzliche Temperaturdaten als JSON
            metadata: JSON.stringify({
              temp_min: dayData.temp.min,
              temp_max: dayData.temp.max,
              temp_night: dayData.temp.night,
              temp_eve: dayData.temp.eve,
              temp_morn: dayData.temp.morn,
              feels_like_night: dayData.feels_like.night,
              feels_like_eve: dayData.feels_like.eve,
              feels_like_morn: dayData.feels_like.morn
            })
          };

          // In die Datenbank einfügen
          await db.insert(weatherForecasts).values(insertData);
          result.saved++;
        } else {
          result.duplicates++;
        }
      }
    }

    // Die Vorhersage-Abdeckung aktualisieren
    await updateCoverageForType(WEATHER_TYPE.FORECAST);

    return result;
  } catch (error) {
    console.error('Fehler beim Speichern der Wettervorhersage:', error);
    return { 
      saved: result.saved, 
      duplicates: result.duplicates, 
      errors: 1, 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Speichert historische Wetterdaten in der Datenbank
 * 
 * @param historicalData API-Antwort mit historischen Wetterdaten
 * @returns Statistik zur Speicherung
 */
export async function saveHistoricalWeather(
  historicalData: any
): Promise<{ saved: number, duplicates: number, errors: number, status: string, message?: string }> {
  if (!historicalData || !historicalData.data || !Array.isArray(historicalData.data)) {
    return { 
      saved: 0, 
      duplicates: 0, 
      errors: 1, 
      status: 'error',
      message: 'Keine gültigen historischen Wetterdaten zum Speichern vorhanden'
    };
  }

  const result = {
    saved: 0,
    duplicates: 0,
    errors: 0,
    status: 'success'
  };

  try {
    // Jede Stunde verarbeiten
    for (const hourData of historicalData.data) {
      const hourDate = new Date(hourData.dt * 1000);
      const formattedDate = format(hourDate, 'yyyy-MM-dd');
      const formattedHour = format(hourDate, 'HH:00');

      // Prüfen, ob bereits Daten für diesen Zeitpunkt vorhanden sind
      const existingHour = await db.select({ id: weatherHistorical.id })
        .from(weatherHistorical)
        .where(
          and(
            eq(weatherHistorical.date, formattedDate),
            eq(weatherHistorical.hour, formattedHour)
          )
        )
        .limit(1);

      if (existingHour.length === 0) {
        // Daten aufbereiten
        const hourWeather = hourData.weather && hourData.weather.length > 0 ? hourData.weather[0] : null;
        
        const insertData: InsertWeatherHistorical = {
          date: formattedDate,
          hour: formattedHour,
          temperature: hourData.temp,
          feels_like: hourData.feels_like,
          pressure: hourData.pressure,
          humidity: hourData.humidity,
          dew_point: hourData.dew_point,
          clouds: hourData.clouds,
          visibility: hourData.visibility,
          wind_speed: hourData.wind_speed,
          wind_deg: hourData.wind_deg,
          wind_gust: hourData.wind_gust,
          weather_id: hourWeather ? hourWeather.id : null,
          weather_main: hourWeather ? hourWeather.main : null,
          weather_description: hourWeather ? hourWeather.description : null,
          weather_icon: hourWeather ? hourWeather.icon : null,
          rain_1h: hourData.rain ? hourData.rain['1h'] : null,
          snow_1h: hourData.snow ? hourData.snow['1h'] : null,
          timestamp: hourData.dt,
          sunrise: historicalData.sunrise || null,
          sunset: historicalData.sunset || null,
          source: 'openweather',
          lat: historicalData.lat,
          lon: historicalData.lon,
          timezone: historicalData.timezone,
          timezone_offset: historicalData.timezone_offset
        };

        // In die Datenbank einfügen
        await db.insert(weatherHistorical).values(insertData);
        result.saved++;
      } else {
        result.duplicates++;
      }
    }

    // Die historische Datenabdeckung aktualisieren
    await updateCoverageForType(WEATHER_TYPE.HISTORICAL);

    return result;
  } catch (error) {
    console.error('Fehler beim Speichern historischer Wetterdaten:', error);
    return { 
      saved: result.saved, 
      duplicates: result.duplicates, 
      errors: 1, 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Aktualisiert die Datenabdeckungsinformationen für Wetterdaten
 */
export async function updateWeatherDataCoverage(): Promise<void> {
  // Forecast-Abdeckung aktualisieren
  await updateCoverageForType(WEATHER_TYPE.FORECAST);
  
  // Historische Datenabdeckung aktualisieren
  await updateCoverageForType(WEATHER_TYPE.HISTORICAL);
}

/**
 * Aktuelle Wetterdaten für das Dashboard abrufen
 * 
 * @param location Standort (Stadt,Land-Code oder Koordinaten)
 * @returns Aufbereitete Wetterdaten für das Frontend
 */
export async function getCurrentWeather(location: string = 'Dresden,DE'): Promise<any> {
  if (!API_KEY) {
    console.error('OpenWeather API-Schlüssel fehlt');
    throw new Error('API-Schlüssel nicht konfiguriert');
  }

  try {
    // Koordinaten oder Stadtname?
    let lat, lon;
    
    if (location.includes(',')) {
      const [city, country] = location.split(',');
      
      // Anfrage an die Geocoding API, um Koordinaten für die Stadt zu erhalten
      const geocodeResponse = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
        params: {
          q: `${city},${country}`,
          limit: 1,
          appid: API_KEY
        }
      });
      
      if (geocodeResponse.data && geocodeResponse.data.length > 0) {
        lat = geocodeResponse.data[0].lat;
        lon = geocodeResponse.data[0].lon;
      } else {
        // Fallback auf Default-Koordinaten
        lat = DEFAULT_LAT;
        lon = DEFAULT_LON;
      }
    } else {
      // Verwende Default-Koordinaten
      lat = DEFAULT_LAT;
      lon = DEFAULT_LON;
    }

    // Aktuelle Wetterdaten abrufen
    const response = await axios.get(CURRENT_WEATHER_URL, {
      params: {
        lat,
        lon,
        appid: API_KEY,
        units: 'metric',
        lang: 'de'
      }
    });

    if (response.status !== 200) {
      throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
    }

    const data = response.data;
    const weather = data.weather && data.weather.length > 0 ? data.weather[0] : null;

    // Daten für das Frontend aufbereiten
    return {
      location: data.name,
      timestamp: new Date(data.dt * 1000).toISOString(),
      temperature: data.main.temp,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      windDirection: getWindDirection(data.wind.deg),
      description: weather ? weather.description : '',
      icon: weather ? weather.icon : ''
    };
  } catch (error) {
    console.error('Fehler beim Abrufen aktueller Wetterdaten:', error);
    throw error;
  }
}

/**
 * Wettervorhersage für das Dashboard abrufen
 * 
 * @param location Standort (Stadt,Land-Code oder Koordinaten)
 * @param days Anzahl der vorherzusagenden Tage
 * @returns Aufbereitete Wettervorhersage für das Frontend
 */
export async function getWeatherForecast(location: string = 'Dresden,DE', days: number = 5): Promise<any[]> {
  if (!API_KEY) {
    console.error('OpenWeather API-Schlüssel fehlt');
    throw new Error('API-Schlüssel nicht konfiguriert');
  }

  try {
    // Koordinaten oder Stadtname?
    let lat, lon;
    
    if (location.includes(',')) {
      const [city, country] = location.split(',');
      
      // Anfrage an die Geocoding API, um Koordinaten für die Stadt zu erhalten
      const geocodeResponse = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
        params: {
          q: `${city},${country}`,
          limit: 1,
          appid: API_KEY
        }
      });
      
      if (geocodeResponse.data && geocodeResponse.data.length > 0) {
        lat = geocodeResponse.data[0].lat;
        lon = geocodeResponse.data[0].lon;
      } else {
        // Fallback auf Default-Koordinaten
        lat = DEFAULT_LAT;
        lon = DEFAULT_LON;
      }
    } else {
      // Verwende Default-Koordinaten
      lat = DEFAULT_LAT;
      lon = DEFAULT_LON;
    }

    // Wettervorhersage abrufen
    const forecastData = await fetchWeatherForecast(lat, lon, 'metric', 'de');
    
    if (!forecastData || !forecastData.daily) {
      throw new Error('Keine Vorhersagedaten verfügbar');
    }

    // Nur die angeforderte Anzahl von Tagen zurückgeben
    const dailyForecasts = forecastData.daily.slice(0, days);

    // Daten für das Frontend aufbereiten
    return dailyForecasts.map((day: any) => {
      const weather = day.weather && day.weather.length > 0 ? day.weather[0] : null;
      
      return {
        date: new Date(day.dt * 1000).toISOString().split('T')[0],
        temperature: {
          min: day.temp.min,
          max: day.temp.max
        },
        humidity: day.humidity,
        description: weather ? weather.description : '',
        icon: weather ? weather.icon : ''
      };
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Wettervorhersage:', error);
    throw error;
  }
}

/**
 * Hilfsfunktion zur Umwandlung von Windrichtung in Grad zu Himmelsrichtung
 * 
 * @param degrees Windrichtung in Grad
 * @returns Windrichtung als Text (z.B. "N", "NO", usw.)
 */
function getWindDirection(degrees: number): string {
  const directions = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Hilfsfunktion: Aktualisiert Datenabdeckung für einen bestimmten Typ
 * 
 * @param dataType Der Datentyp (weather_forecast, weather_historical)
 */
async function updateCoverageForType(dataType: string): Promise<void> {
  try {
    let table;
    let dateField;
    
    // Bestimme Tabelle und Feld basierend auf Datentyp
    if (dataType === WEATHER_TYPE.FORECAST) {
      table = weatherForecasts;
      dateField = weatherForecasts.date;
    } else if (dataType === WEATHER_TYPE.HISTORICAL) {
      table = weatherHistorical;
      dateField = weatherHistorical.date;
    } else {
      console.error(`Ungültiger Datentyp: ${dataType}`);
      return;
    }

    // Statistiken abrufen
    const [earliestRecord] = await db.select({ date: dateField })
      .from(table)
      .orderBy(sql`${dateField} ASC`)
      .limit(1);

    const [latestRecord] = await db.select({ date: dateField })
      .from(table)
      .orderBy(sql`${dateField} DESC`)
      .limit(1);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(table);

    // Speichere oder aktualisiere Datensatz
    const existingCoverage = await db.select()
      .from(dataCoverage)
      .where(eq(dataCoverage.data_type, dataType));

    const coverageData = {
      data_type: dataType,
      earliest_date: earliestRecord?.date || null,
      latest_date: latestRecord?.date || null,
      data_points: countResult?.count || 0,
      data_quality: 100, // Standardmäßig 100%
      coverage_percentage: 100, // Standardmäßig 100%
      last_sync: new Date()
    };

    if (existingCoverage.length === 0) {
      await db.insert(dataCoverage).values(coverageData);
    } else {
      await db.update(dataCoverage)
        .set(coverageData)
        .where(eq(dataCoverage.data_type, dataType));
    }
  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Datenabdeckung für ${dataType}:`, error);
  }
}

/**
 * Synchronisiert Wettervorhersagedaten
 * 
 * @param lat Breitengrad
 * @param lon Längengrad
 * @returns Synchronisationsergebnis
 */
export async function syncWeatherForecast(
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<{ saved: number, duplicates: number, errors: number, status: string, message?: string }> {
  try {
    console.log(`Hole Wettervorhersage für Koordinaten: ${lat}, ${lon}`);
    
    // Wetterdaten abrufen
    const forecastData = await fetchWeatherForecast(lat, lon);
    
    if (!forecastData) {
      return {
        saved: 0,
        duplicates: 0,
        errors: 1,
        status: 'error',
        message: 'Keine Wettervorhersagedaten abgerufen'
      };
    }
    
    // Daten speichern
    console.log('Speichere Wettervorhersagedaten in der Datenbank');
    const result = await saveWeatherForecast(forecastData);
    
    return result;
  } catch (error) {
    console.error('Fehler bei der Wettervorhersage-Synchronisation:', error);
    return {
      saved: 0,
      duplicates: 0,
      errors: 1,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler bei der Wettervorhersage-Synchronisation'
    };
  }
}

/**
 * Synchronisiert historische Wetterdaten für einen bestimmten Tag
 * 
 * @param date Datum für historische Daten
 * @param lat Breitengrad
 * @param lon Längengrad
 * @returns Synchronisationsergebnis
 */
export async function syncHistoricalWeather(
  date: string | Date | number,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<{ saved: number, duplicates: number, errors: number, status: string, message?: string }> {
  try {
    console.log(`Hole historische Wetterdaten für Datum ${date} und Koordinaten: ${lat}, ${lon}`);
    
    // Wetterdaten abrufen
    const historicalData = await fetchHistoricalWeather(date, lat, lon);
    
    if (!historicalData) {
      return {
        saved: 0,
        duplicates: 0,
        errors: 1,
        status: 'error',
        message: 'Keine historischen Wetterdaten abgerufen'
      };
    }
    
    // Daten speichern
    console.log('Speichere historische Wetterdaten in der Datenbank');
    const result = await saveHistoricalWeather(historicalData);
    
    return result;
  } catch (error) {
    console.error('Fehler bei der historischen Wetterdaten-Synchronisation:', error);
    return {
      saved: 0,
      duplicates: 0,
      errors: 1,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler bei der historischen Wetterdaten-Synchronisation'
    };
  }
}

/**
 * Gibt die Daten zurück, für die keine historischen Wetterdaten vorhanden sind
 * 
 * @param startDate Das Startdatum
 * @param endDate Das Enddatum (Standard: heute)
 * @returns Array von fehlenden Daten im Format 'YYYY-MM-DD'
 */
export async function getMissingHistoricalWeatherDates(
  startDate: string | Date,
  endDate: string | Date = new Date()
): Promise<string[]> {
  try {
    // Datumskonvertierung
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    
    if (!isValid(start) || !isValid(end)) {
      throw new Error('Ungültiges Datum');
    }
    
    // Alle Tage im angegebenen Zeitraum generieren
    const allDates: string[] = [];
    let currentDate = start;
    
    while (isBefore(currentDate, end) || currentDate.getTime() === end.getTime()) {
      allDates.push(format(currentDate, 'yyyy-MM-dd'));
      currentDate = addDays(currentDate, 1);
    }
    
    // Vorhandene Daten abfragen
    const existingDates = await db
      .select({
        date: weatherHistorical.date
      })
      .from(weatherHistorical)
      .where(
        and(
          gte(weatherHistorical.date, format(start, 'yyyy-MM-dd')),
          lte(weatherHistorical.date, format(end, 'yyyy-MM-dd'))
        )
      )
      .groupBy(weatherHistorical.date);
    
    // Vorhandene Daten in Set umwandeln für schnelle Suche
    const existingDatesSet = new Set(existingDates.map(record => format(record.date, 'yyyy-MM-dd')));
    
    // Fehlende Daten ermitteln
    const missingDates = allDates.filter(date => !existingDatesSet.has(date));
    
    return missingDates;
  } catch (error) {
    console.error('Fehler beim Abrufen fehlender historischer Wetterdaten:', error);
    throw error;
  }
}

/**
 * Berechnet die Sonnenlichtdauer (Tageslicht) in Stunden
 * 
 * @param sunrise Sonnenaufgang (UNIX-Timestamp)
 * @param sunset Sonnenuntergang (UNIX-Timestamp)
 * @returns Sonnenlichtdauer in Stunden
 */
export function calculateDaylightDuration(sunrise: number, sunset: number): number {
  if (!sunrise || !sunset) return 0;
  
  // Berechne die Differenz in Sekunden
  const daylightSeconds = sunset - sunrise;
  
  // Umrechnung in Stunden
  return daylightSeconds / 3600;
}

/**
 * Abrufen von historischen Wetterdaten seit 01.01.2023 mit API-Limitierung
 * 
 * @param batchSize Anzahl der Tage pro Batch (Default: 20 Tage, um unter dem täglichen Limit zu bleiben)
 * @returns Synchronisationsergebnisse
 */
export async function syncHistoricalWeatherFrom2023(
  batchSize: number = 20
): Promise<{ status: string, message: string, processedDays: number, totalMissingDays: number }> {
  try {
    // Startdatum: 01.01.2023
    const startDate = new Date(2023, 0, 1); // JavaScript Monate sind 0-basiert, also 0 = Januar
    const endDate = new Date(); // Heute
    
    console.log(`Starte umfangreiche historische Wettersynchronisation von ${format(startDate, 'yyyy-MM-dd')} bis ${format(endDate, 'yyyy-MM-dd')}`);
    
    // Fehlende Daten für den gesamten Zeitraum ermitteln
    const missingDates = await getMissingHistoricalWeatherDates(startDate, endDate);
    const totalMissingDays = missingDates.length;
    
    console.log(`Insgesamt ${totalMissingDays} fehlende Tage gefunden.`);
    
    if (totalMissingDays === 0) {
      return { 
        status: 'success', 
        message: 'Keine fehlenden historischen Wetterdaten gefunden.', 
        processedDays: 0,
        totalMissingDays: 0
      };
    }
    
    // Die Anzahl der Tage, die in diesem Durchlauf verarbeitet werden sollen, begrenzen
    const datesToProcess = missingDates.slice(0, batchSize);
    
    console.log(`Verarbeite ${datesToProcess.length} Tage in diesem Durchlauf, um das API-Limit nicht zu überschreiten.`);
    
    // Verarbeite jeden Tag einzeln
    const results = [];
    
    for (const date of datesToProcess) {
      console.log(`Synchronisiere historische Wetterdaten für ${date}`);
      const result = await syncHistoricalWeather(date);
      results.push({ date, result });
      
      // Kurze Pause zwischen den API-Anfragen, um die Rate zu begrenzen
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return {
      status: 'success',
      message: `Historische Wetterdaten für ${datesToProcess.length} Tage erfolgreich synchronisiert. Noch ${totalMissingDays - datesToProcess.length} Tage ausstehend.`,
      processedDays: datesToProcess.length,
      totalMissingDays
    };
  } catch (error) {
    console.error('Fehler bei der historischen Wetterdaten-Synchronisation seit 2023:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      processedDays: 0,
      totalMissingDays: 0
    };
  }
}

/**
 * Synchronisiert fehlende historische Wetterdaten für einen Zeitraum
 * 
 * @param startDate Das Startdatum
 * @param endDate Das Enddatum (Standard: heute)
 * @param maxDays Maximale Anzahl der zu synchronisierenden Tage (Default: 20)
 * @returns Synchronisationsergebnisse pro fehlendem Datum
 */
export async function syncMissingHistoricalWeather(
  startDate: string | Date,
  endDate: string | Date = new Date(),
  maxDays: number = 20,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<Array<{ date: string, result: any }>> {
  try {
    console.log(`Prüfe auf fehlende historische Wetterdaten von ${startDate} bis ${endDate}`);
    
    // Fehlende Daten abrufen
    const missingDates = await getMissingHistoricalWeatherDates(startDate, endDate);
    
    console.log(`${missingDates.length} fehlende Daten gefunden`);
    
    // Begrenzen auf maxDays
    const datesToSync = missingDates.slice(0, maxDays);
    
    console.log(`Synchronisiere ${datesToSync.length} Tage`);
    
    // Jeden fehlenden Tag synchronisieren
    const results = [];
    
    for (const date of datesToSync) {
      console.log(`Synchronisiere historische Wetterdaten für ${date}`);
      const result = await syncHistoricalWeather(date, lat, lon);
      results.push({ date, result });
      
      // Kurze Pause zwischen den API-Anfragen, um die Rate zu begrenzen
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return results;
  } catch (error) {
    console.error('Fehler bei der Synchronisation fehlender historischer Wetterdaten:', error);
    throw error;
  }
}

// Hilfsfunktionen für Datenbankabfragen
function gte(field: any, value: any) {
  return sql`${field} >= ${value}`;
}

function lte(field: any, value: any) {
  return sql`${field} <= ${value}`;
}

/**
 * Batch-Synchronisierung historischer Wetterdaten für einen Zeitraum
 * Speziell für den Abruf historischer Daten seit 01.01.2023
 * 
 * @param startDate Startdatum (default: 01.01.2023)
 * @param endDate Enddatum (default: heute)
 * @param batchSize Anzahl der Tage pro Synchronisationslauf
 * @returns Synchronisationsergebnis
 */
export async function syncHistoricalWeatherBatch(
  startDate: string | Date = '2023-01-01',
  endDate: string | Date = new Date(),
  batchSize: number = 10
): Promise<{ saved: number, duplicates: number, errors: number, status: string, message?: string, isComplete?: boolean }> {
  try {
    // Startdatum und Enddatum parsen
    let startDateTime: Date;
    let endDateTime: Date;
    
    if (typeof startDate === 'string') {
      startDateTime = parseISO(startDate);
      if (!isValid(startDateTime)) {
        throw new Error(`Ungültiges Startdatum: ${startDate}`);
      }
    } else {
      startDateTime = startDate;
    }
    
    if (typeof endDate === 'string') {
      endDateTime = parseISO(endDate);
      if (!isValid(endDateTime)) {
        throw new Error(`Ungültiges Enddatum: ${endDate}`);
      }
    } else {
      endDateTime = endDate;
    }
    
    // Prüfen, ob ein früheres Datum als der 01.01.2023 angegeben wurde
    const minDate = parseISO('2023-01-01');
    if (isBefore(startDateTime, minDate)) {
      console.log(`[OpenWeather] Startdatum wurde auf das Mindestdatum (01.01.2023) gesetzt`);
      startDateTime = minDate;
    }
    
    // Endatum auf heute begrenzen, falls es in der Zukunft liegt
    const now = new Date();
    if (isAfter(endDateTime, now)) {
      endDateTime = now;
    }
    
    // Lücken finden: Tage, die noch nicht in der Datenbank sind
    type DateCount = {
      date: string;
      count: number;
    };
    
    const existingDates = await db.select({
      date: weatherHistorical.date,
      count: sql`count(*)::int`.as('count')
    })
    .from(weatherHistorical)
    .where(
      and(
        gte(weatherHistorical.date, format(startDateTime, 'yyyy-MM-dd')),
        lte(weatherHistorical.date, format(endDateTime, 'yyyy-MM-dd'))
      )
    )
    .groupBy(weatherHistorical.date) as DateCount[];
    
    // Lücken identifizieren
    const datesWithGaps: Date[] = [];
    let currentDate = startOfDay(startDateTime);
    
    while (!isAfter(currentDate, endDateTime)) {
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      const existingDate = existingDates.find(d => d.date === formattedDate);
      
      // Wenn keine Daten oder unvollständige Daten für diesen Tag vorhanden sind
      const count = existingDate ? Number(existingDate.count) : 0;
      if (!existingDate || count < 24) {
        datesWithGaps.push(currentDate);
      }
      
      // Zum nächsten Tag gehen
      currentDate = addDays(currentDate, 1);
    }
    
    // Wenn alle Daten vorhanden sind, sind wir fertig
    if (datesWithGaps.length === 0) {
      console.log('[OpenWeather] Alle historischen Wetterdaten für den angegebenen Zeitraum sind bereits vorhanden');
      return {
        saved: 0,
        duplicates: 0,
        errors: 0,
        status: 'success',
        message: 'Keine fehlenden Daten für den angegebenen Zeitraum',
        isComplete: true
      };
    }
    
    // Sortieren: älteste Daten zuerst
    datesWithGaps.sort((a, b) => a.getTime() - b.getTime());
    
    console.log(`[OpenWeather] ${datesWithGaps.length} Tage mit fehlenden historischen Wetterdaten gefunden`);
    console.log(`[OpenWeather] Synchronisiere Batch von maximal ${batchSize} Tagen`);
    
    // Batch für diese Synchronisierung auswählen
    const batchToSync = datesWithGaps.slice(0, batchSize);
    
    // Statistik für die Synchronisierung
    const stats = {
      totalDays: batchToSync.length,
      successfulDays: 0,
      failedDays: 0,
      totalSaved: 0,
      totalDuplicates: 0,
      errors: 0
    };
    
    // Historische Daten für jeden Tag im Batch abrufen
    for (const date of batchToSync) {
      try {
        const result = await syncHistoricalWeather(date);
        
        stats.totalSaved += result.saved;
        stats.totalDuplicates += result.duplicates;
        
        if (result.status === 'success' || result.status === 'partial') {
          stats.successfulDays++;
        } else {
          stats.failedDays++;
          stats.errors += result.errors;
        }
        
        // Kurze Pause, um die API nicht zu überlasten
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[OpenWeather] Fehler beim Abrufen historischer Wetterdaten für ${format(date, 'yyyy-MM-dd')}:`, error);
        stats.failedDays++;
        stats.errors++;
      }
    }
    
    // Abdeckungsinformationen aktualisieren
    await updateCoverageForType(WEATHER_TYPE.HISTORICAL);
    
    return {
      saved: stats.totalSaved,
      duplicates: stats.totalDuplicates,
      errors: stats.errors,
      status: stats.errors > 0 ? 'partial' : 'success',
      message: `${stats.successfulDays}/${stats.totalDays} Tage erfolgreich synchronisiert`,
      isComplete: datesWithGaps.length <= batchSize // True, wenn alle verbleibenden Lücken in diesem Batch bearbeitet wurden
    };
  } catch (error) {
    console.error('[OpenWeather] Fehler bei der Batch-Synchronisierung historischer Wetterdaten:', error);
    return {
      saved: 0,
      duplicates: 0,
      errors: 1,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      isComplete: false
    };
  }
}
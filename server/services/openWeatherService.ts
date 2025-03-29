/**
 * OpenWeather API Service
 * 
 * Dieses Modul stellt Funktionen für den Zugriff auf die OpenWeather API bereit.
 * Es unterstützt aktuelle Wetterdaten, Wettervorhersagen und historische Wetterdaten.
 * Die Daten werden in der Datenbank gespeichert und können für Analysen verwendet werden.
 * 
 * API-Dokumentation: https://openweathermap.org/api/one-call-3
 */

import axios from 'axios';
import { db } from '../db';
import { eq, sql, and, gt, lt, between, desc, asc } from 'drizzle-orm';
import { weatherForecasts, InsertWeatherForecast, weatherHistorical, InsertWeatherHistorical, dataCoverage } from '@shared/schema';
import { format, parseISO, isValid, subDays, addDays, isBefore, isAfter } from 'date-fns';

// API-Konfiguration
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall';

// Default-Koordinaten für Bad Schandau
const DEFAULT_LAT = 50.9196; // Bad Schandau
const DEFAULT_LON = 14.1524; // Bad Schandau

// Wetter-Typen für die Datenabdeckungs-Tabelle
export const WEATHER_TYPE = {
  FORECAST: 'weather_forecast',
  HISTORICAL: 'weather_historical'
};

/**
 * Aktuelle Wetterdaten und Vorhersage abrufen
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
    console.error('OpenWeather API-Schlüssel fehlt');
    return null;
  }

  try {
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
      console.error(`OpenWeather API-Fehler: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Fehler beim Abrufen der Wettervorhersage:', error);
    return null;
  }
}

/**
 * Historische Wetterdaten abrufen
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
    console.error('OpenWeather API-Schlüssel fehlt');
    return null;
  }

  // Umwandlung des Datums in Unix-Timestamp
  let timestamp: number;
  
  if (typeof date === 'number') {
    timestamp = date;
  } else if (typeof date === 'string') {
    const parsedDate = parseISO(date);
    if (isValid(parsedDate)) {
      timestamp = Math.floor(parsedDate.getTime() / 1000);
    } else {
      console.error('Ungültiges Datumsformat:', date);
      return null;
    }
  } else if (date instanceof Date) {
    timestamp = Math.floor(date.getTime() / 1000);
  } else {
    console.error('Ungültiges Datumsformat:', date);
    return null;
  }

  try {
    const response = await axios.get(`${BASE_URL}/timemachine`, {
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
      console.error(`OpenWeather API-Fehler: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error(`Fehler beim Abrufen historischer Wetterdaten für Datum ${date}:`, error);
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
/**
 * MeteoStat Service für Wetterdaten
 * 
 * Dieser Service stellt Funktionen bereit, um historische Wetterdaten von der Meteostat API abzurufen
 * und in der Datenbank zu speichern.
 */

import axios from 'axios';
import { db } from '../db';
import { weatherData, dataCoverage, insertWeatherDataSchema, insertDataCoverageSchema } from '@shared/schema';
import { eq, and, between, count } from 'drizzle-orm';
import { format, parseISO, isValid, addDays, subDays, isAfter, addHours } from 'date-fns';

// API Konfiguration
const API_KEY = process.env.METEOSTAT_API_KEY || "a00f5cc7e6mshc7686b3b2a5c6e8p179e6cjsn27bace69f047";
const BASE_URL = "https://meteostat.p.rapidapi.com/stations/hourly";
const DEFAULT_STATION_ID = "10591"; // Station Dresden

/**
 * Abrufen von stündlichen Wetterdaten für einen bestimmten Zeitraum
 * 
 * Diese Funktion holt ALLE verfügbaren Datenpunkte von der Meteostat API.
 * Sie kann mit langen Zeiträumen umgehen und führt automatisch mehrere Anfragen durch,
 * um alle Daten zu erhalten, indem sie den Zeitraum in überschaubare Abschnitte unterteilt.
 * 
 * @param startDate Startdatum im Format YYYY-MM-DD
 * @param endDate Enddatum im Format YYYY-MM-DD
 * @param stationId Stations-ID (default: Dresden)
 * @param timezone Zeitzone (default: Europe/Berlin)
 * @param maxDaysPerRequest Maximale Anzahl von Tagen pro API-Anfrage (Standard: 31)
 * @returns Array von Wetterdatensätzen oder null bei Fehler
 */
export async function fetchHourlyWeatherData(
  startDate: string | Date,
  endDate: string | Date,
  stationId: string = DEFAULT_STATION_ID,
  timezone: string = "Europe/Berlin",
  maxDaysPerRequest: number = 31
): Promise<any[] | null> {
  try {
    // Formatiere Datumswerte in das erwartete Format YYYY-MM-DD
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');

    // Konvertiere zu Date-Objekten für die Berechnung
    const startDateObj = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const endDateObj = typeof endDate === 'string' ? parseISO(endDate) : endDate;

    // Berechne die Anzahl der Tage zwischen Start- und Enddatum
    const daysDifference = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`Rufe Wetterdaten ab für Zeitraum ${formattedStartDate} bis ${formattedEndDate} (${daysDifference} Tage) von Station ${stationId}`);

    // Wenn der Zeitraum zu lang ist, unterteile ihn in mehrere Anfragen
    if (daysDifference > maxDaysPerRequest) {
      console.log(`Zeitraum zu lang (${daysDifference} Tage), unterteile in kleinere Abschnitte`);
      
      // Sammle alle Datenpunkte
      const allData: any[] = [];
      let currentStartDate = startDateObj;
      
      // Iteriere durch alle Teilzeiträume
      while (currentStartDate <= endDateObj) {
        // Berechne das Enddatum für den aktuellen Teilzeitraum
        const currentEndDate = new Date(currentStartDate);
        currentEndDate.setDate(currentEndDate.getDate() + maxDaysPerRequest - 1);
        
        // Stelle sicher, dass das Enddatum nicht über das eigentliche Enddatum hinausgeht
        if (currentEndDate > endDateObj) {
          currentEndDate.setTime(endDateObj.getTime());
        }
        
        // Formatiere die Daten für die API-Anfrage
        const formattedSubStartDate = format(currentStartDate, 'yyyy-MM-dd');
        const formattedSubEndDate = format(currentEndDate, 'yyyy-MM-dd');
        
        console.log(`Abrufen des Teilzeitraums: ${formattedSubStartDate} bis ${formattedSubEndDate}`);
        
        // Führe die API-Anfrage für den Teilzeitraum durch
        const partialData = await fetchWeatherDataSegment(
          formattedSubStartDate,
          formattedSubEndDate,
          stationId,
          timezone
        );
        
        // Wenn Daten erhalten wurden, füge sie zur Gesamtliste hinzu
        if (partialData && partialData.length > 0) {
          console.log(`${partialData.length} Datensätze für Teilzeitraum erhalten`);
          allData.push(...partialData);
        } else {
          console.warn(`Keine Daten für Teilzeitraum ${formattedSubStartDate} bis ${formattedSubEndDate} erhalten`);
        }
        
        // Setze das Startdatum für den nächsten Teilzeitraum
        currentStartDate.setDate(currentStartDate.getDate() + maxDaysPerRequest);
      }
      
      console.log(`Insgesamt ${allData.length} Wetterdatensätze erhalten`);
      return allData.length > 0 ? allData : null;
    } else {
      // Für kurze Zeiträume direkt eine einzige Anfrage senden
      return await fetchWeatherDataSegment(formattedStartDate, formattedEndDate, stationId, timezone);
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Wetterdaten:", error);
    return null;
  }
}

/**
 * Hilfsfunktion: Ruft Wetterdaten für einen bestimmten Zeitraumsegment ab
 * 
 * @param startDate Startdatum im Format YYYY-MM-DD
 * @param endDate Enddatum im Format YYYY-MM-DD
 * @param stationId Stations-ID
 * @param timezone Zeitzone
 * @returns Array von Wetterdatensätzen oder null bei Fehler
 */
async function fetchWeatherDataSegment(
  startDate: string,
  endDate: string,
  stationId: string,
  timezone: string
): Promise<any[] | null> {
  try {
    // Parameter für die API-Anfrage
    const params = {
      station: stationId,
      start: startDate,
      end: endDate,
      tz: timezone
    };

    // Header mit API-Schlüssel
    const headers = {
      "x-rapidapi-host": "meteostat.p.rapidapi.com",
      "x-rapidapi-key": API_KEY
    };

    // API-Anfrage senden
    const response = await axios.get(BASE_URL, {
      headers,
      params
    });

    // Überprüfung und Verarbeitung der Antwort
    if (response.status === 200 && response.data && response.data.data) {
      console.log(`${response.data.data.length} Wetterdatensätze für Zeitraum ${startDate} bis ${endDate} erhalten`);
      return response.data.data;
    } else {
      console.error(`Fehler bei der API-Anfrage für Zeitraum ${startDate} bis ${endDate}: Keine Daten erhalten`, response.status);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Abrufen der Wetterdaten für Zeitraum ${startDate} bis ${endDate}:`, error);
    return null;
  }
}

/**
 * Speichert Wetterdaten in der Datenbank
 * 
 * @param weatherRecords Array von Wetterdatensätzen von der API
 * @param source Datenquelle (historical, forecast)
 * @param stationId Stations-ID
 * @param stationName Stationsname
 * @returns Anzahl der gespeicherten Datensätze
 */
export async function saveWeatherData(
  weatherRecords: any[],
  source: string = "historical",
  stationId: string = DEFAULT_STATION_ID,
  stationName: string = "Dresden"
): Promise<{ saved: number; errors: number; duplicates: number }> {
  let saved = 0;
  let errors = 0;
  let duplicates = 0;
  
  // Prüfen ob Daten vorhanden sind
  if (!weatherRecords || weatherRecords.length === 0) {
    console.warn("Keine Wetterdaten zum Speichern vorhanden");
    return { saved, errors, duplicates };
  }

  console.log(`Speichere ${weatherRecords.length} Wetterdatensätze in die Datenbank`);

  for (const record of weatherRecords) {
    try {
      // ISO Datum aus Zeit und Datum erstellen
      const timestampStr = record.time;
      
      if (!timestampStr) {
        console.error("Zeitstempel fehlt im Datensatz:", record);
        errors++;
        continue;
      }
      
      const timestamp = parseISO(timestampStr);
      
      if (!isValid(timestamp)) {
        console.error("Ungültiger Zeitstempel:", timestampStr);
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
          eq(weatherData.station_id, stationId)
        )
      });

      if (existingRecord) {
        // Wenn der Datensatz bereits existiert, überspringen
        duplicates++;
        continue;
      }

      // Wetterdaten-Objekt erstellen und speichern
      const weatherDataObj = insertWeatherDataSchema.parse({
        timestamp,
        date,
        hour,
        temp: record.temp,
        feels_like: record.feels_like,
        temp_min: record.temp_min,
        temp_max: record.temp_max,
        pressure: record.pres,
        humidity: record.rhum,
        wind_speed: record.wspd,
        wind_deg: record.wdir,
        wind_gust: record.gust,
        clouds: record.coco,
        visibility: record.vis,
        precipitation: record.prcp,
        rain_1h: record.prcp,
        snow_1h: record.snow,
        weather_id: null,
        weather_main: null,
        weather_description: null,
        weather_icon: null,
        source,
        station_id: stationId,
        station_name: stationName,
        country: "DE",
        metadata: JSON.stringify(record),
        sync_status: "completed"
      });

      await db.insert(weatherData).values(weatherDataObj);
      saved++;
    } catch (error) {
      console.error("Fehler beim Speichern des Wetterdatensatzes:", error);
      errors++;
    }
  }

  console.log(`Gespeichert: ${saved}, Fehler: ${errors}, Duplikate: ${duplicates}`);
  
  // Aktualisiere die Datenabdeckungsinformationen
  await updateWeatherDataCoverage();
  
  return { saved, errors, duplicates };
}

/**
 * Aktualisiert die Datenabdeckungsinformationen für Wetterdaten
 */
export async function updateWeatherDataCoverage(): Promise<void> {
  try {
    // Gesamtanzahl der Wetterdatensätze
    const totalCountResult = await db.select({ count: count() }).from(weatherData);
    const totalCount = totalCountResult[0]?.count || 0;

    if (totalCount === 0) {
      console.log("Keine Wetterdaten vorhanden, überspringe Abdeckungsberechnung");
      return;
    }

    // Frühestes und spätestes Datum ermitteln
    const earliestRecord = await db.query.weatherData.findFirst({
      orderBy: (weatherData, { asc }) => [asc(weatherData.date)]
    });

    const latestRecord = await db.query.weatherData.findFirst({
      orderBy: (weatherData, { desc }) => [desc(weatherData.date)]
    });

    if (!earliestRecord || !latestRecord) {
      console.error("Keine Wetterdaten für Abdeckungsberechnung gefunden");
      return;
    }

    const earliestDate = earliestRecord.date;
    const latestDate = latestRecord.date;

    // Prüfen, ob bereits ein Datensatz für Wetterabdeckung existiert
    const existingCoverage = await db.query.dataCoverage.findFirst({
      where: eq(dataCoverage.data_type, "weather")
    });

    // Datenbankoperationen je nach Existenz des Datensatzes
    if (existingCoverage) {
      await db.update(dataCoverage)
        .set({
          earliest_date: earliestDate,
          latest_date: latestDate,
          data_points: totalCount,
          last_sync: new Date()
        })
        .where(eq(dataCoverage.data_type, "weather"));
    } else {
      const coverageData = insertDataCoverageSchema.parse({
        data_type: "weather",
        earliest_date: earliestDate,
        latest_date: latestDate,
        data_points: totalCount,
        last_sync: new Date()
      });

      await db.insert(dataCoverage).values(coverageData);
    }

    console.log(`Wetterabdeckung aktualisiert: ${earliestDate} bis ${latestDate}, ${totalCount} Datenpunkte`);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Wetterabdeckung:", error);
  }
}

/**
 * Synchronisiert Wetterdaten für einen bestimmten Zeitraum
 * 
 * @param startDate Startdatum im Format YYYY-MM-DD oder Date-Objekt
 * @param endDate Enddatum im Format YYYY-MM-DD oder Date-Objekt
 * @param stationId Stations-ID (default: Dresden)
 * @returns Synchronisationsergebnis
 */
export async function syncWeatherData(
  startDate: string | Date,
  endDate: string | Date,
  stationId: string = DEFAULT_STATION_ID
): Promise<{ status: string; saved: number; errors: number; duplicates: number; message?: string }> {
  try {
    console.log(`Starte Wettersynchronisation für Zeitraum ${startDate} bis ${endDate}`);
    
    // Wetterdaten abrufen
    const weatherData = await fetchHourlyWeatherData(startDate, endDate, stationId);
    
    if (!weatherData) {
      return { 
        status: "error", 
        saved: 0, 
        errors: 0, 
        duplicates: 0, 
        message: "Keine Wetterdaten von der API erhalten" 
      };
    }
    
    // Wetterdaten speichern
    const { saved, errors, duplicates } = await saveWeatherData(weatherData, "historical", stationId);
    
    return {
      status: errors > 0 ? "warning" : "success",
      saved,
      errors,
      duplicates,
      message: `${saved} Wetterdatensätze synchronisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler`
    };
  } catch (error) {
    console.error("Fehler bei der Wettersynchronisation:", error);
    return {
      status: "error",
      saved: 0,
      errors: 1,
      duplicates: 0,
      message: `Fehler bei der Wettersynchronisation: ${error}`
    };
  }
}

/**
 * Prüft, ob für ein bestimmtes Datum Wetterdaten vorhanden sind
 * 
 * @param date Datum im Format YYYY-MM-DD oder Date-Objekt
 * @param stationId Stations-ID (default: Dresden)
 * @returns true wenn Daten vorhanden sind, sonst false
 */
export async function hasWeatherDataForDate(
  date: string | Date,
  stationId: string = DEFAULT_STATION_ID
): Promise<boolean> {
  try {
    const formattedDate = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
    
    const existingRecords = await db.select({ count: count() })
      .from(weatherData)
      .where(and(
        eq(weatherData.date, formattedDate),
        eq(weatherData.station_id, stationId)
      ));
    
    return (existingRecords[0]?.count || 0) > 0;
  } catch (error) {
    console.error("Fehler beim Prüfen der Wetterdaten:", error);
    return false;
  }
}

/**
 * Gibt die Datenbereiche zurück, für die keine Wetterdaten vorhanden sind
 * 
 * @param startDate Startdatum im Format YYYY-MM-DD oder Date-Objekt
 * @param endDate Enddatum im Format YYYY-MM-DD oder Date-Objekt
 * @param stationId Stations-ID (default: Dresden)
 * @returns Array von Zeiträumen [{ start, end }] ohne Wetterdaten
 */
export async function getMissingWeatherDataRanges(
  startDate: string | Date,
  endDate: string | Date,
  stationId: string = DEFAULT_STATION_ID
): Promise<{ start: string; end: string }[]> {
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    
    if (!isValid(start) || !isValid(end)) {
      throw new Error("Ungültige Datumsangaben");
    }
    
    // Alle vorhandenen Datenpunkte im angegebenen Zeitraum abrufen
    const existingDates = await db.select({ date: weatherData.date })
      .from(weatherData)
      .where(and(
        between(weatherData.date, format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        eq(weatherData.station_id, stationId)
      ))
      .groupBy(weatherData.date);
    
    // Alle vorhandenen Datumswerte in ein Set umwandeln für schnelle Lookups
    const existingDatesSet = new Set(existingDates.map(record => record.date));
    
    // Fehlende Datumswerte identifizieren
    const missingRanges: { start: string; end: string }[] = [];
    let currentStart: Date | null = null;
    
    // Jeden Tag im Zeitraum prüfen
    let currentDate = start;
    while (!isAfter(currentDate, end)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      
      if (!existingDatesSet.has(dateStr)) {
        // Beginn eines fehlenden Bereichs
        if (currentStart === null) {
          currentStart = currentDate;
        }
      } else if (currentStart !== null) {
        // Ende eines fehlenden Bereichs
        missingRanges.push({
          start: format(currentStart, 'yyyy-MM-dd'),
          end: format(subDays(currentDate, 1), 'yyyy-MM-dd')
        });
        currentStart = null;
      }
      
      currentDate = addDays(currentDate, 1);
    }
    
    // Wenn der letzte Bereich bis zum Ende geht
    if (currentStart !== null) {
      missingRanges.push({
        start: format(currentStart, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd')
      });
    }
    
    return missingRanges;
  } catch (error) {
    console.error("Fehler beim Ermitteln fehlender Wetterdaten:", error);
    return [];
  }
}

/**
 * Prüft und synchronisiert fehlende Wetterdaten für einen Zeitraum
 * 
 * @param startDate Startdatum im Format YYYY-MM-DD oder Date-Objekt
 * @param endDate Enddatum im Format YYYY-MM-DD oder Date-Objekt
 * @param stationId Stations-ID (default: Dresden)
 * @returns Synchronisationsergebnisse pro fehlendem Bereich
 */
export async function syncMissingWeatherData(
  startDate: string | Date,
  endDate: string | Date,
  stationId: string = DEFAULT_STATION_ID
): Promise<{ ranges: { start: string; end: string; result: any }[] }> {
  try {
    console.log(`Prüfe auf fehlende Wetterdaten im Zeitraum ${startDate} bis ${endDate}`);
    
    // Fehlende Datenbereiche ermitteln
    const missingRanges = await getMissingWeatherDataRanges(startDate, endDate, stationId);
    
    if (missingRanges.length === 0) {
      console.log("Keine fehlenden Wetterdaten im angegebenen Zeitraum");
      return { ranges: [] };
    }
    
    console.log(`${missingRanges.length} fehlende Wetterdatenbereiche gefunden`);
    
    // Jeden fehlenden Bereich synchronisieren
    const results = [];
    for (const range of missingRanges) {
      console.log(`Synchronisiere fehlenden Bereich: ${range.start} bis ${range.end}`);
      const result = await syncWeatherData(range.start, range.end, stationId);
      results.push({
        start: range.start,
        end: range.end,
        result
      });
    }
    
    return { ranges: results };
  } catch (error) {
    console.error("Fehler bei der Synchronisation fehlender Wetterdaten:", error);
    return { ranges: [] };
  }
}
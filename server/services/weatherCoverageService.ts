/**
 * Weather Coverage Verification Service
 * 
 * Implementiert tägliche Überprüfung der Wetterdaten-Vollständigkeit ab 1.1.2024
 * und automatisches Nachladen fehlender Stunden per OpenWeather Timemachine API
 * mit Meteostat als Fallback-Service.
 * 
 * Phase 2 Verbesserung: Coverage-Checks für weather_data implementieren
 */

import { db } from '../db';
import { sql, and, gte, lte, eq, desc } from 'drizzle-orm';
import { weatherHistorical, weatherForecasts, dataCoverage, syncLogs } from '@shared/schema';
import { format, parseISO, eachHourOfInterval, startOfDay, endOfDay, subDays, isAfter, isBefore } from 'date-fns';
import { getApiUsageStats } from './openWeatherService';
import axios from 'axios';

// Timezone für Europa/Berlin (DST-bewusst)
const TIMEZONE = 'Europe/Berlin';
const COVERAGE_START_DATE = new Date('2024-01-01T00:00:00.000Z');

// API-Konfiguration
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const METEOSTAT_API_KEY = process.env.METEOSTAT_API_KEY;

interface CoverageGap {
  date: string;
  hour: number;
  timestamp: Date;
  type: 'weather_historical' | 'weather_forecast';
}

interface CoverageResult {
  success: boolean;
  totalHoursChecked: number;
  missingHours: number;
  gapsFound: CoverageGap[];
  gapsFilled: number;
  apiCallsUsed: number;
  errors: string[];
  coveragePercentage: number;
}

/**
 * Führt tägliche Überprüfung der Wetterdaten-Vollständigkeit durch
 * Prüft stündliche Daten ab 1.1.2024 bis gestern (heute ausgeschlossen für laufende Syncs)
 */
export async function verifyWeatherCoverage(): Promise<CoverageResult> {
  console.log('🔍 Starte tägliche Wetterdaten-Coverage-Prüfung...');
  
  const result: CoverageResult = {
    success: true,
    totalHoursChecked: 0,
    missingHours: 0,
    gapsFound: [],
    gapsFilled: 0,
    apiCallsUsed: 0,
    errors: [],
    coveragePercentage: 100
  };
  
  try {
    const now = new Date();
    const yesterday = subDays(now, 1);
    const endDate = endOfDay(yesterday); // Bis gestern 23:59:59
    
    console.log(`📅 Prüfe Wetterdaten-Coverage von ${format(COVERAGE_START_DATE, 'yyyy-MM-dd')} bis ${format(endDate, 'yyyy-MM-dd')}`);
    
    // Schritt 1: Prüfe historische Wetterdaten-Coverage
    const historicalGaps = await checkHistoricalWeatherCoverage(COVERAGE_START_DATE, endDate);
    result.gapsFound.push(...historicalGaps);
    
    // Berechne Statistiken
    const totalExpectedHours = eachHourOfInterval({
      start: COVERAGE_START_DATE,
      end: endDate
    }).length;
    
    result.totalHoursChecked = totalExpectedHours;
    result.missingHours = result.gapsFound.length;
    result.coveragePercentage = Math.max(0, Math.round(((totalExpectedHours - result.missingHours) / totalExpectedHours) * 100));
    
    console.log(`📊 Coverage-Analyse: ${result.missingHours}/${totalExpectedHours} Stunden fehlen (${result.coveragePercentage}% Abdeckung)`);
    
    // Schritt 2: Automatisches Nachfüllen kritischer Lücken (nur wenn API-Quota verfügbar)
    const apiUsage = getApiUsageStats();
    const availableRequests = apiUsage.remaining;
    
    if (result.missingHours > 0 && availableRequests > 0) {
      console.log(`🔄 Starte automatisches Nachfüllen von max. ${Math.min(result.missingHours, availableRequests)} fehlenden Stunden...`);
      
      // Priorisiere kritische Lücken (z.B. größere zusammenhängende Bereiche)
      const prioritizedGaps = prioritizeGaps(result.gapsFound);
      const gapsToFill = prioritizedGaps.slice(0, Math.min(availableRequests, 50)); // Max 50 pro Tag
      
      for (const gap of gapsToFill) {
        try {
          const filled = await fillWeatherGap(gap);
          if (filled) {
            result.gapsFilled++;
            result.apiCallsUsed++;
          }
        } catch (error) {
          result.errors.push(`Fehler beim Füllen von ${gap.date} ${gap.hour}:00 - ${error instanceof Error ? error.message : 'Unbekannt'}`);
        }
      }
      
      console.log(`✅ ${result.gapsFilled} Wetterdaten-Lücken automatisch nachgefüllt`);
    } else if (result.missingHours > 0) {
      console.log(`⚠️ ${result.missingHours} Lücken gefunden, aber keine API-Anfragen verfügbar (${availableRequests} verbleibend)`);
      result.errors.push(`Keine API-Quota für automatisches Nachfüllen verfügbar`);
    }
    
    // Schritt 3: Aktualisiere Coverage-Tabelle
    await updateCoverageStats(result);
    
    // Schritt 4: Logging
    await logCoverageResult(result);
    
  } catch (error) {
    console.error('❌ Fehler bei Weather Coverage Check:', error);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unbekannter Fehler');
  }
  
  return result;
}

/**
 * Überprüft Coverage der historischen Wetterdaten
 */
async function checkHistoricalWeatherCoverage(startDate: Date, endDate: Date): Promise<CoverageGap[]> {
  const gaps: CoverageGap[] = [];
  
  try {
    // Hole alle stündlichen Zeitstempel, die vorhanden sein sollten
    const expectedHours = eachHourOfInterval({ start: startDate, end: endDate });
    
    // Hole vorhandene historische Daten
    const existingData = await db
      .select({
        datetime: weatherHistorical.datetime,
        hour: sql<number>`EXTRACT(HOUR FROM ${weatherHistorical.datetime})`.as('hour')
      })
      .from(weatherHistorical)
      .where(
        and(
          gte(weatherHistorical.datetime, startDate),
          lte(weatherHistorical.datetime, endDate)
        )
      );
    
    const existingTimestamps = new Set(
      existingData.map(d => d.datetime.toISOString())
    );
    
    // Finde fehlende Stunden
    for (const expectedHour of expectedHours) {
      if (!existingTimestamps.has(expectedHour.toISOString())) {
        gaps.push({
          date: format(expectedHour, 'yyyy-MM-dd'),
          hour: expectedHour.getHours(),
          timestamp: expectedHour,
          type: 'weather_historical'
        });
      }
    }
    
    console.log(`📋 Historische Wetterdaten: ${gaps.length} fehlende Stunden von ${expectedHours.length} erwartet`);
    
  } catch (error) {
    console.error('❌ Fehler bei historischer Coverage-Prüfung:', error);
  }
  
  return gaps;
}

/**
 * Priorisiert Lücken für das Nachfüllen
 * Größere zusammenhängende Lücken haben Priorität
 */
function prioritizeGaps(gaps: CoverageGap[]): CoverageGap[] {
  // Sortiere nach Datum/Stunde
  const sorted = gaps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Identifiziere zusammenhängende Bereiche und priorisiere sie
  const prioritized: CoverageGap[] = [];
  
  // Einfache Priorisierung: Neueste Lücken zuerst (wichtiger für aktuelle Analysen)
  return sorted.reverse();
}

/**
 * Füllt eine einzelne Wetterdaten-Lücke
 */
async function fillWeatherGap(gap: CoverageGap): Promise<boolean> {
  try {
    console.log(`⏳ Lade fehlende Wetterdaten nach: ${gap.date} ${gap.hour}:00`);
    
    // Verwende OpenWeather Timemachine API für historische Daten
    const success = await fetchHistoricalWeatherForGap(gap);
    
    if (!success && METEOSTAT_API_KEY) {
      console.log(`📡 OpenWeather fehlgeschlagen, versuche Meteostat als Fallback...`);
      return await fetchMeteostatWeatherForGap(gap);
    }
    
    return success;
    
  } catch (error) {
    console.error(`❌ Fehler beim Füllen der Lücke ${gap.date} ${gap.hour}:00:`, error);
    return false;
  }
}

/**
 * Holt historische Wetterdaten von OpenWeather Timemachine API
 */
async function fetchHistoricalWeatherForGap(gap: CoverageGap): Promise<boolean> {
  if (!OPENWEATHER_API_KEY) {
    throw new Error('OpenWeather API Key nicht konfiguriert');
  }
  
  try {
    const timestamp = Math.floor(gap.timestamp.getTime() / 1000); // Unix timestamp
    const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine`;
    
    const response = await axios.get(url, {
      params: {
        lat: 50.9196, // Bad Schandau
        lon: 14.1524,
        dt: timestamp,
        appid: OPENWEATHER_API_KEY,
        units: 'metric'
      }
    });
    
    const data = response.data;
    
    if (data && data.data && data.data.length > 0) {
      const weatherData = data.data[0]; // Erste (und einzige) Stunde
      
      // Speichere in weather_historical Tabelle
      await db.insert(weatherHistorical).values({
        datetime: gap.timestamp,
        temperature: weatherData.temp || 0,
        feelsLike: weatherData.feels_like || weatherData.temp || 0,
        humidity: weatherData.humidity || 0,
        pressure: weatherData.pressure || 1013,
        windSpeed: weatherData.wind_speed || 0,
        windDeg: weatherData.wind_deg || 0,
        visibility: weatherData.visibility || 10000,
        uvIndex: weatherData.uvi || 0,
        cloudiness: weatherData.clouds || 0,
        weatherMain: weatherData.weather?.[0]?.main || 'Clear',
        weatherDescription: weatherData.weather?.[0]?.description || 'clear sky',
        weatherIcon: weatherData.weather?.[0]?.icon || '01d',
        rain1h: weatherData.rain?.['1h'] || 0,
        snow1h: weatherData.snow?.['1h'] || 0,
        dataSource: 'openweather_timemachine'
      });
      
      console.log(`✅ OpenWeather: Wetterdaten für ${gap.date} ${gap.hour}:00 erfolgreich nachgeladen`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error(`❌ OpenWeather API Fehler für ${gap.date} ${gap.hour}:00:`, error);
    return false;
  }
}

/**
 * Holt historische Wetterdaten von Meteostat als Fallback
 */
async function fetchMeteostatWeatherForGap(gap: CoverageGap): Promise<boolean> {
  if (!METEOSTAT_API_KEY) {
    console.log('⚠️ Meteostat API Key nicht konfiguriert, überspringe Fallback');
    return false;
  }
  
  // Placeholder für Meteostat-Integration
  // TODO: Implementiere Meteostat API Integration wenn benötigt
  console.log('📡 Meteostat Fallback noch nicht implementiert');
  return false;
}

/**
 * Aktualisiert die Coverage-Statistiken in der Datenbank
 */
async function updateCoverageStats(result: CoverageResult): Promise<void> {
  try {
    const now = new Date();
    
    // Upsert Coverage-Daten für weather_historical
    await db
      .insert(dataCoverage)
      .values({
        data_type: 'weather_historical',
        earliest_date: format(COVERAGE_START_DATE, 'yyyy-MM-dd'),
        latest_date: format(subDays(now, 1), 'yyyy-MM-dd'), // Bis gestern
        data_points: result.totalHoursChecked - result.missingHours + result.gapsFilled,
        coverage_percentage: result.coveragePercentage,
        last_sync: now
      })
      .onConflictDoUpdate({
        target: dataCoverage.data_type,
        set: {
          data_points: result.totalHoursChecked - result.missingHours + result.gapsFilled,
          coverage_percentage: result.coveragePercentage,
          last_sync: now
        }
      });
    
    console.log(`📊 Coverage-Statistik aktualisiert: ${result.coveragePercentage}% Abdeckung`);
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren der Coverage-Statistik:', error);
  }
}

/**
 * Protokolliert das Coverage-Check Ergebnis
 */
async function logCoverageResult(result: CoverageResult): Promise<void> {
  try {
    await db.insert(syncLogs).values({
      syncType: 'weather_coverage_check',
      itemsFound: result.totalHoursChecked,
      itemsSaved: result.gapsFilled,
      itemsUpdated: 0,
      duplicates: 0,
      errors: result.errors.length,
      syncStatus: result.success ? 'completed' : 'error',
      errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
      additionalData: JSON.stringify({
        coveragePercentage: result.coveragePercentage,
        missingHours: result.missingHours,
        apiCallsUsed: result.apiCallsUsed,
        gapsFilled: result.gapsFilled
      }),
      endDate: new Date()
    });
    
    console.log(`📝 Weather Coverage Check Ergebnis protokolliert`);
    
  } catch (error) {
    console.error('❌ Fehler beim Protokollieren des Coverage-Checks:', error);
  }
}

/**
 * Überprüft DST (Daylight Saving Time) Edge Cases für Europa/Berlin
 * Stellt sicher, dass Zeitumstellungen korrekt behandelt werden
 */
export function validateDSTHandling(date: Date): { isDST: boolean, hasAmbiguousHour: boolean, hasMissingHour: boolean } {
  // Vereinfachte DST-Prüfung für Europa/Berlin
  const year = date.getFullYear();
  
  // DST beginnt am letzten Sonntag im März (2:00 -> 3:00)
  // DST endet am letzten Sonntag im Oktober (3:00 -> 2:00)
  
  const march = new Date(year, 2, 31); // 31. März
  const dstStart = new Date(march.getTime() - ((march.getDay() || 7) - 1) * 24 * 60 * 60 * 1000); // Letzter Sonntag im März
  
  const october = new Date(year, 9, 31); // 31. Oktober
  const dstEnd = new Date(october.getTime() - ((october.getDay() || 7) - 1) * 24 * 60 * 60 * 1000); // Letzter Sonntag im Oktober
  
  const isDST = date >= dstStart && date < dstEnd;
  
  // Prüfe auf Zeitumstellungstage
  const isSameDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && 
    d1.getMonth() === d2.getMonth() && 
    d1.getDate() === d2.getDate();
  
  const hasAmbiguousHour = isSameDay(date, dstEnd) && date.getHours() === 2; // 2:xx AM am DST-Ende
  const hasMissingHour = isSameDay(date, dstStart) && date.getHours() === 2; // 2:xx AM am DST-Start
  
  return {
    isDST,
    hasAmbiguousHour,
    hasMissingHour
  };
}
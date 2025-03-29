/**
 * Feiertage- und Urlaubsservice
 * 
 * Dieser Service stellt Funktionen bereit, um Feiertage und Schulferien für Deutschland
 * zu verwalten und in der Datenbank zu speichern.
 */

import axios from 'axios';
import { db } from '../db';
import { holidays, dataCoverage, insertHolidaySchema, insertDataCoverageSchema } from '@shared/schema';
import { eq, and, between, count, isNull, gte, lte } from 'drizzle-orm';
import { format, parseISO, isValid, getDay, getWeek, addDays, subDays, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';

// API Konfiguration für deutsche Feiertage
const HOLIDAY_API_URL = "https://feiertage-api.de/api/";

// API Konfiguration für deutsche Schulferien
const SCHOOL_HOLIDAY_API_URL = "https://openholidaysapi.org/SchoolHolidays";

// Konstanten für Feiertage-Typen
export const HOLIDAY_TYPE = {
  FEDERAL: "federal", // Bundesweiter Feiertag
  STATE: "state",     // Landesweiter Feiertag
  SCHOOL: "school"    // Schulferien
};

// Liste der deutschen Bundesländer
export const GERMAN_STATES = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", 
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"
];

// Liste der deutschen Bundesländer im ISO-3166-2 Format für API-Anfragen
export const GERMAN_STATES_ISO = [
  "DE-BW", "DE-BY", "DE-BE", "DE-BB", "DE-HB", "DE-HH", "DE-HE", "DE-MV",
  "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SN", "DE-ST", "DE-SH", "DE-TH"
];

/**
 * Feiertage für ein bestimmtes Jahr und Bundesland abrufen
 *
 * @param year Das Jahr für die Feiertagsabfrage
 * @param state Das Bundesland (ISO-Code) für die Feiertagsabfrage (optional)
 * @returns Array von Feiertagen oder null bei Fehler
 */
export async function fetchHolidays(year: number, state?: string): Promise<any | null> {
  try {
    console.log(`Rufe Feiertage für Jahr ${year}${state ? ` und Bundesland ${state}` : ''} ab`);
    
    // Parameter für die API-Anfrage
    const params: Record<string, any> = { jahr: year };
    if (state && GERMAN_STATES.includes(state)) {
      params.nur_land = state;
    }
    
    // API-Anfrage senden
    const response = await axios.get(HOLIDAY_API_URL, { params });
    
    // Überprüfung und Verarbeitung der Antwort
    if (response.status === 200 && response.data) {
      console.log(`Feiertage für Jahr ${year} erfolgreich abgerufen`);
      return response.data;
    } else {
      console.error(`Fehler bei der API-Anfrage für Feiertage im Jahr ${year}:`, response.status);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Abrufen der Feiertage für Jahr ${year}:`, error);
    return null;
  }
}

/**
 * Speichert Feiertage in der Datenbank
 *
 * @param holidaysData API-Antwort mit Feiertagen
 * @param year Das Jahr der Feiertage
 * @returns Statistik zur Speicherung
 */
export async function saveHolidays(
  holidaysData: any,
  year: number
): Promise<{ saved: number; errors: number; duplicates: number }> {
  let saved = 0;
  let errors = 0;
  let duplicates = 0;
  
  if (!holidaysData) {
    console.warn(`Keine Feiertage für Jahr ${year} zum Speichern vorhanden`);
    return { saved, errors, duplicates };
  }
  
  console.log(`Speichere Feiertage für Jahr ${year} in die Datenbank`);
  
  // Iteriere durch alle Bundesländer in den Feiertagen
  for (const [stateName, stateDays] of Object.entries(holidaysData)) {
    // Bestimme den ISO-Code des Bundeslandes
    const stateCode = getStateCodeFromName(stateName);
    
    // Iteriere durch alle Feiertage des Bundeslandes
    for (const [holidayName, holidayDateInfo] of Object.entries(stateDays as Record<string, any>)) {
      try {
        // Datum und andere Infos extrahieren
        const dateStr = typeof holidayDateInfo === 'object' ? holidayDateInfo.datum : holidayDateInfo;
        const timestamp = parseISO(dateStr);
        
        if (!isValid(timestamp)) {
          console.error(`Ungültiges Datum für Feiertag ${holidayName}: ${dateStr}`);
          errors++;
          continue;
        }
        
        const dateFormatted = format(timestamp, 'yyyy-MM-dd');
        const month = parseInt(format(timestamp, 'M'), 10);
        const day = parseInt(format(timestamp, 'd'), 10);
        const weekday = getDay(timestamp) || 7; // 0-6 in JS, konvertiert zu 1-7 (Montag-Sonntag)
        const weekdayName = format(timestamp, 'EEEE', { locale: de }); // Name des Wochentags (Montag, Dienstag, ...)
        const week = getWeek(timestamp, { locale: de }); // Woche im Jahr
        
        // Prüfen, ob der Datensatz bereits existiert
        const existingHoliday = await db.query.holidays.findFirst({
          where: and(
            eq(holidays.date, dateFormatted),
            eq(holidays.name, holidayName),
            eq(holidays.country, "DE"),
            stateCode ? eq(holidays.state, stateCode) : isNull(holidays.state)
          )
        });
        
        if (existingHoliday) {
          duplicates++;
          continue;
        }
        
        // Feiertagstyp bestimmen: landesweit oder bundesweit
        let holidayType = HOLIDAY_TYPE.STATE;
        // Wenn alle Bundesländer den gleichen Feiertag am selben Tag haben
        if (Object.keys(holidaysData).length === GERMAN_STATES.length) {
          const allSameDate = Object.values(holidaysData).every((stateData: any) => {
            return Object.entries(stateData).some(([name, dateObj]) => {
              if (!dateObj) return false;
              const dateStrToCompare = typeof dateObj === 'object' && dateObj !== null && 'datum' in dateObj 
                ? dateObj.datum 
                : dateObj;
              return name === holidayName && dateStrToCompare === dateStr;
            });
          });
          
          if (allSameDate) {
            holidayType = HOLIDAY_TYPE.FEDERAL;
          }
        }
        
        // Feiertagsdaten zur Datenbank hinzufügen
        const holidayData = insertHolidaySchema.parse({
          date: dateFormatted,
          name: holidayName,
          description: `${weekdayName} - ${holidayName}`, // Wochentag in der Beschreibung hinzufügen
          type: holidayType,
          is_official: true,
          country: "DE",
          state: stateCode,
          region: null,
          year,
          trimester: Math.ceil(month / 3),
          month,
          day,
          weekday,
          weekday_name: weekdayName, // Name des Wochentags speichern
          week,
          metadata: JSON.stringify({
            hinweis: typeof holidayDateInfo === 'object' ? holidayDateInfo.hinweis : null,
            weekday: weekday,
            weekdayName: weekdayName
          })
        });
        
        await db.insert(holidays).values(holidayData);
        saved++;
      } catch (error) {
        console.error(`Fehler beim Speichern des Feiertags ${holidayName}:`, error);
        errors++;
      }
    }
  }
  
  console.log(`Gespeichert: ${saved}, Fehler: ${errors}, Duplikate: ${duplicates}`);
  
  // Aktualisiere die Datenabdeckungsinformationen
  await updateHolidayDataCoverage();
  
  return { saved, errors, duplicates };
}

/**
 * Aktualisiert die Datenabdeckungsinformationen für Feiertage
 */
export async function updateHolidayDataCoverage(): Promise<void> {
  try {
    // Gesamtanzahl der Feiertage
    const totalCountResult = await db.select({ count: count() }).from(holidays);
    const totalCount = totalCountResult[0]?.count || 0;

    if (totalCount === 0) {
      console.log("Keine Feiertage vorhanden, überspringe Abdeckungsberechnung");
      return;
    }

    // Frühestes und spätestes Datum ermitteln
    const earliestRecord = await db.query.holidays.findFirst({
      orderBy: (holidays, { asc }) => [asc(holidays.date)]
    });

    const latestRecord = await db.query.holidays.findFirst({
      orderBy: (holidays, { desc }) => [desc(holidays.date)]
    });

    if (!earliestRecord || !latestRecord) {
      console.error("Keine Feiertage für Abdeckungsberechnung gefunden");
      return;
    }

    const earliestDate = earliestRecord.date;
    const latestDate = latestRecord.date;

    // Prüfen, ob bereits ein Datensatz für Feiertagsabdeckung existiert
    const existingCoverage = await db.query.dataCoverage.findFirst({
      where: eq(dataCoverage.data_type, "holiday")
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
        .where(eq(dataCoverage.data_type, "holiday"));
    } else {
      const coverageData = insertDataCoverageSchema.parse({
        data_type: "holiday",
        earliest_date: earliestDate,
        latest_date: latestDate,
        data_points: totalCount,
        last_sync: new Date()
      });

      await db.insert(dataCoverage).values(coverageData);
    }

    console.log(`Feiertagsabdeckung aktualisiert: ${earliestDate} bis ${latestDate}, ${totalCount} Datenpunkte`);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Feiertagsabdeckung:", error);
  }
}

/**
 * Synchronisiert Feiertage für ein bestimmtes Jahr
 *
 * @param year Das zu synchronisierende Jahr
 * @param states Zu synchronisierende Bundesländer (optional, sonst alle)
 * @returns Synchronisationsergebnis
 */
export async function syncHolidays(
  year: number,
  states: string[] = GERMAN_STATES
): Promise<{ status: string; saved: number; errors: number; duplicates: number; message?: string }> {
  try {
    console.log(`Starte Feiertags-Synchronisation für Jahr ${year}`);
    
    // Feiertage für alle angegebenen Bundesländer abrufen
    const holidaysData: Record<string, any> = {};
    
    for (const state of states) {
      const stateHolidays = await fetchHolidays(year, state);
      if (stateHolidays) {
        Object.assign(holidaysData, stateHolidays);
      }
    }
    
    if (Object.keys(holidaysData).length === 0) {
      return { 
        status: "error", 
        saved: 0, 
        errors: 0, 
        duplicates: 0, 
        message: `Keine Feiertage für Jahr ${year} von der API erhalten` 
      };
    }
    
    // Feiertage speichern
    const { saved, errors, duplicates } = await saveHolidays(holidaysData, year);
    
    return {
      status: errors > 0 ? "warning" : "success",
      saved,
      errors,
      duplicates,
      message: `${saved} Feiertage für Jahr ${year} synchronisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler`
    };
  } catch (error) {
    console.error(`Fehler bei der Feiertags-Synchronisation für Jahr ${year}:`, error);
    return {
      status: "error",
      saved: 0,
      errors: 1,
      duplicates: 0,
      message: `Fehler bei der Feiertags-Synchronisation für Jahr ${year}: ${error}`
    };
  }
}

/**
 * Hilfsfunktion: Bestimmt den ISO-Code eines Bundeslandes aus dem Namen
 *
 * @param stateName Der Name des Bundeslandes
 * @returns Der zweistellige ISO-Code des Bundeslandes oder null
 */
function getStateCodeFromName(stateName: string): string | null {
  const stateMapping: Record<string, string> = {
    'Baden-Württemberg': 'BW',
    'Bayern': 'BY',
    'Berlin': 'BE',
    'Brandenburg': 'BB',
    'Bremen': 'HB',
    'Hamburg': 'HH',
    'Hessen': 'HE',
    'Mecklenburg-Vorpommern': 'MV',
    'Niedersachsen': 'NI',
    'Nordrhein-Westfalen': 'NW',
    'Rheinland-Pfalz': 'RP',
    'Saarland': 'SL',
    'Sachsen': 'SN',
    'Sachsen-Anhalt': 'ST',
    'Schleswig-Holstein': 'SH',
    'Thüringen': 'TH'
  };
  
  return stateMapping[stateName] || null;
}

/**
 * Prüft, ob für ein bestimmtes Jahr bereits Feiertage vorhanden sind
 *
 * @param year Das zu prüfende Jahr
 * @param state Der zu prüfende Bundesland-ISO-Code (optional)
 * @returns true wenn Daten vorhanden sind, sonst false
 */
export async function hasHolidaysForYear(year: number, state?: string): Promise<boolean> {
  try {
    const whereConditions = [eq(holidays.year, year)];
    
    if (state) {
      whereConditions.push(eq(holidays.state, state));
    }
    
    const existingRecords = await db.select({ count: count() })
      .from(holidays)
      .where(and(...whereConditions));
    
    return (existingRecords[0]?.count || 0) > 0;
  } catch (error) {
    console.error(`Fehler beim Prüfen der Feiertage für Jahr ${year}:`, error);
    return false;
  }
}

/**
 * Gibt die Jahre zurück, für die keine Feiertage im angegebenen Zeitraum vorhanden sind
 *
 * @param startYear Das Startjahr
 * @param endYear Das Endjahr
 * @param state Der zu prüfende Bundesland-ISO-Code (optional)
 * @returns Array von Jahren ohne Feiertage
 */
export async function getMissingHolidayYears(
  startYear: number,
  endYear: number,
  state?: string
): Promise<number[]> {
  try {
    const missingYears: number[] = [];
    
    for (let year = startYear; year <= endYear; year++) {
      const hasData = await hasHolidaysForYear(year, state);
      if (!hasData) {
        missingYears.push(year);
      }
    }
    
    return missingYears;
  } catch (error) {
    console.error(`Fehler beim Ermitteln fehlender Feiertage für Jahre ${startYear}-${endYear}:`, error);
    return [];
  }
}

/**
 * Abrufen von Schulferien für ein bestimmtes Jahr und Bundesland
 *
 * @param year Das Jahr für die Schulferienabfrage
 * @param state Das Bundesland (ISO-Code) für die Schulferienabfrage (optional)
 * @returns Array von Schulferien oder null bei Fehler
 */
export async function fetchSchoolHolidays(year: number, state?: string): Promise<any | null> {
  try {
    console.log(`Rufe Schulferien für Jahr ${year}${state ? ` und Bundesland ${state}` : ''} ab`);
    
    // Bestimme den Bundesland-Code im ISO-3166-2 Format
    let stateCodeISO: string | undefined = undefined;
    
    // Prüfe, ob der State bereits im ISO-Format vorliegt (mit "DE-" Präfix)
    if (state && state.startsWith('DE-')) {
      stateCodeISO = state;
    } 
    // Oder ob es sich um einen normalen Bundeslandcode handelt
    else if (state && GERMAN_STATES.includes(state)) {
      stateCodeISO = `DE-${state}`;
    }
    
    // Parameter für die API-Anfrage
    const params: Record<string, any> = {
      countryIsoCode: "DE",
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      languageIsoCode: "de"
    };
    
    if (stateCodeISO) {
      params.subdivisionCode = stateCodeISO;
    }
    
    // API-Anfrage senden
    const response = await axios.get(SCHOOL_HOLIDAY_API_URL, { params });
    
    // Überprüfung und Verarbeitung der Antwort
    if (response.status === 200 && response.data) {
      console.log(`Schulferien für Jahr ${year} erfolgreich abgerufen`);
      return response.data;
    } else {
      console.error(`Fehler bei der API-Anfrage für Schulferien im Jahr ${year}:`, response.status);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Abrufen der Schulferien für Jahr ${year}:`, error);
    return null;
  }
}

/**
 * Speichert Schulferien in der Datenbank
 *
 * @param schoolHolidaysData API-Antwort mit Schulferien
 * @returns Statistik zur Speicherung
 */
export async function saveSchoolHolidays(
  schoolHolidaysData: any[]
): Promise<{ saved: number; errors: number; duplicates: number }> {
  let saved = 0;
  let errors = 0;
  let duplicates = 0;
  
  if (!schoolHolidaysData || schoolHolidaysData.length === 0) {
    console.warn(`Keine Schulferien zum Speichern vorhanden`);
    return { saved, errors, duplicates };
  }
  
  console.log(`Speichere ${schoolHolidaysData.length} Schulferien in die Datenbank`);
  
  for (const holiday of schoolHolidaysData) {
    try {
      // Prüfe, ob die Daten gültig sind
      if (!holiday.startDate || !holiday.endDate || !holiday.name) {
        console.warn("Ungültige Schulferiendaten, überspringe:", holiday);
        errors++;
        continue;
      }
      
      // Extrahiere ISO-Codes
      const stateCode = holiday.subdivisionCode ? 
        holiday.subdivisionCode.replace("DE-", "") : null;
      
      // Verarbeite jeden Tag im Ferienbereich
      const startDate = parseISO(holiday.startDate);
      const endDate = parseISO(holiday.endDate);
      
      if (!isValid(startDate) || !isValid(endDate)) {
        console.error(`Ungültige Datumsangaben: ${holiday.startDate} - ${holiday.endDate}`);
        errors++;
        continue;
      }
      
      let currentDate = startDate;
      
      while (!isAfter(currentDate, endDate)) {
        const dateFormatted = format(currentDate, 'yyyy-MM-dd');
        const month = parseInt(format(currentDate, 'M'), 10);
        const day = parseInt(format(currentDate, 'd'), 10);
        const weekday = getDay(currentDate) || 7; // 0-6 in JS, konvertiert zu 1-7 (Montag-Sonntag)
        const weekdayName = format(currentDate, 'EEEE', { locale: de }); // Name des Wochentags (Montag, Dienstag, ...)
        const week = getWeek(currentDate, { locale: de }); // Woche im Jahr
        const year = parseInt(format(currentDate, 'yyyy'), 10);
        
        // Prüfen, ob der Datensatz bereits existiert
        const existingHoliday = await db.query.holidays.findFirst({
          where: and(
            eq(holidays.date, dateFormatted),
            eq(holidays.type, HOLIDAY_TYPE.SCHOOL),
            eq(holidays.country, "DE"),
            eq(holidays.state, stateCode)
          )
        });
        
        if (existingHoliday) {
          duplicates++;
        } else {
          // Feiertagsdaten zur Datenbank hinzufügen
          const holidayData = insertHolidaySchema.parse({
            date: dateFormatted,
            name: holiday.name,
            description: `${weekdayName} - ${holiday.name}`, // Wochentag in der Beschreibung hinzufügen
            type: HOLIDAY_TYPE.SCHOOL,
            is_official: false,
            country: "DE",
            state: stateCode,
            region: null,
            year,
            trimester: Math.ceil(month / 3),
            month,
            day,
            weekday,
            weekday_name: weekdayName, // Name des Wochentags speichern
            week,
            metadata: JSON.stringify({
              startDate: holiday.startDate,
              endDate: holiday.endDate,
              subdivisionCode: holiday.subdivisionCode,
              holidayType: holiday.holidayType,
              weekday: weekday,
              weekdayName: weekdayName
            })
          });
          
          await db.insert(holidays).values(holidayData);
          saved++;
        }
        
        // Nächster Tag
        currentDate = addDays(currentDate, 1);
      }
    } catch (error) {
      console.error(`Fehler beim Speichern der Schulferien:`, error);
      errors++;
    }
  }
  
  console.log(`Gespeichert: ${saved}, Fehler: ${errors}, Duplikate: ${duplicates}`);
  
  // Aktualisiere die Datenabdeckungsinformationen
  await updateHolidayDataCoverage();
  
  return { saved, errors, duplicates };
}

/**
 * Synchronisiert Schulferien für ein bestimmtes Jahr
 *
 * @param year Das zu synchronisierende Jahr
 * @param states Zu synchronisierende Bundesländer (optional, sonst alle)
 * @returns Synchronisationsergebnis
 */
export async function syncSchoolHolidays(
  year: number,
  states: string[] = GERMAN_STATES_ISO
): Promise<{ status: string; saved: number; errors: number; duplicates: number; message?: string }> {
  try {
    console.log(`Starte Schulferien-Synchronisation für Jahr ${year}`);
    
    let allHolidays: any[] = [];
    
    // Schulferien für alle angegebenen Bundesländer abrufen
    for (const state of states) {
      const stateHolidays = await fetchSchoolHolidays(year, state);
      if (stateHolidays && Array.isArray(stateHolidays)) {
        allHolidays = [...allHolidays, ...stateHolidays];
      }
    }
    
    if (allHolidays.length === 0) {
      return { 
        status: "error", 
        saved: 0, 
        errors: 0, 
        duplicates: 0, 
        message: `Keine Schulferien für Jahr ${year} von der API erhalten` 
      };
    }
    
    // Schulferien speichern
    const { saved, errors, duplicates } = await saveSchoolHolidays(allHolidays);
    
    return {
      status: errors > 0 ? "warning" : "success",
      saved,
      errors,
      duplicates,
      message: `${saved} Schulferientage für Jahr ${year} synchronisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler`
    };
  } catch (error) {
    console.error(`Fehler bei der Schulferien-Synchronisation für Jahr ${year}:`, error);
    return {
      status: "error",
      saved: 0,
      errors: 1,
      duplicates: 0,
      message: `Fehler bei der Schulferien-Synchronisation für Jahr ${year}: ${error}`
    };
  }
}

/**
 * Synchronisiert sowohl Feiertage als auch Schulferien für ein bestimmtes Jahr
 *
 * @param year Das zu synchronisierende Jahr
 * @param states Zu synchronisierende Bundesländer (optional, sonst alle)
 * @returns Synchronisationsergebnis
 */
export async function syncAllHolidays(
  year: number,
  states: string[] = GERMAN_STATES
): Promise<{ 
  publicHolidays: { status: string; saved: number; errors: number; duplicates: number; message?: string },
  schoolHolidays: { status: string; saved: number; errors: number; duplicates: number; message?: string }
}> {
  // Für öffentliche Feiertage verwenden wir einfache Bundesland-Codes
  const publicResult = await syncHolidays(year, states);
  
  // Für Schulferien müssen wir die Codes in ISO-Format konvertieren, falls sie es nicht bereits sind
  const statesForSchool = states.map(state => 
    state.startsWith('DE-') ? state : `DE-${state}`
  );
  
  const schoolResult = await syncSchoolHolidays(year, statesForSchool);
  
  return {
    publicHolidays: publicResult,
    schoolHolidays: schoolResult
  };
}

/**
 * Prüft und synchronisiert fehlende Feiertage für einen Zeitraum
 *
 * @param startYear Das Startjahr
 * @param endYear Das Endjahr
 * @param state Der zu synchronisierende Bundesland-ISO-Code (optional)
 * @param includeSchoolHolidays Ob Schulferien miteinbezogen werden sollen
 * @returns Synchronisationsergebnisse pro fehlendem Jahr
 */
/**
 * Holt Feiertage für einen bestimmten Zeitraum
 * 
 * @param startDate Das Startdatum
 * @param endDate Das Enddatum
 * @param type Der Feiertagstyp (optional)
 * @param state Der zu filternde Bundesland-ISO-Code (optional)
 * @param limit Die maximale Anzahl der Ergebnisse (optional, Standard: 100)
 * @returns Feiertage im angegebenen Zeitraum
 */
export async function getHolidaysByDateRange(
  startDate: Date | string,
  endDate: Date | string,
  type?: string,
  state?: string,
  limit: number = 100
): Promise<typeof holidays.$inferSelect[]> {
  try {
    // Konvertiere Datum-Strings in Datum-Objekte
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    
    // Formatiere Daten als ISO-String für die Datenbankabfrage
    const startFormatted = format(start, 'yyyy-MM-dd');
    const endFormatted = format(end, 'yyyy-MM-dd');
    
    // Basisfilter für den Zeitraum
    const whereConditions = [
      gte(holidays.date, startFormatted),
      lte(holidays.date, endFormatted)
    ];
    
    // Optionaler Filter für Bundesland
    if (state) {
      // Wenn es ein ISO-Format ist (DE-XX), nur den Ländercode verwenden
      const stateCode = state.startsWith('DE-') ? state.substring(3) : state;
      whereConditions.push(eq(holidays.state, stateCode));
    }
    
    // Optionaler Filter für Feiertagstyp
    if (type) {
      whereConditions.push(eq(holidays.type, type));
    }
    
    // Abfrage ausführen
    const results = await db.select()
      .from(holidays)
      .where(and(...whereConditions))
      .orderBy(holidays.date)
      .limit(limit);
    
    return results;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Feiertage zwischen ${startDate} und ${endDate}:`, error);
    return [];
  }
}

export async function syncMissingHolidays(
  startYear: number,
  endYear: number,
  state?: string,
  includeSchoolHolidays: boolean = true
): Promise<{ years: { year: number; result: any }[] }> {
  try {
    console.log(`Prüfe auf fehlende Feiertage für Jahre ${startYear}-${endYear}${state ? ` und Bundesland ${state}` : ''}`);
    
    // Fehlende Jahre ermitteln
    const missingYears = await getMissingHolidayYears(startYear, endYear, state);
    
    if (missingYears.length === 0) {
      console.log(`Keine fehlenden Feiertage für Jahre ${startYear}-${endYear}`);
      return { years: [] };
    }
    
    console.log(`${missingYears.length} Jahre mit fehlenden Feiertagen gefunden`);
    
    // Jedes fehlende Jahr synchronisieren
    const results = [];
    for (const year of missingYears) {
      console.log(`Synchronisiere fehlende Feiertage für Jahr ${year}`);
      
      let result;
      if (includeSchoolHolidays) {
        // Synchronisiere beide Arten von Feiertagen
        result = await syncAllHolidays(year, state ? [state] : undefined);
      } else {
        // Synchronisiere nur öffentliche Feiertage
        result = await syncHolidays(year, state ? [state] : undefined);
      }
      
      results.push({
        year,
        result
      });
    }
    
    return { years: results };
  } catch (error) {
    console.error(`Fehler bei der Synchronisation fehlender Feiertage für Jahre ${startYear}-${endYear}:`, error);
    return { years: [] };
  }
}
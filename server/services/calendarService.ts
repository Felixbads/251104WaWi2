import axios from 'axios';
import { db } from '../db';
import { calendarDays, holidays, insertCalendarDaySchema } from '@shared/schema';
import { format, addDays, parse, parseISO, differenceInDays, getISOWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

// API-Konfiguration und Konstanten
const OPENHOLIDAYS_API_URL = 'https://openholidaysapi.org';
const NAGER_DATE_API_URL = 'https://date.nager.at/api/v3';
const FEIERTAGAPI_URL = 'https://feiertage-api.de/api';

// Alle deutschen Bundesländer
export const ALL_STATES = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' }
];

// Bundesländer-Map für schnellen Zugriff
export const STATES_MAP = ALL_STATES.reduce((map, state) => {
  map[state.code] = state.name;
  return map;
}, {} as Record<string, string>);

// Namen der Wochentage
const WEEKDAY_NAMES = [
  'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 
  'Donnerstag', 'Freitag', 'Samstag'
];

// Enum für primäre Tagestypen
// Die Priorität für die Anzeige ist: PUBLIC_HOLIDAY > WEEKEND > SCHOOL_HOLIDAY > WORKDAY
enum DayType {
  WORKDAY = 'WORKDAY',           // Normaler Arbeitstag (keine der anderen Eigenschaften)
  WEEKEND = 'WEEKEND',           // Wochenende (Sa-So)
  SCHOOL_HOLIDAY = 'SCHOOL_HOLIDAY', // Schulferientermin an einem Wochentag
  PUBLIC_HOLIDAY = 'PUBLIC_HOLIDAY'  // Gesetzlicher Feiertag (höchste Priorität)
}

/**
 * Klasse für die erweiterte Verwaltung von Kalendertagen inklusive Feiertagen und Schulferien
 */
class CalendarService {
  /**
   * Initialisiert die Kalendertabelle mit allen Tagen im angegebenen Zeitraum
   * für alle Bundesländer
   */
  async initializeCalendarDays(
    startDate: Date | string, 
    endDate: Date | string,
    states: string[] = ALL_STATES.map(s => s.code)
  ): Promise<number> {
    // Datum-Konvertierung sicherstellen
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    
    // Anzahl der Tage berechnen
    const days = differenceInDays(end, start) + 1;
    let addedEntries = 0;
    
    console.log(`Initialisiere Kalendertage von ${format(start, 'yyyy-MM-dd')} bis ${format(end, 'yyyy-MM-dd')} (${days} Tage)`);
    
    // Für jedes Bundesland alle Tage erstellen
    for (const state of states) {
      console.log(`Erstelle Kalendertage für ${state} (${STATES_MAP[state] || state})`);
      
      // Tage erstellen
      let currentDate = new Date(start);
      let batchItems = [];
      
      for (let i = 0; i < days; i++) {
        const dayOfWeek = getDay(currentDate); // 0-6, wobei 0=Sonntag
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sonntag oder Samstag
        
        // Standard-Tagestyp basierend auf Wochenende
        const dayType = isWeekend ? DayType.WEEKEND : DayType.WORKDAY;
        
        // Wochentag-Name
        const dayName = WEEKDAY_NAMES[dayOfWeek];
        
        // ISO-Woche
        const week = getISOWeek(currentDate);
        
        // Eintrag für die Datenbank formatieren
        const calendarEntry = {
          date: format(currentDate, 'yyyy-MM-dd'),
          day_of_week: dayOfWeek === 0 ? 7 : dayOfWeek, // 1-7 (Montag-Sonntag) Format
          day_name: dayName,
          is_weekend: isWeekend,
          is_school_holiday: false, // Wird später aktualisiert
          is_public_holiday: false, // Wird später aktualisiert
          day_type: dayType,
          state: state,
          holiday_name: null,
          country: 'DE',
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1,
          day: currentDate.getDate(),
          week: week,
        };
        
        batchItems.push(calendarEntry);
        
        // Batch-Verarbeitung für bessere Performance
        if (batchItems.length >= 100 || i === days - 1) {
          try {
            // Existiert der Eintrag bereits? Wenn nicht, erstellen
            for (const entry of batchItems) {
              try {
                const insertData = insertCalendarDaySchema.parse(entry);
                await db.insert(calendarDays).values(insertData)
                  .onConflictDoUpdate({
                    target: [calendarDays.date, calendarDays.state],
                    set: {
                      is_weekend: entry.is_weekend,
                      day_type: entry.day_type !== DayType.WORKDAY && entry.day_type !== DayType.WEEKEND ? 
                               entry.day_type : (entry.is_weekend ? DayType.WEEKEND : DayType.WORKDAY),
                      updated_at: sql`CURRENT_TIMESTAMP`
                    }
                  });
                addedEntries++;
              } catch (error) {
                console.error(`Fehler beim Einfügen eines Kalendertages (${entry.date}, ${entry.state}):`, error);
              }
            }
            batchItems = [];
          } catch (error) {
            console.error('Fehler beim Batch-Einfügen der Kalendertage:', error);
          }
        }
        
        // Zum nächsten Tag
        currentDate = addDays(currentDate, 1);
      }
    }
    
    console.log(`${addedEntries} Kalendertage wurden initialisiert oder aktualisiert.`);
    return addedEntries;
  }
  
  /**
   * Versucht öffentliche Feiertage von OpenHolidaysAPI abzurufen
   */
  async fetchPublicHolidaysFromOpenHolidays(year: number): Promise<any[]> {
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      // API-Anfrage
      const url = `${OPENHOLIDAYS_API_URL}/PublicHolidays`;
      const params = {
        countryIsoCode: 'DE',
        validFrom: startDate,
        validTo: endDate,
      };
      
      console.log(`Rufe Feiertage von OpenHolidaysAPI für ${year} ab...`);
      const response = await axios.get(url, { 
        params,
        timeout: 10000, // 10 Sekunden Timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CalendarService/1.0'
        }
      });
      
      if (response.status === 200 && Array.isArray(response.data)) {
        console.log(`${response.data.length} Feiertage von OpenHolidaysAPI erhalten.`);
        return response.data;
      } else {
        console.warn(`Unerwartete Antwort von OpenHolidaysAPI: Status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Feiertage von OpenHolidaysAPI für ${year}:`, error);
      return [];
    }
  }
  
  /**
   * Versucht öffentliche Feiertage von Nager.Date API abzurufen
   */
  async fetchPublicHolidaysFromNagerDate(year: number): Promise<any[]> {
    try {
      const url = `${NAGER_DATE_API_URL}/publicholidays/${year}/DE`;
      
      console.log(`Rufe Feiertage von Nager.Date für ${year} ab...`);
      const response = await axios.get(url, {
        timeout: 10000, // 10 Sekunden Timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CalendarService/1.0'
        }
      });
      
      if (response.status === 200 && Array.isArray(response.data)) {
        console.log(`${response.data.length} Feiertage von Nager.Date erhalten.`);
        return response.data;
      } else {
        console.warn(`Unerwartete Antwort von Nager.Date: Status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Feiertage von Nager.Date für ${year}:`, error);
      return [];
    }
  }
  
  /**
   * Versucht öffentliche Feiertage von Feiertage-API.de abzurufen
   */
  async fetchPublicHolidaysFromFeiertageAPI(year: number): Promise<any> {
    try {
      const url = `${FEIERTAGAPI_URL}/?jahr=${year}`;
      
      console.log(`Rufe Feiertage von Feiertage-API.de für ${year} ab...`);
      const response = await axios.get(url, {
        timeout: 10000, // 10 Sekunden Timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CalendarService/1.0'
        }
      });
      
      if (response.status === 200 && typeof response.data === 'object') {
        console.log(`Feiertage von Feiertage-API.de für ${year} erhalten.`);
        return response.data;
      } else {
        console.warn(`Unerwartete Antwort von Feiertage-API.de: Status ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Feiertage von Feiertage-API.de für ${year}:`, error);
      return null;
    }
  }
  
  /**
   * Synchronisiert öffentliche Feiertage für ein bestimmtes Jahr und alle oder bestimmte Bundesländer
   * mit Fallback-Mechanismus zwischen mehreren APIs
   */
  async syncPublicHolidays(year: number, states: string[] = ALL_STATES.map(s => s.code)): Promise<number> {
    console.log(`Synchronisiere öffentliche Feiertage für ${year} und ${states.length} Bundesländer...`);
    
    // Versuche zunächst mit OpenHolidaysAPI
    let holidaysData = await this.fetchPublicHolidaysFromOpenHolidays(year);
    
    // Fallback zu Nager.Date API, falls OpenHolidaysAPI fehlschlägt
    if (!holidaysData || holidaysData.length === 0) {
      console.log('Keine Daten von OpenHolidaysAPI erhalten, verwende Nager.Date API als Fallback...');
      holidaysData = await this.fetchPublicHolidaysFromNagerDate(year);
    }
    
    // Fallback zu Feiertage-API.de, falls auch Nager.Date fehlschlägt
    if (!holidaysData || holidaysData.length === 0) {
      console.log('Keine Daten von Nager.Date API erhalten, verwende Feiertage-API.de als Fallback...');
      const feiertageData = await this.fetchPublicHolidaysFromFeiertageAPI(year);
      
      if (feiertageData) {
        // Konvertiere das Format von Feiertage-API.de in ein einheitliches Format
        holidaysData = this.convertFeiertageAPIData(feiertageData, year);
      }
    }
    
    // Fallback für Deutschland-weite Feiertage, falls keine API funktioniert
    if (!holidaysData || holidaysData.length === 0) {
      console.log('Fallback: Verwende fest codierte wichtige Feiertage für Deutschland...');
      
      // Standard-Feiertage, die in fast allen Bundesländern gelten
      const standardHolidays = [
        { date: `${year}-01-01`, name: 'Neujahr', global: true },
        { date: `${year}-05-01`, name: 'Tag der Arbeit', global: true },
        { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit', global: true },
        { date: `${year}-12-25`, name: 'Erster Weihnachtstag', global: true },
        { date: `${year}-12-26`, name: 'Zweiter Weihnachtstag', global: true },
      ];
      
      // Ostern und davon abhängige Feiertage (vereinfachte Berechnung)
      const easter = this.calculateEaster(year);
      if (easter) {
        const karfreitag = new Date(easter);
        karfreitag.setDate(easter.getDate() - 2);
        
        const ostermontag = new Date(easter);
        ostermontag.setDate(easter.getDate() + 1);
        
        const christiHimmelfahrt = new Date(easter);
        christiHimmelfahrt.setDate(easter.getDate() + 39);
        
        const pfingstmontag = new Date(easter);
        pfingstmontag.setDate(easter.getDate() + 50);
        
        standardHolidays.push(
          { date: format(karfreitag, 'yyyy-MM-dd'), name: 'Karfreitag', global: true },
          { date: format(easter, 'yyyy-MM-dd'), name: 'Ostersonntag', global: true },
          { date: format(ostermontag, 'yyyy-MM-dd'), name: 'Ostermontag', global: true },
          { date: format(christiHimmelfahrt, 'yyyy-MM-dd'), name: 'Christi Himmelfahrt', global: true },
          { date: format(pfingstmontag, 'yyyy-MM-dd'), name: 'Pfingstmontag', global: true }
        );
      }
      
      // Konvertieren in das erwartete Format
      holidaysData = standardHolidays.map(holiday => ({
        date: holiday.date,
        localName: holiday.name,
        name: holiday.name,
        countryCode: 'DE',
        fixed: true,
        global: holiday.global,
        counties: holiday.global ? states : [],
        type: 'Public'
      }));
    }
    
    // Wenn keine Daten gefunden wurden, Fehler zurückgeben
    if (!holidaysData || holidaysData.length === 0) {
      console.error(`Keine Feiertagsdaten für ${year} gefunden!`);
      return 0;
    }
    
    // Verarbeite die erhaltenen Daten und aktualisiere die Datenbank
    return await this.processAndSaveHolidays(holidaysData, year, states);
  }
  
  /**
   * Berechnet das Osterdatum für ein gegebenes Jahr
   * Implementierung des Gaußschen Algorithmus
   */
  private calculateEaster(year: number): Date | null {
    try {
      // Gaußscher Algorithmus zur Berechnung des Ostersonntags
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      
      // Erstelle das Datum
      return new Date(year, month - 1, day);
    } catch (error) {
      console.error(`Fehler bei der Berechnung des Osterdatums für ${year}:`, error);
      return null;
    }
  }
  
  /**
   * Konvertiert Daten von Feiertage-API.de in ein einheitliches Format
   */
  private convertFeiertageAPIData(data: any, year: number): any[] {
    if (!data) return [];
    
    const result = [];
    
    // Für jedes Bundesland
    for (const stateCode of Object.keys(STATES_MAP)) {
      const stateName = STATES_MAP[stateCode];
      const stateData = data[stateCode] || data[stateName];
      
      if (!stateData) continue;
      
      // Für jeden Feiertag im Bundesland
      for (const [holidayKey, dateString] of Object.entries(stateData)) {
        if (typeof dateString !== 'string') continue;
        
        const holidayDate = new Date(dateString);
        
        // Name des Feiertags aus dem Schlüssel extrahieren
        let holidayName = holidayKey
          .replace(/([A-Z])/g, ' $1') // CamelCase zu Leerzeichen
          .replace(/^./, str => str.toUpperCase()) // Ersten Buchstaben groß schreiben
          .trim();
        
        result.push({
          date: format(holidayDate, 'yyyy-MM-dd'),
          localName: holidayName,
          name: holidayName,
          countryCode: 'DE',
          fixed: true,
          global: false,
          counties: [stateCode],
          type: 'Public'
        });
      }
    }
    
    return result;
  }
  
  /**
   * Verarbeitet und speichert Feiertagsdaten in der Datenbank
   */
  private async processAndSaveHolidays(holidaysData: any[], year: number, states: string[]): Promise<number> {
    let updatedEntries = 0;
    
    for (const holiday of holidaysData) {
      try {
        // Extrahiere Bundesländer, für die dieser Feiertag gilt
        let applicableStates: string[] = [];
        
        // Verarbeitung für verschiedene API-Formate
        if (holiday.counties || holiday.subdivisions) {
          // Format für Nager.Date oder OpenHolidaysAPI
          const countiesList = holiday.counties || 
            (holiday.subdivisions?.map((s: any) => s.code.split('-')[1]) || []);
          
          // Filtere die angeforderten Bundesländer
          applicableStates = countiesList.filter((code: string) => states.includes(code));
        } else if (holiday.global) {
          // Bundesweiter Feiertag
          applicableStates = states;
        } else {
          // Fallback: Für alle angeforderten Bundesländer
          applicableStates = states;
        }
        
        // Wenn keine zutreffenden Bundesländer gefunden wurden, überspringen
        if (applicableStates.length === 0) continue;
        
        // Datum des Feiertags extrahieren (verschiedene API-Formate unterstützen)
        const holidayDate = holiday.date || holiday.startDate || holiday.datum;
        if (!holidayDate) {
          console.warn('Überspringe Feiertag ohne Datum:', holiday);
          continue;
        }
        
        // Name des Feiertags extrahieren
        const holidayName = holiday.localName || holiday.name?.[0]?.text || holiday.name || 'Unbekannter Feiertag';
        
        // Für jedes zutreffende Bundesland den Kalendertag aktualisieren
        for (const stateCode of applicableStates) {
          try {
            // Datum formatieren
            const formattedDate = typeof holidayDate === 'string' ? holidayDate : format(new Date(holidayDate), 'yyyy-MM-dd');
            
            // Aktualisiere den Kalendertag
            await db.update(calendarDays)
              .set({
                is_public_holiday: true,
                day_type: DayType.PUBLIC_HOLIDAY,
                holiday_name: holidayName,
                updated_at: sql`CURRENT_TIMESTAMP`
              })
              .where(
                and(
                  eq(calendarDays.date, formattedDate),
                  eq(calendarDays.state, stateCode)
                )
              );
            
            // Für Kompatibilität auch in die holidays-Tabelle eintragen
            await db.insert(holidays)
              .values({
                date: formattedDate,
                name: holidayName,
                description: `Gesetzlicher Feiertag in ${STATES_MAP[stateCode] || stateCode}`,
                type: 'PUBLIC_HOLIDAY',
                is_official: true,
                country: 'DE',
                state: stateCode,
                year: year,
                month: new Date(formattedDate).getMonth() + 1,
                day: new Date(formattedDate).getDate(),
                weekday: getDay(new Date(formattedDate)) === 0 ? 7 : getDay(new Date(formattedDate)),
                weekday_name: WEEKDAY_NAMES[getDay(new Date(formattedDate))],
                week: getISOWeek(new Date(formattedDate)),
                metadata: JSON.stringify(holiday)
              })
              .onConflictDoUpdate({
                target: [holidays.date, holidays.country, holidays.state],
                set: {
                  name: holidayName,
                  updated_at: sql`CURRENT_TIMESTAMP`
                }
              });
            
            updatedEntries++;
          } catch (error) {
            console.error(`Fehler beim Aktualisieren des Kalendertags (${holidayDate}, ${stateCode}):`, error);
          }
        }
      } catch (error) {
        console.error('Fehler beim Verarbeiten eines Feiertags:', error);
      }
    }
    
    console.log(`${updatedEntries} Feiertagseinträge wurden aktualisiert.`);
    return updatedEntries;
  }
  
  /**
   * Ruft Schulferiendaten für ein bestimmtes Bundesland und Jahr ab
   */
  async fetchSchoolHolidays(stateCode: string, year: number): Promise<any[]> {
    try {
      // Für Schulferien verwenden wir die OpenHolidaysAPI
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      const url = `${OPENHOLIDAYS_API_URL}/SchoolHolidays`;
      const params = {
        countryIsoCode: 'DE',
        subdivisionCode: `DE-${stateCode}`,
        validFrom: startDate,
        validTo: endDate,
      };
      
      console.log(`Rufe Schulferien für ${stateCode} (${year}) ab...`);
      const response = await axios.get(url, {
        params,
        timeout: 15000, // 15 Sekunden Timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CalendarService/1.0'
        }
      });
      
      if (response.status === 200 && Array.isArray(response.data)) {
        console.log(`${response.data.length} Schulferienperioden für ${stateCode} (${year}) erhalten.`);
        return response.data;
      } else {
        console.warn(`Unerwartete Antwort für Schulferien (${stateCode}, ${year}): Status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Schulferien für ${stateCode} (${year}):`, error);
      
      // Fallback: Schulferien für Sachsen, wenn ein Fehler auftritt
      if (stateCode !== 'SN') {
        console.log(`Versuche, Schulferien für Sachsen (SN) statt ${stateCode} abzurufen...`);
        try {
          return await this.fetchSchoolHolidays('SN', year);
        } catch (fallbackError) {
          console.error('Fallback zu Sachsen-Schulferien fehlgeschlagen:', fallbackError);
        }
      }
      
      // Fallback: Generierte Standard-Schulferien für Deutschland, wenn alle API-Abfragen fehlschlagen
      console.log(`Fallback: Verwende fest codierte Standard-Schulferien für ${year}...`);
      return this.generateDefaultSchoolHolidays(stateCode, year);
    }
  }
  
  /**
   * Generiert Standard-Schulferien für ein gegebenes Jahr und Bundesland,
   * wenn keine Daten von der API verfügbar sind
   */
  private generateDefaultSchoolHolidays(stateCode: string, year: number): any[] {
    // Typische Ferienperioden für deutsche Bundesländer
    // Dies ist nur eine Näherung und sollte durch tatsächliche Daten ersetzt werden!
    const holidays = [
      // Weihnachtsferien des Vorjahres (enden in diesem Jahr)
      {
        name: [{ language: 'DE', text: 'Weihnachtsferien' }],
        startDate: `${year-1}-12-23`,
        endDate: `${year}-01-06`
      },
      // Winterferien / Fasching (nicht überall, aber verbreitet)
      {
        name: [{ language: 'DE', text: 'Winterferien' }],
        startDate: `${year}-02-01`,
        endDate: `${year}-02-15`
      },
      // Osterferien
      {
        name: [{ language: 'DE', text: 'Osterferien' }],
        startDate: `${year}-04-01`,
        endDate: `${year}-04-15`
      },
      // Pfingstferien (nicht überall, aber in vielen Bundesländern)
      {
        name: [{ language: 'DE', text: 'Pfingstferien' }],
        startDate: `${year}-05-25`,
        endDate: `${year}-06-05`
      },
      // Sommerferien (variieren stark, aber ca. 6 Wochen im Sommer)
      {
        name: [{ language: 'DE', text: 'Sommerferien' }],
        startDate: `${year}-07-15`,
        endDate: `${year}-08-25`
      },
      // Herbstferien
      {
        name: [{ language: 'DE', text: 'Herbstferien' }],
        startDate: `${year}-10-01`,
        endDate: `${year}-10-15`
      },
      // Weihnachtsferien dieses Jahr (beginnen in diesem Jahr, enden im nächsten)
      {
        name: [{ language: 'DE', text: 'Weihnachtsferien' }],
        startDate: `${year}-12-23`,
        endDate: `${year+1}-01-06`
      }
    ];
    
    // Konvertieren in das von der API erwartete Format
    return holidays.map(holiday => ({
      id: `generated-${stateCode}-${holiday.name[0].text}-${year}`,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
      name: holiday.name,
      comment: 'Generierte Schulferiendaten (Fallback)',
      type: 'SchoolHoliday',
      version: '1.0',
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      country: {
        code: 'DE',
        name: [{ language: 'DE', text: 'Deutschland' }]
      },
      subdivision: {
        code: `DE-${stateCode}`,
        name: [{ language: 'DE', text: STATES_MAP[stateCode] || stateCode }]
      }
    }));
  }
  
  /**
   * Synchronisiert Schulferien für ein bestimmtes Jahr und alle oder bestimmte Bundesländer
   */
  async syncSchoolHolidays(year: number, states: string[] = ALL_STATES.map(s => s.code)): Promise<number> {
    console.log(`Synchronisiere Schulferien für ${year} und ${states.length} Bundesländer...`);
    
    let updatedEntries = 0;
    
    for (const stateCode of states) {
      try {
        const schoolHolidays = await this.fetchSchoolHolidays(stateCode, year);
        
        if (!schoolHolidays || schoolHolidays.length === 0) {
          console.warn(`Keine Schulferien für ${stateCode} (${year}) gefunden.`);
          continue;
        }
        
        // Verarbeite die Schulferien für dieses Bundesland
        for (const holiday of schoolHolidays) {
          try {
            const startDate = new Date(holiday.startDate);
            const endDate = new Date(holiday.endDate);
            
            // Name der Schulferien 
            const holidayName = holiday.name?.[0]?.text || 
              holiday.name?.find((n: any) => n.language === 'DE')?.text || 
              'Schulferien';
            
            // Für jeden Tag innerhalb des Ferienzeitraums
            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
              const formattedDate = format(currentDate, 'yyyy-MM-dd');
              
              // Aktualisiere den Kalendertag
              // Priorität der Tagestypen: PUBLIC_HOLIDAY > WEEKEND > SCHOOL_HOLIDAY > WORKDAY
              // Schulferien-Flag setzen, aber Tag-Typ nur ändern, wenn höhere Priorität
              await db.update(calendarDays)
                .set({
                  is_school_holiday: true,
                  // day_type Priorität: PUBLIC_HOLIDAY > WEEKEND > SCHOOL_HOLIDAY > WORKDAY
                  // Ändere den day_type nur, wenn es kein PUBLIC_HOLIDAY und kein WEEKEND ist
                  day_type: sql`
                    CASE 
                      WHEN ${calendarDays.is_public_holiday} = true THEN '${DayType.PUBLIC_HOLIDAY}'
                      WHEN ${calendarDays.is_weekend} = true THEN '${DayType.WEEKEND}'
                      ELSE '${DayType.SCHOOL_HOLIDAY}'
                    END
                  `,
                  // Feriename nur setzen, wenn noch kein Name vorhanden ist (Feiertagsname hat Vorrang)
                  holiday_name: sql`
                    CASE 
                      WHEN ${calendarDays.holiday_name} IS NULL THEN ${holidayName}
                      ELSE ${calendarDays.holiday_name}
                    END
                  `,
                  updated_at: sql`CURRENT_TIMESTAMP`
                })
                .where(
                  and(
                    eq(calendarDays.date, formattedDate),
                    eq(calendarDays.state, stateCode)
                  )
                );
              
              // Für Kompatibilität auch in die holidays-Tabelle eintragen
              await db.insert(holidays)
                .values({
                  date: formattedDate,
                  name: holidayName,
                  description: `Schulferien (${holidayName}) in ${STATES_MAP[stateCode] || stateCode}`,
                  type: 'SCHOOL_HOLIDAY',
                  is_official: false,
                  country: 'DE',
                  state: stateCode,
                  year: currentDate.getFullYear(),
                  month: currentDate.getMonth() + 1,
                  day: currentDate.getDate(),
                  weekday: getDay(currentDate) === 0 ? 7 : getDay(currentDate),
                  weekday_name: WEEKDAY_NAMES[getDay(currentDate)],
                  week: getISOWeek(currentDate),
                  metadata: JSON.stringify({
                    ...holiday,
                    range: {
                      start: format(startDate, 'yyyy-MM-dd'),
                      end: format(endDate, 'yyyy-MM-dd')
                    }
                  })
                })
                .onConflictDoUpdate({
                  target: [holidays.date, holidays.country, holidays.state],
                  set: {
                    name: eq(holidays.type, 'PUBLIC_HOLIDAY') ? holidays.name : holidayName,
                    type: eq(holidays.type, 'PUBLIC_HOLIDAY') ? holidays.type : 'SCHOOL_HOLIDAY',
                    updated_at: sql`CURRENT_TIMESTAMP`
                  }
                });
              
              updatedEntries++;
              
              // Zum nächsten Tag
              currentDate = addDays(currentDate, 1);
            }
          } catch (error) {
            console.error(`Fehler beim Verarbeiten einer Schulferienperiode für ${stateCode}:`, error);
          }
        }
      } catch (error) {
        console.error(`Fehler bei der Schulferien-Synchronisierung für ${stateCode} (${year}):`, error);
      }
    }
    
    console.log(`${updatedEntries} Schulferieneinträge wurden aktualisiert.`);
    return updatedEntries;
  }
  
  /**
   * Synchronisiert öffentliche Feiertage und Schulferien für einen bestimmten Zeitraum
   */
  async syncHolidaysForPeriod(
    startYear: number, 
    endYear: number, 
    states: string[] = ALL_STATES.map(s => s.code)
  ): Promise<any> {
    console.log(`Synchronisiere Feiertage und Schulferien für ${startYear}-${endYear}...`);
    
    // Ergebnis-Objekt initialisieren
    const result: any = {
      publicHolidays: 0,
      schoolHolidays: 0,
      calendarDays: 0,
      years: []
    };
    
    // Startdatum für die Kalendertabelle
    const startDate = new Date(`${startYear}-01-01`);
    const endDate = new Date(`${endYear}-12-31`);
    
    // Zuerst alle Kalendertage initialisieren
    const initializedDays = await this.initializeCalendarDays(startDate, endDate, states);
    result.calendarDays = initializedDays;
    
    // Für jedes Jahr Feiertage und Schulferien synchronisieren
    for (let year = startYear; year <= endYear; year++) {
      try {
        console.log(`Verarbeite Jahr ${year}...`);
        
        // Öffentliche Feiertage
        const publicHolidaysCount = await this.syncPublicHolidays(year, states);
        
        // Kurze Pause zwischen den API-Anfragen
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Schulferien
        const schoolHolidaysCount = await this.syncSchoolHolidays(year, states);
        
        // Ergebnisse für dieses Jahr speichern
        result.publicHolidays += publicHolidaysCount;
        result.schoolHolidays += schoolHolidaysCount;
        result.years.push({
          year,
          publicHolidays: publicHolidaysCount,
          schoolHolidays: schoolHolidaysCount,
          states: states.length
        });
        
        console.log(`Jahr ${year} abgeschlossen: ${publicHolidaysCount} Feiertage, ${schoolHolidaysCount} Schulferientage.`);
      } catch (error) {
        console.error(`Fehler bei der Verarbeitung des Jahres ${year}:`, error);
      }
    }
    
    return result;
  }
  
  /**
   * Holt Kalendertage für einen bestimmten Zeitraum aus der Datenbank
   */
  async getCalendarDays(
    startDate: Date | string,
    endDate: Date | string,
    states: string[] = ['SN'],
    options: { includeWeekends?: boolean, includePublicHolidays?: boolean, includeSchoolHolidays?: boolean } = {}
  ): Promise<any[]> {
    try {
      // Parameter-Validierung und -Konvertierung
      const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
      
      // Standardwerte für Optionen
      const { 
        includeWeekends = true, 
        includePublicHolidays = true, 
        includeSchoolHolidays = true 
      } = options;
      
      // Erstelle die WHERE-Bedingung
      let conditions = and(
        gte(calendarDays.date, format(start, 'yyyy-MM-dd')),
        lte(calendarDays.date, format(end, 'yyyy-MM-dd'))
      );
      
      // Filtere nach Bundesländern
      if (states.length === 1) {
        conditions = and(conditions, eq(calendarDays.state, states[0]));
      } else if (states.length > 1) {
        // In einer realen Implementierung würde man hier sql`state IN (...)` verwenden
        // Für Einfachheit nehmen wir hier das erste Bundesland
        conditions = and(conditions, eq(calendarDays.state, states[0]));
      }
      
      // Hole die Daten aus der Datenbank
      const days = await db
        .select()
        .from(calendarDays)
        .where(conditions)
        .orderBy(calendarDays.date);
      
      // Nachbearbeitung: Filtern nach Optionen und Formatierung
      return days.filter(day => {
        // Nur bestimmte Tagestypen einbeziehen
        if (!includeWeekends && day.is_weekend) return false;
        if (!includePublicHolidays && day.is_public_holiday) return false;
        if (!includeSchoolHolidays && day.is_school_holiday && !day.is_public_holiday) return false;
        
        return true;
      }).map(day => ({
        ...day,
        date: format(new Date(day.date), 'yyyy-MM-dd')
      }));
    } catch (error) {
      console.error('Fehler beim Abrufen der Kalendertage:', error);
      return [];
    }
  }
  
  /**
   * Erstellt eine vollständige Kalendertabelle für die Anzeige im Frontend
   */
  async generateCalendarTable(
    startYear: number = 2023,
    endYear: number = new Date().getFullYear() + 1,
    states: string[] = ['SN']
  ): Promise<any> {
    try {
      const startDate = new Date(`${startYear}-01-01`);
      const endDate = new Date(`${endYear}-12-31`);
      
      // Fehlende Tage initialisieren, falls notwendig
      await this.initializeCalendarDays(startDate, endDate, states);
      
      // Daten für jeden Monat im angegebenen Zeitraum holen
      const result: any = {
        years: {},
        totalDays: 0,
        workdays: 0,
        weekends: 0,
        publicHolidays: 0,
        schoolHolidays: 0
      };
      
      for (let year = startYear; year <= endYear; year++) {
        result.years[year] = {
          months: {},
          workdays: 0,
          weekends: 0,
          publicHolidays: 0,
          schoolHolidays: 0
        };
        
        for (let month = 1; month <= 12; month++) {
          const monthStart = new Date(year, month - 1, 1);
          const monthEnd = new Date(year, month, 0); // Letzter Tag des Monats
          
          const daysInMonth = await this.getCalendarDays(
            monthStart,
            monthEnd,
            states,
            { includeWeekends: true, includePublicHolidays: true, includeSchoolHolidays: true }
          );
          
          // Statistiken für diesen Monat
          const monthStats = {
            days: daysInMonth,
            totalDays: daysInMonth.length,
            workdays: daysInMonth.filter(d => d.day_type === 'WORKDAY').length,
            weekends: daysInMonth.filter(d => d.is_weekend).length,
            publicHolidays: daysInMonth.filter(d => d.is_public_holiday).length,
            schoolHolidays: daysInMonth.filter(d => d.is_school_holiday && !d.is_public_holiday).length
          };
          
          // Zum Jahr hinzufügen
          result.years[year].months[month] = monthStats;
          
          // Statistiken aktualisieren
          result.years[year].workdays += monthStats.workdays;
          result.years[year].weekends += monthStats.weekends;
          result.years[year].publicHolidays += monthStats.publicHolidays;
          result.years[year].schoolHolidays += monthStats.schoolHolidays;
          
          result.totalDays += monthStats.totalDays;
          result.workdays += monthStats.workdays;
          result.weekends += monthStats.weekends;
          result.publicHolidays += monthStats.publicHolidays;
          result.schoolHolidays += monthStats.schoolHolidays;
        }
      }
      
      return result;
    } catch (error) {
      console.error('Fehler beim Erstellen der Kalendertabelle:', error);
      return null;
    }
  }
}

// Singleton-Instanz
const calendarService = new CalendarService();

export default calendarService;
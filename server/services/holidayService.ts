import axios from 'axios';
import { db } from '../db';
import { holidays } from '@shared/schema';
import { format, addDays, parse, parseISO } from 'date-fns';
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm';

// Deutsche Feiertage und Ferienzeiten API
const API_BASE_URL = 'https://feiertage-api.de/api';

// Bundesländer
export const STATES = {
  'BW': 'Baden-Württemberg',
  'BY': 'Bayern',
  'BE': 'Berlin',
  'BB': 'Brandenburg',
  'HB': 'Bremen',
  'HH': 'Hamburg',
  'HE': 'Hessen',
  'MV': 'Mecklenburg-Vorpommern',
  'NI': 'Niedersachsen',
  'NW': 'Nordrhein-Westfalen',
  'RP': 'Rheinland-Pfalz',
  'SL': 'Saarland',
  'SN': 'Sachsen',
  'ST': 'Sachsen-Anhalt',
  'SH': 'Schleswig-Holstein',
  'TH': 'Thüringen'
};

interface PublicHolidayResponse {
  name: string;
  date: string;
  states: string[];
  translationKey: string;
}

interface SchoolHolidayResponse {
  id: number;
  start: string;
  end: string;
  year: number;
  stateCode: string;
  state: string;
  name: string;
  slug: string;
}

/**
 * Service-Klasse für die Verwaltung von Feiertagen und Schulferien
 */
class HolidayService {
  /**
   * Abrufen aller öffentlichen Feiertage für ein Jahr
   * @param year Jahr für das die Feiertage abgerufen werden sollen
   * @returns Array von formatierten Feiertagen
   */
  async fetchPublicHolidays(year: number): Promise<any[]> {
    try {
      // Format der API: /api/?jahr=2024&nur_land=SN
      const response = await axios.get(`${API_BASE_URL}/?jahr=${year}`);
      // Die Antwort ist ein Objekt, das nach Bundesländern strukturiert ist
      const responseData = response.data;
      
      const formattedHolidays: any[] = [];

      // Für jedes Bundesland im Objekt
      Object.keys(responseData).forEach(state => {
        const stateData = responseData[state];
        
        // Für jeden Feiertag im Bundesland
        Object.keys(stateData).forEach(holidayName => {
          const holiday = stateData[holidayName];
          const holidayDate = new Date(holiday.datum);
          
          formattedHolidays.push({
            date: holidayDate,
            name: holidayName,
            description: holiday.hinweis || `Gesetzlicher Feiertag in ${STATES[state as keyof typeof STATES] || state}`,
            type: 'PUBLIC_HOLIDAY',
            is_official: true,
            country: 'DE',
            state: state,
            region: null,
            year: holidayDate.getFullYear(),
            month: holidayDate.getMonth() + 1,
            day: holidayDate.getDate(),
            weekday: holidayDate.getDay(),
            weekday_name: this.getWeekdayName(holidayDate.getDay()),
            week: this.getWeekNumber(holidayDate),
          });
        });
      });
      
      return formattedHolidays;
    } catch (error) {
      console.error('Fehler beim Abrufen der öffentlichen Feiertage:', error);
      return [];
    }
  }

  /**
   * Abrufen aller Schulferien für ein Bundesland und Jahr
   * @param stateCode Code des Bundeslandes
   * @param year Jahr für das die Ferien abgerufen werden sollen
   * @returns Array von formatierten Schulferien
   */
  async fetchSchoolHolidays(stateCode: string, year: number): Promise<any[]> {
    try {
      // Die feiertage-api.de hat keine separate API für Schulferien
      // Daher geben wir ein leeres Array zurück und nutzen nur die öffentlichen Feiertage
      console.log(`Keine Schulferien-API verfügbar für ${stateCode} im Jahr ${year}`);
      return [];
      
      // Für den Fall, dass später eine separate API für Schulferien existiert
      /*
      const response = await axios.get(`${API_BASE_URL}/ferien/?jahr=${year}&nur_land=${stateCode}`);
      const schoolHolidays = response.data;
      
      const formattedHolidays: any[] = [];
      
      // Hier würde die Umwandlung der API-Daten in unser Format erfolgen
      
      return formattedHolidays;
      */
    } catch (error) {
      console.error(`Fehler beim Abrufen der Schulferien für ${stateCode}:`, error);
      return [];
    }
  }

  /**
   * Synchronisieren der Feiertage und Schulferien für ein Jahr
   * @param year Jahr für das die Daten synchronisiert werden sollen
   * @param states Liste der Bundesländer (Standard: SN - Sachsen)
   * @returns Anzahl der hinzugefügten Einträge
   */
  async syncHolidaysForYear(year: number, states: string[] = ['SN']): Promise<number> {
    try {
      // Bestehende Feiertage für das Jahr abrufen
      const existingHolidays = await db
        .select()
        .from(holidays)
        .where(eq(holidays.year, year));
      
      // Öffentliche Feiertage abrufen
      const publicHolidays = await this.fetchPublicHolidays(year);
      
      // Schulferien für die angegebenen Bundesländer abrufen
      let allSchoolHolidays: any[] = [];
      for (const stateCode of states) {
        const stateHolidays = await this.fetchSchoolHolidays(stateCode, year);
        allSchoolHolidays = [...allSchoolHolidays, ...stateHolidays];
      }
      
      // Alle Feiertage kombinieren
      const allHolidays = [...publicHolidays, ...allSchoolHolidays];
      
      // Zähler für hinzugefügte Einträge
      let addedEntries = 0;
      
      // Feiertage in der Datenbank speichern
      for (const holiday of allHolidays) {
        try {
          // Formatierte Daten für Vergleich nutzen
          const holidayDate = holiday.date instanceof Date ? 
            format(holiday.date, 'yyyy-MM-dd') : 
            (typeof holiday.date === 'string' ? holiday.date : '');
          
          // Prüfen, ob der Feiertag bereits existiert
          const existingHoliday = existingHolidays.find(h => {
            const existingDate = h.date instanceof Date ? 
              format(h.date, 'yyyy-MM-dd') : 
              (typeof h.date === 'string' ? h.date : '');
            
            return existingDate === holidayDate && 
              h.type === holiday.type &&
              h.state === holiday.state;
          });
          
          if (!existingHoliday) {
            // Feiertag hinzufügen
            await db.insert(holidays).values({
              date: this.formatDate(holiday.date), // Konvertiere das Datum in einen String
              name: holiday.name,
              description: holiday.description,
              type: holiday.type,
              is_official: holiday.is_official,
              country: holiday.country,
              state: holiday.state,
              region: holiday.region,
              year: holiday.year,
              month: holiday.month,
              day: holiday.day,
              weekday: holiday.weekday,
              weekday_name: holiday.weekday_name,
              week: holiday.week,
            });
            
            addedEntries++;
          }
        } catch (error) {
          console.error('Fehler beim Speichern eines Feiertags:', error);
          // Fahre mit dem nächsten Feiertag fort
          continue;
        }
      }
      
      return addedEntries;
    } catch (error) {
      console.error(`Fehler bei der Synchronisierung der Feiertage für ${year}:`, error);
      return 0;
    }
  }
  
  /**
   * Abrufen aller Feiertage in einem Zeitraum
   * @param startDate Startdatum für den Zeitraum
   * @param endDate Enddatum für den Zeitraum
   * @returns Array von Feiertagen
   */
  async getHolidaysInRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      // Formatiere die Daten für SQL-Abfrage
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      
      const results = await db
        .select()
        .from(holidays)
        .where(
          and(
            gte(holidays.date, sql`${startDateStr}::date`),
            lte(holidays.date, sql`${endDateStr}::date`)
          )
        )
        .orderBy(holidays.date);
      
      // Konvertiere die Ergebnisse in ein geeignetes Format für die API
      return results.map(holiday => {
        // Berechnung, ob es sich um einen Schulfeiertag handelt
        const isSchoolHoliday = holiday.type === 'SCHOOL_HOLIDAY';

        return {
          id: holiday.id,
          date: this.formatDate(holiday.date),
          name: holiday.name,
          description: holiday.description,
          type: holiday.type,
          isSchoolHoliday,
          isPublicHoliday: !isSchoolHoliday,
          isOfficial: holiday.is_official,
          country: holiday.country,
          state: holiday.state,
          states: holiday.state?.split(', ') || [],
          region: holiday.region,
          year: holiday.year,
          month: holiday.month,
          day: holiday.day
        };
      });
    } catch (error) {
      console.error('Fehler beim Abrufen der Feiertage im Zeitraum:', error);
      return [];
    }
  }
  
  /**
   * Abrufen aller Feiertage für ein Datum
   * @param date Datum für das die Feiertage abgerufen werden sollen
   * @returns Array von Feiertagen
   */
  async getHolidaysForDate(date: Date): Promise<any[]> {
    try {
      // Datum normalisieren und als String konvertieren für SQL-Abfrage
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      const dateStr = format(normalizedDate, 'yyyy-MM-dd');
      
      const results = await db
        .select()
        .from(holidays)
        .where(eq(holidays.date, sql`${dateStr}::date`));
      
      // Konvertiere die Ergebnisse in ein geeignetes Format für die API (analog zu getHolidaysInRange)
      return results.map(holiday => {
        const isSchoolHoliday = holiday.type === 'SCHOOL_HOLIDAY';
        
        return {
          id: holiday.id,
          date: this.formatDate(holiday.date),
          name: holiday.name,
          description: holiday.description,
          type: holiday.type,
          isSchoolHoliday,
          isPublicHoliday: !isSchoolHoliday,
          isOfficial: holiday.is_official,
          country: holiday.country,
          state: holiday.state,
          states: holiday.state?.split(', ') || [],
          region: holiday.region,
          year: holiday.year,
          month: holiday.month,
          day: holiday.day
        };
      });
    } catch (error) {
      console.error('Fehler beim Abrufen der Feiertage für das Datum:', error);
      return [];
    }
  }
  
  /**
   * Prüft, ob ein Datum ein Feiertag oder Schulferien ist
   * @param date Zu prüfendes Datum
   * @returns Objekt mit Informationen zum Feiertag oder null
   */
  async isHoliday(date: Date): Promise<any | null> {
    try {
      const holidaysList = await this.getHolidaysForDate(date);
      
      if (holidaysList.length > 0) {
        // Priorisiere öffentliche Feiertage über Schulferien
        const publicHoliday = holidaysList.find(h => h.type === 'PUBLIC_HOLIDAY');
        return publicHoliday || holidaysList[0];
      }
      
      return null;
    } catch (error) {
      console.error('Fehler bei der Prüfung auf Feiertag:', error);
      return null;
    }
  }

  /**
   * Gibt den Namen eines Wochentags zurück
   * @param weekday Nummer des Wochentags (0 = Sonntag, 1 = Montag, ...)
   * @returns Name des Wochentags
   */
  getWeekdayName(weekday: number): string {
    const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return weekdays[weekday];
  }

  /**
   * Berechnet die Kalenderwoche für ein Datum
   * @param date Datum
   * @returns Kalenderwoche
   */
  getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
  
  /**
   * Konvertiert ein Datum in das Format YYYY-MM-DD für die Anzeige 
   * oder ein Date-Objekt für die Datenbank
   * @param date Zu konvertierendes Datum
   * @param forDisplay Wenn true, wird ein String zurückgegeben, sonst ein Date-Objekt
   * @returns Formatiertes Datum als String oder Date-Objekt
   */
  formatDate(date: any, forDisplay: boolean = false): any {
    // Erzeugt ein Date-Objekt aus dem Eingabewert
    let dateObject: Date | null = null;
    
    if (date instanceof Date) {
      dateObject = new Date(date);
    } else if (typeof date === 'string') {
      try {
        dateObject = parseISO(date);
      } catch (e) {
        if (forDisplay) return date;
        return null;
      }
    }
    
    // Wenn kein gültiges Datum erstellt werden konnte
    if (!dateObject || isNaN(dateObject.getTime())) {
      if (forDisplay) return '';
      return null;
    }
    
    // Je nach Anforderung zurückgeben
    if (forDisplay) {
      return format(dateObject, 'yyyy-MM-dd');
    }
    
    return dateObject;
  }
}

export const holidayService = new HolidayService();

/**
 * Synchronisiert Feiertage für einen Zeitraum, falls sie fehlen
 * @param startYear Startjahr (Standard: aktuelles Jahr)
 * @param endYear Endjahr (Standard: aktuelles Jahr + 1)
 * @param states Bundesländer (Standard: Sachsen)
 * @param includeSchoolHolidays Ob Schulferien mit synchronisiert werden sollen
 * @returns Anzahl der hinzugefügten Einträge
 */
export async function syncMissingHolidays(
  startYear: number = new Date().getFullYear(),
  endYear: number = new Date().getFullYear() + 1,
  states: string[] = ['SN'],
  includeSchoolHolidays: boolean = true
): Promise<any> {
  console.log(`Synchronisiere Feiertage für Jahre ${startYear}-${endYear} und Bundesländer ${states.join(', ')}`);
  
  // Halte die Anzahl der hinzugefügten Einträge nach
  let totalEntries = 0;
  
  // Für jedes Jahr im Bereich
  for (let year = startYear; year <= endYear; year++) {
    const entries = await holidayService.syncHolidaysForYear(year, states);
    totalEntries += entries;
  }
  
  return { 
    success: true, 
    addedEntries: totalEntries,
    years: { startYear, endYear },
    states
  };
}
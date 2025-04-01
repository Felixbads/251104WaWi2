import axios from 'axios';
import { db } from '../db';
import { holidays } from '@shared/schema';
import { format, addDays, parse, parseISO } from 'date-fns';
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm';

// OpenHolidaysAPI für Feiertage und Schulferien
const API_BASE_URL = 'https://openholidaysapi.org';

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

// Interface für OpenHolidaysAPI
interface OpenHolidayResponse {
  id: string;
  startDate: string;
  endDate: string;
  type: {
    id: string;
    name: string;
  };
  comment?: string;
  name: {
    language: string;
    text: string;
  }[];
  quality: string;
  subdivisions?: {
    code: string;
    shortName: string;
  }[];
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
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      // OpenHolidaysAPI für Feiertage (PublicHolidays)
      const url = `${API_BASE_URL}/PublicHolidays`;
      const params = {
        countryIsoCode: 'DE',
        validFrom: startDate,
        validTo: endDate,
      };
      
      console.log(`Rufe Feiertage von OpenHolidaysAPI ab für ${year}, URL: ${url}`);
      const response = await axios.get(url, { params });
      const holidays: OpenHolidayResponse[] = response.data;
      
      console.log(`Anzahl der abgerufenen Feiertage: ${holidays.length}`);
      
      const formattedHolidays: any[] = [];
      
      for (const holiday of holidays) {
        // Deutsche Übersetzung finden - OpenHolidaysAPI verwendet "DE" statt "de" für die Sprachcodes
        const nameDe = holiday.name.find(n => n.language === 'DE')?.text || 
                       holiday.name[0].text;
        
        // Startdatum des Feiertags
        const holidayDate = new Date(holiday.startDate);
        
        // Kategorisiere nach Bundesländern, falls vorhanden
        if (holiday.subdivisions && holiday.subdivisions.length > 0) {
          for (const subdivision of holiday.subdivisions) {
            // Bundesland-Code extrahieren (z.B. DE-SN => SN)
            const stateCode = subdivision.code.split('-')[1];
            
            formattedHolidays.push({
              date: holidayDate,
              name: nameDe,
              description: holiday.comment || `Gesetzlicher Feiertag in ${STATES[stateCode as keyof typeof STATES] || stateCode}`,
              type: 'PUBLIC_HOLIDAY',
              is_official: true,
              country: 'DE',
              state: stateCode,
              region: null,
              year: holidayDate.getFullYear(),
              month: holidayDate.getMonth() + 1,
              day: holidayDate.getDate(),
              weekday: holidayDate.getDay(),
              weekday_name: this.getWeekdayName(holidayDate.getDay()),
              week: this.getWeekNumber(holidayDate),
              metadata: JSON.stringify(holiday),
            });
          }
        } else {
          // Nationaler Feiertag (alle Bundesländer) - wir erstellen einen Eintrag pro Bundesland
          for (const stateKey of Object.keys(STATES)) {
            formattedHolidays.push({
              date: holidayDate,
              name: nameDe,
              description: holiday.comment || 'Gesetzlicher Feiertag in ganz Deutschland',
              type: 'PUBLIC_HOLIDAY',
              is_official: true,
              country: 'DE',
              state: stateKey,
              region: null,
              year: holidayDate.getFullYear(),
              month: holidayDate.getMonth() + 1,
              day: holidayDate.getDate(),
              weekday: holidayDate.getDay(),
              weekday_name: this.getWeekdayName(holidayDate.getDay()),
              week: this.getWeekNumber(holidayDate),
              metadata: JSON.stringify(holiday),
            });
          }
        }
      }
      
      console.log(`Verarbeitete Feiertage: ${formattedHolidays.length}`);
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
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      // OpenHolidaysAPI für Schulferien
      const url = `${API_BASE_URL}/SchoolHolidays`;
      const params = {
        countryIsoCode: 'DE',
        subdivisionCode: `DE-${stateCode}`, // Format: DE-SN, DE-BY, etc.
        validFrom: startDate,
        validTo: endDate,
      };
      
      console.log(`Rufe Schulferien von OpenHolidaysAPI ab für ${stateCode} (${year}), URL: ${url}`);
      const response = await axios.get(url, { params });
      const holidays: OpenHolidayResponse[] = response.data;
      
      console.log(`Anzahl der abgerufenen Schulferien für ${stateCode}: ${holidays.length}`);
      
      const formattedHolidays: any[] = [];
      
      for (const holiday of holidays) {
        // Deutsche Übersetzung finden - OpenHolidaysAPI verwendet "DE" statt "de" für die Sprachcodes
        const nameDe = holiday.name.find(n => n.language === 'DE')?.text || 
                       holiday.name[0].text;
        
        // Start- und Enddatum für Schulferien
        const startDate = new Date(holiday.startDate);
        const endDate = new Date(holiday.endDate);
        
        // Für jeden Tag innerhalb der Ferienzeit einen Eintrag erstellen
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const holidayDate = new Date(currentDate);
          
          formattedHolidays.push({
            date: holidayDate,
            name: nameDe,
            description: `Schulferien (${nameDe}) in ${STATES[stateCode as keyof typeof STATES] || stateCode}`,
            type: 'SCHOOL_HOLIDAY',
            is_official: false,
            country: 'DE',
            state: stateCode,
            region: null,
            year: holidayDate.getFullYear(),
            month: holidayDate.getMonth() + 1,
            day: holidayDate.getDate(),
            weekday: holidayDate.getDay(),
            weekday_name: this.getWeekdayName(holidayDate.getDay()),
            week: this.getWeekNumber(holidayDate),
            metadata: JSON.stringify({
              ...holiday,
              holidayRange: {
                start: format(startDate, 'yyyy-MM-dd'),
                end: format(endDate, 'yyyy-MM-dd')
              }
            }),
          });
          
          // Zum nächsten Tag
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      console.log(`Verarbeitete Schulferien-Tage für ${stateCode}: ${formattedHolidays.length}`);
      return formattedHolidays;
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
          // Formatiere Datum für Vergleich
          const holidayDate = this.formatDate(holiday.date, true);
          
          // Prüfen, ob der Feiertag bereits existiert
          const existingHoliday = existingHolidays.find(h => {
            // Konvertiere h.date in ein vergleichbares Format
            const existingDate = this.formatDate(h.date, true);
            
            return existingDate === holidayDate && 
              h.type === holiday.type &&
              h.state === holiday.state;
          });
          
          if (!existingHoliday) {
            // Feiertag hinzufügen - wichtig: formatDate mit forDisplay=true, um ein String-Format zu erhalten
            // Das wird dann in der Datenbank automatisch in ein Date umgewandelt
            const formattedDate = this.formatDate(holiday.date, true);
            
            await db.insert(holidays).values({
              date: formattedDate, // Als String im Format YYYY-MM-DD
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
              metadata: holiday.metadata || null
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

        // Extrametadata aus dem JSON-String, falls vorhanden
        let extraData = {};
        if (holiday.metadata) {
          try {
            extraData = JSON.parse(holiday.metadata);
          } catch (e) {
            // Ignoriere Fehler beim Parsen
          }
        }

        // Bundesland-Langname, falls Bundesland-Kürzel vorhanden
        const stateName = holiday.state ? 
          (STATES[holiday.state as keyof typeof STATES] || holiday.state) : 
          'Alle Bundesländer';

        return {
          id: holiday.id,
          date: this.formatDate(holiday.date, true),
          name: holiday.name,
          description: holiday.description,
          type: holiday.type,
          isSchoolHoliday,
          isPublicHoliday: !isSchoolHoliday,
          isOfficial: holiday.is_official,
          country: holiday.country,
          state: holiday.state,
          stateName: stateName,
          states: holiday.state?.split(', ') || [],
          region: holiday.region,
          year: holiday.year,
          month: holiday.month,
          day: holiday.day,
          weekday: holiday.weekday,
          weekdayName: holiday.weekday_name,
          week: holiday.week,
          extraData
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
        // Berechnung, ob es sich um einen Schulfeiertag handelt
        const isSchoolHoliday = holiday.type === 'SCHOOL_HOLIDAY';

        // Extrametadata aus dem JSON-String, falls vorhanden
        let extraData = {};
        if (holiday.metadata) {
          try {
            extraData = JSON.parse(holiday.metadata);
          } catch (e) {
            // Ignoriere Fehler beim Parsen
          }
        }

        // Bundesland-Langname, falls Bundesland-Kürzel vorhanden
        const stateName = holiday.state ? 
          (STATES[holiday.state as keyof typeof STATES] || holiday.state) : 
          'Alle Bundesländer';

        return {
          id: holiday.id,
          date: this.formatDate(holiday.date, true),
          name: holiday.name,
          description: holiday.description,
          type: holiday.type,
          isSchoolHoliday,
          isPublicHoliday: !isSchoolHoliday,
          isOfficial: holiday.is_official,
          country: holiday.country,
          state: holiday.state,
          stateName: stateName,
          states: holiday.state?.split(', ') || [],
          region: holiday.region,
          year: holiday.year,
          month: holiday.month,
          day: holiday.day,
          weekday: holiday.weekday,
          weekdayName: holiday.weekday_name,
          week: holiday.week,
          extraData
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
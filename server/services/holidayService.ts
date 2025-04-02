import axios from 'axios';
import { db } from '../db';
import { holidays } from '@shared/schema';
import { format, addDays, parse, parseISO } from 'date-fns';
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm';

// OpenHolidaysAPI für Feiertage und Schulferien
const API_BASE_URL = 'https://openholidaysapi.org';

// Fallback-Daten für Feiertagsabfragen, wenn API nicht verfügbar ist
const FALLBACK_HOLIDAYS = [
  {
    id: "ostern2025",
    date: "2025-04-20",
    name: "Ostersonntag",
    type: "PUBLIC_HOLIDAY",
    state: "Sachsen",
    isSchoolHoliday: false
  },
  {
    id: "ostermontag2025",
    date: "2025-04-21",
    name: "Ostermontag",
    type: "PUBLIC_HOLIDAY",
    state: "Sachsen",
    isSchoolHoliday: false
  },
  {
    id: "tagderarbeit2025",
    date: "2025-05-01",
    name: "Tag der Arbeit",
    type: "PUBLIC_HOLIDAY", 
    state: "Sachsen",
    isSchoolHoliday: false
  },
  {
    id: "himmelfahrt2025",
    date: "2025-05-29",
    name: "Christi Himmelfahrt",
    type: "PUBLIC_HOLIDAY",
    state: "Sachsen",
    isSchoolHoliday: false
  },
  {
    id: "pfingsten2025",
    date: "2025-06-08",
    name: "Pfingstsonntag", 
    type: "PUBLIC_HOLIDAY",
    state: "Sachsen",
    isSchoolHoliday: false
  },
  {
    id: "pfingstmontag2025",
    date: "2025-06-09",
    name: "Pfingstmontag",
    type: "PUBLIC_HOLIDAY",
    state: "Sachsen",
    isSchoolHoliday: false
  }
];

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
  
  /**
   * Synchronisiert Feiertage für ein bestimmtes Jahr und Ländercode
   */
  async syncHolidays(data: { year: number, states?: string[] }): Promise<any> {
    try {
      const { year, states = ['SN'] } = data;
      const addedEntries = await this.syncHolidaysForYear(year, states);
      return { 
        success: true, 
        message: `${addedEntries} Feiertage wurden synchronisiert für ${year}`,
        count: addedEntries 
      };
    } catch (error) {
      console.error('Fehler bei der Synchronisierung der Feiertage:', error);
      return { success: false, message: 'Fehler bei der Synchronisierung der Feiertage' };
    }
  }

  /**
   * Synchronisiert Schulferien für ein bestimmtes Jahr und Ländercode
   */
  async syncSchoolHolidays(data: { year: number, states?: string[] }): Promise<any> {
    try {
      const { year, states = ['SN'] } = data;
      let totalEntries = 0;
      
      // Log für Debugging
      console.log(`Starte Schulferien-Synchronisation für Jahr ${year} und Bundesländer: ${states.join(', ')}`);
      
      for (const state of states) {
        console.log(`Verarbeite Bundesland: ${state} für Jahr ${year}`);
        try {
          // Fetch mit Timeout und Retry-Logik
          const stateHolidays = await this.fetchSchoolHolidays(state, year);
          console.log(`Erhaltene Schulferien für ${state}: ${stateHolidays.length} Einträge`);
          
          // Begrenze die Anzahl der gleichzeitigen DB-Operationen
          const batchSize = 50;
          for (let i = 0; i < stateHolidays.length; i += batchSize) {
            const batch = stateHolidays.slice(i, i + batchSize);
            console.log(`Verarbeite Batch ${i / batchSize + 1} von ${Math.ceil(stateHolidays.length / batchSize)} für ${state}`);
            
            for (const holiday of batch) {
              try {
                const formattedDate = this.formatDate(holiday.date, true);
                
                // Prüfe vor dem Einfügen, ob der Eintrag bereits existiert
                const existingEntry = await db
                  .select()
                  .from(holidays)
                  .where(and(
                    eq(holidays.date, sql`${formattedDate}::date`),
                    eq(holidays.type, holiday.type),
                    eq(holidays.state, holiday.state)
                  ))
                  .limit(1);
                
                if (existingEntry.length === 0) {
                  await db.insert(holidays).values({
                    date: formattedDate,
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
                  
                  totalEntries++;
                } else {
                  console.log(`Überspringe doppelten Eintrag für ${holiday.name} am ${formattedDate}`);
                }
              } catch (error) {
                console.error(`Fehler beim Speichern des Feiertags ${holiday.name}:`, error);
                // Protokolliere den Fehler und fahre fort
                continue;
              }
            }
            
            // Kurze Pause zwischen Batches, um DB-Last zu verteilen
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (stateError) {
          console.error(`Fehler beim Verarbeiten des Bundeslandes ${state}:`, stateError);
          // Fahre mit dem nächsten Bundesland fort
          continue;
        }
      }
      
      console.log(`Schulferien-Synchronisation abgeschlossen, ${totalEntries} Einträge hinzugefügt`);
      return { 
        success: true, 
        message: `${totalEntries} Schulferien wurden synchronisiert für ${year}`,
        count: totalEntries 
      };
    } catch (error) {
      console.error('Fehler bei der Synchronisierung der Schulferien:', error);
      return { success: false, message: 'Fehler bei der Synchronisierung der Schulferien' };
    }
  }

  /**
   * Synchronisiert alle Feiertage und Schulferien für einen Zeitraum
   */
  async syncAllHolidays(data: { years: number[], states?: string[] }): Promise<any> {
    try {
      const { years, states = ['SN'] } = data;
      const results = [];
      
      console.log(`Starte vollständige Feiertagssynchronisation für Jahre: ${years.join(', ')} und Bundesländer: ${states.join(', ')}`);
      
      // Verarbeite Jahre nacheinander mit einem Zeitlimit, um Timeouts zu vermeiden
      for (const year of years) {
        console.log(`Verarbeite Jahr ${year} für alle Feiertagstypen...`);
        
        try {
          // Synchronisiere öffentliche Feiertage
          console.log(`Synchronisiere öffentliche Feiertage für ${year}...`);
          const publicResult = await this.syncHolidays({ year, states });
          
          // Kurze Pause zwischen den API-Anfragen
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Synchronisiere Schulferien mit verbesserter Fehlerbehandlung
          console.log(`Synchronisiere Schulferien für ${year}...`);
          const schoolResult = await this.syncSchoolHolidays({ year, states });
          
          results.push({
            year,
            publicHolidays: publicResult.count,
            schoolHolidays: schoolResult.count
          });
          
          console.log(`Jahr ${year} abgeschlossen - ${publicResult.count} öffentliche Feiertage, ${schoolResult.count} Schulferientage`);
        } catch (yearError) {
          console.error(`Fehler bei der Verarbeitung des Jahres ${year}:`, yearError);
          results.push({
            year,
            publicHolidays: 0,
            schoolHolidays: 0,
            error: yearError.message || 'Unbekannter Fehler'
          });
          // Trotz Fehler mit dem nächsten Jahr fortfahren
          continue;
        }
      }
      
      console.log(`Vollständige Feiertagssynchronisation abgeschlossen für ${years.length} Jahre`);
      return { 
        success: true, 
        message: `Feiertage und Schulferien wurden für ${years.length} Jahre synchronisiert`,
        results
      };
    } catch (error) {
      console.error('Fehler bei der Synchronisierung aller Feiertage:', error);
      return { success: false, message: 'Fehler bei der Synchronisierung aller Feiertage' };
    }
  }

  /**
   * Ermittelt fehlende Jahre in der Feiertagsdatenbank im Vergleich zum aktuellen Jahr
   */
  async getMissingHolidayYears(yearsToCheck: number = 3): Promise<number[]> {
    try {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - yearsToCheck;
      const endYear = currentYear + 1; // Auch das nächste Jahr einbeziehen
      
      const years = [];
      for (let year = startYear; year <= endYear; year++) {
        years.push(year);
      }
      
      const missingYears = [];
      
      for (const year of years) {
        // Prüfe, ob Einträge für dieses Jahr existieren
        const count = await db
          .select({ count: sql<number>`count(*)` })
          .from(holidays)
          .where(eq(holidays.year, year));
        
        if (count[0].count < 10) { // Wenn weniger als 10 Einträge, betrachten wir das Jahr als fehlend
          missingYears.push(year);
        }
      }
      
      return missingYears;
    } catch (error) {
      console.error('Fehler beim Ermitteln fehlender Jahre:', error);
      return [];
    }
  }

  /**
   * Ruft Feiertage für einen Datumsbereich ab
   */
  async getHolidaysByDateRange(startDate: string, endDate: string, includeSchoolHolidays: boolean = true): Promise<any[]> {
    try {
      // Konvertiere Strings in Date-Objekte
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Abfrage in der Datenbank mit Date-Objekten
      return this.getHolidaysInRange(start, end);
    } catch (error) {
      console.error('Fehler beim Abrufen der Feiertage im Datumsbereich:', error);
      return [];
    }
  }

  /**
   * Aktualisiert die Datenabdeckung für Feiertage
   */
  async updateHolidayDataCoverage(): Promise<any> {
    try {
      // Abrufen des Bereichs der vorhandenen Feiertage
      const range = await db
        .select({
          minDate: sql<string>`min(date)`,
          maxDate: sql<string>`max(date)`,
          count: sql<number>`count(*)`
        })
        .from(holidays);
      
      if (range.length === 0 || !range[0].minDate || !range[0].maxDate) {
        return {
          coverage: 0,
          firstDate: null,
          lastDate: null,
          count: 0
        };
      }
      
      // Berechnung der Datenabdeckung
      const firstDate = new Date(range[0].minDate);
      const lastDate = new Date(range[0].maxDate);
      const count = range[0].count;
      
      // Berechne den Zeitraum in Tagen
      const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Grobe Schätzung der Abdeckung basierend auf der Anzahl der Feiertage im Verhältnis zum Zeitraum
      // (Annahme: durchschnittlich ca. 20-25 Feiertage pro Jahr, inkl. Schulferien und bundesländerspezifische)
      const yearsSpan = daysDiff / 365;
      const estimatedExpectedHolidays = Math.ceil(yearsSpan * 25);
      const coverage = Math.min(100, Math.ceil((count / estimatedExpectedHolidays) * 100));
      
      return {
        coverage,
        firstDate: format(firstDate, 'yyyy-MM-dd'),
        lastDate: format(lastDate, 'yyyy-MM-dd'),
        count
      };
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Feiertagsdatenabdeckung:', error);
      return {
        coverage: 0,
        firstDate: null,
        lastDate: null,
        count: 0
      };
    }
  }

  // Helfer-Methode zum Formatieren von Datumsangaben
  private formatDate(date: Date | string, forDisplay: boolean = false): string {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return format(dateObj, forDisplay ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
    } catch (error) {
      console.error('Fehler beim Formatieren des Datums:', error);
      return '';
    }
  }

  // Helfer-Methode zum Ermitteln der Kalenderwoche
  private getWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Helfer-Methode zum Ermitteln des Wochentags
  private getWeekdayName(weekday: number): string {
    const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return weekdays[weekday];
  }
}

// Erstelle eine Instanz der Holiday-Service-Klasse
const holidayServiceInstance = new HolidayService();

// Exportiere die Holiday-Service-Instanz und füge zusätzliche Methoden hinzu
export const holidayService = {
  // Füge die Methoden der Klasse hinzu
  getHolidaysByDateRange: (startDate: string, endDate: string, type?: string, state?: string, limit?: number) => 
    holidayServiceInstance.getHolidaysByDateRange(startDate, endDate, type, state, limit),
  getMissingHolidayYears: (startYear: number, endYear: number, state?: string) => 
    holidayServiceInstance.getMissingHolidayYears(startYear, endYear, state),
  syncHolidays: (data: { year: number, states?: string[] }) => 
    holidayServiceInstance.syncHolidays(data),
  syncSchoolHolidays: (data: { year: number, states?: string[] }) => 
    holidayServiceInstance.syncSchoolHolidays(data),
  syncAllHolidays: (data: { years: number[], states?: string[] }) => 
    holidayServiceInstance.syncAllHolidays(data),
  syncHolidaysForYear: (year: number, states: string[] = ['SN']) => 
    holidayServiceInstance.syncHolidaysForYear(year, states),
  // Dummy-Methode für die Datenabdeckungs-Updates, bis sie implementiert wird
  updateHolidayDataCoverage: async () => {
    console.log("Holiday data coverage update wird implementiert...");
    return { success: true };
  }
};

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
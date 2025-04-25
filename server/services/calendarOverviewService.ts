/**
 * Kalender-Übersichtsservice
 * 
 * Dieser Service ist für die Verwaltung der Kalender-Übersichtsdaten zuständig.
 * Er bietet Funktionen zum Konvertieren von calendar_days-Daten in die
 * calendarOverview-Tabelle, die für jedes Bundesland eine separate Spalte enthält.
 */

import { db } from '../db';
import { calendarDays as calendarDaysTable, calendarOverview, InsertCalendarOverview, DayType } from '@shared/schema';
import { format, addDays, eachDayOfInterval, isBefore, isAfter } from 'date-fns';
import { and, between, desc, eq, gte, lte, sql } from 'drizzle-orm';

// Liste der deutschen Bundesländer
const germanStates = [
  'baden_wuerttemberg',
  'bayern',
  'berlin',
  'brandenburg',
  'bremen',
  'hamburg',
  'hessen',
  'mecklenburg_vorpommern',
  'niedersachsen',
  'nordrhein_westfalen',
  'rheinland_pfalz',
  'saarland',
  'sachsen',
  'sachsen_anhalt',
  'schleswig_holstein',
  'thueringen'
];

// Mapping der Bundesland-Codes (wie BW, BY, usw.) zu vollständigen Namen
const stateCodes: Record<string, string> = {
  'BW': 'baden_wuerttemberg',
  'BY': 'bayern',
  'BE': 'berlin',
  'BB': 'brandenburg',
  'HB': 'bremen',
  'HH': 'hamburg',
  'HE': 'hessen',
  'MV': 'mecklenburg_vorpommern',
  'NI': 'niedersachsen',
  'NW': 'nordrhein_westfalen',
  'RP': 'rheinland_pfalz',
  'SL': 'saarland',
  'SN': 'sachsen',
  'ST': 'sachsen_anhalt',
  'SH': 'schleswig_holstein',
  'TH': 'thueringen'
};

/**
 * Erstellt die Kalender-Übersichtstabelle
 */
export class CalendarOverviewService {
  /**
   * Bestimmt den Tagestyp für einen Tag basierend auf den Flags
   * Priorität: PUBLIC_HOLIDAY > WEEKEND > SCHOOL_HOLIDAY > WORKDAY
   */
  private determineDayType(
    isPublicHoliday: boolean,
    isWeekend: boolean,
    isSchoolHoliday: boolean
  ): DayType {
    if (isPublicHoliday) return DayType.PUBLIC_HOLIDAY;
    if (isWeekend) return DayType.WEEKEND;
    if (isSchoolHoliday) return DayType.SCHOOL_HOLIDAY;
    return DayType.WORKDAY;
  }
  
  /**
   * Konvertiert einen Bundesland-Code (z.B. 'BY') in den entsprechenden Namen (z.B. 'bayern')
   */
  private getStateNameFromCode(stateCode: string): string | undefined {
    return stateCodes[stateCode];
  }

  /**
   * Erstellt einen neuen Eintrag in der Kalenderübersicht
   */
  async createOverviewEntry(date: Date | string): Promise<void> {
    // Sicherstellen, dass date ein Date-Objekt ist
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const formattedDate = format(dateObj, 'yyyy-MM-dd');

    // Alle Kalender-Tage für dieses Datum holen (einen pro Bundesland)
    const calendarDaysEntries = await db.select()
      .from(calendarDaysTable)
      .where(eq(calendarDaysTable.date, formattedDate));

    if (calendarDaysEntries.length === 0) {
      console.warn(`Keine Kalendertage für ${formattedDate} gefunden. Übersicht kann nicht erstellt werden.`);
      return;
    }

    // Einen beliebigen Eintrag nehmen, um allgemeine Tagesinformationen zu bekommen
    const firstDay = calendarDaysEntries[0];

    // Globale Eigenschaften ermitteln (is_weekend ist für alle gleich)
    const isWeekend = firstDay.is_weekend || false;
    
    // Aggregierte Eigenschaften (über alle Bundesländer)
    let hasAnyPublicHoliday = false;
    let hasAnySchoolHoliday = false;
    
    // Für jedes Bundesland Status prüfen
    for (const day of calendarDaysEntries) {
      if (day.is_public_holiday) {
        hasAnyPublicHoliday = true;
      }
      if (day.is_school_holiday) {
        hasAnySchoolHoliday = true;
      }
    }

    // Gesamt-Tagestyp bestimmen
    const dayType = this.determineDayType(
      hasAnyPublicHoliday,
      isWeekend,
      hasAnySchoolHoliday
    );

    // Grundlegende Daten für den Eintrag
    const overviewEntry: InsertCalendarOverview = {
      date: formattedDate,
      day_type: dayType,
      day_of_week: firstDay.day_of_week,
      week_of_year: firstDay.week_of_year,
      month: firstDay.month,
      year: firstDay.year,
      is_workday: !hasAnyPublicHoliday && !isWeekend,
      is_weekend: isWeekend,
      is_school_holiday: hasAnySchoolHoliday,
      is_public_holiday: hasAnyPublicHoliday,
    };

    // Bundesland-spezifische Informationen
    const overviewEntryAny = overviewEntry as any;
    
    // Initialwerte für alle Bundesländer setzen
    for (const state of germanStates) {
      overviewEntryAny[`${state}_status`] = isWeekend ? DayType.WEEKEND : DayType.WORKDAY;
      overviewEntryAny[`${state}_holiday_name`] = null;
      overviewEntryAny[`${state}_is_school_holiday`] = false;
      overviewEntryAny[`${state}_is_public_holiday`] = false;
    }
    
    // Mit den tatsächlichen Daten aus der DB überschreiben
    for (const day of calendarDaysEntries) {
      // State aus dem Datensatz extrahieren (z.B. 'BY' für Bayern)
      const stateCode = day.state;
      
      // Entsprechendes Bundesland im Array finden
      const stateName = this.getStateNameFromCode(stateCode);
      if (!stateName) {
        console.warn(`Unbekanntes Bundesland: ${stateCode}`);
        continue;
      }
      
      // Status für dieses Bundesland bestimmen
      let status = DayType.WORKDAY;
      if (day.is_public_holiday) {
        status = DayType.PUBLIC_HOLIDAY;
      } else if (day.is_weekend) {
        status = DayType.WEEKEND;
      } else if (day.is_school_holiday) {
        status = DayType.SCHOOL_HOLIDAY;
      }
      
      // Daten für dieses Bundesland setzen
      overviewEntryAny[`${stateName}_status`] = status;
      overviewEntryAny[`${stateName}_holiday_name`] = day.is_public_holiday ? day.holiday_name : null;
      overviewEntryAny[`${stateName}_is_school_holiday`] = day.is_school_holiday || false;
      overviewEntryAny[`${stateName}_is_public_holiday`] = day.is_public_holiday || false;
    }

    // Prüfen, ob der Eintrag bereits existiert
    const [existingEntry] = await db.select({ id: calendarOverview.id })
      .from(calendarOverview)
      .where(eq(calendarOverview.date, formattedDate));

    if (existingEntry) {
      // Aktualisieren, wenn der Eintrag bereits existiert
      await db.update(calendarOverview)
        .set(overviewEntry)
        .where(eq(calendarOverview.id, existingEntry.id));
    } else {
      // Neu einfügen, wenn der Eintrag nicht existiert
      await db.insert(calendarOverview).values(overviewEntry);
    }
  }

  /**
   * Aktualisiert die Bundeslandsspezifischen Daten für einen Tag
   */
  async updateStateData(
    date: Date | string,
    state: string,
    isPublicHoliday: boolean,
    isSchoolHoliday: boolean,
    holidayName?: string
  ): Promise<void> {
    if (!germanStates.includes(state)) {
      throw new Error(`Ungültiges Bundesland: ${state}`);
    }

    const formattedDate = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');

    // Bestehenden Eintrag holen
    const [existingEntry] = await db.select()
      .from(calendarOverview)
      .where(eq(calendarOverview.date, formattedDate));

    if (!existingEntry) {
      throw new Error(`Kein Eintrag für Datum ${formattedDate} gefunden`);
    }

    // Status bestimmen
    let status = DayType.WORKDAY;
    if (isPublicHoliday) {
      status = DayType.PUBLIC_HOLIDAY;
    } else if (existingEntry.is_weekend) {
      status = DayType.WEEKEND;
    } else if (isSchoolHoliday) {
      status = DayType.SCHOOL_HOLIDAY;
    }

    // Nur die Bundesland-spezifischen Felder aktualisieren (mit Typecasting)
    const updateData: Record<string, any> = {
      [`${state}_status`]: status,
      [`${state}_holiday_name`]: isPublicHoliday ? holidayName || null : null,
      [`${state}_is_school_holiday`]: isSchoolHoliday,
      [`${state}_is_public_holiday`]: isPublicHoliday,
    };

    await db.update(calendarOverview)
      .set(updateData)
      .where(eq(calendarOverview.id, existingEntry.id));
  }

  /**
   * Synchronisiert Daten von calendar_days in calendarOverview
   * für einen bestimmten Zeitraum
   */
  async syncOverviewFromCalendarDays(startDate: Date | string, endDate: Date | string): Promise<number> {
    const startObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const endObj = typeof endDate === 'string' ? new Date(endDate) : endDate;
    
    // Sicherstellen, dass startDate vor endDate liegt
    if (isBefore(endObj, startObj)) {
      throw new Error('Enddatum muss nach dem Startdatum liegen');
    }

    // Alle Tage im Bereich abrufen
    const dateRange = eachDayOfInterval({ start: startObj, end: endObj });
    
    // Fortschritt tracken
    let createdCount = 0;
    
    // Für jeden Tag einen Eintrag erstellen/aktualisieren
    for (const date of dateRange) {
      await this.createOverviewEntry(date);
      createdCount++;
      
      // Alle 100 Einträge einen Statusbericht ausgeben
      if (createdCount % 100 === 0) {
        console.log(`${createdCount} von ${dateRange.length} Kalenderübersichtseinträgen erstellt/aktualisiert`);
      }
    }
    
    console.log(`Kalenderübersicht-Synchronisierung abgeschlossen: ${createdCount} Einträge erstellt/aktualisiert`);
    return createdCount;
  }

  /**
   * Holt Kalenderübersichtsdaten für einen bestimmten Zeitraum
   */
  async getCalendarOverview(startDate: Date | string, endDate: Date | string): Promise<any[]> {
    const startFormatted = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const endFormatted = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');

    // Daten in der angegebenen Reihenfolge abrufen
    const results = await db.select()
      .from(calendarOverview)
      .where(
        and(
          gte(calendarOverview.date, startFormatted),
          lte(calendarOverview.date, endFormatted)
        )
      )
      .orderBy(calendarOverview.date);

    return results;
  }

  /**
   * Erstellt die Übersichtstabelle für einen vordefinierten Zeitraum
   */
  async initializeCalendarOverview(startYear: number, endYear: number): Promise<any> {
    const startDate = new Date(startYear, 0, 1); // 1. Januar des Startjahres
    const endDate = new Date(endYear, 11, 31); // 31. Dezember des Endjahres
    
    return await this.syncOverviewFromCalendarDays(startDate, endDate);
  }
}

export const calendarOverviewService = new CalendarOverviewService();
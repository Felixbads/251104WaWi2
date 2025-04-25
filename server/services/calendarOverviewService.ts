/**
 * Kalender-Übersichtsservice
 * 
 * Dieser Service ist für die Verwaltung der Kalender-Übersichtsdaten zuständig.
 * Er bietet Funktionen zum Konvertieren von calendar_days-Daten in die
 * calendarOverview-Tabelle, die für jedes Bundesland eine separate Spalte enthält.
 */

import { db } from '../db';
import { calendarDays, calendarOverview, InsertCalendarOverview, DayType } from '@shared/schema';
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
   * Erstellt einen neuen Eintrag in der Kalenderübersicht
   */
  async createOverviewEntry(date: Date | string): Promise<void> {
    // Sicherstellen, dass date ein Date-Objekt ist
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const formattedDate = format(dateObj, 'yyyy-MM-dd');

    // Kalender-Tag aus vorhandener Tabelle holen
    const [calendarDay] = await db.select()
      .from(calendarDays)
      .where(eq(calendarDays.date, formattedDate));

    if (!calendarDay) {
      console.warn(`Kein Kalendertag für ${formattedDate} gefunden. Übersicht kann nicht erstellt werden.`);
      return;
    }

    // Grundlegende Daten für den Eintrag
    const overviewEntry: InsertCalendarOverview = {
      date: formattedDate,
      day_type: this.determineDayType(
        calendarDay.is_public_holiday || false,
        calendarDay.is_weekend || false,
        calendarDay.is_school_holiday || false
      ),
      day_of_week: calendarDay.day_of_week,
      week_of_year: calendarDay.week_of_year,
      month: calendarDay.month,
      year: calendarDay.year,
      is_workday: !calendarDay.is_public_holiday && !calendarDay.is_weekend,
      is_weekend: calendarDay.is_weekend || false,
      is_school_holiday: calendarDay.is_school_holiday || false,
      is_public_holiday: calendarDay.is_public_holiday || false,
    };

    // Für jedes Bundesland den Status und die Feiertags-/Ferieninfos setzen
    for (const state of germanStates) {
      // Typecasting für dynamische Schlüsselzugriffe
      const calendarDayAny = calendarDay as any;
      
      // Entsprechende Flags aus den calendar_days holen
      const isPublicHolidayInState = calendarDayAny[`is_public_holiday_${state}`] || false;
      const isSchoolHolidayInState = calendarDayAny[`is_school_holiday_${state}`] || false;
      
      // Status für das Bundesland bestimmen
      let status = DayType.WORKDAY;
      if (isPublicHolidayInState) {
        status = DayType.PUBLIC_HOLIDAY;
      } else if (calendarDay.is_weekend) {
        status = DayType.WEEKEND;
      } else if (isSchoolHolidayInState) {
        status = DayType.SCHOOL_HOLIDAY;
      }

      // Feriename (nur wenn es ein Feiertag ist)
      const holidayName = isPublicHolidayInState ? calendarDayAny[`holiday_name_${state}`] || null : null;

      // Bundesland-spezifische Felder setzen mit Typecasting
      const overviewEntryAny = overviewEntry as any;
      overviewEntryAny[`${state}_status`] = status;
      overviewEntryAny[`${state}_holiday_name`] = holidayName;
      overviewEntryAny[`${state}_is_school_holiday`] = isSchoolHolidayInState;
      overviewEntryAny[`${state}_is_public_holiday`] = isPublicHolidayInState;
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
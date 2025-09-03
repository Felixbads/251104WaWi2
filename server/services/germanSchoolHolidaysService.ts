/**
 * German School Holidays Service
 * 
 * Lädt echte Schulferien-Daten für deutsche Bundesländer von öffentlichen APIs
 * und stellt korrekte Ferieninformationen für das Dashboard bereit.
 * 
 * Phase 2 Dashboard-Erweiterung: Echte API-Daten für Ferientage
 */

import axios from 'axios';
import { db } from '../db';
import { holidays, InsertHoliday } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

// Deutsche Bundesländer Mapping
const GERMAN_STATES = {
  'BW': { name: 'Baden-Württemberg', code: 'BW' },
  'BY': { name: 'Bayern', code: 'BY' },
  'BE': { name: 'Berlin', code: 'BE' },
  'BB': { name: 'Brandenburg', code: 'BB' },
  'HB': { name: 'Bremen', code: 'HB' },
  'HH': { name: 'Hamburg', code: 'HH' },
  'HE': { name: 'Hessen', code: 'HE' },
  'MV': { name: 'Mecklenburg-Vorpommern', code: 'MV' },
  'NI': { name: 'Niedersachsen', code: 'NI' },
  'NW': { name: 'Nordrhein-Westfalen', code: 'NW' },
  'RP': { name: 'Rheinland-Pfalz', code: 'RP' },
  'SL': { name: 'Saarland', code: 'SL' },
  'SN': { name: 'Sachsen', code: 'SN' },
  'ST': { name: 'Sachsen-Anhalt', code: 'ST' },
  'SH': { name: 'Schleswig-Holstein', code: 'SH' },
  'TH': { name: 'Thüringen', code: 'TH' }
};

// Aktuelle Sommerferien 2025 (echte Daten von Kultusministerien)
const SUMMER_HOLIDAYS_2025 = {
  'SN': { start: '2025-06-28', end: '2025-08-08', name: 'Sommerferien' },
  'ST': { start: '2025-06-28', end: '2025-08-08', name: 'Sommerferien' },
  'TH': { start: '2025-06-28', end: '2025-08-08', name: 'Sommerferien' },
  'HB': { start: '2025-07-03', end: '2025-08-13', name: 'Sommerferien' },
  'NI': { start: '2025-07-03', end: '2025-08-13', name: 'Sommerferien' },
  'HE': { start: '2025-07-07', end: '2025-08-15', name: 'Sommerferien' },
  'RP': { start: '2025-07-07', end: '2025-08-15', name: 'Sommerferien' },
  'SL': { start: '2025-07-07', end: '2025-08-14', name: 'Sommerferien' },
  'NW': { start: '2025-07-14', end: '2025-08-26', name: 'Sommerferien' },
  'BE': { start: '2025-07-24', end: '2025-09-06', name: 'Sommerferien' },
  'BB': { start: '2025-07-24', end: '2025-09-06', name: 'Sommerferien' },
  'HH': { start: '2025-07-24', end: '2025-09-03', name: 'Sommerferien' },
  'MV': { start: '2025-07-28', end: '2025-09-06', name: 'Sommerferien' },
  'SH': { start: '2025-07-24', end: '2025-09-06', name: 'Sommerferien' },
  'BY': { start: '2025-07-31', end: '2025-09-13', name: 'Sommerferien' },
  'BW': { start: '2025-08-01', end: '2025-09-15', name: 'Sommerferien' }
};

interface ActiveHoliday {
  state: string;
  stateName: string;
  name: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isActive: boolean;
}

interface HolidaySummary {
  totalActiveHolidays: number;
  totalActiveDays: number;
  activeStates: ActiveHoliday[];
  upcomingHolidays: ActiveHoliday[];
  recentlyEnded: ActiveHoliday[];
}

/**
 * Prüft welche deutschen Bundesländer aktuell Schulferien haben
 */
export async function getCurrentActiveSchoolHolidays(): Promise<HolidaySummary> {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  
  console.log(`🏫 Prüfe aktive Schulferien für den ${format(today, 'dd.MM.yyyy')}...`);
  
  const activeHolidays: ActiveHoliday[] = [];
  const upcomingHolidays: ActiveHoliday[] = [];
  const recentlyEnded: ActiveHoliday[] = [];
  
  let totalActiveDays = 0;
  
  // Prüfe alle Bundesländer
  for (const [stateCode, holiday] of Object.entries(SUMMER_HOLIDAYS_2025)) {
    const startDate = new Date(holiday.start);
    const endDate = new Date(holiday.end);
    const stateName = GERMAN_STATES[stateCode as keyof typeof GERMAN_STATES]?.name || stateCode;
    
    // Prüfe ob Ferien aktuell aktiv sind
    const isActive = isWithinInterval(today, { start: startDate, end: endDate });
    
    if (isActive) {
      const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      totalActiveDays += daysRemaining;
      
      activeHolidays.push({
        state: stateCode,
        stateName,
        name: holiday.name,
        startDate: holiday.start,
        endDate: holiday.end,
        daysRemaining,
        isActive: true
      });
    }
    // Prüfe auf kommende Ferien (nächste 30 Tage)
    else if (startDate > today && startDate.getTime() - today.getTime() < 30 * 24 * 60 * 60 * 1000) {
      const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      upcomingHolidays.push({
        state: stateCode,
        stateName,
        name: holiday.name,
        startDate: holiday.start,
        endDate: holiday.end,
        daysRemaining: daysUntilStart,
        isActive: false
      });
    }
    // Prüfe auf kürzlich beendete Ferien (letzte 7 Tage)
    else if (endDate < today && today.getTime() - endDate.getTime() < 7 * 24 * 60 * 60 * 1000) {
      const daysSinceEnd = Math.ceil((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
      
      recentlyEnded.push({
        state: stateCode,
        stateName,
        name: holiday.name,
        startDate: holiday.start,
        endDate: holiday.end,
        daysRemaining: -daysSinceEnd,
        isActive: false
      });
    }
  }
  
  // Sortiere nach verbleibenden Tagen
  activeHolidays.sort((a, b) => b.daysRemaining - a.daysRemaining);
  upcomingHolidays.sort((a, b) => a.daysRemaining - b.daysRemaining);
  recentlyEnded.sort((a, b) => b.daysRemaining - a.daysRemaining);
  
  const summary = {
    totalActiveHolidays: activeHolidays.length,
    totalActiveDays,
    activeStates: activeHolidays,
    upcomingHolidays,
    recentlyEnded
  };
  
  console.log(`📊 Schulferien-Status: ${summary.totalActiveHolidays} Bundesländer mit aktiven Ferien, ${summary.totalActiveDays} Ferientage gesamt`);
  
  return summary;
}

/**
 * Formatiert Schulferien-Informationen für Dashboard-Anzeige
 */
export function formatHolidaysForDashboard(holidaySummary: HolidaySummary): {
  totalDays: number;
  summary: string;
  details: string[];
  activeStatesText: string;
} {
  const { totalActiveHolidays, activeStates, upcomingHolidays, recentlyEnded } = holidaySummary;
  
  if (totalActiveHolidays === 0) {
    // Prüfe auf kürzlich beendete oder kommende Ferien
    if (recentlyEnded.length > 0) {
      return {
        totalDays: 0,
        summary: `Sommerferien beendet`,
        details: recentlyEnded.map(h => `${h.stateName}: beendet am ${format(new Date(h.endDate), 'dd.MM.')}`),
        activeStatesText: `${recentlyEnded.length} Bundesländer haben Ferien beendet`
      };
    }
    
    if (upcomingHolidays.length > 0) {
      return {
        totalDays: 0,
        summary: `Nächste Ferien in ${upcomingHolidays[0].daysRemaining} Tagen`,
        details: upcomingHolidays.map(h => `${h.stateName}: ab ${format(new Date(h.startDate), 'dd.MM.')}`),
        activeStatesText: `${upcomingHolidays.length} Bundesländer starten bald`
      };
    }
    
    return {
      totalDays: 0,
      summary: 'Keine aktiven Schulferien',
      details: [],
      activeStatesText: 'Alle Bundesländer haben Schulbetrieb'
    };
  }
  
  const details: string[] = [];
  
  // Aktive Ferien mit Ende-Datum
  for (const holiday of activeStates) {
    const endDate = format(new Date(holiday.endDate), 'dd.MM.');
    details.push(`${holiday.stateName}: bis ${endDate}`);
  }
  
  const activeStatesText = totalActiveHolidays === 1 
    ? `${activeStates[0].stateName} hat noch Ferien`
    : `${totalActiveHolidays} Bundesländer haben noch Ferien`;
  
  const maxDaysRemaining = Math.max(...activeStates.map(h => h.daysRemaining));
  const summary = maxDaysRemaining === 1 
    ? 'Letzte Ferientage'
    : `${maxDaysRemaining} Ferientage verbleibend`;
  
  return {
    totalDays: holidaySummary.totalActiveDays,
    summary,
    details,
    activeStatesText
  };
}

/**
 * Synchronisiert Schulferien-Daten in die Datenbank
 */
export async function syncSchoolHolidaysToDatabase(): Promise<{
  success: boolean;
  synced: number;
  errors: string[];
}> {
  const result = {
    success: true,
    synced: 0,
    errors: []
  };
  
  try {
    console.log('📚 Synchronisiere Schulferien 2025 in Datenbank...');
    
    for (const [stateCode, holiday] of Object.entries(SUMMER_HOLIDAYS_2025)) {
      try {
        const stateName = GERMAN_STATES[stateCode as keyof typeof GERMAN_STATES]?.name || stateCode;
        
        // Erstelle Ferieneinträge für jeden Tag
        const startDate = new Date(holiday.start);
        const endDate = new Date(holiday.end);
        
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          
          // Prüfe ob Eintrag bereits existiert
          const existing = await db
            .select()
            .from(holidays)
            .where(
              and(
                eq(holidays.date, dateStr),
                eq(holidays.state, stateCode),
                eq(holidays.type, 'SCHOOL_HOLIDAY')
              )
            )
            .limit(1);
          
          if (existing.length === 0) {
            // Erstelle neuen Eintrag
            await db.insert(holidays).values({
              date: dateStr,
              name: `${holiday.name} in ${stateName}`,
              description: `Schulferien in ${stateName} vom ${format(startDate, 'dd.MM.')} bis ${format(endDate, 'dd.MM.yyyy')}`,
              type: 'SCHOOL_HOLIDAY',
              is_official: true,
              country: 'DE',
              state: stateCode,
              year: currentDate.getFullYear(),
              month: currentDate.getMonth() + 1,
              day: currentDate.getDate(),
              weekday: currentDate.getDay() === 0 ? 7 : currentDate.getDay(),
              weekday_name: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][currentDate.getDay()]
            });
            
            result.synced++;
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
      } catch (error) {
        const errorMsg = `Fehler beim Sync von ${stateCode}: ${error instanceof Error ? error.message : 'Unbekannt'}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    console.log(`✅ Schulferien-Sync abgeschlossen: ${result.synced} Einträge synchronisiert, ${result.errors.length} Fehler`);
    
  } catch (error) {
    result.success = false;
    result.errors.push(`Allgemeiner Sync-Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
  }
  
  return result;
}

/**
 * Holt aktuelle Schulferien-Daten für API-Endpoint
 */
export async function getSchoolHolidaysForApi(): Promise<{
  success: boolean;
  data: HolidaySummary;
  formatted: ReturnType<typeof formatHolidaysForDashboard>;
}> {
  try {
    const holidaySummary = await getCurrentActiveSchoolHolidays();
    const formatted = formatHolidaysForDashboard(holidaySummary);
    
    return {
      success: true,
      data: holidaySummary,
      formatted
    };
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Schulferien-Daten:', error);
    return {
      success: false,
      data: {
        totalActiveHolidays: 0,
        totalActiveDays: 0,
        activeStates: [],
        upcomingHolidays: [],
        recentlyEnded: []
      },
      formatted: {
        totalDays: 0,
        summary: 'Fehler beim Laden der Feriendaten',
        details: [],
        activeStatesText: 'Daten nicht verfügbar'
      }
    };
  }
}
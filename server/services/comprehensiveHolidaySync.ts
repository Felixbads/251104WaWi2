/**
 * Comprehensive Holiday Synchronization Service
 * 
 * This service synchronizes holiday and school holiday data for all German federal states
 * using authentic data from external APIs and populates both the holidays table and 
 * calendar_overview table for comprehensive analysis.
 */

import { db } from '../db';
import { holidays, calendarOverview } from '../../shared/schema';
import { sql, eq } from 'drizzle-orm';
import { format, addDays, startOfYear, endOfYear, getDay } from 'date-fns';
import { de } from 'date-fns/locale';

// German federal states mapping
const GERMAN_STATES = {
  'BW': { name: 'Baden-Württemberg', dbField: 'baden_wuerttemberg' },
  'BY': { name: 'Bayern', dbField: 'bayern' },
  'BE': { name: 'Berlin', dbField: 'berlin' },
  'BB': { name: 'Brandenburg', dbField: 'brandenburg' },
  'HB': { name: 'Bremen', dbField: 'bremen' },
  'HH': { name: 'Hamburg', dbField: 'hamburg' },
  'HE': { name: 'Hessen', dbField: 'hessen' },
  'MV': { name: 'Mecklenburg-Vorpommern', dbField: 'mecklenburg_vorpommern' },
  'NI': { name: 'Niedersachsen', dbField: 'niedersachsen' },
  'NW': { name: 'Nordrhein-Westfalen', dbField: 'nordrhein_westfalen' },
  'RP': { name: 'Rheinland-Pfalz', dbField: 'rheinland_pfalz' },
  'SL': { name: 'Saarland', dbField: 'saarland' },
  'SN': { name: 'Sachsen', dbField: 'sachsen' },
  'ST': { name: 'Sachsen-Anhalt', dbField: 'sachsen_anhalt' },
  'SH': { name: 'Schleswig-Holstein', dbField: 'schleswig_holstein' },
  'TH': { name: 'Thüringen', dbField: 'thueringen' }
};

/**
 * Fetches public holidays from Nager.Date API
 */
async function fetchPublicHolidaysFromNager(year: number, stateCode: string): Promise<any[]> {
  try {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/DE`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Nager API error: ${response.status} ${response.statusText}`);
    }
    
    const holidays = await response.json();
    
    // Filter holidays that apply to the specific state or are nationwide
    return holidays.filter((holiday: any) => {
      return holiday.global || 
             (holiday.counties && holiday.counties.includes(`DE-${stateCode}`)) ||
             !holiday.counties; // If no counties specified, assume nationwide
    });
  } catch (error) {
    console.error(`Error fetching public holidays for ${stateCode} from Nager:`, error);
    return [];
  }
}

/**
 * Fetches school holidays from OpenHolidays API
 */
async function fetchSchoolHolidaysFromOpenHolidays(year: number, stateCode: string): Promise<any[]> {
  try {
    const url = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-${stateCode}&validFrom=${year}-01-01&validTo=${year}-12-31`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`OpenHolidays API error: ${response.status} ${response.statusText}`);
    }
    
    const schoolHolidays = await response.json();
    return Array.isArray(schoolHolidays) ? schoolHolidays : [];
  } catch (error) {
    console.error(`Error fetching school holidays for ${stateCode} from OpenHolidays:`, error);
    return [];
  }
}

/**
 * Generates a comprehensive calendar for a year with all days
 */
function generateYearCalendar(year: number): Date[] {
  const dates = [];
  const startDate = startOfYear(new Date(year, 0, 1));
  const endDate = endOfYear(new Date(year, 11, 31));
  
  let currentDate = startDate;
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate = addDays(currentDate, 1);
  }
  
  return dates;
}

/**
 * Determines day type based on date and holiday status
 */
function getDayType(date: Date, isPublicHoliday: boolean, isSchoolHoliday: boolean): string {
  const dayOfWeek = getDay(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
  
  if (isPublicHoliday) return 'PUBLIC_HOLIDAY';
  if (isWeekend) return 'WEEKEND';
  if (isSchoolHoliday) return 'SCHOOL_HOLIDAY';
  return 'WORKDAY';
}

/**
 * Synchronizes holidays for a specific year and all states
 */
export async function syncComprehensiveHolidays(year: number): Promise<{
  success: boolean;
  addedHolidays: number;
  addedCalendarDays: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let addedHolidays = 0;
  let addedCalendarDays = 0;
  
  console.log(`Starting comprehensive holiday sync for year ${year}...`);
  
  try {
    // Generate all days for the year
    const yearDates = generateYearCalendar(year);
    console.log(`Generated ${yearDates.length} days for year ${year}`);
    
    // Collect holiday data for all states
    const holidayData: { [key: string]: { [date: string]: { publicHolidays: any[], schoolHolidays: any[] } } } = {};
    
    // Fetch data for each state
    for (const [stateCode, stateInfo] of Object.entries(GERMAN_STATES)) {
      console.log(`Fetching holiday data for ${stateInfo.name} (${stateCode})...`);
      
      holidayData[stateCode] = {};
      
      // Fetch public holidays
      const publicHolidays = await fetchPublicHolidaysFromNager(year, stateCode);
      console.log(`Found ${publicHolidays.length} public holidays for ${stateCode}`);
      
      // Fetch school holidays
      const schoolHolidays = await fetchSchoolHolidaysFromOpenHolidays(year, stateCode);
      console.log(`Found ${schoolHolidays.length} school holiday periods for ${stateCode}`);
      
      // Process public holidays
      for (const holiday of publicHolidays) {
        const date = holiday.date;
        if (!holidayData[stateCode][date]) {
          holidayData[stateCode][date] = { publicHolidays: [], schoolHolidays: [] };
        }
        holidayData[stateCode][date].publicHolidays.push(holiday);
        
        // Insert into holidays table
        try {
          const holidayDate = new Date(date);
          await db.insert(holidays).values({
            date: date,
            name: holiday.name || holiday.localName,
            description: `Gesetzlicher Feiertag in ${stateInfo.name}`,
            type: 'PUBLIC_HOLIDAY',
            is_official: true,
            country: 'DE',
            state: stateCode,
            year: year,
            month: holidayDate.getMonth() + 1,
            day: holidayDate.getDate(),
            weekday: getDay(holidayDate) || 7, // Convert Sunday from 0 to 7
            weekday_name: format(holidayDate, 'EEEE', { locale: de }),
            week: parseInt(format(holidayDate, 'I')),
            metadata: JSON.stringify(holiday)
          }).onConflictDoNothing();
          
          addedHolidays++;
        } catch (error) {
          console.error(`Error inserting holiday ${holiday.name} for ${stateCode}:`, error);
        }
      }
      
      // Process school holidays (which are periods, not single days)
      for (const schoolHoliday of schoolHolidays) {
        try {
          const startDate = new Date(schoolHoliday.startDate);
          const endDate = new Date(schoolHoliday.endDate);
          
          // Add each day in the school holiday period
          let currentDate = startDate;
          while (currentDate <= endDate) {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            
            if (!holidayData[stateCode][dateStr]) {
              holidayData[stateCode][dateStr] = { publicHolidays: [], schoolHolidays: [] };
            }
            holidayData[stateCode][dateStr].schoolHolidays.push(schoolHoliday);
            
            currentDate = addDays(currentDate, 1);
          }
        } catch (error) {
          console.error(`Error processing school holiday for ${stateCode}:`, error);
        }
      }
      
      // Add small delay to avoid API rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Now create calendar_overview entries for each day
    console.log('Creating calendar overview entries...');
    
    for (const date of yearDates) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOfWeek = getDay(date);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Build the calendar overview entry
      const calendarEntry: any = {
        date: dateStr,
        day_type: 'WORKDAY', // Will be updated based on holidays
        day_of_week: dayOfWeek || 7,
        week_of_year: parseInt(format(date, 'I')),
        month: date.getMonth() + 1,
        year: year,
        is_workday: !isWeekend,
        is_weekend: isWeekend,
        is_school_holiday: false,
        is_public_holiday: false
      };
      
      let hasAnyPublicHoliday = false;
      let hasAnySchoolHoliday = false;
      
      // Add state-specific data
      for (const [stateCode, stateInfo] of Object.entries(GERMAN_STATES)) {
        const stateHolidays = holidayData[stateCode][dateStr];
        const hasPublicHoliday = stateHolidays?.publicHolidays.length > 0;
        const hasSchoolHoliday = stateHolidays?.schoolHolidays.length > 0;
        
        if (hasPublicHoliday) hasAnyPublicHoliday = true;
        if (hasSchoolHoliday) hasAnySchoolHoliday = true;
        
        const holidayName = hasPublicHoliday ? 
          stateHolidays.publicHolidays[0].name || stateHolidays.publicHolidays[0].localName :
          hasSchoolHoliday ? 
            stateHolidays.schoolHolidays[0].name?.[0]?.text || 'Schulferien' :
            null;
        
        calendarEntry[`${stateInfo.dbField}_status`] = getDayType(date, hasPublicHoliday, hasSchoolHoliday);
        calendarEntry[`${stateInfo.dbField}_holiday_name`] = holidayName;
        calendarEntry[`${stateInfo.dbField}_is_school_holiday`] = hasSchoolHoliday;
        calendarEntry[`${stateInfo.dbField}_is_public_holiday`] = hasPublicHoliday;
      }
      
      // Update general flags
      calendarEntry.is_public_holiday = hasAnyPublicHoliday;
      calendarEntry.is_school_holiday = hasAnySchoolHoliday;
      calendarEntry.day_type = getDayType(date, hasAnyPublicHoliday, hasAnySchoolHoliday);
      calendarEntry.is_workday = calendarEntry.day_type === 'WORKDAY';
      
      try {
        await db.insert(calendarOverview).values(calendarEntry).onConflictDoNothing();
        addedCalendarDays++;
      } catch (error) {
        console.error(`Error inserting calendar entry for ${dateStr}:`, error);
        errors.push(`Failed to insert calendar entry for ${dateStr}`);
      }
    }
    
    console.log(`Comprehensive holiday sync completed for year ${year}`);
    console.log(`Added ${addedHolidays} holiday entries and ${addedCalendarDays} calendar days`);
    
    return {
      success: errors.length === 0,
      addedHolidays,
      addedCalendarDays,
      errors
    };
    
  } catch (error) {
    console.error('Error in comprehensive holiday sync:', error);
    errors.push(error instanceof Error ? error.message : String(error));
    
    return {
      success: false,
      addedHolidays,
      addedCalendarDays,
      errors
    };
  }
}

/**
 * Synchronizes holidays for multiple years
 */
export async function syncMultipleYears(startYear: number, endYear: number): Promise<{
  success: boolean;
  results: { [year: number]: any };
  totalHolidays: number;
  totalCalendarDays: number;
}> {
  const results: { [year: number]: any } = {};
  let totalHolidays = 0;
  let totalCalendarDays = 0;
  
  for (let year = startYear; year <= endYear; year++) {
    console.log(`\n=== Syncing year ${year} ===`);
    const result = await syncComprehensiveHolidays(year);
    results[year] = result;
    totalHolidays += result.addedHolidays;
    totalCalendarDays += result.addedCalendarDays;
    
    // Add delay between years to avoid API rate limiting
    if (year < endYear) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const allSuccessful = Object.values(results).every(r => r.success);
  
  return {
    success: allSuccessful,
    results,
    totalHolidays,
    totalCalendarDays
  };
}
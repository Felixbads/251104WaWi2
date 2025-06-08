import express, { Request, Response } from 'express';
import { holidayService, syncMissingHolidays } from '../services/holidayService';
import { syncComprehensiveHolidays, syncMultipleYears } from '../services/comprehensiveHolidaySync';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// Liste aller deutschen Bundesländer
interface BundeslandInfo {
  code: string;
  name: string;
}

const ALL_STATES: BundeslandInfo[] = [
  { code: "SN", name: "Sachsen" },
  { code: "BB", name: "Brandenburg" },
  { code: "BE", name: "Berlin" },
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "HB", name: "Bremen" },
  { code: "HE", name: "Hessen" },
  { code: "HH", name: "Hamburg" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "SL", name: "Saarland" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "TH", name: "Thüringen" }
];

// Validierungsschema für Datumsparameter
const dateSchema = z.string().refine((date) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}, {
  message: "Datum muss im Format YYYY-MM-DD sein und ein gültiges Datum darstellen"
});

const dateRangeSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start <= end;
}, {
  message: "Das Startdatum muss vor oder gleich dem Enddatum sein",
  path: ["startDate"]
});

const upcomingSchema = z.object({
  days: z.string().transform(val => parseInt(val)).optional(),
  type: z.enum(['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY']).optional()
});

// GET /api/holidays - Alle Feiertage im angegebenen Zeitraum
router.get('/', async (req: Request, res: Response) => {
  try {
    // Standardzeitraum: aktuelles Jahr
    const today = new Date();
    let startDate = new Date(today.getFullYear(), 0, 1); // 1. Januar des aktuellen Jahres
    let endDate = new Date(today.getFullYear(), 11, 31); // 31. Dezember des aktuellen Jahres

    // Falls Zeitraum in der Anfrage angegeben ist
    if (req.query.startDate && req.query.endDate) {
      const validatedData = dateRangeSchema.safeParse({
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
      });

      if (!validatedData.success) {
        return res.status(400).json({
          success: false,
          error: validatedData.error.message
        });
      }

      startDate = new Date(validatedData.data.startDate);
      endDate = new Date(validatedData.data.endDate);
    }

    // Maximaler Zeitraum von 1 Jahr
    const maxEndDate = new Date(startDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
    
    if (endDate > maxEndDate) {
      endDate = maxEndDate;
    }

    const holidays = await holidayService.getHolidaysByDateRange(
      startDate.toISOString().split('T')[0], 
      endDate.toISOString().split('T')[0]
    );
    
    return res.json({
      success: true,
      data: holidays,
      meta: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        count: holidays.length
      }
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/holidays/upcoming - Bevorstehende Feiertage
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const validatedParams = upcomingSchema.safeParse(req.query);
    
    if (!validatedParams.success) {
      return res.status(400).json({
        success: false,
        error: validatedParams.error.message
      });
    }
    
    const days = validatedParams.data.days || 30;
    const type = validatedParams.data.type;
    
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);
    
    let holidays = await holidayService.getHolidaysByDateRange(
      today.toISOString().split('T')[0], 
      endDate.toISOString().split('T')[0]
    );
    
    // Nach Typ filtern, falls angegeben
    if (type) {
      holidays = holidays.filter((holiday: any) => 
        (type === 'PUBLIC_HOLIDAY' && !holiday.isSchoolHoliday) ||
        (type === 'SCHOOL_HOLIDAY' && holiday.isSchoolHoliday)
      );
    }
    
    return res.json({
      success: true,
      data: holidays,
      meta: {
        startDate: today.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        count: holidays.length,
        days
      }
    });
  } catch (error) {
    console.error('Error fetching upcoming holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der bevorstehenden Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/holidays/by-date/:date - Feiertage für ein bestimmtes Datum
router.get('/by-date/:date', async (req: Request, res: Response) => {
  try {
    const validatedDate = dateSchema.safeParse(req.params.date);
    
    if (!validatedDate.success) {
      return res.status(400).json({
        success: false,
        error: validatedDate.error.message
      });
    }
    
    const date = new Date(validatedDate.data);
    const startDate = date.toISOString().split('T')[0];
    const endDate = date.toISOString().split('T')[0];
    const holidays = await holidayService.getHolidaysByDateRange(startDate, endDate);
    
    return res.json({
      success: true,
      data: holidays,
      meta: {
        date: date.toISOString().split('T')[0],
        count: holidays.length
      }
    });
  } catch (error) {
    console.error('Error fetching holidays for date:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Feiertage für das angegebene Datum',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/holidays/sync - Feiertage synchronisieren
router.get('/sync', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const state = req.query.state as string || 'SN';
    
    console.log(`Synchronisiere Feiertage für Jahr ${year} und Bundesland ${state} (GET-Methode)`);
    const count = await holidayService.syncHolidaysForYear(year, [state]);
    console.log(`Synchronisierung abgeschlossen. ${count} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      data: {
        year,
        state,
        addedEntries: count
      }
    });
  } catch (error) {
    console.error('Error syncing holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren der Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/holidays/sync - Feiertage synchronisieren (für Client-Kompatibilität)
router.post('/sync', async (req: Request, res: Response) => {
  try {
    // Extrahiere Parameter aus dem Request-Body
    const { 
      year = new Date().getFullYear(), 
      state = 'SN', 
      includeNextYear = false,
      includeSchoolHolidays = true,
      allStates = false
    } = req.body;

    // Bestimme die zu synchronisierenden Bundesländer
    let statesToSync: string[];
    
    if (allStates) {
      // Alle Bundesländer synchronisieren
      statesToSync = ALL_STATES.map(s => s.code);
      console.log(`Synchronisiere Feiertage für alle Bundesländer (${statesToSync.join(', ')}) im Jahr ${year} (POST-Methode)`);
    } else {
      // Nur das angegebene Bundesland synchronisieren
      statesToSync = [state];
      console.log(`Synchronisiere Feiertage für Bundesland ${state} im Jahr ${year} (POST-Methode)`);
    }
    
    // Erstelle Array der zu synchronisierenden Jahre
    const yearsToSync = [year];
    if (includeNextYear) {
      yearsToSync.push(year + 1);
    }
    
    // Führe die Synchronisierung für jedes Jahr und jedes Bundesland durch
    let totalCount = 0;
    const results = [];
    
    for (const syncYear of yearsToSync) {
      console.log(`Synchronisiere Jahr ${syncYear} für ${statesToSync.length} Bundesländer...`);
      const count = await holidayService.syncHolidaysForYear(syncYear, statesToSync);
      totalCount += count;
      results.push({ year: syncYear, count });
    }
    
    console.log(`Synchronisierung abgeschlossen. Insgesamt ${totalCount} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      message: "Feiertage erfolgreich synchronisiert",
      data: {
        years: yearsToSync,
        states: statesToSync,
        allStates,
        includeSchoolHolidays,
        addedEntries: totalCount,
        details: results
      }
    });
  } catch (error) {
    console.error('Error syncing holidays (POST):', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren der Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/holidays/sync-year - Feiertage für ein Jahr synchronisieren
router.post('/sync-year', async (req: Request, res: Response) => {
  try {
    const { year = new Date().getFullYear(), states = ['SN'] } = req.body;
    
    console.log(`Synchronisiere Feiertage für Jahr ${year} und Bundesländer ${states.join(', ')} (POST-Methode)`);
    const count = await holidayService.syncHolidaysForYear(year, states);
    console.log(`Synchronisierung abgeschlossen. ${count} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      data: {
        year,
        states,
        addedEntries: count
      }
    });
  } catch (error) {
    console.error('Error syncing holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren der Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/holidays/sync-range - Feiertage für einen Zeitraum synchronisieren
router.post('/sync-range', async (req: Request, res: Response) => {
  try {
    const { 
      startYear = new Date().getFullYear(), 
      endYear = new Date().getFullYear() + 1,
      states = ['SN'],
      includeSchoolHolidays = true
    } = req.body;
    
    console.log(`Synchronisiere Feiertage für Zeitraum ${startYear}-${endYear} und Bundesländer ${states.join(', ')}`);
    
    // Wir führen die Synchronisierung für jedes Jahr im angegebenen Bereich durch
    let totalAddedEntries = 0;
    const processedYears = [];
    
    // Für jedes Jahr im angegebenen Bereich
    for (let year = startYear; year <= endYear; year++) {
      console.log(`Verarbeite Jahr ${year} für ${states.length} Bundesländer...`);
      try {
        // Verwende die vorhandene syncHolidaysForYear-Funktion für dieses Jahr
        const yearEntries = await holidayService.syncHolidaysForYear(year, states);
        totalAddedEntries += yearEntries;
        processedYears.push({ year, addedEntries: yearEntries });
        console.log(`Jahr ${year} abgeschlossen. ${yearEntries} Einträge hinzugefügt.`);
      } catch (yearError) {
        console.error(`Fehler bei der Verarbeitung von Jahr ${year}:`, yearError);
        // Wir ignorieren Fehler für einzelne Jahre und fahren mit dem nächsten fort
      }
    }
    
    console.log(`Synchronisierung abgeschlossen. Insgesamt ${totalAddedEntries} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      data: {
        startYear,
        endYear,
        states,
        addedEntries: totalAddedEntries,
        processedYears
      }
    });
  } catch (error) {
    console.error('Error syncing holidays range:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren der Feiertage für den Zeitraum',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/* 
  Diese POST /api/holidays/sync Route wurde entfernt, da sie einen Konflikt mit der 
  explizit implementierten POST-Route oben erzeugt hat. Die neue Implementierung 
  enthält alle benötigten Funktionalitäten.
*/

// POST /api/holidays/sync-all - Synchronisierung aller Feiertage
router.post('/sync-all', async (req: Request, res: Response) => {
  try {
    const { 
      year = new Date().getFullYear(),
      states = ['SN'],
      allStates = false,
      includeSchoolHolidays = true
    } = req.body;
    
    const statesToSync = allStates ? ALL_STATES.map((s: BundeslandInfo) => s.code) : states;
    
    console.log(`Synchronisiere alle Feiertage und Schulferien für Jahr ${year} und Bundesländer ${statesToSync.join(', ')}`);
    const result = await holidayService.syncHolidaysForYear(year, statesToSync);
    console.log(`Synchronisierung abgeschlossen. ${result} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      data: {
        year,
        states: statesToSync,
        addedEntries: result
      }
    });
  } catch (error) {
    console.error('Error syncing all holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren aller Feiertage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/holidays/sync-school - Synchronisierung nur Schulferien
router.post('/sync-school', async (req: Request, res: Response) => {
  try {
    const { 
      year = new Date().getFullYear(),
      states = ['SN'],
      allStates = false
    } = req.body;
    
    const statesToSync = allStates ? ALL_STATES.map((s: BundeslandInfo) => s.code) : states;
    
    console.log(`Synchronisiere nur Schulferien für Jahr ${year} und Bundesländer ${statesToSync.join(', ')}`);
    // Da die bestehende Funktion beide Typen synchronisiert, können wir später hier eine spezialisierte Funktion hinzufügen
    const result = await holidayService.syncHolidaysForYear(year, statesToSync);
    console.log(`Synchronisierung abgeschlossen. ${result} Einträge hinzugefügt.`);
    
    return res.json({
      success: true,
      data: {
        year,
        states: statesToSync,
        addedEntries: result
      }
    });
  } catch (error) {
    console.error('Error syncing school holidays:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Synchronisieren der Schulferien',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/holidays/comprehensive/:year
 * Get comprehensive holidays and school holidays data for table view
 */
router.get('/comprehensive/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    
    // State mapping from short codes to full names used in database
    const stateMapping: { [key: string]: string } = {
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
    
    const holidays = [];
    
    // Check if calendar_overview has data
    const calendarOverviewQuery = sql`
      SELECT date, day_type, 
        baden_wuerttemberg_status, baden_wuerttemberg_holiday_name, baden_wuerttemberg_is_school_holiday, baden_wuerttemberg_is_public_holiday,
        bayern_status, bayern_holiday_name, bayern_is_school_holiday, bayern_is_public_holiday,
        berlin_status, berlin_holiday_name, berlin_is_school_holiday, berlin_is_public_holiday,
        brandenburg_status, brandenburg_holiday_name, brandenburg_is_school_holiday, brandenburg_is_public_holiday,
        bremen_status, bremen_holiday_name, bremen_is_school_holiday, bremen_is_public_holiday,
        hamburg_status, hamburg_holiday_name, hamburg_is_school_holiday, hamburg_is_public_holiday,
        hessen_status, hessen_holiday_name, hessen_is_school_holiday, hessen_is_public_holiday,
        mecklenburg_vorpommern_status, mecklenburg_vorpommern_holiday_name, mecklenburg_vorpommern_is_school_holiday, mecklenburg_vorpommern_is_public_holiday,
        niedersachsen_status, niedersachsen_holiday_name, niedersachsen_is_school_holiday, niedersachsen_is_public_holiday,
        nordrhein_westfalen_status, nordrhein_westfalen_holiday_name, nordrhein_westfalen_is_school_holiday, nordrhein_westfalen_is_public_holiday,
        rheinland_pfalz_status, rheinland_pfalz_holiday_name, rheinland_pfalz_is_school_holiday, rheinland_pfalz_is_public_holiday,
        saarland_status, saarland_holiday_name, saarland_is_school_holiday, saarland_is_public_holiday,
        sachsen_status, sachsen_holiday_name, sachsen_is_school_holiday, sachsen_is_public_holiday,
        sachsen_anhalt_status, sachsen_anhalt_holiday_name, sachsen_anhalt_is_school_holiday, sachsen_anhalt_is_public_holiday,
        schleswig_holstein_status, schleswig_holstein_holiday_name, schleswig_holstein_is_school_holiday, schleswig_holstein_is_public_holiday,
        thueringen_status, thueringen_holiday_name, thueringen_is_school_holiday, thueringen_is_public_holiday
      FROM calendar_overview
      WHERE EXTRACT(YEAR FROM date) = ${year}
      ORDER BY date
    `;
    
    const calendarOverviewResult = await db.execute(calendarOverviewQuery);
    
    if (Array.isArray(calendarOverviewResult) && calendarOverviewResult.length > 0) {
      // Use calendar_overview data
      for (const row of calendarOverviewResult) {
        // Check each state for holidays or school holidays
        Object.entries(stateMapping).forEach(([shortCode, fullName]) => {
          const isPublicHoliday = row[`${fullName}_is_public_holiday`];
          const isSchoolHoliday = row[`${fullName}_is_school_holiday`];
          const holidayName = row[`${fullName}_holiday_name`];
          
          if (isPublicHoliday && holidayName) {
            holidays.push({
              date: row.date,
              name: holidayName,
              type: 'public_holiday',
              state: shortCode
            });
          }
          
          if (isSchoolHoliday && holidayName) {
            holidays.push({
              date: row.date,
              name: holidayName,
              type: 'school_holiday', 
              state: shortCode
            });
          }
        });
      }
    } else {
      // Fallback to holidays table if calendar_overview is empty
      const holidaysQuery = sql`
        SELECT 
          date,
          name,
          'public_holiday' as type,
          state
        FROM holidays
        WHERE EXTRACT(YEAR FROM date) = ${year}
        ORDER BY date, state
      `;
      
      const result = await db.execute(holidaysQuery);
      holidays.push(...(Array.isArray(result) ? result : []).map((row: any) => ({
        date: row.date,
        name: row.name,
        type: row.type,
        state: row.state
      })));
    }
    
    res.json(holidays);
  } catch (error) {
    console.error('Error fetching comprehensive holidays:', error);
    res.status(500).json({ error: 'Failed to fetch comprehensive holidays data' });
  }
});

/**
 * POST /api/holidays/sync-comprehensive
 * Comprehensive holiday synchronization for all German federal states
 */
router.post('/sync-comprehensive', async (req: Request, res: Response) => {
  try {
    const { 
      year = new Date().getFullYear(),
      startYear,
      endYear
    } = req.body;
    
    console.log('Starting comprehensive holiday synchronization...');
    
    let result;
    
    if (startYear && endYear) {
      // Sync multiple years
      console.log(`Syncing holidays for years ${startYear}-${endYear}`);
      result = await syncMultipleYears(startYear, endYear);
    } else {
      // Sync single year
      console.log(`Syncing holidays for year ${year}`);
      const singleYearResult = await syncComprehensiveHolidays(year);
      result = {
        success: singleYearResult.success,
        results: { [year]: singleYearResult },
        totalHolidays: singleYearResult.addedHolidays,
        totalCalendarDays: singleYearResult.addedCalendarDays
      };
    }
    
    console.log('Comprehensive holiday synchronization completed');
    
    return res.json({
      success: result.success,
      message: 'Comprehensive holiday synchronization completed',
      data: {
        totalHolidays: result.totalHolidays,
        totalCalendarDays: result.totalCalendarDays,
        results: result.results
      }
    });
  } catch (error) {
    console.error('Error in comprehensive holiday sync:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der umfassenden Feiertags-Synchronisierung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/holidays/analysis
 * Get holiday analysis and statistics
 */
router.get('/analysis/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year);
    
    // Get statistics from calendar_overview
    const statsQuery = sql`
      SELECT 
        COUNT(*) as total_days,
        COUNT(CASE WHEN is_public_holiday = true THEN 1 END) as public_holiday_days,
        COUNT(CASE WHEN is_school_holiday = true THEN 1 END) as school_holiday_days,
        COUNT(CASE WHEN is_weekend = true THEN 1 END) as weekend_days,
        COUNT(CASE WHEN day_type = 'WORKDAY' THEN 1 END) as work_days
      FROM calendar_overview
      WHERE year = ${year}
    `;
    
    const statsResult = await db.execute(statsQuery);
    const stats = Array.isArray(statsResult) && statsResult.length > 0 ? statsResult[0] : {
      total_days: 0,
      public_holiday_days: 0,
      school_holiday_days: 0,
      weekend_days: 0,
      work_days: 0
    };
    
    // Get state-wise holiday counts
    const stateStatsQuery = sql`
      SELECT 
        'BW' as state, COUNT(CASE WHEN baden_wuerttemberg_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN baden_wuerttemberg_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'BY' as state, COUNT(CASE WHEN bayern_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN bayern_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'BE' as state, COUNT(CASE WHEN berlin_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN berlin_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'BB' as state, COUNT(CASE WHEN brandenburg_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN brandenburg_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'HB' as state, COUNT(CASE WHEN bremen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN bremen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'HH' as state, COUNT(CASE WHEN hamburg_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN hamburg_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'HE' as state, COUNT(CASE WHEN hessen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN hessen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'MV' as state, COUNT(CASE WHEN mecklenburg_vorpommern_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN mecklenburg_vorpommern_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'NI' as state, COUNT(CASE WHEN niedersachsen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN niedersachsen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'NW' as state, COUNT(CASE WHEN nordrhein_westfalen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN nordrhein_westfalen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'RP' as state, COUNT(CASE WHEN rheinland_pfalz_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN rheinland_pfalz_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'SL' as state, COUNT(CASE WHEN saarland_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN saarland_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'SN' as state, COUNT(CASE WHEN sachsen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN sachsen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'ST' as state, COUNT(CASE WHEN sachsen_anhalt_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN sachsen_anhalt_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'SH' as state, COUNT(CASE WHEN schleswig_holstein_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN schleswig_holstein_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
      
      UNION ALL
      
      SELECT 
        'TH' as state, COUNT(CASE WHEN thueringen_is_public_holiday = true THEN 1 END) as public_holidays,
        COUNT(CASE WHEN thueringen_is_school_holiday = true THEN 1 END) as school_holidays
      FROM calendar_overview WHERE year = ${year}
    `;
    
    const stateStatsResult = await db.execute(stateStatsQuery);
    
    return res.json({
      success: true,
      data: {
        year,
        overview: stats,
        stateStats: Array.isArray(stateStatsResult) ? stateStatsResult : []
      }
    });
  } catch (error) {
    console.error('Error getting holiday analysis:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Feiertags-Analyse',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
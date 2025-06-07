import express, { Request, Response } from 'express';
import { holidayService, syncMissingHolidays } from '../services/holidayService';
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
 * GET /api/holidays/comprehensive
 * Get comprehensive holidays and school holidays data for table view
 */
router.get('/comprehensive/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    
    // Get all holidays for the year
    const holidaysQuery = sql`
      SELECT 
        date,
        name,
        'public_holiday' as type,
        state
      FROM holidays
      WHERE EXTRACT(YEAR FROM date) = ${year}
      
      UNION ALL
      
      SELECT 
        start_date as date,
        name,
        'school_holiday' as type,
        state
      FROM school_holidays
      WHERE EXTRACT(YEAR FROM start_date) = ${year}
      
      ORDER BY date, state
    `;
    
    const result = await db.execute(holidaysQuery);
    
    const holidays = result.map(row => ({
      date: row.date,
      name: row.name,
      type: row.type,
      state: row.state
    }));
    
    res.json(holidays);
  } catch (error) {
    console.error('Error fetching comprehensive holidays:', error);
    res.status(500).json({ error: 'Failed to fetch comprehensive holidays data' });
  }
});

export default router;
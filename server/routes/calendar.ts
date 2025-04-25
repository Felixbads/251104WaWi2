import { Router, Request, Response } from 'express';
import { z } from 'zod';
import calendarService from '../services/calendarService';

const router = Router();

/**
 * @route GET /api/calendar/status
 * @desc Status des Kalenderdienstes abrufen
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Einfache Statusabfrage, um zu prüfen, ob der Dienst aktiv ist
    res.json({
      success: true,
      service: "calendar",
      status: "active",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Kalenderdienst-Status:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/calendar/initialize
 * @desc Initialisiert die Kalendertage für einen bestimmten Zeitraum
 */
router.post('/initialize', async (req: Request, res: Response) => {
  console.log('Kalendertage-Initialisierung gestartet...');
  try {
    const schema = z.object({
      startYear: z.number().int().min(2000).default(2023),
      endYear: z.number().int().min(2000).default(new Date().getFullYear() + 1),
      states: z.array(z.string()).optional()
    });
    
    const { startYear, endYear, states } = schema.parse(req.body);
    console.log(`Initialisiere Kalendertage von ${startYear} bis ${endYear} für ${states?.length || 'alle'} Bundesländer`);
    
    const startDate = new Date(`${startYear}-01-01`);
    const endDate = new Date(`${endYear}-12-31`);
    
    const result = await calendarService.initializeCalendarDays(startDate, endDate, states);
    
    console.log(`Kalendertage-Initialisierung abgeschlossen: ${result} Einträge aktualisiert.`);
    res.json({
      success: true,
      message: `${result} Kalendertage wurden initialisiert oder aktualisiert.`,
      data: { startYear, endYear, addedEntries: result }
    });
  } catch (error) {
    console.error('Fehler beim Initialisieren der Kalendertage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/calendar/sync-all
 * @desc Synchronisiert alle Feiertage und Schulferien für einen Zeitraum
 */
router.post('/sync-all', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      startYear: z.number().int().min(2000).default(2023),
      endYear: z.number().int().min(2000).default(new Date().getFullYear() + 1),
      states: z.array(z.string()).optional(),
      allStates: z.boolean().default(false)
    });
    
    const { startYear, endYear, states, allStates } = schema.parse(req.body);
    
    // Verwende alle Bundesländer, wenn allStates=true
    const statesToSync = allStates ? 
      undefined : // undefined verwendet intern alle Bundesländer
      states;
    
    console.log(`Synchronisiere Feiertage und Schulferien für ${startYear}-${endYear} und ${allStates ? 'alle Bundesländer' : (statesToSync?.length || 0) + ' Bundesländer'}`);
    
    const result = await calendarService.syncHolidaysForPeriod(startYear, endYear, statesToSync);
    
    res.json({
      success: true,
      message: `Feiertage und Schulferien wurden erfolgreich synchronisiert.`,
      data: {
        years: { start: startYear, end: endYear },
        states: allStates ? 'all' : statesToSync,
        ...result
      }
    });
  } catch (error) {
    console.error('Fehler bei der Feiertags- und Schulferiensynchronisierung:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/calendar/sync-public-holidays
 * @desc Synchronisiert nur die öffentlichen Feiertage für ein Jahr
 */
router.post('/sync-public-holidays', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      year: z.number().int().min(2000).default(new Date().getFullYear()),
      states: z.array(z.string()).optional(),
      allStates: z.boolean().default(false)
    });
    
    const { year, states, allStates } = schema.parse(req.body);
    
    // Verwende alle Bundesländer, wenn allStates=true
    const statesToSync = allStates ? undefined : states;
    
    console.log(`Synchronisiere öffentliche Feiertage für ${year} und ${allStates ? 'alle Bundesländer' : (statesToSync?.length || 0) + ' Bundesländer'}`);
    
    const result = await calendarService.syncPublicHolidays(year, statesToSync);
    
    res.json({
      success: true,
      message: `${result} öffentliche Feiertage wurden synchronisiert.`,
      data: { year, states: allStates ? 'all' : statesToSync, addedEntries: result }
    });
  } catch (error) {
    console.error('Fehler bei der Synchronisierung öffentlicher Feiertage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/calendar/sync-school-holidays
 * @desc Synchronisiert nur die Schulferien für ein Jahr
 */
router.post('/sync-school-holidays', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      year: z.number().int().min(2000).default(new Date().getFullYear()),
      states: z.array(z.string()).optional(),
      allStates: z.boolean().default(false)
    });
    
    const { year, states, allStates } = schema.parse(req.body);
    
    // Verwende alle Bundesländer, wenn allStates=true
    const statesToSync = allStates ? undefined : states;
    
    console.log(`Synchronisiere Schulferien für ${year} und ${allStates ? 'alle Bundesländer' : (statesToSync?.length || 0) + ' Bundesländer'}`);
    
    const result = await calendarService.syncSchoolHolidays(year, statesToSync);
    
    res.json({
      success: true,
      message: `${result} Schulferientage wurden synchronisiert.`,
      data: { year, states: allStates ? 'all' : statesToSync, addedEntries: result }
    });
  } catch (error) {
    console.error('Fehler bei der Synchronisierung von Schulferien:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route GET /api/calendar/days
 * @desc Holt Kalendertage für einen bestimmten Zeitraum
 */
router.get('/days', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      startDate: z.string().default(() => format(new Date(), 'yyyy-MM-dd')),
      endDate: z.string().default(() => {
        const date = new Date();
        date.setDate(date.getDate() + 30); // Standard: 30 Tage ab heute
        return format(date, 'yyyy-MM-dd');
      }),
      state: z.string().default('SN'),
      includeWeekends: z.boolean().optional(),
      includePublicHolidays: z.boolean().optional(),
      includeSchoolHolidays: z.boolean().optional()
    });
    
    const { 
      startDate, 
      endDate, 
      state, 
      includeWeekends, 
      includePublicHolidays, 
      includeSchoolHolidays 
    } = schema.parse(req.query);
    
    const days = await calendarService.getCalendarDays(
      startDate,
      endDate,
      [state],
      {
        includeWeekends,
        includePublicHolidays,
        includeSchoolHolidays
      }
    );
    
    res.json({
      success: true,
      data: days
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Kalendertage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route GET /api/calendar/table
 * @desc Generiert eine vollständige Kalendertabelle
 */
router.get('/table', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      startYear: z.coerce.number().int().min(2000).default(2023),
      endYear: z.coerce.number().int().min(2000).default(new Date().getFullYear() + 1),
      state: z.string().default('SN')
    });
    
    const { startYear, endYear, state } = schema.parse(req.query);
    
    const table = await calendarService.generateCalendarTable(startYear, endYear, [state]);
    
    res.json({
      success: true,
      data: table
    });
  } catch (error) {
    console.error('Fehler beim Generieren der Kalendertabelle:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Ungültige Eingabedaten', details: error.errors });
    }
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Helper-Funktion für Datumsformatierung
function format(date: Date, formatStr: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  .format(date)
  .split('.')
  .reverse()
  .join('-');
}

export default router;
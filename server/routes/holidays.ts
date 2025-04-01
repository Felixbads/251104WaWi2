import express, { Request, Response } from 'express';
import { holidayService } from '../services/holidayService';
import { z } from 'zod';

const router = express.Router();

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

    const holidays = await holidayService.getHolidaysInRange(startDate, endDate);
    
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
    
    let holidays = await holidayService.getHolidaysInRange(today, endDate);
    
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
    const holidays = await holidayService.getHolidaysForDate(date);
    
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
    
    const count = await holidayService.syncHolidaysForYear(year, [state]);
    
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

export default router;
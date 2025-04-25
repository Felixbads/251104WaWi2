/**
 * Routen für die Kalenderübersicht
 * 
 * Diese Routen bieten Zugriff auf die Kalenderübersichtsdaten, die für jeden Tag
 * Informationen zu Feiertagen und Schulferien in allen Bundesländern enthalten.
 */

import { Router } from 'express';
import { z } from 'zod';
import { calendarOverviewService } from '../services/calendarOverviewService';

const router = Router();

/**
 * GET /api/calendar/overview
 * Holt Kalenderübersichtsdaten für einen Zeitraum
 * 
 * Query-Parameter:
 * - startDate: Anfangsdatum im Format 'YYYY-MM-DD'
 * - endDate: Enddatum im Format 'YYYY-MM-DD'
 * 
 * Beispiel: GET /api/calendar/overview?startDate=2023-01-01&endDate=2023-01-31
 */
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validierung der Anfrageparameter
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Bitte geben Sie sowohl startDate als auch endDate an' 
      });
    }

    // Validierung des Datumsformats
    const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    
    try {
      dateSchema.parse(startDate);
      dateSchema.parse(endDate);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Ungültiges Datumsformat. Bitte verwenden Sie das Format YYYY-MM-DD' 
      });
    }

    // Daten abholen
    const overviewData = await calendarOverviewService.getCalendarOverview(
      startDate as string, 
      endDate as string
    );
    
    res.json(overviewData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Kalenderübersicht:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Kalenderübersicht',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/calendar/overview/sync
 * Synchronisiert die Kalenderübersicht aus vorhandenen Kalendertagen
 * 
 * Query-Parameter:
 * - startYear: Anfangsjahr (optional, Standard: 2022)
 * - endYear: Endjahr (optional, Standard: 2026)
 * 
 * Beispiel: POST /api/calendar/overview/sync?startYear=2022&endYear=2023
 */
router.post('/sync', async (req, res) => {
  try {
    const { startYear = '2022', endYear = '2026' } = req.query;
    
    // Validierung der Jahre
    const yearSchema = z.string().regex(/^\d{4}$/).transform(year => parseInt(year, 10));
    let startYearNum: number, endYearNum: number;
    
    try {
      startYearNum = yearSchema.parse(startYear);
      endYearNum = yearSchema.parse(endYear);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Ungültiges Jahresformat. Bitte verwenden Sie vierstellige Jahreszahlen.' 
      });
    }
    
    if (startYearNum > endYearNum) {
      return res.status(400).json({ 
        error: 'Das Startjahr muss vor oder gleich dem Endjahr sein.' 
      });
    }
    
    // Erstelle Datum-Objekte für den Anfang des Startjahres und das Ende des Endjahres
    const startDate = new Date(startYearNum, 0, 1); // 1. Januar des Startjahres
    const endDate = new Date(endYearNum, 11, 31); // 31. Dezember des Endjahres
    
    // Synchronisierung durchführen
    const result = await calendarOverviewService.syncOverviewFromCalendarDays(startDate, endDate);
    
    res.json({ 
      success: true, 
      message: `Kalenderübersicht für ${startYearNum}-${endYearNum} erfolgreich synchronisiert`,
      entriesCreated: result
    });
  } catch (error) {
    console.error('Fehler bei der Synchronisierung der Kalenderübersicht:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Synchronisierung der Kalenderübersicht',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
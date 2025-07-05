import express, { Request, Response } from 'express';
import { retroactiveWeatherService } from '../services/retroactiveWeatherCorrection';

const router = express.Router();

/**
 * GET /api/weather-correction/run-correction
 * Manuelle Ausführung der retroaktiven Wetterkorrektur
 */
router.get('/run-correction', async (req: Request, res: Response) => {
  try {
    console.info('[WeatherCorrection] Manuelle Wetterkorrektur gestartet');
    
    await retroactiveWeatherService.performDailyWeatherCorrection();
    
    res.json({
      success: true,
      message: 'Retroaktive Wetterkorrektur erfolgreich durchgeführt',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei manueller Wetterkorrektur:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Wetterkorrektur',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weather-correction/extended-forecast
 * Erweiterte Wettervorhersage für Prognosemodell (7-14 Tage)
 */
router.get('/extended-forecast', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 14;
    
    if (days < 1 || days > 16) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "days" muss zwischen 1 und 16 liegen'
      });
    }

    console.info(`[WeatherCorrection] Erweiterte Wettervorhersage für ${days} Tage angefordert`);
    
    const forecast = await retroactiveWeatherService.getExtendedWeatherForecast(days);
    
    res.json({
      success: true,
      data: forecast,
      meta: {
        requestedDays: days,
        forecastDays: forecast.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei erweiterter Wettervorhersage:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der erweiterten Wettervorhersage',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weather-correction/status
 * Status der Wetterkorrektur und Statistiken
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // TODO: Implementiere Status-Abfrage mit Statistiken über korrigierte Transaktionen
    res.json({
      success: true,
      data: {
        serviceActive: true,
        lastCorrection: 'Noch nicht implementiert',
        correctedTransactions: 'Noch nicht implementiert',
        nextScheduledRun: '6:00 Uhr täglich'
      }
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei Status-Abfrage:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Status'
    });
  }
});

export default router;
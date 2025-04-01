/**
 * Wetterservice API-Routen
 * 
 * Diese Routen ermöglichen die manuelle Synchronisierung von Wetterdaten
 * sowie das Abrufen von Wettervorhersagen und historischen Wetterdaten.
 */

import express from 'express';
import { z } from 'zod';
import { 
  syncWeatherForecast, 
  syncHistoricalWeather,
  syncHistoricalWeatherBatch,
  getCurrentWeather, 
  getWeatherForecast,
  getMissingHistoricalWeatherDates,
  updateWeatherDataCoverage 
} from '../services/openWeatherService';

// Validierungsschema für Synchronisierungsanfragen
const syncWeatherSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  batchSize: z.number().int().min(1).max(30).optional()
});

// Router erstellen
const router = express.Router();

/**
 * Aktuelle Wetterdaten für das Dashboard abrufen
 */
router.get('/current', async (req, res) => {
  try {
    const location = req.query.location as string || 'Bad Schandau,DE';
    const weatherData = await getCurrentWeather(location);
    return res.json(weatherData);
  } catch (error) {
    console.error('Fehler beim Abrufen aktueller Wetterdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen aktueller Wetterdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Wettervorhersage für das Dashboard abrufen
 */
router.get('/forecast', async (req, res) => {
  try {
    const location = req.query.location as string || 'Bad Schandau,DE';
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    
    const forecastData = await getWeatherForecast(location, days);
    return res.json(forecastData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Wettervorhersage:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Wettervorhersage',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Fehlende historische Wetterdaten ermitteln
 */
router.get('/missing', async (req, res) => {
  try {
    const startDate = req.query.startDate as string || '2023-01-01';
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
    
    const missingDates = await getMissingHistoricalWeatherDates(startDate, endDate);
    return res.json({
      total: missingDates.length,
      dates: missingDates
    });
  } catch (error) {
    console.error('Fehler beim Ermitteln fehlender Wetterdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Ermitteln fehlender Wetterdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Aktualisieren der Wettervorhersage
 */
router.post('/sync/forecast', async (req, res) => {
  try {
    const result = await syncWeatherForecast();
    
    // Aktualisiere den Datenabdeckungsstatus
    await updateWeatherDataCoverage();
    
    return res.json(result);
  } catch (error) {
    console.error('Fehler bei der Synchronisierung der Wettervorhersage:', error);
    return res.status(500).json({ 
      error: 'Fehler bei der Synchronisierung der Wettervorhersage',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Aktualisieren historischer Wetterdaten (einzelner Tag)
 */
router.post('/sync/historical/:date', async (req, res) => {
  try {
    const date = req.params.date;
    
    const result = await syncHistoricalWeather(date);
    
    // Aktualisiere den Datenabdeckungsstatus
    await updateWeatherDataCoverage();
    
    return res.json(result);
  } catch (error) {
    console.error('Fehler bei der Synchronisierung historischer Wetterdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler bei der Synchronisierung historischer Wetterdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Aktualisieren historischer Wetterdaten (Zeitraum/Batch)
 */
router.post('/sync/historical', async (req, res) => {
  try {
    const validationResult = syncWeatherSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Ungültige Anfrageparameter',
        details: validationResult.error.format()
      });
    }
    
    const { startDate, endDate, batchSize } = validationResult.data;
    
    const result = await syncHistoricalWeatherBatch(
      startDate || '2023-01-01', 
      endDate || new Date(), 
      batchSize || 10
    );
    
    // Aktualisiere den Datenabdeckungsstatus
    await updateWeatherDataCoverage();
    
    return res.json(result);
  } catch (error) {
    console.error('Fehler bei der Batch-Synchronisierung historischer Wetterdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler bei der Batch-Synchronisierung historischer Wetterdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
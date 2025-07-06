/**
 * Vereinfachte Enhanced Prophet Forecasting API Routes
 * 
 * Bietet grundlegende Prophet-Prognosen ohne komplexe saisonale Anreicherung
 */

import { Router } from 'express';
import { simplifiedEnhancedProphetService } from '../services/enhancedProphetSimplified.ts';

const router = Router();

/**
 * POST /api/enhanced-prophet/forecast
 * Erstellt vereinfachte erweiterte Prophet-Prognosen
 */
router.post('/forecast', async (req, res) => {
  try {
    const {
      machineId,
      productId,
      startDate,
      endDate,
      forecastHorizon = 7
    } = req.body;

    // Validierung
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const input = {
      machineId: machineId ? parseInt(machineId) : undefined,
      productId: productId ? parseInt(productId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      forecastHorizon: parseInt(forecastHorizon)
    };

    const forecast = await simplifiedEnhancedProphetService.createSimplifiedForecast(input);
    
    res.json({
      success: true,
      forecast,
      metadata: {
        totalPredictions: forecast.length,
        averageConfidence: forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.length,
        forecastRange: {
          from: forecast[0]?.date,
          to: forecast[forecast.length - 1]?.date
        },
        systemType: 'Simplified Enhanced Prophet'
      }
    });
  } catch (error) {
    console.error('[ENHANCED-PROPHET] Error creating forecast:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create enhanced forecast'
    });
  }
});

/**
 * GET /api/enhanced-prophet/machine/:machineId/forecast
 * Maschinen-spezifische Prognose
 */
router.get('/machine/:machineId/forecast', async (req, res) => {
  try {
    const { machineId } = req.params;
    const { days = 7, startDate, endDate } = req.query;

    const input = {
      machineId: parseInt(machineId),
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date(),
      forecastHorizon: parseInt(days as string)
    };

    const forecast = await simplifiedEnhancedProphetService.createSimplifiedForecast(input);
    
    res.json({
      success: true,
      machineId: parseInt(machineId),
      forecast
    });
  } catch (error) {
    console.error('[ENHANCED-PROPHET] Error with machine forecast:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create machine forecast'
    });
  }
});

/**
 * GET /api/enhanced-prophet/product/:productId/forecast
 * Produkt-spezifische Prognose
 */
router.get('/product/:productId/forecast', async (req, res) => {
  try {
    const { productId } = req.params;
    const { days = 7, startDate, endDate } = req.query;

    const input = {
      productId: parseInt(productId),
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date(),
      forecastHorizon: parseInt(days as string)
    };

    const forecast = await simplifiedEnhancedProphetService.createSimplifiedForecast(input);
    
    res.json({
      success: true,
      productId: parseInt(productId),
      forecast
    });
  } catch (error) {
    console.error('[ENHANCED-PROPHET] Error with product forecast:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product forecast'
    });
  }
});

/**
 * GET /api/enhanced-prophet/analytics
 * Prognose-Analytics und System-Status
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await simplifiedEnhancedProphetService.generateAnalytics();
    
    res.json(analytics);
  } catch (error) {
    console.error('[ENHANCED-PROPHET] Error generating analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics'
    });
  }
});

/**
 * GET /api/enhanced-prophet/status
 * System-Status
 */
router.get('/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'operational',
      systemType: 'Simplified Enhanced Prophet',
      version: '1.0',
      features: [
        'Wochentag-basierte Prognosen',
        'Monatliche Saisonalität',
        'Konfidenz-Bewertung',
        'Maschinen-spezifische Prognosen',
        'Produkt-spezifische Prognosen'
      ],
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ENHANCED-PROPHET] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

export default router;
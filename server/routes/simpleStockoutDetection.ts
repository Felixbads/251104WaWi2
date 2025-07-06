/**
 * Vereinfachte Stockout Detection API Routes
 */

import { Router } from 'express';
import { SimpleStockoutService } from '../services/simpleStockoutService';

const router = Router();
const stockoutService = new SimpleStockoutService();

/**
 * GET /api/simple-stockout/detect
 * Erkennt Stockouts basierend auf Refill-Zeiten
 */
router.get('/detect', async (req, res) => {
  try {
    const machineId = req.query.machineId ? parseInt(req.query.machineId as string) : undefined;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;

    const stockouts = await stockoutService.detectStockouts(machineId, days);
    
    res.json({
      success: true,
      stockouts,
      count: stockouts.length,
      query: { machineId, days }
    });
  } catch (error) {
    console.error('Fehler bei Stockout-Erkennung:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect stockouts'
    });
  }
});

/**
 * GET /api/simple-stockout/analytics
 * Analysiert Stockout-Auswirkungen
 */
router.get('/analytics', async (req, res) => {
  try {
    const machineId = req.query.machineId ? parseInt(req.query.machineId as string) : undefined;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;

    const stockouts = await stockoutService.detectStockouts(machineId, days);
    const impacts = await stockoutService.analyzeStockoutImpact(stockouts);
    
    res.json({
      success: true,
      analytics: {
        stockoutCount: stockouts.length,
        totalOutageMinutes: stockouts.reduce((sum, s) => sum + s.timeSinceLastSale, 0),
        averageOutageMinutes: stockouts.length > 0 ? 
          Math.round(stockouts.reduce((sum, s) => sum + s.timeSinceLastSale, 0) / stockouts.length) : 0,
        impacts
      }
    });
  } catch (error) {
    console.error('Fehler bei Stockout-Analyse:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze stockouts'
    });
  }
});

export default router;
/**
 * Stockout Detection API Routes
 * 
 * API-Endpunkte für die Erkennung ausverkaufter Produkte
 * und deren Auswirkungen auf Prognosen
 */

import { Router } from 'express';
import { SimpleStockoutService } from '../services/simpleStockoutService';

const router = Router();
const stockoutService = new SimpleStockoutService();

/**
 * GET /api/stockout-detection/detect
 * Erkennt aktuelle Stockouts
 */
router.get('/detect', async (req, res) => {
  try {
    const machineId = req.query.machineId ? parseInt(req.query.machineId as string) : undefined;
    const days = parseInt(req.query.days as string) || 7;

    const stockouts = await stockoutService.detectAllStockouts(machineId, days);
    const impacts = await stockoutService.calculateStockoutImpact(stockouts);

    res.json({
      success: true,
      stockouts,
      impacts,
      summary: {
        totalStockouts: stockouts.length,
        highConfidenceStockouts: stockouts.filter(s => s.confidence > 0.8).length,
        totalLostRevenue: impacts.reduce((sum, i) => sum + i.lostRevenue, 0),
        avgOutageMinutes: stockouts.length > 0 
          ? stockouts.reduce((sum, s) => sum + s.estimatedOutageMinutes, 0) / stockouts.length 
          : 0
      }
    });
  } catch (error) {
    console.error('[STOCKOUT-DETECTION] Error detecting stockouts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect stockouts'
    });
  }
});

/**
 * GET /api/stockout-detection/machine/:machineId
 * Stockouts für eine spezifische Maschine
 */
router.get('/machine/:machineId', async (req, res) => {
  try {
    const machineId = parseInt(req.params.machineId);
    const days = parseInt(req.query.days as string) || 30;

    const stockouts = await stockoutService.detectAllStockouts(machineId, days);
    const impacts = await stockoutService.calculateStockoutImpact(stockouts);

    res.json({
      success: true,
      machineId,
      stockouts,
      impacts,
      summary: {
        totalStockouts: stockouts.length,
        recentStockouts: stockouts.filter(s => 
          s.detectedAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length,
        totalLostRevenue: impacts.reduce((sum, i) => sum + i.lostRevenue, 0)
      }
    });
  } catch (error) {
    console.error('[STOCKOUT-DETECTION] Error getting machine stockouts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get machine stockouts'
    });
  }
});

/**
 * POST /api/stockout-detection/save-events
 * Speichert erkannte Stockouts als Events
 */
router.post('/save-events', async (req, res) => {
  try {
    const { machineId, days = 7 } = req.body;

    const stockouts = await stockoutService.detectAllStockouts(machineId, days);
    await stockoutService.saveStockoutEvents(stockouts);

    res.json({
      success: true,
      message: `${stockouts.length} stockout events saved`,
      savedEvents: stockouts.length
    });
  } catch (error) {
    console.error('[STOCKOUT-DETECTION] Error saving stockout events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save stockout events'
    });
  }
});

/**
 * GET /api/stockout-detection/analytics
 * Stockout-Analyse für bessere Prognosen
 */
router.get('/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    
    const stockouts = await stockoutService.detectAllStockouts(undefined, days);
    const impacts = await stockoutService.calculateStockoutImpact(stockouts);

    // Gruppiere nach Maschinen
    const machineAnalytics = stockouts.reduce((acc, stockout) => {
      if (!acc[stockout.machineId]) {
        acc[stockout.machineId] = {
          machineId: stockout.machineId,
          stockoutCount: 0,
          totalOutageMinutes: 0,
          avgConfidence: 0,
          detectionMethods: {}
        };
      }
      
      acc[stockout.machineId].stockoutCount++;
      acc[stockout.machineId].totalOutageMinutes += stockout.estimatedOutageMinutes;
      acc[stockout.machineId].avgConfidence += stockout.confidence;
      
      const method = stockout.detectionMethod;
      acc[stockout.machineId].detectionMethods[method] = 
        (acc[stockout.machineId].detectionMethods[method] || 0) + 1;
      
      return acc;
    }, {} as any);

    // Berechne Durchschnittswerte
    Object.values(machineAnalytics).forEach((analytics: any) => {
      analytics.avgConfidence = analytics.avgConfidence / analytics.stockoutCount;
      analytics.avgOutageMinutes = analytics.totalOutageMinutes / analytics.stockoutCount;
    });

    res.json({
      success: true,
      analytics: {
        totalStockouts: stockouts.length,
        totalImpacts: impacts.length,
        totalLostRevenue: impacts.reduce((sum, i) => sum + i.lostRevenue, 0),
        avgOutageMinutes: stockouts.length > 0 
          ? stockouts.reduce((sum, s) => sum + s.estimatedOutageMinutes, 0) / stockouts.length 
          : 0,
        machineAnalytics: Object.values(machineAnalytics),
        detectionMethodDistribution: stockouts.reduce((acc, s) => {
          acc[s.detectionMethod] = (acc[s.detectionMethod] || 0) + 1;
          return acc;
        }, {} as any),
        topAffectedProducts: impacts
          .sort((a, b) => b.lostRevenue - a.lostRevenue)
          .slice(0, 10)
          .map(i => ({
            productName: i.productName,
            machineId: i.machineId,
            lostRevenue: i.lostRevenue,
            missedSales: i.missedSalesEstimate
          }))
      }
    });
  } catch (error) {
    console.error('[STOCKOUT-DETECTION] Error generating analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate stockout analytics'
    });
  }
});

export default router;
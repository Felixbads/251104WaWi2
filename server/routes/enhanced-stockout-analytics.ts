/**
 * ENHANCED STOCKOUT ANALYTICS API ROUTES
 * 
 * Erweiterte API-Endpunkte für Stockout-Analyse, Lost Sales und
 * Optimierungs-Dashboard mit Nachfüllungs-Empfehlungen
 */

import { Router, Request, Response } from 'express';
import { EnhancedStockoutAnalysisService } from '../services/enhancedStockoutAnalysisService';
import { replitAuthMiddleware } from '../auth/replit-auth';

const router = Router();
const stockoutAnalysisService = new EnhancedStockoutAnalysisService();

/**
 * Umfassende Lost Sales Analyse
 * GET /api/enhanced-stockout/lost-sales-analysis
 */
router.get('/lost-sales-analysis', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      daysBack = '90',
      machineId,
      productId,
      minRevenue = '50'
    } = req.query;

    console.log(`📊 API: Lost Sales Analyse angefragt (${daysBack} Tage)`);

    const lostSalesAnalysis = await stockoutAnalysisService.analyzeLostSalesComprehensive(
      parseInt(daysBack as string),
      machineId ? parseInt(machineId as string) : undefined,
      productId ? parseInt(productId as string) : undefined
    );

    // Filtere nach Mindest-Umsatverlust
    const filteredAnalysis = lostSalesAnalysis.filter(analysis => 
      analysis.totalLostRevenue >= parseFloat(minRevenue as string)
    );

    res.json({
      success: true,
      data: filteredAnalysis,
      summary: {
        totalAnalyzed: lostSalesAnalysis.length,
        filteredCount: filteredAnalysis.length,
        totalLostRevenue: filteredAnalysis.reduce((sum, a) => sum + a.totalLostRevenue, 0),
        totalPotentialIncrease: filteredAnalysis.reduce((sum, a) => sum + a.potentialRevenueIncrease, 0),
        avgDemandSuppression: filteredAnalysis.reduce((sum, a) => sum + a.demandSuppression, 0) / Math.max(filteredAnalysis.length, 1)
      }
    });
  } catch (error) {
    console.error('❌ Fehler bei Lost Sales Analyse API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Analyse verlorener Verkäufe'
    });
  }
});

/**
 * Refill-Optimierungs-Empfehlungen
 * GET /api/enhanced-stockout/refill-optimization
 */
router.get('/refill-optimization', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      machineId,
      minRevenuePotential = '100'
    } = req.query;

    console.log('🎯 API: Refill-Optimierung angefragt');

    const optimizationResults = await stockoutAnalysisService.optimizeRefillStrategies(
      machineId ? parseInt(machineId as string) : undefined,
      parseFloat(minRevenuePotential as string)
    );

    // Gruppiere nach Standorten für bessere Übersicht
    const locationGroups = new Map();
    optimizationResults.forEach(result => {
      // Hole Standort-Info (vereinfacht - könnte aus DB erweitert werden)
      const locationKey = `machine_${result.machineId}`;
      if (!locationGroups.has(locationKey)) {
        locationGroups.set(locationKey, {
          machineId: result.machineId,
          opportunities: [],
          totalNetBenefit: 0
        });
      }
      
      const location = locationGroups.get(locationKey);
      location.opportunities.push(result);
      location.totalNetBenefit += result.optimizedStrategy.netBenefit;
    });

    res.json({
      success: true,
      data: optimizationResults,
      locations: Array.from(locationGroups.values()),
      summary: {
        totalOpportunities: optimizationResults.length,
        totalNetBenefit: optimizationResults.reduce((sum, r) => sum + r.optimizedStrategy.netBenefit, 0),
        avgConfidence: optimizationResults.reduce((sum, r) => sum + r.confidence, 0) / Math.max(optimizationResults.length, 1)
      }
    });
  } catch (error) {
    console.error('❌ Fehler bei Refill-Optimierung API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Refill-Optimierung'
    });
  }
});

/**
 * Stockout Analytics Dashboard Daten
 * GET /api/enhanced-stockout/dashboard
 */
router.get('/dashboard', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { machineId } = req.query;

    console.log('📊 API: Stockout Analytics Dashboard angefragt');

    const dashboardData = await stockoutAnalysisService.getStockoutAnalyticsDashboard(
      machineId ? parseInt(machineId as string) : undefined
    );

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('❌ Fehler bei Dashboard API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Dashboard-Daten'
    });
  }
});

/**
 * Stockout-Korrektur-Faktor für Prophet-Prognosen
 * GET /api/enhanced-stockout/correction-factor
 */
router.get('/correction-factor', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { machineId, productId, date } = req.query;

    if (!machineId || !productId || !date) {
      return res.status(400).json({
        success: false,
        error: 'machineId, productId und date sind erforderlich'
      });
    }

    console.log(`🔧 API: Stockout-Korrektur-Faktor angefragt für Maschine ${machineId}, Produkt ${productId}`);

    const correctionFactor = await stockoutAnalysisService.calculateStockoutCorrectionFactor(
      parseInt(machineId as string),
      parseInt(productId as string),
      new Date(date as string)
    );

    res.json({
      success: true,
      data: {
        machineId: parseInt(machineId as string),
        productId: parseInt(productId as string),
        date: date as string,
        correctionFactor,
        correctionPercentage: Math.round((correctionFactor - 1) * 100)
      }
    });
  } catch (error) {
    console.error('❌ Fehler bei Stockout-Korrektur-Faktor API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Berechnung des Korrektur-Faktors'
    });
  }
});

/**
 * Top Lost Revenue Opportunities (für Quick-Actions)
 * GET /api/enhanced-stockout/top-opportunities
 */
router.get('/top-opportunities', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;

    console.log(`🔥 API: Top ${limit} Revenue-Opportunities angefragt`);

    const lostSalesAnalysis = await stockoutAnalysisService.analyzeLostSalesComprehensive(90);
    
    // Sortiere nach potentieller Umsatzsteigerung und nehme Top N
    const topOpportunities = lostSalesAnalysis
      .sort((a, b) => b.potentialRevenueIncrease - a.potentialRevenueIncrease)
      .slice(0, parseInt(limit as string))
      .map(opportunity => ({
        machineId: opportunity.machineId,
        machineName: opportunity.machineName,
        productId: opportunity.productId,
        productName: opportunity.productName,
        potentialRevenueIncrease: opportunity.potentialRevenueIncrease,
        currentRefillFrequency: opportunity.currentRefillFrequency,
        optimalRefillFrequency: opportunity.optimalRefillFrequency,
        stockoutFrequency: opportunity.stockoutFrequency,
        demandSuppression: Math.round(opportunity.demandSuppression * 100),
        priority: opportunity.potentialRevenueIncrease > 500 ? 'HIGH' : 
                  opportunity.potentialRevenueIncrease > 200 ? 'MEDIUM' : 'LOW'
      }));

    res.json({
      success: true,
      data: topOpportunities,
      totalAnalyzed: lostSalesAnalysis.length,
      totalPotential: topOpportunities.reduce((sum, opp) => sum + opp.potentialRevenueIncrease, 0)
    });
  } catch (error) {
    console.error('❌ Fehler bei Top Opportunities API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Top-Opportunities'
    });
  }
});

/**
 * Stockout-Trend-Analyse für Chart-Visualisierung  
 * GET /api/enhanced-stockout/trend-analysis
 */
router.get('/trend-analysis', replitAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      machineId,
      weeks = '12',
      groupBy = 'week' // 'week' oder 'month'
    } = req.query;

    console.log(`📈 API: Stockout-Trend-Analyse angefragt (${weeks} ${groupBy}s)`);

    // Verwende das Dashboard um Trend-Daten zu bekommen
    const dashboardData = await stockoutAnalysisService.getStockoutAnalyticsDashboard(
      machineId ? parseInt(machineId as string) : undefined
    );

    // Erweitere um zusätzliche Trend-Informationen
    const trendData = dashboardData.trendData.map(trend => ({
      ...trend,
      period: groupBy === 'month' ? 
        trend.week_start?.toISOString().substring(0, 7) : // YYYY-MM
        `${trend.week_start?.getFullYear()}-W${Math.ceil((trend.week_start?.getTime() - new Date(trend.week_start?.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}` // YYYY-WNN
    }));

    res.json({
      success: true,
      data: {
        trends: trendData,
        summary: dashboardData.summary,
        period: groupBy,
        weeks: parseInt(weeks as string)
      }
    });
  } catch (error) {
    console.error('❌ Fehler bei Trend-Analyse API:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Trend-Analyse'
    });
  }
});

export default router;
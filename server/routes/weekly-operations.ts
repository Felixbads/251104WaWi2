/**
 * Weekly Operations Analysis API - Comprehensive Vending Machine Operations Analytics
 * 
 * Endpunkte:
 * - GET /api/weekly-operations/summary/:startDate/:endDate - Vollständige Wochenanalyse
 * - GET /api/weekly-operations/refills/:startDate/:endDate - Detaillierte Befüllungsanalyse
 * - GET /api/weekly-operations/fill-levels/:startDate/:endDate - Füllstandsverläufe
 * - GET /api/weekly-operations/product-performance/:startDate/:endDate - Produktperformance
 * - GET /api/weekly-operations/economics/:startDate/:endDate - Wirtschaftlichkeitsanalyse
 * - GET /api/weekly-operations/mhd-analysis/:startDate/:endDate - MHD-Management und Compliance
 * - GET /api/weekly-operations/optimization-recommendations/:startDate/:endDate - Optimierungsempfehlungen
 * - GET /api/weekly-operations/current-week - Aktuelle Woche automatisch
 */

import express from 'express';
import { weeklyOperationsAnalysisService } from '../services/weeklyOperationsAnalysisService';

const router = express.Router();

/**
 * GET /api/weekly-operations/summary/:startDate/:endDate
 * Vollständige Wochenanalyse mit allen Komponenten
 */
router.get('/summary/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    // Validiere Datumseingaben
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Ungültige Datumsangaben. Format: YYYY-MM-DD' 
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({ 
        error: 'Startdatum muss vor Enddatum liegen' 
      });
    }

    console.log(`📊 [WeeklyOperations API] Generiere vollständige Wochenanalyse für ${req.params.startDate} bis ${req.params.endDate}`);

    const summary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);

    res.json({
      success: true,
      data: summary,
      generatedAt: new Date(),
      period: {
        startDate: req.params.startDate,
        endDate: req.params.endDate,
        daysAnalyzed: Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
      }
    });

    console.log(`✅ [WeeklyOperations API] Wochenanalyse erfolgreich generiert`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Wochenanalyse:`, error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der Wochenanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/refills/:startDate/:endDate
 * Detaillierte Befüllungsanalyse mit Wirtschaftlichkeitsbewertung
 */
router.get('/refills/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`🔧 [WeeklyOperations API] Analysiere Befüllungen für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    const response = {
      success: true,
      data: {
        refillSummary: fullSummary.refillSummary,
        refillDetails: fullSummary.refillDetails,
        economicMetrics: {
          totalCost: fullSummary.refillSummary.totalCost,
          averageROI: fullSummary.economicAnalysis.refillEfficiency.averageROI,
          uneconomicalRefills: fullSummary.economicAnalysis.refillEfficiency.uneconomicalRefills
        }
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] Befüllungsanalyse abgeschlossen: ${fullSummary.refillDetails.length} Befüllungen`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Befüllungsanalyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Befüllungsanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/fill-levels/:startDate/:endDate
 * Füllstandsverläufe und Produktverfügbarkeit
 */
router.get('/fill-levels/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`📊 [WeeklyOperations API] Analysiere Füllstandsverläufe für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    const response = {
      success: true,
      data: {
        fillLevelProgression: fullSummary.fillLevelProgression,
        averageFillLevel: fullSummary.refillSummary.averageFillLevel,
        machinesTracked: fullSummary.refillSummary.machinesRefilled,
        insights: {
          lowFillLevelAlerts: fullSummary.fillLevelProgression.filter(machine => 
            machine.dailyProgression.some(day => day.totalFillLevel < 30)
          ).length,
          stockoutEvents: fullSummary.fillLevelProgression.reduce((total, machine) => 
            total + machine.dailyProgression.reduce((machineStockouts, day) => 
              machineStockouts + day.productFillLevels.filter(product => product.isStockout).length, 0
            ), 0
          )
        }
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] Füllstandsanalyse abgeschlossen`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Füllstandsanalyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Füllstandsanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/product-performance/:startDate/:endDate
 * Produktperformance-Analyse mit Verkaufsgeschwindigkeit und Deckungsbeiträgen
 */
router.get('/product-performance/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`🏆 [WeeklyOperations API] Analysiere Produktperformance für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    const response = {
      success: true,
      data: {
        productPerformance: fullSummary.productPerformance,
        summary: {
          totalProducts: fullSummary.productPerformance.length,
          fastSellingProducts: fullSummary.productPerformance.filter(p => p.salesVelocity === 'fast').length,
          slowSellingProducts: fullSummary.productPerformance.filter(p => p.salesVelocity === 'slow').length,
          highContributionProducts: fullSummary.productPerformance.filter(p => p.contributionMargin > 0.4).length,
          productsWithStockouts: fullSummary.productPerformance.filter(p => p.stockoutRate > 0).length,
          totalLostRevenue: fullSummary.productPerformance.reduce((sum, p) => sum + p.lostRevenueDueToStockouts, 0)
        },
        recommendations: fullSummary.optimizationRecommendations.filter(r => r.type === 'product_mix')
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] Produktperformance-Analyse abgeschlossen: ${fullSummary.productPerformance.length} Produkte`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Produktperformance-Analyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Produktperformance-Analyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/economics/:startDate/:endDate
 * Wirtschaftlichkeitsanalyse mit 50€ Fixkosten-Modell
 */
router.get('/economics/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`💰 [WeeklyOperations API] Analysiere Wirtschaftlichkeit für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    const response = {
      success: true,
      data: {
        economicAnalysis: fullSummary.economicAnalysis,
        refillEfficiencyMetrics: {
          totalRefills: fullSummary.refillSummary.totalRefills,
          fixCostPerRefill: 50, // Euro
          totalFixCosts: fullSummary.refillSummary.totalCost,
          averageROI: fullSummary.economicAnalysis.refillEfficiency.averageROI,
          profitableRefills: fullSummary.refillDetails.filter(r => r.wasEconomicallyJustified).length,
          unprofitableRefills: fullSummary.refillDetails.filter(r => !r.wasEconomicallyJustified).length
        },
        optimizationPotential: fullSummary.economicAnalysis.optimizationPotential,
        keyMetrics: {
          netOperatingResult: fullSummary.economicAnalysis.weeklyTotals.netOperatingResult,
          totalRevenue: fullSummary.economicAnalysis.weeklyTotals.totalRevenue,
          profitMargin: (fullSummary.economicAnalysis.weeklyTotals.netOperatingResult / 
                        Math.max(1, fullSummary.economicAnalysis.weeklyTotals.totalRevenue)) * 100
        }
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] Wirtschaftlichkeitsanalyse abgeschlossen`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Wirtschaftlichkeitsanalyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Wirtschaftlichkeitsanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/mhd-analysis/:startDate/:endDate
 * MHD-Management und Batch-Compliance-Analyse
 */
router.get('/mhd-analysis/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`🗓️ [WeeklyOperations API] Analysiere MHD-Management für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    const response = {
      success: true,
      data: {
        mhdAnalysis: fullSummary.mhdAnalysis,
        criticalBatches: fullSummary.mhdAnalysis.batchAnalysis.filter(batch => 
          batch.willExpireBeforeSold || batch.daysUntilExpiry <= 3
        ),
        complianceMetrics: {
          fifoComplianceRate: fullSummary.mhdAnalysis.fifoCompliance.complianceRate,
          wasteReductionPotential: fullSummary.mhdAnalysis.estimatedWasteCost * 0.8, // 80% reduzierbar
          urgentActions: fullSummary.mhdAnalysis.batchAnalysis.filter(batch => 
            batch.recommendedAction === 'urgent_promotion'
          ).length
        },
        recommendations: fullSummary.optimizationRecommendations.filter(r => r.type === 'inventory_management')
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] MHD-Analyse abgeschlossen: ${fullSummary.mhdAnalysis.batchAnalysis.length} Chargen analysiert`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei MHD-Analyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der MHD-Analyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/optimization-recommendations/:startDate/:endDate
 * Optimierungsempfehlungen basierend auf allen Analysedaten
 */
router.get('/optimization-recommendations/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Ungültige Datumsangaben' });
    }

    console.log(`🎯 [WeeklyOperations API] Generiere Optimierungsempfehlungen für ${req.params.startDate} bis ${req.params.endDate}`);

    const fullSummary = await weeklyOperationsAnalysisService.generateWeeklySummary(startDate, endDate);
    
    // Gruppiere Empfehlungen nach Priorität und Typ
    const recommendations = fullSummary.optimizationRecommendations;
    const groupedRecommendations = {
      highPriority: recommendations.filter(r => r.priority === 'high'),
      mediumPriority: recommendations.filter(r => r.priority === 'medium'),
      lowPriority: recommendations.filter(r => r.priority === 'low'),
      
      byType: {
        refillTiming: recommendations.filter(r => r.type === 'refill_timing'),
        productMix: recommendations.filter(r => r.type === 'product_mix'),
        routeOptimization: recommendations.filter(r => r.type === 'route_optimization'),
        inventoryManagement: recommendations.filter(r => r.type === 'inventory_management')
      }
    };

    const response = {
      success: true,
      data: {
        recommendations: groupedRecommendations,
        summary: {
          totalRecommendations: recommendations.length,
          highPriorityActions: groupedRecommendations.highPriority.length,
          estimatedTotalSavings: recommendations.reduce((sum, r) => 
            sum + (r.estimatedImpact.costSavings || 0), 0
          ),
          estimatedRevenueIncrease: recommendations.reduce((sum, r) => 
            sum + (r.estimatedImpact.revenueIncrease || 0), 0
          ),
          averageImplementationTime: this.calculateAverageImplementationTime(recommendations)
        },
        actionPlan: this.generateActionPlan(groupedRecommendations.highPriority)
      },
      period: { startDate: req.params.startDate, endDate: req.params.endDate }
    };

    res.json(response);
    console.log(`✅ [WeeklyOperations API] Optimierungsempfehlungen generiert: ${recommendations.length} Empfehlungen`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei Optimierungsempfehlungen:`, error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der Optimierungsempfehlungen',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weekly-operations/current-week
 * Automatische Analyse der aktuellen Woche (Montag bis Sonntag)
 */
router.get('/current-week', async (req, res) => {
  try {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sonntag, 1 = Montag, etc.
    
    // Berechne Montag der aktuellen Woche
    const mondayOffset = currentDay === 0 ? 6 : currentDay - 1; // Sonntag = 6 Tage zurück
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    // Berechne Sonntag der aktuellen Woche
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    console.log(`📅 [WeeklyOperations API] Analysiere aktuelle Woche: ${monday.toISOString().split('T')[0]} bis ${sunday.toISOString().split('T')[0]}`);

    const summary = await weeklyOperationsAnalysisService.generateWeeklySummary(monday, sunday);

    res.json({
      success: true,
      data: summary,
      generatedAt: new Date(),
      period: {
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0],
        weekNumber: summary.weekPeriod.weekNumber,
        year: summary.weekPeriod.year,
        isCurrentWeek: true
      }
    });

    console.log(`✅ [WeeklyOperations API] Aktuelle Wochenanalyse abgeschlossen`);

  } catch (error) {
    console.error(`❌ [WeeklyOperations API] Fehler bei aktueller Wochenanalyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der aktuellen Wochenanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Hilfsfunktionen für API-Responses
 */
function calculateAverageImplementationTime(recommendations: any[]): string {
  if (recommendations.length === 0) return '0 Wochen';
  
  const weekValues = recommendations.map(r => {
    const match = r.timeline?.match(/(\d+)\s*wochen?/i);
    return match ? parseInt(match[1]) : 2; // Default 2 Wochen
  });
  
  const average = weekValues.reduce((sum, weeks) => sum + weeks, 0) / weekValues.length;
  return `${Math.round(average)} Wochen`;
}

function generateActionPlan(highPriorityRecommendations: any[]): any[] {
  return highPriorityRecommendations.map((recommendation, index) => ({
    step: index + 1,
    action: recommendation.recommendation,
    timeline: recommendation.timeline,
    expectedBenefit: recommendation.expectedBenefit,
    implementationSteps: recommendation.implementationSteps,
    priority: 'high',
    estimatedCost: 'Zu bewerten',
    responsibleDepartment: 'Operations'
  }));
}

export default router;
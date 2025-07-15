/**
 * Stock Ratios API Routes
 * Endpunkte für die Verwaltung und Anzeige von Füllstand-Verhältnissen
 */

import express from 'express';
import { stockRatioService } from '../services/stockRatioService';

const router = express.Router();

/**
 * GET /api/stock-ratios/all
 * Gibt alle Füllstand-Verhältnisse für alle Maschinen zurück
 */
router.get('/all', async (req, res) => {
  try {
    console.log('📊 Abrufen aller Stock-Verhältnisse...');
    
    const stockSummaries = await stockRatioService.calculateAllStockRatios();
    
    res.json({
      success: true,
      data: stockSummaries,
      summary: {
        totalMachines: stockSummaries.length,
        totalSlots: stockSummaries.reduce((sum, summary) => sum + summary.totalSlots, 0),
        averageFillPercentage: stockSummaries.length > 0 
          ? Math.round(stockSummaries.reduce((sum, summary) => sum + summary.averageFillPercentage, 0) / stockSummaries.length)
          : 0,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Stock-Verhältnisse:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Stock-Verhältnisse',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/stock-ratios/machine/:machineId
 * Gibt Füllstand-Verhältnisse für eine spezifische Maschine zurück
 */
router.get('/machine/:machineId', async (req, res) => {
  try {
    const machineId = parseInt(req.params.machineId, 10);
    
    if (isNaN(machineId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Maschinen-ID'
      });
    }
    
    console.log(`📊 Abrufen der Stock-Verhältnisse für Maschine ${machineId}...`);
    
    const stockRatios = await stockRatioService.calculateStockRatiosForMachine(machineId);
    
    if (stockRatios.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Keine Stock-Daten für Maschine ${machineId} gefunden`
      });
    }
    
    const averageFillRatio = stockRatios.reduce((sum, ratio) => sum + ratio.fillRatio, 0) / stockRatios.length;
    
    res.json({
      success: true,
      data: {
        machineId,
        machineName: stockRatios[0].machineName,
        totalSlots: stockRatios.length,
        filledSlots: stockRatios.filter(ratio => ratio.currentQuantity > 0).length,
        averageFillPercentage: Math.round(averageFillRatio * 100),
        stockRatios,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`❌ Fehler beim Abrufen der Stock-Verhältnisse für Maschine ${req.params.machineId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Stock-Verhältnisse',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/stock-ratios/external-api
 * Formatierte Daten für externe APIs (optimiert für Übergabe)
 */
router.get('/external-api', async (req, res) => {
  try {
    console.log('🌐 Bereite Stock-Daten für externe API vor...');
    
    const formattedData = await stockRatioService.getFormattedStockDataForExternalAPI();
    
    res.json({
      success: true,
      ...formattedData
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Vorbereiten der externen API-Daten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Vorbereiten der externen API-Daten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/stock-ratios/update-max-quantities
 * Manueller Trigger zum Aktualisieren der maximalen Kapazitäten
 */
router.post('/update-max-quantities', async (req, res) => {
  try {
    console.log('🔄 Manueller Trigger: Aktualisiere maximale Kapazitäten...');
    
    await stockRatioService.updateMaxQuantityFromRefills();
    
    res.json({
      success: true,
      message: 'Maximale Kapazitäten erfolgreich aktualisiert',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren der maximalen Kapazitäten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren der maximalen Kapazitäten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/stock-ratios/summary
 * Kompakte Übersicht aller Füllstände
 */
router.get('/summary', async (req, res) => {
  try {
    console.log('📋 Erstelle kompakte Füllstand-Übersicht...');
    
    const stockSummaries = await stockRatioService.calculateAllStockRatios();
    
    // Berechne System-weite Statistiken
    const totalSlots = stockSummaries.reduce((sum, summary) => sum + summary.totalSlots, 0);
    const totalFilledSlots = stockSummaries.reduce((sum, summary) => sum + summary.filledSlots, 0);
    const avgSystemFill = stockSummaries.length > 0 
      ? stockSummaries.reduce((sum, summary) => sum + summary.averageFillPercentage, 0) / stockSummaries.length
      : 0;
    
    // Kategorisiere Maschinen nach Füllstand
    const categories = {
      full: stockSummaries.filter(s => s.averageFillPercentage >= 80).length,
      medium: stockSummaries.filter(s => s.averageFillPercentage >= 40 && s.averageFillPercentage < 80).length,
      low: stockSummaries.filter(s => s.averageFillPercentage >= 20 && s.averageFillPercentage < 40).length,
      critical: stockSummaries.filter(s => s.averageFillPercentage < 20).length
    };
    
    // Finde Maschinen mit kritischen Füllständen
    const criticalMachines = stockSummaries
      .filter(s => s.averageFillPercentage < 30)
      .map(s => ({
        machineId: s.machineId,
        machineName: s.machineName,
        fillPercentage: s.averageFillPercentage,
        emptySlots: s.totalSlots - s.filledSlots
      }))
      .sort((a, b) => a.fillPercentage - b.fillPercentage);
    
    res.json({
      success: true,
      summary: {
        totalMachines: stockSummaries.length,
        totalSlots,
        totalFilledSlots,
        systemFillPercentage: Math.round(avgSystemFill),
        categories,
        criticalMachines: criticalMachines.slice(0, 10), // Top 10 kritische Maschinen
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen der Füllstand-Übersicht:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen der Füllstand-Übersicht',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
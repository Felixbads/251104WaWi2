/**
 * Machine Stock API Routes - Echte Vendon API Integration für Maschinenbestände
 */

import { Router } from 'express';
import { getMachineStockData, calculateStockStatistics } from '../services/stockRatioService';
import { db } from '../db';
import { machines } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/machine-stock/:vendonId
 * Holt echte Bestandsdaten für eine spezifische Maschine
 */
router.get('/:vendonId', async (req, res) => {
  try {
    const vendonId = parseInt(req.params.vendonId);
    
    if (isNaN(vendonId)) {
      return res.status(400).json({ 
        error: 'Ungültige Vendon ID', 
        message: 'Die Vendon ID muss eine Zahl sein' 
      });
    }

    console.log(`[API] Abrufen der Bestandsdaten für Vendon ID: ${vendonId}`);

    // Hol Maschinenname aus Datenbank
    const machineResult = await db
      .select({ machineName: machines.machineName })
      .from(machines)
      .where(eq(machines.vendonId, vendonId.toString()))
      .limit(1);

    const machineName = machineResult[0]?.machineName || `Maschine ${vendonId}`;

    // Hol echte Bestandsdaten von Vendon API
    const stockData = await getMachineStockData(vendonId, machineName);

    if (!stockData) {
      return res.status(404).json({ 
        error: 'Keine Bestandsdaten gefunden', 
        message: `Keine Vendon API-Daten für Maschine ${vendonId} verfügbar`,
        vendonId,
        machineName
      });
    }

    res.json({
      success: true,
      data: stockData,
      summary: {
        totalProducts: stockData.products.length,
        fillLevel: Math.round(stockData.totalFillLevel * 100),
        criticalProducts: stockData.criticalProducts,
        hasLowStock: stockData.criticalProducts > 0
      }
    });

  } catch (error) {
    console.error('[API] Fehler beim Abrufen der Maschinenbestände:', error);
    res.status(500).json({ 
      error: 'Interner Server-Fehler', 
      message: error.message 
    });
  }
});

/**
 * GET /api/machine-stock/overview/all
 * Holt Übersicht aller aktiven Maschinen mit Bestandsdaten
 */
router.get('/overview/all', async (req, res) => {
  try {
    console.log('[API] Abrufen der Bestandsübersicht für alle Maschinen...');

    // Hol alle aktiven Maschinen aus Datenbank
    const activeMachines = await db
      .select({
        id: machines.id,
        vendonId: machines.vendonId,
        machineName: machines.machineName
      })
      .from(machines)
      .where(eq(machines.isActive, true))
      .limit(20); // Begrenze auf 20 für erste Tests

    console.log(`[API] Gefunden: ${activeMachines.length} aktive Maschinen`);

    const stockDataPromises = activeMachines.map(async (machine) => {
      try {
        const vendonId = parseInt(machine.vendonId);
        if (isNaN(vendonId)) return null;

        const stockData = await getMachineStockData(vendonId, machine.machineName);
        return stockData;
      } catch (error) {
        console.error(`[API] Fehler bei Maschine ${machine.vendonId}:`, error);
        return null;
      }
    });

    // Warte auf alle API-Aufrufe (parallel)
    const stockResults = await Promise.all(stockDataPromises);
    
    // Filtere erfolgreiche Ergebnisse
    const validStockData = stockResults.filter(data => data !== null);

    console.log(`[API] ✅ ${validStockData.length} Maschinen mit Bestandsdaten abgerufen`);

    // Berechne Statistiken
    const statistics = calculateStockStatistics(validStockData);

    res.json({
      success: true,
      data: {
        machines: validStockData,
        statistics,
        metadata: {
          totalRequested: activeMachines.length,
          successfulResponses: validStockData.length,
          failedResponses: activeMachines.length - validStockData.length,
          lastUpdate: new Date()
        }
      }
    });

  } catch (error) {
    console.error('[API] Fehler beim Abrufen der Maschinenübersicht:', error);
    res.status(500).json({ 
      error: 'Interner Server-Fehler', 
      message: error.message 
    });
  }
});

/**
 * GET /api/machine-stock/test/:vendonId
 * Test-Endpoint für einzelne Maschine (nur für Debugging)
 */
router.get('/test/:vendonId', async (req, res) => {
  try {
    const vendonId = parseInt(req.params.vendonId);
    
    if (isNaN(vendonId)) {
      return res.status(400).json({ 
        error: 'Ungültige Vendon ID für Test' 
      });
    }

    console.log(`[API TEST] Testing Vendon API für Maschine ${vendonId}...`);

    // Import fetchMachineProducts direkt für Test
    const { fetchMachineProducts } = await import('../services/vendonAPI');
    const rawData = await fetchMachineProducts(vendonId);

    res.json({
      success: rawData !== null,
      vendonId,
      rawApiResponse: rawData,
      productsCount: Array.isArray(rawData) ? rawData.length : 0,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('[API TEST] Fehler:', error);
    res.status(500).json({ 
      error: 'Test fehlgeschlagen', 
      message: error.message 
    });
  }
});

export default router;
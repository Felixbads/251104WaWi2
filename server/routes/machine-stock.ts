/**
 * Machine Stock API Routes - Datenbankbasierte Maschinenbestand-Abfragen
 * Verwendet gespeicherte Daten aus machine_stocks statt Live-API-Calls
 */

import { Router } from 'express';
import { db } from '../db';
import { machines, machineStocks, products } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { stockSyncService } from '../services/stockSyncService';

const router = Router();

/**
 * GET /api/machine-stock/:vendonId
 * Holt Bestandsdaten für eine spezifische Maschine aus der Datenbank
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

    console.log(`[API] Abrufen der Bestandsdaten für Vendon ID: ${vendonId} (aus Datenbank)`);

    // Hol Maschineninformationen
    const [machine] = await db
      .select({
        id: machines.id,
        machineName: machines.machineName,
        vendonId: machines.vendonId
      })
      .from(machines)
      .where(eq(machines.vendonId, vendonId.toString()))
      .limit(1);

    if (!machine) {
      return res.status(404).json({ 
        error: 'Maschine nicht gefunden', 
        message: `Maschine mit Vendon ID ${vendonId} nicht in Datenbank`,
        vendonId
      });
    }

    // Hol Bestandsdaten aus Datenbank
    const stockEntries = await db
      .select({
        id: machineStocks.id,
        productVendonId: machineStocks.productVendonId,
        selectionNumber: machineStocks.selectionNumber,
        quantity: machineStocks.quantity,
        maxQuantity: machineStocks.maxQuantity,
        status: machineStocks.status,
        lastFilled: machineStocks.lastFilled,
        lastSync: machineStocks.lastSync,
        rawData: machineStocks.rawData
      })
      .from(machineStocks)
      .where(eq(machineStocks.machineId, machine.id))
      .orderBy(machineStocks.selectionNumber);

    if (stockEntries.length === 0) {
      return res.status(404).json({ 
        error: 'Keine Bestandsdaten gefunden', 
        message: `Keine Bestandsdaten für Maschine ${machine.machineName} in Datenbank. Synchronisation erforderlich.`,
        vendonId,
        machineName: machine.machineName,
        hint: 'Verwenden Sie /api/machine-stock/sync/{vendonId} für manuelle Synchronisation'
      });
    }

    // Berechne Statistiken
    const totalProducts = stockEntries.length;
    const totalQuantity = stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
    const totalMaxQuantity = stockEntries.reduce((sum, entry) => sum + (entry.maxQuantity || 0), 0);
    const fillLevel = totalMaxQuantity > 0 ? totalQuantity / totalMaxQuantity : 0;
    const criticalProducts = stockEntries.filter(entry => {
      const ratio = entry.maxQuantity > 0 ? (entry.quantity || 0) / entry.maxQuantity : 0;
      return ratio < 0.2; // Weniger als 20% = kritisch
    }).length;

    // Formatiere Produktdaten
    const products = stockEntries.map(entry => ({
      productId: entry.productVendonId,
      productName: entry.productVendonId, // Vereinfacht - könnte mit products table erweitert werden
      selectionNumber: entry.selectionNumber,
      quantity: entry.quantity || 0,
      maxQuantity: entry.maxQuantity || 0,
      fillRatio: entry.maxQuantity > 0 ? (entry.quantity || 0) / entry.maxQuantity : 0,
      status: entry.status,
      lastFilled: entry.lastFilled,
      isCritical: entry.maxQuantity > 0 ? (entry.quantity || 0) / entry.maxQuantity < 0.2 : false
    }));

    // Neueste Synchronisation finden
    const lastSync = stockEntries.reduce((latest, entry) => {
      return !latest || (entry.lastSync && entry.lastSync > latest) ? entry.lastSync : latest;
    }, null);

    const stockData = {
      machineId: machine.id,
      machineName: machine.machineName,
      vendonId: machine.vendonId,
      products,
      totalFillLevel: fillLevel,
      criticalProducts,
      lastSync,
      dataSource: 'database'
    };

    res.json({
      success: true,
      data: stockData,
      summary: {
        totalProducts,
        fillLevel: Math.round(fillLevel * 100),
        criticalProducts,
        hasLowStock: criticalProducts > 0,
        lastSync,
        dataAge: lastSync ? `${Math.round((Date.now() - new Date(lastSync).getTime()) / (1000 * 60))} min` : 'unbekannt'
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
 * Holt Übersicht aller aktiven Maschinen mit Bestandsdaten aus der Datenbank
 */
router.get('/overview/all', async (req, res) => {
  try {
    console.log('[API] Abrufen der Bestandsübersicht für alle Maschinen (aus Datenbank)...');

    // Hol alle aktiven Maschinen mit ihren Bestandsdaten
    const machinesWithStocks = await db
      .select({
        machineId: machines.id,
        machineName: machines.machineName,
        vendonId: machines.vendonId,
        totalProducts: machineStocks.id, // Wird später aggregiert
        totalQuantity: machineStocks.quantity,
        maxQuantity: machineStocks.maxQuantity,
        lastSync: machineStocks.lastSync
      })
      .from(machines)
      .leftJoin(machineStocks, eq(machines.id, machineStocks.machineId))
      .where(eq(machines.isActive, true));

    // Gruppiere nach Maschinen
    const machineGroups = machinesWithStocks.reduce((acc, row) => {
      const key = row.machineId;
      if (!acc[key]) {
        acc[key] = {
          machineId: row.machineId,
          machineName: row.machineName,
          vendonId: row.vendonId,
          products: [],
          totalQuantity: 0,
          totalMaxQuantity: 0,
          lastSync: null
        };
      }
      
      if (row.totalProducts) { // Hat Bestandsdaten
        acc[key].products.push(row);
        acc[key].totalQuantity += row.totalQuantity || 0;
        acc[key].totalMaxQuantity += row.maxQuantity || 0;
        
        // Neueste Synchronisation finden
        if (row.lastSync && (!acc[key].lastSync || row.lastSync > acc[key].lastSync)) {
          acc[key].lastSync = row.lastSync;
        }
      }
      
      return acc;
    }, {});

    const machineList = Object.values(machineGroups);

    // Berechne Statistiken für jede Maschine
    const validStockData = machineList.map((machine: any) => {
      const fillLevel = machine.totalMaxQuantity > 0 ? machine.totalQuantity / machine.totalMaxQuantity : 0;
      const criticalProducts = machine.products.filter((product: any) => {
        const ratio = (product.maxQuantity || 0) > 0 ? (product.totalQuantity || 0) / (product.maxQuantity || 0) : 0;
        return ratio < 0.2;
      }).length;

      return {
        machineId: machine.machineId,
        machineName: machine.machineName,
        vendonId: machine.vendonId,
        products: machine.products.map((p: any) => ({
          quantity: p.totalQuantity || 0,
          maxQuantity: p.maxQuantity || 0,
          fillRatio: (p.maxQuantity || 0) > 0 ? (p.totalQuantity || 0) / (p.maxQuantity || 0) : 0
        })),
        totalFillLevel: fillLevel,
        criticalProducts,
        lastSync: machine.lastSync,
        hasStockData: machine.products.length > 0,
        dataSource: 'database'
      };
    });

    // Globale Statistiken
    const totalMachines = validStockData.length;
    const machinesWithData = validStockData.filter(m => m.hasStockData).length;
    const totalCriticalProducts = validStockData.reduce((sum, m) => sum + m.criticalProducts, 0);
    const averageFillLevel = validStockData.length > 0 
      ? validStockData.reduce((sum, m) => sum + m.totalFillLevel, 0) / validStockData.length 
      : 0;

    const statistics = {
      totalMachines,
      machinesWithData,
      machinesWithoutData: totalMachines - machinesWithData,
      totalCriticalProducts,
      averageFillLevel: Math.round(averageFillLevel * 100),
      dataFreshness: 'database'
    };

    console.log(`[API] ✅ ${validStockData.length} Maschinen abgerufen, ${machinesWithData} mit Bestandsdaten`);

    res.json({
      success: true,
      data: {
        machines: validStockData,
        statistics,
        metadata: {
          totalRequested: totalMachines,
          successfulResponses: machinesWithData,
          failedResponses: totalMachines - machinesWithData,
          lastUpdate: new Date(),
          dataSource: 'database'
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
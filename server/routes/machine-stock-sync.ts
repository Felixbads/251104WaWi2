/**
 * Machine Stock Sync API Routes
 * Bereitstellung von Stock-Synchronisation und Background Service Management
 */

import { Router } from 'express';
import { stockSyncService } from '../services/stockSyncService';

const router = Router();

/**
 * GET /api/machine-stock/sync/status
 * Status der Stock-Synchronisation abrufen
 */
router.get('/sync/status', async (req, res) => {
  try {
    const stats = await stockSyncService.getStockStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        isRunning: stockSyncService['isRunning']
      }
    });
  } catch (error) {
    console.error('[API] Fehler beim Abrufen des Sync-Status:', error);
    res.status(500).json({ 
      error: 'Sync-Status konnte nicht abgerufen werden',
      message: error.message 
    });
  }
});

/**
 * POST /api/machine-stock/sync/start
 * Manuelle Synchronisation aller Maschinen starten
 */
router.post('/sync/start', async (req, res) => {
  try {
    const result = await stockSyncService.syncAllMachineStocks();
    
    res.json({
      success: result.success,
      message: result.message,
      stats: result.stats
    });
  } catch (error) {
    console.error('[API] Fehler beim Starten der Sync:', error);
    res.status(500).json({ 
      error: 'Synchronisation konnte nicht gestartet werden',
      message: error.message 
    });
  }
});

/**
 * POST /api/machine-stock/sync/machine/:vendonId
 * Synchronisation einer einzelnen Maschine
 */
router.post('/sync/machine/:vendonId', async (req, res) => {
  try {
    const vendonId = parseInt(req.params.vendonId);
    
    if (isNaN(vendonId)) {
      return res.status(400).json({ 
        error: 'Ungültige Vendon ID' 
      });
    }

    const result = await stockSyncService.syncSingleMachine(vendonId);
    
    res.json(result);
  } catch (error) {
    console.error('[API] Fehler beim Synchronisieren der Maschine:', error);
    res.status(500).json({ 
      error: 'Maschinen-Synchronisation fehlgeschlagen',
      message: error.message 
    });
  }
});

export default router;
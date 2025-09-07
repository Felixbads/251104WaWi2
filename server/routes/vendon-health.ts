/**
 * Vendon Sync Health Monitoring API
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { VendonSyncHealthMonitor } from '../services/VendonSyncHealthMonitor';
import { EnhancedVendonHistoryImporter } from '../services/EnhancedVendonHistoryImporter';
import { UnifiedVendonSync } from '../services/UnifiedVendonSync';

const router = Router();
let pool: Pool;
let healthMonitor: VendonSyncHealthMonitor;

export function initializeVendonHealthRoutes(dbPool: Pool) {
  pool = dbPool;
  healthMonitor = new VendonSyncHealthMonitor(pool);
  
  // Starte regelmäßige Health Checks (alle 15 Minuten)
  setInterval(async () => {
    try {
      await healthMonitor.performHealthCheck();
    } catch (error) {
      console.error('❌ Health Check fehlgeschlagen:', error);
    }
  }, 15 * 60 * 1000);
}

/**
 * GET /api/vendon-health/status
 * Aktueller Gesundheitsstatus des Vendon Sync Systems
 */
router.get('/status', async (req, res) => {
  try {
    const healthStatus = await healthMonitor.getHealthStatus();
    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen des Health Status:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Gesundheitsstatus',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon-health/dashboard
 * Vollständige Dashboard-Daten für das Frontend
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await healthMonitor.getDashboardData();
    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Dashboard-Daten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Dashboard-Daten',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon-health/statistics
 * Detaillierte Sync-Statistiken
 */
router.get('/statistics', async (req, res) => {
  try {
    const statistics = await healthMonitor.getSyncStatistics();
    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Statistiken:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Statistiken',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon-health/manual-sync
 * Manuell ausgelöste Synchronisation
 */
router.post('/manual-sync', async (req, res) => {
  try {
    const { startDate, endDate, options } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate und endDate sind erforderlich'
      });
    }
    
    console.log(`🔄 Manuelle Synchronisation gestartet: ${startDate} bis ${endDate}`);
    
    const unifiedSync = new UnifiedVendonSync();
    const result = await unifiedSync.syncTransactions({
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    }, options);
    
    res.json({
      success: true,
      data: result,
      message: 'Manuelle Synchronisation abgeschlossen',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler bei manueller Synchronisation:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei manueller Synchronisation',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon-health/historical-import
 * Startet historischen Datenimport
 */
router.post('/historical-import', async (req, res) => {
  try {
    const { startDate, endDate, options } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate und endDate sind erforderlich'
      });
    }
    
    console.log(`📂 Historischer Import gestartet: ${startDate} bis ${endDate}`);
    
    // Starte Import asynchron
    const importer = new EnhancedVendonHistoryImporter(pool);
    
    // Für große Importe: Async ausführen und Import-ID zurückgeben
    const importId = `history_${Date.now()}`;
    
    // Import im Hintergrund starten
    importer.importHistoricalTransactions(
      new Date(startDate),
      new Date(endDate),
      { ...options, enableResumable: true }
    ).then(result => {
      console.log(`✅ Historischer Import ${importId} abgeschlossen:`, result);
    }).catch(error => {
      console.error(`❌ Historischer Import ${importId} fehlgeschlagen:`, error);
    });
    
    res.json({
      success: true,
      data: { importId },
      message: 'Historischer Import gestartet',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Starten des historischen Imports:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Starten des historischen Imports',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon-health/import-status/:importId
 * Status eines laufenden historischen Imports
 */
router.get('/import-status/:importId', async (req, res) => {
  try {
    const { importId } = req.params;
    
    const query = 'SELECT * FROM sync_state WHERE id = $1';
    const result = await pool.query(query, [importId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Import nicht gefunden'
      });
    }
    
    const importState = result.rows[0];
    res.json({
      success: true,
      data: {
        id: importState.id,
        status: importState.status,
        progress: {
          startDate: importState.start_date,
          endDate: importState.end_date,
          currentTimestamp: importState.current_timestamp,
          totalProcessed: importState.total_processed,
          totalSaved: importState.total_saved,
          totalDuplicates: importState.total_duplicates
        },
        lastUpdated: importState.last_updated,
        errors: JSON.parse(importState.errors || '[]')
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Abrufen des Import-Status:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Import-Status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon-health/resume-import/:importId
 * Setzt einen unterbrochenen Import fort
 */
router.post('/resume-import/:importId', async (req, res) => {
  try {
    const { importId } = req.params;
    
    console.log(`🔄 Setze Import fort: ${importId}`);
    
    const importer = new EnhancedVendonHistoryImporter(pool);
    const result = await importer.resumeImport(importId);
    
    res.json({
      success: result.success,
      data: result,
      message: result.message,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Fortsetzen des Imports:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Fortsetzen des Imports',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon-health/run-health-check
 * Führt sofortige Gesundheitsprüfung durch
 */
router.post('/run-health-check', async (req, res) => {
  try {
    console.log('🏥 Manuelle Gesundheitsprüfung gestartet');
    
    await healthMonitor.performHealthCheck();
    const healthStatus = await healthMonitor.getHealthStatus();
    
    res.json({
      success: true,
      data: healthStatus,
      message: 'Gesundheitsprüfung abgeschlossen',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler bei Gesundheitsprüfung:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei Gesundheitsprüfung',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon-health/sync-logs
 * Aktuelle Sync-Logs
 */
router.get('/sync-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const query = `
      SELECT 
        created_at,
        service_type,
        sync_result,
        sync_stats,
        error_message
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit,
        offset,
        total: result.rowCount
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Sync-Logs:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Sync-Logs',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { historicalSyncOptionsSchema } from '@shared/schema';
import { importVendonHistory } from '../services/vendonHistoryImporter';
import { pool } from '../db';

const router = Router();

/**
 * @route POST /api/vendon/historical-import
 * @desc Startet einen historischen Datenimport von Vendon
 * @access Privat (nur Admin)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Request-Body validieren
    const configSchema = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein').optional(),
      batchSize: z.number().int().min(10).max(1000).default(100),
      requestDelay: z.number().int().min(0).max(10000).default(1000),
      maxRetries: z.number().int().min(0).max(10).default(3),
      retryDelay: z.number().int().min(0).max(10000).default(2000),
      saveProgressInterval: z.number().int().min(10).max(1000).default(100),
      // Zusätzliche Parameter für vendonHistoryImporter
      maxTransactions: z.number().int().min(0).max(100000).optional(),
      syncStep: z.number().int().min(1).max(365).optional(),
      forceUpdate: z.boolean().optional()
    });
    
    const validatedConfig = configSchema.parse(req.body);
    
    // Import starten (non-blocking)
    const importPromise = importVendonHistory(pool, validatedConfig);
    
    // Sofort antworten, während der Import asynchron weiterläuft
    res.status(202).json({
      success: true,
      message: 'Historischer Import gestartet',
      config: validatedConfig
    });
    
    // Import im Hintergrund ausführen
    importPromise
      .then(result => {
        console.log('Historischer Import abgeschlossen:', result);
      })
      .catch(error => {
        console.error('Fehler beim historischen Import:', error);
      });
  } catch (error) {
    console.error('Fehler bei der Konfigurationsvalidierung:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Ungültige Konfiguration',
      error: error
    });
  }
});

/**
 * @route GET /api/vendon/historical-import/status
 * @desc Gibt den aktuellen Status des historischen Imports zurück
 * @access Privat (nur Admin)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // SQL-Abfrage für den letzten Sync-Status
    const syncStateQuery = await pool.query(
      `SELECT * FROM sync_state WHERE job_name = 'vendon_history_import' LIMIT 1`
    );
    
    // SQL-Abfrage für den letzten Sync-Log
    const syncLogQuery = await pool.query(
      `SELECT * FROM sync_logs WHERE sync_type = 'vendon_history_import' 
       ORDER BY id DESC LIMIT 1`
    );
    
    const syncState = syncStateQuery.rows[0] || null;
    const syncLog = syncLogQuery.rows[0] || null;
    
    // Aktuelle Statistik aus sync_logs und sync_state zusammenführen
    const status = {
      lastRun: syncLog ? {
        id: syncLog.id,
        status: syncLog.sync_status,
        startDate: syncLog.start_date,
        endDate: syncLog.end_date,
        durationSeconds: syncLog.duration_seconds,
        itemsFound: syncLog.items_found,
        itemsSaved: syncLog.items_saved,
        duplicates: syncLog.duplicates,
        errors: syncLog.errors,
        additionalData: syncLog.additional_data
      } : null,
      cursor: syncState ? {
        lastDate: syncState.last_date,
        lastOffset: syncState.last_offset,
        lastId: syncState.last_id,
        updatedAt: syncState.updated_at
      } : null,
      isRunning: syncLog && syncLog.sync_status === 'running'
    };
    
    res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Sync-Status:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen des Sync-Status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/vendon/historical-import/reset
 * @desc Setzt den Cursor des historischen Imports zurück
 * @access Privat (nur Admin)
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    // Optional: Bestätigung vom Benutzer verlangen
    const configSchema = z.object({
      confirm: z.boolean().refine(val => val === true, {
        message: 'Bestätigung ist erforderlich, um den Import zurückzusetzen'
      }),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein').optional()
    });
    
    const validatedConfig = configSchema.parse(req.body);
    
    // Cursor zurücksetzen
    const startDate = validatedConfig.startDate ? new Date(validatedConfig.startDate) : new Date('2020-01-01');
    
    await pool.query(
      `UPDATE sync_state 
       SET last_date = $1, last_offset = 0, updated_at = $2 
       WHERE job_name = 'vendon_history_import'`,
      [startDate.toISOString(), new Date().toISOString()]
    );
    
    res.status(200).json({
      success: true,
      message: 'Import-Cursor zurückgesetzt',
      newCursor: {
        lastDate: startDate.toISOString(),
        lastOffset: 0
      }
    });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen des Sync-Status:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Zurücksetzen des Sync-Status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
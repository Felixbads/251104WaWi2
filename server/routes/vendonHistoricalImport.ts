import { Router, Request, Response } from 'express';
import pg from 'pg';
import { z } from 'zod';

const { Pool } = pg;
import { importVendonHistory } from '../services/vendonHistoryImporter';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Schema zur Validierung der Anfrage-Parameter
const importRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat. Verwenden Sie YYYY-MM-DD.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat. Verwenden Sie YYYY-MM-DD.').optional(),
  batchSize: z.number().int().min(1).max(100).default(100),
  requestDelay: z.number().int().min(100).max(10000).default(1000),
});

/**
 * GET /api/vendon/sync-state
 * Liefert den aktuellen Sync-Status
 */
router.get('/sync-state', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT job_name, last_date, last_offset, updated_at FROM sync_state WHERE job_name = $1',
      ['vendon_history_import']
    );
    
    if (result.rowCount && result.rowCount > 0) {
      const { job_name, last_date, last_offset, updated_at } = result.rows[0];
      return res.json({
        status: 'success',
        jobName: job_name,
        lastDate: last_date,
        lastOffset: last_offset,
        updatedAt: updated_at
      });
    } else {
      return res.json({
        status: 'not_started',
        message: 'Historischer Import wurde noch nicht gestartet.'
      });
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Sync-Status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen des Sync-Status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon/reset-sync-state
 * Setzt den Sync-Status zurück
 */
router.post('/reset-sync-state', async (req: Request, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM sync_state WHERE job_name = $1',
      ['vendon_history_import']
    );
    
    return res.json({
      status: 'success',
      message: 'Sync-Status erfolgreich zurückgesetzt.'
    });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen des Sync-Status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler beim Zurücksetzen des Sync-Status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/vendon/historical-import
 * Startet einen historischen Import mit den angegebenen Parametern
 */
router.post('/historical-import', async (req: Request, res: Response) => {
  try {
    // Validiere die Anfrage-Parameter
    const validation = importRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Ungültige Anfrage-Parameter',
        errors: validation.error.format()
      });
    }
    
    // Extrahiere die validierten Parameter
    const { startDate, endDate, batchSize, requestDelay } = validation.data;
    
    console.log(`Starte historischen Import mit Parametern:`, {
      startDate,
      endDate,
      batchSize,
      requestDelay
    });
    
    // Konfiguration für den Importer
    const config = {
      startDate,
      endDate,
      batchSize,
      requestDelay,
      maxRetries: 3,
      retryDelay: 5000,
      saveProgressInterval: 1
    };
    
    // Starte den Import
    const result = await importVendonHistory(pool, config);
    
    // Sende Ergebnis zurück
    return res.json({
      status: 'success',
      message: 'Historischer Import abgeschlossen',
      daysProcessed: result.summary.daysProcessed,
      total: result.summary.totalItems,
      saved: result.summary.savedItems,
      duplicates: result.summary.duplicateItems,
      errors: result.summary.errorItems,
      duration: result.summary.durationSeconds
    });
  } catch (error) {
    console.error('Fehler beim Starten des historischen Imports:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler beim Starten des historischen Imports',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon/import/recent-transactions
 * Liefert die zuletzt importierten Transaktionen
 */
router.get('/import/recent-transactions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await pool.query(
      `SELECT id, vendon_id, datetime, machine_id, machine_name, 
              product_id, product_name, quantity, price, source, created_at
       FROM transactions 
       ORDER BY created_at DESC, id DESC 
       LIMIT $1`,
      [limit]
    );
    
    return res.json({
      status: 'success',
      transactions: result.rows
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der letzten Transaktionen:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen der letzten Transaktionen',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/transactions/stats
 * Liefert Statistiken über die Transaktionen
 */
router.get('/transactions/stats', async (req: Request, res: Response) => {
  try {
    // Gesamtanzahl der Transaktionen
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM transactions');
    const total = parseInt(totalResult.rows[0].total) || 0;
    
    // Anzahl der Transaktionen pro Quelle
    const sourcesResult = await pool.query(`
      SELECT source, COUNT(*) as count 
      FROM transactions 
      GROUP BY source
    `);
    
    let historyImport = 0;
    let liveImport = 0;
    
    sourcesResult.rows.forEach((row) => {
      if (row.source === 'history-import') {
        historyImport = parseInt(row.count);
      } else {
        liveImport += parseInt(row.count);
      }
    });
    
    // Durchschnittspreis
    const avgPriceResult = await pool.query('SELECT AVG(price) as avg_price FROM transactions');
    const avgPrice = avgPriceResult.rows[0].avg_price || 0;
    
    return res.json({
      status: 'success',
      total,
      historyImport,
      liveImport,
      avgPrice
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Transaktionsstatistiken:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen der Transaktionsstatistiken',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
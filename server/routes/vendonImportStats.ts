/**
 * Vendon Import-Statistik-Routen
 * 
 * Diese Routen bieten detaillierte Informationen über den Fortschritt 
 * und Status des Vendon-Transaktionen-Imports.
 */

import { Router, Request, Response } from 'express';
import { db, rawDb } from '../db';
import { format, parseISO, subDays } from 'date-fns';
import { transactions } from '@shared/schema';

const router = Router();

/**
 * GET /api/vendon/import/stats
 * 
 * Liefert umfassende Statistiken über den Vendon-Import
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Allgemeine Import-Statistiken
    const generalStats = await getGeneralImportStats();
    
    // Sync-State (aktueller Import-Fortschritt)
    const syncState = await getSyncState();
    
    // Detaillierte Transaktionsstatistiken 
    const transactionStats = await getTransactionStats();
    
    // Verfügbarkeit nach Zeitraum
    const timeRangeStats = await getTimeRangeStats();
    
    // Letzte Sync-Logs abrufen
    const recentSyncLogs = await getRecentSyncLogs();
    
    // Gesamt-Statistik zusammenstellen
    const stats = {
      general: generalStats,
      syncState,
      transactions: transactionStats,
      timeRanges: timeRangeStats,
      recentLogs: recentSyncLogs
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Vendon-Import-Statistiken:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Statistiken',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon/import/date-stats
 * 
 * Liefert tagesbasierte Transaktionszahlen für eine Zeitreihenansicht
 */
router.get('/date-stats', async (req: Request, res: Response) => {
  try {
    // Parameter für den Zeitraum
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : subDays(new Date(), 365); // Default: 1 Jahr zurück
      
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();
    
    // SQL für tägliche Transaktionszahlen
    const query = `
      SELECT 
        DATE(datetime) AS day,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE datetime BETWEEN $1 AND $2
      GROUP BY day
      ORDER BY day
    `;
    
    const result = await rawDb.query(query, [startDate, endDate]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der täglichen Transaktionsstatistiken:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Statistiken',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon/import/gap-check
 * 
 * Prüft auf Datumslücken in den importierten Transaktionen
 */
router.get('/gap-check', async (req: Request, res: Response) => {
  try {
    // Parameter für den Zeitraum
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date('2015-01-01'); // Default: ab 2015
      
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();
    
    // SQL für Datumslücken
    const query = `
      WITH days AS (
        SELECT generate_series($1::date, $2::date, interval '1 day') AS day
      )
      SELECT 
        days.day::date,
        COALESCE(COUNT(t.id), 0) AS transaction_count
      FROM days
      LEFT JOIN transactions t ON DATE(t.datetime) = days.day
      GROUP BY days.day
      ORDER BY days.day
    `;
    
    const result = await rawDb.query(query, [startDate, endDate]);
    
    // Tage ohne Transaktionen herausfiltern
    const gaps = result.rows
      .filter(row => parseInt(row.transaction_count) === 0)
      .map(row => ({
        date: format(row.day, 'yyyy-MM-dd'),
        transactionCount: 0
      }));
      
    // Tage mit wenigen Transaktionen (< 10) markieren
    const lowActivityDays = result.rows
      .filter(row => parseInt(row.transaction_count) > 0 && parseInt(row.transaction_count) < 10)
      .map(row => ({
        date: format(row.day, 'yyyy-MM-dd'),
        transactionCount: parseInt(row.transaction_count)
      }));
    
    res.json({
      success: true,
      totalDays: result.rows.length,
      gaps: {
        count: gaps.length,
        list: gaps
      },
      lowActivity: {
        count: lowActivityDays.length,
        list: lowActivityDays
      }
    });
  } catch (error) {
    console.error('Fehler beim Prüfen auf Datumslücken:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Prüfen auf Datumslücken',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon/import/recent-transactions
 * 
 * Liefert die zuletzt importierten Transaktionen für Echtzeit-Monitoring
 */
router.get('/recent-transactions', async (req: Request, res: Response) => {
  try {
    // Anzahl der zurückzugebenden Transaktionen (Default: 50)
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Nur "history-import" Transaktionen, wenn requested
    const sourceFilter = req.query.source === 'history' ? "AND source = 'history-import'" : "";
    
    // SQL für die letzten Transaktionen
    const query = `
      SELECT 
        id,
        vendon_id,
        machine_id,
        machine_name,
        product_id,
        name as product_name,
        datetime,
        price,
        payment_method,
        source,
        created_at
      FROM transactions
      WHERE 1=1 ${sourceFilter}
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const result = await rawDb.query(query, [limit]);
    
    res.json({
      success: true,
      count: result.rows.length,
      transactions: result.rows.map(tx => ({
        id: tx.id,
        vendonId: tx.vendon_id,
        machineId: tx.machine_id,
        machineName: tx.machine_name,
        productId: tx.product_id,
        productName: tx.product_name,
        datetime: tx.datetime,
        price: parseFloat(tx.price),
        paymentMethod: tx.payment_method,
        source: tx.source,
        createdAt: tx.created_at
      }))
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der letzten Transaktionen:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der letzten Transaktionen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Hilfsfunktion: Ruft allgemeine Import-Statistiken ab
 */
async function getGeneralImportStats() {
  const query = `
    SELECT 
      COUNT(*) AS total_transactions,
      MIN(datetime) AS earliest_transaction,
      MAX(datetime) AS latest_transaction,
      COUNT(DISTINCT DATE(datetime)) AS days_with_data,
      COUNT(DISTINCT machine_id) AS unique_machines,
      COUNT(DISTINCT product_id) AS unique_products
    FROM transactions
  `;
  
  const result = await rawDb.query(query);
  
  return result.rows[0] || {
    total_transactions: 0,
    earliest_transaction: null,
    latest_transaction: null,
    days_with_data: 0,
    unique_machines: 0,
    unique_products: 0
  };
}

/**
 * Hilfsfunktion: Ruft den aktuellen Sync-State ab
 */
async function getSyncState() {
  const query = `
    SELECT job_name, last_date, last_offset, updated_at
    FROM sync_state
    WHERE job_name = 'vendon_history_import'
  `;
  
  const result = await rawDb.query(query);
  
  if (result.rowCount === 0) {
    return {
      status: 'not_started',
      lastDate: null,
      lastOffset: 0,
      updatedAt: null
    };
  }
  
  const row = result.rows[0];
  
  return {
    status: 'in_progress',
    lastDate: row.last_date,
    lastOffset: row.last_offset,
    updatedAt: row.updated_at
  };
}

/**
 * Hilfsfunktion: Ruft Transaktionsstatistiken ab
 */
async function getTransactionStats() {
  const query = `
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN source = 'history-import' THEN 1 ELSE 0 END) AS history_import,
      SUM(CASE WHEN source != 'history-import' THEN 1 ELSE 0 END) AS live_import,
      AVG(price) AS avg_price,
      SUM(CASE WHEN datetime >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) AS last_24h,
      SUM(CASE WHEN datetime >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS last_7days,
      SUM(CASE WHEN datetime >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS last_30days
    FROM transactions
  `;
  
  const result = await rawDb.query(query);
  
  return result.rows[0] || {
    total: 0,
    history_import: 0,
    live_import: 0,
    avg_price: 0,
    last_24h: 0,
    last_7days: 0,
    last_30days: 0
  };
}

/**
 * Hilfsfunktion: Ruft Statistiken nach Zeitraum ab
 */
async function getTimeRangeStats() {
  const query = `
    SELECT 
      EXTRACT(YEAR FROM datetime) AS year,
      COUNT(*) AS count
    FROM transactions
    GROUP BY year
    ORDER BY year
  `;
  
  const result = await rawDb.query(query);
  
  return result.rows.map(row => ({
    year: row.year,
    count: parseInt(row.count)
  }));
}

/**
 * Hilfsfunktion: Ruft die letzten Sync-Logs ab
 */
async function getRecentSyncLogs() {
  const query = `
    SELECT 
      id, 
      sync_type, 
      start_date, 
      end_date, 
      items_found, 
      items_saved, 
      duplicates, 
      errors, 
      duration_seconds, 
      sync_status, 
      created_at
    FROM sync_logs
    WHERE sync_type LIKE 'vendon%'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  
  const result = await rawDb.query(query);
  
  return result.rows;
}

/**
 * GET /api/transactions/stats - Simple transaction statistics for VendonSyncDashboard
 */
router.get('/transaction-stats', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN source = 'history-import' THEN 1 END) as history_import,
        COUNT(CASE WHEN source = 'live-import' THEN 1 END) as live_import,
        AVG(price::numeric) as avg_price
      FROM transactions
    `;
    
    const result = await rawDb.query(query);
    const stats = result.rows[0];
    
    res.json({
      status: 'success',
      total: parseInt(stats.total) || 0,
      historyImport: parseInt(stats.history_import) || 0,
      liveImport: parseInt(stats.live_import) || 0,
      avgPrice: parseFloat(stats.avg_price) || 0.0
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Transaktionsstatistiken:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen der Statistiken',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/vendon/sync-state - Sync state for VendonSyncDashboard
 */
router.get('/sync-state', async (req: Request, res: Response) => {
  try {
    // Hole den letzten Sync-Log Eintrag
    const syncLogQuery = `
      SELECT 
        operation_type as job_name,
        updated_at,
        status,
        details
      FROM sync_logs 
      WHERE operation_type LIKE '%vendon%'
      ORDER BY updated_at DESC 
      LIMIT 1
    `;
    
    const syncLogResult = await rawDb.query(syncLogQuery);
    
    let syncState = {
      status: 'idle',
      jobName: 'vendon-sync',
      lastDate: null as string | null,
      lastOffset: 0,
      updatedAt: null as string | null,
      message: 'Kein Sync-Status verfügbar'
    };
    
    if (syncLogResult.rows.length > 0) {
      const log = syncLogResult.rows[0];
      syncState = {
        status: log.status === 'SUCCESS' ? 'completed' : (log.status === 'ERROR' ? 'error' : 'in_progress'),
        jobName: log.job_name || 'vendon-sync',
        lastDate: log.updated_at,
        lastOffset: 0,
        updatedAt: log.updated_at,
        message: log.details || 'Sync erfolgreich'
      };
    }
    
    res.json(syncState);
  } catch (error) {
    console.error('Fehler beim Abrufen des Sync-Status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen des Sync-Status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
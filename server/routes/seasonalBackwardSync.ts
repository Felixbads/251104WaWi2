/**
 * Seasonal Backward Sync API Routes
 * Phase 2: Saisonale Datenanreicherung für historische Vendon-Synchronisation
 */

import { Router } from 'express';
import { HistoricalBackwardSync } from '../services/historicalBackwardSyncFixed.js';
import { pool } from '../db.js';

const router = Router();

/**
 * POST /api/seasonal-backward-sync/start
 * Startet die historische Rückwärts-Synchronisation mit saisonaler Anreicherung
 */
router.post('/start', async (req, res) => {
  try {
    const config = {
      targetStartYear: req.body.targetStartYear || 2024, // Start mit 2024 für Test
      batchSize: req.body.batchSize || 50,
      requestDelay: req.body.requestDelay || 2000,
      retryDelay: req.body.retryDelay || 5000,
      maxRetries: req.body.maxRetries || 3,
      enableSeasonalEnrichment: true, // Immer aktiviert für saisonale Anreicherung
      adaptiveTimeWindows: req.body.adaptiveTimeWindows !== false,
      logLevel: req.body.logLevel || 'detailed'
    };

    console.log('🌟 Starting Seasonal Backward Sync with config:', config);

    const backwardSync = new HistoricalBackwardSync(config);
    
    // Starte Synchronisation asynchron
    backwardSync.startBackwardSync().catch((error: any) => {
      console.error('❌ Seasonal Backward Sync Error:', error);
    });

    res.json({
      success: true,
      message: 'Seasonal Backward Sync gestartet',
      config,
      status: 'running'
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/seasonal-backward-sync/status
 * Gibt den aktuellen Status der Synchronisation zurück
 */
router.get('/status', async (req, res) => {
  try {
    // Für jetzt gibt es keinen globalen Status-Manager
    // In einer vollständigen Implementierung würde hier ein Singleton-Manager verwendet
    res.json({
      success: true,
      status: 'ready',
      message: 'Seasonal Backward Sync bereit',
      features: {
        seasonal_enrichment: true,
        adaptive_time_windows: true,
        holiday_detection: true,
        weather_integration: 'planned',
        vacation_detection: 'basic'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Status-Fehler'
    });
  }
});

/**
 * POST /api/seasonal-backward-sync/test
 * Testet die saisonale Anreicherung mit einem Beispiel-Datum
 */
router.post('/test', async (req, res) => {
  try {
    const testDate = req.body.date ? new Date(req.body.date) : new Date('2024-07-15T14:30:00Z');
    
    // Manuelle saisonale Berechnungen für Test
    const seasonalData = {
      test_date: testDate.toISOString(),
      week_of_year: getWeekOfYear(testDate),
      day_of_year: getDayOfYear(testDate),
      month_of_year: testDate.getMonth() + 1,
      quarter_of_year: Math.ceil((testDate.getMonth() + 1) / 3),
      weekday_number: getWeekdayNumber(testDate),
      season: getSeason(testDate),
      is_holiday: false, // Würde aus Datenbank abgefragt
      is_vacation: false, // Würde aus Datenbank abgefragt  
      tourist_season: isTouristSeason(testDate),
      school_in_session: true, // Inverses von is_vacation
      seasonal_enrichment_source: 'api_test',
      seasonal_enrichment_date: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Saisonale Anreicherung erfolgreich getestet',
      seasonal_data: seasonalData,
      calculations: {
        week_calculation: `Week ${seasonalData.week_of_year} of ${testDate.getFullYear()}`,
        season_calculation: `${seasonalData.season} (month ${seasonalData.month_of_year})`,
        weekday_calculation: `Weekday ${seasonalData.weekday_number} (1=Mon, 7=Sun)`,
        tourist_calculation: seasonalData.tourist_season ? 'In tourist season (May-Oct)' : 'Outside tourist season'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test-Fehler'
    });
  }
});

/**
 * GET /api/seasonal-backward-sync/schema
 * Überprüft das Datenbank-Schema für saisonale Felder
 */
router.get('/schema', async (req, res) => {
  try {
    
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      AND column_name IN (
        'week_of_year', 'day_of_year', 'month_of_year', 'quarter_of_year', 
        'weekday_number', 'season', 'is_holiday', 'is_vacation', 
        'tourist_season', 'school_in_session', 'seasonal_enrichment_source',
        'seasonal_enrichment_date'
      )
      ORDER BY column_name
    `);

    const readinessScore = schemaResult.rows.length / 12 * 100; // 12 erwartete Felder

    res.json({
      success: true,
      schema_status: readinessScore >= 100 ? 'complete' : 'incomplete',
      readiness_score: `${readinessScore.toFixed(1)}%`,
      seasonal_fields: schemaResult.rows,
      total_fields: schemaResult.rows.length,
      expected_fields: 12,
      ready_for_sync: readinessScore >= 100
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Schema-Fehler'
    });
  }
});

// Hilfsfunktionen für saisonale Berechnungen
function getWeekOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function getWeekdayNumber(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day; // Convert Sunday from 0 to 7
}

function getSeason(date: Date): string {
  const month = date.getMonth() + 1;
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'autumn';
}

function isTouristSeason(date: Date): boolean {
  const month = date.getMonth() + 1;
  return month >= 5 && month <= 10;
}

export default router;
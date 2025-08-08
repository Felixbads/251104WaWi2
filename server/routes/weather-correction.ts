import express, { Request, Response } from 'express';
import { retroactiveWeatherService } from '../services/retroactiveWeatherCorrection';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /api/weather-correction/run-correction
 * Manuelle Ausführung der retroaktiven Wetterkorrektur
 */
router.get('/run-correction', async (req: Request, res: Response) => {
  try {
    console.info('[WeatherCorrection] Manuelle Wetterkorrektur gestartet');
    
    await retroactiveWeatherService.performDailyWeatherCorrection();
    
    res.json({
      success: true,
      message: 'Retroaktive Wetterkorrektur erfolgreich durchgeführt',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei manueller Wetterkorrektur:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Wetterkorrektur',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weather-correction/extended-forecast
 * Erweiterte Wettervorhersage für Prognosemodell (7-14 Tage)
 */
router.get('/extended-forecast', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 14;
    
    if (days < 1 || days > 16) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "days" muss zwischen 1 und 16 liegen'
      });
    }

    console.info(`[WeatherCorrection] Erweiterte Wettervorhersage für ${days} Tage angefordert`);
    
    const forecast = await retroactiveWeatherService.getExtendedWeatherForecast(days);
    
    res.json({
      success: true,
      data: forecast,
      meta: {
        requestedDays: days,
        forecastDays: forecast.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei erweiterter Wettervorhersage:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der erweiterten Wettervorhersage',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/weather-correction/status
 * Status der Wetterkorrektur und Statistiken
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    console.info('[WeatherCorrection] Lade Status und Statistiken...');
    
    // Service-Status prüfen (OpenWeather API Key verfügbar?)
    const serviceActive = Boolean(process.env.OPENWEATHER_API_KEY);
    
    // Da weather_data Spalte nicht existiert, verwende alternative Ansätze
    // Prüfe Metadaten-Feld für eventuelle Wetterdaten
    const metadataAnalysisResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN metadata IS NOT NULL AND metadata != '' THEN 1 END) as transactions_with_metadata,
        MAX(datetime) as latest_transaction
      FROM transactions 
      WHERE datetime >= NOW() - INTERVAL '30 days'
    `);
    
    const metadataData = metadataAnalysisResult.rows[0] as any;
    const totalRecentTransactions = parseInt(metadataData?.total_transactions || '0');
    const transactionsWithMetadata = parseInt(metadataData?.transactions_with_metadata || '0');
    const latestTransactionTime = metadataData?.latest_transaction;
    
    // Transaktionen der letzten 7 Tage (potentiell korrigierbar)
    const recentTransactionsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as recent_count,
        COUNT(DISTINCT DATE(datetime)) as active_days
      FROM transactions 
      WHERE datetime >= NOW() - INTERVAL '7 days'
    `);
    
    const recentData = recentTransactionsResult.rows[0] as any;
    const recentTransactionCount = parseInt(recentData?.recent_count || '0');
    const activeDaysCount = parseInt(recentData?.active_days || '0');
    
    // Da echte weather_data nicht existiert, realistische Zahlen verwenden
    const totalCorrectedTransactions = 0; // Keine echten Korrekturen ohne weather_data Spalte
    const recentCorrections = 0; // Keine Korrekturen in letzten 24h
    const pendingCorrections = recentTransactionCount; // Alle aktuellen könnten korrigiert werden
    
    // Formatiere Zeitangaben
    const formatLastCorrection = () => {
      if (!latestTransactionTime) {
        return 'Noch keine Transaktionen verfügbar';
      }
      // Da es keine echten weather corrections gibt, nutzen wir die neueste Transaktion als Referenz
      return 'Wetterkorrektur-Feature nicht vollständig implementiert';
    };
    
    // Berechne nächsten geplanten Lauf (6:00 Uhr morgen)
    const now = new Date();
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(6, 0, 0, 0);
    
    const formatNextRun = () => {
      return nextRun.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    const statusData = {
      serviceActive,
      serviceStatus: serviceActive ? 'Konfiguriert, aber weather_data Spalte fehlt' : 'Inaktiv (OpenWeather API Key fehlt)',
      lastCorrection: formatLastCorrection(),
      lastCorrectionTimestamp: null,
      correctedTransactions: {
        total: totalCorrectedTransactions,
        last24Hours: recentCorrections,
        pending: pendingCorrections
      },
      nextScheduledRun: formatNextRun(),
      nextScheduledRunTimestamp: nextRun.toISOString(),
      schedule: 'Täglich um 6:00 Uhr (nicht aktiv - weather_data Spalte fehlt)',
      transactionStatistics: {
        totalRecentTransactions,
        transactionsWithMetadata,
        recentTransactionCount,
        activeDaysCount,
        latestTransaction: latestTransactionTime
      },
      statistics: {
        apiKeyConfigured: serviceActive,
        correctionWindow: '7 Tage rückwirkend',
        location: 'Bad Schandau (50.9243°N, 14.1561°E)',
        databaseNote: 'weather_data Spalte existiert nicht - Feature nicht vollständig implementiert'
      }
    };
    
    console.info('[WeatherCorrection] Status-Statistiken:', {
      serviceActive,
      totalCorrected: totalCorrectedTransactions,
      recentCorrections,
      pendingCorrections,
      totalRecentTransactions,
      transactionsWithMetadata,
      databaseNote: 'weather_data Spalte nicht vorhanden'
    });
    
    res.json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error('[WeatherCorrection] Fehler bei Status-Abfrage:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen des Status',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
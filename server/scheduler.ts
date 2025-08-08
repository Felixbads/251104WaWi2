/**
 * Automatischer Synchronisierungs-Planer
 * Dieser Service führt regelmäßige Synchronisierungen mit verschiedenen APIs durch:
 * - Vendon API für Automaten und Transaktionsdaten
 * - OpenWeatherMap API für Wetterprognosen
 * - Feiertags-API für Feiertage und Schulferien
 */

import { vendonSync } from './services/vendonSync';
import { syncWeatherForecast, syncHistoricalWeatherBatch } from './services/openWeatherService';
import { syncMissingHolidays } from './services/holidayService';
import { reconcileWarehouseProducts } from './services/warehouseReconciliation';
import { productSyncService } from './services/productSyncService'; // Neuer verbesserter Product-Sync-Service
import { trainForecastModel, createForecast } from './services/forecastService';

// Speichern der Timeout-IDs zur späteren Verwaltung
const timers: Record<string, NodeJS.Timeout> = {};

// Konfiguration für verschiedene Syncs
const syncConfig = {
  immediate: {
    interval: 30 * 60 * 1000, // 30 Minuten (deutlich erhöht für bessere Performance)
    syncTypes: ['transactions'] // Batch-optimierte Transaktions-Synchronisation
  },
  fast: {
    interval: 60 * 60 * 1000, // 60 Minuten (erhöht von 30 Minuten)
    syncTypes: ['refills'] // Schnelle Sync-Typen
  },
  medium: {
    interval: 2 * 60 * 60 * 1000, // 2 Stunden (erhöht von 1 Stunde)
    syncTypes: ['machines', 'products', 'events', 'weather_forecast'] // Mittelschnelle Sync-Typen - 'weather_historical_batch' entfernt, um Überlastung zu vermeiden
  },
  forecast: {
    interval: 12 * 60 * 60 * 1000, // 12 Stunden für Prognose-Training
    syncTypes: ['forecast_training', 'forecast_generation'] // Automatisches Modelltraining und Prognoseerstellung
  },
  slow: {
    interval: 24 * 60 * 60 * 1000, // 24 Stunden
    syncTypes: ['weather_historical_batch', 'warehouse_reconciliation'] // Feiertags-Sync vorübergehend deaktiviert
  },
  historical: {
    interval: 6 * 60 * 60 * 1000, // 6 Stunden (erhöht von 2 Stunden)
    syncTypes: ['historical_batch'] // Historische Daten schrittweise synchronisieren
  }
};

/**
 * Führt eine Synchronisation aus und plant die nächste
 * @param syncType - Der Typ der Synchronisation ('transactions', 'machines', etc.)
 */
async function performSync(syncType: string): Promise<void> {
  console.log(`Geplante Synchronisierung gestartet für: ${syncType}`);
  
  try {
    let result;
    switch (syncType) {
      case 'transactions':
        // Synchronisiere Transaktionen der letzten 24 Stunden
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        result = await vendonSync.syncTransactions(yesterday);
        break;
      case 'refills':
        // Synchronisiere Refills der letzten 24 Stunden
        const yesterdayRefills = new Date();
        yesterdayRefills.setDate(yesterdayRefills.getDate() - 1);
        result = await vendonSync.syncRefills(yesterdayRefills);
        break;
      case 'machines':
        result = await vendonSync.syncMachines();
        break;
      case 'products':
        // Verwende den neuen verbesserten ProductSyncService
        result = await productSyncService.syncProducts(false);
        console.log("Verbesserte Produktsynchronisierung mit direktem API-Zugriff abgeschlossen.");
        break;
      case 'events':
        // Synchronisiere Events der letzten 24 Stunden
        const yesterdayEvents = new Date();
        yesterdayEvents.setDate(yesterdayEvents.getDate() - 1);
        result = await vendonSync.syncEvents(yesterdayEvents);
        break;
      case 'historical_batch':
        // Führe einen Batch der historischen Synchronisierung durch
        result = await vendonSync.syncHistoricalBatch();
        // Wenn der historische Prozess abgeschlossen ist, stoppe die historische Synchronisierung
        if (result && result.isComplete) {
          console.log("Historische Synchronisierung vollständig abgeschlossen. Entferne aus der Scheduler-Liste.");
          delete timers[syncType];
          return; // Keine weitere Planung
        }
        break;
      case 'weather_forecast':
        // Synchronisiere Wetterprognosen für Bad Schandau (50.9196, 14.1524)
        result = await syncWeatherForecast(50.9196, 14.1524);
        break;
      case 'weather_historical_batch':
        // Synchronisiere historische Wetterdaten ab 01.01.2023 in Batches
        // Nutze die neue Batch-Funktion für effiziente Synchronisierung
        result = await syncHistoricalWeatherBatch('2023-01-01', new Date(), 7);
        // Wenn alle historischen Daten synchronisiert wurden, entferne aus dem Scheduler
        if (result && result.isComplete) {
          console.log("[OpenWeather] Historische Wetterdatensynchronisierung abgeschlossen. Entferne aus dem Scheduler.");
          delete timers[syncType];
          return; // Keine weitere Planung
        }
        break;
      case 'holidays':
        // Synchronisiere fehlende Feiertage für die nächsten 2 Jahre
        const currentYear = new Date().getFullYear();
        result = await syncMissingHolidays(currentYear, currentYear + 1, undefined, true);
        break;
      case 'warehouse_reconciliation':
        // Führe täglichen Lagerabgleich durch, um neue Produkte in Automaten zu erkennen
        console.log('Starte täglichen Lagerabgleich für alle Automaten-Lager-Kombinationen (NUR Automatenprodukte)...');
        result = await reconcileWarehouseProducts(undefined, false, true);
        console.log(`Täglicher Lagerabgleich abgeschlossen: ${result.productsAdded} neue Produkte zu ${result.warehousesChecked} Lagern hinzugefügt.`);
        break;
      case 'vendon_gap_check':
        // Führe Vendon-Datenlücken-Analyse durch
        console.log('🔍 Starte automatische Vendon-Datenlücken-Prüfung...');
        try {
          // Analysiere die letzten 14 Tage
          const gapAnalysis = await vendonSync.analyzeDataGaps(
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 Tage zurück
            new Date(),
            {
              minDailyTransactions: 30, // Niedrigere Schwelle für automatische Checks
              criticalGapDays: 2, // 2+ aufeinanderfolgende Tage = kritisch
              warningGapDays: 1   // 1+ Tag = Warnung
            }
          );
          
          console.log(`📊 Gap-Analyse abgeschlossen: ${gapAnalysis.summary.missingDays} fehlende, ${gapAnalysis.summary.incompleteDays} unvollständige Tage`);
          
          // Führe automatisches Backfill nur für kritische Lücken durch
          if (gapAnalysis.summary.criticalGaps > 0) {
            console.log(`🚨 ${gapAnalysis.summary.criticalGaps} kritische Lücken erkannt - starte automatisches Backfill...`);
            
            const backfillResult = await vendonSync.performAutomaticBackfill(gapAnalysis, {
              priority: 'critical',
              dryRun: false, // Echtes Backfill für kritische Lücken
              maxDaysPerOperation: 5
            });
            
            console.log(`✅ Automatisches Backfill abgeschlossen: ${backfillResult.summary.successful}/${backfillResult.summary.totalOperations} Operationen erfolgreich`);
            
            result = {
              success: true,
              gapAnalysis,
              backfillResult,
              message: `Gap-Check abgeschlossen: ${gapAnalysis.summary.criticalGaps} kritische Lücken, ${backfillResult.summary.transactionsSynced} Transaktionen nachgefüllt`
            };
          } else if (gapAnalysis.summary.warningGaps > 0) {
            console.log(`⚠️ ${gapAnalysis.summary.warningGaps} Warnungs-Lücken gefunden - protokolliert für manuelle Überprüfung`);
            
            result = {
              success: true,
              gapAnalysis,
              message: `Gap-Check abgeschlossen: ${gapAnalysis.summary.warningGaps} Warnungs-Lücken gefunden, keine kritischen Lücken`
            };
          } else {
            console.log('✅ Keine Datenlücken gefunden - Datenqualität ist gut');
            
            result = {
              success: true,
              gapAnalysis,
              message: 'Gap-Check abgeschlossen: Keine Datenlücken gefunden'
            };
          }
        } catch (error) {
          console.error('❌ Fehler bei der Datenlücken-Prüfung:', error);
          result = {
            success: false,
            message: `Fehler bei der Datenlücken-Prüfung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
          };
        }
        break;
      case 'forecast_training':
        // Automatisches Training von Prognosemodellen mit neuen Daten
        console.log('Starte automatisches Training der Prognosemodelle...');
        // Trainiere alle aktiven Modelle mit Daten der letzten 30 Tage
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // Hole alle aktiven Modelle
        const { db } = await import('./db');
        const { forecastModels } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        
        const activeModels = await db.select().from(forecastModels)
          .where(eq(forecastModels.status, 'ready'));
        
        let trainedModels = 0;
        for (const model of activeModels) {
          try {
            const trainingResult = await trainForecastModel(
              model.id,
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0]
            );
            if (trainingResult.success) {
              trainedModels++;
              console.log(`Modell ${model.name} erfolgreich neu trainiert`);
            }
          } catch (error) {
            console.error(`Fehler beim Training von Modell ${model.name}:`, error);
          }
        }
        
        result = { success: true, modelsRetrained: trainedModels };
        console.log(`Automatisches Training abgeschlossen: ${trainedModels} Modelle neu trainiert`);
        break;
      case 'forecast_generation':
        // Automatische Generierung neuer Prognosen für die nächsten 7 Tage
        console.log('Starte automatische Prognoseerstellung...');
        const forecastStartDate = new Date();
        const forecastEndDate = new Date(forecastStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        // Hole alle bereiten Modelle erneut
        const readyModels = await db.select().from(forecastModels)
          .where(eq(forecastModels.status, 'ready'));
        
        let generatedForecasts = 0;
        for (const model of readyModels) {
          try {
            const forecastResult = await createForecast(
              model.id,
              forecastStartDate.toISOString().split('T')[0],
              forecastEndDate.toISOString().split('T')[0]
            );
            if (forecastResult.success) {
              generatedForecasts++;
              console.log(`Prognose für Modell ${model.name} erfolgreich erstellt`);
            }
          } catch (error) {
            console.error(`Fehler bei Prognoseerstellung für Modell ${model.name}:`, error);
          }
        }
        
        result = { success: true, forecastsGenerated: generatedForecasts };
        console.log(`Automatische Prognoseerstellung abgeschlossen: ${generatedForecasts} Prognosen erstellt`);
        break;
      case 'all':
        result = await vendonSync.syncAll();
        // Auch Wetter, Feiertage und Produkte synchronisieren
        await syncWeatherForecast(50.9196, 14.1524);
        await productSyncService.syncProducts(false);
        const currentYearForAll = new Date().getFullYear();
        await syncMissingHolidays(currentYearForAll, currentYearForAll + 1, undefined, true);
        break;
      default:
        console.error(`Unbekannter Sync-Typ: ${syncType}`);
        return;
    }
    
    // Da verschiedene Sync-Operationen unterschiedliche Rückgabestrukturen haben
    const statusText = result && typeof result === 'object' && 'status' in result 
      ? result.status 
      : 'completed';
    console.log(`Geplante Synchronisierung abgeschlossen für ${syncType}: ${statusText}`);
  } catch (error) {
    console.error(`Fehler bei geplanter Synchronisierung für ${syncType}:`, error);
  }
  
  // Plane die nächste Synchronisierung
  scheduleNextSync(syncType);
}

/**
 * Plant die nächste Synchronisierung für einen bestimmten Typ
 * @param syncType - Der Typ der Synchronisation
 */
function scheduleNextSync(syncType: string): void {
  // Bestimme das Intervall für den Sync-Typ
  let interval = 0;
  
  // Finde das passende Intervall für den Sync-Typ
  if (syncConfig.immediate.syncTypes.includes(syncType)) {
    interval = syncConfig.immediate.interval;
  } else if (syncConfig.fast.syncTypes.includes(syncType)) {
    interval = syncConfig.fast.interval;
  } else if (syncConfig.medium.syncTypes.includes(syncType)) {
    interval = syncConfig.medium.interval;
  } else if (syncConfig.slow.syncTypes.includes(syncType)) {
    interval = syncConfig.slow.interval;
  } else if (syncConfig.forecast.syncTypes.includes(syncType)) {
    interval = syncConfig.forecast.interval;
  } else if (syncConfig.historical.syncTypes.includes(syncType)) {
    interval = syncConfig.historical.interval;
  } else {
    // Fallback auf 1 Stunde
    interval = syncConfig.medium.interval;
  }
  
  // Lösche alten Timer, wenn vorhanden
  if (timers[syncType]) {
    clearTimeout(timers[syncType]);
  }
  
  // Setze neuen Timer
  console.log(`Plane nächste ${syncType}-Synchronisierung in ${interval / 60000} Minuten`);
  timers[syncType] = setTimeout(() => performSync(syncType), interval);
}

/**
 * Startet die automatische Synchronisierung
 */
export function startAutomaticSync(): void {
  console.log('Starte automatische Synchronisierung...');
  
  // Starte sofortige Synchronisierungen
  syncConfig.immediate.syncTypes.forEach(syncType => {
    console.log(`Plane sofortige Synchronisierung für: ${syncType}`);
    // Starte mit minimaler Verzögerung (10 Sekunden)
    timers[syncType] = setTimeout(() => performSync(syncType), 10000);
  });
  
  // Starte schnelle Synchronisierungen mit größerem Abstand
  syncConfig.fast.syncTypes.forEach((syncType, index) => {
    console.log(`Plane initiale schnelle Synchronisierung für: ${syncType}`);
    // Starte mit größerer Verzögerung, verteilt über einen längeren Zeitraum
    const delay = 3 * 60000 + (index * 60000); // 3 Minuten + 1 Minute pro Eintrag
    timers[syncType] = setTimeout(() => performSync(syncType), delay);
  });
  
  // Starte mittelschnelle Synchronisierungen mit noch größerem Abstand
  syncConfig.medium.syncTypes.forEach((syncType, index) => {
    console.log(`Plane initiale mittelschnelle Synchronisierung für: ${syncType}`);
    // Starte mit größerer Verzögerung und mehr Abstand zwischen den Tasks
    const delay = 5 * 60000 + (index * 3 * 60000); // 5 Minuten + 3 Minuten pro Eintrag
    timers[syncType] = setTimeout(() => performSync(syncType), delay);
  });
  
  // Starte Prognose-Synchronisierungen
  syncConfig.forecast.syncTypes.forEach((syncType, index) => {
    console.log(`Plane initiale Prognose-Synchronisierung für: ${syncType}`);
    // Starte mit größerer Verzögerung (20 Minuten + 10 Minuten pro Eintrag)
    const delay = 20 * 60000 + (index * 10 * 60000);
    timers[syncType] = setTimeout(() => performSync(syncType), delay);
  });
  
  // Starte langsame Synchronisierungen zuletzt
  syncConfig.slow.syncTypes.forEach((syncType, index) => {
    console.log(`Plane initiale langsame Synchronisierung für: ${syncType}`);
    // Starte mit noch größerer Verzögerung (15 Minuten + 5 Minuten pro Eintrag)
    const delay = 15 * 60000 + (index * 5 * 60000);
    timers[syncType] = setTimeout(() => performSync(syncType), delay);
  });
  
  // Starte historische Synchronisierungen als allerletztes
  syncConfig.historical.syncTypes.forEach((syncType, index) => {
    console.log(`Plane initiale historische Synchronisierung für: ${syncType}`);
    // Starte mit sehr großer Verzögerung (30 Minuten + 5 Minuten pro Eintrag)
    const delay = 30 * 60000 + (index * 5 * 60000);
    timers[syncType] = setTimeout(() => performSync(syncType), delay);
  });
}

/**
 * Stoppt die automatische Synchronisierung
 */
export function stopAutomaticSync(): void {
  console.log('Stoppe automatische Synchronisierung...');
  
  // Lösche alle Timer
  Object.keys(timers).forEach(key => {
    clearTimeout(timers[key]);
    delete timers[key];
  });
}

/**
 * Gibt den aktuellen Status der automatischen Synchronisierung zurück
 */
export function getSchedulerStatus(): Record<string, any> {
  return {
    active: Object.keys(timers).length > 0,
    scheduledJobs: Object.keys(timers).map(syncType => ({
      syncType,
      isActive: Boolean(timers[syncType]),
      nextRunIn: 'planmäßig' // In einer realen Implementierung würden wir tatsächliche Zeiten berechnen
    })),
    configuration: syncConfig
  };
}
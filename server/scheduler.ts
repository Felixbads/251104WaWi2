/**
 * Automatischer Synchronisierungs-Planer
 * Dieser Service führt regelmäßige Synchronisierungen mit verschiedenen APIs durch:
 * - Vendon API für Automaten und Transaktionsdaten
 * - OpenWeatherMap API für Wetterprognosen
 * - Feiertags-API für Feiertage und Schulferien
 */

import { getUnifiedVendonSyncInstance } from './services/UnifiedVendonSync';
import { vendonDeltaSync } from './services/vendonDeltaSync';
import { syncWeatherForecast, syncHistoricalWeatherBatch } from './services/openWeatherService';
import { syncMissingHolidays } from './services/holidayService';
import { reconcileWarehouseProducts } from './services/warehouseReconciliation';
import { productSyncService } from './services/productSyncService'; // Neuer verbesserter Product-Sync-Service
import { trainForecastModel, createForecast } from './services/forecastService';
import { verifyWeatherCoverage } from './services/weatherCoverageService';

// Speichern der Timeout-IDs zur späteren Verwaltung
const timers: Record<string, NodeJS.Timeout> = {};

// Unified Vendon Sync Instance
const unifiedSync = getUnifiedVendonSyncInstance();

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
    syncTypes: ['weather_historical_batch', 'warehouse_reconciliation', 'holidays', 'weather_coverage_check'] // Weather Coverage Check hinzugefügt
  },
  // Neuer jährlicher Scheduler für Feiertagsdaten
  annual: {
    interval: 365 * 24 * 60 * 60 * 1000, // 365 Tage (jährlich)
    syncTypes: ['annual_holidays', 'annual_school_holidays'] // Jährliche Holiday-Synchronisation
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
        // Neue Delta-Synchronisation mit Watermarks (ersetzt zeitfenster-basierte Sync)
        console.log('🚀 Verwende neuen Delta-Sync mit Watermarks für Transaktionen');
        result = await vendonDeltaSync.syncAllMachines();
        
        // Berechne Gesamtstatistik für Logging
        const totalStats = Object.values(result).reduce((acc: any, machineResult: any) => {
          return {
            successful: acc.successful + (machineResult.success ? 1 : 0),
            failed: acc.failed + (machineResult.success ? 0 : 1),
            totalUpserted: acc.totalUpserted + machineResult.upsertedCount
          };
        }, { successful: 0, failed: 0, totalUpserted: 0 });
        
        console.log(`✅ Delta-Sync abgeschlossen: ${totalStats.successful} Maschinen erfolgreich, ${totalStats.totalUpserted} neue Transaktionen`);
        break;
      case 'refills':
        // Synchronisiere Refills der letzten 24 Stunden
        const yesterdayRefills = new Date();
        yesterdayRefills.setDate(yesterdayRefills.getDate() - 1);
        const todayRefills = new Date();
        result = await unifiedSync.syncRefills({ startDate: yesterdayRefills, endDate: todayRefills });
        break;
      case 'machines':
        result = await unifiedSync.syncMachines();
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
        const todayEvents = new Date();
        result = await unifiedSync.syncEvents({ startDate: yesterdayEvents, endDate: todayEvents });
        break;
      case 'historical_batch':
        // Führe inkrementelle historische Synchronisierung durch
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        result = await unifiedSync.runIncrementalSync(weekAgo, new Date());
        console.log("✅ Historische Batch-Synchronisierung abgeschlossen.");
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
      case 'annual_holidays':
        // Jährliche Synchronisation aller Public Holidays für nächstes Jahr (1. Dezember)
        console.log('🎄 Starte jährliche Public Holiday Synchronisation...');
        const nextYear = new Date().getFullYear() + 1;
        try {
          result = await syncMissingHolidays(nextYear, nextYear, undefined, false); // Nur Public Holidays
          console.log(`✅ Jährliche Public Holiday-Sync für ${nextYear} erfolgreich abgeschlossen`);
        } catch (error) {
          console.error(`❌ Fehler bei jährlicher Public Holiday-Sync für ${nextYear}:`, error);
          // Retry-Logik: Plane erneuten Versuch in 1 Stunde
          setTimeout(() => performSync('annual_holidays'), 60 * 60 * 1000);
          result = { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' };
        }
        break;
      case 'annual_school_holidays':
        // Jährliche Synchronisation aller School Holidays für nächstes Jahr (1. Dezember)
        console.log('🎄 Starte jährliche School Holiday Synchronisation...');
        const nextYearSchool = new Date().getFullYear() + 1;
        try {
          result = await syncMissingHolidays(nextYearSchool, nextYearSchool, undefined, true); // Mit School Holidays
          console.log(`✅ Jährliche School Holiday-Sync für ${nextYearSchool} erfolgreich abgeschlossen`);
        } catch (error) {
          console.error(`❌ Fehler bei jährlicher School Holiday-Sync für ${nextYearSchool}:`, error);
          // Retry-Logik: Plane erneuten Versuch in 1 Stunde
          setTimeout(() => performSync('annual_school_holidays'), 60 * 60 * 1000);
          result = { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' };
        }
        break;
      case 'weather_coverage_check':
        // Tägliche Überprüfung der Wetterdaten-Vollständigkeit ab 1.1.2024
        console.log('🌦️ Starte täglichen Weather Coverage Check...');
        try {
          result = await verifyWeatherCoverage();
          if (result.success) {
            console.log(`✅ Coverage Check abgeschlossen: ${result.coveragePercentage}% Abdeckung, ${result.gapsFilled} Lücken gefüllt`);
          } else {
            console.log(`⚠️ Coverage Check mit ${result.errors.length} Fehlern abgeschlossen`);
          }
        } catch (error) {
          console.error('❌ Fehler beim Weather Coverage Check:', error);
          result = { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' };
        }
        break;
      case 'warehouse_reconciliation':
        // Führe täglichen Lagerabgleich durch, um neue Produkte in Automaten zu erkennen
        console.log('Starte täglichen Lagerabgleich für alle Automaten-Lager-Kombinationen (NUR Automatenprodukte)...');
        result = await reconcileWarehouseProducts(undefined, false, true);
        console.log(`Täglicher Lagerabgleich abgeschlossen: ${result.productsAdded} neue Produkte zu ${result.warehousesChecked} Lagern hinzugefügt.`);
        break;
      case 'vendon_gap_check':
        // Führe einfache Datenqualitäts-Prüfung durch
        console.log('🔍 Starte einfache Datenqualitäts-Prüfung...');
        try {
          // Einfache inkrementelle Synchronisierung als Datenqualitäts-Check
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          const now = new Date();
          const checkResult = await unifiedSync.runIncrementalSync(twoDaysAgo, now);
          
          console.log('✅ Datenqualitäts-Check abgeschlossen');
          result = {
            success: true,
            message: `Datenqualitäts-Check abgeschlossen: ${checkResult.stats.found} Datensätze geprüft`
          };
        } catch (error) {
          console.error('❌ Fehler bei der Datenqualitäts-Prüfung:', error);
          result = {
            success: false,
            message: `Fehler bei der Datenqualitäts-Prüfung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
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
        result = await unifiedSync.runFullSync();
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
  } else if (syncConfig.annual && syncConfig.annual.syncTypes.includes(syncType)) {
    // Für jährliche Syncs: Berechne Zeit bis zum nächsten 1. Dezember
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextDecember = new Date(currentYear, 11, 1, 0, 0, 0); // 1. Dezember um Mitternacht
    
    // Wenn der 1. Dezember dieses Jahr schon vorbei ist, plane für nächstes Jahr
    if (now > nextDecember) {
      nextDecember.setFullYear(currentYear + 1);
    }
    
    interval = nextDecember.getTime() - now.getTime();
    console.log(`🎄 Jährlicher ${syncType}-Sync geplant für: ${nextDecember.toLocaleDateString('de-DE')}`);
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
 * ⚠️ DEAKTIVIERT - Ersetzt durch UnifiedVendonSync für batch-basierte Operationen
 */
export function startAutomaticSync(): void {
  console.log('⚠️ Legacy scheduler.ts deaktiviert - Unified Vendon System aktiv');
  return; // FRÜHE RÜCKKEHR - Deaktiviert das alte N+1-Query System
  
  // ===== AB HIER DEAKTIVIERT =====
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
  
  // Jährliche Sync-Jobs: Schedule für 1. Dezember um 00:00 Uhr
  if (syncConfig.annual) {
    syncConfig.annual.syncTypes.forEach((syncType, index) => {
      scheduleAnnualSync(syncType, index);
    });
  }
}

/**
 * Plant jährliche Sync-Jobs für den 1. Dezember
 * @param syncType - Typ der jährlichen Synchronisation
 * @param index - Index für gestaffelte Ausführung
 */
function scheduleAnnualSync(syncType: string, index: number): void {
  const now = new Date();
  const currentYear = now.getFullYear();
  const nextDecember = new Date(currentYear, 11, 1, 0, 0, 0); // 1. Dezember um Mitternacht
  
  // Wenn der 1. Dezember dieses Jahr schon vorbei ist, plane für nächstes Jahr
  if (now > nextDecember) {
    nextDecember.setFullYear(currentYear + 1);
  }
  
  // Verteile die jährlichen Jobs über mehrere Stunden am 1. Dezember
  nextDecember.setHours(index * 2); // Alle 2 Stunden am 1. Dezember
  
  const delay = nextDecember.getTime() - now.getTime();
  
  console.log(`🗓️ Plane jährlichen ${syncType}-Sync für: ${nextDecember.toLocaleString('de-DE')}`);
  
  // Setze Timer für das nächste Jahr
  timers[syncType] = setTimeout(() => {
    performSync(syncType);
  }, delay);
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
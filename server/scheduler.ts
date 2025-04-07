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

// Speichern der Timeout-IDs zur späteren Verwaltung
const timers: Record<string, NodeJS.Timeout> = {};

// Konfiguration für verschiedene Syncs
const syncConfig = {
  immediate: {
    interval: 10 * 60 * 1000, // 10 Minuten (erhöht von 5 Minuten)
    syncTypes: ['transactions'] // Sehr schnelle Sync-Typen, die in Echtzeit benötigt werden
  },
  fast: {
    interval: 60 * 60 * 1000, // 60 Minuten (erhöht von 30 Minuten)
    syncTypes: ['refills'] // Schnelle Sync-Typen
  },
  medium: {
    interval: 2 * 60 * 60 * 1000, // 2 Stunden (erhöht von 1 Stunde)
    syncTypes: ['machines', 'products', 'events', 'weather_forecast'] // Mittelschnelle Sync-Typen - 'weather_historical_batch' entfernt, um Überlastung zu vermeiden
  },
  slow: {
    interval: 24 * 60 * 60 * 1000, // 24 Stunden
    syncTypes: ['holidays', 'weather_historical_batch', 'warehouse_reconciliation'] // Täglicher Lagerabgleich hinzugefügt
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
        result = await vendonSync.syncProducts();
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
        console.log('Starte täglichen Lagerabgleich für alle Automaten-Lager-Kombinationen...');
        result = await reconcileWarehouseProducts();
        console.log(`Täglicher Lagerabgleich abgeschlossen: ${result.productsAdded} neue Produkte zu ${result.warehousesChecked} Lagern hinzugefügt.`);
        break;
      case 'all':
        result = await vendonSync.syncAll();
        // Auch Wetter und Feiertage synchronisieren
        await syncWeatherForecast(50.9196, 14.1524);
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
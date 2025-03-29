/**
 * Vendon Automatischer Synchronisierungs-Planer
 * Dieser Service führt regelmäßige Synchronisierungen mit dem Vendon API durch
 */

import { vendonSync } from './services/vendonSync';

// Speichern der Timeout-IDs zur späteren Verwaltung
const timers: Record<string, NodeJS.Timeout> = {};

// Konfiguration für verschiedene Syncs
const syncConfig = {
  fast: {
    interval: 5 * 60 * 1000, // 5 Minuten
    syncTypes: ['transactions', 'refills'] // Schnelle Sync-Typen
  },
  medium: {
    interval: 60 * 60 * 1000, // 1 Stunde
    syncTypes: ['machines', 'products', 'events'] // Mittelschnelle Sync-Typen
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
      case 'all':
        result = await vendonSync.syncAll();
        break;
      default:
        console.error(`Unbekannter Sync-Typ: ${syncType}`);
        return;
    }
    
    console.log(`Geplante Synchronisierung abgeschlossen für ${syncType}: ${result.status}`);
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
  if (syncConfig.fast.syncTypes.includes(syncType)) {
    interval = syncConfig.fast.interval;
  } else if (syncConfig.medium.syncTypes.includes(syncType)) {
    interval = syncConfig.medium.interval;
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
  
  // Starte schnelle Synchronisierungen
  syncConfig.fast.syncTypes.forEach(syncType => {
    console.log(`Plane initiale schnelle Synchronisierung für: ${syncType}`);
    // Starte mit leichter Verzögerung, um Server-Start nicht zu behindern
    timers[syncType] = setTimeout(() => performSync(syncType), 30000 + Math.random() * 30000);
  });
  
  // Starte mittelschnelle Synchronisierungen
  syncConfig.medium.syncTypes.forEach(syncType => {
    console.log(`Plane initiale mittelschnelle Synchronisierung für: ${syncType}`);
    // Starte mit größerer Verzögerung
    timers[syncType] = setTimeout(() => performSync(syncType), 60000 + Math.random() * 60000);
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
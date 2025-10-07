/**
 * AUTO-START UNIFIED VENDON SCHEDULER
 * 
 * Startet automatisch den UnifiedVendonScheduler beim Server-Start
 * für kontinuierliche Transaktions- und Maschinendaten-Synchronisation
 */

import { startUnifiedScheduler } from './unifiedVendonScheduler';

let isStarted = false;

export async function autoStartResilientSync(): Promise<void> {
  if (isStarted) {
    console.log('✅ UnifiedVendonScheduler bereits gestartet');
    return;
  }

  try {
    console.log('🚀 Starte UnifiedVendonScheduler automatisch...');
    
    // Kurze Verzögerung, um sicherzustellen, dass DB und Services bereit sind
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Starte den UnifiedVendonScheduler mit Standard-Konfiguration
    const scheduler = startUnifiedScheduler({
      quickSyncIntervalMinutes: 15,  // Transaktionen alle 15 Minuten
      fullSyncIntervalMinutes: 60,   // Vollständiger Sync jede Stunde
      timezone: 'Europe/Berlin',
      autoStart: true
    });
    
    isStarted = true;
    
    console.log('✅ UnifiedVendonScheduler erfolgreich gestartet');
    console.log('📊 Quick Sync: alle 15 Min | Full Sync: alle 60 Min');
    
  } catch (error) {
    console.error('❌ Fehler beim automatischen Start des UnifiedVendonScheduler:', error);
    // Nicht werfen, um den Server-Start nicht zu blockieren
  }
}

// ✅ Automatischer Start nach Server-Initialisierung
process.nextTick(() => {
  setTimeout(autoStartResilientSync, 5000); // 5 Sekunden nach Server-Start
});

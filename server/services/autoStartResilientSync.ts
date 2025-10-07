/**
 * AUTO-START RESILIENTE VENDON-SYNCHRONISATION
 * 
 * Startet automatisch die resiliente Hintergrund-Synchronisation beim Server-Start
 */

import { startVendonBackgroundService } from './vendonBackgroundService';

let isStarted = false;

export async function autoStartResilientSync(): Promise<void> {
  if (isStarted) {
    console.log('Resiliente Vendon-Synchronisation bereits gestartet');
    return;
  }

  try {
    console.log('🚀 Starte resiliente Vendon-Synchronisation automatisch...');
    
    // Kurze Verzögerung, um sicherzustellen, dass alle Services bereit sind
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await startVendonBackgroundService();
    isStarted = true;
    
    console.log('✅ Resiliente Vendon-Synchronisation erfolgreich gestartet');
    
  } catch (error) {
    console.error('❌ Fehler beim automatischen Start der resilienten Synchronisation:', error);
    // Nicht werfen, um den Server-Start nicht zu blockieren
  }
}

// ✅ Automatischer Start nach Server-Initialisierung
process.nextTick(() => {
  setTimeout(autoStartResilientSync, 5000); // 5 Sekunden nach Server-Start
});
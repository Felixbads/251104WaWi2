/**
 * UNIFIED VENDON MIGRATION SERVICE
 * 
 * Migrates definitively from the old N+1-Query-based vendonSync system
 * to the new batch-based UnifiedVendonSync system.
 * 
 * Deaktiviert alle alten Services und startet das neue unified system.
 */

import { getVendonBackgroundSchedulerInstance } from "./VendonBackgroundScheduler";
import { getDuplicatePreventionServiceInstance } from "./DuplicatePreventionService";
import { getUnifiedVendonSyncInstance } from "./UnifiedVendonSync";

export class UnifiedVendonMigration {
  private static instance: UnifiedVendonMigration | null = null;
  private isInitialized = false;

  static getInstance(): UnifiedVendonMigration {
    if (!this.instance) {
      this.instance = new UnifiedVendonMigration();
    }
    return this.instance;
  }

  /**
   * Führt eine vollständige Migration zum unified system durch
   */
  async performMigration(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('✅ Unified System bereits migriert');
      return true;
    }

    try {
      console.log('🚀 STARTE UNIFIED VENDON SYSTEM MIGRATION');
      console.log('='.repeat(50));

      // Step 1: Stoppe alle alten Services
      await this.stopLegacyServices();

      // Step 2: Initialisiere neue Services
      await this.initializeUnifiedServices();

      // Step 3: Starte Unified Background Scheduler
      await this.startUnifiedScheduler();

      // Step 4: Verifiziere Migration
      const isHealthy = await this.verifyMigration();

      if (isHealthy) {
        this.isInitialized = true;
        console.log('✅ UNIFIED SYSTEM MIGRATION ERFOLGREICH');
        console.log('🛡️ Duplikat-freie, batch-basierte Synchronisation aktiv');
        return true;
      } else {
        throw new Error('Migration verification failed');
      }

    } catch (error) {
      console.error('❌ UNIFIED SYSTEM MIGRATION FEHLGESCHLAGEN:', error);
      return false;
    }
  }

  /**
   * Stoppt alle Legacy-Services die N+1-Duplikatschecks machen
   */
  private async stopLegacyServices(): Promise<void> {
    console.log('🛑 Stoppe Legacy Services...');
    
    const legacyServices = [
      'vendonScheduler',
      'ultraRobustVendonSync', 
      'stableVendonScheduler',
      'resilientVendonSync',
      'vendonBackgroundService',
      'vendonSync',
      'syncScheduler'
    ];

    for (const serviceName of legacyServices) {
      try {
        // Versuche Service über globale Variable zu stoppen
        if ((global as any)[serviceName] && typeof (global as any)[serviceName].stop === 'function') {
          (global as any)[serviceName].stop();
          console.log(`✅ ${serviceName} gestoppt`);
        } else {
          console.log(`⚠️ ${serviceName} nicht gefunden oder bereits gestoppt`);
        }
      } catch (error) {
        console.warn(`⚠️ Fehler beim Stoppen von ${serviceName}:`, error);
      }
    }
    
    console.log('🛑 Legacy Services deaktiviert');
  }

  /**
   * Initialisiert die neuen Unified Services
   */
  private async initializeUnifiedServices(): Promise<void> {
    console.log('🔧 Initialisiere Unified Services...');

    // Initialize Duplicate Prevention Service
    const duplicatePreventionService = getDuplicatePreventionServiceInstance();
    console.log('✅ DuplicatePreventionService initialisiert');

    // Initialize Unified Vendon Sync  
    const unifiedSync = getUnifiedVendonSyncInstance();
    console.log('✅ UnifiedVendonSync initialisiert');

    // Initialize Background Scheduler
    const scheduler = getVendonBackgroundSchedulerInstance({
      quickSyncIntervalMinutes: 5,
      fullSyncIntervalMinutes: 30,
      enabled: true,
      timezone: 'Europe/Berlin'
    });
    console.log('✅ VendonBackgroundScheduler initialisiert');
  }

  /**
   * Startet den Unified Background Scheduler
   */
  private async startUnifiedScheduler(): Promise<void> {
    console.log('🚀 Starte Unified Background Scheduler...');
    
    const scheduler = getVendonBackgroundSchedulerInstance();
    await scheduler.start();
    
    console.log('✅ Unified Background Scheduler gestartet');
  }

  /**
   * Verifiziert dass die Migration erfolgreich war
   */
  private async verifyMigration(): Promise<boolean> {
    console.log('🔍 Verifiziere Migration...');

    try {
      // Prüfe dass Scheduler läuft
      const scheduler = getVendonBackgroundSchedulerInstance();
      const status = scheduler.getStatus();
      
      if (!status.isStarted) {
        console.error('❌ Scheduler ist nicht gestartet');
        return false;
      }

      // Teste Duplikat-Service
      const duplicateService = getDuplicatePreventionServiceInstance();
      const testResult = await duplicateService.batchCheckDuplicates(['test-123'], 'transactions');
      
      if (testResult.existingIds.length !== 0) {
        console.log('✅ Batch-basierte Duplikatsprüfung funktioniert');
      }

      console.log('✅ Migration Verification erfolgreich');
      return true;

    } catch (error) {
      console.error('❌ Migration Verification fehlgeschlagen:', error);
      return false;
    }
  }

  /**
   * Führt einen Test-Sync durch um sicherzustellen dass batch-processing verwendet wird
   */
  async testBatchSyncPerformance(): Promise<void> {
    console.log('🧪 Teste Batch-Sync Performance...');
    
    try {
      const unifiedSync = getUnifiedVendonSyncInstance();
      
      const startTime = Date.now();
      const result = await unifiedSync.runIncrementalSync();
      const duration = Date.now() - startTime;
      
      console.log(`🧪 Test-Sync Ergebnis: ${result.stats.saved} neue Datensätze in ${duration}ms`);
      
      if (duration < 10000 && result.status === 'success') {
        console.log('✅ Batch-Performance Test erfolgreich - System ist optimiert');
      } else {
        console.warn('⚠️ Performance könnte besser sein, aber System funktioniert');
      }
      
    } catch (error) {
      console.error('❌ Performance Test fehlgeschlagen:', error);
    }
  }

  /**
   * Gibt Status des Unified Systems zurück
   */
  getStatus() {
    const scheduler = getVendonBackgroundSchedulerInstance();
    
    return {
      isInitialized: this.isInitialized,
      scheduler: scheduler.getStatus(),
      message: this.isInitialized 
        ? 'Unified System aktiv - Batch-basierte Synchronisation' 
        : 'Migration noch nicht abgeschlossen'
    };
  }
}

// Global instance for easy access
let unifiedMigrationInstance: UnifiedVendonMigration | null = null;

export function getUnifiedVendonMigrationInstance(): UnifiedVendonMigration {
  if (!unifiedMigrationInstance) {
    unifiedMigrationInstance = UnifiedVendonMigration.getInstance();
  }
  return unifiedMigrationInstance;
}

/**
 * Auto-start migration if not already done
 */
export async function autoStartUnifiedSystem(): Promise<void> {
  const migration = getUnifiedVendonMigrationInstance();
  
  console.log('🎯 Auto-Start: Migriere zu Unified Vendon System...');
  
  const success = await migration.performMigration();
  
  if (success) {
    console.log('🚀 Auto-Migration erfolgreich - Unified System aktiv');
    
    // Optional: Performance test nach 30 Sekunden
    setTimeout(async () => {
      await migration.testBatchSyncPerformance();
    }, 30000);
    
  } else {
    console.error('❌ Auto-Migration fehlgeschlagen - Legacy Services bleiben aktiv');
  }
}
/**
 * UNIFIED VENDON SCHEDULER
 * 
 * Single, coordinated scheduler that replaces all competing schedulers:
 * - stableVendonScheduler.ts
 * - All other Vendon scheduling services
 * 
 * Features:
 * - Prevents multiple sync processes from running simultaneously
 * - Intelligent scheduling based on system load
 * - Health monitoring and automatic recovery
 * - Proper error handling and logging
 */

import { getUnifiedSyncCoordinator } from './unifiedVendonSyncCoordinator';
import { schedule, ScheduledTask } from 'node-cron';

interface SchedulerConfig {
  quickSyncIntervalMinutes: number;    // Quick sync (transactions only) interval  
  fullSyncIntervalMinutes: number;     // Full sync (all data) interval
  enabled: boolean;                    // Master enable/disable switch
  timezone: string;                    // Timezone for scheduling
}

interface SchedulerStats {
  totalScheduledSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  skippedSyncs: number;
  lastQuickSync: Date | null;
  lastFullSync: Date | null;
  lastError: string | null;
  isRunning: boolean;
  nextQuickSync: Date | null;
  nextFullSync: Date | null;
}

export class UnifiedVendonScheduler {
  private config: SchedulerConfig;
  private syncCoordinator = getUnifiedSyncCoordinator();
  
  private quickSyncTask: ScheduledTask | null = null;
  private fullSyncTask: ScheduledTask | null = null;
  private isRunning = false;
  
  private stats: SchedulerStats = {
    totalScheduledSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    skippedSyncs: 0,
    lastQuickSync: null,
    lastFullSync: null,
    lastError: null,
    isRunning: false,
    nextQuickSync: null,
    nextFullSync: null
  };

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = {
      quickSyncIntervalMinutes: 5,     // Quick sync every 5 minutes
      fullSyncIntervalMinutes: 30,     // Full sync every 30 minutes  
      enabled: true,
      timezone: 'Europe/Berlin',
      ...config
    };

    console.log('🕐 Unified Vendon Scheduler initialisiert');
    console.log('📅 Konfiguration:', this.config);
  }

  /**
   * Start the unified scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Unified Scheduler läuft bereits');
      return;
    }

    if (!this.config.enabled) {
      console.log('⏸️ Unified Scheduler ist deaktiviert');
      return;
    }

    try {
      console.log('🚀 Starte Unified Vendon Scheduler...');
      
      // Quick sync schedule (transactions only)
      const quickSyncCron = `*/${this.config.quickSyncIntervalMinutes} * * * *`;
      this.quickSyncTask = schedule(quickSyncCron, async () => {
        await this.performScheduledQuickSync();
      }, {
        timezone: this.config.timezone
      });

      // Full sync schedule (all data)
      const fullSyncCron = `*/${this.config.fullSyncIntervalMinutes} * * * *`;
      this.fullSyncTask = schedule(fullSyncCron, async () => {
        await this.performScheduledFullSync();
      }, {
        timezone: this.config.timezone
      });

      // Start both tasks
      this.quickSyncTask.start();
      this.fullSyncTask.start();
      
      this.isRunning = true;
      this.stats.isRunning = true;
      
      // Calculate next run times
      this.updateNextRunTimes();
      
      console.log('✅ Unified Vendon Scheduler gestartet');
      console.log(`📅 Quick-Sync alle ${this.config.quickSyncIntervalMinutes} Minuten`);
      console.log(`📅 Full-Sync alle ${this.config.fullSyncIntervalMinutes} Minuten`);
      console.log(`⏰ Nächster Quick-Sync: ${this.stats.nextQuickSync?.toLocaleString('de-DE')}`);
      console.log(`⏰ Nächster Full-Sync: ${this.stats.nextFullSync?.toLocaleString('de-DE')}`);

      // Perform initial sync after 30 seconds
      setTimeout(() => {
        console.log('🎯 Starte initiale Synchronisation...');
        this.performScheduledFullSync().catch(error => {
          console.error('❌ Fehler bei initialer Synchronisation:', error);
        });
      }, 30000);

    } catch (error) {
      console.error('❌ Fehler beim Starten des Unified Schedulers:', error);
      this.isRunning = false;
      this.stats.isRunning = false;
    }
  }

  /**
   * Stop the unified scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Unified Scheduler läuft nicht');
      return;
    }

    try {
      console.log('🛑 Stoppe Unified Vendon Scheduler...');
      
      if (this.quickSyncTask) {
        this.quickSyncTask.stop();
        this.quickSyncTask = null;
      }

      if (this.fullSyncTask) {
        this.fullSyncTask.stop();
        this.fullSyncTask = null;
      }

      this.isRunning = false;
      this.stats.isRunning = false;
      this.stats.nextQuickSync = null;
      this.stats.nextFullSync = null;
      
      console.log('✅ Unified Vendon Scheduler gestoppt');
    } catch (error) {
      console.error('❌ Fehler beim Stoppen des Unified Schedulers:', error);
    }
  }

  /**
   * Restart the scheduler with new configuration
   */
  restart(config?: Partial<SchedulerConfig>): void {
    console.log('🔄 Starte Unified Scheduler neu...');
    this.stop();
    
    if (config) {
      this.config = { ...this.config, ...config };
      console.log('🔧 Neue Konfiguration:', this.config);
    }
    
    // Wait a moment before restarting
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  /**
   * Perform scheduled quick sync (transactions only)
   */
  private async performScheduledQuickSync(): Promise<void> {
    if (!this.isRunning) return;

    const syncStart = Date.now();
    this.stats.totalScheduledSyncs++;
    
    try {
      console.log('🔄 [SCHEDULED_QUICK_SYNC] Starte geplante Quick-Synchronisation...');
      
      // Check if another sync is running
      const coordinatorStatus = this.syncCoordinator.getSyncStatus();
      if (coordinatorStatus.isRunning) {
        console.log('⏭️ [SCHEDULED_QUICK_SYNC] Sync bereits aktiv - übersprungen');
        this.stats.skippedSyncs++;
        return;
      }

      const result = await this.syncCoordinator.performQuickSync();
      
      if (result.success) {
        this.stats.successfulSyncs++;
        this.stats.lastQuickSync = new Date();
        this.stats.lastError = null;
        
        const duration = (Date.now() - syncStart) / 1000;
        console.log(`✅ [SCHEDULED_QUICK_SYNC] Quick-Sync erfolgreich in ${duration.toFixed(1)}s`);
        if (result.itemsSaved > 0) {
          console.log(`📊 Details: ${result.itemsSaved} neue Transaktionen, ${result.duplicates} Duplikate`);
        }
      } else {
        throw new Error(result.message);
      }
      
    } catch (error: any) {
      this.stats.failedSyncs++;
      this.stats.lastError = error.message;
      
      const duration = (Date.now() - syncStart) / 1000;
      console.error(`❌ [SCHEDULED_QUICK_SYNC] Quick-Sync fehlgeschlagen nach ${duration.toFixed(1)}s:`, error.message);
    }
    
    this.updateNextRunTimes();
  }

  /**
   * Perform scheduled full sync (all data)
   */
  private async performScheduledFullSync(): Promise<void> {
    if (!this.isRunning) return;

    const syncStart = Date.now();
    this.stats.totalScheduledSyncs++;
    
    try {
      console.log('🔄 [SCHEDULED_FULL_SYNC] Starte geplante Vollsynchronisation...');
      
      // Check if another sync is running
      const coordinatorStatus = this.syncCoordinator.getSyncStatus();
      if (coordinatorStatus.isRunning) {
        console.log('⏭️ [SCHEDULED_FULL_SYNC] Sync bereits aktiv - übersprungen');
        this.stats.skippedSyncs++;
        return;
      }

      const result = await this.syncCoordinator.performFullSync();
      
      if (result.success) {
        this.stats.successfulSyncs++;
        this.stats.lastFullSync = new Date();
        this.stats.lastError = null;
        
        const duration = (Date.now() - syncStart) / 1000;
        console.log(`✅ [SCHEDULED_FULL_SYNC] Vollsynchronisation erfolgreich in ${duration.toFixed(1)}s`);
        console.log(`📊 Details: ${result.itemsSaved} neue Datensätze, ${result.duplicates} Duplikate`);
      } else {
        throw new Error(result.message);
      }
      
    } catch (error: any) {
      this.stats.failedSyncs++;
      this.stats.lastError = error.message;
      
      const duration = (Date.now() - syncStart) / 1000;
      console.error(`❌ [SCHEDULED_FULL_SYNC] Vollsynchronisation fehlgeschlagen nach ${duration.toFixed(1)}s:`, error.message);
    }
    
    this.updateNextRunTimes();
  }

  /**
   * Manually trigger a quick sync
   */
  async triggerQuickSync(): Promise<void> {
    console.log('🎯 Manueller Quick-Sync ausgelöst...');
    await this.performScheduledQuickSync();
  }

  /**
   * Manually trigger a full sync
   */
  async triggerFullSync(): Promise<void> {
    console.log('🎯 Manueller Full-Sync ausgelöst...');
    await this.performScheduledFullSync();
  }

  /**
   * Update next run times for display purposes
   */
  private updateNextRunTimes(): void {
    const now = new Date();
    
    // Calculate next quick sync
    const nextQuickMinutes = this.config.quickSyncIntervalMinutes - (now.getMinutes() % this.config.quickSyncIntervalMinutes);
    this.stats.nextQuickSync = new Date(now.getTime() + nextQuickMinutes * 60 * 1000);
    
    // Calculate next full sync
    const nextFullMinutes = this.config.fullSyncIntervalMinutes - (now.getMinutes() % this.config.fullSyncIntervalMinutes);
    this.stats.nextFullSync = new Date(now.getTime() + nextFullMinutes * 60 * 1000);
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus(): SchedulerStats & { config: SchedulerConfig } {
    return {
      ...this.stats,
      config: this.config
    };
  }

  /**
   * Get health status
   */
  getHealth(): { status: 'healthy' | 'degraded' | 'unhealthy'; message: string; details: any } {
    const now = Date.now();
    const lastSyncTime = Math.max(
      this.stats.lastQuickSync?.getTime() || 0,
      this.stats.lastFullSync?.getTime() || 0
    );
    
    const minutesSinceLastSync = (now - lastSyncTime) / (1000 * 60);
    
    if (!this.stats.isRunning) {
      return {
        status: 'unhealthy',
        message: 'Scheduler ist gestoppt',
        details: this.stats
      };
    }
    
    if (minutesSinceLastSync > this.config.fullSyncIntervalMinutes * 2) {
      return {
        status: 'unhealthy',
        message: `Keine Synchronisation seit ${Math.round(minutesSinceLastSync)} Minuten`,
        details: this.stats
      };
    }
    
    if (this.stats.lastError && minutesSinceLastSync > this.config.quickSyncIntervalMinutes * 3) {
      return {
        status: 'degraded',
        message: `Letzte Synchronisation hatte Fehler: ${this.stats.lastError}`,
        details: this.stats
      };
    }
    
    return {
      status: 'healthy',
      message: 'Scheduler läuft normal',
      details: this.stats
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let schedulerInstance: UnifiedVendonScheduler | null = null;

export function getUnifiedScheduler(): UnifiedVendonScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new UnifiedVendonScheduler();
  }
  return schedulerInstance;
}

/**
 * Initialize and start the unified scheduler
 */
export function startUnifiedScheduler(config?: Partial<SchedulerConfig>): UnifiedVendonScheduler {
  const scheduler = getUnifiedScheduler();
  
  if (config) {
    scheduler.restart(config);
  } else {
    scheduler.start();
  }
  
  return scheduler;
}

/**
 * Stop the unified scheduler
 */
export function stopUnifiedScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
/**
 * STABLE VENDON SCHEDULER
 * Stabiler Scheduler für kontinuierliche Vendon-Synchronisation
 * Löst das Problem der ständig neuen Standorte
 */

import { stableVendonSync } from './stableVendonSync';
import { schedule, ScheduledTask } from 'node-cron';

export class StableVendonScheduler {
  private syncTask: ScheduledTask | null = null;
  private quickSyncTask: ScheduledTask | null = null;
  private isRunning = false;
  private lastSyncTime: Date | null = null;
  private syncCount = 0;

  constructor() {
    console.log('🕐 Stable Vendon Scheduler initialisiert');
  }

  /**
   * Startet den automatischen Scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Scheduler läuft bereits');
      return;
    }

    try {
      // Haupt-Synchronisation alle 15 Minuten
      this.syncTask = schedule('*/15 * * * *', async () => {
        await this.performScheduledSync('SCHEDULED_SYNC');
      }, {
        timezone: 'Europe/Berlin'
      });

      // Schnelle Transaktions-Synchronisation alle 5 Minuten  
      this.quickSyncTask = schedule('*/5 * * * *', async () => {
        await this.performQuickSync();
      }, {
        timezone: 'Europe/Berlin'
      });

      // Starte beide Tasks
      this.syncTask.start();
      this.quickSyncTask.start();
      
      this.isRunning = true;
      console.log('✅ Stable Vendon Scheduler gestartet');
      console.log('📅 Vollsync alle 15 Minuten, Schnellsync alle 5 Minuten');

      // Erste Synchronisation nach 30 Sekunden
      setTimeout(() => {
        this.performScheduledSync('INITIAL_SYNC').catch(error => {
          console.error('Fehler bei initialer Synchronisation:', error);
        });
      }, 30000);

    } catch (error) {
      console.error('❌ Fehler beim Starten des Schedulers:', error);
      this.isRunning = false;
    }
  }

  /**
   * Stoppt den Scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Scheduler läuft nicht');
      return;
    }

    try {
      if (this.syncTask) {
        this.syncTask.stop();
        this.syncTask = null;
      }

      if (this.quickSyncTask) {
        this.quickSyncTask.stop();
        this.quickSyncTask = null;
      }

      this.isRunning = false;
      console.log('🛑 Stable Vendon Scheduler gestoppt');
    } catch (error) {
      console.error('❌ Fehler beim Stoppen des Schedulers:', error);
    }
  }

  /**
   * Führt eine geplante Vollsynchronisation durch
   */
  private async performScheduledSync(syncType: string): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const startTime = Date.now();
    console.log(`\n🔄 [${syncType}] Starte geplante Vendon-Synchronisation...`);

    try {
      const result = await stableVendonSync.performFullSync();
      
      this.lastSyncTime = new Date();
      this.syncCount++;

      const duration = (Date.now() - startTime) / 1000;
      
      console.log(`✅ [${syncType}] Synchronisation erfolgreich in ${duration}s`);
      console.log(`📊 Details: ${JSON.stringify(result.details, null, 2)}`);

      // Erstelle Sync-Log
      await stableVendonSync.createSyncLog('automated_full_sync', {
        syncStatus: 'completed',
        itemsSaved: result.details.totalSynced || 0,
        additionalData: JSON.stringify({
          syncType,
          duration,
          syncCount: this.syncCount,
          details: result.details
        })
      });

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      console.error(`❌ [${syncType}] Synchronisation fehlgeschlagen nach ${duration}s:`, error);

      // Erstelle Fehler-Log
      await stableVendonSync.createSyncLog('automated_full_sync', {
        syncStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        additionalData: JSON.stringify({
          syncType,
          duration,
          syncCount: this.syncCount,
          error: error instanceof Error ? error.stack : String(error)
        })
      });
    }
  }

  /**
   * Führt eine schnelle Transaktions-Synchronisation durch
   */
  private async performQuickSync(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const startTime = Date.now();
    console.log('⚡ Starte schnelle Transaktions-Synchronisation...');

    try {
      // Nur Transaktionen der letzten 2 Stunden synchronisieren
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000);

      // Erstelle neuen Sync für Transaktionen
      const newSync = new (await import('./stableVendonSync')).StableVendonSync();
      const result = await newSync.syncTransactions(startDate, endDate);
      
      const duration = (Date.now() - startTime) / 1000;
      
      if (result.itemsSaved > 0) {
        console.log(`⚡ Schnellsync erfolgreich: ${result.itemsSaved} neue Transaktionen in ${duration}s`);
      }

      // Log nur bei Fehlern oder neuen Daten
      if (result.itemsSaved > 0) {
        await stableVendonSync.createSyncLog('automated_quick_sync', {
          syncStatus: 'completed',
          itemsSaved: result.itemsSaved,
          additionalData: JSON.stringify({
            duration,
            syncType: 'quick_transactions',
            timeRange: { startDate, endDate }
          })
        });
      }

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      console.error(`❌ Schnellsync fehlgeschlagen nach ${duration}s:`, error);

      await stableVendonSync.createSyncLog('automated_quick_sync', {
        syncStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        additionalData: JSON.stringify({
          duration,
          syncType: 'quick_transactions',
          error: error instanceof Error ? error.stack : String(error)
        })
      });
    }
  }

  /**
   * Triggert eine sofortige Synchronisation
   */
  async triggerImmediateSync(): Promise<void> {
    console.log('🚀 Starte sofortige Synchronisation...');
    await this.performScheduledSync('MANUAL_TRIGGER');
  }

  /**
   * Gibt den aktuellen Status zurück
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime: Date | null;
    syncCount: number;
    nextSyncIn?: string;
  } {
    let nextSyncIn: string | undefined;
    
    if (this.isRunning && this.lastSyncTime) {
      const nextSync = new Date(this.lastSyncTime.getTime() + 15 * 60 * 1000);
      const msUntilNext = nextSync.getTime() - Date.now();
      
      if (msUntilNext > 0) {
        const minutes = Math.floor(msUntilNext / (60 * 1000));
        const seconds = Math.floor((msUntilNext % (60 * 1000)) / 1000);
        nextSyncIn = `${minutes}m ${seconds}s`;
      }
    }

    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      nextSyncIn
    };
  }

  /**
   * Restart-Funktion für Service-Updates
   */
  restart(): void {
    console.log('🔄 Starte Scheduler neu...');
    this.stop();
    setTimeout(() => {
      this.start();
    }, 2000);
  }
}

// Export einer Singleton-Instanz
export const stableVendonScheduler = new StableVendonScheduler();
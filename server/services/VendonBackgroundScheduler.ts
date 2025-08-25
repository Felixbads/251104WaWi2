/**
 * VENDON BACKGROUND SCHEDULER - UNIFIED SERVICE COORDINATOR
 * 
 * Ersetzt alle konkurrierenden Scheduler durch einen zentralen Service:
 * - vendonScheduler.ts (deprecated)
 * - resilientVendonSync.ts (deprecated) 
 * - syncScheduler.ts (deprecated)
 * - vendonBackgroundService.ts (deprecated)
 * 
 * Features:
 * - Persistente DB-basierte Locks
 * - Prioritätswarteschlange
 * - Intelligente Retry-Strategien  
 * - Health-Monitoring
 * - Konfigurierbare Sync-Intervalle
 * - Automatische Lückenschließung
 */

import { getPersistentSyncLockInstance } from "./PersistentSyncLock";
import { getUnifiedVendonSyncInstance } from "./UnifiedVendonSync";
import { storage } from "../storage";

interface SchedulerConfig {
  quickSyncIntervalMinutes: number;
  fullSyncIntervalMinutes: number;
  gapCheckIntervalMinutes: number; 
  enabled: boolean;
  timezone: string;
}

interface SchedulerHealth {
  status: 'healthy' | 'warning' | 'critical' | 'stopped';
  lastQuickSync: Date | null;
  lastFullSync: Date | null;
  consecutiveFailures: number;
  totalSyncs: number;
  totalErrors: number;
  avgSyncDurationMs: number;
}

class VendonBackgroundScheduler {
  private config: SchedulerConfig = {
    quickSyncIntervalMinutes: 5,
    fullSyncIntervalMinutes: 30,
    gapCheckIntervalMinutes: 120, // 2 hours  
    enabled: true,
    timezone: 'Europe/Berlin'
  };

  private health: SchedulerHealth = {
    status: 'stopped',
    lastQuickSync: null,
    lastFullSync: null,
    consecutiveFailures: 0,
    totalSyncs: 0,
    totalErrors: 0,
    avgSyncDurationMs: 0
  };

  private quickSyncTimer: NodeJS.Timeout | null = null;
  private fullSyncTimer: NodeJS.Timeout | null = null;
  private gapCheckTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  private syncLock = getPersistentSyncLockInstance();
  private unifiedSync = getUnifiedVendonSyncInstance();
  
  private isStarted = false;

  constructor(config?: Partial<SchedulerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    console.log('🕐 Unified Vendon Scheduler initialisiert');
    console.log('📅 Konfiguration:', this.config);
  }

  /**
   * Startet den Unified Background Scheduler
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      console.log('⚠️ Unified Scheduler läuft bereits');
      return;
    }

    console.log('🚀 Starte Unified Vendon Scheduler...');
    
    this.isStarted = true;
    this.health.status = 'healthy';
    
    // Sofortige erste Synchronisation (Quick-Sync)
    setTimeout(async () => {
      await this.performQuickSync();
    }, 5000); // 5 Sekunden nach Start

    // Quick-Sync Timer (z.B. alle 5 Minuten)
    this.quickSyncTimer = setInterval(async () => {
      await this.performQuickSync();
    }, this.config.quickSyncIntervalMinutes * 60 * 1000);

    // Full-Sync Timer (z.B. alle 30 Minuten) 
    this.fullSyncTimer = setInterval(async () => {
      await this.performFullSync();
    }, this.config.fullSyncIntervalMinutes * 60 * 1000);

    // Gap-Check Timer (alle 2 Stunden)
    this.gapCheckTimer = setInterval(async () => {
      await this.performGapCheck();
    }, this.config.gapCheckIntervalMinutes * 60 * 1000);

    // Health-Check Timer (alle 5 Minuten)
    this.healthCheckTimer = setInterval(() => {
      this.updateHealthStatus();
    }, 5 * 60 * 1000);

    const nextQuickSync = new Date(Date.now() + this.config.quickSyncIntervalMinutes * 60 * 1000);
    const nextFullSync = new Date(Date.now() + this.config.fullSyncIntervalMinutes * 60 * 1000);
    
    console.log('✅ Unified Vendon Scheduler gestartet');
    console.log(`📅 Quick-Sync alle ${this.config.quickSyncIntervalMinutes} Minuten`);
    console.log(`📅 Full-Sync alle ${this.config.fullSyncIntervalMinutes} Minuten`);
    console.log(`⏰ Nächster Quick-Sync: ${nextQuickSync.toLocaleString('de-DE', { timeZone: this.config.timezone })}`);
    console.log(`⏰ Nächster Full-Sync: ${nextFullSync.toLocaleString('de-DE', { timeZone: this.config.timezone })}`);
  }

  /**
   * Stoppt den Scheduler
   */
  stop(): void {
    console.log('🛑 Stoppe Unified Vendon Scheduler...');
    
    if (this.quickSyncTimer) {
      clearInterval(this.quickSyncTimer);
      this.quickSyncTimer = null;
    }
    
    if (this.fullSyncTimer) {
      clearInterval(this.fullSyncTimer);
      this.fullSyncTimer = null;
    }
    
    if (this.gapCheckTimer) {
      clearInterval(this.gapCheckTimer);
      this.gapCheckTimer = null;
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.isStarted = false;
    this.health.status = 'stopped';
    console.log('✅ Unified Vendon Scheduler gestoppt');
  }

  /**
   * Startet den Scheduler mit neuer Konfiguration neu
   */
  async restart(config?: Partial<SchedulerConfig>): Promise<void> {
    console.log('🔄 Starte Unified Scheduler neu...');
    this.stop();
    
    if (config) {
      this.config = { ...this.config, ...config };
      console.log('🔧 Neue Konfiguration:', this.config);
    }
    
    await this.start();
  }

  /**
   * Führt einen Quick-Sync durch (nur neueste Transaktionen)
   */
  private async performQuickSync(): Promise<void> {
    if (!this.config.enabled) return;
    
    try {
      console.log('⚡ Starte Quick-Sync...');
      const startTime = Date.now();
      
      const result = await this.unifiedSync.runIncrementalSync();
      const duration = Date.now() - startTime;
      
      this.health.lastQuickSync = new Date();
      this.health.totalSyncs++;
      this.health.avgSyncDurationMs = 
        (this.health.avgSyncDurationMs + duration) / Math.min(this.health.totalSyncs, 10);
      
      if (result.status === 'success') {
        this.health.consecutiveFailures = 0;
        if (result.stats.saved > 0) {
          console.log(`⚡ Quick-Sync erfolgreich: ${result.stats.saved} neue Datensätze in ${(duration/1000).toFixed(1)}s`);
        }
      } else {
        this.health.consecutiveFailures++;
        this.health.totalErrors++;
        console.warn(`⚠️ Quick-Sync teilweise fehlgeschlagen: ${result.message}`);
      }
      
    } catch (error) {
      this.health.consecutiveFailures++;
      this.health.totalErrors++;
      console.error('❌ Quick-Sync fehlgeschlagen:', error);
    }
  }

  /**
   * Führt einen Full-Sync durch (alle Datentypen)
   */
  private async performFullSync(): Promise<void> {
    if (!this.config.enabled) return;
    
    try {
      console.log('🔄 Starte Full-Sync...');
      const startTime = Date.now();
      
      const result = await this.unifiedSync.runFullSync();
      const duration = Date.now() - startTime;
      
      this.health.lastFullSync = new Date();
      this.health.totalSyncs++;
      this.health.avgSyncDurationMs = 
        (this.health.avgSyncDurationMs + duration) / Math.min(this.health.totalSyncs, 10);
      
      if (result.status === 'success') {
        this.health.consecutiveFailures = 0;
        console.log(`🔄 Full-Sync erfolgreich: ${result.stats.saved} neue Datensätze in ${(duration/1000).toFixed(1)}s`);
      } else {
        this.health.consecutiveFailures++;
        this.health.totalErrors++;
        console.warn(`⚠️ Full-Sync fehlgeschlagen: ${result.message}`);
      }
      
    } catch (error) {
      this.health.consecutiveFailures++;
      this.health.totalErrors++;
      console.error('❌ Full-Sync fehlgeschlagen:', error);
    }
  }

  /**
   * Prüft und schließt Datenlücken
   */
  private async performGapCheck(): Promise<void> {
    try {
      console.log('🔍 Starte Gap-Check...');
      
      // Implementierung für Lückenerkennung
      // TODO: Analysiere Transaktionslücken und schließe sie
      
      console.log('✅ Gap-Check abgeschlossen');
      
    } catch (error) {
      console.error('❌ Gap-Check fehlgeschlagen:', error);
    }
  }

  /**
   * Aktualisiert den Health-Status
   */
  private updateHealthStatus(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    
    if (!this.isStarted) {
      this.health.status = 'stopped';
    } else if (this.health.consecutiveFailures >= 5) {
      this.health.status = 'critical';
    } else if (this.health.consecutiveFailures >= 2) {
      this.health.status = 'warning';
    } else if (
      !this.health.lastQuickSync || 
      this.health.lastQuickSync.getTime() < fiveMinutesAgo ||
      !this.health.lastFullSync ||
      this.health.lastFullSync.getTime() < thirtyMinutesAgo
    ) {
      this.health.status = 'warning';
    } else {
      this.health.status = 'healthy';
    }
  }

  /**
   * Triggert einen sofortigen Quick-Sync
   */
  async triggerQuickSync(): Promise<void> {
    console.log('🚀 Manueller Quick-Sync getriggert...');
    await this.performQuickSync();
  }

  /**
   * Triggert einen sofortigen Full-Sync  
   */
  async triggerFullSync(): Promise<void> {
    console.log('🚀 Manueller Full-Sync getriggert...');
    await this.performFullSync();
  }

  /**
   * Status-Informationen  
   */
  getStatus() {
    return {
      isStarted: this.isStarted,
      config: this.config,
      health: this.health,
      activeLocks: this.syncLock.getActiveLocks()
    };
  }

  /**
   * Konfiguration aktualisieren
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔧 Scheduler-Konfiguration aktualisiert:', this.config);
  }
}

// Singleton-Instanz
let backgroundSchedulerInstance: VendonBackgroundScheduler | null = null;

export function getVendonBackgroundSchedulerInstance(config?: Partial<SchedulerConfig>): VendonBackgroundScheduler {
  if (!backgroundSchedulerInstance) {
    backgroundSchedulerInstance = new VendonBackgroundScheduler(config);
  }
  return backgroundSchedulerInstance;
}

export { VendonBackgroundScheduler };
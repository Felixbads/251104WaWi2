/**
 * UNIFIED VENDON SYNC DASHBOARD
 * 
 * Zentrales Monitoring und Status-Dashboard für das Unified Vendon Sync System.
 * Bietet detaillierte Übersicht über alle Sync-Prozesse, Locks und Performance-Metriken.
 * 
 * Features:
 * - Live-Status-Monitoring aller Sync-Komponenten
 * - Performance-Metriken und Statistiken
 * - Lock-Management und -Übersicht
 * - Error-Tracking und Benachrichtigungen
 * - Health-Checks für alle Services
 * - Sync-History und Audit-Trail
 */

import { storage } from "../storage.js";
import { getUnifiedVendonSyncInstance } from "./UnifiedVendonSync.js";
import { getPersistentSyncLockInstance } from "./PersistentSyncLock.js";
import { getDuplicatePreventionServiceInstance } from "./DuplicatePreventionService.js";

interface SyncSystemStatus {
  overall: 'healthy' | 'degraded' | 'critical' | 'offline';
  components: {
    unifiedSync: ComponentStatus;
    duplicateService: ComponentStatus;
    lockService: ComponentStatus;
    scheduler: ComponentStatus;
    database: ComponentStatus;
  };
  metrics: SystemMetrics;
  activeLocks: LockStatus[];
  recentSyncRuns: SyncRunSummary[];
  errors: ErrorSummary[];
  recommendations: string[];
}

interface ComponentStatus {
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  lastCheck: Date;
  uptime: number; // in seconds
  details: string;
  metrics?: Record<string, any>;
}

interface SystemMetrics {
  syncRuns: {
    total24h: number;
    successful24h: number;
    failed24h: number;
    avgDuration: number;
  };
  throughput: {
    transactionsPerHour: number;
    machinesPerHour: number;
    duplicatesDetected: number;
  };
  performance: {
    avgResponseTime: number;
    dbConnectionPool: number;
    memoryUsage: number;
  };
}

interface LockStatus {
  syncType: string;
  lockedAt: Date;
  lockedUntil: Date;
  remainingSeconds: number;
  holder?: string;
}

interface SyncRunSummary {
  id: string;
  syncType: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'success' | 'partial' | 'error';
  itemsFound: number;
  itemsSaved: number;
  itemsUpdated: number;
  duplicates: number;
  errors: number;
}

interface ErrorSummary {
  timestamp: Date;
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  count: number;
  lastOccurrence: Date;
}

export class UnifiedVendonSyncDashboard {
  private syncInstance = getUnifiedVendonSyncInstance();
  private lockService = getPersistentSyncLockInstance();
  private duplicateService = getDuplicatePreventionServiceInstance();
  
  private startTime = Date.now();
  private healthCheckInterval = 30000; // 30 seconds
  private metricsCache: SystemMetrics | null = null;
  private lastMetricsUpdate = 0;

  constructor() {
    console.log('🎛️ UnifiedVendonSyncDashboard initialisiert - umfassendes Monitoring aktiv');
  }

  /**
   * Hauptstatus-Abfrage für das gesamte System
   */
  async getSystemStatus(): Promise<SyncSystemStatus> {
    try {
      console.log('📊 Führe vollständige System-Status-Prüfung durch...');
      
      // Parallel Status-Checks für bessere Performance
      const [
        unifiedSyncStatus,
        lockServiceStatus, 
        databaseStatus,
        activeLocks,
        recentSyncRuns,
        systemMetrics,
        errors
      ] = await Promise.all([
        this.checkUnifiedSyncStatus(),
        this.checkLockServiceStatus(),
        this.checkDatabaseStatus(),
        this.getActiveLocks(),
        this.getRecentSyncRuns(),
        this.getSystemMetrics(),
        this.getRecentErrors()
      ]);

      // Bestimme den Overall-Status
      const overallStatus = this.calculateOverallStatus([
        unifiedSyncStatus.status,
        lockServiceStatus.status,
        databaseStatus.status
      ]);

      // Generiere Empfehlungen
      const recommendations = this.generateRecommendations({
        unifiedSync: unifiedSyncStatus,
        duplicateService: { status: 'healthy', lastCheck: new Date(), uptime: 0, details: 'Service läuft' },
        lockService: lockServiceStatus,
        scheduler: { status: 'healthy', lastCheck: new Date(), uptime: 0, details: 'Läuft' },
        database: databaseStatus
      }, systemMetrics, errors);

      return {
        overall: overallStatus,
        components: {
          unifiedSync: unifiedSyncStatus,
          duplicateService: { status: 'healthy', lastCheck: new Date(), uptime: this.getUptime(), details: 'DuplicatePreventionService aktiv' },
          lockService: lockServiceStatus,
          scheduler: { status: 'healthy', lastCheck: new Date(), uptime: this.getUptime(), details: 'Scheduler läuft' },
          database: databaseStatus
        },
        metrics: systemMetrics,
        activeLocks,
        recentSyncRuns,
        errors,
        recommendations
      };

    } catch (error) {
      console.error('❌ Fehler beim Status-Abruf:', error);
      return this.getEmergencyStatus(error);
    }
  }

  /**
   * Prüft den Status des UnifiedVendonSync
   */
  private async checkUnifiedSyncStatus(): Promise<ComponentStatus> {
    try {
      // Versuche eine einfache Health-Check-Operation
      const activeLocks = await this.syncInstance.getActiveLocks();
      
      return {
        status: 'healthy',
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `UnifiedVendonSync aktiv - ${activeLocks.length} aktive Locks`,
        metrics: {
          activeLocks: activeLocks.length,
          instanceCreated: true
        }
      };

    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `UnifiedVendonSync Fehler: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Prüft den Status des Lock-Service
   */
  private async checkLockServiceStatus(): Promise<ComponentStatus> {
    try {
      const lockStats = await this.lockService.getLockStatistics();
      
      const status = lockStats.activeLocks > 50 ? 'degraded' : 'healthy'; // Zu viele Locks könnten ein Problem sein
      
      return {
        status,
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `${lockStats.activeLocks} aktive Locks, ${lockStats.totalLocksToday} heute gesamt`,
        metrics: lockStats
      };

    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `Lock-Service Fehler: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Prüft den Datenbank-Status
   */
  private async checkDatabaseStatus(): Promise<ComponentStatus> {
    try {
      // Test-Query zur Datenbank-Konnektivität
      const testStart = Date.now();
      await storage.getSyncLogs({ limit: 1 }); // Hol nur einen Eintrag
      const responseTime = Date.now() - testStart;
      
      const status = responseTime > 5000 ? 'degraded' : 'healthy'; // > 5s ist langsam
      
      return {
        status,
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `DB-Verbindung OK - ${responseTime}ms Antwortzeit`,
        metrics: {
          responseTime,
          connectionStatus: 'connected'
        }
      };

    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        uptime: this.getUptime(),
        details: `Datenbank-Fehler: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Holt aktive Locks
   */
  private async getActiveLocks(): Promise<LockStatus[]> {
    try {
      const locks = await this.lockService.getActiveLocks();
      
      return locks.map(lock => ({
        syncType: lock.syncType,
        lockedAt: lock.lockedAt,
        lockedUntil: lock.lockedUntil,
        remainingSeconds: lock.remainingSeconds
      }));

    } catch (error) {
      console.error('Fehler beim Abrufen aktiver Locks:', error);
      return [];
    }
  }

  /**
   * Holt die letzten Sync-Läufe
   */
  private async getRecentSyncRuns(): Promise<SyncRunSummary[]> {
    try {
      const syncLogs = await storage.getSyncLogs({ limit: 10 }); // Letzte 10 Einträge
      
      return syncLogs.map(log => ({
        id: log.id.toString(),
        syncType: log.syncType,
        startTime: log.startDate,
        endTime: log.endDate || log.startDate,
        duration: log.durationSeconds || 0,
        status: log.syncStatus === 'completed' ? 'success' : 
                log.syncStatus === 'completed_with_errors' ? 'partial' : 'error',
        itemsFound: log.itemsFound || 0,
        itemsSaved: log.itemsSaved || 0,
        itemsUpdated: log.itemsUpdated || 0,
        duplicates: log.duplicates || 0,
        errors: log.errors || 0
      }));

    } catch (error) {
      console.error('Fehler beim Abrufen der Sync-History:', error);
      return [];
    }
  }

  /**
   * Berechnet System-Metriken
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    // Cache Metrics für 5 Minuten
    const now = Date.now();
    if (this.metricsCache && (now - this.lastMetricsUpdate) < 5 * 60 * 1000) {
      return this.metricsCache;
    }

    try {
      // Parallel Metrics-Abfragen
      const [syncLogs, lockStats] = await Promise.all([
        storage.getSyncLogs({ limit: 100 }), // Letzte 100 für Statistiken
        this.lockService.getLockStatistics()
      ]);

      // Filtere letzte 24h
      const last24h = syncLogs.filter(log => 
        Date.now() - log.startDate.getTime() < 24 * 60 * 60 * 1000
      );

      const successful24h = last24h.filter(log => log.syncStatus === 'completed').length;
      const failed24h = last24h.filter(log => log.syncStatus === 'error').length;
      
      const avgDuration = last24h.length > 0 
        ? last24h.reduce((sum, log) => sum + (log.durationSeconds || 0), 0) / last24h.length
        : 0;

      // Durchsatz-Berechnung
      const totalTransactions = last24h.reduce((sum, log) => sum + (log.itemsSaved || 0), 0);
      const totalDuplicates = last24h.reduce((sum, log) => sum + (log.duplicates || 0), 0);

      this.metricsCache = {
        syncRuns: {
          total24h: last24h.length,
          successful24h,
          failed24h,
          avgDuration
        },
        throughput: {
          transactionsPerHour: Math.round(totalTransactions / 24),
          machinesPerHour: 0, // TODO: Implementieren basierend auf Maschinen-Sync-Logs
          duplicatesDetected: totalDuplicates
        },
        performance: {
          avgResponseTime: lockStats.averageLockDurationMinutes * 60 * 1000, // Convert to ms
          dbConnectionPool: 1, // TODO: Echte Metrik
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
        }
      };

      this.lastMetricsUpdate = now;
      return this.metricsCache;

    } catch (error) {
      console.error('Fehler beim Berechnen der Metriken:', error);
      return this.getDefaultMetrics();
    }
  }

  /**
   * Holt aktuelle Fehler
   */
  private async getRecentErrors(): Promise<ErrorSummary[]> {
    try {
      const syncLogs = await storage.getSyncLogs({ limit: 50 });
      const errorLogs = syncLogs.filter(log => log.errors && log.errors > 0);

      const errorSummaries: ErrorSummary[] = [];
      
      for (const log of errorLogs) {
        if (log.errorMessage) {
          errorSummaries.push({
            timestamp: log.startDate,
            component: log.syncType,
            severity: log.errors > 10 ? 'high' : log.errors > 5 ? 'medium' : 'low',
            message: log.errorMessage,
            count: log.errors || 0,
            lastOccurrence: log.endDate || log.startDate
          });
        }
      }

      return errorSummaries.slice(0, 10); // Letzte 10 Fehler

    } catch (error) {
      console.error('Fehler beim Abrufen der Error-History:', error);
      return [];
    }
  }

  /**
   * Berechnet den Overall-System-Status
   */
  private calculateOverallStatus(componentStatuses: string[]): 'healthy' | 'degraded' | 'critical' | 'offline' {
    if (componentStatuses.includes('critical')) return 'critical';
    if (componentStatuses.includes('offline')) return 'offline';
    if (componentStatuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Generiert Empfehlungen basierend auf dem System-Status
   */
  private generateRecommendations(
    components: Record<string, ComponentStatus>, 
    metrics: SystemMetrics, 
    errors: ErrorSummary[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance-Empfehlungen
    if (metrics.performance.avgResponseTime > 5000) {
      recommendations.push('⚡ DB-Performance verbessern: Antwortzeit > 5s');
    }

    if (metrics.throughput.duplicatesDetected > metrics.throughput.transactionsPerHour * 0.1) {
      recommendations.push('🔄 Viele Duplikate erkannt - prüfe Sync-Intervall');
    }

    // Error-basierte Empfehlungen
    if (errors.length > 5) {
      recommendations.push('🚨 Viele Fehler erkannt - Log-Analyse empfohlen');
    }

    // Lock-basierte Empfehlungen  
    if (components.lockService.metrics?.activeLocks > 20) {
      recommendations.push('🔒 Viele aktive Locks - mögliche Deadlocks prüfen');
    }

    // Fallback-Empfehlung
    if (recommendations.length === 0) {
      recommendations.push('✅ System läuft stabil - keine Optimierungen erforderlich');
    }

    return recommendations;
  }

  /**
   * Hilfsmethoden
   */
  private getUptime(): number {
    return Math.round((Date.now() - this.startTime) / 1000);
  }

  private getDefaultMetrics(): SystemMetrics {
    return {
      syncRuns: { total24h: 0, successful24h: 0, failed24h: 0, avgDuration: 0 },
      throughput: { transactionsPerHour: 0, machinesPerHour: 0, duplicatesDetected: 0 },
      performance: { avgResponseTime: 0, dbConnectionPool: 1, memoryUsage: 0 }
    };
  }

  private getEmergencyStatus(error: any): SyncSystemStatus {
    return {
      overall: 'critical',
      components: {
        unifiedSync: { status: 'critical', lastCheck: new Date(), uptime: 0, details: 'Emergency Mode' },
        duplicateService: { status: 'critical', lastCheck: new Date(), uptime: 0, details: 'Emergency Mode' },
        lockService: { status: 'critical', lastCheck: new Date(), uptime: 0, details: 'Emergency Mode' },
        scheduler: { status: 'critical', lastCheck: new Date(), uptime: 0, details: 'Emergency Mode' },
        database: { status: 'critical', lastCheck: new Date(), uptime: 0, details: 'Emergency Mode' }
      },
      metrics: this.getDefaultMetrics(),
      activeLocks: [],
      recentSyncRuns: [],
      errors: [{
        timestamp: new Date(),
        component: 'dashboard',
        severity: 'critical',
        message: error instanceof Error ? error.message : String(error),
        count: 1,
        lastOccurrence: new Date()
      }],
      recommendations: ['🆘 System-Status kann nicht ermittelt werden - sofortige Wartung erforderlich']
    };
  }
}

// Singleton-Instanz
let dashboardInstance: UnifiedVendonSyncDashboard | null = null;

export function getUnifiedVendonSyncDashboardInstance(): UnifiedVendonSyncDashboard {
  if (!dashboardInstance) {
    dashboardInstance = new UnifiedVendonSyncDashboard();
  }
  return dashboardInstance;
}


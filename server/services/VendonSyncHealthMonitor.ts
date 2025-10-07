/**
 * Vendon Sync Health Monitor
 * Überwacht die Gesundheit und Performance des Vendon-Synchronisationssystems
 */

import { Pool } from 'pg';

interface HealthMetrics {
  syncStatus: 'healthy' | 'degraded' | 'critical';
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean;
  transactionsSynced24h: number;
  duplicatesFound24h: number;
  errorRate24h: number;
  averageResponseTime: number;
  apiCallsToday: number;
  activeImports: number;
  systemLoad: {
    cpu: number;
    memory: number;
    database: number;
  };
}

interface SyncStatistics {
  totalTransactions: number;
  successRate: number;
  averageBatchSize: number;
  peakHours: string[];
  commonErrors: { error: string; count: number }[];
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

interface AlertConfig {
  errorRateThreshold: number;
  responseTimeThreshold: number;
  duplicateRateThreshold: number;
  enableEmailAlerts: boolean;
  alertEmails: string[];
}

export class VendonSyncHealthMonitor {
  private pool: Pool;
  private alertConfig: AlertConfig = {
    errorRateThreshold: 0.05, // 5%
    responseTimeThreshold: 5000, // 5 Sekunden
    duplicateRateThreshold: 0.8, // 80%
    enableEmailAlerts: true,
    alertEmails: ['admin@proviantomat.de']
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Gibt aktuellen Gesundheitsstatus zurück
   */
  async getHealthStatus(): Promise<HealthMetrics> {
    const [
      lastSync,
      transactions24h,
      duplicates24h,
      errors24h,
      responseTime,
      apiCalls,
      activeImports
    ] = await Promise.all([
      this.getLastSyncInfo(),
      this.getTransactionCount24h(),
      this.getDuplicateCount24h(),
      this.getErrorCount24h(),
      this.getAverageResponseTime(),
      this.getApiCallsToday(),
      this.getActiveImportsCount()
    ]);

    const errorRate = transactions24h > 0 ? errors24h / transactions24h : 0;
    
    // Gesundheitsstatus berechnen
    let syncStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (errorRate > this.alertConfig.errorRateThreshold * 2 || 
        responseTime > this.alertConfig.responseTimeThreshold ||
        !lastSync.success ||
        (lastSync.timestamp && (Date.now() - lastSync.timestamp.getTime()) > 6 * 60 * 60 * 1000)) {
      syncStatus = 'critical';
    } else if (errorRate > this.alertConfig.errorRateThreshold ||
               responseTime > this.alertConfig.responseTimeThreshold * 0.8 ||
               duplicates24h / Math.max(transactions24h, 1) > this.alertConfig.duplicateRateThreshold) {
      syncStatus = 'degraded';
    }

    return {
      syncStatus,
      lastSyncTime: lastSync.timestamp,
      lastSyncSuccess: lastSync.success,
      transactionsSynced24h: transactions24h,
      duplicatesFound24h: duplicates24h,
      errorRate24h: errorRate,
      averageResponseTime: responseTime,
      apiCallsToday: apiCalls,
      activeImports: activeImports,
      systemLoad: await this.getSystemLoad()
    };
  }

  /**
   * Detaillierte Sync-Statistiken
   */
  async getSyncStatistics(): Promise<SyncStatistics> {
    const query = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as recent_transactions,
        AVG(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1.0 ELSE 0.0 END) as success_rate,
        COUNT(DISTINCT DATE_TRUNC('hour', datetime)) as active_hours
      FROM transactions 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    const errorQuery = `
      SELECT 
        error_message,
        COUNT(*) as error_count
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '7 days' 
        AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY error_count DESC
      LIMIT 5
    `;

    const [statsResult, errorResult] = await Promise.all([
      this.pool.query(query),
      this.pool.query(errorQuery)
    ]);

    const stats = statsResult.rows[0];
    const errors = errorResult.rows;

    // Peak-Stunden ermitteln
    const peakHoursQuery = `
      SELECT 
        EXTRACT(hour FROM datetime) as hour,
        COUNT(*) as transaction_count
      FROM transactions 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY EXTRACT(hour FROM datetime)
      ORDER BY transaction_count DESC
      LIMIT 3
    `;
    
    const peakResult = await this.pool.query(peakHoursQuery);
    const peakHours = peakResult.rows.map(row => `${row.hour}:00-${row.hour + 1}:00`);

    // Performance-Trend berechnen
    const trendQuery = `
      SELECT 
        DATE_TRUNC('day', created_at) as day,
        COUNT(*) as daily_transactions,
        COUNT(CASE WHEN sync_result = 'success' THEN 1 END) as daily_success
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `;
    
    const trendResult = await this.pool.query(trendQuery);
    const performanceTrend = this.calculatePerformanceTrend(trendResult.rows);

    return {
      totalTransactions: parseInt(stats.total_transactions),
      successRate: parseFloat(stats.success_rate),
      averageBatchSize: Math.round(parseInt(stats.recent_transactions) / Math.max(parseInt(stats.active_hours), 1)),
      peakHours,
      commonErrors: errors.map(e => ({ error: e.error_message, count: parseInt(e.error_count) })),
      performanceTrend
    };
  }

  /**
   * Dashboard-Daten für Frontend
   */
  async getDashboardData(): Promise<{
    health: HealthMetrics;
    statistics: SyncStatistics;
    recentSyncs: any[];
    alerts: string[];
  }> {
    const [health, statistics, recentSyncs] = await Promise.all([
      this.getHealthStatus(),
      this.getSyncStatistics(),
      this.getRecentSyncLogs()
    ]);

    const alerts = await this.generateAlerts(health, statistics);

    return {
      health,
      statistics,
      recentSyncs,
      alerts
    };
  }

  /**
   * Führt Gesundheitsprüfung durch und sendet Benachrichtigungen
   */
  async performHealthCheck(): Promise<void> {
    console.log('🏥 Starte Vendon Sync Health Check...');
    
    const health = await this.getHealthStatus();
    const statistics = await this.getSyncStatistics();
    
    // Log Health Status
    await this.logHealthStatus(health);
    
    // Check für kritische Probleme
    if (health.syncStatus === 'critical') {
      const alerts = await this.generateAlerts(health, statistics);
      console.error('🚨 KRITISCH: Vendon Sync Health Check fehlgeschlagen:', alerts);
      
      if (this.alertConfig.enableEmailAlerts) {
        await this.sendHealthAlert('critical', alerts);
      }
    } else if (health.syncStatus === 'degraded') {
      const alerts = await this.generateAlerts(health, statistics);
      console.warn('⚠️ WARNUNG: Vendon Sync Performance degradiert:', alerts);
      
      if (this.alertConfig.enableEmailAlerts) {
        await this.sendHealthAlert('warning', alerts);
      }
    } else {
      console.log('✅ Vendon Sync System ist gesund');
    }
    
    // Performance-Optimierungsempfehlungen
    const recommendations = await this.generateRecommendations(health, statistics);
    if (recommendations.length > 0) {
      console.log('💡 Performance-Empfehlungen:', recommendations);
    }
  }

  // Private Helper-Methoden

  private async getLastSyncInfo(): Promise<{ timestamp: Date | null; success: boolean }> {
    const query = `
      SELECT created_at, sync_result 
      FROM sync_logs 
      WHERE service_type = 'enhanced_transactions_sync'
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const result = await this.pool.query(query);
    if (result.rows.length === 0) {
      return { timestamp: null, success: false };
    }
    
    const row = result.rows[0];
    return {
      timestamp: row.created_at,
      success: row.sync_result === 'success'
    };
  }

  private async getTransactionCount24h(): Promise<number> {
    const query = `
      SELECT COUNT(*) as count 
      FROM transactions 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND source IN ('REALTIME', 'enhanced_sync')
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.count || 0);
  }

  private async getDuplicateCount24h(): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(duplicates), 0) as count
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND duplicates IS NOT NULL
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.count || 0);
  }

  private async getErrorCount24h(): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND (sync_result = 'error' OR error_message IS NOT NULL)
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.count || 0);
  }

  private async getAverageResponseTime(): Promise<number> {
    const query = `
      SELECT AVG(duration_seconds * 1000) as avg_duration
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND duration_seconds IS NOT NULL
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.avg_duration || 0);
  }

  private async getApiCallsToday(): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM sync_logs 
      WHERE created_at >= CURRENT_DATE
        AND service_type LIKE '%vendon%'
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.count || 0);
  }

  private async getActiveImportsCount(): Promise<number> {
    // sync_state Tabelle hat keine status Spalte - verwende sync_logs stattdessen
    const query = `
      SELECT COUNT(*) as count
      FROM sync_logs 
      WHERE sync_status = 'running' 
        AND created_at >= NOW() - INTERVAL '1 hour'
    `;
    
    const result = await this.pool.query(query);
    return parseInt(result.rows[0]?.count || 0);
  }

  private async getSystemLoad(): Promise<{ cpu: number; memory: number; database: number }> {
    // Vereinfachte System-Load-Simulation (in einer realen Implementierung würde man tatsächliche Systemmetriken verwenden)
    const dbQuery = `
      SELECT 
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
        (SELECT COUNT(*) FROM pg_locks) as locks
    `;
    
    const result = await this.pool.query(dbQuery);
    const dbStats = result.rows[0];
    
    return {
      cpu: Math.random() * 100, // Placeholder
      memory: Math.random() * 100, // Placeholder  
      database: Math.min(100, (parseInt(dbStats.active_connections) * 5) + (parseInt(dbStats.locks) * 2))
    };
  }

  private async getRecentSyncLogs(): Promise<any[]> {
    const query = `
      SELECT 
        created_at,
        service_type,
        sync_status,
        items_found,
        items_saved,
        duplicates,
        errors,
        duration_seconds,
        error_message
      FROM sync_logs 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const result = await this.pool.query(query);
    return result.rows;
  }

  private calculatePerformanceTrend(trendData: any[]): 'improving' | 'stable' | 'degrading' {
    if (trendData.length < 2) return 'stable';
    
    const recent = trendData.slice(0, 3);
    const older = trendData.slice(3, 6);
    
    const recentAvg = recent.reduce((sum, day) => sum + parseInt(day.daily_success || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, day) => sum + parseInt(day.daily_success || 0), 0) / older.length;
    
    if (recentAvg > olderAvg * 1.1) return 'improving';
    if (recentAvg < olderAvg * 0.9) return 'degrading';
    return 'stable';
  }

  private async generateAlerts(health: HealthMetrics, stats: SyncStatistics): Promise<string[]> {
    const alerts: string[] = [];
    
    if (health.errorRate24h > this.alertConfig.errorRateThreshold) {
      alerts.push(`Hohe Fehlerrate: ${(health.errorRate24h * 100).toFixed(1)}% (Schwelle: ${this.alertConfig.errorRateThreshold * 100}%)`);
    }
    
    if (health.averageResponseTime > this.alertConfig.responseTimeThreshold) {
      alerts.push(`Langsame API-Antwortzeiten: ${health.averageResponseTime}ms (Schwelle: ${this.alertConfig.responseTimeThreshold}ms)`);
    }
    
    if (!health.lastSyncSuccess) {
      alerts.push('Letzte Synchronisation fehlgeschlagen');
    }
    
    if (health.lastSyncTime && (Date.now() - health.lastSyncTime.getTime()) > 6 * 60 * 60 * 1000) {
      alerts.push('Keine Synchronisation in den letzten 6 Stunden');
    }
    
    if (health.activeImports > 5) {
      alerts.push(`Viele aktive Importe: ${health.activeImports} (möglicherweise hängende Prozesse)`);
    }
    
    if (stats.performanceTrend === 'degrading') {
      alerts.push('Performance-Trend verschlechtert sich');
    }
    
    return alerts;
  }

  private async generateRecommendations(health: HealthMetrics, stats: SyncStatistics): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (health.duplicatesFound24h / Math.max(health.transactionsSynced24h, 1) > 0.9) {
      recommendations.push('Sehr hohe Duplikatrate - prüfen Sie die Zeitfenster-Konfiguration');
    }
    
    if (health.averageResponseTime > 3000) {
      recommendations.push('Langsame API-Antworten - erwägen Sie längere Request-Delays');
    }
    
    if (stats.averageBatchSize < 50) {
      recommendations.push('Kleine Batch-Größen - erwägen Sie größere Zeitfenster');
    }
    
    if (health.apiCallsToday > 1000) {
      recommendations.push('Viele API-Aufrufe heute - überwachen Sie die Vendon API-Limits');
    }
    
    return recommendations;
  }

  private async logHealthStatus(health: HealthMetrics): Promise<void> {
    const query = `
      INSERT INTO sync_logs (
        service_type, sync_status, items_found, items_saved, duplicates, 
        errors, duration_seconds, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;
    
    await this.pool.query(query, [
      'health_monitor',
      health.syncStatus,
      health.transactionsSynced24h,
      0, // items_saved - für health monitor nicht relevant
      health.duplicatesFound24h,
      Math.round(health.errorRate24h * 100), // errors als Ganzzahl
      health.averageResponseTime / 1000 // duration_seconds
    ]);
  }

  private async sendHealthAlert(severity: 'critical' | 'warning', alerts: string[]): Promise<void> {
    // Placeholder für E-Mail-Benachrichtigung
    // In einer realen Implementierung würde hier der E-Mail-Service aufgerufen
    console.log(`📧 Health Alert [${severity.toUpperCase()}]:`, alerts);
  }
}
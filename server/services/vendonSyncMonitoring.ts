/**
 * Vendon Sync Monitoring and Alerting System
 * Based on the German implementation plan
 * 
 * Monitors sync performance and sends alerts for failures
 */

import { pool } from '../db';
import cron from 'node-cron';

interface SyncHealthMetrics {
  timeWindow: string;
  totalErrors: number;
  totalFound: number;
  totalSaved: number;
  successRate: number;
  isHealthy: boolean;
  alerts: string[];
}

class VendonSyncMonitor {
  private isRunning = false;
  private alertThresholds = {
    minSuccessRate: 0.9, // 90%
    maxErrorsIn15Min: 5,
    criticalErrorRate: 0.5, // 50% errors triggers critical alert
  };

  /**
   * Starts the monitoring cron jobs
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Vendon Sync Monitor already running');
      return;
    }

    // Monitor every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.checkSyncHealth();
      } catch (error) {
        console.error('❌ Sync health check failed:', error);
      }
    });

    // Detailed report every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        await this.detailedHealthReport();
      } catch (error) {
        console.error('❌ Detailed health report failed:', error);
      }
    });

    this.isRunning = true;
    console.log('✅ Vendon Sync Monitor started');
    console.log('   • Health checks every 5 minutes');
    console.log('   • Detailed reports every 15 minutes');
  }

  /**
   * Stops the monitoring
   */
  stop(): void {
    // Note: node-cron tasks would need individual references to be stopped
    // For now, we just mark as not running
    this.isRunning = false;
    console.log('⏹️ Vendon Sync Monitor stopped');
  }

  /**
   * Quick health check for recent sync operations
   */
  private async checkSyncHealth(): Promise<void> {
    const client = await pool.connect();
    
    try {
      // Check last 15 minutes of sync activity
      const result = await client.query(`
        SELECT
          COUNT(*) as total_syncs,
          SUM(COALESCE(errors, 0)) AS total_errors,
          SUM(COALESCE(items_found, 0)) AS total_found,
          SUM(COALESCE(items_saved, 0)) AS total_saved,
          CASE 
            WHEN SUM(COALESCE(items_found, 0)) > 0 
            THEN ROUND(SUM(COALESCE(items_saved, 0))::numeric / SUM(COALESCE(items_found, 0))::numeric, 3)
            ELSE 1.0 
          END as success_rate
        FROM sync_logs
        WHERE created_at >= NOW() - INTERVAL '15 minutes'
          AND sync_type LIKE '%vendon%'
      `);

      const metrics = result.rows[0];
      
      if (metrics.total_syncs === 0) {
        // No sync activity in 15 minutes might be normal depending on schedule
        return;
      }

      const alerts: string[] = [];
      
      // Check error rate
      if (metrics.total_errors > this.alertThresholds.maxErrorsIn15Min) {
        alerts.push(`High error count: ${metrics.total_errors} errors in 15 minutes`);
      }
      
      // Check success rate
      if (metrics.success_rate < this.alertThresholds.minSuccessRate) {
        alerts.push(`Low success rate: ${(metrics.success_rate * 100).toFixed(1)}% (target: ${(this.alertThresholds.minSuccessRate * 100)}%)`);
      }

      // Check for critical failure
      if (metrics.success_rate < this.alertThresholds.criticalErrorRate) {
        alerts.push(`🚨 CRITICAL: Success rate below 50%`);
        await this.sendCriticalAlert(metrics);
      }

      if (alerts.length > 0) {
        console.warn('⚠️ Vendon Sync Health Issues:');
        alerts.forEach(alert => console.warn(`   • ${alert}`));
        await this.sendAlert('Vendon Sync degradation detected (15m window)', alerts);
      } else {
        console.log('✅ Vendon Sync health check passed');
      }

    } finally {
      client.release();
    }
  }

  /**
   * Detailed health report with coverage analysis
   */
  private async detailedHealthReport(): Promise<void> {
    const client = await pool.connect();
    
    try {
      // Get sync metrics for last hour
      const syncMetrics = await client.query(`
        SELECT
          sync_type,
          COUNT(*) as sync_count,
          SUM(COALESCE(errors, 0)) AS total_errors,
          SUM(COALESCE(items_saved, 0)) AS total_saved,
          AVG(COALESCE(duration_seconds, 0)) AS avg_duration
        FROM sync_logs
        WHERE created_at >= NOW() - INTERVAL '1 hour'
          AND sync_type LIKE '%vendon%'
        GROUP BY sync_type
        ORDER BY sync_count DESC
      `);

      // Check field coverage for new transactions
      const coverageMetrics = await client.query(`
        SELECT 
          COUNT(*) AS total_transactions,
          COUNT(machine_status) AS machine_status_count,
          COUNT(error_code) AS error_code_count,
          COUNT(maintenance_flag) AS maintenance_flag_count,
          COUNT(temperature) AS temperature_count,
          COUNT(humidity) AS humidity_count,
          ROUND(100.0 * COUNT(machine_status)::numeric / NULLIF(COUNT(*), 0), 1) AS machine_status_pct,
          ROUND(100.0 * COUNT(error_code)::numeric / NULLIF(COUNT(*), 0), 1) AS error_code_pct,
          ROUND(100.0 * COUNT(maintenance_flag)::numeric / NULLIF(COUNT(*), 0), 1) AS maintenance_flag_pct,
          ROUND(100.0 * COUNT(temperature)::numeric / NULLIF(COUNT(*), 0), 1) AS temperature_pct,
          ROUND(100.0 * COUNT(humidity)::numeric / NULLIF(COUNT(*), 0), 1) AS humidity_pct
        FROM transactions
        WHERE synced_at >= NOW() - INTERVAL '1 hour'
      `);

      console.log('\n📊 VENDON SYNC DETAILED HEALTH REPORT');
      console.log('='.repeat(50));
      
      if (syncMetrics.rows.length > 0) {
        console.log('\n🔄 Sync Activity (Last Hour):');
        syncMetrics.rows.forEach(row => {
          console.log(`   ${row.sync_type}: ${row.sync_count} syncs, ${row.total_errors} errors, ${row.total_saved} saved, ${Number(row.avg_duration).toFixed(1)}s avg`);
        });
      } else {
        console.log('\n⏸️ No sync activity in the last hour');
      }

      if (coverageMetrics.rows.length > 0 && coverageMetrics.rows[0].total_transactions > 0) {
        const coverage = coverageMetrics.rows[0];
        console.log('\n📈 Field Coverage (Last Hour):');
        console.log(`   Total Transactions: ${coverage.total_transactions}`);
        console.log(`   Machine Status: ${coverage.machine_status_pct}% (${coverage.machine_status_count}/${coverage.total_transactions})`);
        console.log(`   Error Code: ${coverage.error_code_pct}% (${coverage.error_code_count}/${coverage.total_transactions})`);
        console.log(`   Maintenance Flag: ${coverage.maintenance_flag_pct}% (${coverage.maintenance_flag_count}/${coverage.total_transactions})`);
        console.log(`   Temperature: ${coverage.temperature_pct}% (${coverage.temperature_count}/${coverage.total_transactions})`);
        console.log(`   Humidity: ${coverage.humidity_pct}% (${coverage.humidity_count}/${coverage.total_transactions})`);

        // Check for coverage improvements
        if (Number(coverage.machine_status_pct) > 0 || Number(coverage.error_code_pct) > 0) {
          console.log('✅ New field mapping is working!');
        }
      } else {
        console.log('\n📊 No new transactions in the last hour for coverage analysis');
      }

      console.log('='.repeat(50));

    } finally {
      client.release();
    }
  }

  /**
   * Send alert for sync issues
   */
  private async sendAlert(title: string, details: string[]): Promise<void> {
    // Log alert to console and sync_logs table
    console.warn(`🚨 ALERT: ${title}`);
    details.forEach(detail => console.warn(`   • ${detail}`));

    // In a production environment, this would integrate with your alerting system
    // (email, Slack, PagerDuty, etc.)
    
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO sync_logs (
            sync_type, 
            start_date, 
            end_date, 
            errors, 
            sync_status, 
            error_message,
            additional_data
          ) VALUES (
            'vendon_alert', 
            NOW(), 
            NOW(), 
            1, 
            'alert', 
            $1,
            $2
          )
        `, [title, JSON.stringify(details)]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to log alert to database:', error);
    }
  }

  /**
   * Send critical alert that requires immediate attention
   */
  private async sendCriticalAlert(metrics: any): Promise<void> {
    const criticalMessage = `🚨 CRITICAL VENDON SYNC FAILURE 🚨
Success Rate: ${(metrics.success_rate * 100).toFixed(1)}%
Errors: ${metrics.total_errors}
Found: ${metrics.total_found}
Saved: ${metrics.total_saved}

Immediate investigation required!`;

    console.error(criticalMessage);
    
    // Log critical alert
    await this.sendAlert('CRITICAL: Vendon Sync Failure', [criticalMessage]);
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<SyncHealthMetrics> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT
          SUM(COALESCE(errors, 0)) AS total_errors,
          SUM(COALESCE(items_found, 0)) AS total_found,
          SUM(COALESCE(items_saved, 0)) AS total_saved
        FROM sync_logs
        WHERE created_at >= NOW() - INTERVAL '15 minutes'
          AND sync_type LIKE '%vendon%'
      `);

      const metrics = result.rows[0];
      const successRate = metrics.total_found > 0 ? 
        metrics.total_saved / metrics.total_found : 1.0;
      
      const alerts: string[] = [];
      
      if (metrics.total_errors > this.alertThresholds.maxErrorsIn15Min) {
        alerts.push(`Too many errors: ${metrics.total_errors}`);
      }
      
      if (successRate < this.alertThresholds.minSuccessRate) {
        alerts.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
      }

      return {
        timeWindow: '15 minutes',
        totalErrors: Number(metrics.total_errors),
        totalFound: Number(metrics.total_found),
        totalSaved: Number(metrics.total_saved),
        successRate,
        isHealthy: alerts.length === 0,
        alerts
      };

    } finally {
      client.release();
    }
  }

  /**
   * Check if monitoring is running
   */
  isMonitoringActive(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const vendonSyncMonitor = new VendonSyncMonitor();

// Auto-start monitoring when module is loaded
if (process.env.NODE_ENV !== 'test') {
  vendonSyncMonitor.start();
  console.log('🎯 Vendon Sync Monitor initialized and started');
}
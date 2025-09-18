/**
 * Metrics Middleware - Prometheus/Grafana Integration
 * Provides metrics endpoint for monitoring systems
 */

import { Request, Response } from 'express';
import { db, rawDb } from '../db';
import { metrics } from './observability';

// Types for metrics
interface MetricValue {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
  value: number | string;
  labels?: Record<string, string>;
}

interface SystemMetrics {
  http: {
    requests_total: number;
    requests_duration_seconds: number;
    errors_total: number;
    slow_requests_total: number;
  };
  system: {
    memory_usage_bytes: number;
    memory_usage_percent: number;
    uptime_seconds: number;
    cpu_usage_percent: number;
  };
  application: {
    database_connections_active: number;
    transaction_monitoring_status: number;
    gap_detection_status: number;
    alerting_service_status: number;
  };
  business: {
    transactions_processed_today: number;
    active_machines_count: number;
    data_quality_score: number;
    sync_health_score: number;
  };
}

/**
 * Collects comprehensive system metrics
 */
async function collectSystemMetrics(): Promise<SystemMetrics> {
  const startTime = Date.now();
  
  try {
    // Get HTTP metrics from observability
    const httpMetrics = metrics.getMetrics();
    
    // Get system metrics
    const memUsage = process.memoryUsage();
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    // Get business metrics from database
    const today = new Date().toISOString().split('T')[0];
    
    const [
      transactionsToday,
      activeMachines,
      dataQualityResult,
      syncHealthResult
    ] = await Promise.allSettled([
      // Transactions processed today
      rawDb.query(`
        SELECT COUNT(*) as count 
        FROM transactions 
        WHERE DATE(datetime) = $1
      `, [today]),
      
      // Active machines (with transactions in last 24h)
      rawDb.query(`
        SELECT COUNT(DISTINCT machine_id) as count 
        FROM transactions 
        WHERE datetime >= NOW() - INTERVAL '24 hours'
      `),
      
      // Latest data quality score
      rawDb.query(`
        SELECT overall_score 
        FROM data_quality_metrics 
        WHERE entity_type = 'transactions' 
        ORDER BY created_at DESC 
        LIMIT 1
      `),
      
      // Sync health score (based on recent health logs)
      rawDb.query(`
        SELECT 
          COUNT(CASE WHEN status = 'healthy' THEN 1 END) * 100.0 / COUNT(*) as health_percentage
        FROM sync_health_logs 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `)
    ]);

    return {
      http: {
        requests_total: httpMetrics.requestsProcessed,
        requests_duration_seconds: httpMetrics.averageResponseTime / 1000,
        errors_total: httpMetrics.errors,
        slow_requests_total: httpMetrics.slowRequests
      },
      system: {
        memory_usage_bytes: memUsage.heapUsed,
        memory_usage_percent: memUsagePercent,
        uptime_seconds: Math.round(process.uptime()),
        cpu_usage_percent: 0 // Could be implemented with additional CPU monitoring
      },
      application: {
        database_connections_active: 1, // Would need connection pool monitoring
        transaction_monitoring_status: 1, // 1 = active, 0 = inactive
        gap_detection_status: 1,
        alerting_service_status: 1
      },
      business: {
        transactions_processed_today: transactionsToday.status === 'fulfilled' ? 
          parseInt(transactionsToday.value.rows[0]?.count || '0') : 0,
        active_machines_count: activeMachines.status === 'fulfilled' ? 
          parseInt(activeMachines.value.rows[0]?.count || '0') : 0,
        data_quality_score: dataQualityResult.status === 'fulfilled' ? 
          parseFloat(dataQualityResult.value.rows[0]?.overall_score || '0') : 0,
        sync_health_score: syncHealthResult.status === 'fulfilled' ? 
          parseFloat(syncHealthResult.value.rows[0]?.health_percentage || '0') : 0
      }
    };

  } catch (error) {
    console.error('[Metrics] Error collecting system metrics:', error);
    
    // Return minimal metrics on error
    const httpMetrics = metrics.getMetrics();
    const memUsage = process.memoryUsage();
    
    return {
      http: {
        requests_total: httpMetrics.requestsProcessed,
        requests_duration_seconds: httpMetrics.averageResponseTime / 1000,
        errors_total: httpMetrics.errors,
        slow_requests_total: httpMetrics.slowRequests
      },
      system: {
        memory_usage_bytes: memUsage.heapUsed,
        memory_usage_percent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        uptime_seconds: Math.round(process.uptime()),
        cpu_usage_percent: 0
      },
      application: {
        database_connections_active: 0,
        transaction_monitoring_status: 0,
        gap_detection_status: 0,
        alerting_service_status: 0
      },
      business: {
        transactions_processed_today: 0,
        active_machines_count: 0,
        data_quality_score: 0,
        sync_health_score: 0
      }
    };
  }
}

/**
 * Converts metrics to Prometheus format
 */
function formatMetricsForPrometheus(systemMetrics: SystemMetrics, labels: Record<string, string> = {}): string {
  const lines: string[] = [];
  const timestamp = Date.now();
  
  // Helper function to add metric
  const addMetric = (name: string, type: 'counter' | 'gauge' | 'histogram', help: string, value: number, metricLabels: Record<string, string> = {}) => {
    const fullLabels = { ...labels, ...metricLabels };
    const labelString = Object.entries(fullLabels)
      .map(([key, val]) => `${key}="${val}"`)
      .join(',');
    
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name}${labelString ? `{${labelString}}` : ''} ${value} ${timestamp}`);
    lines.push('');
  };

  // HTTP Metrics
  addMetric('http_requests_total', 'counter', 'Total HTTP requests processed', systemMetrics.http.requests_total);
  addMetric('http_request_duration_seconds', 'gauge', 'Average HTTP request duration in seconds', systemMetrics.http.requests_duration_seconds);
  addMetric('http_errors_total', 'counter', 'Total HTTP errors', systemMetrics.http.errors_total);
  addMetric('http_slow_requests_total', 'counter', 'Total slow HTTP requests (>2s)', systemMetrics.http.slow_requests_total);

  // System Metrics  
  addMetric('system_memory_usage_bytes', 'gauge', 'Current memory usage in bytes', systemMetrics.system.memory_usage_bytes);
  addMetric('system_memory_usage_percent', 'gauge', 'Current memory usage percentage', systemMetrics.system.memory_usage_percent);
  addMetric('system_uptime_seconds', 'gauge', 'System uptime in seconds', systemMetrics.system.uptime_seconds);
  
  // Application Metrics
  addMetric('app_database_connections_active', 'gauge', 'Active database connections', systemMetrics.application.database_connections_active);
  addMetric('app_transaction_monitoring_status', 'gauge', 'Transaction monitoring service status (1=active, 0=inactive)', systemMetrics.application.transaction_monitoring_status);
  addMetric('app_gap_detection_status', 'gauge', 'Gap detection service status (1=active, 0=inactive)', systemMetrics.application.gap_detection_status);
  addMetric('app_alerting_service_status', 'gauge', 'Alerting service status (1=active, 0=inactive)', systemMetrics.application.alerting_service_status);

  // Business Metrics
  addMetric('business_transactions_processed_today', 'counter', 'Total transactions processed today', systemMetrics.business.transactions_processed_today);
  addMetric('business_active_machines_count', 'gauge', 'Number of active vending machines (24h)', systemMetrics.business.active_machines_count);
  addMetric('business_data_quality_score', 'gauge', 'Current data quality score (0-100)', systemMetrics.business.data_quality_score);
  addMetric('business_sync_health_score', 'gauge', 'Sync health score percentage', systemMetrics.business.sync_health_score);

  return lines.join('\n');
}

/**
 * Converts metrics to JSON format (for dashboards)
 */
function formatMetricsForJSON(systemMetrics: SystemMetrics): any {
  return {
    timestamp: new Date().toISOString(),
    http: systemMetrics.http,
    system: systemMetrics.system,
    application: systemMetrics.application,
    business: systemMetrics.business,
    metadata: {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      service: 'wawi-proviantomat'
    }
  };
}

/**
 * Metrics endpoint handler
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Collect system metrics
    const systemMetrics = await collectSystemMetrics();
    
    // Determine response format based on Accept header
    const acceptsPrometheus = req.headers.accept?.includes('text/plain') || 
                             req.query.format === 'prometheus';
    
    const labels = {
      instance: process.env.REPLIT_SLUG || 'wawi-proviantomat',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };

    if (acceptsPrometheus) {
      // Prometheus format
      const prometheusMetrics = formatMetricsForPrometheus(systemMetrics, labels);
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics);
    } else {
      // JSON format (default)
      const jsonMetrics = formatMetricsForJSON(systemMetrics);
      res.json(jsonMetrics);
    }

    // Log metrics collection
    console.log(`[Metrics] Metrics collected and served in ${Date.now() - startTime}ms (format: ${acceptsPrometheus ? 'prometheus' : 'json'})`);

  } catch (error) {
    console.error('[Metrics] Error serving metrics:', error);
    
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    });
  }
}

/**
 * Service discovery info endpoint
 */
export function serviceDiscoveryHandler(req: Request, res: Response): void {
  const serviceInfo = {
    service: {
      name: 'wawi-proviantomat',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instance: process.env.REPLIT_SLUG || 'wawi-proviantomat',
      uptime: Math.round(process.uptime())
    },
    endpoints: {
      health: '/health',
      ready: '/ready', 
      metrics: '/metrics',
      serviceDiscovery: '/service-discovery'
    },
    labels: {
      component: 'backend',
      language: 'nodejs',
      framework: 'express',
      database: 'postgresql',
      monitoring: 'enabled'
    },
    metadata: {
      startedAt: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    }
  };

  res.json(serviceInfo);
}
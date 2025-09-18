/**
 * Observability Middleware Module - Phase 2.1 Enterprise Observability
 * Implements comprehensive monitoring, logging, and health checks
 */

import { Express, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { db, rawDb } from '../db';
import { logger } from './security';

// Extend Request interface to include observability fields
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      sessionId?: string;
      startTime?: number;
      errorId?: string;
    }
  }
}

// Types for health checks
interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'unhealthy';
  timestamp: string;
  duration: number;
  details?: any;
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'unhealthy';
  timestamp: string;
  duration: number;
  checks: {
    database: HealthCheckResult;
    monitoring: HealthCheckResult;
    system: HealthCheckResult;
  };
  metadata: {
    version: string;
    environment: string;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    requestsProcessed?: number;
    errors?: number;
  };
}

// Enhanced logger configuration for observability
export const observabilityLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.cookies',
      'body.password',
      'body.token',
      'token',
      'password',
      'authorization'
    ],
    remove: true
  },
  serializers: {
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      requestId: req.requestId,
      correlationId: req.correlationId,
      sessionId: req.sessionId,
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      ip: req.ip || req.connection?.remoteAddress
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      duration: res.duration,
      contentLength: res.get('content-length')
    }),
    err: (err: any) => ({
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
      errorId: err.errorId
    })
  },
  ...(process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'hostname,pid',
        messageFormat: '[{requestId}] {msg}'
      }
    }
  } : {})
});

// Performance and error tracking
class ObservabilityMetrics {
  private static instance: ObservabilityMetrics;
  private requestsProcessed = 0;
  private errors = 0;
  private slowRequests = 0;
  private averageResponseTime = 0;
  private responseTimes: number[] = [];
  private readonly MAX_RESPONSE_TIMES = 1000;

  static getInstance(): ObservabilityMetrics {
    if (!ObservabilityMetrics.instance) {
      ObservabilityMetrics.instance = new ObservabilityMetrics();
    }
    return ObservabilityMetrics.instance;
  }

  recordRequest(duration: number, statusCode: number) {
    this.requestsProcessed++;
    
    // Track response times for average calculation
    this.responseTimes.push(duration);
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }
    
    this.averageResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    // Track slow requests (>2s)
    if (duration > 2000) {
      this.slowRequests++;
      observabilityLogger.warn({
        type: 'slow_request',
        duration,
        statusCode,
        threshold: 2000
      }, `Slow request detected: ${duration}ms`);
    }

    // Track errors
    if (statusCode >= 400) {
      this.errors++;
    }
  }

  recordError(error: Error, requestId?: string) {
    this.errors++;
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    // Attach error ID to error object
    (error as any).errorId = errorId;

    observabilityLogger.error({
      type: 'error',
      errorId,
      requestId,
      error: error.message,
      stack: error.stack
    }, `Error occurred: ${error.message}`);

    return errorId;
  }

  getMetrics() {
    return {
      requestsProcessed: this.requestsProcessed,
      errors: this.errors,
      slowRequests: this.slowRequests,
      averageResponseTime: Math.round(this.averageResponseTime),
      errorRate: this.requestsProcessed > 0 ? (this.errors / this.requestsProcessed) * 100 : 0
    };
  }

  reset() {
    this.requestsProcessed = 0;
    this.errors = 0;
    this.slowRequests = 0;
    this.averageResponseTime = 0;
    this.responseTimes = [];
  }
}

// Request ID middleware
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate or extract request ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Generate correlation ID for business logic tracing
  req.correlationId = req.headers['x-correlation-id'] as string || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  
  // Extract or generate session ID for user session tracing
  req.sessionId = req.session?.id || req.headers['x-session-id'] as string || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  
  // Record start time for performance tracking
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Correlation-ID', req.correlationId);

  next();
}

// Enhanced HTTP request logging middleware
export function enhancedHttpLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log incoming request
  observabilityLogger.info({
    type: 'request_start',
    method: req.method,
    url: req.url,
    requestId: req.requestId,
    correlationId: req.correlationId,
    sessionId: req.sessionId,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    contentLength: req.headers['content-length']
  }, `${req.method} ${req.url} - Request started`);

  // Override res.json to capture response data for error context
  const originalJson = res.json;
  let responseBody: any = null;

  res.json = function(body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    const metrics = ObservabilityMetrics.getInstance();
    
    // Record metrics
    metrics.recordRequest(duration, res.statusCode);

    // Log response
    const logData = {
      type: 'request_complete',
      method: req.method,
      url: req.url,
      requestId: req.requestId,
      correlationId: req.correlationId,
      sessionId: req.sessionId,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('content-length')
    };

    // Add error context for 4xx/5xx responses (privacy-safe)
    if (res.statusCode >= 400 && responseBody && !process.env.NODE_ENV?.includes('prod')) {
      (logData as any).errorContext = {
        hasError: !!responseBody.error,
        errorType: responseBody.error || 'unknown',
        hasValidationErrors: !!responseBody.errors
      };
    }

    if (res.statusCode >= 500) {
      observabilityLogger.error(logData, `${req.method} ${req.url} - ${res.statusCode} in ${duration}ms`);
    } else if (res.statusCode >= 400) {
      observabilityLogger.warn(logData, `${req.method} ${req.url} - ${res.statusCode} in ${duration}ms`);
    } else {
      observabilityLogger.info(logData, `${req.method} ${req.url} - ${res.statusCode} in ${duration}ms`);
    }

    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
}

// Error handling middleware with error IDs
export function errorHandlingMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  const metrics = ObservabilityMetrics.getInstance();
  const errorId = metrics.recordError(err, req.requestId);
  
  // Attach error ID to request for potential use in response
  req.errorId = errorId;

  // Log detailed error information
  observabilityLogger.error({
    type: 'unhandled_error',
    errorId,
    requestId: req.requestId,
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  }, `Unhandled error in ${req.method} ${req.url}`);

  // Send error response with error ID
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      errorId: errorId,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && {
        message: err.message,
        stack: err.stack
      })
    });
  }
  
  // Don't call next() here - this is the final error handler
}

// Health check functions
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    await rawDb.query('SELECT 1');
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      details: { connection: 'active', responseTime: Date.now() - startTime }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

async function checkMonitoringServices(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    // Check if monitoring tables exist and are accessible
    await rawDb.query('SELECT COUNT(*) FROM sync_health_logs LIMIT 1');
    await rawDb.query('SELECT COUNT(*) FROM transaction_gaps LIMIT 1');
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      details: { 
        syncHealthLogs: 'accessible',
        transactionGaps: 'accessible',
        responseTime: Date.now() - startTime 
      }
    };
  } catch (error) {
    return {
      status: 'warning',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      details: { monitoring: 'limited_access' },
      error: error instanceof Error ? error.message : 'Monitoring services partially unavailable'
    };
  }
}

async function checkSystemResources(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const memUsage = process.memoryUsage();
    const metrics = ObservabilityMetrics.getInstance().getMetrics();
    
    // Check memory usage (warn if > 80% of heap limit)
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const errorRate = metrics.errorRate;
    
    let status: 'healthy' | 'warning' | 'unhealthy' = 'healthy';
    
    if (heapUsedPercent > 90 || errorRate > 10) {
      status = 'unhealthy';
    } else if (heapUsedPercent > 80 || errorRate > 5 || metrics.slowRequests > 10) {
      status = 'warning';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      details: {
        memoryUsage: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          usedPercent: Math.round(heapUsedPercent)
        },
        performance: {
          requestsProcessed: metrics.requestsProcessed,
          averageResponseTime: metrics.averageResponseTime,
          slowRequests: metrics.slowRequests,
          errorRate: Math.round(metrics.errorRate * 100) / 100
        }
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'System resource check failed'
    };
  }
}

// Health endpoint handler
export async function healthHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Perform all health checks in parallel
    const [database, monitoring, system] = await Promise.all([
      checkDatabase(),
      checkMonitoringServices(),
      checkSystemResources()
    ]);

    const health: SystemHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checks: {
        database,
        monitoring,
        system
      },
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.round(process.uptime()),
        memoryUsage: process.memoryUsage(),
        ...ObservabilityMetrics.getInstance().getMetrics()
      }
    };

    // Determine overall status
    const unhealthyChecks = Object.values(health.checks).filter(check => check.status === 'unhealthy');
    const warningChecks = Object.values(health.checks).filter(check => check.status === 'warning');

    if (unhealthyChecks.length > 0) {
      health.status = 'unhealthy';
    } else if (warningChecks.length > 0) {
      health.status = 'warning';
    }

    // Set appropriate HTTP status code
    const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'warning' ? 200 : 503;

    // Log health check
    observabilityLogger.info({
      type: 'health_check',
      requestId: req.requestId,
      status: health.status,
      duration: health.duration,
      checks: Object.keys(health.checks).reduce((acc, key) => {
        acc[key] = health.checks[key as keyof typeof health.checks].status;
        return acc;
      }, {} as Record<string, string>)
    }, `Health check completed: ${health.status}`);

    res.status(statusCode).json(health);

  } catch (error) {
    const errorResult = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Health check failed',
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    observabilityLogger.error({
      type: 'health_check_error',
      requestId: req.requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    }, 'Health check failed');

    res.status(503).json(errorResult);
  }
}

// Readiness endpoint handler
export async function readinessHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Readiness checks are more basic - just check if we can serve traffic
    const dbCheck = await checkDatabase();
    
    const ready = {
      status: dbCheck.status === 'healthy' ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checks: {
        database: dbCheck.status
      },
      metadata: {
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.round(process.uptime())
      }
    };

    const statusCode = ready.status === 'ready' ? 200 : 503;

    observabilityLogger.info({
      type: 'readiness_check',
      requestId: req.requestId,
      status: ready.status,
      duration: ready.duration
    }, `Readiness check completed: ${ready.status}`);

    res.status(statusCode).json(ready);

  } catch (error) {
    const errorResult = {
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Readiness check failed'
    };

    observabilityLogger.error({
      type: 'readiness_check_error',
      requestId: req.requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Readiness check failed');

    res.status(503).json(errorResult);
  }
}

// Apply observability middleware to Express app
export function applyObservabilityMiddleware(app: Express): void {
  // Apply request ID middleware first (before any logging)
  app.use(requestIdMiddleware);
  
  // Apply enhanced HTTP logging
  app.use(enhancedHttpLoggingMiddleware);
  
  // Health and readiness endpoints
  app.get('/health', healthHandler);
  app.get('/ready', readinessHandler);
  
  // Apply error handling middleware (should be last)
  app.use(errorHandlingMiddleware);
  
  observabilityLogger.info('Observability middleware applied: request IDs, enhanced logging, health checks, error tracking');
}

// Export metrics instance for external access
export const metrics = ObservabilityMetrics.getInstance();
/**
 * TEST SERVER UTILITIES - Phase 1: Test Foundation
 * 
 * Creates test-configured Express server with:
 * - Disabled rate limiting
 * - Relaxed security middleware
 * - Test database configuration
 * - Enhanced logging for test assertions
 */

import express from 'express';
import { registerRoutes } from '../../server/routes';
import { applySecurityMiddleware } from '../../server/middleware/security';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../../server/db';

/**
 * Create test-configured Express app
 * NODE_ENV=test automatically disables rate limiting and relaxes security
 */
export function createTestApp(): express.Application {
  const app = express();
  
  // Ensure NODE_ENV is set to test
  process.env.NODE_ENV = 'test';
  
  // Apply security middleware (will be automatically relaxed for test environment)
  applySecurityMiddleware(app);
  
  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Session configuration for testing
  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({
      pool: pool,
      tableName: 'session'
    }),
    secret: 'test-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Allow non-HTTPS in tests
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  }));
  
  // Register all application routes
  registerRoutes(app);
  
  // Test-specific middleware for enhanced logging
  app.use((req, res, next) => {
    console.log(`[TEST] ${req.method} ${req.path}`, { 
      body: req.body, 
      query: req.query,
      headers: {
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? '[REDACTED]' : undefined
      }
    });
    next();
  });
  
  // Global error handler for tests
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[TEST ERROR]', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
    
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal Server Error',
      code: err.code || 'UNKNOWN_ERROR'
    });
  });
  
  return app;
}

/**
 * Helper to start test server on random port
 */
export function startTestServer(): Promise<{ app: express.Application; port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const app = createTestApp();
    
    // Use port 0 to get random available port
    const server = app.listen(0, () => {
      const port = (server.address() as any)?.port;
      if (!port) {
        return reject(new Error('Failed to start test server'));
      }
      
      console.log(`🧪 Test server started on port ${port}`);
      
      resolve({
        app,
        port,
        close: () => new Promise((resolveClose) => {
          server.close(() => {
            console.log(`🧹 Test server closed`);
            resolveClose();
          });
        })
      });
    });
    
    server.on('error', reject);
  });
}
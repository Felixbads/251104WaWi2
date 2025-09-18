/**
 * Security Middleware Module - Phase 1.1 Perimeter Hardening
 * Implements comprehensive security measures for API protection
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Configure structured logger with sensitive data redaction
const logger = pino({
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
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type']
        // Authorization header is redacted above
      }
    }),
    res: (res: any) => ({
      statusCode: res.statusCode
    })
  }
});

// HTTP request logger with security redaction
export const httpLogger = pinoHttp({
  logger,
  redact: [
    'req.headers.authorization',
    'req.headers.cookie', 
    'res.headers["set-cookie"]'
  ]
});

// Rate limiting configurations for different route types
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded for auth route');
    res.status(429).json({
      error: 'Too many authentication attempts',
      retryAfter: '15 minutes'
    });
  }
});

export const supplierPortalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    error: 'Rate limit exceeded for supplier portal',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded for supplier portal');
    res.status(429).json({
      error: 'Rate limit exceeded for supplier portal',
      retryAfter: '15 minutes'
    });
  }
});

export const ordersApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: {
    error: 'Rate limit exceeded for orders API',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded for orders API');
    res.status(429).json({
      error: 'Rate limit exceeded for orders API',
      retryAfter: '15 minutes'
    });
  }
});

// SECURITY FIX: Rate limiting für Warehouse Operations
export const warehouseApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 warehouse operations per 15 minutes
  message: {
    error: 'Rate limit exceeded for warehouse operations',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded for warehouse operations');
    res.status(429).json({
      error: 'Rate limit exceeded for warehouse operations',
      retryAfter: '15 minutes'
    });
  }
});

// SECURITY FIX: Rate limiting für Goods Receipt Operations
export const goodsReceiptRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 goods receipt operations per 15 minutes
  message: {
    error: 'Rate limit exceeded for goods receipt operations',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded for goods receipt operations');
    res.status(429).json({
      error: 'Rate limit exceeded for goods receipt operations',
      retryAfter: '15 minutes'
    });
  }
});

// Strict CORS configuration - only allow specific origins
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'https://*.replit.app',
  'https://*.replit.dev',
  // Explicit current Replit development origin
  'https://0882af2d-5e2d-4c19-9208-930be7887108-00-1xybeskgjqft9.sisko.replit.dev'
];

export const corsConfig = cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin matches allowed patterns
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        // Handle wildcard domains - improved pattern matching
        const pattern = allowedOrigin.replace('https://*.', '').replace('http://*.', '');
        const originDomain = origin.replace(/^https?:\/\//, '');
        const matches = originDomain.endsWith('.' + pattern) || originDomain === pattern;
        logger.debug({ origin, pattern, originDomain, matches }, 'CORS wildcard pattern check');
        return matches;
      }
      return origin === allowedOrigin;
    });
    
    if (isAllowed) {
      logger.debug({ origin }, 'CORS: Origin allowed');
      callback(null, true);
    } else {
      logger.warn({ origin, allowedOrigins }, 'CORS: Origin not allowed');
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ]
});

// Helmet security headers configuration
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
});

// Secure token generation using crypto.randomBytes
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Enhanced session configuration with security settings
export const secureSessionConfig = {
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
  rolling: true
};

// Security middleware application function
export function applySecurityMiddleware(app: Express): void {
  // Apply security headers first
  app.use(helmetConfig);
  
  // Apply CORS with strict origin checking
  app.use(corsConfig);
  
  // SECURITY FIX: Disable pino-http request logging to prevent duplicates
  // Observability logger handles request logging with enhanced features
  // app.use(httpLogger); // DISABLED - prevents duplicate logs
  
  // Apply rate limiting to specific routes
  app.use('/api/auth', authRateLimit);
  app.use('/api/supplier-portal', supplierPortalRateLimit);
  app.use('/api/orders', ordersApiRateLimit);
  
  // SECURITY FIX: Apply warehouse and goods-receipt rate limiting
  app.use('/api/warehouse3', warehouseApiRateLimit);
  app.use('/api/goods-receipt', goodsReceiptRateLimit);
  
  logger.info('Security middleware applied: helmet, CORS, rate limiting including warehouse operations (pino-http disabled - using observability logger)');
}

export { logger };
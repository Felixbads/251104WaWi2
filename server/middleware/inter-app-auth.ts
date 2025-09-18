import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  isInterAppAuthenticated?: boolean;
  interAppSource?: string;
}

/**
 * Middleware für sichere Inter-App Authentifizierung
 * Verwendet HMAC-SHA256 für sichere Signaturverifikation
 */
export function interAppAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const interAppSecret = process.env.INTER_APP_SECRET;
  const apiSecretKey = process.env.API_SECRET_KEY;

  if (!interAppSecret || !apiSecretKey) {
    console.error('[INTER-APP-AUTH] Fehlende Umgebungsvariablen für Inter-App Authentifizierung');
    return res.status(500).json({ 
      error: 'Server-Konfigurationsfehler',
      code: 'MISSING_AUTH_CONFIG'
    });
  }

  // Prüfe Authorization Header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Fehlende oder ungültige Autorisierung',
      code: 'MISSING_AUTH_HEADER'
    });
  }

  const token = authHeader.substring(7); // Entferne "Bearer "
  
  // Prüfe Timestamp Header für Replay-Schutz
  const timestamp = req.headers['x-timestamp'] as string;
  if (!timestamp) {
    return res.status(401).json({ 
      error: 'Fehlender Timestamp-Header',
      code: 'MISSING_TIMESTAMP'
    });
  }

  // Prüfe, ob Timestamp nicht älter als 5 Minuten ist
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(currentTime - requestTime);
  
  if (timeDiff > 300) { // 5 Minuten
    return res.status(401).json({ 
      error: 'Request-Timestamp ist zu alt',
      code: 'TIMESTAMP_EXPIRED'
    });
  }

  // Erstelle erwartete Signatur
  const method = req.method;
  const path = req.path;
  const body = req.body ? JSON.stringify(req.body) : '';
  const source = req.headers['x-app-source'] as string || 'unknown';
  
  const signaturePayload = `${method}:${path}:${body}:${timestamp}:${source}`;
  const expectedSignature = crypto
    .createHmac('sha256', interAppSecret)
    .update(signaturePayload)
    .digest('hex');

  // REMOVED: Debug logging of signatures for security
  // Use structured logging without exposing sensitive data

  // Vergleiche Signaturen (Zeit-sichere Vergleichung)
  const providedSignature = token;
  let signatureMatch = false;
  
  try {
    signatureMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    console.warn(`[INTER-APP-AUTH] Fehler beim Signatur-Vergleich: ${error instanceof Error ? error.message : error}`);
    return res.status(401).json({ 
      error: 'Ungültiges Signatur-Format',
      code: 'INVALID_SIGNATURE_FORMAT'
    });
  }

  if (!signatureMatch) {
    console.warn(`[INTER-APP-AUTH] Ungültige Signatur von ${req.ip} für ${method} ${path}`);
    console.warn(`[INTER-APP-AUTH] Erwartete Signatur: ${expectedSignature}`);
    console.warn(`[INTER-APP-AUTH] Erhaltene Signatur: ${providedSignature}`);
    return res.status(401).json({ 
      error: 'Ungültige Authentifizierung',
      code: 'INVALID_SIGNATURE',
      debug: {
        expectedPayload: signaturePayload,
        expectedSignature: expectedSignature,
        providedSignature: providedSignature
      }
    });
  }

  // Zusätzliche API-Key Validierung
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey || apiKey !== apiSecretKey) {
    return res.status(401).json({ 
      error: 'Ungültiger API-Schlüssel',
      code: 'INVALID_API_KEY'
    });
  }

  // Authentifizierung erfolgreich
  req.isInterAppAuthenticated = true;
  req.interAppSource = source;
  
  console.log(`[INTER-APP-AUTH] Erfolgreiche Authentifizierung von ${source} für ${method} ${path}`);
  next();
}

/**
 * Helper-Funktion zum Erstellen einer Signatur für ausgehende Requests
 */
export function createInterAppSignature(
  method: string,
  path: string,
  body: any = null,
  source: string = 'main-app'
): { signature: string; timestamp: string; headers: Record<string, string> } {
  const interAppSecret = process.env.INTER_APP_SECRET;
  const apiSecretKey = process.env.API_SECRET_KEY;

  if (!interAppSecret || !apiSecretKey) {
    throw new Error('Fehlende Umgebungsvariablen für Inter-App Authentifizierung');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  
  const signaturePayload = `${method}:${path}:${bodyStr}:${timestamp}:${source}`;
  const signature = crypto
    .createHmac('sha256', interAppSecret)
    .update(signaturePayload)
    .digest('hex');

  return {
    signature,
    timestamp,
    headers: {
      'Authorization': `Bearer ${signature}`,
      'X-Timestamp': timestamp,
      'X-App-Source': source,
      'X-API-Key': apiSecretKey,
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Rate Limiting für Inter-App Requests - DEPRECATED
 * Use express-rate-limit middleware instead for consistency
 */
export function interAppRateLimitMiddleware(
  maxRequests: number = 100,
  windowMinutes: number = 1
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // REMOVED: In-memory rate limiting store
    // Use express-rate-limit middleware for consistent rate limiting
    next();
  };
}
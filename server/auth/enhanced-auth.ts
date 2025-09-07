/**
 * ENHANCED AUTHENTICATION SYSTEM
 * Konsolidiert Replit-Auth als primäres System mit JWT-Fallback für lokale Entwicklung
 * Implementiert HttpOnly Cookies, Rate-Limiting und Audit-Logging
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

// Authentifizierungs-Konfiguration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret-change-in-production';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'cookie-secret-change-in-production';

// Benutzer-Interface erweitert
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'supervisor' | 'employee' | 'readonly';
  approved: boolean;
  replitUsername?: string;
  isOwner?: boolean;
  lastLoginAt?: Date;
}

// Session-Interface
export interface UserSession {
  userId: number;
  username: string;
  role: string;
  isReplit: boolean;
  createdAt: Date;
  expiresAt: Date;
}

// Audit-Log Interface
export interface AuthEvent {
  userId?: number;
  username?: string;
  eventType: 'login' | 'logout' | 'failed_login' | 'token_refresh' | 'unauthorized_access';
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  timestamp: Date;
}

// In-Memory Store für Failed Attempts (Production sollte Redis verwenden)
const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();
const auditLog: AuthEvent[] = [];

// Sicherheits-Konfiguration
const SECURITY_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 Minuten
  JWT_EXPIRES_IN: '24h',
  COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 Stunden
  AUDIT_LOG_MAX_SIZE: 10000
};

// Auto-Approval E-Mail-Domains
const AUTO_APPROVAL_DOMAINS = (process.env.AUTO_APPROVAL_DOMAINS || '').split(',').filter(Boolean);

/**
 * Rate-Limiting Middleware für Login-Versuche
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 5, // Maximal 5 Versuche pro IP
  message: {
    error: 'Zu viele Login-Versuche',
    details: 'Bitte warten Sie 15 Minuten vor dem nächsten Versuch'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Audit-Event aufzeichnen
 */
function logAuthEvent(event: AuthEvent) {
  auditLog.push(event);
  
  // Log-Größe begrenzen
  if (auditLog.length > SECURITY_CONFIG.AUDIT_LOG_MAX_SIZE) {
    auditLog.splice(0, auditLog.length - SECURITY_CONFIG.AUDIT_LOG_MAX_SIZE);
  }
  
  console.log(`[AUTH-AUDIT] ${event.eventType}: ${event.username || 'Unknown'} (${event.ipAddress})`);
}

/**
 * Replit-Benutzerinformationen abrufen
 */
function getReplitUserInfo(): { username: string | undefined; owner: string | undefined; isOwner: boolean } {
  const replitUser = process.env.REPLIT_USER;
  const replOwner = process.env.REPL_OWNER;
  
  return {
    username: replitUser,
    owner: replOwner,
    isOwner: replitUser === replOwner
  };
}

/**
 * Benutzerrolle basierend auf Konfiguration bestimmen
 */
function determineUserRole(replitUsername: string, isOwner: boolean, email?: string): 'admin' | 'supervisor' | 'employee' | 'readonly' {
  // Owner ist immer Admin
  if (isOwner) return 'admin';
  
  // Explizit konfigurierte Admins
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(u => u.trim());
  if (adminUsers.includes(replitUsername)) return 'admin';
  
  // Supervisor basierend auf E-Mail-Domain
  const supervisorDomains = (process.env.SUPERVISOR_DOMAINS || '').split(',').filter(Boolean);
  if (email && supervisorDomains.some(domain => email.endsWith(domain))) return 'supervisor';
  
  // Standard-Rolle
  return 'employee';
}

/**
 * Auto-Approval basierend auf E-Mail-Domain prüfen
 */
function shouldAutoApprove(email: string): boolean {
  return AUTO_APPROVAL_DOMAINS.some(domain => email.endsWith(domain));
}

/**
 * Benutzer aus Replit-Auth erstellen oder aktualisieren
 */
async function createOrUpdateReplitUser(replitUsername: string, isOwner: boolean): Promise<AuthenticatedUser | null> {
  try {
    const email = `${replitUsername}@replit.local`;
    const role = determineUserRole(replitUsername, isOwner, email);
    
    // Existierenden Benutzer prüfen
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, replitUsername))
      .limit(1);
    
    if (existingUser.length > 0) {
      // Benutzer aktualisieren
      const [updatedUser] = await db.update(users)
        .set({
          role,
          approved: true, // Replit-Benutzer werden automatisch genehmigt
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser[0].id))
        .returning();
      
      return {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email || email,
        role: updatedUser.role as any,
        approved: updatedUser.approved || false,
        replitUsername,
        isOwner,
        lastLoginAt: new Date()
      };
    } else {
      // Neuen Benutzer erstellen
      const [newUser] = await db.insert(users)
        .values({
          username: replitUsername,
          email,
          password: 'replit-auth-no-password',
          role,
          approved: true,
          approvedAt: new Date(),
        })
        .returning();
      
      return {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email || email,
        role: newUser.role as any,
        approved: newUser.approved || false,
        replitUsername,
        isOwner,
        lastLoginAt: new Date()
      };
    }
  } catch (error) {
    console.error('[ENHANCED-AUTH] Fehler beim Erstellen/Aktualisieren des Benutzers:', error);
    return null;
  }
}

/**
 * JWT-Token mit HttpOnly Cookie setzen
 */
function setAuthCookie(res: Response, user: AuthenticatedUser): string {
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      isReplit: !!user.replitUsername
    },
    JWT_SECRET,
    { expiresIn: SECURITY_CONFIG.JWT_EXPIRES_IN } as jwt.SignOptions
  );
  
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SECURITY_CONFIG.COOKIE_MAX_AGE,
    signed: true
  });
  
  return token;
}

/**
 * Auth-Cookie löschen
 */
function clearAuthCookie(res: Response) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    signed: true
  });
}

/**
 * Hauptauthentifizierungs-Middleware
 */
export async function enhancedAuthMiddleware(
  req: Request & { user?: AuthenticatedUser },
  res: Response,
  next: NextFunction
) {
  try {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // 1. Primär: Replit-Authentifizierung prüfen
    const { username: replitUsername, isOwner } = getReplitUserInfo();
    
    if (replitUsername) {
      const user = await createOrUpdateReplitUser(replitUsername, isOwner);
      if (user) {
        req.user = user;
        
        // Token und Cookie setzen für Konsistenz
        setAuthCookie(res, user);
        
        logAuthEvent({
          userId: user.id,
          username: user.username,
          eventType: 'login',
          ipAddress: clientIP,
          userAgent,
          details: `Replit Auth: ${replitUsername}`,
          timestamp: new Date()
        });
        
        return next();
      }
    }
    
    // 2. Fallback: JWT-Token aus Cookie prüfen
    const token = req.signedCookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const user = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
        
        if (user.length > 0 && user[0].approved) {
          req.user = {
            id: user[0].id,
            username: user[0].username,
            email: user[0].email || '',
            role: user[0].role as any,
            approved: user[0].approved || false,
            lastLoginAt: new Date()
          };
          
          return next();
        }
      } catch (jwtError) {
        console.log('[ENHANCED-AUTH] JWT-Validierung fehlgeschlagen:', jwtError);
        clearAuthCookie(res);
      }
    }
    
    // 3. Kein gültiger Auth gefunden
    logAuthEvent({
      eventType: 'unauthorized_access',
      ipAddress: clientIP,
      userAgent,
      details: `Kein gültiger Auth-Token: URL=${req.url}`,
      timestamp: new Date()
    });
    
    return res.status(401).json({
      error: 'Authentifizierung erforderlich',
      message: 'Bitte melden Sie sich an, um fortzufahren.'
    });
    
  } catch (error) {
    console.error('[ENHANCED-AUTH] Middleware-Fehler:', error);
    return res.status(500).json({
      error: 'Authentifizierungsfehler',
      message: 'Interner Server-Fehler bei der Authentifizierung'
    });
  }
}

/**
 * Admin-Berechtigung prüfen
 */
export function requireAdmin(req: Request & { user?: AuthenticatedUser }, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'supervisor')) {
    logAuthEvent({
      userId: req.user?.id,
      username: req.user?.username,
      eventType: 'unauthorized_access',
      ipAddress: req.ip || 'unknown',
      details: `Admin-Zugriff verweigert: Rolle=${req.user?.role}`,
      timestamp: new Date()
    });
    
    return res.status(403).json({
      error: 'Administratorrechte erforderlich',
      message: 'Sie haben keine Berechtigung für diese Aktion.'
    });
  }
  next();
}

/**
 * Aktuellen Benutzer abrufen (für API-Endpunkt)
 */
export async function getCurrentUser(req: Request & { user?: AuthenticatedUser }): Promise<AuthenticatedUser | null> {
  if (req.user) {
    return req.user;
  }
  
  // Fallback für Replit-Auth ohne Middleware
  const { username: replitUsername, isOwner } = getReplitUserInfo();
  if (replitUsername) {
    return await createOrUpdateReplitUser(replitUsername, isOwner);
  }
  
  return null;
}

/**
 * Logout-Funktion
 */
export function logoutUser(req: Request & { user?: AuthenticatedUser }, res: Response) {
  const user = req.user;
  
  clearAuthCookie(res);
  
  if (user) {
    logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'logout',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      timestamp: new Date()
    });
  }
  
  res.json({ success: true, message: 'Erfolgreich abgemeldet' });
}

/**
 * Audit-Log abrufen (nur für Admins)
 */
export function getAuditLog(limit: number = 100): AuthEvent[] {
  return auditLog.slice(-limit).reverse();
}

/**
 * Fehlgeschlagene Login-Versuche zurücksetzen
 */
export function clearFailedAttempts(identifier: string) {
  failedAttempts.delete(identifier);
}

/**
 * Benutzerstatistiken abrufen
 */
export async function getUserStats() {
  try {
    const totalUsers = await db.select().from(users);
    const pendingUsers = totalUsers.filter(u => !u.approved);
    const activeUsers = totalUsers.filter(u => u.approved);
    
    return {
      total: totalUsers.length,
      pending: pendingUsers.length,
      active: activeUsers.length,
      recentLogins: auditLog.filter(e => 
        e.eventType === 'login' && 
        e.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };
  } catch (error) {
    console.error('[ENHANCED-AUTH] Fehler beim Abrufen der Benutzerstatistiken:', error);
    throw error;
  }
}
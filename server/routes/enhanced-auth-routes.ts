/**
 * ENHANCED AUTHENTICATION ROUTES
 * Verwendet die neue Enhanced-Auth-Middleware mit verbesserter Sicherheit
 */
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import {
  enhancedAuthMiddleware,
  requireAdmin,
  getCurrentUser,
  logoutUser,
  getAuditLog,
  getUserStats,
  loginRateLimit,
  AuthenticatedUser
} from '../auth/enhanced-auth';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { approveUser, changeUserRole, getAllUsers } from '../auth';

const router = express.Router();

// Cookie-Parser mit Secret
router.use(cookieParser(process.env.COOKIE_SECRET || 'cookie-secret-change-in-production'));

/**
 * GET /api/enhanced-auth/me
 * Aktuellen Benutzer abrufen
 */
router.get('/me', async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Nicht authentifiziert',
        message: 'Bitte melden Sie sich an.'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        approved: user.approved,
        isReplit: !!user.replitUsername,
        isOwner: user.isOwner || false
      }
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Fehler beim Abrufen des aktuellen Benutzers:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler beim Abrufen der Benutzerinformationen'
    });
  }
});

/**
 * POST /api/enhanced-auth/login
 * Anmeldung (hauptsächlich für manuelle Entwicklung)
 */
router.post('/login', loginRateLimit, async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    
    if (user) {
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          approved: user.approved,
          isReplit: !!user.replitUsername
        },
        message: `Willkommen zurück, ${user.username}!`
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Authentifizierung fehlgeschlagen',
        message: 'Kein gültiger Replit-Benutzer gefunden'
      });
    }
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Login-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler bei der Anmeldung'
    });
  }
});

/**
 * POST /api/enhanced-auth/logout
 * Abmeldung
 */
router.post('/logout', (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  logoutUser(req, res);
});

/**
 * GET /api/enhanced-auth/status
 * System-Status und Statistiken
 */
router.get('/status', enhancedAuthMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await getUserStats();
    const recentAuditEntries = getAuditLog(50);
    
    res.json({
      success: true,
      data: {
        userStats: stats,
        recentActivity: recentAuditEntries,
        systemInfo: {
          authMethod: 'Enhanced Replit Auth',
          securityFeatures: [
            'HttpOnly Cookies',
            'Rate Limiting',
            'Audit Logging',
            'Auto-Approval Rules',
            'Role-based Access Control'
          ],
          environment: process.env.NODE_ENV || 'development'
        }
      }
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Status-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler beim Abrufen des System-Status'
    });
  }
});

/**
 * GET /api/enhanced-auth/audit-log
 * Audit-Log abrufen (nur für Admins)
 */
router.get('/audit-log', enhancedAuthMiddleware, requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const auditEntries = getAuditLog(limit);
    
    res.json({
      success: true,
      data: auditEntries,
      total: auditEntries.length
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Audit-Log-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler beim Abrufen des Audit-Logs'
    });
  }
});

/**
 * GET /api/enhanced-auth/users
 * Alle Benutzer abrufen (Admin)
 */
router.get('/users', enhancedAuthMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    
    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Benutzer-Abruf-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler beim Abrufen der Benutzer'
    });
  }
});

/**
 * POST /api/enhanced-auth/users/:id/approve
 * Benutzer genehmigen
 */
router.post('/users/:id/approve', enhancedAuthMiddleware, requireAdmin, async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const adminUser = req.user;
    
    if (!adminUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentifizierung erforderlich'
      });
    }
    
    const result = await approveUser(userId, adminUser.id);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        message: 'Benutzer erfolgreich genehmigt'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Genehmigungsfehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler bei der Benutzer-Genehmigung'
    });
  }
});

/**
 * POST /api/enhanced-auth/users/:id/role
 * Benutzerrolle ändern
 */
router.post('/users/:id/role', enhancedAuthMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    
    if (!['admin', 'supervisor', 'employee', 'readonly'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Rolle',
        message: 'Erlaubte Rollen: admin, supervisor, employee, readonly'
      });
    }
    
    const result = await changeUserRole(userId, role);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        message: 'Benutzerrolle erfolgreich geändert'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Rollen-Änderungsfehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler bei der Rollen-Änderung'
    });
  }
});

/**
 * POST /api/enhanced-auth/bulk-approve
 * Mehrere Benutzer gleichzeitig genehmigen
 */
router.post('/bulk-approve', enhancedAuthMiddleware, requireAdmin, async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const { userIds } = req.body;
    const adminUser = req.user;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Benutzer-IDs erforderlich',
        message: 'Geben Sie eine Liste von Benutzer-IDs an'
      });
    }
    
    if (!adminUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentifizierung erforderlich'
      });
    }
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const userId of userIds) {
      try {
        const result = await approveUser(parseInt(userId), adminUser.id);
        if (result.success) {
          successCount++;
          results.push({ userId, success: true, user: result.user });
        } else {
          errorCount++;
          results.push({ userId, success: false, error: result.error });
        }
      } catch (error) {
        errorCount++;
        results.push({ userId, success: false, error: 'Unerwarteter Fehler' });
      }
    }
    
    res.json({
      success: true,
      summary: {
        total: userIds.length,
        approved: successCount,
        errors: errorCount
      },
      results,
      message: `${successCount} von ${userIds.length} Benutzern erfolgreich genehmigt`
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Bulk-Genehmigungsfehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler bei der Bulk-Genehmigung'
    });
  }
});

/**
 * GET /api/enhanced-auth/security-info
 * Sicherheitsinformationen für Admins
 */
router.get('/security-info', enhancedAuthMiddleware, requireAdmin, (req: Request, res: Response) => {
  try {
    const securityInfo = {
      authenticationMethod: 'Enhanced Replit Auth',
      features: {
        httpOnlyCookies: true,
        rateLimit: true,
        auditLogging: true,
        autoApproval: !!process.env.AUTO_APPROVAL_DOMAINS,
        roleBasedAccess: true,
        tokenExpiry: '24h',
        cookieSecure: process.env.NODE_ENV === 'production'
      },
      configuration: {
        autoApprovalDomains: process.env.AUTO_APPROVAL_DOMAINS?.split(',').filter(Boolean) || [],
        adminUsers: process.env.ADMIN_USERS?.split(',').filter(Boolean) || [],
        supervisorDomains: process.env.SUPERVISOR_DOMAINS?.split(',').filter(Boolean) || [],
        maxFailedAttempts: 5,
        lockoutDuration: '15 minutes'
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json({
      success: true,
      data: securityInfo
    });
  } catch (error) {
    console.error('[ENHANCED-AUTH-ROUTES] Sicherheitsinfo-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Server-Fehler',
      message: 'Fehler beim Abrufen der Sicherheitsinformationen'
    });
  }
});

export default router;
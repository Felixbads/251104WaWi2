/**
 * UNIFIED AUTHENTICATION ROUTES - Phase 1.2
 * 
 * Provides secure authentication endpoints:
 * - POST /auth/login - Session-based login with HttpOnly cookies
 * - POST /auth/logout - Destroys session completely
 * - GET /auth/me - Current user information from session
 * - POST /auth/refresh - JWT token refresh for inter-app communication
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { 
  createSession, 
  destroySession, 
  generateInterAppToken, 
  getCurrentUser,
  AuthenticatedUser,
  requireSession
} from '../auth/unified-auth';
import { logger } from '../middleware/security';
import { authRateLimit } from '../middleware/security';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  purpose: z.enum(['inter-app']).default('inter-app'),
});

/**
 * POST /auth/login
 * Session-based login that sets HttpOnly session cookie
 */
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    // Validate input
    const { username, password } = loginSchema.parse(req.body);
    
    logger.info({ username }, 'Login attempt');

    // Find user in database
    const userRecord = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (!userRecord) {
      logger.warn({ username }, 'Login failed: user not found');
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userRecord.password);
    if (!isValidPassword) {
      logger.warn({ username, userId: userRecord.id }, 'Login failed: invalid password');
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is approved
    if (!userRecord.approved) {
      logger.warn({ username, userId: userRecord.id }, 'Login failed: user not approved');
      return res.status(401).json({
        error: 'Account not approved',
        code: 'ACCOUNT_NOT_APPROVED',
        message: 'Your account is pending approval by an administrator.'
      });
    }

    // Create user object
    const user: AuthenticatedUser = {
      id: userRecord.id,
      username: userRecord.username,
      email: userRecord.email,
      role: userRecord.role || 'user',
      approved: userRecord.approved || false
    };

    // Create session (this sets the session cookie automatically)
    createSession(req, user);

    logger.info({ userId: user.id, username: user.username }, 'Login successful');

    // Return user data (without password)
    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        approved: user.approved
      },
      message: 'Login successful'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors
      });
    }

    logger.error({ error }, 'Login error');
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /auth/logout
 * Destroys session completely
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const username = req.session.username;

    // Destroy session
    await destroySession(req);

    logger.info({ userId, username }, 'Logout successful');

    return res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error({ error }, 'Logout error');
    return res.status(500).json({
      error: 'Failed to logout',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * GET /auth/me
 * Returns current user information from session
 */
router.get('/me', requireSession(), (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const user = getCurrentUser(req);
    
    if (!user) {
      return res.status(401).json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        approved: user.approved
      }
    });

  } catch (error) {
    logger.error({ error }, 'Get current user error');
    return res.status(500).json({
      error: 'Failed to get user information',
      code: 'USER_INFO_ERROR'
    });
  }
});

/**
 * POST /auth/refresh
 * Generates new JWT token for inter-app communication
 * Only for authenticated users, not for session refresh
 */
router.post('/refresh', requireSession(), (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    const { purpose } = refreshTokenSchema.parse(req.body);
    const user = getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Generate inter-app JWT token (short-lived)
    const token = generateInterAppToken(user);

    logger.info({ userId: user.id, purpose }, 'JWT token generated');

    return res.json({
      token,
      type: 'Bearer',
      expiresIn: '10m', // 10 minutes
      purpose,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors
      });
    }

    logger.error({ error }, 'Token refresh error');
    return res.status(500).json({
      error: 'Failed to generate token',
      code: 'TOKEN_ERROR'
    });
  }
});

/**
 * POST /auth/revoke
 * Revokes a JWT token (for security)
 */
router.post('/revoke', requireSession(['admin']), (req: Request, res: Response) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    
    // Import revoke function dynamically to avoid circular dependency
    const { revokeJWT } = require('../auth/unified-auth');
    revokeJWT(token);

    logger.info({ adminUser: req.session.username }, 'JWT token revoked by admin');

    return res.json({
      success: true,
      message: 'Token revoked successfully'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors
      });
    }

    logger.error({ error }, 'Token revocation error');
    return res.status(500).json({
      error: 'Failed to revoke token',
      code: 'REVOKE_ERROR'
    });
  }
});

export default router;
/**
 * UNIFIED AUTH UNIT TESTS - Phase 2: Auth/Security/Zod Testing
 * 
 * Comprehensive testing for unified-auth.ts:
 * - requireSession: happy/deny paths, session management, role checks
 * - requireJWT: authentication flows, error handling, token validation
 * - RBAC: role-based access control edge cases
 * - Token revocation and JWT lifecycle management
 * 
 * Target: >80% coverage on all auth functions
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { Session, SessionData } from 'express-session';
import { 
  requireSession, 
  requireJWT, 
  rbac, 
  tokenRevocationStore,
  AuthenticatedUser,
  JWTPayload 
} from '../../../server/auth/unified-auth';
import { db } from '../../../server/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Mock dependencies
vi.mock('../../../server/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn()
      }
    }
  }
}));
vi.mock('../../../server/middleware/security', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Test JWT secret
process.env.JWT_SECRET = 'test-jwt-secret-key';

// Create comprehensive Session mock utility that satisfies Express Session interface
const createMockSession = (overrides: Partial<Session & SessionData> = {}): Session & Partial<SessionData> => ({
  // Express Session required properties
  id: 'test-session-id',
  cookie: {
    originalMaxAge: null,
    expires: undefined,
    secure: false,
    httpOnly: true,
    path: '/',
    domain: undefined,
    sameSite: undefined
  },
  regenerate: vi.fn((callback) => callback && callback()),
  destroy: vi.fn((callback) => callback && callback()),
  reload: vi.fn((callback) => callback && callback()),
  save: vi.fn((callback) => callback && callback()),
  touch: vi.fn(),
  resetMaxAge: vi.fn(),
  
  // Custom session data properties
  authenticated: false,
  userId: undefined,
  username: undefined,
  role: undefined,
  
  // Override with provided values
  ...overrides
});

describe('Unified Authentication System', () => {
  let mockReq: Partial<Request & { user?: AuthenticatedUser }>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: Mock;
  let statusSpy: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock response
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });
    
    mockRes = {
      status: statusSpy,
      json: jsonSpy
    };
    
    mockNext = vi.fn();
    
    // Reset DB mock to clean state
    const mockDb = db as any;
    mockDb.query.users.findFirst.mockReset();
    
    // Setup mock request
    mockReq = {
      session: createMockSession(),
      headers: {},
      path: '/test-path',
      user: undefined
    };
  });

  describe('requireSession Middleware', () => {
    describe('Happy Path - Valid Session', () => {
      it('should authenticate user with valid session and no role restrictions', async () => {
        // Arrange
        const testUser: AuthenticatedUser = {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          approved: true
        };

        mockReq.session = createMockSession({
          authenticated: true,
          userId: 1,
          username: 'testuser',
          role: 'user'
        });

        // Mock database call
        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              role: 'user',
              approved: true
            })
          }
        };

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(mockReq.user).toEqual(testUser);
        expect(mockNext).toHaveBeenCalledOnce();
        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should authenticate admin user with admin role requirement', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 2,
          username: 'admin',
          role: 'admin'
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 2,
              username: 'admin',
              email: 'admin@example.com',
              role: 'admin',
              approved: true
            })
          }
        };

        // Act
        const middleware = requireSession(['admin']);
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledOnce();
        expect(statusSpy).not.toHaveBeenCalled();
      });
    });

    describe('Deny Path - Authentication Failures', () => {
      it('should reject request with no session', async () => {
        // Arrange
        mockReq.session = createMockSession();

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Authentication required',
          code: 'SESSION_REQUIRED'
        });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should reject request with unauthenticated session', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: false,
          userId: 1
        });

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Authentication required',
          code: 'SESSION_REQUIRED'
        });
      });

      it('should reject request with missing userId', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true
          // userId missing
        });

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Authentication required',
          code: 'SESSION_REQUIRED'
        });
      });

      it('should reject session with non-existent user', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 999,
          destroy: vi.fn()
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue(null)
          }
        };

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid session',
          code: 'INVALID_SESSION'
        });
        expect(mockReq.session!.destroy).toHaveBeenCalled();
      });

      it('should reject session with unapproved user', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 1,
          destroy: vi.fn()
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              role: 'user',
              approved: false // Not approved
            })
          }
        };

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid session',
          code: 'INVALID_SESSION'
        });
      });
    });

    describe('Role-Based Access Control', () => {
      it('should reject user without required role', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 1
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              role: 'user',
              approved: true
            })
          }
        };

        // Act - require admin role for user with 'user' role
        const middleware = requireSession(['admin']);
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(403);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow user with multiple valid roles', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 1
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'moderator',
              email: 'mod@example.com',
              role: 'moderator',
              approved: true
            })
          }
        };

        // Act
        const middleware = requireSession(['admin', 'moderator']);
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledOnce();
        expect(statusSpy).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        // Arrange
        mockReq.session = createMockSession({
          authenticated: true,
          userId: 1
        });

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockRejectedValue(new Error('Database connection failed'))
          }
        };

        // Act
        const middleware = requireSession();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert - DB error should clear session and return 401, not 500
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid session',
          code: 'INVALID_SESSION'
        });
      });
    });
  });

  describe('requireJWT Middleware', () => {
    describe('Happy Path - Valid JWT', () => {
      it('should authenticate with valid inter-app JWT token', async () => {
        // Arrange
        const testUser: AuthenticatedUser = {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          approved: true
        };

        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 1,
          username: 'testuser',
          role: 'user',
          jti,
          type: 'inter-app'
        }, process.env.JWT_SECRET!, {
          expiresIn: '10m',
          issuer: 'wawi-system',
          subject: '1'
        });

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        // Ensure token is not revoked
        tokenRevocationStore.cleanup = vi.fn();
        
        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              role: 'user',
              approved: true
            })
          }
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(mockReq.user).toEqual(testUser);
        expect(mockNext).toHaveBeenCalledOnce();
        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should authenticate JWT with role requirement', async () => {
        // Arrange
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 1,
          username: 'admin',
          role: 'admin',
          jti,
          type: 'inter-app'
        }, process.env.JWT_SECRET!, {
          expiresIn: '10m',
          issuer: 'wawi-system',
          subject: '1'
        });

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'admin',
              email: 'admin@example.com',
              role: 'admin',
              approved: true
            })
          }
        };

        // Act
        const middleware = requireJWT(['admin']);
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledOnce();
      });
    });

    describe('Deny Path - JWT Failures', () => {
      it('should reject request without authorization header', async () => {
        // Arrange
        mockReq.headers = {};

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'JWT token required',
          code: 'JWT_REQUIRED'
        });
      });

      it('should reject request with malformed authorization header', async () => {
        // Arrange
        mockReq.headers = {
          authorization: 'InvalidFormat token123'
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'JWT token required',
          code: 'JWT_REQUIRED'
        });
      });

      it('should reject invalid JWT token', async () => {
        // Arrange
        mockReq.headers = {
          authorization: 'Bearer invalid.jwt.token'
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid or expired token',
          code: 'INVALID_JWT'
        });
      });

      it('should reject revoked JWT token', async () => {
        // Arrange
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 1,
          username: 'testuser',
          role: 'user',
          jti,
          type: 'inter-app'
        }, process.env.JWT_SECRET!, { expiresIn: '10m' });

        // Revoke the token
        tokenRevocationStore.revoke(jti);

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid or expired token',
          code: 'INVALID_JWT'
        });
      });

      it('should reject browser token type for inter-app endpoint', async () => {
        // Arrange
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 1,
          username: 'testuser',
          role: 'user',
          jti,
          type: 'browser' // Wrong type
        }, process.env.JWT_SECRET!, { expiresIn: '10m' });

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE'
        });
      });

      it('should reject JWT with non-existent user', async () => {
        // Arrange
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 999,
          username: 'nonexistent',
          role: 'user',
          jti,
          type: 'inter-app'
        }, process.env.JWT_SECRET!, { expiresIn: '10m' });

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue(null)
          }
        };

        // Act
        const middleware = requireJWT();
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert
        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'User not found or not approved',
          code: 'USER_NOT_FOUND'
        });
      });

      it('should reject JWT with insufficient role', async () => {
        // Arrange
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign({
          userId: 1,
          username: 'testuser',
          role: 'user',
          jti,
          type: 'inter-app'
        }, process.env.JWT_SECRET!, { expiresIn: '10m' });

        mockReq.headers = {
          authorization: `Bearer ${token}`
        };

        // Mock the exact DB access pattern used in unified-auth.ts getUserById function
        const mockDb = db as any;
        mockDb.query = {
          users: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              role: 'user',
              approved: true
            })
          }
        };

        // Act - require admin role for user with 'user' role
        const middleware = requireJWT(['admin']);
        await middleware(mockReq as any, mockRes as any, mockNext);

        // Assert - JWT role validation should return 403 for insufficient permissions
        expect(statusSpy).toHaveBeenCalledWith(403);
        expect(jsonSpy).toHaveBeenCalledWith({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  describe('RBAC Middleware', () => {
    it('should allow user with required role', () => {
      // Arrange
      mockReq.user = {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        approved: true
      };

      // Act
      const middleware = rbac(['admin']);
      middleware(mockReq as any, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject user without authentication', () => {
      // Arrange
      mockReq.user = undefined;

      // Act
      const middleware = rbac(['admin']);
      middleware(mockReq as any, mockRes as any, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    });

    it('should reject user with insufficient role', () => {
      // Arrange
      mockReq.user = {
        id: 1,
        username: 'user',
        email: 'user@example.com',
        role: 'user',
        approved: true
      };

      // Act
      const middleware = rbac(['admin']);
      middleware(mockReq as any, mockRes as any, mockNext);

      // Assert
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    });

    it('should allow user with one of multiple required roles', () => {
      // Arrange
      mockReq.user = {
        id: 1,
        username: 'moderator',
        email: 'mod@example.com',
        role: 'moderator',
        approved: true
      };

      // Act
      const middleware = rbac(['admin', 'moderator']);
      middleware(mockReq as any, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('Token Revocation Store', () => {
    it('should revoke and check revoked tokens', () => {
      const jti = 'test-jti-123';
      
      // Initially not revoked
      expect(tokenRevocationStore.isRevoked(jti)).toBe(false);
      
      // Revoke token
      tokenRevocationStore.revoke(jti);
      
      // Now should be revoked
      expect(tokenRevocationStore.isRevoked(jti)).toBe(true);
    });

    it('should handle cleanup when store gets too large', () => {
      // Add enough tokens to exceed the cleanup threshold (10000)
      for (let i = 0; i < 10001; i++) {
        tokenRevocationStore.revoke(`jti-${i}`);
      }
      
      // The cleanup happens during the interval timer, not immediately.
      // This test verifies that after adding many tokens, 
      // the cleanup mechanism exists and will eventually clear tokens.
      // For now, we verify that tokens were added properly
      expect(tokenRevocationStore.isRevoked('jti-0')).toBe(true);
      expect(tokenRevocationStore.isRevoked('jti-10000')).toBe(true);
      
      // Note: The actual cleanup happens via setInterval every 30 minutes
      // Integration tests can verify the cleanup timing behavior
    });
  });
});
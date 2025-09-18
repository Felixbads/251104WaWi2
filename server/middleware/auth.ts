import { Request, Response, NextFunction } from 'express';
import { replitAuthMiddleware, ReplitUser } from '../auth/replit-auth';
import { db } from '../db';
import { warehouses } from '../../shared/warehouse3.schema';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './security';

// Erweiterte Request-Interface für RBAC
export interface AuthenticatedRequest extends Request {
  user?: ReplitUser;
}

// Authentifizierungsmiddleware - verwendet echte Replit-Authentifizierung
export const authenticateUser = replitAuthMiddleware;

// Alternative für spezielle Fälle ohne Authentifizierung
export const skipAuth = (req: Request, res: Response, next: NextFunction) => {
  next();
};

/**
 * Helper function to get warehouse IDs that a user has access to
 * SECURITY: Implements user-warehouse mapping for enterprise-grade isolation
 */
export async function getUserWarehouses(userId: number): Promise<number[]> {
  try {
    // For now, implement a simple role-based approach
    // In a full implementation, you would have a user_warehouses junction table
    const user = await db.select({
      id: users.id,
      role: users.role
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
    
    if (user.length === 0) {
      logger.warn({ userId }, 'getUserWarehouses: User not found');
      return [];
    }
    
    const userData = user[0];
    
    // Admin users have access to all warehouses
    if (userData.role === 'admin') {
      const allWarehouses = await db.select({ id: warehouses.id })
        .from(warehouses)
        .where(eq(warehouses.status, 'active'));
      return allWarehouses.map(w => w.id);
    }
    
    // TODO: Implement actual user-warehouse assignment table
    // For now, non-admin users have no warehouse access by default (fail-closed)
    // This should be replaced with actual database lookup:
    // SELECT warehouse_id FROM user_warehouses WHERE user_id = ?
    
    logger.debug({ userId, role: userData.role }, 'getUserWarehouses: Non-admin user, no warehouse assignments found');
    return [];
    
  } catch (error) {
    logger.error({ error: error.message, userId }, 'getUserWarehouses: Error fetching user warehouses');
    return []; // Fail closed - return empty array on error
  }
}

/**
 * RBAC: Role-based access control middleware
 * Checks if user has required role(s)
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        logger.warn({ ip: req.ip, path: req.path }, 'RBAC: No authenticated user found');
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
      }
      
      const userRole = user.role;
      if (!allowedRoles.includes(userRole)) {
        logger.warn({
          userId: user.id,
          username: user.username,
          userRole,
          allowedRoles,
          ip: req.ip,
          path: req.path
        }, 'RBAC: Access denied - insufficient role');
        
        return res.status(403).json({
          error: 'Access denied',
          message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`
        });
      }
      
      logger.debug({
        userId: user.id,
        username: user.username,
        userRole,
        path: req.path
      }, 'RBAC: Role access granted');
      
      next();
    } catch (error) {
      logger.error({ error: error.message, path: req.path }, 'RBAC: Role check error');
      res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during role authorization'
      });
    }
  };
};

/**
 * RBAC: Warehouse-level access control middleware
 * Checks if user has access to specific warehouse
 * For multi-warehouse security isolation
 */
export const requireWarehouseAccess = (warehouseIdParam?: string | number) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user) {
        logger.warn({ ip: req.ip, path: req.path }, 'Warehouse access: No authenticated user found');
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access warehouse resources'
        });
      }
      
      // Extract warehouse ID from parameter, body, or query
      let warehouseId: number | undefined;
      
      if (warehouseIdParam) {
        // Explicitly provided warehouse ID parameter
        warehouseId = typeof warehouseIdParam === 'string' ? parseInt(warehouseIdParam) : warehouseIdParam;
      } else {
        // Try to extract from request params, body, or query
        warehouseId = req.params.warehouseId ? parseInt(req.params.warehouseId) :
                     req.body?.warehouseId ? parseInt(req.body.warehouseId) :
                     req.query?.warehouseId ? parseInt(req.query.warehouseId as string) :
                     undefined;
      }
      
      // Admin users have access to all warehouses
      if (user.role === 'admin') {
        logger.debug({
          userId: user.id,
          username: user.username,
          warehouseId,
          path: req.path
        }, 'Warehouse access: Admin access granted to all warehouses');
        return next();
      }
      
      // SECURITY FIX: FAIL CLOSED - Warehouse ID is required
      if (!warehouseId || isNaN(warehouseId)) {
        logger.warn({
          userId: user.id,
          username: user.username,
          ip: req.ip,
          path: req.path
        }, 'Warehouse access: SECURITY - Warehouse ID required but missing');
        
        return res.status(400).json({
          error: 'Warehouse ID required',
          message: 'A valid warehouse ID must be provided to access this resource'
        });
      }
      
      // Verify warehouse exists
      const warehouse = await db.select({
        id: warehouses.id,
        name: warehouses.name,
        status: warehouses.status
      })
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId))
      .limit(1);
      
      if (warehouse.length === 0) {
        logger.warn({
          userId: user.id,
          username: user.username,
          warehouseId,
          ip: req.ip,
          path: req.path
        }, 'Warehouse access: Warehouse not found');
        
        return res.status(404).json({
          error: 'Warehouse not found',
          message: `Warehouse with ID ${warehouseId} does not exist`
        });
      }
      
      const warehouseData = warehouse[0];
      
      // Check if warehouse is active
      if (warehouseData.status !== 'active') {
        logger.warn({
          userId: user.id,
          username: user.username,
          warehouseId,
          warehouseStatus: warehouseData.status,
          ip: req.ip,
          path: req.path
        }, 'Warehouse access: Warehouse not active');
        
        return res.status(403).json({
          error: 'Warehouse not accessible',
          message: `Warehouse '${warehouseData.name}' is currently ${warehouseData.status}`
        });
      }
      
      // SECURITY FIX: Enforce user-warehouse assignment (fail-closed)
      const userWarehouses = await getUserWarehouses(user.id);
      if (!userWarehouses.includes(warehouseId)) {
        logger.warn({
          userId: user.id,
          username: user.username,
          userRole: user.role,
          warehouseId,
          assignedWarehouses: userWarehouses,
          ip: req.ip,
          path: req.path
        }, 'Warehouse access: SECURITY - Access denied to warehouse');
        
        return res.status(403).json({
          error: 'Access denied to warehouse',
          message: `User does not have access to warehouse ${warehouseId}`
        });
      }
      
      logger.info({
        userId: user.id,
        username: user.username,
        userRole: user.role,
        warehouseId,
        warehouseName: warehouseData.name,
        ip: req.ip,
        path: req.path
      }, 'Warehouse access: Access granted');
      
      // Attach warehouse info to request for later use
      (req as any).warehouse = warehouseData;
      
      next();
    } catch (error) {
      logger.error({ 
        error: error.message, 
        userId: req.user?.id,
        path: req.path 
      }, 'Warehouse access: Authorization error');
      
      res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during warehouse authorization'
      });
    }
  };
};

/**
 * Audit logging middleware for critical operations
 * SECURITY: Logs all access attempts for compliance and security monitoring
 * FIXED: Properly implemented with comprehensive audit data collection
 */
export const auditLog = (operation: string, resource?: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    const startTime = Date.now();
    
    // Log the access attempt
    logger.info({
      audit: true,
      operation,
      resource,
      userId: user?.id,
      username: user?.username,
      userRole: user?.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      query: req.query,
      timestamp: new Date().toISOString()
    }, `AUDIT: ${operation} attempted`);
    
    // Capture the original res.json to log the response
    const originalJson = res.json;
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;
      
      logger.info({
        audit: true,
        operation,
        resource,
        userId: user?.id,
        username: user?.username,
        success,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      }, `AUDIT: ${operation} ${success ? 'completed' : 'failed'}`);
      
      return originalJson.call(this, body);
    };
    
    next();
  };
};
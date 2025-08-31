/**
 * Replit Native Authentication Module
 * Integrates with Replit's environment variables for seamless authentication
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export interface ReplitUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'employee';
  approved: boolean;
  replitUsername?: string;
  isOwner?: boolean;
}

/**
 * Gets Replit user information from environment variables
 */
export function getReplitUserInfo(): { username: string | undefined; owner: string | undefined; isOwner: boolean } {
  const replitUser = process.env.REPLIT_USER;
  const replOwner = process.env.REPL_OWNER;
  
  console.log('[REPLIT-AUTH] Environment variables:', {
    REPLIT_USER: replitUser || 'not set',
    REPL_OWNER: replOwner || 'not set',
    isOwner: replitUser === replOwner
  });

  return {
    username: replitUser,
    owner: replOwner,
    isOwner: replitUser === replOwner
  };
}

/**
 * Determines user role based on Replit ownership and admin configuration
 */
export function determineUserRole(replitUsername: string, isOwner: boolean): 'admin' | 'employee' {
  // Check if user is explicitly configured as admin via environment variable
  const adminUsers = process.env.ADMIN_USERS?.split(',').map(u => u.trim()) || [];
  
  // Owner is always admin, or if explicitly configured as admin
  if (isOwner || adminUsers.includes(replitUsername)) {
    return 'admin';
  }
  
  return 'employee';
}

/**
 * Creates or updates user based on Replit authentication
 */
export async function createOrUpdateReplitUser(replitUsername: string, isOwner: boolean): Promise<ReplitUser | null> {
  try {
    const role = determineUserRole(replitUsername, isOwner);
    const email = `${replitUsername}@replit.local`; // Generate email from username
    
    // Check if user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, replitUsername))
      .limit(1);
    
    if (existingUser.length > 0) {
      // Update existing user
      const [updatedUser] = await db.update(users)
        .set({
          role,
          approved: true, // Auto-approve Replit users
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser[0].id))
        .returning();
      
      console.log('[REPLIT-AUTH] Updated existing user:', {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      });
      
      return {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email || `${updatedUser.username}@replit.local`,
        role: updatedUser.role as 'admin' | 'employee',
        approved: updatedUser.approved || false,
        replitUsername,
        isOwner
      };
    } else {
      // Create new user
      const [newUser] = await db.insert(users)
        .values({
          username: replitUsername,
          email,
          password: 'replit-auth', // Placeholder password for Replit users
          role,
          approved: true, // Auto-approve Replit users
          approvedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      console.log('[REPLIT-AUTH] Created new user:', {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      });
      
      return {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email || `${newUser.username}@replit.local`,
        role: newUser.role as 'admin' | 'employee',
        approved: newUser.approved || false,
        replitUsername,
        isOwner
      };
    }
  } catch (error) {
    console.error('[REPLIT-AUTH] Error creating/updating user:', error);
    return null;
  }
}

/**
 * Middleware to authenticate requests using Replit environment variables
 */
export async function replitAuthMiddleware(req: Request & { user?: ReplitUser }, res: Response, next: NextFunction) {
  try {
    const { username, owner, isOwner } = getReplitUserInfo();
    
    // SECURITY: Require Replit authentication - no bypass allowed
    if (!username) {
      console.log('[REPLIT-AUTH] SECURITY: No REPLIT_USER found - authentication required');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No Replit user found. Please ensure you are running this on Replit.'
      });
    }
    
    // Create or update user based on Replit username
    const user = await createOrUpdateReplitUser(username, isOwner);
    
    if (!user) {
      return res.status(500).json({ 
        error: 'User creation failed',
        message: 'Could not create or update user from Replit authentication'
      });
    }
    
    // Attach user to request
    req.user = user;
    
    console.log('[REPLIT-AUTH] User authenticated:', {
      username: user.username,
      role: user.role,
      isOwner: user.isOwner
    });
    
    next();
  } catch (error) {
    console.error('[REPLIT-AUTH] Authentication middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
}

/**
 * Gets current authenticated user information
 */
export async function getCurrentReplitUser(): Promise<ReplitUser | null> {
  const { username, owner, isOwner } = getReplitUserInfo();
  
  if (!username) {
    // SECURITY: No fallback allowed - require Replit authentication
    console.log('[REPLIT-AUTH] SECURITY: No REPLIT_USER found - no fallback');
    return null;
  }
  
  return await createOrUpdateReplitUser(username, isOwner);
}
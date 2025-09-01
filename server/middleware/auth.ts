import { Request, Response, NextFunction } from 'express';
import { replitAuthMiddleware } from '../auth/replit-auth';

// Authentifizierungsmiddleware - verwendet echte Replit-Authentifizierung
export const authenticateUser = replitAuthMiddleware;

// Alternative für spezielle Fälle ohne Authentifizierung
export const skipAuth = (req: Request, res: Response, next: NextFunction) => {
  next();
};
import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Einfacher Authentifizierungs-Middleware für API-Routen
export function authenticateAndAuthorize(allowedRoles: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // API-Token aus Authorization-Header extrahieren
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      // Wenn kein Token vorhanden, aber eine Session mit userId, nehme diese
      if (!token && req.session && (req.session as any).userId) {
        // Benutzer aus der Datenbank abrufen
        const user = await storage.getUserById((req.session as any).userId);
        
        if (user) {
          if (allowedRoles.length === 0 || allowedRoles.includes(user.role)) {
            // Benutzer zur Request hinzufügen
            (req as any).user = user;
            return next();
          } else {
            return res.status(403).json({ error: 'Unzureichende Berechtigungen' });
          }
        }
      }

      // SECURITY: Authentication always required - no development bypass
      // Authentifizierung ist immer erforderlich

      // Token verifizieren (hier vereinfachte Version)
      if (token) {
        // In einer realen Anwendung: JWT verifizieren oder Token in der Datenbank prüfen
        const isValidToken = token === process.env.API_TOKEN;
        
        if (isValidToken) {
          return next();
        }
      }

      // Wenn keine Authentifizierung erfolgreich war
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    } catch (error) {
      console.error('Authentifizierungsfehler:', error);
      return res.status(500).json({ error: 'Interner Serverfehler bei der Authentifizierung' });
    }
  };
}
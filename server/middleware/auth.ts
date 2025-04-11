import { Request, Response, NextFunction } from 'express';

// Authentifizierungsmiddleware
export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  // In diesem Kontext prüfen wir nicht die Authentifizierung,
  // da wir davon ausgehen, dass die Session bereits durch Express-Session verwaltet wird
  // In einer Produktionsumgebung würde hier eine robustere Authentifizierungsprüfung stattfinden
  
  next();
};
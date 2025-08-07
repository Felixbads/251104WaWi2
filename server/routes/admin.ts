import express, { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { User } from '../../shared/schema';
import bcrypt from 'bcryptjs';
import { notifyAdminsOfNewUser, notifyUserOfApprovalStatus } from '../services/emailService';

const router = express.Router();

interface AuthRequest extends Request {
  user?: User;
}

// Vereinfachte Authentifizierung - holt direkt den Admin-Benutzer
const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const adminUser = await storage.getUserByUsername('Admin');
    
    if (!adminUser) {
      return res.status(401).json({ error: "No admin user found" });
    }
    
    req.user = adminUser;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Alle Benutzer abrufen
router.get('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const users = await storage.getUsers();
    res.json({
      success: true,
      users,
      message: `${users.length} Benutzer gefunden`
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Benutzer:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Benutzer',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Wartende Benutzer abrufen
router.get('/users/pending', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const users = await storage.getUsers();
    const pendingUsers = users.filter(user => !user.approved);
    res.json({
      success: true,
      users: pendingUsers,
      message: `${pendingUsers.length} wartende Benutzer gefunden`
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen wartender Benutzer:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden wartender Benutzer',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Neuen Benutzer erstellen
router.post('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prüfen ob Benutzername bereits existiert
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Passwort hashen
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await storage.createUser({
      username,
      email: email || null,
      password: hashedPassword,
      role: role || 'user',
    } as any);

    // E-Mail-Benachrichtigung für neuen Benutzer (falls nicht sofort genehmigt)
    if (!req.user?.id && email) {
      try {
        await notifyAdminsOfNewUser({
          username,
          email,
          role: role || 'user',
          createdAt: new Date()
        });
        console.log(`📧 Admin-Benachrichtigung für neuen Benutzer ${username} gesendet`);
      } catch (emailError) {
        console.error('⚠️ Fehler beim Senden der Admin-Benachrichtigung:', emailError);
      }
    }

    // Passwort aus der Antwort entfernen
    const { password: _, ...userResponse } = newUser;
    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: 'Failed to create user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Einzelnen Benutzer abrufen
router.get('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error(`Error fetching user with ID ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Benutzer genehmigen
router.post('/users/:id/approve', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const adminUser = req.user;
    
    if (!adminUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.approved) {
      return res.json({ success: true, message: 'User was already approved' });
    }
    
    const updatedUser = await storage.updateUser(userId, {
      approved: true,
      approvedBy: adminUser.id,
      approvedAt: new Date(),
    } as any);
    
    // E-Mail-Benachrichtigung an den freigeschalteten Benutzer senden
    if (updatedUser && updatedUser.email) {
      try {
        await notifyUserOfApprovalStatus(
          updatedUser.email,
          updatedUser.username,
          true,
          updatedUser.role || 'user'
        );
        console.log(`📧 Freigabe-Benachrichtigung für Benutzer ${updatedUser.username} gesendet`);
      } catch (emailError) {
        console.error('⚠️ Fehler beim Senden der Freigabe-Benachrichtigung:', emailError);
        // E-Mail-Fehler sollte die Genehmigung nicht blockieren
      }
    }
    
    res.json({ success: true, user: updatedUser, message: `Benutzer ${updatedUser?.username} wurde erfolgreich freigegeben` });
  } catch (error) {
    console.error(`Error approving user ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to approve user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Benutzerrolle ändern
router.post('/users/:id/role', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (!role || (role !== 'user' && role !== 'admin')) {
      return res.status(400).json({ error: 'Invalid role. Valid values are "user" or "admin"' });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verhindern, dass der Admin sich selbst die Admin-Rechte entzieht
    if (user.id === req.user?.id && role !== 'admin') {
      return res.status(400).json({ 
        error: 'Cannot remove admin role from yourself' 
      });
    }
    
    const updatedUser = await storage.updateUser(userId, { role } as any);
    
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(`Error changing role for user ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to change user role',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Benutzer löschen
router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verhindern, dass sich der Admin selbst löscht
    if (user.id === req.user?.id) {
      return res.status(400).json({ 
        error: 'Cannot delete your own account' 
      });
    }
    
    await storage.deleteUser(userId);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error(`Error deleting user ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to delete user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
import express, { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { User } from '../../shared/schema';

const router = express.Router();

// Erweitern der Request-Schnittstelle zur Unterstützung des user-Objekts
interface AuthRequest extends Request {
  user?: User;
}

// Admin-Middleware: Stellt sicher, dass der Benutzer Admin-Rechte hat
const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin privileges required' });
    }

    next();
  } catch (error) {
    console.error('Admin authorization error:', error);
    res.status(401).json({ error: 'Authorization failed' });
  }
};

// Alle Benutzer abrufen (nur für Admins)
router.get('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const users = await storage.getUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Einzelnen Benutzer abrufen
router.get('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
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

// Benutzer freigeben
router.post('/users/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(`Error approving user ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to approve user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Benutzerfreigabe zurücksetzen
router.post('/users/:id/reset-approval', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    
    // Administratoren können nicht die Genehmigung eines anderen Administrators zurücksetzen
    if (user.role === 'admin' && userId !== adminUser.id) {
      return res.status(403).json({ 
        error: 'Cannot reset approval for another administrator' 
      });
    }
    
    const updatedUser = await storage.updateUser(userId, {
      approved: false,
      approvedBy: null,
      approvedAt: null,
    } as any);
    
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(`Error resetting approval for user ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to reset approval for user',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Benutzerrolle ändern
router.post('/users/:id/role', requireAdmin, async (req: AuthRequest, res: Response) => {
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
router.delete('/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verhindern, dass der Admin sich selbst löscht
    if (user.id === req.user?.id) {
      return res.status(400).json({ 
        error: 'Cannot delete your own account' 
      });
    }
    
    const result = await storage.deleteUser(userId);
    
    if (!result) {
      return res.status(404).json({ error: 'User not found or could not be deleted' });
    }
    
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
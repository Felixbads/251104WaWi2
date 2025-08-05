import express, { Request, Response } from 'express';
import { db } from '../db';
import { pagePermissions, insertPagePermissionSchema, users } from '../../shared/schema';
import { eq, desc, and, asc } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// Middleware to check if user is admin (simplified for now - should use proper auth middleware)
const requireAdmin = async (req: any, res: Response, next: any) => {
  // For now, using simplified auth check - in production, use proper token validation
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Admin access required - no token' });
    }
    
    // Simplified check - in production, validate token properly
    const adminUser = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    if (!adminUser.length) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = adminUser[0];
    next();
  } catch (error) {
    console.error('Auth error in page-permissions:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// GET /api/page-permissions - Get all page permissions
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    
    let query = db.select().from(pagePermissions);
    
    if (search) {
      query = query.where(
        pagePermissions.pageTitle.like(`%${search}%`)
      );
    }
    
    const permissions = await query.orderBy(asc(pagePermissions.pageTitle));
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching page permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch page permissions'
    });
  }
});

// PATCH /api/page-permissions/:pageId - Update visibility for specific page
router.patch('/:pageId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { visibleForEmployee } = req.body;
    
    if (typeof visibleForEmployee !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'visibleForEmployee must be a boolean'
      });
    }
    
    const [updatedPermission] = await db
      .update(pagePermissions)
      .set({
        visibleForEmployee,
        updatedAt: new Date()
      })
      .where(eq(pagePermissions.pageId, pageId))
      .returning();
    
    if (!updatedPermission) {
      return res.status(404).json({
        success: false,
        error: 'Page permission not found'
      });
    }
    
    res.json({
      success: true,
      data: updatedPermission
    });
  } catch (error) {
    console.error('Error updating page permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update page permission'
    });
  }
});

// POST /api/page-permissions/register - Register a new page
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = insertPagePermissionSchema.parse(req.body);
    
    // Check if page already exists
    const existingPage = await db
      .select()
      .from(pagePermissions)
      .where(eq(pagePermissions.pageId, validatedData.pageId))
      .limit(1);
    
    if (existingPage.length > 0) {
      return res.json({
        success: true,
        data: existingPage[0],
        message: 'Page already registered'
      });
    }
    
    // Insert new page permission
    const [newPermission] = await db
      .insert(pagePermissions)
      .values({
        ...validatedData,
        visibleForEmployee: validatedData.visibleForEmployee ?? false
      })
      .returning();
    
    res.status(201).json({
      success: true,
      data: newPermission,
      message: 'Page registered successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    console.error('Error registering page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register page'
    });
  }
});

// POST /api/page-permissions/bulk-update - Update multiple permissions at once
router.post('/bulk-update', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { action, pageIds } = req.body; // action: 'select-all' | 'deselect-all'
    
    if (!action || !Array.isArray(pageIds)) {
      return res.status(400).json({
        success: false,
        error: 'action and pageIds array are required'
      });
    }
    
    const visibleForEmployee = action === 'select-all';
    
    const updatedPermissions = await db
      .update(pagePermissions)
      .set({
        visibleForEmployee,
        updatedAt: new Date()
      })
      .where(
        pageIds.length > 0 
          ? pagePermissions.pageId.in(pageIds)
          : undefined // Update all if no specific pageIds provided
      )
      .returning();
    
    res.json({
      success: true,
      data: updatedPermissions,
      message: `${updatedPermissions.length} pages updated`
    });
  } catch (error) {
    console.error('Error bulk updating page permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update permissions'
    });
  }
});

// POST /api/page-permissions/seed - Initialize with default pages
router.post('/seed', requireAdmin, async (req: Request, res: Response) => {
  try {
    const defaultPages = [
      { pageId: 'warenumlagerung', pageTitle: 'Warenumlagerung', visibleForEmployee: true, category: 'inventory' },
      { pageId: 'lagerbestand', pageTitle: 'Lagerbestand', visibleForEmployee: true, category: 'inventory' },
      { pageId: 'automaten', pageTitle: 'Automaten', visibleForEmployee: true, category: 'machines' },
      { pageId: 'produkte', pageTitle: 'Produkte', visibleForEmployee: true, category: 'products' },
      { pageId: 'produzenten', pageTitle: 'Produzenten', visibleForEmployee: true, category: 'suppliers' },
      { pageId: 'bestellungen', pageTitle: 'Bestellungen', visibleForEmployee: true, category: 'orders' },
      { pageId: 'wareneingang', pageTitle: 'Wareneingang', visibleForEmployee: true, category: 'orders' },
      
      // Admin-only pages by default
      { pageId: 'dashboard', pageTitle: 'Dashboard', visibleForEmployee: false, category: 'overview' },
      { pageId: 'einstellungen', pageTitle: 'Einstellungen', visibleForEmployee: false, category: 'settings' },
      { pageId: 'seitenfreigabe', pageTitle: 'Seitenfreigabe', visibleForEmployee: false, category: 'settings' },
      { pageId: 'benutzerverwaltung', pageTitle: 'Benutzerverwaltung', visibleForEmployee: false, category: 'settings' },
      { pageId: 'transaktionen', pageTitle: 'Transaktionen', visibleForEmployee: false, category: 'analytics' },
      { pageId: 'prognosen', pageTitle: 'Prognosen', visibleForEmployee: false, category: 'analytics' },
      { pageId: 'berichte', pageTitle: 'Berichte', visibleForEmployee: false, category: 'analytics' },
    ];
    
    const insertedPages = [];
    
    for (const page of defaultPages) {
      try {
        // Check if page already exists
        const existing = await db
          .select()
          .from(pagePermissions)
          .where(eq(pagePermissions.pageId, page.pageId))
          .limit(1);
        
        if (existing.length === 0) {
          const [inserted] = await db
            .insert(pagePermissions)
            .values(page)
            .returning();
          insertedPages.push(inserted);
        }
      } catch (error) {
        console.error(`Error inserting page ${page.pageId}:`, error);
      }
    }
    
    res.json({
      success: true,
      data: insertedPages,
      message: `${insertedPages.length} new pages seeded`
    });
  } catch (error) {
    console.error('Error seeding page permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed page permissions'
    });
  }
});

export default router;
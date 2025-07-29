import express from 'express';
import { db } from '../db.js';
import { supplierFavorites, insertSupplierFavoriteSchema } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();

// GET /api/supplier-favorites - Get all favorites for current user
router.get('/', async (req, res) => {
  try {
    // Mock user ID for now - in real app would come from auth middleware
    const userId = 1; // TODO: Get from req.user
    
    const favorites = await db
      .select()
      .from(supplierFavorites)
      .where(eq(supplierFavorites.userId, userId));

    const supplierIds = favorites.map(f => f.supplierId);
    
    res.json({ data: supplierIds });
  } catch (error) {
    console.error('Error fetching supplier favorites:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// POST /api/supplier-favorites - Add supplier to favorites
router.post('/', async (req, res) => {
  try {
    const userId = 1; // TODO: Get from req.user
    
    const validatedData = insertSupplierFavoriteSchema.parse({
      userId,
      supplierId: req.body.supplierId,
    });

    const [favorite] = await db
      .insert(supplierFavorites)
      .values(validatedData)
      .returning();

    res.json({ success: true, data: favorite });
  } catch (error) {
    console.error('Error adding supplier to favorites:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// DELETE /api/supplier-favorites/:supplierId - Remove supplier from favorites
router.delete('/:supplierId', async (req, res) => {
  try {
    const userId = 1; // TODO: Get from req.user
    const supplierId = parseInt(req.params.supplierId);

    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Invalid supplier ID' });
    }

    await db
      .delete(supplierFavorites)
      .where(
        and(
          eq(supplierFavorites.userId, userId),
          eq(supplierFavorites.supplierId, supplierId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing supplier from favorites:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

export default router;
import { Router } from 'express';
import { db } from '../db';
import { supplierDiscountConditions, insertSupplierDiscountConditionSchema } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/supplier-discounts/:supplierId - Alle Rabattbedingungen für einen Lieferanten
router.get('/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }

    const discounts = await db
      .select()
      .from(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.supplierId, supplierId))
      .orderBy(supplierDiscountConditions.priority, supplierDiscountConditions.createdAt);

    res.json(discounts);
  } catch (error) {
    console.error('Fehler beim Laden der Rabattbedingungen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Rabattbedingungen' });
  }
});

// POST /api/supplier-discounts - Neue Rabattbedingung erstellen
router.post('/', async (req, res) => {
  try {
    const validatedData = insertSupplierDiscountConditionSchema.parse(req.body);
    
    const [newDiscount] = await db
      .insert(supplierDiscountConditions)
      .values({
        ...validatedData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    res.json(newDiscount);
  } catch (error) {
    console.error('Fehler beim Erstellen der Rabattbedingung:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validierungsfehler', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Fehler beim Erstellen der Rabattbedingung' });
  }
});

// PUT /api/supplier-discounts/:id - Rabattbedingung aktualisieren
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Rabattbedingung-ID' });
    }

    const validatedData = insertSupplierDiscountConditionSchema.partial().parse(req.body);
    
    const [updatedDiscount] = await db
      .update(supplierDiscountConditions)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(eq(supplierDiscountConditions.id, id))
      .returning();

    if (!updatedDiscount) {
      return res.status(404).json({ error: 'Rabattbedingung nicht gefunden' });
    }

    res.json(updatedDiscount);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Rabattbedingung:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Validierungsfehler', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Rabattbedingung' });
  }
});

// DELETE /api/supplier-discounts/:id - Rabattbedingung löschen
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Rabattbedingung-ID' });
    }

    const [deletedDiscount] = await db
      .delete(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.id, id))
      .returning();

    if (!deletedDiscount) {
      return res.status(404).json({ error: 'Rabattbedingung nicht gefunden' });
    }

    res.json({ success: true, message: 'Rabattbedingung erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der Rabattbedingung:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Rabattbedingung' });
  }
});

export default router;
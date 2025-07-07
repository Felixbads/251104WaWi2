import { Router } from 'express';
import { pool } from '../db';
import { supplierDiscountConditions, insertSupplierDiscountConditionSchema } from '@shared/schema';

const router = Router();

// GET /api/supplier-discounts/:supplierId - Alle Rabattbedingungen für einen Lieferanten
router.get('/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }

    // Verwende direkte SQL-Abfrage für bessere Kompatibilität
    const result = await pool.query(`
      SELECT * FROM supplier_discount_conditions 
      WHERE supplier_id = $1 
      ORDER BY created_at DESC
    `, [supplierId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Rabattbedingungen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Rabattbedingungen' });
  }
});

// POST /api/supplier-discounts - Neue Rabattbedingung erstellen
router.post('/', async (req, res) => {
  try {
    console.log('[SUPPLIER-DISCOUNTS] Creating new discount:', req.body);
    
    const {
      supplierId,
      discountType,
      discountPercentage,
      discountAmount,
      thresholdQuantity,
      thresholdAmount,
      maxQuantity,
      maxAmount,
      paymentTermsDays,
      skontoPercentage,
      validFrom,
      validTo,
      isActive = true,
      priority = 0,
      canCombineWithOtherDiscounts = false,
      description,
      minimumOrderQuantity,
      applicableProductCategories,
      excludedProductIds
    } = req.body;

    const result = await pool.query(`
      INSERT INTO supplier_discount_conditions (
        supplier_id, discount_type, description, discount_percentage, discount_amount,
        threshold_quantity, threshold_amount, max_quantity, max_amount,
        payment_terms_days, skonto_percentage, valid_from, valid_to,
        is_active, priority, can_combine_with_other_discounts,
        minimum_order_quantity, applicable_product_categories, excluded_product_ids,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
      ) RETURNING *
    `, [
      supplierId, discountType, description, discountPercentage, discountAmount,
      thresholdQuantity, thresholdAmount, maxQuantity, maxAmount,
      paymentTermsDays, skontoPercentage, validFrom || null, validTo || null,
      isActive, priority, canCombineWithOtherDiscounts,
      minimumOrderQuantity, applicableProductCategories, excludedProductIds
    ]);

    console.log('[SUPPLIER-DISCOUNTS] Successfully created discount:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fehler beim Erstellen der Rabattbedingung:', error);
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

    console.log('[SUPPLIER-DISCOUNTS] Updating discount condition:', req.body);
    
    const {
      discountType,
      discountPercentage,
      discountAmount,
      thresholdQuantity,
      thresholdAmount,
      maxQuantity,
      maxAmount,
      paymentTermsDays,
      skontoPercentage,
      validFrom,
      validTo,
      isActive,
      priority,
      canCombineWithOtherDiscounts,
      description,
      minimumOrderQuantity,
      applicableProductCategories,
      excludedProductIds
    } = req.body;

    const result = await pool.query(`
      UPDATE supplier_discount_conditions 
      SET 
        discount_type = $2,
        description = $3,
        discount_percentage = $4,
        discount_amount = $5,
        threshold_quantity = $6,
        threshold_amount = $7,
        max_quantity = $8,
        max_amount = $9,
        payment_terms_days = $10,
        skonto_percentage = $11,
        valid_from = $12,
        valid_to = $13,
        is_active = $14,
        priority = $15,
        can_combine_with_other_discounts = $16,
        minimum_order_quantity = $17,
        applicable_product_categories = $18,
        excluded_product_ids = $19,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id, discountType, description, discountPercentage, discountAmount,
      thresholdQuantity, thresholdAmount, maxQuantity, maxAmount,
      paymentTermsDays, skontoPercentage, validFrom || null, validTo || null,
      isActive, priority, canCombineWithOtherDiscounts,
      minimumOrderQuantity, applicableProductCategories, excludedProductIds
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rabattbedingung nicht gefunden' });
    }

    console.log('[SUPPLIER-DISCOUNTS] Successfully updated discount:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Rabattbedingung:', error);
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

    console.log('[SUPPLIER-DISCOUNTS] Deleting discount condition:', id);

    const result = await pool.query(`
      DELETE FROM supplier_discount_conditions 
      WHERE id = $1 
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rabattbedingung nicht gefunden' });
    }

    console.log('[SUPPLIER-DISCOUNTS] Successfully deleted discount:', result.rows[0]);
    res.json({ success: true, message: 'Rabattbedingung erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der Rabattbedingung:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Rabattbedingung' });
  }
});

export default router;
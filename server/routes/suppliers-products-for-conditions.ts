import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/suppliers/:id/available-products - Alle verfügbaren Produkte für neue Einkaufsbedingungen
router.get('/:id/available-products', async (req, res) => {
  try {
    const { id: supplierId } = req.params;
    console.log('[SUPPLIERS-PRODUCTS] Fetching available products for supplier:', supplierId);
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.product_name,
        p.category,
        p.vat,
        p.supplier_id
      FROM products p
      WHERE p.id IS NOT NULL
        AND p.product_name IS NOT NULL
        AND p.product_name != ''
      ORDER BY p.product_name ASC
      LIMIT 1000
    `);
    
    console.log('[SUPPLIERS-PRODUCTS] Found', result.rows.length, 'available products');
    res.json(result.rows);
  } catch (error) {
    console.error('[SUPPLIERS-PRODUCTS] Error fetching available products:', error);
    res.status(500).json({ error: 'Server error fetching available products' });
  }
});

// PUT /api/purchase-conditions/:id - Update purchase condition
router.put('/purchase-conditions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      unitPrice,
      taxRate,
      grossPrice,
      minQuantity,
      packagingUnit,
      packagingQuantity,
      deliveryTime,
      validFrom,
      validTo,
      isPreferred,
      notes,
      leadTime
    } = req.body;
    
    console.log('[PURCHASE-CONDITIONS] Updating condition:', id, req.body);
    
    const result = await pool.query(`
      UPDATE purchase_conditions 
      SET 
        unit_price = $1,
        tax_rate = $2,
        gross_price = $3,
        min_quantity = $4,
        packaging_unit = $5,
        packaging_quantity = $6,
        delivery_time = $7,
        valid_from = $8,
        valid_to = $9,
        is_preferred = $10,
        notes = $11,
        lead_time = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `, [
      unitPrice,
      taxRate,
      grossPrice,
      minQuantity,
      packagingUnit,
      packagingQuantity,
      deliveryTime,
      validFrom || null,
      validTo || null,
      isPreferred || false,
      notes,
      leadTime,
      parseInt(id)
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase condition not found' });
    }
    
    console.log('[PURCHASE-CONDITIONS] Successfully updated condition:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[PURCHASE-CONDITIONS] Error updating condition:', error);
    res.status(500).json({ error: 'Server error updating purchase condition' });
  }
});

export default router;
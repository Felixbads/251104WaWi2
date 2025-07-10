import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/suppliers-conditions/all - Alle Lieferanten für Einkaufsbedingungen (für Produkt → Lieferant)
router.get('/all', async (req, res) => {
  try {
    console.log('[SUPPLIERS-PRODUCTS] Fetching all suppliers for product conditions');
    
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.email,
        s.phone,
        s.city,
        s.status
      FROM suppliers s
      WHERE s.status = 'active'
        AND s.name IS NOT NULL
        AND s.name != ''
      ORDER BY s.name ASC
      LIMIT 200
    `);
    
    console.log('[SUPPLIERS-PRODUCTS] Found', result.rows.length, 'suppliers');
    res.json(result.rows);
  } catch (error) {
    console.error('[SUPPLIERS-PRODUCTS] Error fetching suppliers:', error);
    res.status(500).json({ error: 'Server error fetching suppliers' });
  }
});

// GET /api/suppliers/:supplierId/available-products - Alle verfügbaren Produkte für neue Einkaufsbedingungen
router.get('/:supplierId/available-products', async (req, res) => {
  try {
    const { supplierId } = req.params;
    console.log('[SUPPLIERS-PRODUCTS] Fetching available products for supplier:', supplierId);
    
    // Validierung der Supplier-ID
    if (!supplierId || supplierId === 'all-for-conditions') {
      return res.status(400).json({ error: 'Invalid supplier ID' });
    }
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.product_name as "productName",
        p.sku,
        p.category,
        p.vat,
        p.supplier_id
      FROM products p
      WHERE p.supplier_id = $1
        AND p.product_name IS NOT NULL
        AND p.product_name != ''
        AND p.status = 'active'
      ORDER BY p.product_name ASC
      LIMIT 1000
    `, [supplierId]);
    
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
      minQuantityUnit,
      packagingUnit,
      packagingQuantity,
      packagingType,
      depositPerUnit,
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
        min_quantity_unit = $5,
        packaging_unit = $6,
        packaging_quantity = $7,
        packaging_type = $8,
        deposit_per_unit = $9,
        delivery_time = $10,
        valid_from = $11,
        valid_to = $12,
        is_preferred = $13,
        notes = $14,
        lead_time = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *
    `, [
      unitPrice,
      taxRate,
      grossPrice,
      minQuantity,
      minQuantityUnit || 'individual',
      packagingUnit,
      packagingQuantity,
      packagingType,
      depositPerUnit || 0,
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
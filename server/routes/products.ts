import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/products/:id - Einzelnes Produkt abrufen
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        p.*,
        pc.name as category_name,
        s.company_name as supplier_name,
        string_agg(DISTINCT pt.name, ', ') as package_types
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_package_types ppt ON p.id = ppt.product_id
      LEFT JOIN package_types pt ON ppt.package_type_id = pt.id
      WHERE p.id = $1
      GROUP BY p.id, pc.name, s.company_name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fehler beim Laden des Produkts:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden des Produkts' });
  }
});

// PUT /api/products/:id - Produkt aktualisieren
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      product_name,
      description,
      detailed_description,
      category_id,
      package_size,
      package_type,
      minimum_order_quantity,
      shelf_life_days,
      ingredients,
      allergens,
      nutritional_info,
      purchase_conditions
    } = req.body;

    // Prüfe ob Produkt existiert
    const existingProduct = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    // Update Produkt
    const updateQuery = `
      UPDATE products 
      SET 
        product_name = COALESCE($2, product_name),
        description = COALESCE($3, description),
        detailed_description = COALESCE($4, detailed_description),
        category_id = COALESCE($5, category_id),
        package_size = COALESCE($6, package_size),
        package_type = COALESCE($7, package_type),
        minimum_order_quantity = COALESCE($8, minimum_order_quantity),
        shelf_life_days = COALESCE($9, shelf_life_days),
        ingredients = COALESCE($10, ingredients),
        allergens = COALESCE($11, allergens),
        nutritional_info = COALESCE($12, nutritional_info),
        purchase_conditions = COALESCE($13, purchase_conditions),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      id,
      product_name,
      description,
      detailed_description,
      category_id,
      package_size,
      package_type,
      minimum_order_quantity,
      shelf_life_days,
      ingredients,
      allergens,
      nutritional_info,
      purchase_conditions
    ]);

    res.json({
      success: true,
      message: 'Produkt erfolgreich aktualisiert',
      product: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Aktualisieren des Produkts:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Aktualisieren des Produkts',
      details: error.message 
    });
  }
});

// GET /api/products/:id/purchase-conditions - Einkaufsbedingungen für Produkt
router.get('/:id/purchase-conditions', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        pc.*,
        s.company_name as supplier_name
      FROM purchase_conditions pc
      LEFT JOIN suppliers s ON pc.supplier_id = s.id
      WHERE pc.product_id = $1
      ORDER BY pc.valid_from DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Einkaufsbedingungen:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// POST /api/products/:id/purchase-conditions - Neue Einkaufsbedingung erstellen
router.post('/:id/purchase-conditions', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supplier_id,
      price_per_unit,
      minimum_quantity,
      discount_percentage,
      valid_from,
      valid_to,
      delivery_time,
      notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO purchase_conditions 
      (product_id, supplier_id, price_per_unit, minimum_quantity, discount_percentage, 
       valid_from, valid_to, delivery_time, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      id,
      supplier_id,
      price_per_unit,
      minimum_quantity,
      discount_percentage || 0,
      valid_from,
      valid_to || null,
      delivery_time,
      notes
    ]);

    res.json({
      success: true,
      message: 'Einkaufsbedingung erfolgreich erstellt',
      condition: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Erstellen der Einkaufsbedingung:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Erstellen der Einkaufsbedingung',
      details: error.message 
    });
  }
});

// PUT /api/products/:productId/purchase-conditions/:conditionId - Einkaufsbedingung aktualisieren
router.put('/:productId/purchase-conditions/:conditionId', async (req, res) => {
  try {
    const { conditionId } = req.params;
    const {
      price_per_unit,
      minimum_quantity,
      discount_percentage,
      valid_from,
      valid_to,
      delivery_time,
      notes
    } = req.body;

    const result = await pool.query(`
      UPDATE purchase_conditions 
      SET 
        price_per_unit = COALESCE($2, price_per_unit),
        minimum_quantity = COALESCE($3, minimum_quantity),
        discount_percentage = COALESCE($4, discount_percentage),
        valid_from = COALESCE($5, valid_from),
        valid_to = COALESCE($6, valid_to),
        delivery_time = COALESCE($7, delivery_time),
        notes = COALESCE($8, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [
      conditionId,
      price_per_unit,
      minimum_quantity,
      discount_percentage,
      valid_from,
      valid_to,
      delivery_time,
      notes
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Einkaufsbedingung nicht gefunden' });
    }

    res.json({
      success: true,
      message: 'Einkaufsbedingung erfolgreich aktualisiert',
      condition: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Aktualisieren der Einkaufsbedingung:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Aktualisieren der Einkaufsbedingung',
      details: error.message 
    });
  }
});

// DELETE /api/products/:productId/purchase-conditions/:conditionId - Einkaufsbedingung löschen
router.delete('/:productId/purchase-conditions/:conditionId', async (req, res) => {
  try {
    const { conditionId } = req.params;

    const result = await pool.query(`
      DELETE FROM purchase_conditions WHERE id = $1 RETURNING *
    `, [conditionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Einkaufsbedingung nicht gefunden' });
    }

    res.json({
      success: true,
      message: 'Einkaufsbedingung erfolgreich gelöscht'
    });

  } catch (error) {
    console.error('Fehler beim Löschen der Einkaufsbedingung:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Löschen der Einkaufsbedingung',
      details: error.message 
    });
  }
});

// GET /api/products/:id/refill-history - Nachfüllhistorie für Produkt
router.get('/:id/refill-history', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        r.id,
        r.datetime,
        r.quantity_added,
        r.stock_before,
        r.stock_after,
        r.performed_by,
        r.notes,
        m.machine_name,
        m.location
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN machine_stocks ms ON r.machine_id = ms.machine_id
      WHERE ms.product_id = $1
      ORDER BY r.datetime DESC
      LIMIT 50
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Nachfüllhistorie:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Nachfüllhistorie' });
  }
});

export default router;
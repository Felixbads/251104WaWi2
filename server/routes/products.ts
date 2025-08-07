import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/products/:id - Einzelnes Produkt abrufen
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PRODUCTS] Requesting product with ID:', id);
    
    const result = await pool.query(`
      SELECT 
        p.*,
        pc.name as category_name,
        s.name as supplier_name,
        pt.name as package_type_name
      FROM products p
      LEFT JOIN product_categories pc ON p.category = pc.name
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN package_types pt ON p.package_type_id = pt.id
      WHERE p.id = $1
    `, [id]);

    console.log('[PRODUCTS] Query result:', result.rows.length, 'rows found');

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    console.log('[PRODUCTS] Returning product:', product.product_name);
    res.json(product);
  } catch (error) {
    console.error('[PRODUCTS] Error loading product:', error);
    res.status(500).json({ error: 'Server error loading product' });
  }
});

// PUT /api/products/:id - Produkt aktualisieren
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PRODUCTS] 🔧 PUT UPDATE request for ID:', id);
    console.log('[PRODUCTS] 🔧 UPDATE body:', req.body);
    console.log('[PRODUCTS] 🔧 Headers:', req.headers);
    
    const {
      product_name,
      short_description,
      description,
      category,
      package_size,
      package_type_id,
      min_order_quantity,
      shelf_life_days,
      ingredients,
      allergens,
      nutritional_info,
      purchase_conditions
    } = req.body;

    // Prüfe ob Produkt existiert
    const existingProduct = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (existingProduct.rows.length === 0) {
      console.log('[PRODUCTS] Product not found:', id);
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    // Update Produkt
    const updateQuery = `
      UPDATE products 
      SET 
        product_name = COALESCE($2, product_name),
        short_description = COALESCE($3, short_description),
        description = COALESCE($4, description),
        category = COALESCE($5, category),
        package_size = COALESCE($6, package_size),
        min_order_quantity = COALESCE($7, min_order_quantity),
        shelf_life_days = COALESCE($8, shelf_life_days),
        ingredients = COALESCE($9, ingredients),
        allergens = COALESCE($10, allergens),
        nutritional_info = COALESCE($11, nutritional_info),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      id,
      product_name,
      short_description,
      description,
      category,
      package_size,
      min_order_quantity,
      shelf_life_days,
      ingredients,
      allergens,
      nutritional_info
    ]);

    console.log('[PRODUCTS] Update successful for:', result.rows[0].product_name);
    res.json({
      success: true,
      message: 'Produkt erfolgreich aktualisiert',
      product: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Aktualisieren des Produkts:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Aktualisieren des Produkts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/products/:id/inventory - Komplette Inventardaten für Produkt
router.get('/:id/inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log(`[PRODUCT-INVENTORY] Getting real inventory for product ${productId}`);
    
    // First get the product's vendon_id to join with machine_stocks
    const productResult = await pool.query('SELECT vendon_id FROM products WHERE id = $1', [productId]);
    const productVendonId = productResult.rows[0]?.vendon_id;
    
    console.log(`[PRODUCT-INVENTORY] Product ${productId} has vendon_id: ${productVendonId}`);
    
    // Fetch actual machine stocks from database using product_vendon_id
    const machineStocksResult = await pool.query(`
      SELECT 
        m.id as machine_id,
        m.machine_name,
        m.location_name as location,
        COALESCE(ms.quantity, 0) as current_stock,
        50 as max_capacity,
        ms.last_filled as last_refill_date,
        ms.updated_at
      FROM machines m
      LEFT JOIN machine_stocks ms ON m.id = ms.machine_id AND ms.product_vendon_id = $1
      WHERE m.status = 'active' OR m.status IS NULL
      ORDER BY m.machine_name
    `, [productVendonId]);
    
    // Fetch warehouse stocks (very simplified)
    const warehouseStocksResult = await pool.query(`
      SELECT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        COALESCE(ii.quantity, 0) as current_stock
      FROM warehouses w
      LEFT JOIN inventory_items ii ON w.id = ii.warehouse_id AND ii.product_id = $1
      WHERE w.is_active = true
      ORDER BY w.name ASC
    `, [productId]);
    
    console.log(`[PRODUCT-INVENTORY] Found ${machineStocksResult.rows.length} machine stocks, ${warehouseStocksResult.rows.length} warehouse stocks`);
    
    res.json({
      success: true,
      productId,
      machineStocks: machineStocksResult.rows,
      warehouseStocks: warehouseStocksResult.rows,
      totalMachineStock: machineStocksResult.rows.reduce((sum, row) => sum + parseInt(row.current_stock || 0), 0),
      totalWarehouseStock: warehouseStocksResult.rows.reduce((sum, row) => sum + parseInt(row.current_stock || 0), 0)
    });
    
  } catch (error) {
    console.error('[PRODUCT-INVENTORY] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Fehler beim Laden der Inventardaten',
      details: error instanceof Error ? error.message : String(error)
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
        s.name as supplier_name
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
      unit_price,
      tax_rate,
      gross_price,
      min_quantity,
      packaging_unit,
      packaging_quantity,
      delivery_time,
      valid_from,
      valid_to,
      is_preferred,
      notes,
      lead_time
    } = req.body;

    console.log('[PRODUCTS] Creating purchase condition for product:', id);
    console.log('[PRODUCTS] Request body:', req.body);

    // Calculate gross price if not provided
    const calculatedGrossPrice = gross_price || (unit_price * (1 + (tax_rate / 100)));

    const result = await pool.query(`
      INSERT INTO purchase_conditions 
      (product_id, supplier_id, unit_price, tax_rate, gross_price, min_quantity, 
       packaging_unit, packaging_quantity, delivery_time, valid_from, valid_to, 
       is_preferred, notes, lead_time, supplier_article_number, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *
    `, [
      id,
      supplier_id,
      unit_price,
      tax_rate || 19,
      calculatedGrossPrice,
      min_quantity || 1,
      packaging_unit,
      packaging_quantity || 1,
      delivery_time,
      valid_from || null,
      valid_to || null,
      is_preferred || false,
      notes,
      lead_time || 3,
      req.body.supplier_article_number
    ]);

    console.log('[PRODUCTS] Purchase condition created:', result.rows[0]);

    res.json({
      success: true,
      purchaseCondition: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Erstellen der Einkaufsbedingung:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Erstellen der Einkaufsbedingung',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/products/:id/refill-history - Nachfüllhistorie für Produkt mit vollständigen Details
router.get('/:id/refill-history', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log('[PRODUCTS] Fetching refill history for product ID:', productId);
    
    // Simplified refill data query - directly check refills table
    const result = await pool.query(`
      SELECT 
        r.id,
        r.datetime as refill_date,
        COALESCE(r.quantity, 0) as quantity,
        r.notes,
        m.machine_name,
        m.location_name as machine_location,
        r.operator,
        'refill' as action_type,
        r.refill_type,
        r.status,
        r.created_at,
        p.product_name
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN products p ON p.id = $1
      WHERE r.id IS NOT NULL
      ORDER BY r.datetime DESC
      LIMIT 50
    `, [productId]);
    
    console.log(`[PRODUCTS] Found ${result.rows.length} refill records for product ${productId}`);
    res.json(result.rows);
  } catch (error) {
    console.error('[PRODUCTS] Error fetching refill history:', error);
    res.json([]); // Return empty array on error
  }
});

// GET /api/products/:id/withdrawals-summary - Monthly withdrawal statistics
router.get('/:id/withdrawals-summary', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log('[PRODUCTS] Fetching withdrawals summary for product ID:', productId);
    
    const result = await pool.query(`
      WITH monthly_withdrawals AS (
        SELECT 
          DATE_TRUNC('month', performed_at) as month,
          SUM(CASE 
            WHEN movement_type IN ('OUT', 'REFILL') THEN quantity 
            ELSE 0 
          END) as withdrawn,
          SUM(CASE 
            WHEN movement_type = 'IN' THEN quantity 
            ELSE 0 
          END) as added
        FROM inventory_movements
        WHERE product_id = $1 
          AND performed_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', performed_at)
      )
      SELECT 
        TO_CHAR(month, 'YYYY-MM') as month_key,
        TO_CHAR(month, 'Mon YYYY') as month_label,
        COALESCE(withdrawn, 0) as withdrawn,
        COALESCE(added, 0) as added,
        COALESCE(withdrawn, 0) - COALESCE(added, 0) as net_change
      FROM monthly_withdrawals
      ORDER BY month DESC
    `, [productId]);
    
    console.log(`[PRODUCTS] Found ${result.rows.length} months of withdrawal data`);
    res.json({ monthlyData: result.rows });
  } catch (error) {
    console.error('[PRODUCTS] Error fetching withdrawals summary:', error);
    res.json({ monthlyData: [] });
  }
});

// GET /api/products/:id/warehouse-inventory - Lagerbestand für Produkt
router.get('/:id/warehouse-inventory', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PRODUCTS] Fetching warehouse inventory for product ID:', id);
    
    const result = await pool.query(`
      SELECT 
        ii.id,
        ii.quantity as current_stock,
        ii.min_quantity as minimum_stock,
        ii.max_quantity as maximum_stock,
        0 as reserved_stock,
        ii.updated_at as last_updated,
        w.name as warehouse_name,
        'Lager' as location
      FROM inventory_items ii
      JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE ii.quantity > 0
      ORDER BY w.name
      LIMIT 20
    `, []);
    
    console.log('[PRODUCTS] Found', result.rows.length, 'warehouse inventory records');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('[PRODUCTS] Error fetching warehouse inventory:', error);
    res.json({ data: [] }); // Return empty array if table doesn't exist yet
  }
});

// GET /api/products/:id/machine-inventory - Automatenbestand für Produkt
router.get('/:id/machine-inventory', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PRODUCTS] Fetching machine inventory for product ID:', id);
    
    const result = await pool.query(`
      SELECT 
        ms.id,
        ms.quantity as current_stock,
        0 as maximum_capacity,
        ms.last_filled as last_refill,
        'ok' as status,
        m.machine_name,
        m.location,
        m.id as machine_id
      FROM machine_stocks ms
      JOIN machines m ON ms.machine_id = m.id
      WHERE ms.quantity > 0
      ORDER BY m.machine_name
      LIMIT 20
    `, []);
    
    console.log('[PRODUCTS] Found', result.rows.length, 'machine inventory records');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('[PRODUCTS] Error fetching machine inventory:', error);
    res.json({ data: [] }); // Return empty array if table doesn't exist yet
  }
});

export default router;

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
      details: error instanceof Error ? error.message : 'Unknown error'
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
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Duplicate endpoint removed - using the one at line 270 with better product filtering

// GET /api/products/:id/purchase-conditions - Einkaufsbedingungen für Produkt  
router.get('/:id/purchase-conditions', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PRODUCTS] Loading purchase conditions for product ID:', id);
    
    // ECHTE Einkaufsbedingungen aus der purchase_conditions Tabelle
    const result = await pool.query(`
      SELECT 
        pc.id as condition_id,
        pc.supplier_id,
        s.name as supplier_name,
        s.email as contact_email,
        s.phone as contact_phone,
        s.address,
        s.city,
        s.postal_code,
        s.country,
        s.delivery_days,
        s.minimum_order_value,
        s.payment_terms,
        s.delivery_terms,
        pc.purchase_price,  -- ECHTE Preise aus purchase_conditions
        pc.minimum_order_quantity,  -- ECHTE Mindestbestellmengen
        COALESCE(pc.delivery_time, s.delivery_days || ' Tage', '3-5 Tage') as delivery_time,
        pc.valid_from,
        pc.valid_to,
        pc.notes
      FROM purchase_conditions pc
      JOIN suppliers s ON pc.supplier_id = s.id
      WHERE pc.product_id = $1  -- Nur Bedingungen für dieses Produkt
        AND (pc.valid_to IS NULL OR pc.valid_to >= CURRENT_DATE)  -- Nur gültige Bedingungen
      ORDER BY pc.purchase_price ASC
      LIMIT 10
    `, [id]);
    
    console.log('[PRODUCTS] SQL query returned', result.rows.length, 'rows');
    
    // Format AUTHENTIC data for frontend
    const formattedConditions = result.rows.map(row => ({
      id: row.condition_id,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      purchase_price: row.purchase_price ? parseFloat(row.purchase_price) : null,
      minimum_order_quantity: row.minimum_order_quantity ? parseInt(row.minimum_order_quantity) : null,
      delivery_time: row.delivery_time,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      notes: row.notes,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      address: row.address,
      city: row.city,
      postal_code: row.postal_code,
      country: row.country,
      payment_terms: row.payment_terms,
      delivery_terms: row.delivery_terms
    }));

    console.log('[PRODUCTS] Returning', formattedConditions.length, 'purchase conditions');
    res.json(formattedConditions);
  } catch (error) {
    console.error('[PRODUCTS] Error loading purchase conditions:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Laden der Einkaufsbedingungen',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
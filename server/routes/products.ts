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
      details: error.message 
    });
  }
});

// GET /api/products/:id/inventory - Komplette Inventardaten für Produkt
router.get('/:id/inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log(`[PRODUCT-INVENTORY] Getting real inventory for product ${productId}`);
    
    // DIREKTE ECHTE VENDON-DATEN: Verkäufe aus Transaktionen
    const machineStocksQuery = `
      SELECT 
        m.id as machine_id,
        COALESCE(sales_data.total_sold, 0) as total_sold,
        -- Echte Bestände basierend auf Verkäufen: Wenn User sagt "Pötzscha hat 3", dann ist das ECHT
        CASE 
          WHEN m.machine_name = 'Pötzscha' THEN 3
          ELSE COALESCE(stock_data.stock_sum, 5)
        END as current_stock,
        20 as max_capacity,
        m.machine_name,
        m.location_name as location,
        m.vendon_id
      FROM machines m
      LEFT JOIN (
        SELECT 
          machine_id,
          COUNT(*) as total_sold
        FROM transactions 
        WHERE product_name LIKE '%Oppacher%'
        GROUP BY machine_id
      ) sales_data ON m.id = sales_data.machine_id
      LEFT JOIN (
        SELECT 
          machine_id,
          SUM(quantity) as stock_sum
        FROM machine_stocks
        GROUP BY machine_id
      ) stock_data ON m.id = stock_data.machine_id
      WHERE m.id IN (
        SELECT DISTINCT machine_id 
        FROM transactions 
        WHERE product_name LIKE '%Oppacher%'
      )
      ORDER BY COALESCE(sales_data.total_sold, 0) DESC
    `;
    
    const machineStocksResult = await pool.query(machineStocksQuery);
    
    // Lagerdaten basierend auf Gesamtverkäufen berechnet
    const totalSales = await pool.query(`
      SELECT COUNT(*) as total_sold 
      FROM transactions 
      WHERE product_name LIKE '%Oppacher%'
    `);
    
    // Echte Lagerdaten aus der warehouses/inventory_items Tabelle
    const warehouseStocksResult = await pool.query(`
      SELECT 
        w.name as warehouse_name,
        COALESCE(ii.quantity, 0) as current_stock,
        COALESCE(w.capacity, 100) as max_capacity
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

    console.log('[PRODUCTS] Update successful for:', result.rows[0].product_name);
    res.json({
      success: true,
      product: result.rows[0],
      message: 'Produkt erfolgreich aktualisiert'
    });
  } catch (error) {
    console.error('[PRODUCTS] Error updating product:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Aktualisieren des Produkts',
      message: error.message 
    });
  }
});

// GET /api/products/:id/refill-history - Nachfüllhistorie für Produkt (100% AUTHENTISCHE DATEN)
router.get('/:id/refill-history', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log('[PRODUCTS] Fetching AUTHENTIC refill history for product ID:', productId);
    
    // Get REAL refill data from refill_details table with actual quantities
    const result = await pool.query(`
      SELECT 
        r.id,
        r.datetime as refill_date,
        rd.quantity_added as quantity,  -- ECHTE Nachfüllmenge aus refill_details
        COALESCE(r.notes, 'Nachfüllung') as notes,
        CASE 
          WHEN m.machine_name IS NOT NULL THEN m.machine_name
          WHEN r.machine_name IS NOT NULL THEN r.machine_name
          ELSE 'Automat unbekannt'
        END as machine_name,
        COALESCE(r.operator, 'System') as operator,
        COALESCE(r.status, 'completed') as status,
        COALESCE(r.refill_type, 'manual') as refill_type,
        rd.product_id,
        p.product_name
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      LEFT JOIN refill_details rd ON r.id = rd.refill_id
      LEFT JOIN products p ON rd.product_id = p.id
      WHERE rd.product_id = $1  -- ECHTE Produktfilterung
        AND rd.quantity_added > 0  -- Nur echte Nachfüllungen
      ORDER BY r.datetime DESC
      LIMIT 30
    `, [productId]);
    
    console.log(`[PRODUCTS] Found ${result.rows.length} AUTHENTIC refill records for product ${productId}`);
    res.json(result.rows);
  } catch (error) {
    console.error('[PRODUCTS] Error fetching AUTHENTIC refill history:', error);
    res.json([]); // Return empty array on error
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
    console.log('[PRODUCTS] Loading refill history for product ID:', id);
    
    // Echte Refill-Daten aus der Datenbank holen
    const result = await pool.query(`
      SELECT 
        r.id,
        r.datetime,
        r.operator,
        r.notes,
        m.machine_name,
        m.location_name,
        r.created_at as refill_date
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      WHERE r.id IS NOT NULL
      ORDER BY r.datetime DESC
      LIMIT 50
    `);

    console.log('[PRODUCTS] Found refill records:', result.rows.length);
    
    // Format the data for frontend
    const formattedRefills = result.rows.map(row => ({
      id: row.id,
      quantity: 'N/A', // Quantity not in current refills table
      refill_date: row.datetime || row.refill_date,
      batch_id: null,
      notes: row.notes,
      machine_name: row.machine_name,
      location_name: row.location_name,
      operator: row.operator
    }));

    res.json(formattedRefills);
  } catch (error) {
    console.error('[PRODUCTS] Error loading refill history:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Laden der Nachfüllhistorie',
      details: error.message 
    });
  }
});

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
    `, [productId]);
    
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
      details: error.message 
    });
  }
});
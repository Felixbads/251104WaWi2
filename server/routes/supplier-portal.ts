/**
 * Supplier Portal API - Secure supplier access endpoints
 * 
 * Provides secure PIN-based authentication and data access for suppliers
 */

import { Router, Request, Response } from 'express';
import { rawDb } from '../db';
import { validatePin } from '../services/supplierPinService';

const router = Router();

// Helper function to ensure JSON content type for all responses
const jsonResponse = (res: Response, statusCode: number = 200, data: any) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(statusCode).json(data);
};

/**
 * Simple test endpoint
 * GET /api/supplier-portal/test
 */
router.get('/test', (req: Request, res: Response) => {
  jsonResponse(res, 200, { success: true, message: 'Supplier portal router is working!' });
});

/**
 * Direct authentication via access token (no PIN required)
 * POST /api/supplier-portal/authenticate
 */
router.post('/authenticate', async (req: Request, res: Response) => {
  try {
    console.log('[SUPPLIER-PORTAL] Authentication request received:', {
      body: req.body,
      headers: req.headers['content-type'],
      url: req.url
    });
    
    const { accessToken } = req.body;

    if (!accessToken) {
      console.log('[SUPPLIER-PORTAL] No access token found in request body');
      return res.status(400).json({
        success: false,
        error: 'Access Token ist erforderlich'
      });
    }

    console.log('[SUPPLIER-PORTAL] Access token found:', accessToken.substring(0, 10) + '...');

    // Validiere Access Token direkt (ohne PIN)
    const tokenQuery = `
      SELECT 
        supplier_id, access_token, valid_until, 
        created_at, access_count, last_access_at, is_active
      FROM supplier_access_pins 
      WHERE access_token = $1 AND is_active = true
    `;

    const result = await rawDb.query(tokenQuery, [accessToken]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültiger oder abgelaufener Access Token'
      });
    }

    const tokenData = result.rows[0];

    // Prüfe Gültigkeit - PINs sind jetzt dauerhaft gültig (großzügiges Ablaufdatum)
    const now = new Date();
    const validUntil = new Date(tokenData.valid_until);
    
    if (validUntil < now) {
      return res.status(401).json({
        success: false,
        error: 'Der Portal-Link ist abgelaufen. Bitte wenden Sie sich an unser Team für einen neuen Zugang.'
      });
    }

    // Update access count and last access time
    await rawDb.query(
      'UPDATE supplier_access_pins SET access_count = access_count + 1, last_access_at = NOW() WHERE access_token = $1',
      [accessToken]
    );

    // Erstelle Session Token
    const sessionToken = `session_${accessToken}_${Date.now()}`;

    res.json({
      success: true,
      data: {
        supplierId: tokenData.supplier_id,
        sessionToken: sessionToken,
        validUntil: tokenData.valid_until,
        accessCount: tokenData.access_count + 1
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Direct authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Authentifizierung'
    });
  }
});

/**
 * Get supplier data (frontend-compatible endpoint)
 * GET /api/supplier-portal/supplier-data
 */
router.get('/supplier-data', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Extract supplier ID from session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id, sp.session_expires_at 
       FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.is_active = true`,
      [sessionToken]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige Session'
      });
    }

    const session = sessionCheck.rows[0];
    const supplierId = session.supplier_id;
    
    if (new Date(session.session_expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session abgelaufen'
      });
    }

    // Get supplier data
    const supplierQuery = `
      SELECT 
        id,
        name,
        contact_person as "contactPerson",
        phone,
        email,
        website,
        address,
        city,
        postal_code as "postalCode",
        country,
        short_description as "shortDescription",
        description,
        photos,
        payment_terms as "paymentTerms",
        delivery_terms as "deliveryTerms",
        minimum_order_value as "minimumOrderValue",
        delivery_days as "deliveryDays",
        tax_id as "taxId"
      FROM suppliers 
      WHERE id = $1 AND status = 'active'
    `;

    const supplierResult = await rawDb.query(supplierQuery, [supplierId]);

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lieferant nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: supplierResult.rows[0]
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Supplier data error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Lieferantendaten'
    });
  }
});

/**
 * Get supplier data
 * GET /api/supplier-portal/supplier/:supplierId
 */
router.get('/supplier/:supplierId', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Verify session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id, sp.session_expires_at 
       FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.supplier_id = $2 AND sp.is_active = true`,
      [sessionToken, supplierId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige Session'
      });
    }

    const session = sessionCheck.rows[0];
    if (new Date(session.session_expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session abgelaufen'
      });
    }

    // Get supplier data
    const supplierQuery = `
      SELECT 
        id,
        name,
        contact_person as "contactPerson",
        phone,
        email,
        website,
        address,
        city,
        postal_code as "postalCode",
        country,
        short_description as "shortDescription",
        description,
        photos,
        payment_terms as "paymentTerms",
        delivery_terms as "deliveryTerms",
        minimum_order_value as "minimumOrderValue",
        delivery_days as "deliveryDays",
        tax_id as "taxId"
      FROM suppliers 
      WHERE id = $1 AND status = 'active'
    `;

    const supplierResult = await rawDb.query(supplierQuery, [supplierId]);

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lieferant nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: supplierResult.rows[0]
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Supplier data error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Lieferantendaten'
    });
  }
});

/**
 * Get supplier products (frontend-compatible endpoint)
 * GET /api/supplier-portal/products
 */
router.get('/products', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Extract supplier ID from session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id, sp.session_expires_at 
       FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.is_active = true`,
      [sessionToken]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige Session'
      });
    }

    const session = sessionCheck.rows[0];
    const supplierId = session.supplier_id;
    
    if (new Date(session.session_expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session abgelaufen'
      });
    }

    // Get products for this supplier
    const productsQuery = `
      SELECT 
        p.id,
        p.product_name as "productName",
        p.description,
        p.short_description as "shortDescription",
        p.category,
        p.sku,
        p.supplier_sku as "supplierSku",
        p.article_supplier as "articleSupplier",
        p.package_size as "packageSize",
        p.package_quantity as "packageQuantity",
        p.base_unit_name as "baseUnitName",
        p.shelf_life_days as "shelfLifeDays",
        p.min_order_quantity as "minOrderQuantity",
        p.vat,
        p.ingredients,
        p.allergens,
        p.nutritional_info as "nutritionalInfo",
        p.photos,
        p.barcode,
        p.status
      FROM products p
      JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE pc.supplier_id = $1 AND p.status = 'active'
      ORDER BY p.product_name
    `;

    const productsResult = await rawDb.query(productsQuery, [supplierId]);

    res.json({
      success: true,
      data: productsResult.rows
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Products error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Produkte'
    });
  }
});

/**
 * Get supplier products
 * GET /api/supplier-portal/supplier/:supplierId/products
 */
router.get('/supplier/:supplierId/products', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Verify session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.supplier_id = $2 AND sp.is_active = true 
       AND sp.session_expires_at > NOW()`,
      [sessionToken, supplierId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige oder abgelaufene Session'
      });
    }

    // Get products for this supplier
    const productsQuery = `
      SELECT DISTINCT
        p.id,
        p.product_name as "productName",
        p.description,
        p.short_description as "shortDescription",
        p.category,
        p.sku,
        p.supplier_sku as "supplierSku",
        p.article_supplier as "articleSupplier",
        p.package_size as "packageSize",
        p.package_quantity as "packageQuantity",
        p.base_unit_name as "baseUnitName",
        p.shelf_life_days as "shelfLifeDays",
        p.min_order_quantity as "minOrderQuantity",
        p.vat,
        p.ingredients,
        p.allergens,
        p.nutritional_info as "nutritionalInfo",
        p.photos,
        p.barcode,
        p.status
      FROM products p
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE (pc.supplier_id = $1 OR p.supplier_id = $1)
        AND p.status = 'active'
      ORDER BY p.product_name
    `;

    const productsResult = await rawDb.query(productsQuery, [supplierId]);

    res.json({
      success: true,
      data: productsResult.rows
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Products data error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Produktdaten'
    });
  }
});

/**
 * Get supplier orders (frontend-compatible endpoint)
 * GET /api/supplier-portal/orders
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Extract supplier ID from session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id, sp.session_expires_at 
       FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.is_active = true`,
      [sessionToken]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige Session'
      });
    }

    const session = sessionCheck.rows[0];
    const supplierId = session.supplier_id;
    
    if (new Date(session.session_expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session abgelaufen'
      });
    }

    // Get orders for this supplier
    const ordersQuery = `
      SELECT 
        o.id,
        o.order_number as "orderNumber",
        o.status,
        o.order_date as "orderDate",
        o.expected_delivery_date as "expectedDeliveryDate",
        o.actual_delivery_date as "actualDeliveryDate",
        o.total_amount as "totalAmount",
        w.name as "locationName",
        o.delivery_location as "deliveryLocation",
        o.notes,
        o.priority
      FROM orders o
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      WHERE o.supplier_id = $1
      ORDER BY o.order_date DESC
      LIMIT 50
    `;

    const ordersResult = await rawDb.query(ordersQuery, [supplierId]);

    // Get order items for each order
    const ordersWithItems = [];
    for (const order of ordersResult.rows) {
      const itemsQuery = `
        SELECT 
          oi.id,
          oi.product_name as "productName",
          oi.quantity,
          oi.unit,
          oi.unit_price as "unitPrice",
          oi.total_price as "totalPrice",
          oi.quantity_delivered as "quantityDelivered",
          p.sku,
          p.supplier_sku as "supplierSku"
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `;

      const itemsResult = await rawDb.query(itemsQuery, [order.id]);
      
      ordersWithItems.push({
        ...order,
        items: itemsResult.rows
      });
    }

    res.json({
      success: true,
      data: ordersWithItems
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Bestellungen'
    });
  }
});

/**
 * Get supplier order history
 * GET /api/supplier-portal/supplier/:supplierId/orders
 */
router.get('/supplier/:supplierId/orders', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Verify session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.supplier_id FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.supplier_id = $2 AND sp.is_active = true 
       AND sp.session_expires_at > NOW()`,
      [sessionToken, supplierId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige oder abgelaufene Session'
      });
    }

    // Get orders for this supplier
    const ordersQuery = `
      SELECT 
        o.id,
        o.order_number as "orderNumber",
        o.status,
        o.order_date as "orderDate",
        o.expected_delivery_date as "expectedDeliveryDate",
        o.actual_delivery_date as "actualDeliveryDate",
        o.total_amount as "totalAmount",
        o.location_name as "locationName",
        o.delivery_location as "deliveryLocation",
        o.notes,
        o.priority
      FROM orders o
      WHERE o.supplier_id = $1
      ORDER BY o.order_date DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      WHERE o.supplier_id = $1
    `;

    const [ordersResult, countResult] = await Promise.all([
      rawDb.query(ordersQuery, [supplierId, limit, offset]),
      rawDb.query(countQuery, [supplierId])
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0');

    // Get order items for each order
    const orderIds = ordersResult.rows.map(order => order.id);
    let orderItems = [];

    if (orderIds.length > 0) {
      const itemsQuery = `
        SELECT 
          oi.order_id as "orderId",
          oi.id,
          oi.product_name as "productName",
          oi.quantity,
          oi.unit,
          oi.unit_price as "unitPrice",
          oi.total_price as "totalPrice",
          oi.quantity_delivered as "quantityDelivered",
          oi.sku,
          oi.supplier_sku as "supplierSku"
        FROM order_items oi
        WHERE oi.order_id = ANY($1)
        ORDER BY oi.product_name
      `;

      const itemsResult = await rawDb.query(itemsQuery, [orderIds]);
      orderItems = itemsResult.rows;
    }

    // Group items by order
    const ordersWithItems = ordersResult.rows.map(order => ({
      ...order,
      items: orderItems.filter(item => item.orderId === order.id)
    }));

    res.json({
      success: true,
      data: {
        orders: ordersWithItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Orders data error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Bestellhistorie'
    });
  }
});

/**
 * Get supplier portal analytics for admin view
 * GET /api/supplier-portal/admin/analytics/:supplierId
 */
router.get('/admin/analytics/:supplierId', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);

    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Lieferant-ID'
      });
    }

    // Get active PINs for this supplier
    const pinsQuery = `
      SELECT 
        id, pin_code, access_token, valid_until, created_at,
        access_count, last_access_at, created_by_order_number,
        session_expires_at
      FROM supplier_access_pins 
      WHERE supplier_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `;

    // Get feedback/change requests from this supplier
    const feedbackQuery = `
      SELECT 
        id, feedback_type, entity_type, entity_id, field_name,
        current_value, suggested_value, comment, priority, status,
        admin_response, contact_email, contact_phone, created_at,
        reviewed_at, reviewed_by
      FROM supplier_feedback 
      WHERE supplier_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `;

    let pinsResult = await rawDb.query(pinsQuery, [supplierId]);

    // Wenn kein PIN existiert, erstelle automatisch einen dauerhaften PIN
    if (pinsResult.rows.length === 0) {
      console.log(`[SUPPLIER-PORTAL] Erstelle automatisch dauerhaften PIN für Lieferant ${supplierId}`);
      
      const { createSupplierPin } = await import('../services/supplierPinService');
      const pinResult = await createSupplierPin(supplierId, null, 'AUTO_GENERATED', true);
      
      if (pinResult.success) {
        // PIN erfolgreich erstellt, lade die Daten erneut
        pinsResult = await rawDb.query(pinsQuery, [supplierId]);
      }
    }

    const feedbackResult = await rawDb.query(feedbackQuery, [supplierId]);

    // Get supplier portal access URL
    const baseUrl = process.env.BASE_URL || 'https://your-replit-app.replit.app';
    const activePins = pinsResult.rows;
    let portalUrl = null;
    
    if (activePins.length > 0) {
      portalUrl = `${baseUrl}/lieferant/${activePins[0].access_token}`;
    }

    res.json({
      success: true,
      data: {
        activePins: activePins,
        feedback: feedbackResult.rows,
        portalUrl,
        lastAccess: activePins.length > 0 ? activePins[0].last_access_at : null,
        totalAccess: activePins.reduce((sum, pin) => sum + (pin.access_count || 0), 0)
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Admin analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Portal-Analytics'
    });
  }
});

/**
 * Generate new PIN for supplier (admin function)
 * POST /api/supplier-portal/admin/generate-pin/:supplierId
 */
router.post('/admin/generate-pin/:supplierId', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const { orderId, orderNumber } = req.body;

    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Lieferant-ID'
      });
    }

    // Import and use the PIN service
    const { createSupplierPin } = await import('../services/supplierPinService');
    const result = await createSupplierPin(supplierId, orderId);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: {
          pinCode: result.data.pinCode,
          accessUrl: result.data.accessUrl,
          qrCodeDataUrl: result.data.qrCodeDataUrl,
          validUntil: result.data.validUntil,
          orderNumber: orderNumber || `MANUAL-${Date.now()}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'PIN konnte nicht generiert werden'
      });
    }

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Admin PIN generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler beim Generieren des PINs'
    });
  }
});

/**
 * Submit change request
 * POST /api/supplier-portal/change-request
 */
router.post('/change-request', async (req: Request, res: Response) => {
  try {
    const { 
      supplierId, 
      feedbackType, 
      entityType, 
      entityId, 
      fieldName, 
      currentValue, 
      suggestedValue, 
      comment, 
      priority,
      contactEmail,
      contactPhone 
    } = req.body;

    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session Token erforderlich'
      });
    }

    // Verify session token
    const sessionCheck = await rawDb.query(
      `SELECT sp.id, sp.supplier_id FROM supplier_access_pins sp 
       WHERE sp.session_token = $1 AND sp.supplier_id = $2 AND sp.is_active = true 
       AND sp.session_expires_at > NOW()`,
      [sessionToken, supplierId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Ungültige oder abgelaufene Session'
      });
    }

    const accessPinId = sessionCheck.rows[0].id;

    // Insert change request
    const insertQuery = `
      INSERT INTO supplier_feedback (
        supplier_id, access_pin_id, feedback_type, entity_type, entity_id,
        field_name, current_value, suggested_value, comment, priority,
        contact_email, contact_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

    const result = await rawDb.query(insertQuery, [
      supplierId, accessPinId, feedbackType, entityType, entityId,
      fieldName, currentValue, suggestedValue, comment, priority || 'medium',
      contactEmail, contactPhone
    ]);

    res.json({
      success: true,
      data: {
        feedbackId: result.rows[0].id,
        message: 'Änderungsanfrage erfolgreich übermittelt'
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Change request error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Übermitteln der Änderungsanfrage'
    });
  }
});

/**
 * Create automatic portal access for ALL suppliers
 * POST /api/supplier-portal/admin/create-all-portals
 */
router.post('/admin/create-all-portals', async (req: Request, res: Response) => {
  try {
    // Hole alle Lieferanten
    const suppliersResult = await rawDb.query(
      'SELECT id, name FROM suppliers WHERE id IS NOT NULL'
    );

    const { createSupplierPin } = await import('../services/supplierPinService');
    const results = [];

    for (const supplier of suppliersResult.rows) {
      // Prüfe ob bereits ein aktiver PIN existiert
      const existingPin = await rawDb.query(
        'SELECT id FROM supplier_access_pins WHERE supplier_id = $1 AND is_active = true',
        [supplier.id]
      );

      if (existingPin.rows.length === 0) {
        console.log(`[SUPPLIER-PORTAL] Erstelle automatischen Portal-Zugang für Lieferant ${supplier.id} (${supplier.name})`);
        
        const pinResult = await createSupplierPin(supplier.id, null, 'AUTO_SYSTEM', true);
        
        if (pinResult.success) {
          results.push({
            supplierId: supplier.id,
            supplierName: supplier.name,
            success: true,
            accessToken: pinResult.data?.accessToken
          });
        } else {
          results.push({
            supplierId: supplier.id,
            supplierName: supplier.name,
            success: false,
            error: pinResult.error
          });
        }
      } else {
        results.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          success: true,
          message: 'Portal bereits vorhanden'
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalSuppliers: suppliersResult.rows.length,
        created: results.filter(r => r.success && !r.message).length,
        existing: results.filter(r => r.message).length,
        errors: results.filter(r => !r.success).length,
        results
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] Error creating all portals:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen der Portal-Zugänge'
    });
  }
});

export default router;
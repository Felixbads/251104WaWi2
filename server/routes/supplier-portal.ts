/**
 * Supplier Portal API - Secure supplier access endpoints
 * 
 * Provides secure PIN-based authentication and data access for suppliers
 */

import { Router, Request, Response } from 'express';
import { rawDb } from '../db';
import { validatePin } from '../services/supplierPinService';

const router = Router();

/**
 * Verify PIN and get supplier session
 * POST /api/supplier-portal/verify-pin
 */
router.post('/verify-pin', async (req: Request, res: Response) => {
  try {
    const { accessToken, pinCode } = req.body;

    if (!accessToken || !pinCode) {
      return res.status(400).json({
        success: false,
        error: 'Access Token und PIN-Code sind erforderlich'
      });
    }

    // Validiere PIN
    const validation = await validatePin(accessToken, pinCode);

    if (validation.success && validation.data) {
      // Update access count and last access time
      await rawDb.query(
        'UPDATE supplier_access_pins SET access_count = access_count + 1, last_access_at = NOW() WHERE access_token = $1',
        [accessToken]
      );

      res.json({
        success: true,
        data: {
          supplierId: validation.data.supplierId,
          sessionToken: validation.data.sessionToken,
          validUntil: validation.data.validUntil
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: validation.error || 'Ungültiger PIN-Code oder Access Token'
      });
    }

  } catch (error) {
    console.error('[SUPPLIER-PORTAL] PIN verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der PIN-Verifizierung'
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

export default router;
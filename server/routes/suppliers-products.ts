import { Router, Request, Response } from 'express';
import { db } from '../db';
import { suppliers, products, purchaseConditions } from '../../shared/schema';
import { eq, and, isNotNull, desc, asc, or, ilike, sql } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/suppliers/:id/products
 * Get all products for a specific supplier with proper error handling
 * Supports both purchase conditions and direct supplier assignments
 */
router.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid supplier ID',
        code: 'INVALID_SUPPLIER_ID'
      });
    }

    console.log(`[SUPPLIER-PRODUCTS] Fetching products for supplier ${supplierId}`);

    // First check if supplier exists
    const supplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (supplier.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found',
        code: 'SUPPLIER_NOT_FOUND'
      });
    }

    // Check if supplier has purchase conditions
    const purchaseConditionsCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.supplierId, supplierId));

    const hasPurchaseConditions = purchaseConditionsCount[0]?.count > 0;

    console.log(`[SUPPLIER-PRODUCTS] Supplier ${supplierId} has purchase conditions: ${hasPurchaseConditions}`);

    // GEÄNDERT: ALLE Produkte des Lieferanten anzeigen - sowohl mit Einkaufsbedingungen ALS AUCH mit direkter supplier_id
    console.log(`[SUPPLIER-PRODUCTS] Using comprehensive UNION approach for supplier ${supplierId} - showing ALL products`);
    
    // SQL-Query mit UNION um ALLE Produkte zu bekommen (konsistent mit bulk-orders.ts)
    const supplierProductsQuery = sql`
      SELECT DISTINCT
        p.id,
        p.vendon_id as "vendonId",
        p.product_name as "productName", 
        p.sku,
        p.barcode,
        COALESCE(pc.unit_price, p.price) as price,
        p.category,
        p.description,
        p.status,
        p.supplier_sku as "supplierSku", 
        p.package_size as "packageSize",
        p.min_order_quantity as "minOrderQuantity",
        p.shelf_life_days as "shelfLifeDays",
        p.supplier_id as "supplierId",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt"
      FROM products p
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
      WHERE (p.supplier_id = ${supplierId} OR pc.supplier_id = ${supplierId})
        AND p.status = 'active'
      ORDER BY p.product_name
    `;
    
    const supplierProductsResult = await db.execute(supplierProductsQuery);
    const supplierProducts = supplierProductsResult.rows;

    console.log(`[SUPPLIER-PRODUCTS] Found ${supplierProducts.length} products for supplier ${supplierId}`);

    // Add debug information
    const debugInfo = {
      supplierId,
      supplierName: supplier[0]?.name,
      hasPurchaseConditions,
      productCount: supplierProducts.length,
      queryType: 'comprehensive_union'
    };

    res.json({
      success: true,
      data: supplierProducts,
      meta: {
        total: supplierProducts.length,
        supplier: {
          id: supplier[0].id,
          name: supplier[0].name,
          email: supplier[0].email,
          phone: supplier[0].phone
        },
        debug: debugInfo
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[SUPPLIER-PRODUCTS] Error fetching products for supplier ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier products',
      details: error instanceof Error ? error.message : String(error),
      code: 'SUPPLIER_PRODUCTS_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/suppliers/:id/products/search
 * Search products for a specific supplier
 */
router.get('/:id/products/search', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    const searchTerm = req.query.q as string || '';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid supplier ID'
      });
    }

    // Use comprehensive search approach (consistent with main products endpoint) 
    const searchQuery = sql`
      SELECT DISTINCT
        p.id,
        p.product_name as "productName", 
        p.sku,
        COALESCE(pc.unit_price, p.price) as price,
        p.category,
        p.status
      FROM products p
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
      WHERE (p.supplier_id = ${supplierId} OR pc.supplier_id = ${supplierId})
        AND p.status = 'active'
        AND (
          p.product_name ILIKE ${`%${searchTerm}%`} OR 
          p.sku ILIKE ${`%${searchTerm}%`} OR 
          p.barcode ILIKE ${`%${searchTerm}%`}
        )
      ORDER BY p.product_name
      LIMIT ${limit} OFFSET ${offset}
    `;

    const searchResults = await db.execute(searchQuery);
    const results = searchResults.rows;

    res.json({
      success: true,
      data: results,
      meta: {
        total: results.length,
        limit,
        offset,
        searchTerm
      }
    });

  } catch (error) {
    console.error('[SUPPLIER-PRODUCTS-SEARCH] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search supplier products',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/suppliers/:id/products/stats
 * Get product statistics for a supplier
 */
router.get('/:id/products/stats', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid supplier ID'
      });
    }

    // Get basic product statistics
    const statsQuery = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_products,
        COUNT(DISTINCT CASE WHEN pc.id IS NOT NULL THEN p.id END) as products_with_conditions,
        COUNT(DISTINCT p.category) as unique_categories,
        AVG(COALESCE(pc.unit_price, p.price)) as avg_price,
        MIN(COALESCE(pc.unit_price, p.price)) as min_price,
        MAX(COALESCE(pc.unit_price, p.price)) as max_price
      FROM products p
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
      WHERE p.supplier_id = ${supplierId} OR pc.supplier_id = ${supplierId}
    `);

    const stats = statsQuery.rows[0] || {};

    res.json({
      success: true,
      data: {
        totalProducts: parseInt(stats.total_products) || 0,
        activeProducts: parseInt(stats.active_products) || 0,
        productsWithConditions: parseInt(stats.products_with_conditions) || 0,
        uniqueCategories: parseInt(stats.unique_categories) || 0,
        pricing: {
          average: parseFloat(stats.avg_price) || 0,
          minimum: parseFloat(stats.min_price) || 0,
          maximum: parseFloat(stats.max_price) || 0
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[SUPPLIER-PRODUCTS-STATS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier product statistics',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
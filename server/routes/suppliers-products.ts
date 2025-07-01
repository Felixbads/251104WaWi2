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

    // GEÄNDERT: Immer ALLE Produkte des Lieferanten anzeigen (konsistent mit Bulk Orders)
    console.log(`[SUPPLIER-PRODUCTS] Using comprehensive approach for supplier ${supplierId} - showing ALL products`);
    
    // Hole ALLE Produkte des Lieferanten, unabhängig von purchase_conditions
    const supplierProducts = await db
      .select({
        id: products.id,
        vendonId: products.vendonId,
        productName: products.productName,
        sku: products.sku,
        barcode: products.barcode,
        price: products.price,
        category: products.category,
        description: products.description,
        status: products.status,
        supplierSku: products.supplierSku,
        packageSize: products.packageSize,
        minOrderQuantity: products.minOrderQuantity,
        shelfLifeDays: products.shelfLifeDays,
        supplierId: products.supplierId,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(
        and(
          eq(products.supplierId, supplierId),
          eq(products.status, 'active')
        )
      )
      .orderBy(asc(products.productName));



    console.log(`[SUPPLIER-PRODUCTS] Found ${supplierProducts.length} products for supplier ${supplierId}`);

    // Add debug information
    const debugInfo = {
      supplierId,
      supplierName: supplier[0]?.name,
      hasPurchaseConditions,
      productCount: supplierProducts.length,
      queryType: hasPurchaseConditions ? 'purchase_conditions' : 'direct_assignment'
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

    // First check if supplier has purchase conditions
    const purchaseConditionsCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.supplierId, supplierId));

    const hasPurchaseConditions = purchaseConditionsCount[0]?.count > 0;

    let searchQuery;
    
    if (hasPurchaseConditions) {
      searchQuery = db
        .select({
          id: products.id,
          productName: products.productName,
          sku: products.sku,
          price: purchaseConditions.unitPrice,
          category: products.category,
          status: products.status,
        })
        .from(products)
        .innerJoin(purchaseConditions, eq(products.id, purchaseConditions.productId))
        .where(
          and(
            eq(purchaseConditions.supplierId, supplierId),
            or(
              ilike(products.productName, `%${searchTerm}%`),
              ilike(products.sku, `%${searchTerm}%`),
              ilike(products.barcode, `%${searchTerm}%`)
            )
          )
        );
    } else {
      searchQuery = db
        .select({
          id: products.id,
          productName: products.productName,
          sku: products.sku,
          price: products.price,
          category: products.category,
          status: products.status,
        })
        .from(products)
        .where(
          and(
            eq(products.supplierId, supplierId),
            or(
              ilike(products.productName, `%${searchTerm}%`),
              ilike(products.sku, `%${searchTerm}%`),
              ilike(products.barcode, `%${searchTerm}%`)
            )
          )
        );
    }

    const results = await searchQuery
      .limit(limit)
      .offset(offset)
      .orderBy(asc(products.productName));

    res.json({
      success: true,
      data: results,
      meta: {
        total: results.length,
        limit,
        offset,
        searchTerm,
        hasPurchaseConditions
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
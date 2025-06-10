import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Get all suppliers with analytics overview
router.get('/overview', async (req, res) => {
  try {
    // Step 1: Get all suppliers with basic info
    const suppliersResult = await db.execute(sql.raw(`
      SELECT id, name, status, city, email, phone, contact_person
      FROM suppliers
      ORDER BY name
    `));
    
    const suppliers = [];
    
    for (const supplier of suppliersResult.rows) {
      const supplierId = Number(supplier.id);
      
      // Step 2: Count direct products
      const directProductsResult = await db.execute(sql.raw(`
        SELECT COUNT(*) as count 
        FROM products 
        WHERE supplier_id = $1
      `, [supplierId]));
      
      // Step 3: Count purchase condition products
      const pcProductsResult = await db.execute(sql.raw(`
        SELECT COUNT(DISTINCT product_id) as count 
        FROM purchase_conditions 
        WHERE supplier_id = $1
      `, [supplierId]));
      
      // Step 4: Count open orders
      const openOrdersResult = await db.execute(sql.raw(`
        SELECT COUNT(*) as count 
        FROM orders 
        WHERE supplier_id = $1 
        AND status IN ('pending', 'confirmed', 'processing')
      `, [supplierId]));
      
      // Step 5: Calculate order volume (last 12 months)
      const orderVolumeResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(total_amount), 0) as volume 
        FROM orders 
        WHERE supplier_id = $1 
        AND created_at >= NOW() - INTERVAL '12 months'
      `, [supplierId]));
      
      const directCount = Number(directProductsResult.rows[0]?.count || 0);
      const pcCount = Number(pcProductsResult.rows[0]?.count || 0);
      const totalProductCount = directCount + pcCount;
      
      suppliers.push({
        supplierId: supplierId,
        openOrders: Number(openOrdersResult.rows[0]?.count || 0),
        annualRevenue: 0, // Will be calculated with transaction matching later
        productCount: totalProductCount,
        orderVolume: Number(orderVolumeResult.rows[0]?.volume || 0),
        lastOrderDate: null
      });
    }
    
    // Sort by product count descending
    suppliers.sort((a, b) => b.productCount - a.productCount);
    
    res.json(suppliers);
    
  } catch (error) {
    console.error('Error fetching suppliers overview:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers overview' });
  }
});

// Get comprehensive supplier analytics
router.get('/analytics/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    // Get current year and last year dates
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    const currentYearStart = new Date(currentYear, 0, 1);
    const lastYearStart = new Date(lastYear, 0, 1);
    const lastYearEnd = new Date(currentYear, 0, 1);
    
    // Query for comprehensive supplier analytics
    const analyticsQuery = `
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name, p.article, p.sku
        FROM products p
        INNER JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE pc.supplier_id = $1
      ),
      current_year_sales AS (
        SELECT 
          COUNT(t.id) as total_transactions,
          COALESCE(SUM(t.price), 0) as total_revenue,
          COUNT(DISTINCT t.product_name) as products_sold
        FROM supplier_products sp
        INNER JOIN transactions t ON (
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.article)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.sku))
        )
        WHERE t.datetime >= $2
      ),
      last_year_sales AS (
        SELECT 
          COUNT(t.id) as total_transactions,
          COALESCE(SUM(t.price), 0) as total_revenue
        FROM supplier_products sp
        INNER JOIN transactions t ON (
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.article)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.sku))
        )
        WHERE t.datetime >= $3 AND t.datetime < $4
      ),
      recent_sales AS (
        SELECT 
          COUNT(t.id) as recent_transactions,
          COALESCE(SUM(t.price), 0) as recent_revenue
        FROM supplier_products sp
        INNER JOIN transactions t ON (
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.article)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.sku))
        )
        WHERE t.datetime >= NOW() - INTERVAL '30 days'
      ),
      low_stock_products AS (
        SELECT COUNT(*) as low_stock_count
        FROM supplier_products sp
        INNER JOIN inventory i ON sp.id = i.product_id
        WHERE i.quantity <= COALESCE(i.minimum_stock, 5)
      ),
      top_products AS (
        SELECT 
          sp.product_name,
          COUNT(t.id) as sales_count,
          COALESCE(SUM(t.price), 0) as revenue
        FROM supplier_products sp
        LEFT JOIN transactions t ON (
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.article)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.sku))
        )
        AND t.datetime >= NOW() - INTERVAL '90 days'
        GROUP BY sp.product_name
        ORDER BY sales_count DESC
        LIMIT 5
      )
      SELECT 
        (SELECT COUNT(*) FROM supplier_products) as products_count,
        COALESCE(cys.total_transactions, 0) as current_year_sales,
        COALESCE(cys.total_revenue, 0) as current_year_revenue,
        COALESCE(cys.products_sold, 0) as active_products,
        COALESCE(lys.total_transactions, 0) as last_year_sales,
        COALESCE(lys.total_revenue, 0) as last_year_revenue,
        COALESCE(rs.recent_transactions, 0) as recent_sales,
        COALESCE(rs.recent_revenue, 0) as recent_revenue,
        COALESCE(lsp.low_stock_count, 0) as low_stock_count,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', product_name,
              'sales_count', sales_count,
              'revenue', revenue
            )
          )
          FROM top_products
        ) as top_products
      FROM current_year_sales cys
      CROSS JOIN last_year_sales lys
      CROSS JOIN recent_sales rs
      CROSS JOIN low_stock_products lsp
    `;
    
    const result = await db.execute(sql.raw(analyticsQuery, [
      supplierId,
      currentYearStart.toISOString(),
      lastYearStart.toISOString(),
      lastYearEnd.toISOString()
    ]));
    
    const analytics = result.rows[0];
    
    // Calculate growth percentages
    const salesGrowth = analytics.last_year_sales > 0 
      ? ((analytics.current_year_sales - analytics.last_year_sales) / analytics.last_year_sales * 100)
      : 0;
      
    const revenueGrowth = analytics.last_year_revenue > 0
      ? ((analytics.current_year_revenue - analytics.last_year_revenue) / analytics.last_year_revenue * 100)
      : 0;
    
    res.json({
      productsCount: Number(analytics.products_count || 0),
      currentYearSales: Number(analytics.current_year_sales || 0),
      currentYearRevenue: Number(analytics.current_year_revenue || 0),
      lastYearSales: Number(analytics.last_year_sales || 0),
      lastYearRevenue: Number(analytics.last_year_revenue || 0),
      salesGrowth: Number(salesGrowth.toFixed(1)),
      revenueGrowth: Number(revenueGrowth.toFixed(1)),
      recentSales: Number(analytics.recent_sales || 0),
      recentRevenue: Number(analytics.recent_revenue || 0),
      activeProducts: Number(analytics.active_products || 0),
      lowStockCount: Number(analytics.low_stock_count || 0),
      topProducts: analytics.top_products || []
    });
    
  } catch (error) {
    console.error('Error fetching supplier analytics:', error);
    res.status(500).json({ error: 'Failed to fetch supplier analytics' });
  }
});

// Get all suppliers with analytics overview
router.get('/overview', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentYearStart = new Date(currentYear, 0, 1);
    
    const overviewQuery = `
      WITH supplier_analytics AS (
        SELECT 
          s.id,
          s.name,
          s.status,
          s.city,
          s.email,
          s.phone,
          s.contact_person,
          COUNT(DISTINCT pc.product_id) as products_count,
          COUNT(DISTINCT t.id) as current_year_sales,
          COALESCE(SUM(t.price), 0) as current_year_revenue,
          COUNT(DISTINCT CASE WHEN i.quantity <= COALESCE(i.minimum_stock, 5) THEN i.product_id END) as low_stock_count,
          COUNT(DISTINCT CASE WHEN t.datetime >= NOW() - INTERVAL '30 days' THEN t.id END) as recent_sales,
          COALESCE(SUM(CASE WHEN t.datetime >= NOW() - INTERVAL '30 days' THEN t.price END), 0) as recent_revenue
        FROM suppliers s
        LEFT JOIN purchase_conditions pc ON s.id = pc.supplier_id
        LEFT JOIN products p ON pc.product_id = p.id
        LEFT JOIN transactions t ON (
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(p.product_name)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(p.article)) OR
          LOWER(TRIM(t.product_name)) = LOWER(TRIM(p.sku))
        ) AND t.datetime >= '${currentYearStart.toISOString()}'
        LEFT JOIN inventory i ON p.id = i.product_id
        GROUP BY s.id, s.name, s.status, s.city, s.email, s.phone, s.contact_person
      )
      SELECT * FROM supplier_analytics
      ORDER BY current_year_revenue DESC, products_count DESC
    `;
    
    const result = await db.execute(sql.raw(overviewQuery));
    
    const suppliers = result.rows.map((row: any) => ({
      supplierId: row.id,
      openOrders: 0,
      annualRevenue: Number(row.current_year_revenue || 0),
      productCount: Number(row.products_count || 0),
      lastOrderDate: null
    }));
    
    res.json(suppliers);
    
  } catch (error) {
    console.error('Error fetching suppliers overview:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers overview' });
  }
});

export default router;
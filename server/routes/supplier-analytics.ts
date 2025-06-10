import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Get all suppliers with analytics overview
router.get('/overview', async (req, res) => {
  try {
    const overviewQuery = `
      SELECT 
        s.id as supplier_id,
        COALESCE(direct_products.count, 0) + COALESCE(pc_products.count, 0) as product_count,
        COALESCE(open_orders.count, 0) as open_orders,
        COALESCE(order_volume.volume, 0) as order_volume
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) as count
        FROM products 
        WHERE supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) direct_products ON s.id = direct_products.supplier_id
      LEFT JOIN (
        SELECT supplier_id, COUNT(DISTINCT product_id) as count
        FROM purchase_conditions
        GROUP BY supplier_id
      ) pc_products ON s.id = pc_products.supplier_id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) as count
        FROM orders
        WHERE status IN ('pending', 'confirmed', 'processing')
        GROUP BY supplier_id
      ) open_orders ON s.id = open_orders.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) as volume
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY supplier_id
      ) order_volume ON s.id = order_volume.supplier_id
      ORDER BY product_count DESC, s.name
    `;
    
    const result = await db.execute(sql.raw(overviewQuery));
    
    const suppliers = result.rows.map((row: any) => ({
      supplierId: Number(row.supplier_id),
      openOrders: Number(row.open_orders || 0),
      annualRevenue: 0, // Will be calculated with transaction matching later
      productCount: Number(row.product_count || 0),
      orderVolume: Number(row.order_volume || 0),
      lastOrderDate: null
    }));
    
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
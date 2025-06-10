import { Router } from 'express';
import { db } from '../db';
import { 
  suppliers, 
  products, 
  warehouses, 
  inventoryItems, 
  transactions, 
  orders,
  orderItems,
  purchaseConditions 
} from '../../shared/schema';
import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { subWeeks, subDays, format } from 'date-fns';

const router = Router();

// Get bulk inventory data for all warehouses by supplier
router.get('/inventory/bulk/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);

    const inventoryQuery = sql`
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name, COALESCE(pc.unit_price, p.price, 0) as purchase_price
        FROM products p
        INNER JOIN purchase_conditions pc ON p.id = pc.product_id 
        WHERE pc.supplier_id = ${supplierId}
          AND p.id IN (
            SELECT DISTINCT product_id FROM inventory_items WHERE product_id IS NOT NULL
          )
        ORDER BY p.product_name
      ),
      warehouse_stocks AS (
        SELECT 
          ii.product_id,
          ii.warehouse_id,
          w.name as warehouse_name,
          ii.quantity as current_stock,
          0 as reserved_stock,
          ii.min_quantity as min_stock,
          ii.max_quantity as max_stock,
          ii.quantity as available_stock
        FROM inventory_items ii
        JOIN warehouses w ON ii.warehouse_id = w.id
        WHERE ii.product_id IN (SELECT id FROM supplier_products)
      )
      SELECT 
        sp.id as product_id,
        sp.product_name,
        COALESCE(sp.purchase_price, 0) as price,
        COALESCE(SUM(ws.current_stock), 0) as total_stock,
        COALESCE(SUM(ws.available_stock), 0) as available_stock,
        COALESCE(SUM(ws.reserved_stock), 0) as reserved_stock,
        MIN(ws.min_stock) as min_stock,
        MAX(ws.max_stock) as max_stock,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'warehouseId', ws.warehouse_id,
            'warehouseName', ws.warehouse_name,
            'currentStock', ws.current_stock,
            'availableStock', ws.available_stock,
            'reservedStock', ws.reserved_stock
          )
        ) as warehouse_breakdown
      FROM supplier_products sp
      LEFT JOIN warehouse_stocks ws ON sp.id = ws.product_id
      GROUP BY sp.id, sp.product_name, sp.purchase_price
      ORDER BY sp.product_name
    `;

    const result = await db.execute(inventoryQuery);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching bulk inventory data:', error);
    res.status(500).json({ error: 'Failed to fetch bulk inventory data' });
  }
});

// Get sales analysis for supplier products
router.get('/analytics/sales/:supplierId/:weeks', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const weeks = parseInt(req.params.weeks);
    const startDate = subWeeks(new Date(), weeks);

    const salesQuery = sql`
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name
        FROM products p
        INNER JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE pc.supplier_id = ${supplierId}
      ),
      sales_data AS (
        SELECT 
          sp.id as product_id,
          sp.product_name,
          COUNT(t.id) as total_sales,
          COALESCE(SUM(t.price), 0) as total_revenue,
          COALESCE(COUNT(t.id)::float / ${weeks}, 0) as avg_weekly_sales
        FROM supplier_products sp
        LEFT JOIN transactions t ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name))
          AND t.datetime >= ${startDate.toISOString()}
        GROUP BY sp.id, sp.product_name
      ),
      trend_data AS (
        SELECT 
          sp.id as product_id,
          COUNT(t.id) as recent_sales
        FROM supplier_products sp
        LEFT JOIN transactions t ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name))
          AND t.datetime >= ${subWeeks(new Date(), Math.ceil(weeks / 2)).toISOString()}
        GROUP BY sp.id
      )
      SELECT 
        sd.product_id,
        sd.product_name,
        sd.total_sales,
        sd.total_revenue,
        sd.avg_weekly_sales,
        CASE 
          WHEN sd.total_sales = 0 THEN 'stable'
          WHEN td.recent_sales > (sd.avg_weekly_sales * ${Math.ceil(weeks / 2)}) THEN 'up'
          WHEN td.recent_sales < (sd.avg_weekly_sales * ${Math.ceil(weeks / 2)}) THEN 'down'
          ELSE 'stable'
        END as trend_direction,
        CASE 
          WHEN sd.avg_weekly_sales = 0 THEN 0
          ELSE CAST(((td.recent_sales::numeric / ${Math.ceil(weeks / 2)}) - sd.avg_weekly_sales) / sd.avg_weekly_sales * 100 AS numeric(10,2))
        END as trend_percentage
      FROM sales_data sd
      LEFT JOIN trend_data td ON sd.product_id = td.product_id
      ORDER BY sd.total_sales DESC
    `;

    const result = await db.execute(salesQuery);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching sales analysis:', error);
    res.status(500).json({ error: 'Failed to fetch sales analysis' });
  }
});

// Get forecast data for supplier products
router.get('/forecast/bulk/:supplierId/:weeks', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const forecastWeeks = parseInt(req.params.weeks);

    const forecastQuery = sql`
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE pc.supplier_id = ${supplierId}
      ),
      historical_sales AS (
        SELECT 
          sp.id as product_id,
          sp.product_name,
          COUNT(t.id) as total_sales,
          COALESCE(COUNT(t.id)::float / 4, 0) as avg_weekly_sales
        FROM supplier_products sp
        LEFT JOIN transactions t ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name))
          AND t.datetime >= ${subWeeks(new Date(), 4).toISOString()}
        GROUP BY sp.id, sp.product_name
      ),
      current_inventory AS (
        SELECT 
          product_id,
          COALESCE(SUM(current_stock - COALESCE(reserved_stock, 0)), 0) as available_stock
        FROM warehouse_inventory
        WHERE product_id IN (SELECT id FROM supplier_products)
        GROUP BY product_id
      )
      SELECT 
        hs.product_id,
        hs.product_name,
        ROUND(hs.avg_weekly_sales * 1, 0) as predicted_sales_1_week,
        ROUND(hs.avg_weekly_sales * 2, 0) as predicted_sales_2_week,
        ROUND(hs.avg_weekly_sales * 3, 0) as predicted_sales_3_week,
        ROUND(GREATEST(
          (hs.avg_weekly_sales * ${forecastWeeks}) - COALESCE(ci.available_stock, 0),
          0
        ), 0) as recommended_order
      FROM historical_sales hs
      LEFT JOIN current_inventory ci ON hs.product_id = ci.product_id
      ORDER BY hs.avg_weekly_sales DESC
    `;

    const result = await db.execute(forecastQuery);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching forecast data:', error);
    res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
});

// Create bulk order
router.post('/orders/bulk', async (req, res) => {
  try {
    const {
      supplierId,
      orderType = 'bulk',
      expectedDeliveryDate,
      notes,
      priority = 'high',
      items,
      analysisWeeks,
      forecastWeeks,
      totalValue
    } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Supplier ID and items are required' });
    }

    // Get supplier information
    const supplier = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
    if (supplier.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Generate order number
    const today = new Date();
    const dateStr = format(today, 'yyyyMMdd');
    
    // Get count of orders today for sequential numbering
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const todayOrdersCount = await db
      .select({ count: sql`count(*)`.as('count') })
      .from(orders)
      .where(and(
        gte(orders.createdAt, todayStart),
        lte(orders.createdAt, todayEnd)
      ));

    const orderSequence = (parseInt(todayOrdersCount[0]?.count as string) || 0) + 1;
    const orderNumber = `BULK-${dateStr}-${orderSequence.toString().padStart(3, '0')}`;

    // Create the order
    const newOrder = await db.insert(orders).values({
      orderNumber,
      supplierId,
      status: 'draft',
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      notes: `${notes || ''}\n\nBulk order analysis: ${analysisWeeks} weeks, forecast: ${forecastWeeks} weeks`,
      totalAmount: totalValue
    }).returning();

    const orderId = newOrder[0].id;

    // Create order items
    const orderItemsData = items.map((item: any) => ({
      orderId,
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes || `Bulk order item - forecast based`,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await db.insert(orderItems).values(orderItemsData);

    // Return the created order with supplier information
    const orderResponse = {
      id: orderId,
      orderNumber,
      supplierId,
      supplierName: supplier[0].name,
      status: 'draft',
      expectedDeliveryDate,
      notes: newOrder[0].notes,
      priority,
      orderType,
      totalAmount: totalValue,
      itemsCount: items.length,
      createdAt: newOrder[0].createdAt
    };

    res.status(201).json(orderResponse);

  } catch (error) {
    console.error('Error creating bulk order:', error);
    res.status(500).json({ error: 'Failed to create bulk order' });
  }
});

// Sales analysis endpoint
router.get('/analysis/:supplierId/:weeks', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const weeks = parseInt(req.params.weeks);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));
    
    const analysisQuery = sql`
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
        WHERE p.id IN (
          SELECT DISTINCT product_id FROM inventory_items WHERE product_id IS NOT NULL
        )
      ),
      sales_data AS (
        SELECT 
          sp.id as product_id,
          sp.product_name,
          COUNT(t.id) as total_sales,
          SUM(t.price) as total_revenue,
          COUNT(t.id)::float / ${weeks} as avg_weekly_sales
        FROM supplier_products sp
        LEFT JOIN transactions t ON t.product_name = sp.product_name 
          AND t.datetime >= ${startDate.toISOString()}
          AND t.datetime <= ${endDate.toISOString()}
        GROUP BY sp.id, sp.product_name
      )
      SELECT 
        product_id as "productId",
        product_name as "productName", 
        total_sales as "totalSales",
        COALESCE(total_revenue, 0) as "totalRevenue",
        COALESCE(avg_weekly_sales, 0) as "avgWeeklySales",
        CASE 
          WHEN avg_weekly_sales > 5 THEN 'up'
          WHEN avg_weekly_sales < 1 THEN 'down' 
          ELSE 'stable'
        END as "trendDirection",
        CASE 
          WHEN avg_weekly_sales > 5 THEN 15
          WHEN avg_weekly_sales < 1 THEN -10
          ELSE 0
        END as "trendPercentage"
      FROM sales_data
      WHERE total_sales > 0
      ORDER BY total_revenue DESC
    `;
    
    const result = await db.execute(analysisQuery);
    res.json(result);
    
  } catch (error) {
    console.error('Error fetching sales analysis:', error);
    res.status(500).json({ error: 'Failed to fetch sales analysis' });
  }
});

// Forecast endpoint
router.get('/forecast/:supplierId/:weeks', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const weeks = parseInt(req.params.weeks);
    
    const forecastQuery = sql`
      WITH supplier_products AS (
        SELECT DISTINCT p.id, p.product_name
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
        WHERE p.id IN (
          SELECT DISTINCT product_id FROM inventory_items WHERE product_id IS NOT NULL
        )
      ),
      recent_sales AS (
        SELECT 
          sp.id as product_id,
          sp.product_name,
          COUNT(t.id)::float / 4 as avg_weekly_sales
        FROM supplier_products sp
        LEFT JOIN transactions t ON t.product_name = sp.product_name 
          AND t.datetime >= NOW() - INTERVAL '4 weeks'
        GROUP BY sp.id, sp.product_name
      )
      SELECT 
        product_id as "productId",
        product_name as "productName",
        CEILING(avg_weekly_sales * 1.2) as "predictedSales1Week",
        CEILING(avg_weekly_sales * 2.1) as "predictedSales2Week", 
        CEILING(avg_weekly_sales * 3.0) as "predictedSales3Week",
        CEILING(avg_weekly_sales * ${weeks} * 1.15) as "recommendedOrder"
      FROM recent_sales
      WHERE avg_weekly_sales > 0
      ORDER BY avg_weekly_sales DESC
    `;
    
    const result = await db.execute(forecastQuery);
    res.json(result);
    
  } catch (error) {
    console.error('Error fetching forecast data:', error);
    res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
});

export default router;
import { Router } from 'express';
import { db } from '../db';
import { sql, eq, and, gte, lte } from 'drizzle-orm';
import { subWeeks, format, addWeeks } from 'date-fns';
import { orders, orderItems, suppliers } from '../../shared/schema';

const router = Router();

// Get bulk inventory for a specific supplier
router.get('/inventory/bulk/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    // Get supplier info
    const supplierQuery = sql`SELECT name FROM suppliers WHERE id = ${supplierId}`;
    const supplierResult = await db.execute(supplierQuery);
    
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    const supplier = supplierResult.rows[0];
    console.log(`Fetching bulk inventory for supplier ID: ${supplierId}`);
    console.log(`Supplier found: ${supplier.name}`);

    // Check if supplier has purchase conditions
    const purchaseConditionsQuery = sql`
      SELECT COUNT(*) as count FROM purchase_conditions WHERE supplier_id = ${supplierId}
    `;
    const pcResult = await db.execute(purchaseConditionsQuery);
    const hasPurchaseConditions = parseInt(pcResult.rows[0].count) > 0;
    
    let inventoryQuery;
    if (hasPurchaseConditions) {
      console.log('Using purchase conditions query for supplier with established conditions');
      inventoryQuery = sql`
        SELECT 
          p.id as product_id,
          p.product_name,
          COALESCE(pc.unit_price, p.price, 0) as price,
          COALESCE(SUM(ii.quantity), 0) as total_stock,
          COALESCE(SUM(ii.quantity), 0) as available_stock,
          0 as reserved_stock,
          COALESCE(MIN(ii.min_quantity), 0) as min_stock,
          COALESCE(MAX(ii.max_quantity), 100) as max_stock,
          COUNT(DISTINCT w.id) as warehouse_count
        FROM products p
        INNER JOIN purchase_conditions pc ON p.id = pc.product_id 
        LEFT JOIN inventory_items ii ON p.id = ii.product_id
        LEFT JOIN warehouses w ON ii.warehouse_id = w.id
        WHERE pc.supplier_id = ${supplierId}
        GROUP BY p.id, p.product_name, pc.unit_price, p.price
        HAVING COALESCE(SUM(ii.quantity), 0) > 0
        ORDER BY p.product_name
      `;
    } else {
      console.log('Using supplier_id query for supplier without purchase conditions');
      inventoryQuery = sql`
        SELECT 
          p.id as product_id,
          p.product_name,
          COALESCE(p.price, 0) as price,
          COALESCE(SUM(ii.quantity), 0) as total_stock,
          COALESCE(SUM(ii.quantity), 0) as available_stock,
          0 as reserved_stock,
          COALESCE(MIN(ii.min_quantity), 0) as min_stock,
          COALESCE(MAX(ii.max_quantity), 100) as max_stock,
          COUNT(DISTINCT w.id) as warehouse_count
        FROM products p
        LEFT JOIN inventory_items ii ON p.id = ii.product_id
        LEFT JOIN warehouses w ON ii.warehouse_id = w.id
        WHERE p.supplier_id = ${supplierId}
        GROUP BY p.id, p.product_name, p.price
        HAVING COALESCE(SUM(ii.quantity), 0) > 0
        ORDER BY p.product_name
      `;
    }

    const result = await db.execute(inventoryQuery);
    console.log(`Found ${result.rows.length} products for supplier ${supplier.name}`);
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

    console.log(`Fetching sales analysis for supplier ${supplierId}, last ${weeks} weeks`);

    // Check if supplier has purchase conditions
    const purchaseConditionsQuery = sql`
      SELECT COUNT(*) as count FROM purchase_conditions WHERE supplier_id = ${supplierId}
    `;
    const pcResult = await db.execute(purchaseConditionsQuery);
    const hasPurchaseConditions = parseInt(pcResult.rows[0].count) > 0;

    let salesQuery;
    if (hasPurchaseConditions) {
      console.log('Using purchase conditions for sales analysis');
      salesQuery = sql`
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
    } else {
      console.log('Using supplier_id for sales analysis');
      salesQuery = sql`
        WITH supplier_products AS (
          SELECT DISTINCT p.id, p.product_name
          FROM products p
          WHERE p.supplier_id = ${supplierId}
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
    }

    const result = await db.execute(salesQuery);
    console.log(`Found ${result.rows.length} products with sales data`);
    
    // Convert string values to numbers for frontend compatibility
    const processedRows = result.rows.map((row: any) => ({
      productId: row.product_id,
      productName: row.product_name,
      totalSales: Number(row.total_sales || 0),
      totalRevenue: Number(row.total_revenue || 0),
      avgWeeklySales: Number(row.avg_weekly_sales || 0),
      trendDirection: row.trend_direction,
      trendPercentage: Number(row.trend_percentage || 0)
    }));
    
    res.json(processedRows);

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

    console.log(`Fetching forecast for supplier ${supplierId}, ${forecastWeeks} weeks`);

    // Check if supplier has purchase conditions
    const purchaseConditionsQuery = sql`
      SELECT COUNT(*) as count FROM purchase_conditions WHERE supplier_id = ${supplierId}
    `;
    const pcResult = await db.execute(purchaseConditionsQuery);
    const hasPurchaseConditions = parseInt(pcResult.rows[0].count) > 0;

    let forecastQuery;
    if (hasPurchaseConditions) {
      console.log('Using purchase conditions for forecast');
      forecastQuery = sql`
        WITH supplier_products AS (
          SELECT DISTINCT p.id, p.product_name
          FROM products p
          INNER JOIN purchase_conditions pc ON p.id = pc.product_id
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
        )
        SELECT 
          hs.product_id,
          hs.product_name,
          hs.avg_weekly_sales,
          CAST(hs.avg_weekly_sales * ${forecastWeeks} AS INTEGER) as forecasted_demand,
          'medium' as confidence_level
        FROM historical_sales hs
        WHERE hs.avg_weekly_sales > 0
        ORDER BY hs.avg_weekly_sales DESC
      `;
    } else {
      console.log('Using supplier_id for forecast');
      forecastQuery = sql`
        WITH supplier_products AS (
          SELECT DISTINCT p.id, p.product_name
          FROM products p
          WHERE p.supplier_id = ${supplierId}
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
        )
        SELECT 
          hs.product_id,
          hs.product_name,
          hs.avg_weekly_sales,
          CAST(hs.avg_weekly_sales * ${forecastWeeks} AS INTEGER) as forecasted_demand,
          'medium' as confidence_level
        FROM historical_sales hs
        WHERE hs.avg_weekly_sales > 0
        ORDER BY hs.avg_weekly_sales DESC
      `;
    }

    console.log('Executing forecast query...');
    const result = await db.execute(forecastQuery);
    console.log(`Found ${result.rows.length} products with forecast data`);
    
    // Convert to expected format
    const processedRows = result.rows.map((row: any) => ({
      productId: row.product_id,
      productName: row.product_name,
      avgWeeklySales: Number(row.avg_weekly_sales || 0),
      forecastedDemand: Number(row.forecasted_demand || 0),
      confidenceLevel: row.confidence_level
    }));
    
    res.json(processedRows);

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

export default router;
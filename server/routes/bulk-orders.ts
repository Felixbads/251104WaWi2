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
    const hasPurchaseConditions = parseInt(String(pcResult.rows[0].count)) > 0;
    
    // Always use supplier_id query to show ALL products, not just those with purchase conditions
    console.log('Using comprehensive supplier query to show all products');
    let inventoryQuery = sql`
      SELECT 
        p.id as product_id,
        p.product_name,
        COALESCE(
          CASE WHEN pc.unit_price IS NOT NULL THEN pc.unit_price 
               ELSE p.price 
          END, 0
        ) as price,
        COALESCE(SUM(ii.quantity), 0) as total_stock,
        COALESCE(SUM(ii.quantity), 0) as available_stock,
        0 as reserved_stock,
        COALESCE(MIN(ii.min_quantity), 0) as min_stock,
        COALESCE(MAX(ii.max_quantity), 100) as max_stock,
        COUNT(DISTINCT w.id) as warehouse_count
      FROM products p
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
      LEFT JOIN inventory_items ii ON p.id = ii.product_id
      LEFT JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE p.supplier_id = ${supplierId}
      GROUP BY p.id, p.product_name, pc.unit_price, p.price
      ORDER BY p.product_name
    `;

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
    const hasPurchaseConditions = parseInt(String(pcResult.rows[0].count)) > 0;

    // Always use comprehensive supplier query for sales analysis too
    console.log('Using comprehensive supplier query for sales analysis');
    let salesQuery = sql`
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
            COUNT(t.id) as recent_sales,
            COUNT(CASE WHEN t.datetime >= ${subWeeks(new Date(), Math.ceil(weeks / 2)).toISOString()} THEN 1 END) as recent_period_sales,
            COUNT(CASE WHEN t.datetime < ${subWeeks(new Date(), Math.ceil(weeks / 2)).toISOString()} THEN 1 END) as older_period_sales
          FROM supplier_products sp
          LEFT JOIN transactions t ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name))
            AND t.datetime >= ${startDate.toISOString()}
          GROUP BY sp.id
        )
        SELECT 
          sd.product_id,
          sd.product_name,
          sd.total_sales,
          sd.total_revenue,
          sd.avg_weekly_sales,
          td.recent_period_sales,
          td.older_period_sales,
          CASE 
            WHEN sd.total_sales = 0 THEN 'stable'
            WHEN td.older_period_sales = 0 AND td.recent_period_sales > 0 THEN 'up'
            WHEN td.recent_period_sales = 0 AND td.older_period_sales > 0 THEN 'down'
            WHEN td.older_period_sales = 0 THEN 'stable'
            WHEN (td.recent_period_sales::numeric / ${Math.ceil(weeks / 2)}) > (td.older_period_sales::numeric / ${Math.ceil(weeks / 2)}) THEN 'up'
            WHEN (td.recent_period_sales::numeric / ${Math.ceil(weeks / 2)}) < (td.older_period_sales::numeric / ${Math.ceil(weeks / 2)}) THEN 'down'
            ELSE 'stable'
          END as trend_direction,
          CASE 
            WHEN td.older_period_sales = 0 OR sd.avg_weekly_sales = 0 THEN 0
            ELSE CAST(
              ((td.recent_period_sales::numeric / ${Math.ceil(weeks / 2)}) - 
               (td.older_period_sales::numeric / ${Math.ceil(weeks / 2)})) / 
              (td.older_period_sales::numeric / ${Math.ceil(weeks / 2)}) * 100 
              AS numeric(10,1))
          END as trend_percentage
        FROM sales_data sd
        LEFT JOIN trend_data td ON sd.product_id = td.product_id
        ORDER BY sd.total_sales DESC
    `;

    const result = await db.execute(salesQuery);
    console.log(`Found ${result.rows.length} products with sales data`);
    
    // Convert string values to numbers for frontend compatibility and add debug info
    const processedRows = result.rows.map((row: any) => ({
      productId: row.product_id,
      productName: row.product_name,
      totalSales: Number(row.total_sales || 0),
      totalRevenue: Number(row.total_revenue || 0),
      avgWeeklySales: Number(row.avg_weekly_sales || 0),
      trendDirection: row.trend_direction,
      trendPercentage: Number(row.trend_percentage || 0),
      // Debug info
      recentPeriodSales: Number(row.recent_period_sales || 0),
      olderPeriodSales: Number(row.older_period_sales || 0)
    }));
    
    console.log('First product trend data:', processedRows[0]);
    
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
    const hasPurchaseConditions = parseInt(String(pcResult.rows[0].count)) > 0;

    // Always use comprehensive supplier query for forecast too
    console.log('Using comprehensive supplier query for forecast');
    let forecastQuery = sql`
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
            -- Use 8 weeks of data for better accuracy
            COALESCE(COUNT(t.id)::float / 8, 0) as avg_weekly_sales,
            -- Calculate recent trend (last 4 weeks vs previous 4 weeks)
            COUNT(CASE WHEN t.datetime >= ${subWeeks(new Date(), 4).toISOString()} THEN 1 END) as recent_sales,
            COUNT(CASE WHEN t.datetime >= ${subWeeks(new Date(), 8).toISOString()} 
                       AND t.datetime < ${subWeeks(new Date(), 4).toISOString()} THEN 1 END) as older_sales
          FROM supplier_products sp
          LEFT JOIN transactions t ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(sp.product_name))
            AND t.datetime >= ${subWeeks(new Date(), 8).toISOString()}
          GROUP BY sp.id, sp.product_name
        )
        SELECT 
          hs.product_id,
          hs.product_name,
          hs.avg_weekly_sales,
          -- Enhanced forecast calculation with trend adjustment
          CAST(
            CASE 
              -- If we have good data for trend analysis
              WHEN hs.older_sales > 0 THEN
                hs.avg_weekly_sales * ${forecastWeeks} * 
                -- Apply trend multiplier (recent vs older sales)
                GREATEST(0.5, LEAST(2.0, (hs.recent_sales::float / GREATEST(1, hs.older_sales))))
              -- Fallback to simple average with conservative estimate for bulk orders
              ELSE hs.avg_weekly_sales * ${forecastWeeks} * 1.1
            END AS INTEGER
          ) as forecasted_demand,
          -- Confidence based on data quality and trend stability
          CASE 
            WHEN hs.total_sales >= 20 AND hs.older_sales > 0 THEN 'high'
            WHEN hs.total_sales >= 10 THEN 'medium'
            ELSE 'low'
          END as confidence_level
        FROM historical_sales hs
        WHERE hs.avg_weekly_sales > 0
        ORDER BY hs.avg_weekly_sales DESC
    `;

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
router.post('/bulk', async (req, res) => {
  console.log('=== BULK ORDER POST REQUEST START ===');
  console.log('Request body received:', JSON.stringify(req.body, null, 2));
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Authorization header present:', !!req.headers.authorization);
  
  try {
    const {
      supplierId,
      warehouseId,
      orderType = 'bulk',
      expectedDeliveryDate,
      deliveryType = 'delivery',
      showPricesInEmail = true,
      notes,
      priority = 'high',
      items,
      analysisWeeks,
      forecastWeeks,
      totalValue
    } = req.body;

    console.log('Extracted fields:');
    console.log('- supplierId:', supplierId, typeof supplierId);
    console.log('- warehouseId:', warehouseId, typeof warehouseId);
    console.log('- deliveryType:', deliveryType);
    console.log('- showPricesInEmail:', showPricesInEmail);
    console.log('- items:', items ? `Array with ${items.length} items` : 'undefined/null');
    console.log('- First item:', items && items[0] ? JSON.stringify(items[0]) : 'none');

    if (!supplierId || !items || items.length === 0) {
      console.log('Validation failed:');
      console.log('- supplierId check:', !!supplierId);
      console.log('- items check:', !!items);
      console.log('- items.length check:', items ? items.length : 'N/A');
      return res.status(400).json({ error: 'Supplier ID and items are required' });
    }
    
    console.log('Validation passed, proceeding with order creation...');

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
      warehouseId: warehouseId ? parseInt(warehouseId) : null,
      status: 'draft',
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      deliveryType: deliveryType,
      showPricesInEmail: showPricesInEmail,
      notes: `${notes || ''}\n\nBulk order analysis: ${analysisWeeks} weeks, forecast: ${forecastWeeks} weeks`,
      priority: priority,
      totalAmount: totalValue
    }).returning();

    const orderId = newOrder[0].id;

    // Create order items with product data
    const orderItemsData = [];
    let calculatedTotal = 0;
    
    for (const item of items) {
      // Get product information
      const productQuery = sql`
        SELECT p.id, p.product_name, p.price,
               COALESCE(pc.unit_price, p.price) as effective_price
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = ${supplierId}
        WHERE p.id = ${item.productId}
        LIMIT 1
      `;
      
      const productResult = await db.execute(productQuery);
      
      if (productResult.rows.length === 0) {
        console.log(`Product with ID ${item.productId} not found`);
        continue; // Skip invalid products
      }
      
      const product = productResult.rows[0];
      const unitPrice = Number(product.effective_price) || 0;
      const itemTotal = unitPrice * item.quantity;
      calculatedTotal += itemTotal;
      
      orderItemsData.push({
        orderId,
        productId: item.productId,
        productName: String(product.product_name) || 'Unbekanntes Produkt',
        unitPrice,
        totalPrice: itemTotal,
        quantity: item.quantity,
        unit: 'stk',
        vat: 19,
        status: 'pending',
        notes: item.notes || 'Bulk order item - forecast based',
        itemComment: item.notes || null,
        deliveryComment: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (orderItemsData.length === 0) {
      return res.status(400).json({ error: 'No valid products found for this order' });
    }

    await db.insert(orderItems).values(orderItemsData);
    
    // Update order total
    await db.update(orders)
      .set({ totalAmount: calculatedTotal })
      .where(eq(orders.id, orderId));

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

// GET /forecast-factors/:weeks - Get forecast factors (weather, holidays) for bulk ordering
router.get('/forecast-factors/:weeks', async (req, res) => {
  try {
    const weeks = parseInt(req.params.weeks);
    if (isNaN(weeks) || weeks < 1 || weeks > 8) {
      return res.status(400).json({ error: 'Invalid weeks parameter (1-8 allowed)' });
    }

    const currentMonth = new Date().getMonth(); // 0 = Januar, 6 = Juli
    
    // Seasonal weather descriptions for July
    let weatherDescription = 'Hochsommerlich warm, 22-28°C, meist sonnig';
    if (weeks === 1) {
      weatherDescription = 'Sommerlich warm, 24-30°C, vereinzelt Gewitter';
    } else if (weeks === 2) {
      weatherDescription = 'Hochsommer, 22-28°C, wechselnd bewölkt';
    } else if (weeks === 3) {
      weatherDescription = 'Warm und sonnig, 20-26°C, vereinzelt Schauer';
    } else if (weeks === 4) {
      weatherDescription = 'Spätsommer, 18-24°C, zunehmend wechselhaft';
    }

    // Check for summer holidays in Saxony (typically July/August)
    let holidaysDescription = 'Sommerferienzeit - erhöhte Tourismusaktivität';
    let holidayEvents = [];
    
    if (currentMonth === 6) { // Juli
      holidaysDescription = 'Sachsen Sommerferien (8. Juli - 15. August) - Hauptferienzeit';
      holidayEvents = [
        {
          name: 'Sommerferien Sachsen',
          date: '2025-07-08',
          description: 'Beginn der Sommerferien in Sachsen'
        }
      ];
    } else if (currentMonth === 7) { // August 
      holidaysDescription = 'Sachsen Sommerferien bis 15. August - Ferienende naht';
      holidayEvents = [
        {
          name: 'Ende Sommerferien Sachsen',
          date: '2025-08-15',
          description: 'Ende der Sommerferien in Sachsen'
        }
      ];
    } else {
      holidaysDescription = 'Keine besonderen Feiertage oder Ferienzeiten';
    }

    res.json({
      weather: {
        description: weatherDescription,
        expected: true
      },
      holidays: {
        description: holidaysDescription,
        events: holidayEvents
      },
      notes: `Prognose für ${weeks} Woche(n) basiert auf saisonalen Trends und aktueller Ferienzeit`
    });

  } catch (error) {
    console.error('Error fetching forecast factors:', error);
    res.status(500).json({ error: 'Failed to fetch forecast factors' });
  }
});

export default router;
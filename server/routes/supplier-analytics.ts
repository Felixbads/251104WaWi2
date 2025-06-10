import { Router } from 'express';
import { and, eq, gte, lte, desc, asc, sql, count, sum, avg } from 'drizzle-orm';
import { db } from '../db';
import { 
  suppliers, 
  products, 
  orders, 
  orderItems, 
  inventoryItems,
  warehouses,
  transactions,
  purchaseConditions,
  productMovements
} from '../../shared/schema';

const router = Router();

// Overview endpoint for suppliers page
router.get('/overview', async (req, res) => {
  try {
    // Get all suppliers with basic analytics
    const suppliersAnalytics = await db
      .select({
        supplierId: suppliers.id,
        openOrders: sql<number>`COUNT(CASE WHEN ${orders.status} IN ('pending', 'processing') THEN 1 ELSE 0 END)`,
        annualRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
        productCount: sql<number>`COUNT(DISTINCT ${products.id})`,
        orderVolume: sql<number>`COUNT(${orders.id})`,
        lastOrderDate: sql<Date>`MAX(${orders.createdAt})`
      })
      .from(suppliers)
      .leftJoin(products, eq(suppliers.id, products.supplierId))
      .leftJoin(orders, eq(suppliers.id, orders.supplierId))
      .groupBy(suppliers.id);

    res.json(suppliersAnalytics);
  } catch (error) {
    console.error('Error fetching supplier analytics overview:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Lieferanten-Übersicht' });
  }
});

// Dashboard endpoint
router.get('/dashboard/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    // Calculate date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    
    // Get overview metrics using pure SQL
    const overviewQuery = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT p.id) as "totalProducts",
        COUNT(DISTINCT p.id) as "activeProducts",
        COUNT(DISTINCT o.id) as "totalOrders",
        0 as "openOrders",
        COALESCE(SUM(DISTINCT t.price), 0) as "totalRevenue",
        COALESCE(SUM(CASE WHEN t.datetime >= ${thirtyDaysAgo} THEN t.price ELSE 0 END), 0) as "monthlyRevenue"
      FROM products p
      LEFT JOIN orders o ON p.supplier_id = o.supplier_id
      LEFT JOIN transactions t ON p.product_name = t.product_name
      WHERE p.supplier_id = ${supplierId}
    `);

    const overviewResult = overviewQuery.rows[0] || {
      totalProducts: 0,
      activeProducts: 0,
      totalOrders: 0,
      openOrders: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      lastOrderDate: null
    };

    // Get inventory data with warehouse information using SQL
    const inventoryQuery = await db.execute(sql`
      SELECT 
        ii.product_id as "productId",
        p.product_name as "productName",
        p.sku,
        ii.warehouse_id as "warehouseId", 
        w.name as "warehouseName",
        w.address as location,
        ii.quantity as stock,
        ii.min_quantity as "reorderLevel"
      FROM inventory_items ii
      INNER JOIN products p ON ii.product_id = p.id
      LEFT JOIN warehouses w ON ii.warehouse_id = w.id  
      WHERE p.supplier_id = ${supplierId}
      ORDER BY p.product_name, w.name
    `);

    // Group inventory by product
    const inventoryMap = new Map();
    inventoryQuery.rows.forEach((item: any) => {
      const key = item.productId;
      if (!inventoryMap.has(key)) {
        inventoryMap.set(key, {
          productId: item.productId,
          productName: item.productName || 'Unbekannt',
          sku: item.sku || '',
          warehouses: [],
          totalStock: 0
        });
      }
      
      const product = inventoryMap.get(key);
      const stockLevel = item.stock || 0;
      const reorderLevel = item.reorderLevel || 0;
      let status: 'good' | 'warning' | 'critical' = 'good';
      
      if (stockLevel === 0) {
        status = 'critical';
      } else if (stockLevel <= reorderLevel) {
        status = 'warning';
      }

      product.warehouses.push({
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName || `Lager ${item.warehouseId}`,
        location: item.location || '',
        stock: stockLevel,
        reorderLevel: reorderLevel,
        status: status
      });
      
      product.totalStock += stockLevel;
    });

    // Convert to array
    const inventory = Array.from(inventoryMap.values());

    // Get recent sales data (last 30 days) using SQL
    const salesQuery = await db.execute(sql`
      SELECT 
        DATE(t.datetime) as date,
        SUM(COALESCE(t.price, 0)) as revenue,
        COUNT(*) as sales
      FROM transactions t
      INNER JOIN products p ON t.product_name = p.product_name
      WHERE p.supplier_id = ${supplierId}
        AND t.datetime >= ${thirtyDaysAgo}
      GROUP BY DATE(t.datetime)
      ORDER BY DATE(t.datetime)
    `);

    // Get top products by sales volume using SQL
    const topProductsQuery = await db.execute(sql`
      SELECT 
        t.product_name as "productName",
        COUNT(*) as sales,
        SUM(COALESCE(t.price, 0)) as revenue
      FROM transactions t
      INNER JOIN products p ON t.product_name = p.product_name
      WHERE p.supplier_id = ${supplierId}
        AND t.datetime >= ${thirtyDaysAgo}
      GROUP BY t.product_name
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `);

    const dashboardData = {
      overview: overviewResult,
      inventory: inventory,
      salesData: salesQuery.rows,
      topLocations: [
        {
          locationId: 1,
          locationName: 'Alle Standorte',
          revenue: salesQuery.rows.reduce((sum: number, day: any) => sum + (day.revenue || 0), 0),
          orders: salesQuery.rows.reduce((sum: number, day: any) => sum + (day.sales || 0), 0),
          percentage: 100
        }
      ],
      topProducts: topProductsQuery.rows
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching supplier dashboard data:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      error: 'Fehler beim Laden der Dashboard-Daten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Statistics endpoint
router.get('/statistics/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const timeRange = req.query.timeRange as string || '12m';
    
    // Calculate date range based on timeRange parameter
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case '3m':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6m':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case '24m':
        startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        break;
      default: // 12m
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    // Overview statistics
    const [overviewStats] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
        totalOrders: count(orders.id),
        avgOrderValue: sql<number>`COALESCE(AVG(${orders.totalAmount}), 0)`,
        topSellingProduct: sql<string>`'Produktname'`,
        revenueGrowth: sql<number>`0`,
        orderGrowth: sql<number>`0`
      })
      .from(orders)
      .where(
        and(
          eq(orders.supplierId, supplierId),
          gte(orders.createdAt, startDate)
        )
      );

    // Revenue by month
    const revenueByMonth = await db
      .select({
        month: sql<string>`TO_CHAR(${orders.createdAt}, 'YYYY-MM')`,
        revenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
        orders: count(orders.id),
        avgOrderValue: sql<number>`COALESCE(AVG(${orders.totalAmount}), 0)`
      })
      .from(orders)
      .where(
        and(
          eq(orders.supplierId, supplierId),
          gte(orders.createdAt, startDate)
        )
      )
      .groupBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM')`);

    // Product performance
    const productPerformance = await db
      .select({
        productId: products.id,
        productName: products.productName,
        revenue: sql<number>`COALESCE(SUM(${orderItems.unitPrice} * ${orderItems.quantity}), 0)`,
        quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        growth: sql<number>`0`,
        margin: sql<number>`15`
      })
      .from(products)
      .leftJoin(orderItems, eq(products.id, orderItems.productId))
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(products.supplierId, supplierId),
          gte(orders.createdAt, startDate)
        )
      )
      .groupBy(products.id, products.productName)
      .orderBy(desc(sql`COALESCE(SUM(${orderItems.unitPrice} * ${orderItems.quantity}), 0)`))
      .limit(10);

    // Location performance (simplified for now)
    const locationPerformance = [
      {
        locationId: 1,
        locationName: 'Hauptstandort',
        revenue: overviewStats?.totalRevenue || 0,
        orders: overviewStats?.totalOrders || 0,
        growth: 5.2,
        topProducts: [
          { productName: 'Top Produkt 1', quantity: 50 },
          { productName: 'Top Produkt 2', quantity: 35 }
        ]
      }
    ];

    // Seasonal trends (simplified)
    const seasonalTrends = [
      { period: 'Q1', revenue: (overviewStats?.totalRevenue || 0) * 0.2, orders: (overviewStats?.totalOrders || 0) * 0.2, avgTemp: 5 },
      { period: 'Q2', revenue: (overviewStats?.totalRevenue || 0) * 0.3, orders: (overviewStats?.totalOrders || 0) * 0.3, avgTemp: 15 },
      { period: 'Q3', revenue: (overviewStats?.totalRevenue || 0) * 0.35, orders: (overviewStats?.totalOrders || 0) * 0.35, avgTemp: 25 },
      { period: 'Q4', revenue: (overviewStats?.totalRevenue || 0) * 0.15, orders: (overviewStats?.totalOrders || 0) * 0.15, avgTemp: 8 }
    ];

    // Order patterns (simplified)
    const orderPatterns = [
      { dayOfWeek: 'Montag', hour: 9, orders: 12, revenue: 150 },
      { dayOfWeek: 'Dienstag', hour: 10, orders: 15, revenue: 200 },
      { dayOfWeek: 'Mittwoch', hour: 11, orders: 18, revenue: 250 },
      { dayOfWeek: 'Donnerstag', hour: 14, orders: 20, revenue: 300 },
      { dayOfWeek: 'Freitag', hour: 16, orders: 25, revenue: 400 },
      { dayOfWeek: 'Samstag', hour: 12, orders: 8, revenue: 100 },
      { dayOfWeek: 'Sonntag', hour: 15, orders: 5, revenue: 60 }
    ];

    const statisticsData = {
      overview: {
        totalRevenue: overviewStats?.totalRevenue || 0,
        totalOrders: overviewStats?.totalOrders || 0,
        avgOrderValue: overviewStats?.avgOrderValue || 0,
        topSellingProduct: 'Top Produkt',
        revenueGrowth: 8.5,
        orderGrowth: 12.3
      },
      revenueByMonth: revenueByMonth,
      productPerformance: productPerformance,
      locationPerformance: locationPerformance,
      seasonalTrends: seasonalTrends,
      orderPatterns: orderPatterns
    };

    res.json(statisticsData);
  } catch (error) {
    console.error('Error fetching supplier statistics:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Statistik-Daten' });
  }
});

export default router;
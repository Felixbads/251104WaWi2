import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

router.get('/inventory-health', async (req, res) => {
  try {
    // Use pool directly for better compatibility
    const { pool } = require('../db');
    
    // Get overall inventory statistics
    const inventoryStats = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN quantity <= COALESCE(min_quantity, 5) THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock_items,
        AVG(quantity) as avg_quantity,
        SUM(quantity) as total_quantity
      FROM inventory_items
    `);

    // Get recent sales activity (last 30 days)
    const salesActivity = await pool.query(`
      SELECT 
        COUNT(DISTINCT product_id) as products_with_sales,
        COUNT(*) as total_transactions,
        COUNT(DISTINCT machine_id) as active_machines
      FROM transactions 
      WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'
        AND COALESCE(status, 'completed') = 'completed'
    `);

    // Get warehouse distribution
    const warehouseStats = await pool.query(`
      SELECT 
        w.name as warehouse_name,
        COUNT(ii.id) as total_items,
        COUNT(CASE WHEN ii.quantity <= COALESCE(ii.min_quantity, 5) THEN 1 END) as low_stock_items,
        SUM(ii.quantity) as total_quantity
      FROM warehouses w
      LEFT JOIN inventory_items ii ON w.id = ii.warehouse_id
      GROUP BY w.id, w.name
      ORDER BY w.name
    `);

    // Get top selling products (last 30 days)
    const topProducts = await pool.query(`
      SELECT 
        p.product_name,
        COUNT(*) as sales_count,
        MAX(t.datetime) as last_sale,
        ii.quantity,
        COALESCE(ii.min_quantity, 5) as min_quantity,
        w.name as warehouse_name
      FROM transactions t
      INNER JOIN products p ON t.product_id = p.id::text
      LEFT JOIN inventory_items ii ON p.id = ii.product_id
      LEFT JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE t.datetime >= CURRENT_DATE - INTERVAL '30 days'
        AND COALESCE(t.status, 'completed') = 'completed'
      GROUP BY p.product_name, p.id, ii.quantity, ii.min_quantity, w.name
      ORDER BY sales_count DESC
      LIMIT 10
    `);

    // Get products that might need attention (low stock but no recent sales)
    const attentionProducts = await pool.query(`
      WITH recent_sales AS (
        SELECT DISTINCT 
          t.product_id::integer as product_id,
          COUNT(*) as sales_count
        FROM transactions t
        WHERE t.datetime >= CURRENT_DATE - INTERVAL '30 days'
          AND COALESCE(t.status, 'completed') = 'completed'
        GROUP BY t.product_id
      ),
      low_stock AS (
        SELECT 
          ii.product_id,
          p.product_name,
          w.name as warehouse_name,
          ii.quantity,
          COALESCE(ii.min_quantity, 5) as min_quantity
        FROM inventory_items ii
        INNER JOIN products p ON ii.product_id = p.id
        INNER JOIN warehouses w ON ii.warehouse_id = w.id
        WHERE ii.quantity <= COALESCE(ii.min_quantity, 5)
      )
      SELECT 
        ls.product_name,
        ls.warehouse_name,
        ls.quantity,
        ls.min_quantity,
        COALESCE(rs.sales_count, 0) as recent_sales,
        CASE 
          WHEN rs.product_id IS NOT NULL THEN 'CRITICAL'
          WHEN ls.quantity = 0 THEN 'OUT_OF_STOCK'
          ELSE 'LOW_STOCK'
        END as status_category
      FROM low_stock ls
      LEFT JOIN recent_sales rs ON ls.product_id = rs.product_id
      ORDER BY 
        CASE 
          WHEN rs.product_id IS NOT NULL THEN 1
          WHEN ls.quantity = 0 THEN 2
          ELSE 3
        END,
        ls.quantity ASC
      LIMIT 20
    `);

    res.json({
      success: true,
      overview: {
        totalItems: parseInt(inventoryStats.rows[0].total_items) || 0,
        lowStockItems: parseInt(inventoryStats.rows[0].low_stock_items) || 0,
        outOfStockItems: parseInt(inventoryStats.rows[0].out_of_stock_items) || 0,
        avgQuantity: parseFloat(inventoryStats.rows[0].avg_quantity) || 0,
        totalQuantity: parseInt(inventoryStats.rows[0].total_quantity) || 0
      },
      salesActivity: {
        productsWithSales: parseInt(salesActivity.rows[0].products_with_sales) || 0,
        totalTransactions: parseInt(salesActivity.rows[0].total_transactions) || 0,
        activeMachines: parseInt(salesActivity.rows[0].active_machines) || 0
      },
      warehouseStats: warehouseStats.rows.map((ws: any) => ({
        warehouseName: ws.warehouse_name,
        totalItems: parseInt(ws.total_items) || 0,
        lowStockItems: parseInt(ws.low_stock_items) || 0,
        totalQuantity: parseInt(ws.total_quantity) || 0,
        stockHealth: ws.total_items > 0 ? 
          ((parseInt(ws.total_items) - parseInt(ws.low_stock_items || 0)) / parseInt(ws.total_items) * 100).toFixed(1) : 
          '0'
      })),
      topProducts: topProducts.rows.map((tp: any) => ({
        productName: tp.product_name,
        salesCount: parseInt(tp.sales_count),
        lastSale: tp.last_sale,
        currentStock: parseInt(tp.quantity) || 0,
        minQuantity: parseInt(tp.min_quantity) || 5,
        warehouseName: tp.warehouse_name || 'Unassigned',
        stockStatus: (parseInt(tp.quantity) || 0) <= (parseInt(tp.min_quantity) || 5) ? 'LOW' : 'OK'
      })),
      attentionProducts: attentionProducts.rows.map((ap: any) => ({
        productName: ap.product_name,
        warehouseName: ap.warehouse_name,
        quantity: parseInt(ap.quantity),
        minQuantity: parseInt(ap.min_quantity),
        recentSales: parseInt(ap.recent_sales),
        statusCategory: ap.status_category,
        priority: ap.status_category === 'CRITICAL' ? 'HIGH' : 
                  ap.status_category === 'OUT_OF_STOCK' ? 'MEDIUM' : 'LOW'
      }))
    });

  } catch (error) {
    console.error('Fehler beim Abrufen der Lagergesundheit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Abrufen der Lagergesundheit' 
    });
  }
});

export default router;
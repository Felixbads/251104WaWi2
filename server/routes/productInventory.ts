import { Router } from 'express';
import { db } from '../db';

const router = Router();

// Get warehouse inventory for a product
router.get('/products/:id/warehouse-inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    const query = `
      SELECT 
        inv.id,
        inv.warehouse_id as "warehouseId",
        w.name as "warehouseName",
        inv.quantity,
        inv.min_quantity as "minQuantity",
        inv.max_quantity as "maxQuantity",
        w.address as "location",
        inv.updated_at as "lastRefill"
      FROM inventory_items inv
      JOIN warehouses w ON inv.warehouse_id = w.id
      WHERE inv.product_id = $1 AND w.is_active = true
      ORDER BY inv.quantity DESC
    `;
    
    const result = await db.execute(query, [productId]);
    const data = Array.isArray(result) ? result : (result.rows || []);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching warehouse inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch warehouse inventory' });
  }
});

// Get machine inventory for a product
router.get('/products/:id/machine-inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // First, get the product name to match with transactions
    const productQuery = `
      SELECT product_name, sku, barcode 
      FROM products 
      WHERE id = $1
    `;
    const productResult = await db.execute(productQuery, [productId]);
    const product = Array.isArray(productResult) ? productResult[0] : (productResult.rows?.[0]);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Get machine inventory based on recent transactions and refills
    const query = `
      WITH recent_transactions AS (
        SELECT 
          machine_id,
          COUNT(*) as sales_count,
          MAX(datetime) as last_sale
        FROM transactions 
        WHERE product_name ILIKE '%' || $1 || '%'
          AND datetime >= NOW() - INTERVAL '30 days'
        GROUP BY machine_id
      ),
      recent_refills AS (
        SELECT 
          r.machine_id,
          SUM(rd.quantity_added) as total_added,
          MAX(r.datetime) as last_refill
        FROM refills r
        JOIN refill_details rd ON r.id = rd.refill_id
        JOIN products p ON rd.product_id = p.id
        WHERE p.id = $2
          AND r.datetime >= NOW() - INTERVAL '30 days'
        GROUP BY r.machine_id
      ),
      machine_stats AS (
        SELECT 
          m.id as machine_id,
          m.machine_name as "machineName",
          l.name as "locationName",
          COALESCE(rr.total_added, 0) - COALESCE(rt.sales_count, 0) as current_stock,
          20 as max_capacity, -- Default capacity, could be made configurable
          rr.last_refill as "lastRefill",
          CASE 
            WHEN COALESCE(rr.total_added, 0) - COALESCE(rt.sales_count, 0) <= 0 THEN 'empty'
            WHEN COALESCE(rr.total_added, 0) - COALESCE(rt.sales_count, 0) <= 3 THEN 'low'
            ELSE 'ok'
          END as status
        FROM machines m
        LEFT JOIN locations l ON m.location_id = l.id
        LEFT JOIN recent_transactions rt ON m.id = rt.machine_id
        LEFT JOIN recent_refills rr ON m.id = rr.machine_id
        WHERE m.is_active = true
          AND (rt.machine_id IS NOT NULL OR rr.machine_id IS NOT NULL)
      )
      SELECT 
        machine_id as "machineId",
        "machineName",
        "locationName",
        GREATEST(current_stock, 0) as "currentStock",
        max_capacity as "maxCapacity",
        "lastRefill",
        status
      FROM machine_stats
      ORDER BY current_stock ASC, "machineName"
    `;
    
    const result = await db.execute(query, [product.product_name, productId]);
    const data = Array.isArray(result) ? result : (result.rows || []);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching machine inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch machine inventory' });
  }
});

// Get sales data for a product
router.get('/products/:id/sales', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const timeRange = req.query.timeRange as string || '7d';
    const selectedMachine = req.query.selectedMachine as string || 'all';
    
    // Convert time range to days
    const days = timeRange === '1d' ? 1 : 
                 timeRange === '7d' ? 7 : 
                 timeRange === '30d' ? 30 : 
                 timeRange === '90d' ? 90 : 7;
    
    // Get product name
    const productQuery = `
      SELECT product_name 
      FROM products 
      WHERE id = $1
    `;
    const productResult = await db.execute(productQuery, [productId]);
    const product = Array.isArray(productResult) ? productResult[0] : (productResult.rows?.[0]);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Get sales summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_sales,
        SUM(price) as total_revenue,
        AVG(price) as avg_price,
        COUNT(DISTINCT machine_id) as active_machines
      FROM transactions 
      WHERE product_name ILIKE '%' || $1 || '%'
        AND datetime >= NOW() - INTERVAL '${days} days'
        ${selectedMachine !== 'all' ? 'AND machine_id = $2' : ''}
    `;
    
    const summaryParams = selectedMachine !== 'all' ? [product.product_name, parseInt(selectedMachine)] : [product.product_name];
    const summaryResult = await db.execute(summaryQuery, summaryParams);
    const summary = Array.isArray(summaryResult) ? summaryResult[0] : (summaryResult.rows?.[0]);
    
    // Get sales by machine
    const machinesQuery = `
      WITH machine_sales AS (
        SELECT 
          t.machine_id,
          m.machine_name as machine_name,
          l.name as location_name,
          COUNT(*) as total_sales,
          SUM(t.price) as total_revenue,
          AVG(t.price) as avg_price,
          MAX(t.datetime) as last_sale,
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE THEN 1 END) as today_sales,
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE - INTERVAL '1 day' AND t.datetime < CURRENT_DATE THEN 1 END) as yesterday_sales,
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
        FROM transactions t
        JOIN machines m ON t.machine_id = m.id
        LEFT JOIN locations l ON m.location_id = l.id
        WHERE t.product_name ILIKE '%' || $1 || '%'
          AND t.datetime >= NOW() - INTERVAL '${days} days'
          ${selectedMachine !== 'all' ? 'AND t.machine_id = $2' : ''}
        GROUP BY t.machine_id, m.machine_name, l.name
      )
      SELECT 
        machine_id as "machineId",
        machine_name as "machineName",
        location_name as "locationName",
        total_sales as "totalSales",
        total_revenue as "totalRevenue",
        avg_price as "avgPrice",
        last_sale as "lastSale",
        'stable' as "salesTrend",
        json_build_object(
          'today', today_sales,
          'yesterday', yesterday_sales,
          'last7Days', last_7_days,
          'last30Days', last_30_days
        ) as "periodSales"
      FROM machine_sales
      ORDER BY total_sales DESC
    `;
    
    const machinesParams = selectedMachine !== 'all' ? [product.product_name, parseInt(selectedMachine)] : [product.product_name];
    const machinesResult = await db.execute(machinesQuery, machinesParams);
    const machines = Array.isArray(machinesResult) ? machinesResult : (machinesResult.rows || []);
    
    res.json({ 
      success: true, 
      summary: {
        totalSales: parseInt(summary?.total_sales || 0),
        totalRevenue: parseFloat(summary?.total_revenue || 0),
        avgPrice: parseFloat(summary?.avg_price || 0),
        activeMachines: parseInt(summary?.active_machines || 0)
      },
      machines 
    });
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// Get refill history for a product
router.get('/products/:id/refills', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const timeRange = req.query.timeRange as string || '7d';
    
    const days = timeRange === '1d' ? 1 : 
                 timeRange === '7d' ? 7 : 
                 timeRange === '30d' ? 30 : 
                 timeRange === '90d' ? 90 : 7;
    
    const query = `
      SELECT 
        r.id as "refillId",
        r.machine_id as "machineId",
        m.machine_name as "machineName",
        r.datetime as "refillDate",
        rd.quantity_added as "quantityAdded",
        COALESCE(rd.quantity_removed, 0) as "quantityRemoved",
        (rd.quantity_added - COALESCE(rd.quantity_removed, 0)) as "netChange",
        COALESCE(r.notes, 'Reguläre Auffüllung') as reason
      FROM refills r
      JOIN refill_details rd ON r.id = rd.refill_id
      JOIN machines m ON r.machine_id = m.id
      WHERE rd.product_id = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      ORDER BY r.datetime DESC
      LIMIT 50
    `;
    
    const result = await db.execute(query, [productId]);
    const data = Array.isArray(result) ? result : (result.rows || []);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching refill data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch refill data' });
  }
});

export default router;
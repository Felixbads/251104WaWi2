import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

const router = Router();

// Working critical inventory endpoint with proper error handling
router.get('/critical-inventory-working', async (req: Request, res: Response) => {
  try {
    console.log('Querying for critical inventory items...');
    
    // Simple approach: Get products below minimum stock with machine assignments and recent sales
    const criticalQuery = `
      SELECT 
        ii.id,
        ii.warehouse_id as "warehouseId",
        w.name as "warehouseName", 
        ii.product_id as "productId",
        p.product_name as "productName",
        ii.quantity as "currentQuantity",
        COALESCE(ii.min_quantity, 5) as "minQuantity",
        COALESCE(ii.reorder_point, ii.min_quantity, 5) as "reorderPoint",
        COALESCE(p.price, 0) as price,
        COALESCE(p.category, 'Unbekannt') as category,
        COALESCE(p.sku, '') as sku
      FROM inventory_items ii
      INNER JOIN products p ON ii.product_id = p.id
      INNER JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE ii.quantity <= COALESCE(ii.min_quantity, 5)
        AND ii.quantity >= 0
        AND COALESCE(ii.status, 'active') = 'active'
        AND COALESCE(w.is_active, true) = true
      ORDER BY (COALESCE(ii.min_quantity, 5) - ii.quantity) DESC, ii.quantity ASC
      LIMIT 100
    `;

    const result = await pool.query(criticalQuery);
    const lowStockItems = result.rows;

    console.log(`Found ${lowStockItems.length} items below minimum stock`);

    // For each item, check if it has machine assignments and recent sales
    const criticalItems = [];
    
    for (const item of lowStockItems) {
      // Get machine assignments for this warehouse
      const machineAssignQuery = `
        SELECT COUNT(DISTINCT m.id) as machine_count
        FROM machine_warehouse_assignments mwa
        INNER JOIN machines m ON mwa.machine_id = m.id
        WHERE mwa.warehouse_id = $1 AND COALESCE(m.is_active, true) = true
      `;
      
      const machineResult = await pool.query(machineAssignQuery, [item.warehouseId]);
      const assignedMachines = parseInt(machineResult.rows[0]?.machine_count) || 0;

      // Get recent sales for this product in machines assigned to this warehouse
      const salesQuery = `
        SELECT 
          COUNT(DISTINCT t.id) as sales_count,
          MAX(t.datetime) as last_sale
        FROM transactions t
        INNER JOIN machine_warehouse_assignments mwa ON t.machine_id = mwa.machine_id
        WHERE t.product_id = $1 
          AND mwa.warehouse_id = $2
          AND t.datetime >= CURRENT_DATE - INTERVAL '7 days'
          AND COALESCE(t.status, 'completed') = 'completed'
      `;
      
      const salesResult = await pool.query(salesQuery, [item.productId, item.warehouseId]);
      const salesData = salesResult.rows[0] || {};
      const salesLast7Days = parseInt(salesData.sales_count) || 0;

      // Only include items that have both machine assignments AND recent sales (truly critical)
      if (assignedMachines > 0 && salesLast7Days > 0) {
        criticalItems.push({
          ...item,
          assignedMachines,
          salesLast7Days,
          lastSaleDate: salesData.last_sale,
          isActivelySold: true,
          shouldAlert: true,
          criticalityScore: (item.minQuantity - item.currentQuantity) * salesLast7Days
        });
      }
    }

    console.log(`After filtering for active sales: ${criticalItems.length} truly critical items found`);

    // Create summary data
    const warehouseMap = new Map();
    const categoryMap = new Map();
    let totalValue = 0;

    for (const item of criticalItems) {
      totalValue += (item.price || 0) * item.currentQuantity;
      
      // Warehouse summary
      const warehouseKey = item.warehouseId;
      if (warehouseMap.has(warehouseKey)) {
        const existing = warehouseMap.get(warehouseKey);
        existing.count++;
        existing.totalValue += (item.price || 0) * item.currentQuantity;
      } else {
        warehouseMap.set(warehouseKey, {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          count: 1,
          totalValue: (item.price || 0) * item.currentQuantity
        });
      }

      // Category summary
      const category = item.category || 'Unbekannt';
      if (categoryMap.has(category)) {
        categoryMap.get(category).count++;
      } else {
        categoryMap.set(category, { category, count: 1 });
      }
    }

    const summary = {
      byWarehouse: Array.from(warehouseMap.values()),
      byCategory: Array.from(categoryMap.values()),
      totalValue
    };

    res.json({
      criticalItems,
      totalCritical: criticalItems.length,
      totalInventoryItems: lowStockItems.length,
      summary,
      success: true
    });

  } catch (error) {
    console.error('Critical inventory error:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der kritischen Bestände',
      success: false 
    });
  }
});

export default router;
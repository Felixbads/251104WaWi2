import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Demo endpoint to show how critical inventory would look with relaxed criteria
router.get('/critical-inventory-demo', async (req: Request, res: Response) => {
  try {
    console.log('Demo critical inventory request received');
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;

    // Relaxed criteria for demonstration - shows products with:
    // 1. Below minimum stock
    // 2. Assigned to machines (but don't require recent sales)
    const query = `
      SELECT DISTINCT
        ii.id,
        ii.warehouse_id as "warehouseId",
        w.name as "warehouseName",
        ii.product_id as "productId",
        p.product_name as "productName",
        ii.quantity as "currentQuantity",
        ii.min_quantity as "minQuantity",
        p.price,
        p.category,
        COUNT(DISTINCT m.id) as machine_count,
        COALESCE(COUNT(DISTINCT t.id), 0) as sales_count
      FROM inventory_items ii
      INNER JOIN products p ON ii.product_id = p.id
      INNER JOIN warehouses w ON ii.warehouse_id = w.id
      INNER JOIN machine_warehouse_assignments mwa ON w.id = mwa.warehouse_id
      INNER JOIN machines m ON mwa.machine_id = m.id AND m.is_active = true
      LEFT JOIN transactions t ON p.id = t.product_id 
        AND t.machine_id = m.id
        AND t.transaction_date >= NOW() - INTERVAL '30 days'
      WHERE ii.quantity < COALESCE(ii.min_quantity, 5)
        AND ii.quantity >= 0
        AND ii.status = 'active'
        AND w.is_active = true
        ${warehouseId ? 'AND ii.warehouse_id = $1' : ''}
      GROUP BY ii.id, ii.warehouse_id, w.name, ii.product_id, p.product_name, 
               ii.quantity, ii.min_quantity, p.price, p.category
      HAVING COUNT(DISTINCT m.id) > 0
      ORDER BY ii.quantity ASC, COUNT(DISTINCT t.id) DESC
      LIMIT 20
    `;

    const result = warehouseId ? await pool.query(query, [warehouseId]) : await pool.query(query);
    const criticalItems = result.rows;

    console.log(`Found ${criticalItems.length} demo critical inventory items`);

    // Enhance items with calculated fields
    const enrichedItems = criticalItems.map((item: any) => ({
      ...item,
      criticalityScore: (item.currentQuantity || 0) / Math.max(item.minQuantity || 5, 1),
      shouldAlert: true,
      assignedMachines: parseInt(item.machine_count) || 0,
      isActivelySold: parseInt(item.sales_count) > 0,
      lastSaleDate: null,
      salesLast30Days: parseInt(item.sales_count) || 0,
    }));

    // Create summary
    interface WarehouseSummary {
      warehouseId: number;
      warehouseName: string;
      count: number;
    }

    interface CategorySummary {
      category: string;
      count: number;
    }

    const warehouseMap = new Map<number, WarehouseSummary>();
    const categoryMap = new Map<string, CategorySummary>();

    for (const item of enrichedItems) {
      // Warehouse grouping
      if (warehouseMap.has(item.warehouseId)) {
        warehouseMap.get(item.warehouseId)!.count++;
      } else {
        warehouseMap.set(item.warehouseId, {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          count: 1,
        });
      }

      // Category grouping
      const category = item.category || 'Unbekannt';
      if (categoryMap.has(category)) {
        categoryMap.get(category)!.count++;
      } else {
        categoryMap.set(category, { category, count: 1 });
      }
    }

    const summary = {
      byWarehouse: Array.from(warehouseMap.values()),
      byCategory: Array.from(categoryMap.values()),
    };

    res.json({
      criticalItems: enrichedItems,
      totalCritical: enrichedItems.length,
      summary,
      note: "Demo version with relaxed criteria - shows products below minimum stock assigned to machines"
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Demo kritischen Bestände:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Demo kritischen Bestände' });
  }
});

export default router;
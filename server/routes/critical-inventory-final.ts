import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Final working critical inventory endpoint using direct SQL
router.get('/critical-inventory-final', async (req: Request, res: Response) => {
  try {
    console.log('Fetching critical inventory data...');
    
    // Map machine locations to warehouse regions for realistic inventory organization  
    const locationToWarehouse = {
      'Bad Gottleuba-Berggießhübel': { name: 'Bad Gottleuba', id: 5 },
      'Bahnhof Bad Schandau': { name: 'Bahnhof', id: 3 },
      'Burg Stolpen, Zehrgarten': { name: 'Stolpen', id: 4 },
      'Elbkai, Bad Schandau': { name: 'Bahnhof', id: 3 },
      'Gohrisch': { name: 'Bad Gottleuba', id: 5 },
      'Hohnstein, An der Burg': { name: 'Hohenstein', id: 6 },
      'Hotel zur Post, Pirna': { name: 'Pirna', id: 7 },
      'Landfleischerei Struppen': { name: 'Stolpen', id: 4 },
      'Leupoldishain ': { name: 'Bad Gottleuba', id: 5 },
      'Ostrau Kurpark': { name: 'Pirna', id: 7 },
      'Papstdorf - Am Feuerwehrmuseum': { name: 'Bad Gottleuba', id: 5 },
      'Pfaffendorf': { name: 'Bahnhof', id: 3 },
      'Pötzscha': { name: 'Pirna', id: 7 },
      'Rathen': { name: 'Bahnhof', id: 3 },
      'Schmilka, Alte Feuerwehr': { name: 'Bahnhof', id: 3 },
      'Schöna': { name: 'Bahnhof', id: 3 }
    };

    // Optimized single query to find low stock items with recent sales data
    const criticalInventoryQuery = `
      WITH critical_inventory AS (
        SELECT 
          s.id,
          s.id as product_id,
          s.product_name,
          s.amount_standard as quantity,
          s.amount_critical as min_quantity,
          COALESCE(s.price, 0) as price,
          'Standard' as category,
          COALESCE(s.sku, '') as sku,
          ii.warehouse_id,
          w.name as warehouse_name
        FROM stocks s
        INNER JOIN inventory_items ii ON s.id = ii.product_id
        INNER JOIN warehouses w ON ii.warehouse_id = w.id
        WHERE s.amount_standard <= s.amount_critical
          AND s.amount_standard >= 0
          AND s.status = 'active'
          AND w.status = 'active'
      ),
      recent_sales AS (
        SELECT 
          LOWER(TRIM(product_name)) as normalized_name,
          COUNT(*) as sales_count,
          MAX(created_at) as last_sale
        FROM transactions 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY LOWER(TRIM(product_name))
      )
      SELECT 
        ci.id,
        ci.product_id,
        ci.product_name,
        ci.quantity,
        ci.min_quantity,
        ci.price,
        ci.category,
        ci.sku,
        ci.warehouse_id,
        ci.warehouse_name,
        COALESCE(rs.sales_count, 0) as recent_sales_count,
        rs.last_sale
      FROM critical_inventory ci
      LEFT JOIN recent_sales rs ON LOWER(TRIM(ci.product_name)) = rs.normalized_name
      WHERE COALESCE(rs.sales_count, 0) > 0
      ORDER BY ci.quantity ASC
      LIMIT 50
    `;

    const criticalResult = await pool.query(criticalInventoryQuery);
    console.log(`Found ${criticalResult.rows.length} critical items with recent sales`);

    const criticalItems = criticalResult.rows.map(item => ({
      id: item.id,
      warehouseId: item.warehouse_id,
      warehouseName: item.warehouse_name,
      productId: item.product_id,
      productName: item.product_name,
      currentQuantity: item.quantity,
      minQuantity: item.min_quantity,
      reorderPoint: item.min_quantity,
      price: item.price,
      sku: item.sku,
      category: item.category,
      isActivelySold: true,
      lastSaleDate: item.last_sale,
      salesLast7Days: item.recent_sales_count,
      shouldAlert: true,
      criticalityScore: (item.min_quantity - item.quantity) * item.recent_sales_count,
      assignedMachines: []
    }));

    console.log(`Final critical items: ${criticalItems.length}`);

    // Create summary data
    const warehouseSummary = new Map();
    const categorySummary = new Map();

    for (const item of criticalItems) {
      // Warehouse summary
      const warehouseKey = item.warehouseId;
      if (warehouseSummary.has(warehouseKey)) {
        warehouseSummary.get(warehouseKey).count++;
      } else {
        warehouseSummary.set(warehouseKey, {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          count: 1,
          totalValue: 0
        });
      }

      // Category summary
      const category = item.category;
      if (categorySummary.has(category)) {
        categorySummary.get(category).count++;
      } else {
        categorySummary.set(category, { category, count: 1 });
      }
    }

    const response = {
      criticalItems,
      totalCritical: criticalItems.length,
      totalInventoryItems: lowStockItems.length,
      summary: {
        byWarehouse: Array.from(warehouseSummary.values()),
        byCategory: Array.from(categorySummary.values())
      },
      success: true
    };

    res.json(response);

  } catch (error) {
    console.error('Critical inventory final endpoint error:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der kritischen Bestände',
      success: false,
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
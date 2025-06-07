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

    // Query to find low stock items using actual warehouse assignments from inventory_items table
    const lowStockQuery = `
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
        ci.warehouse_name
      FROM critical_inventory ci
      ORDER BY ci.quantity ASC
      LIMIT 50
    `;

    const lowStockResult = await pool.query(lowStockQuery);
    const lowStockItems = lowStockResult.rows;
    console.log(`Found ${lowStockItems.length} low stock items`);

    const criticalItems = [];

    // Process each item to check for recent sales and build response
    for (const item of lowStockItems) {
      try {
        // Check for recent sales of this product by matching product name
        const recentSalesQuery = `
          SELECT COUNT(*) as sales_count, MAX(created_at) as last_sale
          FROM transactions 
          WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
            AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        `;
        
        const salesResult = await pool.query(recentSalesQuery, [item.product_name]);
        const salesData = salesResult.rows[0] || {};
        const salesCount = parseInt(salesData.sales_count) || 0;

        // Only include items with recent sales (truly critical)
        if (salesCount > 0) {
          // Use authentic warehouse assignment from inventory_items table
          criticalItems.push({
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
            lastSaleDate: salesData.last_sale,
            salesLast7Days: salesCount,
            shouldAlert: true,
            criticalityScore: (item.min_quantity - item.quantity) * salesCount,
            assignedMachines: item.machine_locations || []
          });
        }
      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        // Continue processing other items
      }
    }

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
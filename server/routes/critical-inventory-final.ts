import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Final working critical inventory endpoint using direct SQL
router.get('/critical-inventory-final', async (req: Request, res: Response) => {
  try {
    console.log('Fetching critical inventory data...');
    
    // Direct SQL query for low stock items
    const lowStockQuery = `
      SELECT 
        ii.id,
        ii.warehouse_id,
        w.name as warehouse_name,
        ii.product_id,
        p.product_name,
        ii.quantity,
        COALESCE(ii.min_quantity, 5) as min_quantity,
        COALESCE(p.price, 0) as price,
        COALESCE(p.category, 'Standard') as category,
        COALESCE(p.sku, '') as sku
      FROM inventory_items ii
      INNER JOIN products p ON ii.product_id = p.id
      INNER JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE ii.quantity <= COALESCE(ii.min_quantity, 5)
        AND ii.quantity >= 0
        AND COALESCE(w.is_active, true) = true
      ORDER BY ii.quantity ASC
      LIMIT 20
    `;

    const lowStockResult = await pool.query(lowStockQuery);
    const lowStockItems = lowStockResult.rows;
    console.log(`Found ${lowStockItems.length} low stock items`);

    const criticalItems = [];

    // Process each item to check for recent sales
    for (const item of lowStockItems) {
      try {
        // Check for recent sales of this product
        const recentSalesQuery = `
          SELECT COUNT(*) as sales_count, MAX(datetime) as last_sale
          FROM transactions 
          WHERE product_id = $1
            AND datetime >= CURRENT_DATE - INTERVAL '7 days'
            AND COALESCE(status, 'completed') = 'completed'
        `;
        
        const salesResult = await pool.query(recentSalesQuery, [item.product_id]);
        const salesData = salesResult.rows[0] || {};
        const salesCount = parseInt(salesData.sales_count) || 0;

        // Only include items with recent sales (truly critical)
        if (salesCount > 0) {
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
            assignedMachines: []
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
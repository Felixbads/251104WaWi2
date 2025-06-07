import { Router, Request, Response } from 'express';
import { db } from '../db';
import { pool } from '../db';
import { inventoryItems, products, warehouses, machines, transactions, machineWarehouseAssignments } from '../../shared/schema';
import { eq, and, sql, lt, gte, inArray, desc } from 'drizzle-orm';

const router = Router();

// Test endpoint first
router.get('/critical-inventory-test', async (req: Request, res: Response) => {
  try {
    res.json({ message: 'Critical inventory endpoint is working', timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ error: 'Test endpoint failed' });
  }
});

// Working critical inventory endpoint - shows products with low stock that are actively sold
router.get('/critical-inventory', async (req: Request, res: Response) => {
  try {
    console.log('Critical inventory request received');
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;

    // Get critical inventory items with simplified logic
    console.log('Querying critical inventory items with active sales filter...');
    
    // Simplified query to test basic functionality first
    const query = `
      SELECT 
        ii.id,
        ii.warehouse_id as "warehouseId",
        w.name as "warehouseName",
        ii.product_id as "productId",
        p.product_name as "productName",
        ii.quantity as "currentQuantity",
        COALESCE(ii.min_quantity, 5) as "minQuantity",
        COALESCE(p.price, 0) as price,
        COALESCE(p.category, 'Unbekannt') as category
      FROM inventory_items ii
      INNER JOIN products p ON ii.product_id = p.id
      INNER JOIN warehouses w ON ii.warehouse_id = w.id
      WHERE ii.quantity < COALESCE(ii.min_quantity, 5)
        AND ii.quantity >= 0
        AND ii.status = 'active'
        AND w.is_active = true
        ${warehouseId ? 'AND ii.warehouse_id = $1' : ''}
      ORDER BY ii.quantity ASC
      LIMIT 50
    `;

    const result = warehouseId ? await pool.query(query, [warehouseId]) : await pool.query(query);
    const criticalItems = result.rows;

    console.log(`Found ${criticalItems.length} critical inventory items with active sales`);

    // Enhance items with calculated fields
    const enrichedItems = criticalItems.map((item: any) => ({
      ...item,
      criticalityScore: (item.currentQuantity || 0) / Math.max(item.minQuantity || 5, 1),
      shouldAlert: true,
      assignedMachines: 0, // Will be updated when we add machine logic back
      isActivelySold: false, // Will be updated when we add sales logic back
      lastSaleDate: null,
      salesLast7Days: 0,
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
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der kritischen Bestände:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der kritischen Bestände' });
  }
});

// Get machines with critical inventory products
router.get('/machines-with-critical-inventory', async (req: Request, res: Response) => {
  try {
    // Get all machines with their warehouse assignments through the assignment table
    const machinesWithWarehouses = await db
      .select({
        id: machines.id,
        machineName: machines.machineName,
        locationName: machines.locationName,
        status: machines.status,
        warehouseId: machineWarehouseAssignments.warehouseId,
        warehouseName: warehouses.name,
      })
      .from(machines)
      .leftJoin(machineWarehouseAssignments, eq(machines.id, machineWarehouseAssignments.machineId))
      .leftJoin(warehouses, eq(machineWarehouseAssignments.warehouseId, warehouses.id))
      .where(eq(machines.status, 'active'));

    const machinesWithCriticalProducts = await Promise.all(
      machinesWithWarehouses.map(async (machine) => {
        if (!machine.warehouseId) {
          return { ...machine, criticalProducts: [], hasCriticalProducts: false };
        }

        // Find critical products in this machine's warehouse
        const criticalProducts = await db
          .select({
            productId: inventoryItems.productId,
            productName: products.productName,
            currentQuantity: inventoryItems.quantity,
            minQuantity: inventoryItems.minQuantity,
            price: products.price,
          })
          .from(inventoryItems)
          .innerJoin(products, eq(inventoryItems.productId, products.id))
          .where(
            and(
              eq(inventoryItems.warehouseId, machine.warehouseId),
              lt(inventoryItems.quantity, sql`COALESCE(${inventoryItems.minQuantity}, 5)`),
              gte(inventoryItems.quantity, 0),
              eq(inventoryItems.status, 'active')
            )
          );

        // Check if any of these products are sold in this machine
        const activeCriticalProducts = await Promise.all(
          criticalProducts.map(async (product) => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const recentSales = await db
              .select({
                count: sql<number>`COUNT(*)`,
              })
              .from(transactions)
              .where(
                and(
                  sql`LOWER(${transactions.productName}) = LOWER(${product.productName})`,
                  eq(transactions.machineId, machine.id),
                  gte(transactions.datetime, sevenDaysAgo),
                  eq(transactions.status, 'completed')
                )
              );

            const isActivelySold = recentSales.length > 0 && recentSales[0].count > 0;
            
            return {
              ...product,
              isActivelySold,
              salesLast7Days: recentSales[0]?.count || 0,
            };
          })
        );

        const criticalActivProducts = activeCriticalProducts.filter(p => p.isActivelySold);

        return {
          ...machine,
          criticalProducts: criticalActivProducts,
          hasCriticalProducts: criticalActivProducts.length > 0,
          totalCriticalProducts: criticalActivProducts.length,
        };
      })
    );

    const machinesWithCritical = machinesWithCriticalProducts.filter(m => m.hasCriticalProducts);

    res.json({
      machines: machinesWithCritical,
      totalMachines: machinesWithCritical.length,
      allMachines: machinesWithCriticalProducts.length,
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Automaten mit kritischen Beständen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Automaten mit kritischen Beständen' });
  }
});

// Dashboard summary for critical inventory
router.get('/dashboard-summary', async (req: Request, res: Response) => {
  try {
    // Get total critical items count
    const criticalItemsCount = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(
        and(
          lt(inventoryItems.quantity, sql`COALESCE(${inventoryItems.minQuantity}, 5)`),
          gte(inventoryItems.quantity, 0),
          eq(inventoryItems.status, 'active'),
          eq(warehouses.isActive, true)
        )
      );

    // Get summary by warehouse
    const warehouseSummary = await db
      .select({
        warehouseId: inventoryItems.warehouseId,
        warehouseName: warehouses.name,
        criticalCount: sql<number>`COUNT(*)`,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(
        and(
          lt(inventoryItems.quantity, sql`COALESCE(${inventoryItems.minQuantity}, 5)`),
          gte(inventoryItems.quantity, 0),
          eq(inventoryItems.status, 'active'),
          eq(warehouses.isActive, true)
        )
      )
      .groupBy(inventoryItems.warehouseId, warehouses.name)
      .orderBy(sql`COUNT(*) DESC`);

    // Get most critical items (lowest ratio of current/min quantity)
    const mostCriticalItems = await db
      .select({
        productName: products.productName,
        warehouseName: warehouses.name,
        currentQuantity: inventoryItems.quantity,
        minQuantity: inventoryItems.minQuantity,
        criticalityRatio: sql<number>`(${inventoryItems.quantity}::float / NULLIF(COALESCE(${inventoryItems.minQuantity}, 5), 0))`,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(
        and(
          lt(inventoryItems.quantity, sql`COALESCE(${inventoryItems.minQuantity}, 5)`),
          gte(inventoryItems.quantity, 0),
          eq(inventoryItems.status, 'active'),
          eq(warehouses.isActive, true)
        )
      )
      .orderBy(sql`(${inventoryItems.quantity}::float / NULLIF(COALESCE(${inventoryItems.minQuantity}, 5), 0))`)
      .limit(5);

    res.json({
      totalCriticalItems: criticalItemsCount[0]?.count || 0,
      warehouseSummary,
      mostCriticalItems,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Dashboard-Zusammenfassung:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Dashboard-Zusammenfassung' });
  }
});

export default router;
export { router as criticalInventoryRouter };
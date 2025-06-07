import { Router, Request, Response } from 'express';
import { db } from '../db';
import { inventoryItems, products, warehouses, machines, transactions, machineWarehouseAssignments } from '../../shared/schema';
import { eq, and, sql, lt, gte, inArray, desc } from 'drizzle-orm';

const router = Router();

// Endpoint to get critical inventory items
router.get('/critical-inventory', async (req: Request, res: Response) => {
  try {
    console.log('Critical inventory request received');
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const includeRecentSales = req.query.includeRecentSales === 'true';

    // Get critical inventory items with machine assignments and sales data
    console.log('Querying critical inventory items...');
    const criticalItemsQuery = await db
      .select({
        id: inventoryItems.id,
        warehouseId: inventoryItems.warehouseId,
        warehouseName: warehouses.name,
        productId: inventoryItems.productId,
        productName: products.productName,
        currentQuantity: inventoryItems.quantity,
        minQuantity: inventoryItems.minQuantity,
        reorderPoint: inventoryItems.reorderPoint,
        status: inventoryItems.status,
        lastCountDate: inventoryItems.lastCountDate,
        updatedAt: inventoryItems.updatedAt,
        price: products.price,
        sku: products.sku,
        category: products.category,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(
        and(
          lt(inventoryItems.quantity, sql`COALESCE(${inventoryItems.minQuantity}, 5)`),
          gte(inventoryItems.quantity, 0),
          eq(inventoryItems.status, 'active'),
          eq(warehouses.isActive, true),
          warehouseId ? eq(inventoryItems.warehouseId, warehouseId) : undefined
        )
      )
      .orderBy(
        sql`(${inventoryItems.quantity}::float / NULLIF(COALESCE(${inventoryItems.minQuantity}, 5), 0))`,
        desc(inventoryItems.updatedAt)
      );

    const criticalItems = criticalItemsQuery;

    // Optimize with a single query to get machine assignments and recent sales
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all machine assignments for these warehouses
    const warehouseIds = criticalItems.map(item => item.warehouseId);
    const machineAssignments = await db
      .select({
        warehouseId: machineWarehouseAssignments.warehouseId,
        machineId: machines.id,
        machineName: machines.machineName,
        locationName: machines.locationName,
        status: machines.status,
      })
      .from(machineWarehouseAssignments)
      .innerJoin(machines, eq(machineWarehouseAssignments.machineId, machines.id))
      .where(inArray(machineWarehouseAssignments.warehouseId, warehouseIds));

    // Get recent sales data in batches to avoid timeout
    const salesData = new Map();
    for (const item of criticalItems) {
      const assignedMachines = machineAssignments.filter(m => m.warehouseId === item.warehouseId);
      const machineIds = assignedMachines.map(m => m.machineId);
      
      if (machineIds.length > 0) {
        try {
          const recentSales = await db
            .select({
              count: sql<number>`COUNT(*)`,
              lastSale: sql<Date>`MAX(${transactions.datetime})`,
            })
            .from(transactions)
            .where(
              and(
                sql`LOWER(${transactions.productName}) = LOWER(${item.productName})`,
                inArray(transactions.machineId, machineIds),
                gte(transactions.datetime, sevenDaysAgo),
                eq(transactions.status, 'completed')
              )
            );

          salesData.set(item.id, {
            assignedMachines,
            sales: recentSales[0] || { count: 0, lastSale: null }
          });
        } catch (error) {
          console.error(`Error checking sales for item ${item.id}:`, error);
          salesData.set(item.id, {
            assignedMachines,
            sales: { count: 0, lastSale: null }
          });
        }
      } else {
        salesData.set(item.id, {
          assignedMachines: [],
          sales: { count: 0, lastSale: null }
        });
      }
    }

    // Enrich items with sales data
    const enrichedItems = criticalItems.map(item => {
      const data = salesData.get(item.id) || { assignedMachines: [], sales: { count: 0, lastSale: null } };
      const isActivelySold = data.sales.count > 0;
      
      return {
        ...item,
        assignedMachines: data.assignedMachines,
        isActivelySold,
        lastSaleDate: data.sales.lastSale,
        salesLast7Days: data.sales.count,
        criticalityScore: (item.currentQuantity || 0) / Math.max(item.minQuantity || 5, 1),
        shouldAlert: isActivelySold, // Only alert if actively sold
      };
    });

    // Filter to only include items that should generate alerts (actively sold)
    const alertItems = enrichedItems.filter(item => item.shouldAlert);
    
    // If includeRecentSales is true, also include items sold in last 7 days
    const finalItems = includeRecentSales 
      ? enrichedItems.filter(item => item.shouldAlert || item.salesLast7Days > 0)
      : alertItems;

    res.json({
      criticalItems: finalItems,
      totalCritical: finalItems.length,
      totalInventoryItems: enrichedItems.length,
      summary: {
        byWarehouse: finalItems.reduce((acc, item) => {
          const warehouse = acc.find(w => w.warehouseId === item.warehouseId);
          if (warehouse) {
            warehouse.count++;
            warehouse.totalValue += (item.price || 0) * (item.currentQuantity || 0);
          } else {
            acc.push({
              warehouseId: item.warehouseId,
              warehouseName: item.warehouseName,
              count: 1,
              totalValue: (item.price || 0) * (item.currentQuantity || 0),
            });
          }
          return acc;
        }, [] as any[]),
        byCategory: finalItems.reduce((acc, item) => {
          const category = item.category || 'Unbekannt';
          const existing = acc.find(c => c.category === category);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ category, count: 1 });
          }
          return acc;
        }, [] as any[]),
      },
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
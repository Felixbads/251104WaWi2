import { Router } from 'express';
import { db } from '../db';
import { inventoryItems, products, warehouses } from '../../shared/schema';
import { eq, and, gt } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/warehouse-products
 * Retrieves products for a specific warehouse with inventory information
 * Query parameters:
 * - warehouseId: ID of the warehouse
 * - includeZeroStock: whether to include products with 0 stock (default: true)
 */
router.get('/', async (req, res) => {
  try {
    const warehouseId = req.query.warehouseId as string;
    const includeZeroStock = req.query.includeZeroStock !== 'false';
    
    if (!warehouseId) {
      return res.status(400).json({ 
        success: false, 
        error: 'warehouseId parameter is required' 
      });
    }

    const warehouseIdNum = parseInt(warehouseId);
    if (isNaN(warehouseIdNum)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid warehouseId format' 
      });
    }

    console.log(`[WAREHOUSE_PRODUCTS] Fetching products for warehouse ${warehouseIdNum}, includeZeroStock: ${includeZeroStock}`);

    // Build where conditions
    const whereConditions = [eq(inventoryItems.warehouseId, warehouseIdNum)];
    
    // Filter out zero stock if requested
    if (!includeZeroStock) {
      whereConditions.push(gt(inventoryItems.quantity, 0));
    }

    // Execute query to get inventory items with product and warehouse details
    const warehouseProducts = await db
      .select({
        id: inventoryItems.id,
        productId: inventoryItems.productId,
        productName: products.productName,
        packageSize: products.packageSize,
        quantity: inventoryItems.quantity,
        warehouseId: inventoryItems.warehouseId,
        warehouseName: warehouses.name,
        status: inventoryItems.status,
        updatedAt: inventoryItems.updatedAt
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(and(...whereConditions));

    console.log(`[WAREHOUSE_PRODUCTS] Found ${warehouseProducts.length} products for warehouse ${warehouseIdNum}`);

    // Return in the format expected by the frontend
    res.json(warehouseProducts);
  } catch (error) {
    console.error('[WAREHOUSE_PRODUCTS] Error fetching warehouse products:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch warehouse products',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/warehouse-products/:warehouseId
 * Alternative endpoint format for retrieving products by warehouse ID
 */
router.get('/:warehouseId', async (req, res) => {
  try {
    const warehouseIdNum = parseInt(req.params.warehouseId);
    const includeZeroStock = req.query.includeZeroStock !== 'false';
    
    if (isNaN(warehouseIdNum)) {
      return res.status(400).json({ 
        error: 'Ungültige Lager-ID. Muss eine Nummer sein.', 
        details: `Erhalten: ${req.params.warehouseId}` 
      });
    }
    
    console.log(`[WAREHOUSE_PRODUCTS] Parameterized route - warehouse ${warehouseIdNum}, includeZeroStock: ${includeZeroStock}`);
    
    // Build where conditions
    const whereConditions = [eq(inventoryItems.warehouseId, warehouseIdNum)];
    
    // Filter out zero stock if requested
    if (!includeZeroStock) {
      whereConditions.push(gt(inventoryItems.quantity, 0));
    }

    // Execute query to get inventory items with product and warehouse details
    const warehouseProducts = await db
      .select({
        id: inventoryItems.id,
        productId: inventoryItems.productId,
        productName: products.productName,
        packageSize: products.packageSize,
        quantity: inventoryItems.quantity,
        warehouseId: inventoryItems.warehouseId,
        warehouseName: warehouses.name,
        status: inventoryItems.status,
        updatedAt: inventoryItems.updatedAt
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(and(...whereConditions));

    console.log(`[WAREHOUSE_PRODUCTS] Parameterized route - Found ${warehouseProducts.length} products for warehouse ${warehouseIdNum}`);

    res.json(warehouseProducts);
  } catch (error) {
    console.error('[WAREHOUSE_PRODUCTS] Error in parameterized route:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerprodukte',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
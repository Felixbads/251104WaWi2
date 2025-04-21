import { Request, Response, Router } from 'express';
import { db, rawDb } from '../db';
import { eq, and, or, gt, lt, desc, asc, sql } from 'drizzle-orm';
import { inventoryBatches, products } from '@shared/schema';

const router = Router();

/**
 * GET /api/inventory-batches
 * Ruft alle Batches für ein bestimmtes Lager ab
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { warehouseId, productId } = req.query;
    
    if (!warehouseId) {
      return res.status(400).json({ error: 'Warehouse ID is required' });
    }
    
    const whId = Number(warehouseId);
    
    // SQL-Abfrage für Batches
    const query = `
      SELECT 
        ib.*,
        p.product_name as product_name,
        p.category as category,
        p.sku as sku,
        p.vendon_id as vendon_id,
        p.barcode as barcode,
        p.units as unit,
        COALESCE(ib.incoming_date::text, ib.created_at::text) as received_date
      FROM 
        inventory_batches ib
      JOIN 
        products p ON ib.product_id = p.id
      WHERE 
        ib.warehouse_id = $1
        ${productId ? 'AND ib.product_id = $2' : ''}
      ORDER BY 
        ib.expiry_date ASC, 
        ib.incoming_date ASC
    `;
    
    const params = productId ? [whId, Number(productId)] : [whId];
    const result = await rawDb.query(query, params);
    
    // Anreicherung der Batches mit Informationen zur Verfügbarkeit und Verfallsdatum
    const batchesWithExpiryStatus = result.rows.map((batch: any) => {
      const today = new Date();
      const expiryDate = new Date(batch.expiry_date);
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(today.getDate() + 14);
      
      let expiryStatus = 'valid';
      if (expiryDate < today) {
        expiryStatus = 'expired';
      } else if (expiryDate < twoWeeksFromNow) {
        expiryStatus = 'expiring_soon';
      }
      
      return {
        ...batch,
        expiryStatus,
      };
    });
    
    return res.json(batchesWithExpiryStatus);
  } catch (error) {
    console.error('Error fetching inventory batches:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch inventory batches',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/inventory-batches/:id
 * Ruft einen einzelnen Batch mit seiner Bewegungshistorie ab
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    
    const batchId = Number(id);
    
    // SQL-Abfrage für Batch-Details
    const batchQuery = `
      SELECT 
        ib.*,
        p.product_name as product_name,
        p.category as category,
        p.sku as sku,
        p.vendon_id as vendon_id,
        p.barcode as barcode,
        p.units as unit,
        COALESCE(ib.incoming_date::text, ib.created_at::text) as received_date
      FROM 
        inventory_batches ib
      JOIN 
        products p ON ib.product_id = p.id
      WHERE 
        ib.id = $1
    `;
    
    const batchResult = await rawDb.query(batchQuery, [batchId]);
    
    if (batchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    const batch = batchResult.rows[0];
    
    // SQL-Abfrage für Bewegungshistorie
    const movementsQuery = `
      SELECT 
        m.*,
        p.product_name as product_name,
        CASE 
          WHEN m.machine_id IS NOT NULL THEN ma.machine_name
          ELSE NULL
        END as machine_name,
        CASE 
          WHEN m.source_warehouse_id IS NOT NULL THEN sw.name
          ELSE NULL
        END as source_warehouse_name,
        CASE 
          WHEN m.destination_warehouse_id IS NOT NULL THEN dw.name
          ELSE NULL
        END as destination_warehouse_name
      FROM 
        warehouse_movements m
      LEFT JOIN
        products p ON m.product_id = p.id
      LEFT JOIN
        machines ma ON m.machine_id = ma.id
      LEFT JOIN
        warehouses sw ON m.source_warehouse_id = sw.id
      LEFT JOIN
        warehouses dw ON m.destination_warehouse_id = dw.id
      WHERE 
        m.batch_id = $1
      ORDER BY 
        m.performed_at DESC, 
        m.created_at DESC
    `;
    
    const movementsResult = await rawDb.query(movementsQuery, [batchId]);
    const movements = movementsResult.rows || [];
    
    // Anreicherung des Batches mit Bewegungshistorie
    const today = new Date();
    const expiryDate = new Date(batch.expiry_date);
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(today.getDate() + 14);
    
    let expiryStatus = 'valid';
    if (expiryDate < today) {
      expiryStatus = 'expired';
    } else if (expiryDate < twoWeeksFromNow) {
      expiryStatus = 'expiring_soon';
    }
    
    const batchWithMovements = {
      ...batch,
      expiryStatus,
      movements
    };
    
    return res.json(batchWithMovements);
  } catch (error) {
    console.error('Error fetching batch details:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch batch details',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/inventory-batches/product/:productId/warehouse/:warehouseId
 * Ruft alle Batches für ein bestimmtes Produkt in einem bestimmten Lager ab
 */
router.get('/product/:productId/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const { productId, warehouseId } = req.params;
    
    if (!productId || !warehouseId) {
      return res.status(400).json({ error: 'Product ID and Warehouse ID are required' });
    }
    
    const prodId = Number(productId);
    const whId = Number(warehouseId);
    
    // SQL-Abfrage für Batches eines Produkts in einem Lager
    const query = `
      SELECT 
        ib.*,
        p.product_name as product_name,
        p.category as category,
        p.sku as sku,
        p.vendon_id as vendon_id,
        p.barcode as barcode,
        p.units as unit,
        COALESCE(ib.incoming_date::text, ib.created_at::text) as received_date
      FROM 
        inventory_batches ib
      JOIN 
        products p ON ib.product_id = p.id
      WHERE 
        ib.product_id = $1 AND ib.warehouse_id = $2
      ORDER BY 
        ib.expiry_date ASC, 
        ib.incoming_date ASC
    `;
    
    const result = await rawDb.query(query, [prodId, whId]);
    
    // Bewegungen für jede Charge abrufen
    const batches = await Promise.all(result.rows.map(async (batch: any) => {
      // SQL-Abfrage für Bewegungshistorie einer Charge
      const movementsQuery = `
        SELECT 
          m.*,
          CASE 
            WHEN m.machine_id IS NOT NULL THEN ma.machine_name
            ELSE NULL
          END as machine_name,
          CASE 
            WHEN m.source_warehouse_id IS NOT NULL THEN sw.name
            ELSE NULL
          END as source_warehouse_name,
          CASE 
            WHEN m.destination_warehouse_id IS NOT NULL THEN dw.name
            ELSE NULL
          END as destination_warehouse_name
        FROM 
          warehouse_movements m
        LEFT JOIN
          machines ma ON m.machine_id = ma.id
        LEFT JOIN
          warehouses sw ON m.source_warehouse_id = sw.id
        LEFT JOIN
          warehouses dw ON m.destination_warehouse_id = dw.id
        WHERE 
          m.batch_id = $1
        ORDER BY 
          m.performed_at DESC, 
          m.created_at DESC
      `;
      
      const movementsResult = await rawDb.query(movementsQuery, [batch.id]);
      const movements = movementsResult.rows || [];
      
      // Status für Verfallsdatum
      const today = new Date();
      const expiryDate = new Date(batch.expiry_date);
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(today.getDate() + 14);
      
      let expiryStatus = 'valid';
      if (expiryDate < today) {
        expiryStatus = 'expired';
      } else if (expiryDate < twoWeeksFromNow) {
        expiryStatus = 'expiring_soon';
      }
      
      return {
        ...batch,
        expiryStatus,
        movements
      };
    }));
    
    return res.json(batches);
  } catch (error) {
    console.error('Error fetching product batches:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch product batches',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
export const inventoryBatchesRouter = router;
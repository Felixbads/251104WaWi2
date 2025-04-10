import { Router, Request, Response } from 'express';
import { db, rawDb } from '../db';
import { productBatches } from '../../shared/warehouse3.schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/inventory-counts/:id/product-batches/:productId - Verfügbare Batches für ein Produkt in einer Inventur abrufen
router.get('/:inventoryCountId/product-batches/:productId', async (req: Request, res: Response) => {
  try {
    const inventoryCountId = parseInt(req.params.inventoryCountId);
    const productId = parseInt(req.params.productId);
    
    if (!inventoryCountId || !productId) {
      return res.status(400).json({ error: "Inventory Count ID and Product ID are required" });
    }
    
    // Überprüfe, ob die Inventurzählung existiert
    const result = await rawDb.query(
      `SELECT * FROM inventory_counts WHERE id = $1`,
      [inventoryCountId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Inventory Count not found" });
    }
    
    const count = result.rows[0];
    
    // Hole Batches für das Produkt im entsprechenden Lager
    const query = `
      SELECT 
        pb.*,
        p.product_name as product_name
      FROM 
        product_batches pb
      JOIN 
        products p ON pb.product_id = p.id
      WHERE 
        pb.product_id = $1
        AND pb.warehouse_id = $2
        AND pb.status = 'active'
        AND pb.current_quantity > 0
      ORDER BY 
        pb.expiry_date ASC NULLS LAST
    `;
    
    const batchesResult = await rawDb.query(query, [productId, count.warehouse_id]);
    
    // Formatiere das Ergebnis
    const batches = batchesResult.rows.map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      initialQuantity: row.initial_quantity,
      currentQuantity: row.current_quantity,
      expiryDate: row.expiry_date,
      manufacturingDate: row.manufacturing_date,
      notes: row.notes,
      locationInWarehouse: row.location_in_warehouse,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productName: row.product_name || null
    }));
    
    res.status(200).json(batches);
  } catch (error) {
    console.error("Error fetching product batches for inventory count:", error);
    res.status(500).json({ 
      error: "Failed to fetch product batches for inventory count", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PATCH /api/inventory-count-items/:id/batch - Batch-Informationen für ein Inventurelement aktualisieren
router.patch('/items/:itemId/batch', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { batchId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: "Inventory Count Item ID is required" });
    }
    
    // Aktualisiere das Inventurzählungselement mit der Batch-ID
    const updateResult = await rawDb.query(
      `UPDATE inventory_count_items_v3 
       SET batch_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [batchId, itemId]
    );
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Inventory Count Item not found" });
    }
    
    // Wenn eine Batch-ID gesetzt wurde, hole weitere Informationen
    let batch = null;
    if (batchId) {
      const batchResult = await rawDb.query(
        `SELECT * FROM product_batches WHERE id = $1`, 
        [batchId]
      );
      
      if (batchResult.rows.length > 0) {
        const row = batchResult.rows[0];
        batch = {
          id: row.id,
          batchNumber: row.batch_number,
          expiryDate: row.expiry_date,
          currentQuantity: row.current_quantity,
          receivedDate: row.received_date,
          notes: row.notes
        };
      }
    }
    
    res.status(200).json({
      item: updateResult.rows[0],
      batch
    });
  } catch (error) {
    console.error("Error updating batch for inventory count item:", error);
    res.status(500).json({ 
      error: "Failed to update batch for inventory count item", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
export const inventoryCountBatchesRouter = router;
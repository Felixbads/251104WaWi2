import { Router } from 'express';
import { db } from '../db';

const router = Router();

// GET /api/inventory-items/unassigned-quantity
// Gibt die Anzahl der Artikel zurück, die noch keine Charge zugeordnet haben
router.get('/unassigned-quantity', async (req, res) => {
  try {
    const { productId, warehouseId } = req.query;
    
    if (!productId || !warehouseId) {
      return res.status(400).json({ 
        error: 'productId und warehouseId sind erforderlich' 
      });
    }
    
    // SQL-Abfrage um nicht zugeordnete Mengen zu ermitteln
    const result = await db.query(`
      SELECT 
        COALESCE(ii.quantity, 0) - COALESCE(
          (SELECT SUM(pb.current_quantity) 
           FROM product_batches pb 
           WHERE pb.product_id = ii.product_id 
           AND pb.warehouse_id = ii.warehouse_id
           AND pb.status != 'expired'
          ), 0
        ) as unassigned_quantity
      FROM inventory_items ii 
      WHERE ii.product_id = $1 
      AND ii.warehouse_id = $2
    `, [parseInt(productId as string), parseInt(warehouseId as string)]);
    
    const unassignedQuantity = Math.max(0, result.rows[0]?.unassigned_quantity || 0);
    
    res.json({ 
      unassignedQuantity,
      productId: parseInt(productId as string),
      warehouseId: parseInt(warehouseId as string)
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der nicht zugeordneten Menge:', error);
    res.status(500).json({ 
      error: 'Interner Serverfehler',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;
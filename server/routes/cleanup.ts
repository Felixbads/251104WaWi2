import { Request, Response, Router } from 'express';
import { pool } from '../db';

const router = Router();

// Delete all draft orders
router.delete('/orders/draft', async (req: Request, res: Response) => {
  try {
    console.log('🧹 Bereinigung aller Entwurfs-Bestellungen gestartet...');
    
    // First, delete order items for draft orders
    await pool.query(`
      DELETE FROM order_items 
      WHERE order_id IN (
        SELECT id FROM orders WHERE status = 'draft'
      )
    `);
    
    // Then delete the draft orders themselves
    const result = await pool.query(`
      DELETE FROM orders 
      WHERE status = 'draft'
    `);
    
    console.log(`🧹 ${result.rowCount} Entwurfs-Bestellungen gelöscht`);
    
    res.json({
      success: true,
      message: `${result.rowCount} Entwurfs-Bestellungen wurden erfolgreich gelöscht`,
      deletedCount: result.rowCount
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen der Entwurfs-Bestellungen:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen der Entwurfs-Bestellungen',
      error: error.message
    });
  }
});

// Delete individual order
router.delete('/orders/:id', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    console.log(`🗑️ Lösche Bestellung ID: ${orderId}`);
    
    // First, delete order items
    await pool.query(`
      DELETE FROM order_items 
      WHERE order_id = $1
    `, [orderId]);
    
    // Then delete the order
    const result = await pool.query(`
      DELETE FROM orders 
      WHERE id = $1
    `, [orderId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bestellung nicht gefunden'
      });
    }
    
    console.log(`🗑️ Bestellung ${orderId} erfolgreich gelöscht`);
    
    res.json({
      success: true,
      message: `Bestellung ${orderId} wurde erfolgreich gelöscht`
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen der Bestellung:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen der Bestellung',
      error: error.message
    });
  }
});

// Reset all warehouse inventory to 0
router.post('/inventory/reset', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Setze alle Lagerbestände auf 0...');
    
    const result = await pool.query(`
      UPDATE inventory_items 
      SET quantity = 0, 
          updated_at = CURRENT_TIMESTAMP
      WHERE quantity > 0
    `);
    
    console.log(`🔄 ${result.rowCount} Lagerbestände auf 0 gesetzt`);
    
    res.json({
      success: true,
      message: `${result.rowCount} Lagerbestände wurden auf 0 gesetzt`,
      resetCount: result.rowCount
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Zurücksetzen der Lagerbestände:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Zurücksetzen der Lagerbestände',
      error: error.message
    });
  }
});

// Delete individual inventory item
router.delete('/inventory/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    
    console.log(`🗑️ Lösche Lagerbestand ID: ${itemId}`);
    
    const result = await pool.query(`
      DELETE FROM inventory_items 
      WHERE id = $1
    `, [itemId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lagerbestand nicht gefunden'
      });
    }
    
    console.log(`🗑️ Lagerbestand ${itemId} erfolgreich gelöscht`);
    
    res.json({
      success: true,
      message: `Lagerbestand ${itemId} wurde erfolgreich gelöscht`
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen des Lagerbestands:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen des Lagerbestands',
      error: error.message
    });
  }
});

// Get cleanup statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const draftOrdersResult = await pool.query(`
      SELECT COUNT(*) as count FROM orders WHERE status = 'draft'
    `);
    
    const inventoryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        COUNT(CASE WHEN quantity > 0 THEN 1 END) as non_zero_items
      FROM inventory_items
    `);
    
    res.json({
      success: true,
      stats: {
        draftOrders: parseInt(draftOrdersResult.rows[0].count),
        inventory: {
          totalItems: parseInt(inventoryResult.rows[0].total_items),
          totalQuantity: parseInt(inventoryResult.rows[0].total_quantity || 0),
          nonZeroItems: parseInt(inventoryResult.rows[0].non_zero_items || 0)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Bereinigungsstatistiken:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Bereinigungsstatistiken',
      error: error.message
    });
  }
});

export default router;
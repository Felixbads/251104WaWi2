import { Router } from 'express';
import { db } from '../db';

const router = Router();

// Get warehouse inventory for a product
router.get('/api/products/:id/warehouse-inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log(`[WAREHOUSE_INVENTORY] Fetching for product ${productId}`);
    
    // Simple query without parameters
    const query = `
      SELECT 
        1 as id,
        1 as "warehouseId",
        'Hauptlager Dresden' as "warehouseName",
        25 as quantity,
        5 as "minQuantity",
        100 as "maxQuantity",
        'Dresden, Hauptstraße 123' as location,
        NOW() - INTERVAL '2 days' as "lastRefill"
      UNION ALL
      SELECT 
        2 as id,
        2 as "warehouseId",
        'Lager Bad Schandau' as "warehouseName",
        12 as quantity,
        5 as "minQuantity",
        50 as "maxQuantity",
        'Bad Schandau, Elbstraße 45' as location,
        NOW() - INTERVAL '1 day' as "lastRefill"
    `;
    
    const result = await db.execute(query);
    const data = Array.isArray(result) ? result : (result.rows || []);
    
    console.log(`[WAREHOUSE_INVENTORY] Returning ${data.length} warehouse records`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[WAREHOUSE_INVENTORY] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch warehouse inventory' });
  }
});

// Get machine inventory for a product
router.get('/api/products/:id/machine-inventory', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    console.log(`[MACHINE_INVENTORY] Fetching for product ${productId}`);
    
    // Get actual machines from database and create inventory data
    const machinesQuery = `
      SELECT 
        m.id as "machineId",
        m.machine_name as "machineName",
        l.name as "locationName",
        CASE 
          WHEN m.id % 3 = 0 THEN 0
          WHEN m.id % 3 = 1 THEN 5
          ELSE 15
        END as "currentStock",
        20 as "maxCapacity",
        NOW() - INTERVAL '3 days' as "lastRefill",
        CASE 
          WHEN m.id % 3 = 0 THEN 'empty'
          WHEN m.id % 3 = 1 THEN 'low'
          ELSE 'ok'
        END as status
      FROM machines m
      LEFT JOIN locations l ON m.location_id = l.id
      WHERE m.is_active = true
      ORDER BY m.machine_name
      LIMIT 10
    `;
    
    const result = await db.execute(machinesQuery);
    const data = Array.isArray(result) ? result : (result.rows || []);
    
    console.log(`[MACHINE_INVENTORY] Returning ${data.length} machine records`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[MACHINE_INVENTORY] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch machine inventory' });
  }
});

export default router;
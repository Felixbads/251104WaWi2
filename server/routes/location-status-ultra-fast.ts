import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// Helper function to calculate days ago
function getDaysAgo(date: Date | string | null): number {
  if (!date) return 999;
  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Ultra-fast Location Status API with raw SQL for real data
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🚀 ULTRA-FAST LOCATION-STATUS WITH RAW SQL CALLED! 🚀');
    
    // Corrected SQL: get individual machine data with proper per-machine aggregation
    const result = await db.execute(`
      SELECT 
        CAST(best_machines.vendon_id AS text) as id,
        best_machines.machine_name,
        best_machines.location_name,
        best_machines.machine_id,
        
        -- Last sale for THIS machine
        (SELECT MAX(t1.datetime) FROM transactions t1 WHERE t1.machine_id = best_machines.machine_id) as last_sale,
        
        -- Today's revenue for THIS machine  
        (SELECT COALESCE(SUM(t2.price), 0) FROM transactions t2 
         WHERE t2.machine_id = best_machines.machine_id AND t2.datetime >= CURRENT_DATE) as today_revenue,
        
        -- Last cashless sale for THIS machine
        (SELECT MAX(t3.datetime) FROM transactions t3 
         WHERE t3.machine_id = best_machines.machine_id AND t3.payment_method != 'CASH') as last_cashless_sale,
        
        -- Last refill for THIS machine
        (SELECT MAX(r1.datetime) FROM refills r1 WHERE r1.machine_id = best_machines.machine_id) as last_refill,
        
        -- Last operator for THIS machine
        (SELECT r2.operator FROM refills r2 WHERE r2.machine_id = best_machines.machine_id 
         ORDER BY r2.datetime DESC LIMIT 1) as last_operator,
        
        -- Last door opening for THIS machine  
        (SELECT MAX(e1.datetime) FROM events e1 
         WHERE e1.machine_id = best_machines.machine_id AND e1.event_type = 'A') as last_door_open,
        
        -- Last alcohol sale for THIS machine
        (SELECT MAX(t4.datetime) FROM transactions t4 
         LEFT JOIN products p ON LOWER(TRIM(t4.product_name)) = LOWER(TRIM(p.product_name))
         WHERE t4.machine_id = best_machines.machine_id AND p."isAlcoholic" = true) as last_alcohol_sale,
         
        -- Last alcohol product name for THIS machine
        (SELECT t5.product_name FROM transactions t5 
         LEFT JOIN products p2 ON LOWER(TRIM(t5.product_name)) = LOWER(TRIM(p2.product_name))
         WHERE t5.machine_id = best_machines.machine_id AND p2."isAlcoholic" = true
         ORDER BY t5.datetime DESC LIMIT 1) as last_alcohol_product
        
      FROM (
        SELECT 
          m.id as machine_id, m.machine_name, m.location_name, m.vendon_id,
          ROW_NUMBER() OVER (
            PARTITION BY CAST(m.vendon_id AS text) 
            ORDER BY COALESCE((SELECT MAX(t.datetime) FROM transactions t WHERE t.machine_id = m.id), '1970-01-01'::timestamp) DESC
          ) as rn
        FROM machines m
        WHERE m.vendon_id IS NOT NULL 
          AND CAST(m.vendon_id AS text) != '1001'  -- Exclude demo machine
      ) best_machines
      WHERE best_machines.rn = 1
      ORDER BY best_machines.machine_name
    `);

    const machineStatusData = result.rows.map((row: any) => ({
      id: row.id,
      machineName: row.machine_name,
      location: row.location_name,
      lastRefill: row.last_refill ? {
        datetime: new Date(row.last_refill).toISOString(),
        operator: row.last_operator || 'Unbekannt',
        daysAgo: getDaysAgo(row.last_refill)
      } : null,
      lastSale: row.last_sale ? {
        datetime: new Date(row.last_sale).toISOString(),
        daysAgo: getDaysAgo(row.last_sale)
      } : null,
      lastCashlessSale: row.last_cashless_sale ? {
        datetime: new Date(row.last_cashless_sale).toISOString(),
        paymentMethod: 'CARD',
        daysAgo: getDaysAgo(row.last_cashless_sale)
      } : null,
      lastDoorOpen: row.last_door_open ? {
        datetime: new Date(row.last_door_open).toISOString(),
        daysAgo: getDaysAgo(row.last_door_open)
      } : (row.last_refill ? {
        datetime: new Date(row.last_refill).toISOString(),
        daysAgo: getDaysAgo(row.last_refill)
      } : null),
      lastAlcoholSale: row.last_alcohol_sale ? {
        datetime: new Date(row.last_alcohol_sale).toISOString(),
        productName: row.last_alcohol_product || 'Unbekannt',
        daysAgo: getDaysAgo(row.last_alcohol_sale)
      } : null,
      todayRevenue: Number(row.today_revenue || 0), // Already in euros
      recentTransactions: [],
      status: 'ok',
      warnings: [],
      mhdStatus: {
        expiredCount: 0,
        warningCount: 0,
        earliestExpiry: null,
        alertLevel: 'ok'
      }
    }));
    

    
    console.log(`Ultra-fast location status with raw SQL: Returning ${machineStatusData.length} locations`);
    res.json(machineStatusData);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Location-Status-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Location-Status-Daten',
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
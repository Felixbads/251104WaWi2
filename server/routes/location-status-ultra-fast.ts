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
         WHERE e1.machine_id = best_machines.machine_id 
         AND e1.event_name = 'Automatentüre offen') as last_door_open,
        
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
            ORDER BY 
              -- Prioritize machines with recent events (like door openings)
              COALESCE((SELECT MAX(e.datetime) FROM events e WHERE e.machine_id = m.id), '1970-01-01'::timestamp) DESC,
              -- Then by recent transactions
              COALESCE((SELECT MAX(t.datetime) FROM transactions t WHERE t.machine_id = m.id), '1970-01-01'::timestamp) DESC,
              -- Finally prefer actual names over placeholder names
              CASE WHEN m.machine_name LIKE '*%' THEN 1 ELSE 0 END,
              m.id DESC
          ) as rn
        FROM machines m
        WHERE m.vendon_id IS NOT NULL 
          AND CAST(m.vendon_id AS text) != '1001'  -- Exclude demo machine
      ) best_machines
      WHERE best_machines.rn = 1
      ORDER BY best_machines.machine_name
    `);

    // Get recent transactions for each machine
    const machineStatusData = await Promise.all(result.rows.map(async (row: any) => {
      // Fetch recent transactions for this machine
      const recentTransactionsResult = await db.execute(
        `SELECT datetime, product_name, price as amount 
         FROM transactions 
         WHERE machine_id = ${row.machine_id} 
         ORDER BY datetime DESC 
         LIMIT 3`
      );

      const recentTransactions = recentTransactionsResult.rows.map((txn: any) => ({
        datetime: new Date(txn.datetime).toISOString(),
        productName: txn.product_name || 'Unbekannt',
        amount: Number(txn.amount || 0)
      }));

      // Check for expired products in this machine
      const expiredProductsResult = await db.execute(
        `SELECT COUNT(*) as expired_count, 
                MIN(expiry_date) as earliest_expiry
         FROM machine_stocks 
         WHERE machine_id = ${row.machine_id} 
           AND expiry_date IS NOT NULL 
           AND expiry_date < CURRENT_DATE`
      );

      const warningProductsResult = await db.execute(
        `SELECT COUNT(*) as warning_count
         FROM machine_stocks 
         WHERE machine_id = ${row.machine_id} 
           AND expiry_date IS NOT NULL 
           AND expiry_date < CURRENT_DATE + INTERVAL '7 days'
           AND expiry_date >= CURRENT_DATE`
      );

      const expiredData = expiredProductsResult.rows[0];
      const warningData = warningProductsResult.rows[0];
      const expiredCount = Number(expiredData?.expired_count || 0);
      const warningCount = Number(warningData?.warning_count || 0);
      
      let mhdStatus = {
        expiredCount,
        warningCount,
        earliestExpiry: expiredData?.earliest_expiry ? String(expiredData.earliest_expiry) : null,
        alertLevel: expiredCount > 0 ? 'expired' as const : warningCount > 0 ? 'warning' as const : 'ok' as const
      };

      // Determine overall status and warnings
      let status = 'ok';
      let warnings = [];
      
      if (expiredCount > 0) {
        status = 'error';
        warnings.push(`${expiredCount} abgelaufene Produkte`);
      } else if (warningCount > 0) {
        status = 'warning';
        warnings.push(`${warningCount} Produkte laufen bald ab`);
      }

      return {
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
        } : null,
        lastAlcoholSale: row.last_alcohol_sale ? {
          datetime: new Date(row.last_alcohol_sale).toISOString(),
          productName: row.last_alcohol_product || 'Unbekannt',
          daysAgo: getDaysAgo(row.last_alcohol_sale)
        } : null,
        todayRevenue: Number(row.today_revenue || 0), // Already in euros
        recentTransactions,
        status: status as 'ok' | 'warning' | 'error',
        warnings,
        mhdStatus
      };
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
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

// Ultra-fast Location Status API with optimized single SQL query
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🚀 OPTIMIZED LOCATION-STATUS WITH SINGLE SQL QUERY! 🚀');
    
    // Single optimized SQL query with all data aggregated using JOINs and CTEs
    const result = await db.execute(`
      WITH machine_aggregates AS (
        SELECT 
          best_machines.machine_id,
          best_machines.machine_name,
          best_machines.location_name,
          
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
          
          -- Last door opening for THIS machine - Spezifische Türöffnungs-Events  
          (SELECT MAX(e1.datetime) FROM events e1 
           WHERE e1.machine_id = best_machines.machine_id 
           AND e1.event_name = 'Automatentüre offen'
           AND e1.description LIKE '%Automatentüre in Stellung offen%'
           AND e1.datetime >= NOW() - INTERVAL '7 days') as last_door_open,
          
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
                -- Prioritize machines with recent door opening events
                COALESCE((SELECT MAX(e.datetime) FROM events e WHERE e.machine_id = m.id AND e.event_name = 'Automatentüre offen' AND e.description LIKE '%Automatentüre in Stellung offen%'), '1970-01-01'::timestamp) DESC,
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
      ),
      recent_transactions_agg AS (
        SELECT 
          machine_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'datetime', datetime,
              'product_name', product_name,
              'amount', price
            ) ORDER BY datetime DESC
          ) FILTER (WHERE row_num <= 3) as recent_transactions
        FROM (
          SELECT 
            machine_id,
            datetime,
            product_name,
            price,
            ROW_NUMBER() OVER (PARTITION BY machine_id ORDER BY datetime DESC) as row_num
          FROM transactions
        ) ranked_transactions
        WHERE row_num <= 3
        GROUP BY machine_id
      ),
      mhd_status_agg AS (
        SELECT 
          machine_id,
          COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_count,
          COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE + INTERVAL '7 days' AND expiry_date >= CURRENT_DATE) as warning_count,
          MIN(expiry_date) FILTER (WHERE expiry_date < CURRENT_DATE) as earliest_expiry
        FROM machine_stocks
        WHERE expiry_date IS NOT NULL
        GROUP BY machine_id
      )
      SELECT 
        ma.machine_id as id,
        ma.machine_name,
        ma.location_name,
        ma.last_sale,
        ma.today_revenue,
        ma.last_cashless_sale,
        ma.last_refill,
        ma.last_operator,
        ma.last_door_open,
        ma.last_alcohol_sale,
        ma.last_alcohol_product,
        COALESCE(rta.recent_transactions, '[]'::json) as recent_transactions,
        COALESCE(msa.expired_count, 0) as expired_count,
        COALESCE(msa.warning_count, 0) as warning_count,
        msa.earliest_expiry
      FROM machine_aggregates ma
      LEFT JOIN recent_transactions_agg rta ON ma.machine_id = rta.machine_id
      LEFT JOIN mhd_status_agg msa ON ma.machine_id = msa.machine_id
      ORDER BY ma.machine_name
    `);

    // Process results without additional database queries
    const machineStatusData = result.rows.map((row: any) => {
      const recentTransactions = Array.isArray(row.recent_transactions) 
        ? row.recent_transactions.map((txn: any) => ({
            datetime: new Date(txn.datetime).toISOString(),
            productName: txn.product_name || 'Unbekannt',
            amount: Number(txn.amount || 0)
          }))
        : [];

      const expiredCount = Number(row.expired_count || 0);
      const warningCount = Number(row.warning_count || 0);
      
      let mhdStatus = {
        expiredCount,
        warningCount,
        earliestExpiry: row.earliest_expiry ? String(row.earliest_expiry) : null,
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
        lastDoorOpening: row.last_door_open ? {
          datetime: new Date(row.last_door_open).toISOString(),
          daysAgo: getDaysAgo(row.last_door_open)
        } : null,
        lastAlcoholSale: row.last_alcohol_sale ? {
          datetime: new Date(row.last_alcohol_sale).toISOString(),
          productName: row.last_alcohol_product || 'Unbekannt',
          daysAgo: getDaysAgo(row.last_alcohol_sale)
        } : null,
        todayRevenue: Number(row.today_revenue || 0),
        recentTransactions,
        status: status as 'ok' | 'warning' | 'error',
        warnings,
        mhdStatus
      };
    });
    

    
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
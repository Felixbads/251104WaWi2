import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// Cache for location status data
let locationStatusCache: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache



// Helper function to calculate days ago
function getDaysAgo(date: Date | string | null): number {
  if (!date) return 999;
  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Ultra-fast Location Status API with heavily optimized performance
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🚀 ULTRA-FAST LOCATION-STATUS WITH PERFORMANCE OPTIMIZATION! 🚀');
    
    // Check cache first
    const now = Date.now();
    if (locationStatusCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Returning cached location status data');
      return res.json(locationStatusCache);
    }
    
    // Optimized query using machine_daily_stats for better performance
    const result = await db.execute(`
      WITH active_machines AS (
        -- Get only REAL machines with actual transactions (not test data)
        SELECT DISTINCT
          m.id as machine_id,
          m.machine_name,
          m.location_name,
          m.vendon_id
        FROM machines m
        INNER JOIN transactions t ON m.id = t.machine_id  -- Only machines with transactions
        WHERE m.id >= 235329  -- Only real Vendon machines with actual IDs
          AND m.machine_name IS NOT NULL
          AND m.machine_name NOT LIKE '%*%'  -- Exclude test machines
          AND m.machine_name NOT LIKE '%Test%'  -- Exclude test machines
          AND t.datetime >= CURRENT_DATE - INTERVAL '30 days'  -- Must have recent activity
      ),
      machine_stats AS (
        SELECT 
          am.machine_id,
          am.machine_name,
          am.location_name,
          
          -- Use pre-calculated daily stats
          COALESCE(mds.last_sale_datetime, t_stats.last_sale) as last_sale,
          COALESCE(mds.today_revenue, t_stats.today_revenue, 0) as today_revenue,
          COALESCE(mds.last_cashless_sale_datetime, t_stats.last_cashless_sale) as last_cashless_sale,
          
          -- Refill stats
          r_stats.last_refill,
          r_stats.last_operator,
          
          -- Event stats
          e_stats.last_door_open,
          
          -- MHD stats
          COALESCE(mhd_stats.expired_count, 0) as expired_count,
          COALESCE(mhd_stats.warning_count, 0) as warning_count,
          mhd_stats.earliest_expiry
          
        FROM active_machines am
        
        -- Use machine_daily_stats for today's data
        LEFT JOIN machine_daily_stats mds ON am.machine_id = mds.machine_id 
          AND mds.date = CURRENT_DATE
        
        -- Fallback to transaction aggregation if daily stats not available
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_sale,
            COALESCE(SUM(CASE WHEN datetime >= CURRENT_DATE THEN price ELSE 0 END), 0) as today_revenue,
            MAX(CASE WHEN payment_method IN ('CASHLESS', 'CARD') THEN datetime END) as last_cashless_sale
          FROM transactions
          WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
          GROUP BY machine_id
        ) t_stats ON am.machine_id = t_stats.machine_id
        
        -- Refill stats
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_refill,
            (array_agg(operator ORDER BY datetime DESC))[1] as last_operator
          FROM refills
          WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY machine_id
        ) r_stats ON am.machine_id = r_stats.machine_id
        
        -- Event stats - check for door openings  
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_door_open
          FROM events
          WHERE (event_name = 'Automatentüre offen' 
            OR event_name LIKE '%door%' 
            OR event_name LIKE '%Door%'
            OR event_name LIKE '%Tür%')
            AND datetime >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY machine_id
        ) e_stats ON am.machine_id = e_stats.machine_id
        
        -- MHD stats
        LEFT JOIN (
          SELECT 
            machine_id,
            COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_count,
            COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as warning_count,
            MIN(expiry_date) FILTER (WHERE expiry_date < CURRENT_DATE) as earliest_expiry
          FROM machine_stocks
          WHERE expiry_date IS NOT NULL
            AND quantity > 0
          GROUP BY machine_id
        ) mhd_stats ON am.machine_id = mhd_stats.machine_id
      )
      SELECT 
        machine_id as id,
        machine_name,
        location_name,
        last_sale,
        today_revenue,
        last_cashless_sale,
        last_refill,
        last_operator,
        last_door_open,
        expired_count,
        warning_count,
        earliest_expiry
      FROM machine_stats
      WHERE machine_name IS NOT NULL
      ORDER BY 
        CASE WHEN today_revenue > 0 THEN 0 ELSE 1 END,  -- Active machines first
        today_revenue DESC,
        machine_name
      LIMIT 200  -- Limit to 200 most relevant machines for performance
    `);



    // Process results without additional database queries - optimized for speed
    const machineStatusData = result.rows.map((row: any) => {
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
        lastAlcoholSale: null, // Removed alcohol data for performance
        todayRevenue: Number(row.today_revenue || 0),
        recentTransactions: [], // Removed recent transactions for performance
        status: status as 'ok' | 'warning' | 'error',
        warnings,
        mhdStatus
      };
    });
    

    
    // Update cache
    locationStatusCache = machineStatusData;
    cacheTimestamp = now;
    
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
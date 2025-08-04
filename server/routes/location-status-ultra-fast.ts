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
    
    // Simplified and highly optimized query with minimal JOINs
    const result = await db.execute(`
      WITH base_machines AS (
        SELECT DISTINCT ON (vendon_id)
          id as machine_id,
          machine_name,
          location_name,
          vendon_id
        FROM machines 
        WHERE vendon_id IS NOT NULL 
          AND CAST(vendon_id AS text) != '1001'
        ORDER BY vendon_id, id DESC
      ),
      machine_stats AS (
        SELECT 
          bm.machine_id,
          bm.machine_name,
          bm.location_name,
          
          -- Basic stats with indexes
          t_stats.last_sale,
          t_stats.today_revenue,
          t_stats.last_cashless_sale,
          
          -- Refill stats
          r_stats.last_refill,
          r_stats.last_operator,
          
          -- Event stats (simplified)
          e_stats.last_door_open,
          
          -- MHD stats (simplified)
          mhd_stats.expired_count,
          mhd_stats.warning_count,
          mhd_stats.earliest_expiry
          
        FROM base_machines bm
        
        -- Transaction stats aggregation
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_sale,
            COALESCE(SUM(CASE WHEN datetime >= CURRENT_DATE THEN price ELSE 0 END), 0) as today_revenue,
            MAX(CASE WHEN payment_method != 'CASH' THEN datetime END) as last_cashless_sale
          FROM transactions
          WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'  -- Only look at recent data
          GROUP BY machine_id
        ) t_stats ON bm.machine_id = t_stats.machine_id
        
        -- Refill stats
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_refill,
            (array_agg(operator ORDER BY datetime DESC))[1] as last_operator
          FROM refills
          WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'  -- Only recent refills
          GROUP BY machine_id
        ) r_stats ON bm.machine_id = r_stats.machine_id
        
        -- Event stats (simplified, only recent)
        LEFT JOIN (
          SELECT 
            machine_id,
            MAX(datetime) as last_door_open
          FROM events
          WHERE event_name = 'Automatentüre offen'
            AND datetime >= CURRENT_DATE - INTERVAL '7 days'  -- Only last week
          GROUP BY machine_id
        ) e_stats ON bm.machine_id = e_stats.machine_id
        
        -- MHD stats (simplified)
        LEFT JOIN (
          SELECT 
            machine_id,
            COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_count,
            COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as warning_count,
            MIN(expiry_date) FILTER (WHERE expiry_date < CURRENT_DATE) as earliest_expiry
          FROM machine_stocks
          WHERE expiry_date IS NOT NULL
          GROUP BY machine_id
        ) mhd_stats ON bm.machine_id = mhd_stats.machine_id
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
        COALESCE(expired_count, 0) as expired_count,
        COALESCE(warning_count, 0) as warning_count,
        earliest_expiry
      FROM machine_stats
      ORDER BY machine_name
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
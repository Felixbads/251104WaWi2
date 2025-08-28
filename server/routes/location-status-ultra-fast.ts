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

// Ultra-fast Location Status API - GROUPED BY LOCATION
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🚀 LOCATION-STATUS GROUPED BY LOCATION! 🚀');
    
    // Cache disabled and clear any residual cache
    locationStatusCache = null;
    cacheTimestamp = 0;
    
    // Force refresh parameter
    const forceRefresh = req.query.refresh === '1' || req.query.force === '1';
    
    console.log(`🔄 Force refresh: ${forceRefresh}, Query params:`, req.query);
    
    // Query to get data grouped by LOCATION (extracted directly from transactions)
    const result = await db.execute(`
      WITH transactions_by_location AS (
        -- Get transaction data grouped by location (extracted from machine_name)
        SELECT 
          CASE 
            WHEN POSITION(',' IN t.machine_name) > 0 
            THEN TRIM(SUBSTRING(t.machine_name FROM 1 FOR POSITION(',' IN t.machine_name) - 1))
            ELSE t.machine_name
          END as location,
          t.machine_id,
          t.machine_name,
          t.datetime,
          t.price,
          t.payment_method,
          t.product_name
        FROM transactions t
        WHERE t.machine_name IS NOT NULL
          AND t.machine_name NOT LIKE '%*%'
          AND t.machine_name NOT LIKE '%Test%'
          AND t.datetime >= CURRENT_DATE - INTERVAL '30 days'
      ),
      location_aggregated AS (
        SELECT 
          tbl.location,
          COUNT(DISTINCT tbl.machine_id) as machine_count,
          STRING_AGG(DISTINCT tbl.machine_name, ', ' ORDER BY tbl.machine_name) as machine_names,
          
          -- Direct aggregation from transactions
          MAX(tbl.datetime) as last_sale,
          COALESCE(SUM(CASE WHEN tbl.datetime >= CURRENT_DATE THEN tbl.price ELSE 0 END), 0) as today_revenue,
          COUNT(CASE WHEN tbl.datetime >= CURRENT_DATE THEN 1 END) as today_transactions,
          MAX(CASE WHEN UPPER(TRIM(tbl.payment_method)) IN ('CASHLESS', 'CARD') THEN tbl.datetime END) as last_cashless_sale,
          (SELECT t2.product_name FROM transactions t2 WHERE 
            CASE 
              WHEN POSITION(',' IN t2.machine_name) > 0 
              THEN TRIM(SUBSTRING(t2.machine_name FROM 1 FOR POSITION(',' IN t2.machine_name) - 1))
              ELSE t2.machine_name
            END = tbl.location 
            AND UPPER(TRIM(t2.payment_method)) IN ('CASHLESS', 'CARD')
            AND t2.datetime >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY t2.datetime DESC LIMIT 1) as last_cashless_product,
          MAX(CASE WHEN EXISTS(SELECT 1 FROM products p WHERE LOWER(TRIM(tbl.product_name)) = LOWER(TRIM(p.product_name)) AND p."isAlcoholic" = true) THEN tbl.datetime END) as last_alcohol_sale,
          (SELECT t3.product_name FROM transactions t3 WHERE 
            CASE 
              WHEN POSITION(',' IN t3.machine_name) > 0 
              THEN TRIM(SUBSTRING(t3.machine_name FROM 1 FOR POSITION(',' IN t3.machine_name) - 1))
              ELSE t3.machine_name
            END = tbl.location 
            AND EXISTS(SELECT 1 FROM products p WHERE LOWER(TRIM(t3.product_name)) = LOWER(TRIM(p.product_name)) AND p."isAlcoholic" = true)
            AND t3.datetime >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY t3.datetime DESC LIMIT 1) as last_alcohol_product,
          
          -- Latest refill across all machines at location
          MAX(r.last_refill) as last_refill,
          (array_agg(r.last_operator ORDER BY r.last_refill DESC NULLS LAST))[1] as last_operator,
          
          -- Latest door opening across all machines
          MAX(e.last_door_open) as last_door_open,
          
          -- Total MHD stats for location (aggregate properly without double-counting)
          COALESCE(MAX(mhd.expired_count), 0) as expired_count,
          COALESCE(MAX(mhd.warning_count), 0) as warning_count,
          MIN(mhd.earliest_expiry) as earliest_expiry
          
        FROM transactions_by_location tbl
        
        -- Refill stats per machine (DIRECT machine_name - NO JOIN needed!)
        LEFT JOIN (
          SELECT 
            r.machine_name,
            MAX(r.datetime) as last_refill,
            (array_agg(r.operator ORDER BY r.datetime DESC))[1] as last_operator
          FROM refills r
          WHERE r.datetime >= CURRENT_DATE - INTERVAL '90 days'
            AND r.machine_name IS NOT NULL
          GROUP BY r.machine_name
        ) r ON tbl.machine_name = r.machine_name
        
        -- Event stats per machine (JOIN über machine_id ODER machine_name für vollständige Abdeckung!)
        LEFT JOIN (
          SELECT 
            COALESCE(e.machine_name, m.machine_name) as machine_name,
            MAX(e.datetime) as last_door_open
          FROM events e
          LEFT JOIN machines m ON e.machine_id = m.id
          WHERE (e.description LIKE '%Automatentüre in Stellung offen%'
            OR e.description LIKE '%door open%' 
            OR e.description LIKE '%Door open%'
            OR e.description LIKE '%Türöffnung%'
            OR e.event_type = 'DOOR_OPEN'
            OR (e.event_type = 'R' AND e.description LIKE '%Automatentüre%offen%'))
            AND e.datetime >= CURRENT_DATE - INTERVAL '90 days'
            AND (e.machine_name IS NOT NULL OR e.machine_id IS NOT NULL)
          GROUP BY COALESCE(e.machine_name, m.machine_name)
        ) e ON tbl.machine_name = e.machine_name
        
        -- MHD stats per machine (JOIN by machine name, aggregate all machines with same name)
        LEFT JOIN (
          SELECT 
            COALESCE(m.machine_name, ms.machine_id::text) as machine_name,
            COUNT(*) FILTER (WHERE ms.expiry_date < CURRENT_DATE) as expired_count,
            COUNT(*) FILTER (WHERE ms.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as warning_count,
            MIN(ms.expiry_date) FILTER (WHERE ms.expiry_date < CURRENT_DATE) as earliest_expiry
          FROM machine_stocks ms
          LEFT JOIN machines m ON ms.machine_id = m.id
          WHERE ms.expiry_date IS NOT NULL
            AND ms.quantity > 0
          GROUP BY COALESCE(m.machine_name, ms.machine_id::text)
        ) mhd ON tbl.machine_name = mhd.machine_name
        
        GROUP BY tbl.location
      )
      SELECT 
        ROW_NUMBER() OVER (ORDER BY today_revenue DESC, location) as id,
        location as machine_name,  -- Using location as machine_name for compatibility
        machine_count,
        machine_names,
        last_sale,
        today_revenue,
        today_transactions,
        last_cashless_sale,
        last_cashless_product,
        last_alcohol_sale,
        last_alcohol_product,
        last_refill,
        last_operator,
        last_door_open,
        expired_count,
        warning_count,
        earliest_expiry
      FROM location_aggregated
      ORDER BY 
        CASE WHEN today_revenue > 0 THEN 0 ELSE 1 END,
        today_revenue DESC,
        location
    `);



    // Process results for LOCATION-based tiles
    const machineStatusData = result.rows.map((row: any) => {
      const expiredCount = Number(row.expired_count || 0);
      const warningCount = Number(row.warning_count || 0);
      const machineCount = Number(row.machine_count || 1);
      
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
        machineName: row.machine_name,  // Show only location name without count
        location: row.machine_names,   // List of all machine names at this location
        machineCount,                  // Number of machines at location
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
          productName: row.last_cashless_product || 'Unbekannt',
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
        todayTransactions: Number(row.today_transactions || 0),
        recentTransactions: [], // Will be populated in separate query
        status: status as 'ok' | 'warning' | 'error',
        warnings,
        mhdStatus
      };
    });

    // Get recent transactions for each location (last 3 per location)
    const recentTransactionsQuery = await db.execute(`
      WITH recent_by_location AS (
        SELECT 
          CASE 
            WHEN POSITION(',' IN t.machine_name) > 0 
            THEN TRIM(SUBSTRING(t.machine_name FROM 1 FOR POSITION(',' IN t.machine_name) - 1))
            ELSE t.machine_name
          END as location,
          t.product_name,
          t.datetime,
          t.price,
          ROW_NUMBER() OVER (
            PARTITION BY CASE 
              WHEN POSITION(',' IN t.machine_name) > 0 
              THEN TRIM(SUBSTRING(t.machine_name FROM 1 FOR POSITION(',' IN t.machine_name) - 1))
              ELSE t.machine_name
            END 
            ORDER BY t.datetime DESC
          ) as rn
        FROM transactions t
        WHERE t.machine_name IS NOT NULL
          AND t.machine_name NOT LIKE '%*%'
          AND t.machine_name NOT LIKE '%Test%'
          AND t.datetime >= CURRENT_DATE - INTERVAL '7 days'
      )
      SELECT location, product_name, datetime, price
      FROM recent_by_location
      WHERE rn <= 3
      ORDER BY location, rn
    `);

    // Group recent transactions by location
    const recentTransactionsByLocation: Record<string, any[]> = {};
    for (const row of recentTransactionsQuery.rows) {
      const location = String(row.location || '');
      if (!recentTransactionsByLocation[location]) {
        recentTransactionsByLocation[location] = [];
      }
      recentTransactionsByLocation[location].push({
        productName: String(row.product_name || ''),
        datetime: new Date(row.datetime as string).toISOString(),
        price: Number(row.price || 0)
      });
    }

    // Update each machine with its recent transactions
    machineStatusData.forEach((machine: any) => {
      machine.recentTransactions = recentTransactionsByLocation[machine.location] || [];
    });
    
    // Update cache
    locationStatusCache = machineStatusData;
    cacheTimestamp = Date.now();
    
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
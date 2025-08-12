import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// Cache for location status data
let locationStatusCache: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 100; // 0.1 second cache for debugging

// Cache invalidation endpoint
router.post('/clear-cache', (req: Request, res: Response) => {
  locationStatusCache = null;
  cacheTimestamp = 0;
  console.log('✅ Location status cache cleared');
  res.json({ status: 'success', message: 'Cache cleared' });
});

// Helper function to calculate days ago
function getDaysAgo(date: Date | string | null): number {
  if (!date) return 999;
  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper function to determine status based on conditions
function calculateMachineStatus(data: any): { status: 'ok' | 'warning' | 'error'; warnings: string[] } {
  const warnings: string[] = [];
  let status: 'ok' | 'warning' | 'error' = 'ok';

  // Check for expired products
  if (data.expired_count > 0) {
    warnings.push(`${data.expired_count} abgelaufene Produkte`);
    status = 'error';
  }

  // Check for products warning about expiry
  if (data.warning_count > 0) {
    warnings.push(`${data.warning_count} Produkte laufen bald ab`);
    if (status !== 'error') status = 'warning';
  }

  // Check for no door opening in 7 days
  const daysSinceLastDoor = getDaysAgo(data.last_door_open);
  if (daysSinceLastDoor > 7) {
    warnings.push(`Keine Türöffnung seit ${daysSinceLastDoor} Tagen`);
    if (status !== 'error') status = 'warning';
  }

  // Check for no sales today
  if (!data.today_revenue || data.today_revenue === 0) {
    warnings.push('Kein Umsatz heute');
    if (status !== 'error') status = 'warning';
  }

  return { status, warnings };
}

// Comprehensive Location Status API - Individual Machine Data
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🏪 LOCATION-STATUS API - Individual Machines');
    
    // Cache temporarily COMPLETELY disabled for debugging
    locationStatusCache = null;
    cacheTimestamp = 0;
    
    // Comprehensive query to get all location data grouped by location
    const result = await db.execute(`
      WITH location_transactions AS (
        -- Transaction statistics per location (machine_name)
        SELECT 
          t.machine_name,
          -- Today's metrics
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE THEN 1 END) as today_transactions,
          COALESCE(SUM(CASE WHEN t.datetime >= CURRENT_DATE THEN t.price ELSE 0 END), 0) as today_revenue,
          
          -- Recent sales (top 3)
          CASE 
            WHEN COUNT(t.id) FILTER (WHERE t.datetime >= CURRENT_DATE - INTERVAL '7 days') > 0 THEN
              ARRAY(
                SELECT JSON_BUILD_OBJECT(
                  'product_name', t2.product_name,
                  'amount', t2.price,
                  'datetime', t2.datetime
                ) 
                FROM transactions t2 
                WHERE t2.machine_name = t.machine_name 
                  AND t2.datetime >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY t2.datetime DESC 
                LIMIT 3
              )
            ELSE ARRAY[]::json[]
          END as recent_sales,
          
          -- Last sale info
          MAX(t.datetime) as last_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC))[1] as last_sale_product,
          (ARRAY_AGG(t.price ORDER BY t.datetime DESC))[1] as last_sale_amount,
          
          -- Cashless payment tracking (alle Transaktionen als bargeldlos da payment_method meist NULL/CASHLESS)
          MAX(CASE 
            WHEN t.payment_method = 'CASHLESS' THEN t.datetime
            WHEN t.payment_method IS NULL THEN t.datetime  -- NULL = bargeldlos
            WHEN t.payment_method != 'CASH' THEN t.datetime
          END) as last_cashless_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC) FILTER (WHERE 
            t.payment_method = 'CASHLESS' OR t.payment_method IS NULL OR t.payment_method != 'CASH'
          ))[1] as last_cashless_product,
          (ARRAY_AGG(t.price ORDER BY t.datetime DESC) FILTER (WHERE 
            t.payment_method = 'CASHLESS' OR t.payment_method IS NULL OR t.payment_method != 'CASH'
          ))[1] as last_cashless_amount,
          (ARRAY_AGG(COALESCE(t.payment_method, 'CASHLESS') ORDER BY t.datetime DESC) FILTER (WHERE 
            t.payment_method = 'CASHLESS' OR t.payment_method IS NULL OR t.payment_method != 'CASH'
          ))[1] as last_cashless_method,
          
          -- Alcohol sales tracking
          MAX(CASE WHEN p."isAlcoholic" = true THEN t.datetime END) as last_alcohol_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC) FILTER (WHERE p."isAlcoholic" = true))[1] as last_alcohol_product,
          
          -- Machine count per location
          COUNT(DISTINCT t.machine_id) as machine_count
          
        FROM transactions t
        LEFT JOIN products p ON LOWER(TRIM(t.product_name)) = LOWER(TRIM(p.product_name))
        WHERE t.datetime >= CURRENT_DATE - INTERVAL '30 days'
          AND t.machine_name IS NOT NULL
          AND t.machine_name NOT LIKE '%*%'
          AND t.machine_name NOT LIKE '%Test%'
        GROUP BY t.machine_name
      ),
      location_refills AS (
        -- Latest refill information per location
        SELECT 
          m.machine_name,
          MAX(r.datetime) as last_refill,
          (ARRAY_AGG(r.operator ORDER BY r.datetime DESC))[1] as last_operator
        FROM refills r
        JOIN machines m ON r.machine_id = m.id
        WHERE r.datetime >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY m.machine_name
      ),
      location_events AS (
        -- Latest door opening events per location
        SELECT 
          m.machine_name,
          MAX(e.datetime) as last_door_open
        FROM events e
        JOIN machines m ON e.machine_id = m.id
        WHERE (
          e.event_name ILIKE '%door%' 
          OR e.event_name ILIKE '%tür%'
          OR e.event_name = 'Automatentüre offen'
          OR e.category = 'door'
        )
        AND e.datetime >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY m.machine_name
      ),
      location_stocks_mhd AS (
        -- MHD and stock status per location
        SELECT 
          m.machine_name,
          COUNT(CASE WHEN ms.expiry_date < CURRENT_DATE THEN 1 END) as expired_count,
          COUNT(CASE WHEN ms.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as warning_count,
          MIN(ms.expiry_date) as earliest_expiry,
          SUM(ms.quantity) as total_stock
        FROM machine_stocks ms
        JOIN machines m ON ms.machine_id = m.id
        WHERE ms.quantity > 0
        GROUP BY m.machine_name
      )
      
      SELECT 
        lt.machine_name,
        lt.machine_name as location,
        
        -- Machine info with location_id
        lt.machine_count,
        (
          SELECT DISTINCT m.location_id 
          FROM machines m 
          WHERE m.machine_name = lt.machine_name 
          AND m.location_id IS NOT NULL 
          LIMIT 1
        ) as location_id,
        
        -- Transaction data
        COALESCE(lt.today_transactions, 0) as today_transactions,
        COALESCE(lt.today_revenue, 0) as today_revenue,
        lt.recent_sales,
        lt.last_sale,
        lt.last_sale_product,
        lt.last_sale_amount,
        lt.last_cashless_sale,
        lt.last_cashless_product,
        lt.last_cashless_amount,
        lt.last_cashless_method,
        lt.last_alcohol_sale,
        lt.last_alcohol_product,
        
        -- Refill data
        lr.last_refill,
        lr.last_operator,
        
        -- Event data
        le.last_door_open,
        
        -- Stock/MHD data
        COALESCE(lmhd.expired_count, 0) as expired_count,
        COALESCE(lmhd.warning_count, 0) as warning_count,
        lmhd.earliest_expiry,
        COALESCE(lmhd.total_stock, 0) as total_stock
        
      FROM location_transactions lt
      LEFT JOIN location_refills lr ON lt.machine_name = lr.machine_name
      LEFT JOIN location_events le ON lt.machine_name = le.machine_name
      LEFT JOIN location_stocks_mhd lmhd ON lt.machine_name = lmhd.machine_name
      
      ORDER BY lt.machine_name
    `);

    // Process the results
    const machines = result.rows.map((row: any) => {
      // Debug: Log row data ONLY for Schöna to see what SQL returns
      if (row.machine_name === 'Schöna') {
        console.log('🔍 DETAILED DEBUG for Schöna:');
        console.log('  today_transactions (raw):', row.today_transactions, typeof row.today_transactions);
        console.log('  today_revenue (raw):', row.today_revenue, typeof row.today_revenue);
        console.log('  last_cashless_sale (raw):', row.last_cashless_sale);
        console.log('  last_alcohol_sale (raw):', row.last_alcohol_sale);
        console.log('  Full row keys:', Object.keys(row));
      }

      // Parse recent sales (limit to 3)
      let recentSales = [];
      try {
        if (row.recent_sales && Array.isArray(row.recent_sales)) {
          recentSales = row.recent_sales.slice(0, 3);
        }
      } catch (e) {
        console.warn('Failed to parse recent sales:', e);
        recentSales = [];
      }

      // Calculate machine status
      const { status, warnings } = calculateMachineStatus(row);

      return {
        id: row.machine_name.replace(/[^a-zA-Z0-9]/g, ''),
        machineName: row.machine_name,
        location: row.location,
        locationId: row.location_id,
        machineCount: row.machine_count || 1,
        
        // Status and warnings
        status,
        warnings,
        
        // MHD Status
        mhdStatus: {
          expiredCount: row.expired_count || 0,
          warningCount: row.warning_count || 0,
          earliestExpiry: row.earliest_expiry
        },
        
        // Last filling
        lastRefill: {
          datetime: row.last_refill,
          operator: row.last_operator,
          daysAgo: getDaysAgo(row.last_refill)
        },
        
        // Last door opening
        lastDoorOpening: row.last_door_open ? {
          datetime: row.last_door_open,
          daysAgo: getDaysAgo(row.last_door_open)
        } : null,
        
        // Last alcohol sale
        lastAlcoholSale: row.last_alcohol_sale ? {
          datetime: row.last_alcohol_sale,
          productName: row.last_alcohol_product || 'Alkohol',
          daysAgo: getDaysAgo(row.last_alcohol_sale)
        } : null,
        
        // Last cashless sale
        lastCashlessSale: row.last_cashless_sale ? {
          datetime: row.last_cashless_sale,
          productName: row.last_cashless_product || 'Bargeldlos',
          amount: row.last_cashless_amount || 0,
          method: row.last_cashless_method || 'CASHLESS',
          daysAgo: getDaysAgo(row.last_cashless_sale)
        } : null,
        
        // Today's revenue - Fixed mapping with explicit types
        todayRevenue: Number(row.today_revenue) || 0,
        todayTransactions: Number(row.today_transactions) || 0,
        
        // Recent sales (top 3)
        recentTransactions: recentSales,
        
        // Additional info
        totalStock: row.total_stock || 0,
        lastSale: {
          datetime: row.last_sale,
          productName: row.last_sale_product,
          amount: row.last_sale_amount,
          daysAgo: getDaysAgo(row.last_sale)
        }
      };
    });

    // Cache disabled for debugging
    // locationStatusCache = machines;
    // cacheTimestamp = now;

    console.log(`Ultra-fast location status with raw SQL: Returning ${machines.length} locations`);
    res.json(machines);
  } catch (error) {
    console.error('❌ Location Status API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
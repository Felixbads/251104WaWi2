import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// Cache for location status data
let locationStatusCache: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds cache for real-time data

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
    
    // Check cache first
    const now = Date.now();
    if (locationStatusCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Returning cached location status data');
      return res.json(locationStatusCache);
    }
    
    // Comprehensive query to get all machine data
    const result = await db.execute(`
      WITH active_machines AS (
        -- Get all active machines with recent activity
        SELECT 
          m.id as machine_id,
          m.machine_name,
          m.vendon_id,
          m.location_name,
          -- Extract clean location name
          CASE 
            WHEN POSITION(',' IN m.machine_name) > 0 
            THEN TRIM(SUBSTRING(m.machine_name FROM 1 FOR POSITION(',' IN m.machine_name) - 1))
            ELSE m.machine_name
          END as location
        FROM machines m
        WHERE m.machine_name IS NOT NULL
          AND m.machine_name NOT LIKE '%*%'
          AND m.machine_name NOT LIKE '%Test%'
          AND m.id != 1  -- Exclude demo machine
          AND EXISTS (
            SELECT 1 FROM transactions t 
            WHERE t.machine_id = m.id 
              AND t.datetime >= CURRENT_DATE - INTERVAL '30 days'
          )
      ),
      machine_transactions AS (
        -- Transaction statistics per machine
        SELECT 
          t.machine_id,
          -- Today's metrics
          COUNT(CASE WHEN t.datetime >= CURRENT_DATE THEN 1 END) as today_transactions,
          COALESCE(SUM(CASE WHEN t.datetime >= CURRENT_DATE THEN t.price ELSE 0 END), 0) as today_revenue,
          
          -- Recent sales (top 3)
          ARRAY_AGG(
            JSON_BUILD_OBJECT(
              'product_name', t.product_name,
              'amount', t.price,
              'datetime', t.datetime
            ) ORDER BY t.datetime DESC
          ) FILTER (WHERE t.datetime >= CURRENT_DATE - INTERVAL '7 days') as recent_sales,
          
          -- Last sale info
          MAX(t.datetime) as last_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC))[1] as last_sale_product,
          (ARRAY_AGG(t.price ORDER BY t.datetime DESC))[1] as last_sale_amount,
          
          -- Cashless payment tracking
          MAX(CASE WHEN t.payment_method IN ('CASHLESS', 'CARD', 'cashless') THEN t.datetime END) as last_cashless_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC) FILTER (WHERE t.payment_method IN ('CASHLESS', 'CARD', 'cashless')))[1] as last_cashless_product,
          (ARRAY_AGG(t.price ORDER BY t.datetime DESC) FILTER (WHERE t.payment_method IN ('CASHLESS', 'CARD', 'cashless')))[1] as last_cashless_amount,
          (ARRAY_AGG(t.payment_method ORDER BY t.datetime DESC) FILTER (WHERE t.payment_method IN ('CASHLESS', 'CARD', 'cashless')))[1] as last_cashless_method,
          
          -- Alcohol sales tracking
          MAX(CASE WHEN p.is_alcoholic = true THEN t.datetime END) as last_alcohol_sale,
          (ARRAY_AGG(t.product_name ORDER BY t.datetime DESC) FILTER (WHERE p.is_alcoholic = true))[1] as last_alcohol_product
          
        FROM transactions t
        LEFT JOIN products p ON t.product_id = p.vendon_id
        WHERE t.datetime >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY t.machine_id
      ),
      machine_refills AS (
        -- Latest refill information per machine
        SELECT 
          r.machine_id,
          MAX(r.datetime) as last_refill,
          (ARRAY_AGG(r.operator ORDER BY r.datetime DESC))[1] as last_operator
        FROM refills r
        WHERE r.datetime >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY r.machine_id
      ),
      machine_events AS (
        -- Latest door opening events per machine
        SELECT 
          e.machine_id,
          MAX(e.datetime) as last_door_open
        FROM events e
        WHERE (
          e.event_name ILIKE '%door%' 
          OR e.event_name ILIKE '%tür%'
          OR e.event_name = 'Automatentüre offen'
          OR e.category = 'door'
        )
        AND e.datetime >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY e.machine_id
      ),
      machine_stocks_mhd AS (
        -- MHD and stock status per machine
        SELECT 
          ms.machine_id,
          COUNT(CASE WHEN ms.expiry_date < CURRENT_DATE THEN 1 END) as expired_count,
          COUNT(CASE WHEN ms.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as warning_count,
          MIN(ms.expiry_date) as earliest_expiry,
          SUM(ms.quantity) as total_stock
        FROM machine_stocks ms
        WHERE ms.quantity > 0
        GROUP BY ms.machine_id
      )
      
      SELECT 
        am.machine_id,
        am.machine_name,
        am.location,
        am.vendon_id,
        
        -- Transaction data
        COALESCE(mt.today_transactions, 0) as today_transactions,
        COALESCE(mt.today_revenue, 0) as today_revenue,
        mt.recent_sales,
        mt.last_sale,
        mt.last_sale_product,
        mt.last_sale_amount,
        mt.last_cashless_sale,
        mt.last_cashless_product,
        mt.last_cashless_amount,
        mt.last_cashless_method,
        mt.last_alcohol_sale,
        mt.last_alcohol_product,
        
        -- Refill data
        mr.last_refill,
        mr.last_operator,
        
        -- Event data
        me.last_door_open,
        
        -- Stock/MHD data
        COALESCE(mhd.expired_count, 0) as expired_count,
        COALESCE(mhd.warning_count, 0) as warning_count,
        mhd.earliest_expiry,
        COALESCE(mhd.total_stock, 0) as total_stock
        
      FROM active_machines am
      LEFT JOIN machine_transactions mt ON am.machine_id = mt.machine_id
      LEFT JOIN machine_refills mr ON am.machine_id = mr.machine_id
      LEFT JOIN machine_events me ON am.machine_id = me.machine_id
      LEFT JOIN machine_stocks_mhd mhd ON am.machine_id = mhd.machine_id
      
      ORDER BY am.location, am.machine_name
    `);

    // Process the results
    const machines = result.rows.map((row: any) => {
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
        machineId: row.machine_id,
        machineName: row.machine_name,
        location: row.location,
        vendonId: row.vendon_id,
        
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
        lastFilling: {
          datetime: row.last_refill,
          operator: row.last_operator
        },
        
        // Last door opening
        lastDoorOpen: row.last_door_open,
        
        // Last alcohol sale
        lastAlcoholSale: {
          datetime: row.last_alcohol_sale,
          productName: row.last_alcohol_product
        },
        
        // Today's revenue
        todayRevenue: row.today_revenue || 0,
        todayTransactions: row.today_transactions || 0,
        
        // Recent sales (top 3)
        recentSales,
        
        // Last cashless sale
        lastCashlessSale: {
          datetime: row.last_cashless_sale,
          productName: row.last_cashless_product,
          amount: row.last_cashless_amount,
          paymentMethod: row.last_cashless_method
        },
        
        // Additional info
        totalStock: row.total_stock || 0,
        lastSale: {
          datetime: row.last_sale,
          productName: row.last_sale_product,
          amount: row.last_sale_amount
        }
      };
    });

    const response = {
      machines,
      summary: {
        totalMachines: machines.length,
        okMachines: machines.filter(m => m.status === 'ok').length,
        warningMachines: machines.filter(m => m.status === 'warning').length,
        errorMachines: machines.filter(m => m.status === 'error').length,
        totalTodayRevenue: machines.reduce((sum, m) => sum + (m.todayRevenue || 0), 0),
        lastUpdated: new Date().toISOString()
      }
    };

    // Update cache
    locationStatusCache = response;
    cacheTimestamp = now;

    res.json(response);
  } catch (error) {
    console.error('❌ Location Status API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
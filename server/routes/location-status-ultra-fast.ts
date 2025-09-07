import { Router, Request, Response } from 'express';
import { db, rawDb } from '../db';
import { VendonAPI } from '../services/vendonAPI';
import { sql } from 'drizzle-orm';

const router = Router();

// Cache for location status data
let locationStatusCache: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache for performance



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
    
    // Force refresh parameter
    const forceRefresh = req.query.refresh === '1' || req.query.force === '1';
    
    console.log(`🔄 Force refresh: ${forceRefresh}, Query params:`, req.query);
    
    // Check cache first (unless force refresh)
    const now = Date.now();
    if (!forceRefresh && locationStatusCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log(`💨 Cache hit! Returning cached data (${Math.round((now - cacheTimestamp) / 1000)}s old)`);
      return res.json(locationStatusCache);
    }
    
    // PERFORMANCE-OPTIMIZED Query - Simplified structure, minimal JOINs
    const result = await db.execute(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY today_revenue DESC, location) as id,
        location as machine_name,
        machine_count,
        machine_names,
        last_sale,
        today_revenue,
        today_transactions,
        last_cashless_sale,
        NULL as last_cashless_product,
        NULL as last_alcohol_sale,
        NULL as last_alcohol_product,
        NULL as last_refill,
        NULL as last_operator,
        NULL as last_door_open,
        0 as expired_count,
        0 as warning_count,
        NULL as earliest_expiry
      FROM (
        SELECT 
          location,
          COUNT(DISTINCT machine_id) as machine_count,
          STRING_AGG(DISTINCT machine_name, ', ' ORDER BY machine_name) as machine_names,
          MAX(datetime) as last_sale,
          COALESCE(SUM(CASE WHEN datetime >= CURRENT_DATE THEN price ELSE 0 END), 0) as today_revenue,
          COUNT(CASE WHEN datetime >= CURRENT_DATE THEN 1 END) as today_transactions,
          MAX(CASE WHEN UPPER(TRIM(payment_method)) IN ('CASHLESS', 'CARD', 'MOBILE', 'CONTACTLESS', 'NFC', 'QR') THEN datetime END) as last_cashless_sale
        FROM (
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
        ) tbl
        GROUP BY location
      ) location_stats
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
      machine.recentTransactions = recentTransactionsByLocation[machine.machineName] || [];
    });

    // Enhance with Vendon status and cash data for each location (LIMITED PARALLEL PROCESSING)
    const enhancedMachineData = [];
    const BATCH_SIZE = 6; // Limit to 6 concurrent Vendon API calls for performance
    
    for (let i = 0; i < machineStatusData.length; i += BATCH_SIZE) {
      const batch = machineStatusData.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (machine: any) => {
        try {
          // Get vendon_id mapping for location
          const vendonIdMap: Record<string, string> = {
            'Rathen': '325762',
            'Schöna': '348079', 
            'Bad Schandau, Nationalparkbahnhof': '323959',
            'Bad Schandau, Elbkai': '391262',
            'Bad Schandau': '391262', // Default to Elbkai
            'Hohnstein': '363236',
            'Ostrau': '347989',
            'Schmilka': '391263',
            'Papstdorf, Feuerwehrmuseum': '380593',
            'Papstdorf': '380593',
            'Gohrisch': '340303',
            'Burg Stolpen': '362117',
            'Schloss Pilnitz,in der Orangerie': '395727',
            'Schloss Pilnitz': '395727',
            'Leupoldishain': '334642',
            'Bad Gottleuba-Berggishübel': '380053',
            'Bad Gottleuba': '380053',
            'Berggishübel': '380053',
            'COMÖDIE Dresden, Schloß Übigau': '504610',
            'COMÖDIE Dresden': '504610',
            'Pfaffendorf': '323780',
            'Pirna, Hotel zur Post': '380592',
            'Pirna': '380592',
            'Pötzscha': '384501',
            'Struppen, Landschlachthof': '378540',
            'Struppen': '378540'
          };

          const vendonId = vendonIdMap[machine.machineName];
          if (!vendonId) {
            return machine; // Return original data if no vendon mapping
          }

          // Create Vendon API instance
          const vendonAPI = new VendonAPI();
          
          // Fetch status and cash data concurrently
          const [statusResult, cashResult] = await Promise.allSettled([
            vendonAPI.request(`/machine/${vendonId}/status`),
            vendonAPI.request(`/machine/${vendonId}/cash`)
          ]);

          // Process status data
          let systemStatus = null;
          if (statusResult.status === 'fulfilled' && statusResult.value) {
            const status = statusResult.value;
            systemStatus = {
              power: status.power || false,
              powerStatus: status.power_status || 'UNKNOWN',
              telemetryOnline: status.telemetry_unit_online || false,
              stockLevel: status.stock_level || null
            };

            // Add last cash collection info
            if (status.last_cash_collection) {
              const daysAgo = getDaysAgo(new Date(status.last_cash_collection * 1000));
              machine.lastCashCollection = {
                datetime: new Date(status.last_cash_collection * 1000).toISOString(),
                daysAgo
              };
            }
          }

          // Process cash data
          let cashStatus = null;
          if (cashResult.status === 'fulfilled' && cashResult.value) {
            const cash = cashResult.value;
            const totalCash = (cash.cash_box || 0) + (cash.bill_stacker || 0);
            
            let lowCoinTubes = 0;
            if (cash.coins_per_tube) {
              lowCoinTubes = cash.coins_per_tube.filter((tube: any) => tube.count < 5).length;
            }

            cashStatus = {
              totalCash,
              lowCoinTubes,
              hasHighCash: totalCash > 250
            };

            // Status and warnings will be handled in frontend display
          }

          // Get MHD status for this machine - simplified to avoid slow SQL queries
          let mhdStatus = null;
          // MHD data fetch temporarily disabled for performance
          // TODO: Re-enable with optimized query

          return {
            ...machine,
            systemStatus,
            cashStatus,
            mhdStatus
          };

        } catch (error) {
          console.error(`Error fetching enhanced data for location ${machine.machineName}:`, error);
          return machine; // Return original data on error
        }
      })
      );
      
      enhancedMachineData.push(...batchResults);
      console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: Processed ${batchResults.length} locations`);
    }
    
    // Update cache
    locationStatusCache = enhancedMachineData;
    cacheTimestamp = Date.now();
    
    console.log(`Ultra-fast location status with raw SQL: Returning ${enhancedMachineData.length} locations`);
    res.json(enhancedMachineData);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Location-Status-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Location-Status-Daten',
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
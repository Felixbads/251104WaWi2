import { Router } from 'express';
import { db, rawDb } from '../db';
import { eq, desc, and, gte, lte, count, sql } from 'drizzle-orm';
import { machines, transactions, refills, events, locationCosts } from '../../shared/schema';
import { machineWarehouseAssignments, warehouses } from '../../shared/warehouse3.schema';
import { storage } from '../storage';
import { VendonAPI } from '../services/vendonAPI';
import { replitAuthMiddleware } from '../auth/replit-auth';

const router = Router();
const vendonAPI = new VendonAPI();

// Apply authentication middleware to protected routes
router.use(replitAuthMiddleware);

/**
 * 🔥 NEUE FUNKTION: FIFO Batch Allocation für Machine Stock (wie in deutscher Spezifikation)
 * 
 * Automatisch selects optimal batches using sophisticated FIFO algorithms
 * Provides batch recommendations and expiry optimization
 * Includes advanced movement tracking and audit capabilities
 */
async function calculateFifoBatchAllocation(
  db: any, 
  machineId: number, 
  productName: string, 
  currentQuantity: number
): Promise<{
  batches: Array<{
    batchId: number;
    batchNumber: string;
    quantity: number;
    expiryDate: string;
    daysUntilExpiry: number;
  }>;
  earliestMhd: string | null;
  totalBatches: number;
  mhdStatus: 'ok' | 'warning' | 'expired';
}> {
  try {
    console.log(`[FIFO_CALC] Starting FIFO batch calculation for machine ${machineId}, product: ${productName}`);

    // 🔥 FIXED: FIFO-Batch-Zuordnung basierend auf machine_stocks mit korrekten Spalten
    const batchResult = await db.query(`
      SELECT 
        ms.batch_id,
        ms.expiry_date,
        ms.quantity,
        COALESCE(pb.batch_number, CONCAT('BATCH-', ms.batch_id)) as batch_number,
        CASE 
          WHEN ms.expiry_date IS NOT NULL THEN 
            (ms.expiry_date::date - CURRENT_DATE::date)
          ELSE NULL 
        END as days_until_expiry
      FROM machine_stocks ms
      LEFT JOIN products p ON ms.product_vendon_id = p.vendon_id
      LEFT JOIN product_batches pb ON ms.batch_id = pb.id
      WHERE ms.machine_id = $1 
        AND (p.product_name ILIKE $2 OR ms.product_vendon_id IN (
          SELECT vendon_id FROM products WHERE product_name ILIKE $2
        ))
        AND ms.quantity > 0
        AND ms.status = 'active'
      ORDER BY ms.expiry_date ASC NULLS LAST, ms.received_date ASC
    `, [machineId, `%${productName}%`]);

    // Verarbeitung und Status-Berechnung
    const batches = batchResult.rows.map(row => ({
      batchId: row.batch_id,
      batchNumber: row.batch_number || `BATCH-${row.batch_id}`,
      quantity: row.quantity,
      expiryDate: row.expiry_date,
      daysUntilExpiry: row.days_until_expiry || 999
    }));

    const earliestMhd = batches.length > 0 ? batches[0].expiryDate : null;
    const mhdStatus = batches.some(b => b.daysUntilExpiry < 0) ? 'expired' :
                     batches.some(b => b.daysUntilExpiry <= 7) ? 'warning' : 'ok';

    console.log(`[FIFO_CALC] FIFO calculation completed: ${batches.length} batches, MHD status: ${mhdStatus}`);

    return {
      batches,
      earliestMhd,
      totalBatches: batches.length,
      mhdStatus
    };

  } catch (error) {
    console.error('[FIFO_CALC] Error in FIFO batch calculation:', error);
    // Return empty result on error but don't crash
    return {
      batches: [],
      earliestMhd: null,
      totalBatches: 0,
      mhdStatus: 'ok'
    };
  }
}

/**
 * GET /api/machines
 * Get all machines with proper camelCase field normalization
 */
router.get('/', async (req, res) => {
  try {
    console.log('[MACHINES API] Fetching all machines with camelCase normalization');
    
    // Use SQL aliases to convert snake_case to camelCase directly in the query
    const result = await rawDb.query(`
      SELECT 
        id,
        machine_name AS "machineName",
        vendon_id AS "vendonId", 
        location_id AS "locationId",
        machine_type AS "machineType",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM machines 
      WHERE machine_name IS NOT NULL 
        AND machine_name != '' 
        AND machine_name NOT LIKE '%Demo%'
        AND machine_name NOT LIKE '%Test%'
        AND id > 1
      ORDER BY machine_name ASC
    `);
    
    // No need for additional mapping since SQL aliases handle camelCase conversion
    const machines = result.rows;
    
    console.log(`[MACHINES API] Returning ${machines.length} machines with camelCase fields`);
    res.json(machines);
    
  } catch (error: any) {
    console.error('[MACHINES API] Error fetching machines:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Maschinen',
      message: error.message
    });
  }
});

/**
 * GET /api/machines/unassigned
 * Get all machines that are not assigned to any warehouse
 */
router.get('/unassigned', async (req, res) => {
  try {
    console.log('[MACHINES API] Fetching unassigned machines (not in any warehouse)');
    
    // Query machines that are NOT in machine_warehouse_assignments
    // Using NOT EXISTS instead of NOT IN for better performance and NULL safety
    const result = await rawDb.query(`
      SELECT 
        m.id,
        m.machine_name,
        m.vendon_id,
        m.location_name,
        m.location_address,
        m.machine_type,
        m.status
      FROM machines m
      WHERE NOT EXISTS (
        SELECT 1 
        FROM machine_warehouse_assignments mwa 
        WHERE mwa.machine_id = m.id
      )
      AND m.machine_name IS NOT NULL 
      AND m.machine_name != '' 
      AND m.machine_name NOT LIKE '%Demo%'
      AND m.machine_name NOT LIKE '%Test%'
      AND m.id > 1
      ORDER BY m.machine_name ASC
    `);
    
    console.log(`[MACHINES API] Found ${result.rows.length} unassigned machines`);
    res.json(result.rows);
    
  } catch (error: any) {
    console.error('[MACHINES API] Error fetching unassigned machines:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der nicht zugewiesenen Automaten',
      message: error.message
    });
  }
});

/**
 * GET /api/machines/:id
 * Get basic machine data by ID (supports internal ID, vendon_id, location_id)
 */
router.get('/:id', async (req, res) => {
  try {
    const inputId = req.params.id;
    console.log(`[MACHINES API] Fetching machine data for ID: ${inputId}`);

    // Try to resolve machine ID using the existing resolver logic
    let machineId: number;
    let machine: any;

    // First try as internal ID
    const parsedId = parseInt(inputId);
    if (!isNaN(parsedId)) {
      const machineResult = await rawDb.query(
        'SELECT * FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineResult.rows.length > 0) {
        machine = machineResult.rows[0];
        machineId = parsedId;
      }
    }

    // If not found, try as vendon_id
    if (!machine) {
      const vendonResult = await rawDb.query(
        'SELECT * FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonResult.rows.length > 0) {
        machine = vendonResult.rows[0];
        machineId = machine.id;
      }
    }

    // If still not found, try as location_id
    if (!machine && !isNaN(parsedId)) {
      const locationResult = await rawDb.query(
        'SELECT * FROM machines WHERE location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (locationResult.rows.length > 0) {
        machine = locationResult.rows[0];
        machineId = machine.id;
      }
    }

    if (!machine) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }

    // Format the response according to the frontend interface
    const formattedMachine = {
      id: machine.id,
      machineName: machine.machine_name,
      vendonId: machine.vendon_id,
      serialNumber: machine.serial_number,
      machineType: machine.machine_type,
      installationDate: machine.created_at,
      location: machine.location_name || machine.location_address,
      address: machine.location_address,
      status: machine.status === 'active' ? 'active' : 
              machine.status === 'error' ? 'error' : 'inactive'
    };

    console.log(`[MACHINES API] Machine found: ${formattedMachine.machineName}`);
    res.json(formattedMachine);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Maschine',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/transactions
 * Get transactions for a specific machine
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const inputId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    console.log(`[MACHINES API] Fetching transactions for machine ID: ${inputId}`);

    // Resolve machine ID
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      // Check if it's an internal ID
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        // Try as location_id
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    // If still not found, try as vendon_id
    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }

    // Get transactions
    const transactionsResult = await rawDb.query(
      `SELECT 
        id,
        datetime,
        product_name as "productName",
        quantity,
        price,
        payment_method as "paymentMethod"
      FROM transactions 
      WHERE machine_id = $1 
      ORDER BY datetime DESC 
      LIMIT $2 OFFSET $3`,
      [machineInternalId, limit, offset]
    );

    const formattedTransactions = transactionsResult.rows.map(t => ({
      id: t.id,
      datetime: t.datetime,
      productName: t.productName,
      quantity: t.quantity || 1,
      price: t.price || 0,
      paymentMethod: t.paymentMethod || 'CASH'
    }));

    console.log(`[MACHINES API] Found ${formattedTransactions.length} transactions for machine ${machineInternalId}`);
    res.json(formattedTransactions);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching transactions for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Transaktionen',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/refills
 * Get refills for a specific machine
 */
router.get('/:id/refills', async (req, res) => {
  try {
    const inputId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 20;

    console.log(`[MACHINES API] Fetching refills for machine ID: ${inputId}`);

    // Resolve machine ID (same logic as above)
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden'
      });
    }

    // Get refills
    const refillsResult = await rawDb.query(
      `SELECT 
        id,
        datetime,
        status,
        operator,
        notes
      FROM refills 
      WHERE machine_id = $1 
      ORDER BY datetime DESC 
      LIMIT $2`,
      [machineInternalId!, limit]
    );

    const formattedRefills = refillsResult.rows.map(r => ({
      id: r.id,
      datetime: r.datetime,
      status: r.status || 'completed',
      operator: r.operator || 'Unbekannt',
      notes: r.notes || ''
    }));

    console.log(`[MACHINES API] Found ${formattedRefills.length} refills for machine ${machineInternalId}`);
    res.json(formattedRefills);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching refills for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Auffüllungen',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/analytics
 * Get analytics data for a specific machine
 */
router.get('/:id/analytics', async (req, res) => {
  try {
    const inputId = req.params.id;
    const period = req.query.period || 'month';

    console.log(`[MACHINES API] Fetching analytics for machine ID: ${inputId}`);

    // Resolve machine ID
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden'
      });
    }

    // Calculate date range based on period
    let dateFilter = '';
    let dateParam = '';
    
    switch (period) {
      case 'day':
        dateFilter = 'AND datetime >= CURRENT_DATE';
        break;
      case 'week':
        dateFilter = 'AND datetime >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case 'month':
        dateFilter = 'AND datetime >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      default:
        dateFilter = 'AND datetime >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    // Get KPI data - Use vendon_id to aggregate ALL machines with same vendon_id
    const kpiResult = await rawDb.query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(price), 0) as total_revenue,
        COALESCE(AVG(price), 0) as avg_price
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}`,
      [inputId]
    );

    const refillCountResult = await rawDb.query(
      `SELECT COUNT(*) as refill_count 
      FROM refills 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}`,
      [inputId]
    );

    // Get sales time series (daily) - Use vendon_id for ALL machines
    const salesTimeSeriesResult = await rawDb.query(
      `SELECT 
        DATE(datetime) as date,
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}
      GROUP BY DATE(datetime)
      ORDER BY date`,
      [inputId]
    );

    // Get product performance - Use vendon_id for ALL machines
    const productPerformanceResult = await rawDb.query(
      `SELECT 
        product_name as "productName",
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}
      GROUP BY product_name
      ORDER BY count DESC
      LIMIT 10`,
      [inputId]
    );

    // Get hourly distribution - Use vendon_id for ALL machines
    const hourlyResult = await rawDb.query(
      `SELECT 
        EXTRACT(HOUR FROM datetime) as hour,
        COUNT(*) as count
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}
      GROUP BY EXTRACT(HOUR FROM datetime)
      ORDER BY hour`,
      [inputId]
    );

    // Get weekly revenue - Use vendon_id for ALL machines
    const weeklyResult = await rawDb.query(
      `SELECT 
        'KW' || EXTRACT(WEEK FROM datetime) as week,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}
      GROUP BY EXTRACT(WEEK FROM datetime)
      ORDER BY EXTRACT(WEEK FROM datetime)`,
      [inputId]
    );

    // Get monthly revenue - Use vendon_id for ALL machines
    const monthlyResult = await rawDb.query(
      `SELECT 
        TO_CHAR(datetime, 'YYYY-MM') as month,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1)
      AND datetime >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(datetime, 'YYYY-MM')
      ORDER BY month`,
      [inputId]
    );

    // Get event counts (if events table exists)
    let eventCounts = [];
    try {
      const eventResult = await rawDb.query(
        `SELECT 
          event_type as "eventType",
          COUNT(*) as count
        FROM events 
        WHERE machine_id IN (SELECT id FROM machines WHERE vendon_id = $1) ${dateFilter}
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 5`,
        [inputId]
      );
      eventCounts = eventResult.rows;
    } catch (error) {
      console.log('[MACHINES API] Events table not available, skipping event counts');
    }

    const analytics = {
      kpis: {
        transactionCount: parseInt(kpiResult.rows[0]?.transaction_count || 0),
        totalRevenue: parseFloat(kpiResult.rows[0]?.total_revenue || 0),
        refillCount: parseInt(refillCountResult.rows[0]?.refill_count || 0),
        avgPrice: parseFloat(kpiResult.rows[0]?.avg_price || 0)
      },
      salesTimeSeries: salesTimeSeriesResult.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count),
        revenue: parseFloat(row.revenue)
      })),
      eventCounts: eventCounts,
      productPerformance: productPerformanceResult.rows.map(row => ({
        productName: row.productName,
        count: parseInt(row.count),
        revenue: parseFloat(row.revenue)
      })),
      hourlyDistribution: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      })),
      weeklyRevenue: weeklyResult.rows.map(row => ({
        week: row.week,
        revenue: parseFloat(row.revenue)
      })),
      monthlyRevenue: monthlyResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue)
      }))
    };

    console.log(`[MACHINES API] Analytics calculated for machine ${inputId}`);
    res.json(analytics);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching analytics for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Analyse-Daten',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/stock
 * Get current stock/inventory for a specific machine
 */
router.get('/:id/stock', async (req, res) => {
  try {
    const inputId = req.params.id;

    console.log(`[MACHINES API] 🚀🚀🚀 STOCK ENDPOINT AUFGERUFEN für Machine ID: ${inputId} 🚀🚀🚀`);

    // Resolve machine ID
    let machineInternalId: number | undefined;
    let vendonId: string | undefined;
    
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
        vendonId = machineCheck.rows[0].vendon_id;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id, vendon_id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
          vendonId = locationCheck.rows[0].vendon_id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
        vendonId = vendonCheck.rows[0].vendon_id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden'
      });
    }

    // ENHANCED STRATEGY: Always prioritize Vendon API for current stock, then enrich with local batch/MHD data
    let vendonStock: any[] = [];
    let localBatchData: any[] = [];
    
    console.log(`[MACHINES API] Fetching current stock from Vendon API for machine ${inputId} (vendon_id: ${vendonId})`);
    
    // 1. FIRST: Get current stock from Vendon API using correct products endpoint
    try {
      const { fetchMachineProducts } = await import('../services/vendonAPI');
      
      console.log(`[MACHINES API] 🎯 Using dedicated products endpoint: /machine/${vendonId}/products`);
      const products = await fetchMachineProducts(parseInt(vendonId!));
      
      if (products && Array.isArray(products) && products.length > 0) {
        vendonStock = products;
        console.log(`[MACHINES API] ✅ Vendon API: ${vendonStock.length} Produkte von korrektem /products Endpoint erhalten`);
        console.log(`[MACHINES API] 🔍 Sample Product:`, JSON.stringify(vendonStock[0], null, 2));
      } else {
        console.log(`[MACHINES API] ⚠️ Vendon API: Keine Produktdaten von /products Endpoint erhalten für Maschine ${vendonId}`);
        
        // FALLBACK: Try enhanced client with alternative endpoints
        const { getVendonApiClient } = await import('../services/EnhancedVendonApiClient');
        const vendonClient = getVendonApiClient();
        
        const stockEndpoints = [
          `/machines/${vendonId}/products`,
          `/machines/${vendonId}/stock`,
          `/machines/${vendonId}/inventory`, 
          `/inventory?machine_id=${vendonId}`,
          `/stock?machine_id=${vendonId}`
        ];
        
        for (const endpoint of stockEndpoints) {
          try {
            console.log(`[MACHINES API] 🔄 Versuche Fallback-Endpoint: ${endpoint}`);
            const stockResponse = await vendonClient.get(endpoint);
            
            let foundProducts = null;
            if (stockResponse && Array.isArray(stockResponse)) {
              foundProducts = stockResponse;
            } else if (stockResponse?.result && Array.isArray(stockResponse.result)) {
              foundProducts = stockResponse.result;
            } else if (stockResponse?.data && Array.isArray(stockResponse.data)) {
              foundProducts = stockResponse.data;
            }
            
            if (foundProducts && foundProducts.length > 0) {
              vendonStock = foundProducts;
              console.log(`[MACHINES API] ✅ Fallback Erfolg mit ${endpoint}: ${vendonStock.length} Produkte gefunden`);
              break;
            }
          } catch (stockError) {
            console.log(`[MACHINES API] ❌ Endpoint ${endpoint} Fehler: ${stockError instanceof Error ? stockError.message : String(stockError)}`);
          }
        }
      }
    } catch (vendonError) {
      console.log(`[MACHINES API] ❌ Vendon API Fehler: ${vendonError}`);
    }
    
    // 2. SECOND: Get local batch/MHD data for enrichment
    try {
      const batchDataResult = await rawDb.query(
        `SELECT 
          ms.product_vendon_id,
          ms.selection_number,
          ms.batch_id,
          ms.expiry_date as machine_expiry_date,
          ms.last_filled,
          ib.batch_number,
          ib.expiry_date as batch_expiry_date,
          ib.incoming_date,
          ib.status as batch_status,
          p.product_name,
          p.id as product_id
        FROM machine_stocks ms
        LEFT JOIN product_batches pb ON ms.batch_id = pb.id
        LEFT JOIN products p ON p.vendon_id = ms.product_vendon_id
        WHERE ms.machine_id = $1`,
        [machineInternalId!]
      );
      
      localBatchData = batchDataResult.rows;
      console.log(`[MACHINES API] 📦 Local Batch Data: ${localBatchData.length} Batch-Einträge gefunden`);
    } catch (error) {
      console.log('[MACHINES API] ⚠️ Local Batch Data: machine_stocks table not available');
      localBatchData = [];
    }
    
    // 3. THIRD: FALLBACK STRATEGY - Use refill_details only if Vendon API failed
    let formattedStock: any[] = [];
    
    // Check if we have valid Vendon data first
    if (vendonStock && vendonStock.length > 0) {
      console.log(`[MACHINES API] ✅ Using Vendon API data as PRIMARY source (${vendonStock.length} products)`);
      
      // FIFO ENHANCEMENT: Enrich Vendon data with batch/MHD information
      console.log(`[FIFO] Starting FIFO batch allocation for ${vendonStock.length} products`);
      
      const enrichedProducts = [];
      
      for (let index = 0; index < vendonStock.length; index++) {
        const product = vendonStock[index];
        const currentQty = parseInt(product.amount) || parseInt(product.quantity) || parseInt(product.stock) || 0;
        const maxQty = parseInt(product.amount_max) || parseInt(product.capacity) || parseInt(product.max_capacity) || currentQty || 10;
        
        // Get FIFO batch allocation for this product
        const batchInfo = await calculateFifoBatchAllocation(rawDb, machineInternalId!, product.name, currentQty);
        
        const enrichedProduct = {
          id: index + 1,
          productName: product.name || product.product_name || 'Unbekanntes Produkt',
          currentQuantity: currentQty,
          maxQuantity: maxQty,
          lastRefill: product.last_purchase ? new Date(product.last_purchase * 1000).toISOString() : null,
          vendonId: product.id || product.vendon_id,
          status: currentQty <= 2 ? 'critical' : currentQty <= 5 ? 'warning' : 'good',
          // FIFO batch information
          batches: batchInfo.batches,
          earliestMhd: batchInfo.earliestMhd,
          totalBatches: batchInfo.totalBatches,
          mhdStatus: batchInfo.mhdStatus
        };
        
        enrichedProducts.push(enrichedProduct);
      }
      
      console.log(`[FIFO] ✅ Enriched ${enrichedProducts.length} products with batch information`);
      console.log(`[MACHINES API] 🔍 Sample enriched product:`, JSON.stringify(enrichedProducts[0], null, 2));
      
      console.log(`[MACHINES API] ✅ VENDON SUCCESS - Returning ${enrichedProducts.length} products with FIFO batch data`);
      console.log(`[MACHINES API] Found ${enrichedProducts.length} stock entries for machine ${machineInternalId}`);
      return res.json(enrichedProducts);
    } else {
      console.log(`[MACHINES API] 🔄 FALLBACK: Using refill-based calculation since Vendon API failed`);
      try {
      const refillStockResult = await rawDb.query(
        `WITH latest_refills AS (
          SELECT 
            rd.product_name,
            rd.current_stock,
            rd.added,
            rd.removed,
            r.datetime as refill_date,
            p.id as product_id,
            p.vendon_id as product_vendon_id,
            ROW_NUMBER() OVER (PARTITION BY rd.product_name ORDER BY r.datetime DESC) as rn
          FROM refill_details rd
          JOIN refills r ON rd.refill_id = r.id
          LEFT JOIN products p ON p.product_name = rd.product_name
          WHERE r.machine_id = $1
          AND rd.current_stock IS NOT NULL
        )
        SELECT 
          product_name as "productName",
          current_stock as "currentQuantity", 
          COALESCE(added + current_stock, current_stock * 2, 20) as "maxQuantity",
          refill_date as "lastRefill",
          product_id,
          product_vendon_id as "vendonId",
          CASE 
            WHEN current_stock = 0 THEN 'critical'
            WHEN current_stock <= 2 THEN 'warning'
            ELSE 'good'
          END as status
        FROM latest_refills 
        WHERE rn = 1 
        AND product_name IS NOT NULL
        ORDER BY product_name`,
        [machineInternalId!]
      );
      
      if (refillStockResult.rows.length > 0) {
        formattedStock = refillStockResult.rows.map((row, index) => ({
          id: index + 1,
          productName: row.productName,
          currentQuantity: parseInt(row.currentQuantity || 0),
          maxQuantity: parseInt(row.maxQuantity || 0),
          lastRefill: row.lastRefill,
          status: row.status,
          expiryDate: null, // Will be enriched from batch data if available
          batchId: null,
          batchNumber: null,
          mhdStatus: 'ok',
          vendonId: row.vendonId,
          selectionNumber: null
        }));
        
        console.log(`[MACHINES API] ✅ ERFOLG: ${formattedStock.length} Produkte mit aktuellen Beständen aus Refill-Daten`);
      }
      } catch (refillError) {
        console.log('[MACHINES API] ❌ Refill-Daten nicht verfügbar');
      }
    }
    
    // SECONDARY: Only try Vendon if refill data failed AND we have Vendon data
    if (formattedStock.length === 0 && vendonStock.length > 0) {
      console.log(`[MACHINES API] 🔄 SECONDARY: Verwende Vendon API Daten`);
      // Use Vendon API data as primary source and enrich with local batch data
      formattedStock = vendonStock.map((vendonProduct: any, index: number) => {
        // Find matching local batch data by product name or vendon_id
        const matchingBatch = localBatchData.find(batch => 
          batch.product_vendon_id === vendonProduct.vendon_id ||
          batch.product_name === vendonProduct.name ||
          batch.product_name === vendonProduct.product_name
        );
        
        // Determine MHD from local batch data (prioritize) or Vendon data
        const expiryDate = matchingBatch?.batch_expiry_date || 
                          matchingBatch?.machine_expiry_date || 
                          vendonProduct.expiry_date || 
                          null;
        
        let mhdStatus = 'ok';
        if (expiryDate) {
          const expiryTime = new Date(expiryDate).getTime();
          const now = new Date().getTime();
          const weekFromNow = now + (7 * 24 * 60 * 60 * 1000);
          
          if (expiryTime < now) {
            mhdStatus = 'expired';
          } else if (expiryTime <= weekFromNow) {
            mhdStatus = 'warning';
          }
        }
        
        // Calculate status based on current quantities
        const currentQuantity = parseInt(vendonProduct.current_stock || vendonProduct.quantity || 0);
        const maxQuantity = parseInt(vendonProduct.max_stock || vendonProduct.capacity || 0);
        
        let status = 'good';
        if (currentQuantity === 0) {
          status = 'critical';
        } else if (maxQuantity > 0 && (currentQuantity / maxQuantity) < 0.2) {
          status = 'warning';
        }
        
        return {
          id: index + 1,
          productName: vendonProduct.name || vendonProduct.product_name || 'Unbekanntes Produkt',
          currentQuantity: currentQuantity,
          maxQuantity: maxQuantity,
          lastRefill: matchingBatch?.last_filled || vendonProduct.last_refill || null,
          status: status,
          expiryDate: expiryDate,
          batchId: matchingBatch?.batch_id || null,
          batchNumber: matchingBatch?.batch_number || vendonProduct.batch || null,
          mhdStatus: mhdStatus,
          vendonId: vendonProduct.vendon_id || null,
          selectionNumber: vendonProduct.selection || matchingBatch?.selection_number || null
        };
      });
      
      console.log(`[MACHINES API] ✅ Merged Data: ${formattedStock.length} Produkte mit Vendon + Batch-Daten`);
    } else {
      // ENHANCED FALLBACK: Use refill_details for current stock levels
      console.log(`[MACHINES API] 🔄 Fallback: Verwende Refill-Daten für aktuelle Bestände`);
      
      try {
        // CORRECT APPROACH: Calculate current stock from all refill movements
        const refillStockResult = await rawDb.query(
          `WITH stock_movements AS (
            SELECT 
              rd.product_name,
              SUM(rd.added) as total_added,
              SUM(rd.removed) as total_removed,
              (SUM(rd.added) - SUM(rd.removed)) as calculated_stock,
              MAX(r.datetime) as last_refill,
              p.id as product_id,
              p.vendon_id as product_vendon_id,
              MAX(CASE WHEN rd.added > 0 THEN rd.added ELSE 10 END) as estimated_capacity
            FROM refill_details rd
            JOIN refills r ON rd.refill_id = r.id
            LEFT JOIN products p ON p.product_name = rd.product_name
            WHERE r.machine_id = $1
            GROUP BY rd.product_name, p.id, p.vendon_id
            HAVING SUM(rd.added) > 0 OR SUM(rd.removed) > 0
          )
          SELECT 
            product_name as "productName",
            GREATEST(calculated_stock, 0) as "currentQuantity", 
            GREATEST(total_added, estimated_capacity, 10) as "maxQuantity",
            last_refill as "lastRefill",
            product_id,
            product_vendon_id as "vendonId",
            total_added,
            total_removed,
            CASE 
              WHEN GREATEST(calculated_stock, 0) = 0 THEN 'critical'
              WHEN GREATEST(calculated_stock, 0) <= 2 THEN 'warning'
              ELSE 'good'
            END as status
          FROM stock_movements 
          ORDER BY calculated_stock DESC`,
          [machineInternalId!]
        );
        
        if (refillStockResult.rows.length > 0) {
          formattedStock = refillStockResult.rows.map((row, index) => ({
            id: index + 1,
            productName: row.productName,
            currentQuantity: parseInt(row.currentQuantity || 0),
            maxQuantity: parseInt(row.maxQuantity || 0),
            lastRefill: row.lastRefill,
            status: row.status,
            expiryDate: null, // Will be enriched from batch data if available
            batchId: null,
            batchNumber: null,
            mhdStatus: 'ok',
            vendonId: row.vendonId,
            selectionNumber: null
          }));
          
          console.log(`[MACHINES API] ✅ Refill-Daten: ${formattedStock.length} Produkte mit aktuellen Beständen gefunden`);
        } else {
          // Final fallback to machine_stocks
          console.log(`[MACHINES API] 🔄 Finale Fallback: machine_stocks Tabelle`);
          const localStockResult = await rawDb.query(
            `SELECT 
              ms.id,
              COALESCE(p.product_name, 'Unbekanntes Produkt') as "productName",
              ms.quantity as "currentQuantity",
              ms.max_quantity as "maxQuantity",
              ms.last_filled as "lastRefill",
              ms.expiry_date as "expiryDate",
              ms.batch_id as "batchId",
              ib.batch_number as "batchNumber",
              ib.expiry_date as "batchExpiryDate",
              ms.product_vendon_id as "vendonId",
              ms.selection_number as "selectionNumber",
              CASE 
                WHEN ms.quantity = 0 THEN 'critical'
                WHEN ms.max_quantity > 0 AND (ms.quantity::float / ms.max_quantity) < 0.2 THEN 'warning'
                ELSE 'good'
              END as status,
              CASE 
                WHEN COALESCE(ms.expiry_date, ib.expiry_date) < CURRENT_DATE THEN 'expired'
                WHEN COALESCE(ms.expiry_date, ib.expiry_date) <= CURRENT_DATE + INTERVAL '7 days' THEN 'warning'
                ELSE 'ok'
              END as mhd_status
            FROM machine_stocks ms
            LEFT JOIN products p ON p.vendon_id = ms.product_vendon_id
            LEFT JOIN product_batches pb ON ms.batch_id = pb.id
            WHERE ms.machine_id = $1
            ORDER BY ms.selection_number`,
            [machineInternalId!]
          );
          
          formattedStock = localStockResult.rows.map(row => ({
            id: row.id,
            productName: row.productName,
            currentQuantity: parseInt(row.currentQuantity || 0),
            maxQuantity: parseInt(row.maxQuantity || 0),
            lastRefill: row.lastRefill,
            status: row.status,
            expiryDate: row.expiryDate || row.batchExpiryDate,
            batchId: row.batchId,
            batchNumber: row.batchNumber,
            mhdStatus: row.mhd_status,
            vendonId: row.vendonId,
            selectionNumber: row.selectionNumber
          }));
        }
        
        console.log(`[MACHINES API] 📦 Gesamt Fallback: ${formattedStock.length} Produkte aus lokalen Daten`);
      } catch (localError) {
        console.log('[MACHINES API] ❌ Auch lokale Daten nicht verfügbar');
        formattedStock = [];
      }
    }

    console.log(`[MACHINES API] Found ${formattedStock.length} stock entries for machine ${machineInternalId}`);
    res.json(formattedStock);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching stock for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden des Warenbestands',
      message: errorMessage
    });
  }
});


/**
 * GET /api/machines/:id/removed-products
 * Get removed products for a specific machine
 */
router.get('/:id/removed-products', async (req, res) => {
  try {
    const inputId = req.params.id;
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 50;

    console.log(`[MACHINES API] Fetching removed products for machine ID: ${inputId}, last ${days} days`);

    // Resolve machine ID
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden'
      });
    }

    // Get removed products from refill_details or similar table
    let removedProductsResult;
    try {
      removedProductsResult = await rawDb.query(
        `SELECT 
          rd.id,
          r.datetime,
          rd.product_name as "productName",
          rd.removed as "removedQuantity",
          r.operator,
          COALESCE(NULLIF(rd.position, ''), 'Position ' || ROW_NUMBER() OVER (PARTITION BY rd.refill_id ORDER BY rd.id)) as "position",
          COALESCE(pc.unit_price, 0) as "purchasePrice"
        FROM refill_details rd
        JOIN refills r ON rd.refill_id = r.id
        LEFT JOIN products p ON rd.product_name = p.product_name
        LEFT JOIN LATERAL (
          SELECT unit_price
          FROM purchase_conditions pc_sub 
          WHERE pc_sub.product_id = p.id 
          ORDER BY pc_sub.is_preferred DESC, pc_sub.unit_price ASC 
          LIMIT 1
        ) pc ON true
        WHERE r.machine_id = $1 
        AND r.datetime >= CURRENT_DATE - INTERVAL '${days} days'
        AND rd.removed > 0
        ORDER BY r.datetime DESC, rd.product_name, rd.id
        LIMIT $2`,
        [machineInternalId!, limit]
      );
    } catch (error) {
      console.log('[MACHINES API] refill_details table not available, using empty result');
      removedProductsResult = { rows: [] };
    }

    const formattedRemovedProducts = removedProductsResult.rows.map(row => ({
      id: row.id,
      datetime: row.datetime,
      productName: row.productName,
      removedQuantity: parseInt(row.removedQuantity),
      operator: row.operator,
      position: row.position || '-',
      purchasePrice: parseFloat(row.purchasePrice) || 0,
      value: (parseInt(row.removedQuantity) || 0) * (parseFloat(row.purchasePrice) || 0)
    }));

    console.log(`[MACHINES API] Found ${formattedRemovedProducts.length} removed products for machine ${machineInternalId}`);
    res.json(formattedRemovedProducts);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching removed products for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der entnommenen Produkte',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/mhd
 * Get MHD (expiry date) entries for a specific machine
 */
router.get('/:id/mhd', async (req, res) => {
  try {
    const inputId = req.params.id;

    console.log(`[MHD API] Fetching MHD entries for machine ID: ${inputId}`);

    // Resolve machine ID (reuse logic from stock endpoint)
    let machineInternalId: number | undefined;
    let vendonId: string | undefined;
    
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
        vendonId = machineCheck.rows[0].vendon_id;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id, vendon_id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
          vendonId = locationCheck.rows[0].vendon_id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
        vendonId = vendonCheck.rows[0].vendon_id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden'
      });
    }

    // Get current stock with FIFO batch allocation
    console.log(`[MHD API] Using FIFO logic to get MHD data for machine ${inputId}`);
    
    // Get Vendon stock data
    let vendonStock: any[] = [];
    try {
      const { fetchMachineProducts } = await import('../services/vendonAPI');
      const products = await fetchMachineProducts(parseInt(vendonId!));
      
      if (products && Array.isArray(products) && products.length > 0) {
        vendonStock = products;
        console.log(`[MHD API] ✅ Got ${vendonStock.length} products from Vendon API`);
      }
    } catch (error) {
      console.log(`[MHD API] ⚠️ Vendon API failed, using fallback data`);
    }

    // Process MHD data using FIFO allocation
    const mhdEntries: any[] = [];
    
    if (vendonStock.length > 0) {
      for (const product of vendonStock) {
        const currentQty = parseInt(product.amount) || parseInt(product.quantity) || parseInt(product.stock) || 0;
        
        if (currentQty > 0) {
          // Get FIFO batch allocation for products with stock
          const batchInfo = await calculateFifoBatchAllocation(rawDb, machineInternalId!, product.name, currentQty);
          
          if (batchInfo.batches && batchInfo.batches.length > 0) {
            // Create MHD entries for each allocated batch
            batchInfo.batches.forEach(batch => {
              const daysUntilExpiry = Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              
              let mhdStatus = 'good';
              if (daysUntilExpiry < 0) mhdStatus = 'expired';
              else if (daysUntilExpiry <= 7) mhdStatus = 'attention';
              else if (daysUntilExpiry <= 30) mhdStatus = 'warning';
              
              mhdEntries.push({
                id: batch.batchId || Date.now() + Math.random(), // Generate unique ID for frontend
                productName: product.name,
                expiryDate: new Date(batch.expiryDate).toISOString().split('T')[0], // Format: YYYY-MM-DD
                quantity: batch.allocatedQuantity,
                status: mhdStatus, // Status is now directly compatible with frontend
                batchNumber: batch.batchNumber,
                daysUntilExpiry: daysUntilExpiry,
                incomingDate: new Date(batch.incomingDate).toISOString().split('T')[0]
              });
            });
          }
        }
      }
    }

    // Sort by MHD date (earliest first)
    mhdEntries.sort((a, b) => new Date(a.mhd).getTime() - new Date(b.mhd).getTime());

    console.log(`[MHD API] ✅ Returning ${mhdEntries.length} MHD entries for machine ${inputId}`);
    res.json(mhdEntries);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching MHD entries for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der MHD-Daten',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/costs
 * Get costs for a specific machine
 */
router.get('/:id/costs', async (req, res) => {
  try {
    const inputId = req.params.id;

    console.log(`[MACHINES API] Fetching costs for machine ID: ${inputId}`);

    // Resolve machine ID
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }

    // Get costs from database
    const costs = await storage.getMachineCosts(machineInternalId);
    
    // Format costs for frontend compatibility
    const formattedCosts = costs.map(cost => ({
      id: cost.id,
      machine_location: cost.locationName,
      cost_type: cost.costType,
      amount: cost.amountNet,
      currency: cost.currency || 'EUR',
      frequency: cost.billingCycle,
      description: cost.description || '',
      is_active: cost.isActive,
      valid_from: cost.validFrom,
      valid_until: cost.validTo,
      created_at: cost.createdAt,
      updated_at: cost.updatedAt
    }));
    
    console.log(`[MACHINES API] Found ${formattedCosts.length} costs for machine ${machineInternalId}`);
    res.json(formattedCosts);

  } catch (error) {
    console.error(`[MACHINES API] Error fetching costs for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Kosten',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:id/costs
 * Add new cost entry for a machine
 */
router.post('/:id/costs', async (req, res) => {
  try {
    const inputId = req.params.id;
    const { costType, amount, frequency, description } = req.body;
    
    console.log(`[MACHINES API] Adding cost for machine ID: ${inputId}`, req.body);

    // Validate required fields
    if (!costType || !amount) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        message: 'Kostenart und Betrag sind erforderlich'
      });
    }

    // Resolve machine ID and get machine details
    let machineInternalId: number | undefined;
    let machineData: any;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id, machine_name, location_name FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
        machineData = machineCheck.rows[0];
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id, machine_name, location_name FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
          machineData = locationCheck.rows[0];
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id, machine_name, location_name FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
        machineData = vendonCheck.rows[0];
      }
    }

    if (!machineInternalId || !machineData) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }

    // Create cost entry
    const costData = {
      machineId: machineInternalId,
      machineName: machineData.machine_name,
      locationName: machineData.location_name || machineData.machine_name,
      costType: costType,
      costName: costType, // Use costType as costName
      amountNet: parseFloat(amount),
      amountGross: parseFloat(amount) * 1.19, // Add 19% VAT
      vatRate: 19,
      currency: 'EUR',
      validFrom: new Date().toISOString().split('T')[0], // Today's date
      billingCycle: frequency || 'monthly',
      category: costType,
      description: description || '',
      isActive: true,
      // @ts-ignore - User added by authenticate middleware
      createdBy: req.user?.id || null
    };

    const newCost = await storage.createMachineCost(costData);
    
    console.log(`[MACHINES API] Created new cost: ${newCost.id}`);
    res.json({ 
      success: true, 
      cost: {
        id: newCost.id,
        machine_location: newCost.locationName,
        cost_type: newCost.costType,
        amount: newCost.amountNet,
        currency: newCost.currency,
        frequency: newCost.billingCycle,
        description: newCost.description,
        is_active: newCost.isActive,
        valid_from: newCost.validFrom,
        valid_until: newCost.validTo,
        created_at: newCost.createdAt,
        updated_at: newCost.updatedAt
      }
    });

  } catch (error) {
    console.error(`[MACHINES API] Error adding cost for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Hinzufügen der Kosten',
      message: errorMessage
    });
  }
});

/**
 * PUT /api/machines/:id/costs/:costId
 * Update cost entry for a machine
 */
router.put('/:id/costs/:costId', async (req, res) => {
  try {
    const inputId = req.params.id;
    const costId = parseInt(req.params.costId);
    const { costType, amount, frequency, description } = req.body;
    
    console.log(`[MACHINES API] Updating cost ${costId} for machine ID: ${inputId}`, req.body);

    if (isNaN(costId)) {
      return res.status(400).json({
        error: 'Ungültige Kosten-ID'
      });
    }

    const updateData: any = {};
    if (costType !== undefined) {
      updateData.costType = costType;
      updateData.costName = costType;
    }
    if (amount !== undefined) {
      updateData.amountNet = parseFloat(amount);
      updateData.amountGross = parseFloat(amount) * 1.19;
    }
    if (frequency !== undefined) {
      updateData.billingCycle = frequency;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    const updatedCost = await storage.updateMachineCost(costId, updateData);
    
    console.log(`[MACHINES API] Updated cost: ${costId}`);
    res.json({ 
      success: true, 
      cost: {
        id: updatedCost.id,
        machine_location: updatedCost.locationName,
        cost_type: updatedCost.costType,
        amount: updatedCost.amountNet,
        currency: updatedCost.currency,
        frequency: updatedCost.billingCycle,
        description: updatedCost.description,
        is_active: updatedCost.isActive,
        valid_from: updatedCost.validFrom,
        valid_until: updatedCost.validTo,
        created_at: updatedCost.createdAt,
        updated_at: updatedCost.updatedAt
      }
    });

  } catch (error) {
    console.error(`[MACHINES API] Error updating cost for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Aktualisieren der Kosten',
      message: errorMessage
    });
  }
});

/**
 * DELETE /api/machines/:id/costs/:costId
 * Delete cost entry for a machine
 */
router.delete('/:id/costs/:costId', async (req, res) => {
  try {
    const inputId = req.params.id;
    const costId = parseInt(req.params.costId);
    
    console.log(`[MACHINES API] Deleting cost ${costId} for machine ID: ${inputId}`);

    if (isNaN(costId)) {
      return res.status(400).json({
        error: 'Ungültige Kosten-ID'
      });
    }

    const deleted = await storage.deleteMachineCost(costId);
    
    if (deleted) {
      console.log(`[MACHINES API] Deleted cost: ${costId}`);
      res.json({ success: true, message: 'Kosten erfolgreich gelöscht' });
    } else {
      res.status(404).json({ error: 'Kosten nicht gefunden' });
    }

  } catch (error) {
    console.error(`[MACHINES API] Error deleting cost for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Löschen der Kosten',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/profitability
 * Get profitability analysis for a specific machine within a date range
 */
router.get('/:id/profitability', async (req, res) => {
  try {
    const inputId = req.params.id;
    const { startDate, endDate, period } = req.query;
    
    console.log(`[MACHINES API] Fetching profitability for machine ID: ${inputId}, period: ${period}`);
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Start- und Enddatum sind erforderlich',
        message: 'Parameter startDate und endDate müssen angegeben werden'
      });
    }
    
    // Resolve machine ID using the existing logic
    let machineInternalId: number | undefined;
    const parsedId = parseInt(inputId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        machineInternalId = parsedId;
      } else {
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          machineInternalId = locationCheck.rows[0].id;
        }
      }
    }

    if (!machineInternalId) {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonCheck.rows.length > 0) {
        machineInternalId = vendonCheck.rows[0].id;
      }
    }

    if (!machineInternalId) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }
    
    // Calculate profitability metrics
    const profitabilityQuery = `
      WITH transaction_data AS (
        SELECT 
          COUNT(t.id) as transaction_count,
          SUM(t.quantity) as quantity_sold,
          -- Umsatz Brutto (Gross Revenue)
          SUM(t.price * t.quantity) as gross_revenue,
          -- Umsatz Netto ohne MwSt (Net Revenue without VAT)
          SUM(
            CASE 
              WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
              ELSE (t.price / 1.19) * t.quantity
            END
          ) as net_revenue_without_vat,
          -- Pfand-Umsatz (Deposit Revenue)
          SUM(COALESCE(p.deposit_price, 0) * t.quantity) as deposit_revenue,
          -- Wareneinsatz (Cost of Goods) - basiert auf Einkaufspreisen
          SUM(
            COALESCE(pc.unit_price, 
              CASE 
                WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * 0.65
                ELSE (t.price / 1.19) * 0.65
              END
            ) * t.quantity
          ) as cost_of_goods
        FROM transactions t
        LEFT JOIN products p ON t.product_name = p.product_name
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
        WHERE t.machine_id = $1 
          AND t.datetime >= $2 
          AND t.datetime <= $3
      ),
      location_costs AS (
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN lc.billing_cycle = 'monthly' THEN lc.amount_net
              WHEN lc.billing_cycle = 'yearly' THEN lc.amount_net / 12
              WHEN lc.billing_cycle = 'quarterly' THEN lc.amount_net / 3
              WHEN lc.billing_cycle = 'weekly' THEN lc.amount_net * 4.33
              ELSE lc.amount_net
            END
          ), 0) as monthly_costs
        FROM location_costs lc
        JOIN machines m ON m.location_name = lc.location_name OR m.location_address = lc.location_name
        WHERE m.id = $1 
          AND lc.is_active = true
          AND (lc.valid_to IS NULL OR lc.valid_to >= $2)
      )
      SELECT 
        td.gross_revenue,
        (td.net_revenue_without_vat - td.deposit_revenue) as net_revenue_without_deposit,
        td.deposit_revenue,
        td.cost_of_goods,
        -- Standort-Kosten (Location Costs) - anteilig für den Zeitraum
        (lc.monthly_costs * 
          EXTRACT(epoch FROM ($3::timestamp - $2::timestamp)) / 
          EXTRACT(epoch FROM interval '1 month')
        ) as location_costs,
        td.transaction_count,
        td.quantity_sold
      FROM transaction_data td, location_costs lc
    `;
    
    const result = await rawDb.query(profitabilityQuery, [
      machineInternalId,
      startDate,
      endDate
    ]);
    
    if (result.rows.length === 0) {
      return res.json({
        grossRevenue: 0,
        netRevenueWithoutDeposit: 0,
        costOfGoods: 0,
        locationCosts: 0,
        result: 0,
        margin: 0,
        period: String(period || 'custom')
      });
    }
    
    const data = result.rows[0];
    const grossRevenue = parseFloat(data.gross_revenue) || 0;
    const netRevenueWithoutDeposit = parseFloat(data.net_revenue_without_deposit) || 0;
    const costOfGoods = parseFloat(data.cost_of_goods) || 0;
    const locationCosts = parseFloat(data.location_costs) || 0;
    
    // Ergebnis = Netto-Umsatz ohne Pfand - Wareneinsatz - Standortkosten
    const result_value = netRevenueWithoutDeposit - costOfGoods - locationCosts;
    
    // Gewinnmarge = Ergebnis / Brutto-Umsatz * 100
    const margin = grossRevenue > 0 ? (result_value / grossRevenue) * 100 : 0;
    
    const profitabilityData = {
      grossRevenue,
      netRevenueWithoutDeposit,
      costOfGoods,
      locationCosts,
      result: result_value,
      margin,
      period: String(period || 'custom')
    };
    
    console.log(`[MACHINES API] Profitability calculated for machine ${machineInternalId}:`, {
      grossRevenue: profitabilityData.grossRevenue,
      netRevenue: profitabilityData.netRevenueWithoutDeposit,
      costOfGoods: profitabilityData.costOfGoods,
      locationCosts: profitabilityData.locationCosts,
      result: profitabilityData.result,
      margin: `${profitabilityData.margin.toFixed(1)}%`
    });
    
    res.json(profitabilityData);

  } catch (error) {
    console.error(`[MACHINES API] Error calculating profitability for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Rentabilitätsberechnung',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/cash
 * Get cash data for a machine from Vendon API
 */
router.get('/:id/cash', async (req, res) => {
  try {
    const inputId = req.params.id;
    console.log(`[MACHINES API] Fetching cash data for machine ID: ${inputId}`);

    // Resolve machine to get Vendon ID
    let vendonMachineId: string;
    
    const parsedId = parseInt(inputId);
    if (!isNaN(parsedId)) {
      // Check if it's an internal ID
      const machineCheck = await rawDb.query(
        'SELECT vendon_id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        vendonMachineId = machineCheck.rows[0].vendon_id;
      } else {
        // Try as location_id
        const locationCheck = await rawDb.query(
          'SELECT vendon_id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          vendonMachineId = locationCheck.rows[0].vendon_id;
        } else {
          // Use as vendon_id directly
          vendonMachineId = parsedId.toString();
        }
      }
    } else {
      // Use as vendon_id string directly
      vendonMachineId = inputId;
    }

    if (!vendonMachineId) {
      return res.status(404).json({ 
        error: 'Maschine nicht gefunden oder keine Vendon-ID verfügbar' 
      });
    }

    console.log(`[MACHINES API] Using Vendon machine ID: ${vendonMachineId} for cash data`);

    // Fetch cash data from Vendon API
    const cashData = await vendonAPI.getMachineCash(vendonMachineId);

    if (!cashData) {
      return res.status(404).json({ 
        error: 'Cash-Daten für diese Maschine nicht verfügbar',
        vendonMachineId 
      });
    }

    console.log(`[MACHINES API] Cash data retrieved for machine ${vendonMachineId}`);
    res.json({
      success: true,
      vendonMachineId,
      data: cashData
    });

  } catch (error) {
    console.error(`[MACHINES API] Error fetching cash data for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Abrufen der Cash-Daten',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/status
 * Get status data for a machine from Vendon API
 */
router.get('/:id/status', async (req, res) => {
  try {
    const inputId = req.params.id;
    console.log(`[MACHINES API] Fetching status data for machine ID: ${inputId}`);

    // Resolve machine to get Vendon ID
    let vendonMachineId: string;
    
    const parsedId = parseInt(inputId);
    if (!isNaN(parsedId)) {
      // Check if it's an internal ID
      const machineCheck = await rawDb.query(
        'SELECT vendon_id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0 && machineCheck.rows[0].vendon_id) {
        vendonMachineId = machineCheck.rows[0].vendon_id.toString();
      } else {
        // Try as location_id
        const locationCheck = await rawDb.query(
          'SELECT vendon_id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0 && locationCheck.rows[0].vendon_id) {
          vendonMachineId = locationCheck.rows[0].vendon_id.toString();
        } else {
          // Assume it's already a Vendon ID
          vendonMachineId = inputId;
        }
      }
    } else {
      vendonMachineId = inputId;
    }

    if (!vendonMachineId) {
      return res.status(404).json({ 
        error: 'Maschine nicht gefunden oder keine Vendon-ID verfügbar' 
      });
    }

    console.log(`[MACHINES API] Using Vendon machine ID: ${vendonMachineId} for status data`);

    // Fetch status data from Vendon API
    const statusData = await vendonAPI.getMachineStatus(vendonMachineId);

    if (!statusData) {
      return res.status(404).json({ 
        error: 'Status-Daten für diese Maschine nicht verfügbar',
        vendonMachineId 
      });
    }

    console.log(`[MACHINES API] Status data retrieved for machine ${vendonMachineId}`);
    res.json({
      success: true,
      vendonMachineId,
      data: statusData
    });

  } catch (error) {
    console.error(`[MACHINES API] Error fetching status data for machine ${req.params.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Abrufen der Status-Daten',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/:id/warehouse
 * Get the primary warehouse assignment for a machine
 */
router.get('/:id/warehouse', async (req, res) => {
  try {
    const inputId = req.params.id;
    console.log(`[MACHINES API] Fetching primary warehouse assignment for machine ID: ${inputId}`);

    // Try to resolve machine ID using the existing resolver logic
    let machineId: number;
    let machine: any;

    // First try as internal ID
    const parsedId = parseInt(inputId);
    if (!isNaN(parsedId)) {
      const machineResult = await rawDb.query(
        'SELECT * FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineResult.rows.length > 0) {
        machine = machineResult.rows[0];
        machineId = parsedId;
      }
    }

    // If not found, try as vendon_id
    if (!machine) {
      const vendonResult = await rawDb.query(
        'SELECT * FROM machines WHERE vendon_id = $1 LIMIT 1',
        [inputId]
      );
      
      if (vendonResult.rows.length > 0) {
        machine = vendonResult.rows[0];
        machineId = machine.id;
      }
    }

    // If still not found, try as location_id
    if (!machine && !isNaN(parsedId)) {
      const locationResult = await rawDb.query(
        'SELECT * FROM machines WHERE location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (locationResult.rows.length > 0) {
        machine = locationResult.rows[0];
        machineId = machine.id;
      }
    }

    if (!machine) {
      return res.status(404).json({
        error: 'Maschine nicht gefunden',
        message: `Keine Maschine mit ID ${inputId} gefunden`
      });
    }

    // Query for the primary warehouse assignment using camelCase SQL aliases
    const assignmentResult = await rawDb.query(`
      SELECT 
        mwa.id,
        mwa.machine_id AS "machineId",
        mwa.warehouse_id AS "warehouseId", 
        mwa.is_primary AS "isPrimary",
        mwa.notes,
        mwa.assigned_by AS "assignedBy",
        mwa.assigned_at AS "assignedAt",
        w.name AS "warehouseName",
        w.description AS "warehouseDescription",
        w.address AS "warehouseLocation"
      FROM machine_warehouse_assignments mwa
      INNER JOIN warehouses w ON mwa.warehouse_id = w.id
      WHERE mwa.machine_id = $1 AND mwa.is_primary = true
      LIMIT 1
    `, [machineId]);

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Keine primäre Lager-Zuweisung gefunden',
        message: `Keine primäre Lager-Zuweisung für Maschine ${machine.machine_name || inputId} gefunden`
      });
    }

    const assignment = assignmentResult.rows[0];
    console.log(`[MACHINES API] Primary warehouse assignment found for machine ${inputId}:`, assignment.warehouseName);
    
    res.json(assignment);

  } catch (error: any) {
    console.error(`[MACHINES API] Error fetching warehouse assignment for machine ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Lager-Zuweisung',
      message: error.message
    });
  }
});

export default router;
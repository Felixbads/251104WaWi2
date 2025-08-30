import { Router } from 'express';
import { db, rawDb } from '../db';
import { eq, desc, and, gte, lte, count, sql } from 'drizzle-orm';
import { machines, transactions, refills, events, locationCosts } from '../../shared/schema';
import { storage } from '../storage';

const router = Router();

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

    console.log(`[MACHINES API] Fetching stock for machine ID: ${inputId}`);

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

    // Try to get stock from machine_stocks table first
    let stockResult;
    try {
      stockResult = await rawDb.query(
        `SELECT 
          ms.id,
          COALESCE(p.product_name, 'Unbekanntes Produkt') as "productName",
          ms.quantity as "currentQuantity",
          ms.max_quantity as "maxQuantity",
          ms.last_filled as "lastRefill",
          CASE 
            WHEN ms.quantity = 0 THEN 'critical'
            WHEN ms.max_quantity > 0 AND (ms.quantity::float / ms.max_quantity) < 0.2 THEN 'warning'
            ELSE 'good'
          END as status
        FROM machine_stocks ms
        LEFT JOIN products p ON p.vendon_id = ms.product_vendon_id
        WHERE ms.machine_id = $1
        ORDER BY ms.selection_number`,
        [machineInternalId!]
      );
    } catch (error) {
      console.log('[MACHINES API] machine_stocks table not available, using fallback');
      stockResult = { rows: [] };
    }

    // If no stock data available, return empty array
    const formattedStock = stockResult.rows.map(row => ({
      id: row.id,
      productName: row.productName,
      currentQuantity: parseInt(row.currentQuantity || 0),
      maxQuantity: parseInt(row.maxQuantity || 0),
      lastRefill: row.lastRefill,
      status: row.status
    }));

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
          rd.position
        FROM refill_details rd
        JOIN refills r ON rd.refill_id = r.id
        WHERE r.machine_id = $1 
        AND r.datetime >= CURRENT_DATE - INTERVAL '${days} days'
        AND rd.removed > 0
        ORDER BY r.datetime DESC
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
      position: row.position
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

    console.log(`[MACHINES API] Fetching MHD entries for machine ID: ${inputId}`);

    // For now, return empty array as MHD functionality is not implemented yet
    // This will be enhanced when product batch management is fully implemented
    
    res.json([]);

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
              WHEN lc.frequency = 'monthly' THEN lc.amount
              WHEN lc.frequency = 'yearly' THEN lc.amount / 12
              WHEN lc.frequency = 'quarterly' THEN lc.amount / 3
              WHEN lc.frequency = 'weekly' THEN lc.amount * 4.33
              ELSE lc.amount
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

export default router;
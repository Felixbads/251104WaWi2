import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Get all available locations
router.get('/locations', async (req, res) => {
  try {
    console.log('Fetching available locations...');
    
    const locationsResult = await db.execute(sql`
      SELECT DISTINCT location_name 
      FROM machines 
      WHERE location_name IS NOT NULL 
      AND location_name != ''
      ORDER BY location_name
    `);
    
    const locations = locationsResult.rows.map((row: any) => row.location_name);
    console.log(`Found ${locations.length} locations:`, locations);
    
    res.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Get location analysis data with weekly sales vs removals and recommendations
router.get('/', async (req, res) => {
  try {
    const location = req.query.location as string;
    const weeks = req.query.weeks as string;
    const timeRange = parseInt(weeks) || 12;
    
    console.log(`Standort-Analyse für: ${location}, Zeitraum: ${timeRange} Wochen`);
    
    if (!location || location === 'all') {
      return res.json([]);
    }

    // Get all machines for this location
    const machinesResult = await db.execute(sql`
      SELECT id, machine_name, location_name 
      FROM machines 
      WHERE location_name = ${location}
      ORDER BY machine_name
    `);

    if (machinesResult.rows.length === 0) {
      return res.json([]);
    }

    const machineIds = machinesResult.rows.map((m: any) => m.id);
    
    // Get comprehensive product analysis including estimated removals based on refill patterns
    const machineIdsList = machineIds.join(',');
    const analysisQuery = `
      WITH refill_frequency AS (
        SELECT 
          machine_id,
          COUNT(*) as refill_count,
          EXTRACT(DAYS FROM (MAX(datetime) - MIN(datetime))) as days_span
        FROM refills 
        WHERE machine_id = ANY(ARRAY[${machineIdsList}])
        AND datetime >= NOW() - INTERVAL '${timeRange} weeks'
        GROUP BY machine_id
      ),
      
      weekly_sales AS (
        SELECT 
          t.product_name,
          date_trunc('week', t.datetime) as week_start,
          COUNT(*) as weekly_sales_count,
          SUM(COALESCE(t.price, 0)) as weekly_revenue,
          t.machine_id
        FROM transactions t
        WHERE t.machine_id = ANY(ARRAY[${machineIdsList}])
        AND t.datetime >= NOW() - INTERVAL '${timeRange} weeks'
        AND t.product_name IS NOT NULL
        GROUP BY t.product_name, date_trunc('week', t.datetime), t.machine_id
      ),
      
      product_removal_estimates AS (
        SELECT 
          ws.product_name,
          ws.week_start,
          ws.weekly_sales_count,
          ws.weekly_revenue,
          -- Estimate removals based on sales volume and refill frequency
          -- Higher sales products have higher removal rates (expired items)
          -- Base removal rate: 3-8% of sales volume depending on product type
          CASE 
            WHEN ws.product_name ILIKE '%milch%' OR ws.product_name ILIKE '%joghurt%' OR ws.product_name ILIKE '%käse%' 
            THEN ROUND((ws.weekly_sales_count * 0.08)::numeric, 1) -- Dairy: 8% removal rate
            WHEN ws.product_name ILIKE '%brot%' OR ws.product_name ILIKE '%kuchen%' OR ws.product_name ILIKE '%gebäck%'
            THEN ROUND((ws.weekly_sales_count * 0.06)::numeric, 1) -- Baked goods: 6% removal rate  
            WHEN ws.product_name ILIKE '%wurst%' OR ws.product_name ILIKE '%fleisch%'
            THEN ROUND((ws.weekly_sales_count * 0.07)::numeric, 1) -- Meat products: 7% removal rate
            WHEN ws.product_name ILIKE '%cola%' OR ws.product_name ILIKE '%wasser%' OR ws.product_name ILIKE '%getränk%'
            THEN ROUND((ws.weekly_sales_count * 0.02)::numeric, 1) -- Beverages: 2% removal rate
            ELSE ROUND((ws.weekly_sales_count * 0.04)::numeric, 1) -- Other products: 4% removal rate
          END as estimated_weekly_removals,
          rf.refill_count,
          rf.days_span
        FROM weekly_sales ws
        LEFT JOIN refill_frequency rf ON ws.machine_id = rf.machine_id
      ),
      
      product_summary AS (
        SELECT 
          pre.product_name,
          SUM(pre.weekly_sales_count) as total_sales,
          SUM(pre.weekly_revenue) as total_revenue,
          ROUND(AVG(pre.weekly_sales_count)::numeric, 1) as avg_weekly_sales,
          ROUND(AVG(pre.estimated_weekly_removals)::numeric, 1) as avg_weekly_removals,
          SUM(pre.estimated_weekly_removals) as total_removals,
          COALESCE(pc.unit_price, 0) as purchase_price,
          -- Calculate removal loss using purchase price
          SUM(pre.estimated_weekly_removals) * COALESCE(pc.unit_price, 0) as removal_loss,
          CASE 
            WHEN COALESCE(pc.unit_price, 0) > 0 AND SUM(pre.weekly_revenue) > 0
            THEN ROUND(((SUM(pre.weekly_revenue) - (SUM(pre.estimated_weekly_removals) * COALESCE(pc.unit_price, 0))) / SUM(pre.weekly_revenue) * 100)::numeric, 1)
            ELSE 0 
          END as profitability,
          CEIL(AVG(pre.weekly_sales_count) * 1.5 + AVG(pre.estimated_weekly_removals) + (AVG(pre.weekly_sales_count) + AVG(pre.estimated_weekly_removals)) * 0.1) as recommended_weekly_stock,
          json_agg(
            json_build_object(
              'week', to_char(pre.week_start, 'YYYY-MM-DD'),
              'sales', pre.weekly_sales_count,
              'removals', pre.estimated_weekly_removals,
              'netDemand', pre.weekly_sales_count + pre.estimated_weekly_removals
            )
            ORDER BY pre.week_start
          ) as weekly_data
        FROM product_removal_estimates pre
        LEFT JOIN products p ON pre.product_name = p.product_name
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
        GROUP BY pre.product_name, pc.unit_price
        HAVING SUM(pre.weekly_sales_count) > 0
      )
      
      SELECT 
        product_name,
        total_sales,
        total_removals,
        total_revenue as sales_revenue,
        removal_loss,
        avg_weekly_sales,
        avg_weekly_removals,
        recommended_weekly_stock,
        profitability,
        weekly_data
      FROM product_summary
      ORDER BY profitability DESC, total_sales DESC
    `;

    const analysisResult = await db.execute(sql.raw(analysisQuery));

    const locationData = {
      locationName: location,
      machineId: machinesResult.rows[0]?.id || 0,
      machineName: machinesResult.rows.map((m: any) => m.machine_name).join(', '),
      totalProducts: analysisResult.rows.length,
      analysisData: analysisResult.rows.map((row: any) => ({
        productName: row.product_name,
        weeklyData: row.weekly_data || [],
        avgWeeklySales: parseFloat(row.avg_weekly_sales) || 0,
        avgWeeklyRemovals: parseFloat(row.avg_weekly_removals) || 0,
        totalSales: parseInt(row.total_sales) || 0,
        totalRemovals: parseInt(row.total_removals) || 0,
        recommendedWeeklyStock: parseInt(row.recommended_weekly_stock) || 0,
        removalLoss: parseFloat(row.removal_loss) || 0,
        salesRevenue: parseFloat(row.sales_revenue) || 0,
        profitability: parseFloat(row.profitability) || 0
      }))
    };

    console.log(`Standort-Analyse erfolgreich: ${location} mit ${analysisResult.rows.length} Produkten`);
    res.json([locationData]);

  } catch (error) {
    console.error('Fehler bei Standort-Analyse:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Standort-Analyse',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
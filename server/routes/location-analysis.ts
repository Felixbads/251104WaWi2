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
    
    // Get comprehensive product analysis for this location based on sales data
    const analysisResult = await db.execute(sql`
      WITH weekly_sales AS (
        SELECT 
          t.product_name,
          date_trunc('week', t.datetime) as week_start,
          COUNT(*) as weekly_sales_count,
          SUM(COALESCE(t.price, 0)) as weekly_revenue
        FROM transactions t
        WHERE t.machine_id = ANY(${machineIds})
        AND t.datetime >= NOW() - INTERVAL '${timeRange} weeks'
        AND t.product_name IS NOT NULL
        GROUP BY t.product_name, date_trunc('week', t.datetime)
      ),
      
      product_summary AS (
        SELECT 
          ws.product_name,
          SUM(ws.weekly_sales_count) as total_sales,
          SUM(ws.weekly_revenue) as total_revenue,
          ROUND(AVG(ws.weekly_sales_count)::numeric, 1) as avg_weekly_sales,
          COALESCE(pc.unit_price, 0) as purchase_price,
          CASE 
            WHEN COALESCE(pc.unit_price, 0) > 0 AND SUM(ws.weekly_revenue) > 0
            THEN ROUND(((SUM(ws.weekly_revenue) / SUM(ws.weekly_sales_count) - COALESCE(pc.unit_price, 0)) / COALESCE(pc.unit_price, 0) * 100)::numeric, 1)
            ELSE 0 
          END as profitability,
          CEIL(AVG(ws.weekly_sales_count) * 1.5 + AVG(ws.weekly_sales_count) * 0.1) as recommended_weekly_stock,
          json_agg(
            json_build_object(
              'week', to_char(ws.week_start, 'YYYY-MM-DD'),
              'sales', ws.weekly_sales_count,
              'removals', 0,
              'netDemand', ws.weekly_sales_count
            )
            ORDER BY ws.week_start
          ) as weekly_data
        FROM weekly_sales ws
        LEFT JOIN products p ON ws.product_name = p.product_name
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
        GROUP BY ws.product_name, pc.unit_price
        HAVING SUM(ws.weekly_sales_count) > 0
      )
      
      SELECT 
        product_name,
        total_sales,
        0 as total_removals,
        total_revenue as sales_revenue,
        0 as removal_loss,
        avg_weekly_sales,
        0 as avg_weekly_removals,
        recommended_weekly_stock,
        profitability,
        weekly_data
      FROM product_summary
      ORDER BY profitability DESC, total_sales DESC
    `);

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
        removalLoss: parseFloat(row.total_loss) || 0,
        salesRevenue: parseFloat(row.total_revenue) || 0,
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
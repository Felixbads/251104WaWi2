import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Get location analysis data with weekly sales vs removals and recommendations
router.get('/:location/:weeks', async (req, res) => {
  try {
    const { location, weeks } = req.params;
    const timeRange = parseInt(weeks) || 12;
    
    console.log(`Standort-Analyse für: ${location}, Zeitraum: ${timeRange} Wochen`);

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
    
    // Get comprehensive product analysis for this location
    const analysisResult = await db.execute(sql`
      WITH weekly_intervals AS (
        SELECT 
          date_trunc('week', generate_series(
            NOW() - INTERVAL '${timeRange} weeks',
            NOW(),
            '1 week'::interval
          )) as week_start
      ),
      
      sales_data AS (
        SELECT 
          date_trunc('week', t.datetime) as week_start,
          t.product_name,
          COUNT(*) as sales_count,
          SUM(COALESCE(t.price, 0)) as sales_revenue
        FROM transactions t
        WHERE t.machine_id = ANY(${machineIds})
        AND t.datetime >= NOW() - INTERVAL '${timeRange} weeks'
        GROUP BY date_trunc('week', t.datetime), t.product_name
      ),
      
      removal_data AS (
        SELECT 
          date_trunc('week', r.datetime) as week_start,
          r.product_name,
          SUM(r.quantity) as removal_count,
          SUM(r.quantity * COALESCE(pc.unit_price, 0)) as removal_loss
        FROM refills r
        LEFT JOIN products p ON r.product_name = p.product_name
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE r.machine_id = ANY(${machineIds})
        AND r.type = 'removal'
        AND r.datetime >= NOW() - INTERVAL '${timeRange} weeks'
        GROUP BY date_trunc('week', r.datetime), r.product_name
      ),
      
      all_products AS (
        SELECT DISTINCT product_name FROM sales_data
        UNION
        SELECT DISTINCT product_name FROM removal_data
      ),
      
      weekly_product_data AS (
        SELECT 
          wi.week_start,
          ap.product_name,
          COALESCE(sd.sales_count, 0) as sales,
          COALESCE(sd.sales_revenue, 0) as revenue,
          COALESCE(rd.removal_count, 0) as removals,
          COALESCE(rd.removal_loss, 0) as loss
        FROM weekly_intervals wi
        CROSS JOIN all_products ap
        LEFT JOIN sales_data sd ON wi.week_start = sd.week_start AND ap.product_name = sd.product_name
        LEFT JOIN removal_data rd ON wi.week_start = rd.week_start AND ap.product_name = rd.product_name
      ),
      
      product_summary AS (
        SELECT 
          product_name,
          ROUND(AVG(sales)::numeric, 1) as avg_weekly_sales,
          ROUND(AVG(removals)::numeric, 1) as avg_weekly_removals,
          SUM(sales) as total_sales,
          SUM(removals) as total_removals,
          SUM(revenue) as total_revenue,
          SUM(loss) as total_loss,
          -- Calculate recommended weekly stock (1.5x avg sales + 1x avg removals + 10% buffer)
          CEIL((AVG(sales) * 1.5 + AVG(removals) + (AVG(sales) + AVG(removals)) * 0.1))::integer as recommended_weekly_stock,
          -- Calculate profitability ratio
          CASE 
            WHEN SUM(loss) > 0 THEN 
              ROUND(((SUM(revenue) - SUM(loss)) / SUM(revenue) * 100)::numeric, 1)
            ELSE 
              ROUND((SUM(revenue) / GREATEST(SUM(revenue), 1) * 100)::numeric, 1)
          END as profitability
        FROM weekly_product_data
        WHERE product_name IS NOT NULL
        GROUP BY product_name
        HAVING SUM(sales) > 0 OR SUM(removals) > 0
      )
      
      SELECT 
        ps.*,
        json_agg(
          json_build_object(
            'week', to_char(wpd.week_start, 'YYYY-MM-DD'),
            'sales', wpd.sales,
            'removals', wpd.removals,
            'netDemand', wpd.sales - wpd.removals
          )
          ORDER BY wpd.week_start
        ) as weekly_data
      FROM product_summary ps
      LEFT JOIN weekly_product_data wpd ON ps.product_name = wpd.product_name
      GROUP BY ps.product_name, ps.avg_weekly_sales, ps.avg_weekly_removals, 
               ps.total_sales, ps.total_removals, ps.total_revenue, ps.total_loss,
               ps.recommended_weekly_stock, ps.profitability
      ORDER BY ps.profitability DESC, ps.total_sales DESC
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
/**
 * LIEFERANTEN-ANALYTICS API
 * Umfassende Statistiken für Lieferanten-Performance-Analyse
 */

import { Router } from 'express';
import { z } from 'zod';
import { rawDb } from '../db';

const router = Router();

// Dashboard-Statistiken für Lieferanten
router.get('/dashboard/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const timeRange = req.query.timeRange || '12months';
    
    // Grundlegende Statistiken basierend auf Transaktionen (echte Verkäufe)
    const overviewQuery = `
      SELECT 
        COUNT(t.id) as total_orders,
        SUM(t.price) as total_revenue,
        AVG(t.price) as avg_order_value,
        COUNT(DISTINCT t.product_name) as products_sold
      FROM transactions t
      WHERE t.product_name IN (
        SELECT p.product_name FROM products p WHERE p.supplier_id = $1
      ) AND t.datetime >= NOW() - INTERVAL '12 months'
    `;
    
    const overviewResult = await rawDb.query(overviewQuery, [supplierId]);
    
    // Monatliche Umsätze basierend auf echten Verkäufen
    const monthlyRevenueQuery = `
      SELECT 
        DATE_TRUNC('month', t.datetime) as month,
        SUM(t.price) as revenue,
        COUNT(t.id) as orders,
        AVG(t.price) as avg_order_value
      FROM transactions t
      WHERE t.product_name IN (
        SELECT p.product_name FROM products p WHERE p.supplier_id = $1
      ) AND t.datetime >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', t.datetime)
      ORDER BY month DESC
    `;
    
    const monthlyResult = await rawDb.query(monthlyRevenueQuery, [supplierId]);
    
    // Top-Produkte Performance  
    const productsQuery = `
      SELECT 
        p.id as product_id,
        p.product_name,
        COUNT(t.id) as quantity_sold,
        SUM(t.price) as revenue,
        AVG(t.price) as avg_price,
        (COUNT(t.id) * 100.0 / (
          SELECT COUNT(*) FROM transactions t2 
          WHERE t2.product_name IN (
            SELECT p2.product_name FROM products p2 WHERE p2.supplier_id = $1
          )
        )) as market_share
      FROM products p
      LEFT JOIN transactions t ON t.product_name = p.product_name
      WHERE p.supplier_id = $1
        AND t.datetime >= NOW() - INTERVAL '12 months'
        AND t.id IS NOT NULL
      GROUP BY p.id, p.product_name
      ORDER BY revenue DESC
      LIMIT 10
    `;
    
    const productsResult = await rawDb.query(productsQuery, [supplierId]);
    
    res.json({
      overview: overviewResult.rows[0] || {
        total_orders: 0,
        total_revenue: 0,
        avg_order_value: 0,
        products_sold: 0
      },
      monthlyRevenue: monthlyResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue) || 0,
        orders: parseInt(row.orders) || 0,
        avgOrderValue: parseFloat(row.avg_order_value) || 0
      })),
      productPerformance: productsResult.rows.map(row => ({
        productId: row.product_id,
        productName: row.product_name,
        quantitySold: parseInt(row.quantity_sold) || 0,
        revenue: parseFloat(row.revenue) || 0,
        avgPrice: parseFloat(row.avg_price) || 0,
        marketShare: parseFloat(row.market_share) || 0
      }))
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Lieferanten-Dashboard-Statistiken:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
  }
});

// Standort-Analyse für Lieferanten
router.get('/location-analysis/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    // Verkaufsperformance nach Standorten (ohne Duplikate)
    const locationPerformanceQuery = `
      SELECT 
        m.machine_name as location_name,
        COUNT(t.id) as total_sales,
        SUM(t.price) as total_revenue,
        AVG(t.price) as avg_transaction_value,
        COUNT(DISTINCT DATE(t.datetime)) as active_days,
        (COUNT(t.id) * 100.0 / (
          SELECT COUNT(*) FROM transactions t2 
          INNER JOIN machines m2 ON t2.machine_id = m2.id
          WHERE m2.machine_name = m.machine_name
        )) as supplier_share
      FROM machines m
      INNER JOIN transactions t ON t.machine_id = m.id
      INNER JOIN products p ON p.product_name = t.product_name
      WHERE p.supplier_id = $1
        AND t.datetime >= NOW() - INTERVAL '6 months'
      GROUP BY m.machine_name
      HAVING COUNT(t.id) > 0
      ORDER BY total_revenue DESC
    `;
    
    const locationResult = await rawDb.query(locationPerformanceQuery, [supplierId]);
    
    // Geografische Verteilung entfernt (sinnlos laut Benutzer)
    
    // Beste und schlechteste Standorte (ohne Duplikate)
    const topBottomQuery = `
      WITH ranked_locations AS (
        SELECT 
          m.machine_name,
          SUM(t.price) as revenue,
          COUNT(t.id) as transactions,
          ROW_NUMBER() OVER (ORDER BY SUM(t.price) DESC) as rank_desc,
          ROW_NUMBER() OVER (ORDER BY SUM(t.price) ASC) as rank_asc
        FROM machines m
        INNER JOIN transactions t ON t.machine_id = m.id
        INNER JOIN products p ON p.product_name = t.product_name
        WHERE p.supplier_id = $1
          AND t.datetime >= NOW() - INTERVAL '6 months'
        GROUP BY m.machine_name
        HAVING COUNT(t.id) > 0
      )
      SELECT 
        machine_name,
        revenue,
        transactions,
        CASE WHEN rank_desc <= 3 THEN 'top' ELSE 'bottom' END as category
      FROM ranked_locations
      WHERE rank_desc <= 3 OR rank_asc <= 3
      ORDER BY revenue DESC
    `;
    
    const topBottomResult = await rawDb.query(topBottomQuery, [supplierId]);
    
    res.json({
      locationPerformance: locationResult.rows.map(row => ({
        locationName: row.location_name,
        totalSales: parseInt(row.total_sales) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        avgTransactionValue: parseFloat(row.avg_transaction_value) || 0,
        activeDays: parseInt(row.active_days) || 0,
        supplierShare: parseFloat(row.supplier_share) || 0
      })),
      topPerformers: topBottomResult.rows
        .filter(row => row.category === 'top')
        .map(row => ({
          locationName: row.machine_name,
          revenue: parseFloat(row.revenue) || 0,
          transactions: parseInt(row.transactions) || 0
        })),
      underPerformers: topBottomResult.rows
        .filter(row => row.category === 'bottom')
        .map(row => ({
          locationName: row.machine_name,
          revenue: parseFloat(row.revenue) || 0,
          transactions: parseInt(row.transactions) || 0
        }))
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Standort-Analyse:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Standort-Analyse' });
  }
});

// Trend-Pattern-Analyse für Lieferanten
router.get('/trend-patterns/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    // Wochentag-Analyse
    const weekdayQuery = `
      SELECT 
        EXTRACT(DOW FROM t.datetime) as day_of_week,
        CASE EXTRACT(DOW FROM t.datetime)
          WHEN 0 THEN 'Sonntag'
          WHEN 1 THEN 'Montag' 
          WHEN 2 THEN 'Dienstag'
          WHEN 3 THEN 'Mittwoch'
          WHEN 4 THEN 'Donnerstag'
          WHEN 5 THEN 'Freitag'
          WHEN 6 THEN 'Samstag'
        END as weekday_name,
        COUNT(t.id) as transactions,
        SUM(t.price) as revenue,
        AVG(t.price) as avg_transaction
      FROM transactions t
      WHERE t.product_name IN (
        SELECT p.product_name FROM products p WHERE p.supplier_id = $1
      ) AND t.datetime >= NOW() - INTERVAL '3 months'
      GROUP BY EXTRACT(DOW FROM t.datetime), 
        CASE EXTRACT(DOW FROM t.datetime)
          WHEN 0 THEN 'Sonntag'
          WHEN 1 THEN 'Montag' 
          WHEN 2 THEN 'Dienstag'
          WHEN 3 THEN 'Mittwoch'
          WHEN 4 THEN 'Donnerstag'
          WHEN 5 THEN 'Freitag'
          WHEN 6 THEN 'Samstag'
        END
      ORDER BY day_of_week
    `;
    
    const weekdayResult = await rawDb.query(weekdayQuery, [supplierId]);
    
    // Stunden-Analyse
    const hourlyQuery = `
      SELECT 
        EXTRACT(HOUR FROM t.datetime) as hour,
        COUNT(t.id) as transactions,
        SUM(t.price) as revenue
      FROM transactions t
      WHERE t.product_name IN (
        SELECT p.product_name FROM products p WHERE p.supplier_id = $1
      ) AND t.datetime >= NOW() - INTERVAL '1 month'
      GROUP BY EXTRACT(HOUR FROM t.datetime)
      ORDER BY hour
    `;
    
    const hourlyResult = await rawDb.query(hourlyQuery, [supplierId]);
    
    // Monatliche Trends
    const monthlyTrendQuery = `
      WITH monthly_data AS (
        SELECT 
          DATE_TRUNC('month', t.datetime) as month,
          SUM(t.price) as revenue,
          COUNT(t.id) as transactions
        FROM transactions t
        WHERE t.product_name IN (
          SELECT p.product_name FROM products p WHERE p.supplier_id = $1
        ) AND t.datetime >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', t.datetime)
        ORDER BY month
      ),
      with_growth AS (
        SELECT 
          month,
          revenue,
          transactions,
          LAG(revenue) OVER (ORDER BY month) as prev_revenue,
          LAG(transactions) OVER (ORDER BY month) as prev_transactions
        FROM monthly_data
      )
      SELECT 
        month,
        revenue,
        transactions,
        CASE 
          WHEN prev_revenue IS NOT NULL AND prev_revenue > 0 
          THEN ((revenue - prev_revenue) / prev_revenue * 100)
          ELSE 0 
        END as revenue_growth,
        CASE 
          WHEN prev_transactions IS NOT NULL AND prev_transactions > 0 
          THEN ((transactions - prev_transactions) / prev_transactions * 100)
          ELSE 0 
        END as transaction_growth
      FROM with_growth
    `;
    
    const monthlyTrendResult = await rawDb.query(monthlyTrendQuery, [supplierId]);
    
    // Saisonale Muster
    const seasonalQuery = `
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM t.datetime) IN (12, 1, 2) THEN 'Winter'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (3, 4, 5) THEN 'Frühling'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (6, 7, 8) THEN 'Sommer'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (9, 10, 11) THEN 'Herbst'
        END as season,
        COUNT(t.id) as transactions,
        SUM(t.price) as revenue,
        AVG(t.price) as avg_transaction
      FROM transactions t
      WHERE t.product_name IN (
        SELECT p.product_name FROM products p WHERE p.supplier_id = $1
      ) AND t.datetime >= NOW() - INTERVAL '12 months'
      GROUP BY 
        CASE 
          WHEN EXTRACT(MONTH FROM t.datetime) IN (12, 1, 2) THEN 'Winter'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (3, 4, 5) THEN 'Frühling'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (6, 7, 8) THEN 'Sommer'
          WHEN EXTRACT(MONTH FROM t.datetime) IN (9, 10, 11) THEN 'Herbst'
        END
      ORDER BY 
        MIN(EXTRACT(MONTH FROM t.datetime))
    `;
    
    const seasonalResult = await rawDb.query(seasonalQuery, [supplierId]);
    
    res.json({
      weekdayPatterns: weekdayResult.rows.map(row => ({
        dayOfWeek: parseInt(row.day_of_week),
        weekdayName: row.weekday_name,
        transactions: parseInt(row.transactions) || 0,
        revenue: parseFloat(row.revenue) || 0,
        avgTransaction: parseFloat(row.avg_transaction) || 0
      })),
      hourlyPatterns: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        transactions: parseInt(row.transactions) || 0,
        revenue: parseFloat(row.revenue) || 0
      })),
      monthlyTrends: monthlyTrendResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue) || 0,
        transactions: parseInt(row.transactions) || 0,
        revenueGrowth: parseFloat(row.revenue_growth) || 0,
        transactionGrowth: parseFloat(row.transaction_growth) || 0
      })),
      seasonalPatterns: seasonalResult.rows.map(row => ({
        season: row.season,
        transactions: parseInt(row.transactions) || 0,
        revenue: parseFloat(row.revenue) || 0,
        avgTransaction: parseFloat(row.avg_transaction) || 0
      }))
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Trend-Pattern-Analyse:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Trend-Analyse' });
  }
});

export default router;
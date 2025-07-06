/**
 * VEREINFACHTE WIRTSCHAFTLICHKEITSAUSWERTUNG
 * Einfache Version ohne komplexe SQL-Berechnungen
 */

import { Router } from 'express';
import pkg from 'pg';

const router = Router();
const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * GET /api/profitability/overview
 * Vereinfachte Wirtschaftlichkeitsauswertung mit echten Daten
 */
router.get('/overview', async (req, res) => {
  try {
    const { 
      startDate = '2025-07-01', 
      endDate = '2025-07-07',
      groupBy = 'product'
    } = req.query;
    
    console.log('🔥 VEREINFACHTE Profitability Analysis:', { startDate, endDate, groupBy });
    
    let query;
    
    if (groupBy === 'product') {
      // PRODUKTRENTABILITÄT
      query = `
        SELECT 
          t.product_name as item_name,
          'product' as item_type,
          COUNT(t.id) as transaction_count,
          SUM(t.quantity) as quantity_sold,
          SUM(t.price * t.quantity) as revenue_gross,
          SUM(CASE 
            WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
            ELSE (t.price / 1.19) * t.quantity
          END) as revenue_net,
          AVG(t.price) as avg_sale_price
        FROM transactions t
        WHERE t.datetime >= $1 AND t.datetime <= $2
          AND t.product_name IS NOT NULL
        GROUP BY t.product_name
        HAVING COUNT(t.id) >= 1
        ORDER BY revenue_net DESC
        LIMIT 100
      `;
    } else if (groupBy === 'machine') {
      // MASCHINENRENTABILITÄT
      query = `
        SELECT 
          COALESCE(m.machine_name, 'Unbekannte Maschine') as item_name,
          'machine' as item_type,
          COUNT(t.id) as transaction_count,
          SUM(t.quantity) as quantity_sold,
          SUM(t.price * t.quantity) as revenue_gross,
          SUM(CASE 
            WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
            ELSE (t.price / 1.19) * t.quantity
          END) as revenue_net,
          AVG(t.price) as avg_sale_price
        FROM transactions t
        LEFT JOIN machines m ON t.machine_id = m.id
        WHERE t.datetime >= $1 AND t.datetime <= $2
        GROUP BY m.machine_name, m.id
        HAVING COUNT(t.id) >= 1
        ORDER BY revenue_net DESC
        LIMIT 50
      `;
    } else {
      // TAGESÜBERSICHT
      query = `
        SELECT 
          DATE(t.datetime)::text as item_name,
          'day' as item_type,
          COUNT(t.id) as transaction_count,
          SUM(t.quantity) as quantity_sold,
          SUM(t.price * t.quantity) as revenue_gross,
          SUM(CASE 
            WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
            ELSE (t.price / 1.19) * t.quantity
          END) as revenue_net,
          AVG(t.price) as avg_sale_price
        FROM transactions t
        WHERE t.datetime >= $1 AND t.datetime <= $2
        GROUP BY DATE(t.datetime)
        ORDER BY DATE(t.datetime) DESC
        LIMIT 30
      `;
    }
   
    const result = await pool.query(query, [startDate, endDate]);
    
    console.log(`🎯 VEREINFACHTE Rentabilitätsdaten: ${result.rows.length} Einträge gefunden!`);
    
    const data = result.rows.map((row: any) => {
      const revenueNet = Number(row.revenue_net || 0);
      // Einfache Kalkulationen
      const purchaseCost = revenueNet * 0.65; // 65% Einkaufskosten
      const locationCost = groupBy === 'machine' ? 14 : 0; // 14€ Standortkosten pro Woche
      const netProfit = revenueNet * 0.35 - locationCost; // 35% Marge minus Standortkosten
      
      return {
        period: row.item_name,
        periodDate: row.item_name,
        productName: groupBy === 'product' ? row.item_name : null,
        machineName: groupBy === 'machine' ? row.item_name : null,
        locationName: groupBy === 'machine' ? row.item_name : null,
        revenueNet,
        revenueGross: Number(row.revenue_gross || 0),
        depositRevenue: 0,
        purchaseCostNet: purchaseCost,
        operatingCostsNet: locationCost,
        netProfit,
        profitMarginPercent: revenueNet > 0 ? (netProfit / revenueNet) * 100 : 0,
        transactionCount: Number(row.transaction_count || 0),
        quantitySold: Number(row.quantity_sold || 0),
        avgSalePrice: Number(row.avg_sale_price || 0),
      };
    });
    
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('❌ Error in simplified profitability analysis:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler bei der Wirtschaftlichkeitsauswertung'
    });
  }
});

/**
 * GET /api/profitability/summary
 * Zusammenfassung der wichtigsten Rentabilitäts-KPIs
 */
router.get('/summary', async (req, res) => {
  try {
    const { 
      startDate = '2025-07-01', 
      endDate = '2025-07-07' 
    } = req.query;
    
    const query = `
      SELECT 
        COUNT(*)::integer as total_transactions,
        COUNT(DISTINCT COALESCE(m.id, t.machine_id))::integer as active_machines,
        COUNT(DISTINCT t.product_name)::integer as active_products,
        SUM(t.price * t.quantity)::numeric as total_revenue_gross,
        SUM(CASE 
          WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
          ELSE (t.price / 1.19) * t.quantity
        END)::numeric as total_revenue_net,
        AVG(t.price)::numeric as avg_transaction_value
      FROM transactions t
      LEFT JOIN machines m ON t.machine_id = m.id
      WHERE t.datetime >= $1 AND t.datetime <= $2
    `;

    const result = await pool.query(query, [startDate, endDate]);
    const summary = result.rows[0];

    const totalRevenue = Number(summary.total_revenue_net || 0);
    const totalCosts = totalRevenue * 0.65; // 65% Einkaufskosten
    const totalProfit = totalRevenue * 0.35; // 35% Gewinnmarge

    const data = {
      // Umsätze
      totalRevenueNet: totalRevenue,
      totalRevenueGross: Number(summary.total_revenue_gross || 0),
      
      // Kosten
      totalPurchaseCost: totalCosts,
      totalOperatingCosts: 0,
      totalCosts: totalCosts,
      
      // Gewinn
      totalNetProfit: totalProfit,
      roiPercent: totalCosts > 0 ? (totalProfit / totalCosts) * 100 : 0,
      profitMarginPercent: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      
      // Statistiken
      activeMachines: Number(summary.active_machines || 0),
      activeProducts: Number(summary.active_products || 0),
      totalTransactions: Number(summary.total_transactions || 0),
      avgTransactionValue: Number(summary.avg_transaction_value || 0),
    };

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error in profitability summary:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler bei der Zusammenfassung'
    });
  }
});

router.get('/location-costs', async (req, res) => {
  try {
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching location costs:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Laden der Standortkosten'
    });
  }
});

export default router;
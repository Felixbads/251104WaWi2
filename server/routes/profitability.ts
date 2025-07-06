/**
 * Wirtschaftlichkeitsauswertung - Vereinfachte Backend API
 * 
 * Berechnungen:
 * - Netto Erlös (aus Transaktionen)
 * - Minus Netto Einkaufspreis (aus purchase_conditions)
 * - Minus Pfand (aus products.depositPrice) 
 * - Minus laufende Kosten (aus location_costs)
 * = Nettogewinn
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
 * Hauptübersicht der Wirtschaftlichkeit
 */
router.get('/overview', async (req, res) => {
  try {
    const { 
      period = 'day', 
      startDate = '2025-01-01', 
      endDate = '2025-12-31',
      groupBy = 'total'
    } = req.query;
    
    console.log('Profitability overview request:', { period, startDate, endDate, groupBy });
    
    // Vereinfachte Abfrage für Demonstration
    const query = `
      SELECT 
        DATE(t.datetime) as period,
        COUNT(t.id) as transaction_count,
        SUM(t.price * t.quantity) as revenue_gross,
        SUM(CASE 
          WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
          ELSE (t.price / 1.19) * t.quantity
        END) as revenue_net,
        SUM(t.quantity) as quantity_sold,
        AVG(t.price) as avg_sale_price
      FROM transactions t
      WHERE t.datetime >= $1 AND t.datetime <= $2
      GROUP BY DATE(t.datetime)
      ORDER BY DATE(t.datetime) DESC
      LIMIT 50
    `;

    const result = await pool.query(query, [startDate, endDate]);
    
    console.log(`Found ${result.rows.length} profitability records`);
    
    const data = result.rows.map((row: any) => ({
      period: row.period,
      periodDate: row.period,
      revenueNet: Number(row.revenue_net || 0),
      revenueGross: Number(row.revenue_gross || 0),
      depositRevenue: 0, // Wird später implementiert
      purchaseCostNet: 0, // Wird später implementiert  
      operatingCostsNet: 0, // Wird später implementiert
      netProfit: Number(row.revenue_net || 0), // Vorläufig = revenue_net
      profitMarginPercent: 100, // Vorläufig
      transactionCount: Number(row.transaction_count || 0),
      quantitySold: Number(row.quantity_sold || 0),
      avgSalePrice: Number(row.avg_sale_price || 0),
    }));
    
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error in profitability overview:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler bei der Wirtschaftlichkeitsauswertung'
    });
  }
});

/**
 * GET /api/profitability/summary
 * Zusammenfassung der wichtigsten KPIs
 */
router.get('/summary', async (req, res) => {
  try {
    const { 
      startDate = '2025-01-01', 
      endDate = '2025-12-31' 
    } = req.query;
    
    const query = `
      SELECT 
        COUNT(*)::integer as total_transactions,
        COUNT(DISTINCT m.id)::integer as active_machines,
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

    const data = {
      // Umsätze
      totalRevenueNet: Number(summary.total_revenue_net || 0),
      
      // Kosten (vorläufig auf 0, wird später implementiert)
      totalPurchaseCost: 0,
      totalOperatingCosts: 0,
      totalCosts: 0,
      
      // Gewinn (vorläufig = revenue)
      totalNetProfit: Number(summary.total_revenue_net || 0),
      roiPercent: 100,
      profitMarginPercent: 100,
      
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

/**
 * GET /api/profitability/costs
 * Standortkosten verwalten (vorläufig leer)
 */
router.get('/costs', async (req, res) => {
  try {
    // Vorläufig leeres Array - Tabelle wird später mit Schema-Push erstellt
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

/**
 * POST /api/profitability/costs
 * Neue Standortkosten hinzufügen (vorläufig)
 */
router.post('/costs', async (req, res) => {
  try {
    // Vorläufige Implementierung - wird später erweitert
    res.status(201).json({
      success: true,
      data: { id: Date.now(), ...req.body }
    });

  } catch (error) {
    console.error('Error creating location cost:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Erstellen der Standortkosten'
    });
  }
});

export default router;
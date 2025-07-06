/**
 * ERWEITERTE WIRTSCHAFTLICHKEITSBERECHNUNG MIT FIXKOSTENANTEIL
 * Berücksichtigt Wareneinsatz, entnommene Produkte und Fixkosten je Standort
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
 * Fixkosten je Standort pro Monat (sollten später aus Stammdaten kommen)
 * TODO: In separate Tabelle `location_costs` auslagern
 */
const LOCATION_FIXED_COSTS = {
  'Bad Schandau Nationalparkbahnhof': 850,
  'Stolpen Bahnhof': 750,
  'Rathmannsdorf Bahnhof': 680,
  'Kurort Rathen Bahnhof': 720,
  'Ostrau': 650,
  'Pirna Bahnhof': 900,
  'Dresden Hauptbahnhof': 1200,
  // Fallback für unbekannte Standorte
  'DEFAULT': 700
};

interface EnhancedProfitabilityData {
  period: string;
  periodDate: string;
  location: string;
  machineId?: number;
  machineName?: string;
  productId?: number;
  productName?: string;
  // Umsatz
  revenueGross: number;
  revenueNet: number;
  depositRevenue: number;
  // Kosten
  purchaseCostNet: number;
  refillCosts: number; // Entnommene Produkte
  fixedCostShare: number; // Anteiliger Fixkostenanteil
  totalCosts: number;
  // Ergebnis
  grossProfit: number; // Umsatz - Wareneinsatz
  netProfitAfterFixed: number; // Nach Fixkostenanteil
  profitMarginPercent: number;
  isEconomical: boolean; // Ob nach Fixkosten noch positiv
  // Mengen
  transactionCount: number;
  quantitySold: number;
  quantityRefilled: number;
  avgSalePrice: number;
  avgPurchasePrice: number;
}

interface EnhancedSummaryData {
  totalRevenueGross: number;
  totalRevenueNet: number;
  totalDepositRevenue: number;
  totalPurchaseCosts: number;
  totalRefillCosts: number;
  totalFixedCosts: number;
  totalCosts: number;
  grossProfit: number;
  netProfitAfterFixed: number;
  profitMarginPercent: number;
  roiPercent: number;
  economicalProducts: number;
  totalProducts: number;
  economicalRate: number;
}

/**
 * GET /api/enhanced-profitability/overview
 * Erweiterte Wirtschaftlichkeitsauswertung mit Fixkostenanteil
 */
router.get('/overview', async (req, res) => {
  try {
    const { 
      startDate = '2025-06-01', 
      endDate = '2025-07-06',
      groupBy = 'product',
      machineId,
      productId
    } = req.query;
    
    console.log('🎯 ERWEITERTE Profitability Analysis:', { startDate, endDate, groupBy, machineId, productId });
    
    // Erweiterte Abfrage mit Wareneinsatz und Fixkosten
    const query = `
      WITH monthly_transactions AS (
        SELECT 
          t.product_name,
          m.location_name,
          m.machine_name,
          t.machine_id,
          DATE_TRUNC('week', t.datetime) as week_start,
          -- Umsatzdaten
          COUNT(t.id) as transaction_count,
          SUM(t.quantity) as quantity_sold,
          SUM(t.price * t.quantity) as revenue_gross,
          SUM(CASE 
            WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
            ELSE (t.price / 1.19) * t.quantity
          END) as revenue_net,
          -- Geschätzter Pfandanteil (falls separierbar)
          SUM(CASE 
            WHEN t.product_name ILIKE '%flasche%' OR t.product_name ILIKE '%pet%' 
            THEN 0.25 * t.quantity 
            ELSE 0 
          END) as deposit_revenue,
          AVG(t.price) as avg_sale_price
        FROM transactions t
        LEFT JOIN machines m ON t.machine_id = m.id
        WHERE t.datetime >= $1 AND t.datetime <= $2
          AND t.product_name IS NOT NULL
          ${machineId && machineId !== 'all' ? 'AND t.machine_id = $3' : ''}
          ${productId && productId !== 'all' ? 'AND t.product_id = $4' : ''}
        GROUP BY t.product_name, m.location_name, m.machine_name, t.machine_id, week_start
      ),
      
      weekly_refills AS (
        SELECT 
          r.machine_id,
          DATE_TRUNC('week', r.datetime) as week_start,
          COUNT(*) as refill_count,
          -- Geschätzte Nachfüllkosten basierend auf Refill-Häufigkeit
          COUNT(*) * 25.0 as estimated_refill_cost
        FROM refills r
        WHERE r.datetime >= $1 AND r.datetime <= $2
        GROUP BY r.machine_id, week_start
      ),
      
      purchase_costs AS (
        SELECT 
          p.product_name,
          pc.unit_price as purchase_price_net,
          pc.gross_price as purchase_price_gross
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE pc.is_preferred = true OR pc.id IS NULL
      ),
      
      location_totals AS (
        SELECT 
          location_name,
          week_start,
          SUM(transaction_count) as total_transactions_location
        FROM monthly_transactions
        GROUP BY location_name, week_start
      )
      
      SELECT 
        mt.product_name,
        mt.location_name,
        mt.machine_name,
        mt.machine_id,
        mt.week_start,
        mt.transaction_count,
        mt.quantity_sold,
        mt.revenue_gross,
        mt.revenue_net,
        mt.deposit_revenue,
        mt.avg_sale_price,
        
        -- Wareneinsatz
        COALESCE(pc.purchase_price_net, 0) as purchase_price_net,
        COALESCE(pc.purchase_price_net * mt.quantity_sold, 0) as total_purchase_cost,
        
        -- Refill-Kosten
        COALESCE(wr.estimated_refill_cost, 0) as refill_costs,
        
        -- Fixkostenanteil berechnen
        CASE 
          WHEN lt.total_transactions_location > 0 THEN
            (CASE 
              WHEN mt.location_name = 'Bad Schandau Nationalparkbahnhof' THEN 850
              WHEN mt.location_name = 'Stolpen Bahnhof' THEN 750
              WHEN mt.location_name = 'Rathmannsdorf Bahnhof' THEN 680
              WHEN mt.location_name = 'Kurort Rathen Bahnhof' THEN 720
              WHEN mt.location_name = 'Ostrau' THEN 650
              WHEN mt.location_name = 'Pirna Bahnhof' THEN 900
              WHEN mt.location_name = 'Dresden Hauptbahnhof' THEN 1200
              ELSE 700
            END * mt.transaction_count / lt.total_transactions_location)
          ELSE 0
        END as fixed_cost_share,
        
        lt.total_transactions_location
        
      FROM monthly_transactions mt
      LEFT JOIN weekly_refills wr ON mt.machine_id = wr.machine_id AND mt.week_start = wr.week_start
      LEFT JOIN purchase_costs pc ON mt.product_name = pc.product_name
      LEFT JOIN location_totals lt ON mt.location_name = lt.location_name AND mt.week_start = lt.week_start
      ORDER BY mt.week_start DESC, mt.revenue_gross DESC
    `;
    
    const params = [startDate, endDate];
    if (machineId && machineId !== 'all') params.push(machineId);
    if (productId && productId !== 'all') params.push(productId);
    
    const result = await pool.query(query, params);
    
    // Daten transformieren und Berechnungen durchführen
    const data: EnhancedProfitabilityData[] = result.rows.map(row => {
      const grossProfit = row.revenue_net - row.total_purchase_cost;
      const totalCosts = row.total_purchase_cost + row.refill_costs + row.fixed_cost_share;
      const netProfitAfterFixed = row.revenue_net - totalCosts;
      const profitMarginPercent = row.revenue_net > 0 ? (netProfitAfterFixed / row.revenue_net) * 100 : 0;
      
      return {
        period: `KW ${Math.ceil((new Date(row.week_start).getDate()) / 7)}`,
        periodDate: row.week_start,
        location: row.location_name || 'Unbekannt',
        machineId: row.machine_id,
        machineName: row.machine_name || 'Unbekannt',
        productName: row.product_name,
        revenueGross: parseFloat(row.revenue_gross) || 0,
        revenueNet: parseFloat(row.revenue_net) || 0,
        depositRevenue: parseFloat(row.deposit_revenue) || 0,
        purchaseCostNet: parseFloat(row.total_purchase_cost) || 0,
        refillCosts: parseFloat(row.refill_costs) || 0,
        fixedCostShare: parseFloat(row.fixed_cost_share) || 0,
        totalCosts,
        grossProfit,
        netProfitAfterFixed,
        profitMarginPercent,
        isEconomical: netProfitAfterFixed > 0,
        transactionCount: parseInt(row.transaction_count) || 0,
        quantitySold: parseInt(row.quantity_sold) || 0,
        quantityRefilled: 0, // TODO: Aus Refill-Daten ableiten
        avgSalePrice: parseFloat(row.avg_sale_price) || 0,
        avgPurchasePrice: parseFloat(row.purchase_price_net) || 0
      };
    });
    
    // Summary berechnen
    const summary: EnhancedSummaryData = {
      totalRevenueGross: data.reduce((sum, item) => sum + item.revenueGross, 0),
      totalRevenueNet: data.reduce((sum, item) => sum + item.revenueNet, 0),
      totalDepositRevenue: data.reduce((sum, item) => sum + item.depositRevenue, 0),
      totalPurchaseCosts: data.reduce((sum, item) => sum + item.purchaseCostNet, 0),
      totalRefillCosts: data.reduce((sum, item) => sum + item.refillCosts, 0),
      totalFixedCosts: data.reduce((sum, item) => sum + item.fixedCostShare, 0),
      totalCosts: data.reduce((sum, item) => sum + item.totalCosts, 0),
      grossProfit: data.reduce((sum, item) => sum + item.grossProfit, 0),
      netProfitAfterFixed: data.reduce((sum, item) => sum + item.netProfitAfterFixed, 0),
      profitMarginPercent: 0,
      roiPercent: 0,
      economicalProducts: data.filter(item => item.isEconomical).length,
      totalProducts: data.length,
      economicalRate: data.length > 0 ? (data.filter(item => item.isEconomical).length / data.length) * 100 : 0
    };
    
    // Prozentsätze berechnen
    if (summary.totalRevenueNet > 0) {
      summary.profitMarginPercent = (summary.netProfitAfterFixed / summary.totalRevenueNet) * 100;
    }
    if (summary.totalCosts > 0) {
      summary.roiPercent = (summary.netProfitAfterFixed / summary.totalCosts) * 100;
    }
    
    console.log(`🎯 ERWEITERTE Rentabilitätsdaten: ${data.length} Einträge mit Fixkostenanteil!`);
    
    res.json({
      success: true,
      data,
      summary
    });
    
  } catch (error) {
    console.error('❌ Fehler in erweiterte Profitability Analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der erweiterten Wirtschaftlichkeitsdaten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/enhanced-profitability/fixcosts
 * Aktuelle Fixkosten je Standort abrufen
 */
router.get('/fixcosts', async (req, res) => {
  try {
    const fixCosts = Object.entries(LOCATION_FIXED_COSTS)
      .filter(([key]) => key !== 'DEFAULT')
      .map(([location, cost]) => ({
        location,
        monthlyCost: cost,
        dailyCost: Math.round(cost / 30 * 100) / 100,
        weeklyCost: Math.round(cost / 4 * 100) / 100
      }));
    
    res.json({
      success: true,
      data: fixCosts,
      defaultCost: LOCATION_FIXED_COSTS.DEFAULT
    });
  } catch (error) {
    console.error('❌ Fehler beim Laden der Fixkosten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Fixkosten'
    });
  }
});

export default router;
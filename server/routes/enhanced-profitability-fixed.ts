/**
 * KORRIGIERTE ERWEITERTE WIRTSCHAFTLICHKEITSBERECHNUNG
 * Behebt Duplikate, Fixkosten-Überschätzung und Zeitraum-Probleme
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
 * Realistische Fixkosten pro Standort pro Monat
 */
const LOCATION_FIXED_COSTS = {
  'Bad Schandau Nationalparkbahnhof': 200,
  'Stolpen Bahnhof': 180,
  'Rathmannsdorf Bahnhof': 150,
  'Kurort Rathen Bahnhof': 170,
  'Ostrau': 140,
  'Pirna Bahnhof': 220,
  'Dresden Hauptbahnhof': 300,
  'DEFAULT': 160
};

function getPeriodLabel(startDate: Date, endDate: Date): string {
  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'Täglich';
  if (diffDays <= 7) return 'Wöchentlich';
  if (diffDays <= 31) return 'Monatlich';
  return 'Zeitraum';
}

interface EnhancedProfitabilityData {
  period: string;
  periodDate: string;
  location: string;
  machineId?: number;
  machineName?: string;
  productName?: string;
  revenueGross: number;
  revenueNet: number;
  depositRevenue: number;
  purchaseCostNet: number;
  refillCosts: number;
  fixedCostShare: number;
  totalCosts: number;
  grossProfit: number;
  netProfitAfterFixed: number;
  profitMarginPercent: number;
  isEconomical: boolean;
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
 */
router.get('/overview', async (req, res) => {
  try {
    const { period = 'last7days', groupBy = 'machine', machineId = 'all', productId = 'all' } = req.query;
    
    let startDate: Date;
    let endDate = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last7days':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'last30days':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'last90days':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    // URL-Parameter für Start- und Enddatum
    if (req.query.start) {
      startDate = new Date(String(req.query.start));
    }
    if (req.query.end) {
      endDate = new Date(String(req.query.end));
    }

    // Basisdaten aus der Datenbank abrufen
    const query = `
      SELECT 
        t.product_name,
        m.location_name,
        m.machine_name,
        t.machine_id,
        -- Verkaufsdaten
        COUNT(t.id) as transaction_count,
        SUM(t.quantity) as quantity_sold,
        SUM(t.price * t.quantity) as revenue_gross,
        SUM(CASE 
          WHEN t.price_wo_vat IS NOT NULL THEN t.price_wo_vat * t.quantity
          ELSE (t.price / 1.19) * t.quantity
        END) as revenue_net,
        -- Pfandanteil schätzen
        SUM(CASE 
          WHEN t.product_name ILIKE '%flasche%' OR t.product_name ILIKE '%pet%' 
          THEN 0.25 * t.quantity 
          ELSE 0 
        END) as deposit_revenue,
        AVG(t.price) as avg_sale_price,
        -- Wareneinsatz
        COALESCE(pc.unit_price, 1.50) as purchase_price_net
      FROM transactions t
      LEFT JOIN machines m ON t.machine_id = m.id
      LEFT JOIN products p ON t.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      WHERE t.datetime >= $1 AND t.datetime <= $2
        AND t.product_name IS NOT NULL
        ${machineId && machineId !== 'all' ? 'AND t.machine_id = $3' : ''}
        ${productId && productId !== 'all' ? 'AND p.id = $4' : ''}
      GROUP BY t.product_name, m.location_name, m.machine_name, t.machine_id, pc.unit_price
      ORDER BY SUM(t.price * t.quantity) DESC
    `;

    const params: any[] = [startDate, endDate];
    if (machineId && machineId !== 'all') params.push(String(machineId));
    if (productId && productId !== 'all') params.push(String(productId));

    const result = await pool.query(query, params);

    // Refill-Kosten pro Automat abrufen
    const refillQuery = `
      SELECT 
        r.machine_id,
        COUNT(*) * 12.0 as estimated_refill_cost
      FROM refills r
      WHERE r.datetime >= $1 AND r.datetime <= $2
      GROUP BY r.machine_id
    `;
    const refillResult = await pool.query(refillQuery, [startDate, endDate]);
    const refillCosts = new Map();
    refillResult.rows.forEach(row => {
      refillCosts.set(row.machine_id, parseFloat(row.estimated_refill_cost) || 0);
    });

    // Daten nach Gruppierung aggregieren
    const aggregatedData = new Map();

    result.rows.forEach(row => {
      let groupKey: string;
      
      if (groupBy === 'machine') {
        groupKey = `${row.location_name || 'Unbekannt'} - ${row.machine_name || 'Automat'} (${row.machine_id})`;
      } else if (groupBy === 'product') {
        groupKey = row.product_name;
      } else if (groupBy === 'location') {
        groupKey = row.location_name || 'Unbekannt';
      } else {
        groupKey = `${row.location_name}_${row.machine_id}_${row.product_name}`;
      }

      if (!aggregatedData.has(groupKey)) {
        aggregatedData.set(groupKey, {
          location: row.location_name || 'Unbekannt',
          machineName: row.machine_name || 'Unbekannt',
          machineId: row.machine_id,
          productName: groupBy === 'product' ? row.product_name : undefined,
          transactionCount: 0,
          quantitySold: 0,
          revenueGross: 0,
          revenueNet: 0,
          depositRevenue: 0,
          totalPurchaseCost: 0,
          avgSalePrice: 0,
          machineIds: new Set()
        });
      }

      const item = aggregatedData.get(groupKey);
      item.transactionCount += parseInt(row.transaction_count) || 0;
      item.quantitySold += parseInt(row.quantity_sold) || 0;
      item.revenueGross += parseFloat(row.revenue_gross) || 0;
      item.revenueNet += parseFloat(row.revenue_net) || 0;
      item.depositRevenue += parseFloat(row.deposit_revenue) || 0;
      item.totalPurchaseCost += (parseFloat(row.purchase_price_net) || 1.5) * (parseInt(row.quantity_sold) || 0);
      item.machineIds.add(row.machine_id);
    });

    // Fixkosten berechnen (nur einmal pro Standort)
    const usedLocations = new Set();
    const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Endgültige Daten transformieren
    const data: EnhancedProfitabilityData[] = Array.from(aggregatedData.values()).map(item => {
      // Refill-Kosten summieren (für alle Automaten in dieser Gruppe)
      let totalRefillCosts = 0;
      Array.from(item.machineIds).forEach(machineId => {
        totalRefillCosts += refillCosts.get(machineId) || 0;
      });

      // Fixkosten nur einmal pro Standort berechnen
      let fixedCostShare = 0;
      if (!usedLocations.has(item.location)) {
        const monthlyFixedCost = (LOCATION_FIXED_COSTS as any)[item.location] || LOCATION_FIXED_COSTS['DEFAULT'];
        fixedCostShare = (monthlyFixedCost / 30) * daysInPeriod;
        usedLocations.add(item.location);
      }

      item.avgSalePrice = item.quantitySold > 0 ? item.revenueGross / item.quantitySold : 0;
      
      const grossProfit = item.revenueNet - item.totalPurchaseCost;
      const totalCosts = item.totalPurchaseCost + totalRefillCosts + fixedCostShare;
      const netProfitAfterFixed = item.revenueNet - totalCosts;
      const profitMarginPercent = item.revenueNet > 0 ? (netProfitAfterFixed / item.revenueNet) * 100 : 0;

      return {
        period: getPeriodLabel(startDate, endDate),
        periodDate: startDate.toISOString(),
        location: item.location,
        machineId: item.machineId,
        machineName: item.machineName,
        productName: item.productName,
        revenueGross: item.revenueGross,
        revenueNet: item.revenueNet,
        depositRevenue: item.depositRevenue,
        purchaseCostNet: item.totalPurchaseCost,
        refillCosts: totalRefillCosts,
        fixedCostShare: fixedCostShare,
        totalCosts,
        grossProfit,
        netProfitAfterFixed,
        profitMarginPercent,
        isEconomical: netProfitAfterFixed > 0,
        transactionCount: item.transactionCount,
        quantitySold: item.quantitySold,
        quantityRefilled: 0,
        avgSalePrice: item.avgSalePrice,
        avgPurchasePrice: item.quantitySold > 0 ? item.totalPurchaseCost / item.quantitySold : 0
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
      totalCosts: 0,
      grossProfit: 0,
      netProfitAfterFixed: 0,
      profitMarginPercent: 0,
      roiPercent: 0,
      economicalProducts: data.filter(item => item.isEconomical).length,
      totalProducts: data.length,
      economicalRate: data.length > 0 ? (data.filter(item => item.isEconomical).length / data.length) * 100 : 0
    };

    summary.totalCosts = summary.totalPurchaseCosts + summary.totalRefillCosts + summary.totalFixedCosts;
    summary.grossProfit = summary.totalRevenueNet - summary.totalPurchaseCosts;
    summary.netProfitAfterFixed = summary.totalRevenueNet - summary.totalCosts;
    summary.profitMarginPercent = summary.totalRevenueNet > 0 ? (summary.netProfitAfterFixed / summary.totalRevenueNet) * 100 : 0;
    summary.roiPercent = summary.totalCosts > 0 ? (summary.netProfitAfterFixed / summary.totalCosts) * 100 : 0;

    console.log(`✅ KORRIGIERTE Rentabilitätsdaten: ${data.length} Einträge, Fixkosten: ${summary.totalFixedCosts.toFixed(2)}€, Gewinn: ${summary.netProfitAfterFixed.toFixed(2)}€`);

    res.json({
      success: true,
      data,
      summary
    });

  } catch (error) {
    console.error('❌ Fehler in korrigierter enhanced-profitability:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der korrigierten Wirtschaftlichkeitsdaten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/enhanced-profitability/fixcosts
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
      data: fixCosts
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
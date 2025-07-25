import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

interface LocationProfitabilityData {
  locationName: string;
  // Umsatzkennzahlen
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  
  // Kostenkennzahlen  
  operatingCosts: number;
  maintenanceCosts: number;
  energyCosts: number;
  rentCosts: number;
  totalLocationCosts: number;
  
  // Produktkosten
  totalProductCosts: number;
  
  // Rentabilitätskennzahlen
  grossProfit: number;        // Umsatz - Produktkosten
  netProfit: number;          // Brutto-Gewinn - Standortkosten
  profitMargin: number;       // Gewinnmarge in %
  costRatio: number;          // Kostenverhältnis in %
  
  // Performance-Indikatoren
  revenuePerDay: number;
  transactionsPerDay: number;
  profitPerTransaction: number;
  
  // Ranking und Bewertung
  performanceRank: number;
  profitabilityCategory: 'high' | 'medium' | 'low' | 'loss';
  
  // Top Produkte
  topProducts: Array<{
    productName: string;
    quantity: number;
    revenue: number;
    profit: number;
    margin: number;
  }>;
  
  // Zeitverlaufs-Daten (letzte 6 Monate)
  monthlyTrend: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
    margin: number;
  }>;
}

/**
 * NEUE STANDORT-WIRTSCHAFTLICHKEITS-ANALYSE
 * 
 * Komplett neu konzipierte API für umfassende Standort-Rentabilitätsanalyse
 */
router.get('/locations/:locationName', async (req, res) => {
  try {
    const locationName = decodeURIComponent(req.params.locationName);
    const { startDate, endDate } = req.query;
    
    console.log(`[LOCATION-PROFITABILITY] Analysis requested for: ${locationName}`);
    
    // Datumsbereich (Standard: letzte 90 Tage)
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    // === 1. UMSATZ-ANALYSE ===
    const revenueAnalysis = await db.execute(sql`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE 
          WHEN amount > 0 THEN amount 
          ELSE COALESCE(price, 0) * COALESCE(quantity, 1)
        END) as total_revenue,
        AVG(CASE 
          WHEN amount > 0 THEN amount 
          ELSE COALESCE(price, 0) * COALESCE(quantity, 1)
        END) as avg_transaction_value
      FROM transactions t
      INNER JOIN machines m ON t.machine_id = m.id
      WHERE m.location = ${locationName}
        AND t.datetime >= ${start.toISOString()}
        AND t.datetime <= ${end.toISOString()}
    `);
    
    const revenue = revenueAnalysis.rows[0] || {};
    const totalRevenue = parseFloat(revenue.total_revenue || '0');
    const totalTransactions = parseInt(revenue.total_transactions || '0');
    const avgTransactionValue = parseFloat(revenue.avg_transaction_value || '0');
    
    // === 2. STANDORT-KOSTEN ANALYSE ===
    const locationCosts = await db.execute(sql`
      SELECT 
        cost_type,
        SUM(COALESCE(amount_net, amount_gross, 0)) as cost_amount
      FROM location_costs 
      WHERE location_name = ${locationName}
        AND is_active = true
        AND (valid_from IS NULL OR valid_from <= ${end.toISOString()})
        AND (valid_to IS NULL OR valid_to >= ${start.toISOString()})
      GROUP BY cost_type
    `);
    
    let operatingCosts = 0;
    let maintenanceCosts = 0;
    let energyCosts = 0;
    let rentCosts = 0;
    
    for (const cost of locationCosts.rows) {
      const amount = parseFloat(cost.cost_amount || '0');
      switch (cost.cost_type?.toLowerCase()) {
        case 'betriebskosten':
        case 'operating':
          operatingCosts += amount;
          break;
        case 'wartung':
        case 'maintenance':
          maintenanceCosts += amount;
          break;
        case 'strom':
        case 'energie':
        case 'energy':
          energyCosts += amount;
          break;
        case 'miete':
        case 'rent':
          rentCosts += amount;
          break;
        default:
          operatingCosts += amount; // Fallback zu Betriebskosten
      }
    }
    
    const totalLocationCosts = operatingCosts + maintenanceCosts + energyCosts + rentCosts;
    
    // === 3. PRODUKT-KOSTEN ANALYSE ===
    const productCosts = await db.execute(sql`
      SELECT 
        SUM(
          COALESCE(t.quantity, 1) * COALESCE(pc.unit_price, 0)
        ) as total_product_costs
      FROM transactions t
      INNER JOIN machines m ON t.machine_id = m.id
      LEFT JOIN products p ON t.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE m.location = ${locationName}
        AND t.datetime >= ${start.toISOString()}
        AND t.datetime <= ${end.toISOString()}
    `);
    
    const totalProductCosts = parseFloat(productCosts.rows[0]?.total_product_costs || '0');
    
    // === 4. RENTABILITÄTS-KENNZAHLEN ===
    const grossProfit = totalRevenue - totalProductCosts;
    const netProfit = grossProfit - totalLocationCosts;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const costRatio = totalRevenue > 0 ? ((totalProductCosts + totalLocationCosts) / totalRevenue) * 100 : 0;
    
    // === 5. PERFORMANCE-INDIKATOREN ===
    const daysInPeriod = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    const revenuePerDay = totalRevenue / daysInPeriod;
    const transactionsPerDay = totalTransactions / daysInPeriod;
    const profitPerTransaction = totalTransactions > 0 ? netProfit / totalTransactions : 0;
    
    // === 6. TOP-PRODUKTE FÜR DEN STANDORT ===
    const topProducts = await db.execute(sql`
      SELECT 
        t.product_name,
        SUM(COALESCE(t.quantity, 1)) as quantity,
        SUM(CASE 
          WHEN t.amount > 0 THEN t.amount 
          ELSE COALESCE(t.price, 0) * COALESCE(t.quantity, 1)
        END) as revenue,
        SUM(COALESCE(t.quantity, 1) * COALESCE(pc.unit_price, 0)) as costs
      FROM transactions t
      INNER JOIN machines m ON t.machine_id = m.id
      LEFT JOIN products p ON t.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE m.location = ${locationName}
        AND t.datetime >= ${start.toISOString()}
        AND t.datetime <= ${end.toISOString()}
      GROUP BY t.product_name
      ORDER BY revenue DESC
      LIMIT 10
    `);
    
    const topProductsFormatted = topProducts.rows.map(product => {
      const revenue = parseFloat(product.revenue || '0');
      const costs = parseFloat(product.costs || '0');
      const profit = revenue - costs;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        productName: product.product_name || 'Unbekannt',
        quantity: parseInt(product.quantity || '0'),
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: Math.round(margin * 100) / 100
      };
    });
    
    // === 7. MONATSTREND (letzte 6 Monate) ===
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(end);
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      
      const monthName = monthStart.toLocaleString('de-DE', { year: 'numeric', month: 'long' });
      
      // Vereinfachte Berechnung basierend auf Gesamtdaten (anteilig)
      const monthFactor = 1 / 6; // Gleichverteilung über 6 Monate
      const monthRevenue = totalRevenue * monthFactor;
      const monthCosts = (totalProductCosts + totalLocationCosts) * monthFactor;
      const monthProfit = monthRevenue - monthCosts;
      const monthMargin = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0;
      
      monthlyTrend.push({
        month: monthName,
        revenue: Math.round(monthRevenue * 100) / 100,
        costs: Math.round(monthCosts * 100) / 100,
        profit: Math.round(monthProfit * 100) / 100,
        margin: Math.round(monthMargin * 100) / 100
      });
    }
    
    // === 8. PROFITABILITÄTS-KATEGORIE ===
    let profitabilityCategory: 'high' | 'medium' | 'low' | 'loss';
    if (profitMargin >= 20) {
      profitabilityCategory = 'high';
    } else if (profitMargin >= 10) {
      profitabilityCategory = 'medium';
    } else if (profitMargin >= 0) {
      profitabilityCategory = 'low';
    } else {
      profitabilityCategory = 'loss';
    }
    
    // === 9. ENDERGEBNIS ZUSAMMENSTELLEN ===
    const result: LocationProfitabilityData = {
      locationName,
      // Umsatzkennzahlen
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions,
      averageTransactionValue: Math.round(avgTransactionValue * 100) / 100,
      
      // Kostenkennzahlen
      operatingCosts: Math.round(operatingCosts * 100) / 100,
      maintenanceCosts: Math.round(maintenanceCosts * 100) / 100,
      energyCosts: Math.round(energyCosts * 100) / 100,
      rentCosts: Math.round(rentCosts * 100) / 100,
      totalLocationCosts: Math.round(totalLocationCosts * 100) / 100,
      totalProductCosts: Math.round(totalProductCosts * 100) / 100,
      
      // Rentabilitätskennzahlen
      grossProfit: Math.round(grossProfit * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      costRatio: Math.round(costRatio * 100) / 100,
      
      // Performance-Indikatoren
      revenuePerDay: Math.round(revenuePerDay * 100) / 100,
      transactionsPerDay: Math.round(transactionsPerDay * 100) / 100,
      profitPerTransaction: Math.round(profitPerTransaction * 100) / 100,
      
      // Bewertung
      performanceRank: 1, // TODO: Implement ranking across all locations
      profitabilityCategory,
      
      topProducts: topProductsFormatted,
      monthlyTrend
    };
    
    console.log(`[LOCATION-PROFITABILITY] Analysis completed for ${locationName}:`, {
      revenue: result.totalRevenue,
      costs: result.totalLocationCosts + result.totalProductCosts,
      profit: result.netProfit,
      margin: result.profitMargin
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('[LOCATION-PROFITABILITY] Error:', error);
    res.status(500).json({
      error: 'Fehler bei der Standort-Wirtschaftlichkeitsanalyse',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * STANDORT-VERGLEICH: Alle Standorte im Überblick
 */
router.get('/locations-overview', async (req, res) => {
  try {
    console.log('[LOCATION-PROFITABILITY] Overview requested for all locations');
    
    // Alle aktiven Standorte abrufen
    const locations = await db.execute(sql`
      SELECT DISTINCT m.location
      FROM machines m
      WHERE m.location IS NOT NULL 
        AND m.location != ''
      ORDER BY m.location
    `);
    
    const locationSummaries = [];
    
    for (const loc of locations.rows) {
      if (!loc.location) continue;
      
      // Basis-Kennzahlen pro Standort (letzte 30 Tage)
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const summary = await db.execute(sql`
        SELECT 
          COUNT(*) as transactions,
          SUM(CASE 
            WHEN amount > 0 THEN amount 
            ELSE COALESCE(price, 0) * COALESCE(quantity, 1)
          END) as revenue,
          COUNT(DISTINCT m.id) as machine_count
        FROM transactions t
        INNER JOIN machines m ON t.machine_id = m.id
        WHERE m.location = ${loc.location}
          AND t.datetime >= ${start.toISOString()}
          AND t.datetime <= ${end.toISOString()}
      `);
      
      const data = summary.rows[0] || {};
      const revenue = parseFloat(data.revenue || '0');
      const transactions = parseInt(data.transactions || '0');
      const machineCount = parseInt(data.machine_count || '0');
      
      locationSummaries.push({
        locationName: loc.location,
        revenue: Math.round(revenue * 100) / 100,
        transactions,
        machineCount,
        revenuePerMachine: machineCount > 0 ? Math.round((revenue / machineCount) * 100) / 100 : 0,
        transactionsPerDay: Math.round((transactions / 30) * 100) / 100
      });
    }
    
    // Nach Umsatz sortieren
    locationSummaries.sort((a, b) => b.revenue - a.revenue);
    
    console.log(`[LOCATION-PROFITABILITY] Overview completed for ${locationSummaries.length} locations`);
    
    res.json({
      totalLocations: locationSummaries.length,
      locations: locationSummaries,
      totalRevenue: locationSummaries.reduce((sum, loc) => sum + loc.revenue, 0),
      totalTransactions: locationSummaries.reduce((sum, loc) => sum + loc.transactions, 0),
      totalMachines: locationSummaries.reduce((sum, loc) => sum + loc.machineCount, 0)
    });
    
  } catch (error) {
    console.error('[LOCATION-PROFITABILITY] Overview error:', error);
    res.status(500).json({
      error: 'Fehler bei der Standort-Übersicht',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
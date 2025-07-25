import { Router } from 'express';
import { db } from '../db';
import { 
  transactions,
  products,
  machines,
  purchaseConditions,
  locationCosts
} from '../../shared/schema';
import { eq, and, gte, lte, sql, isNull } from 'drizzle-orm';

const router = Router();

/**
 * EINHEITLICHE WIRTSCHAFTLICHKEITSBERECHNUNG
 * 
 * Diese API kombiniert alle Wirtschaftlichkeitsberechnungen:
 * - Produkt-Rentabilität
 * - Standort-Wirtschaftlichkeit  
 * - Automatenbezogene Analyse
 * 
 * Alle Berechnungen verwenden die gleiche Logik für Konsistenz
 */

interface ProfitabilityData {
  // Umsatzdaten
  revenueGross: number;
  revenueNet: number;
  depositRevenue: number;
  
  // Kostendaten
  purchaseCosts: number;
  locationCosts: number;
  totalCosts: number;
  
  // Ergebnisdaten
  grossProfit: number; // Rohertrag (Umsatz - Wareneinsatz)
  netProfit: number;   // Nettoergebnis (nach allen Kosten)
  profitMargin: number; // Gewinnmarge in %
  
  // Mengendaten
  transactionCount: number;
  quantitySold: number;
  
  // Status
  isProfitable: boolean;
}

/**
 * Sichere Nummer-Konvertierung mit Fallback
 */
function safeNumber(value: any, fallback: number = 0): number {
  const num = Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

/**
 * Berechnet Wirtschaftlichkeit für Produkte
 */
router.get('/products/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const { startDate, endDate } = req.query;
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Ungültige Produkt-ID" });
    }
    
    // Datumsbereich definieren (Standard: letzte 30 Tage)
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Produkt-Informationen laden
    const product = await db
      .select({
        id: products.id,
        productName: products.productName,
        category: products.category,
        price: products.price
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
      
    if (product.length === 0) {
      return res.status(404).json({ error: "Produkt nicht gefunden" });
    }
    
    // Umsatzdaten aus Transaktionen
    const revenueData = await db
      .select({
        // Umsatz (priorisiert amount, fallback auf price * quantity)
        revenueGross: sql<number>`
          SUM(
            CASE 
              WHEN ${transactions.amount} > 0 THEN ${transactions.amount}
              ELSE ${transactions.price} * ${transactions.quantity}
            END
          )`,
        revenueNet: sql<number>`
          SUM(
            CASE 
              WHEN ${transactions.amount} > 0 THEN ${transactions.amount} / 1.19
              ELSE ${transactions.price} * ${transactions.quantity} / 1.19
            END
          )`,
        depositRevenue: sql<number>`SUM(CASE WHEN ${transactions.productName} LIKE '%Flasche%' THEN 0.25 * ${transactions.quantity} ELSE 0 END)`,
        transactionCount: sql<number>`COUNT(*)`,
        quantitySold: sql<number>`SUM(${transactions.quantity})`
      })
      .from(transactions)
      .where(and(
        eq(transactions.productName, product[0].productName),
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ));
    
    const revenue = revenueData[0];
    
    // Sicher konvertieren zu Zahlen
    const safeRevenueGross = safeNumber(revenue.revenueGross);
    const safeRevenueNet = safeNumber(revenue.revenueNet);
    const safeDepositRevenue = safeNumber(revenue.depositRevenue);
    const safeQuantity = safeNumber(revenue.quantitySold);
    const safeTransactionCount = safeNumber(revenue.transactionCount);
    
    // Wareneinsatz aus Einkaufsbedingungen
    const purchaseCondition = await db
      .select({
        unitPrice: purchaseConditions.unitPrice
      })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.productId, productId))
      .limit(1);
    
    const unitCost = purchaseCondition.length > 0 ? safeNumber(purchaseCondition[0].unitPrice) : 0;
    const totalPurchaseCosts = unitCost * safeQuantity;
    
    // Anteilige Standortkosten (vereinfacht: 10% vom Umsatz als Overhead)
    const allocatedLocationCosts = safeRevenueNet * 0.1;
    
    const totalCosts = totalPurchaseCosts + allocatedLocationCosts;
    
    // Rentabilitätskennzahlen berechnen
    const grossProfit = safeRevenueNet - totalPurchaseCosts;
    const netProfit = grossProfit - allocatedLocationCosts;
    const profitMargin = safeRevenueNet > 0 ? (netProfit / safeRevenueNet) * 100 : 0;
    
    // FRONTEND-KOMPATIBLES FORMAT - DIREKT ZURÜCKGEBEN
    const result = {
      productId,
      productName: product[0].productName,
      category: product[0].category || 'Unbekannt',
      totalRevenue: Math.round(safeRevenueGross * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      totalProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      totalQuantitySold: safeQuantity,
      averageSellingPrice: safeQuantity > 0 ? Math.round((safeRevenueGross / safeQuantity) * 100) / 100 : 0,
      averageCostPrice: safeQuantity > 0 ? Math.round((totalCosts / safeQuantity) * 100) / 100 : 0,
      monthlySummary: [],
      locationBreakdown: []
    };
    
    console.log(`[UNIFIED-PROFITABILITY] SUCCESS - Returning for product ${productId}:`, result);
    res.json(result);
    
  } catch (error) {
    console.error('[UNIFIED-PROFITABILITY] Error:', error);
    res.status(500).json({ 
      error: "Fehler bei der Wirtschaftlichkeitsberechnung",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Berechnet Wirtschaftlichkeit für Standorte
 */
router.get('/locations/:locationName', async (req, res) => {
  try {
    const locationName = decodeURIComponent(req.params.locationName);
    const { startDate, endDate } = req.query;
    
    // Datumsbereich definieren
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Standort-Umsätze aggregieren
    const locationData = await db
      .select({
        revenueGross: sql<number>`SUM(
          CASE 
            WHEN ${transactions.amount} > 0 THEN ${transactions.amount}
            ELSE ${transactions.price} * ${transactions.quantity}
          END
        )`,
        revenueNet: sql<number>`SUM(
          CASE 
            WHEN ${transactions.amount} > 0 THEN ${transactions.amount} / 1.19
            ELSE ${transactions.price} * ${transactions.quantity} / 1.19
          END
        )`,
        transactionCount: sql<number>`COUNT(*)`,
        quantitySold: sql<number>`SUM(${transactions.quantity})`,
        uniqueProducts: sql<number>`COUNT(DISTINCT ${transactions.productName})`
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .where(and(
        eq(machines.locationName, locationName),
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ));
    
    const location = locationData[0];
    
    // Sicher konvertieren
    const safeRevenueGross = safeNumber(location.revenueGross);
    const safeRevenueNet = safeNumber(location.revenueNet);
    const safeQuantity = safeNumber(location.quantitySold);
    const safeTransactionCount = safeNumber(location.transactionCount);
    
    // Standortkosten laden
    const locationCostsData = await db
      .select({
        totalCosts: sql<number>`SUM(${locationCosts.amountNet})`
      })
      .from(locationCosts)
      .where(and(
        eq(locationCosts.locationName, locationName),
        eq(locationCosts.isActive, true)
      ));
    
    const monthlyCosts = safeNumber(locationCostsData[0]?.totalCosts);
    
    // Geschätzte Wareneinsätze (65% vom Nettoumsatz)
    const estimatedPurchaseCosts = safeRevenueNet * 0.65;
    
    const totalCosts = estimatedPurchaseCosts + monthlyCosts;
    const grossProfit = safeRevenueNet - estimatedPurchaseCosts;
    const netProfit = grossProfit - monthlyCosts;
    const profitMargin = safeRevenueNet > 0 ? (netProfit / safeRevenueNet) * 100 : 0;
    
    const profitabilityData: ProfitabilityData = {
      revenueGross: Math.round(safeRevenueGross * 100) / 100,
      revenueNet: Math.round(safeRevenueNet * 100) / 100,
      depositRevenue: 0, // TODO: Implementieren
      purchaseCosts: Math.round(estimatedPurchaseCosts * 100) / 100,
      locationCosts: Math.round(monthlyCosts * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      transactionCount: safeTransactionCount,
      quantitySold: safeQuantity,
      isProfitable: netProfit > 0
    };
    
    res.json({
      success: true,
      locationName,
      timeframe: { start, end },
      data: profitabilityData,
      metadata: {
        uniqueProducts: safeNumber(location.uniqueProducts),
        avgTransactionValue: safeRevenueGross / Math.max(safeTransactionCount, 1)
      }
    });
    
  } catch (error) {
    console.error('Fehler in Standortwirtschaftlichkeit:', error);
    res.status(500).json({ 
      success: false,
      error: "Fehler bei der Standort-Wirtschaftlichkeitsberechnung",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Überblick über alle Wirtschaftlichkeitsdaten
 */
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'location' } = req.query;
    
    // Datumsbereich
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let query = db
      .select({
        identifier: groupBy === 'location' ? machines.locationName : transactions.productName,
        revenueGross: sql<number>`SUM(
          CASE 
            WHEN ${transactions.amount} > 0 THEN ${transactions.amount}
            ELSE ${transactions.price} * ${transactions.quantity}
          END
        )`,
        revenueNet: sql<number>`SUM(
          CASE 
            WHEN ${transactions.amount} > 0 THEN ${transactions.amount} / 1.19
            ELSE ${transactions.price} * ${transactions.quantity} / 1.19
          END
        )`,
        transactionCount: sql<number>`COUNT(*)`,
        quantitySold: sql<number>`SUM(${transactions.quantity})`
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .where(and(
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ))
      .groupBy(groupBy === 'location' ? machines.locationName : transactions.productName)
      .orderBy(sql<number>`SUM(
        CASE 
          WHEN ${transactions.amount} > 0 THEN ${transactions.amount}
          ELSE ${transactions.price} * ${transactions.quantity}
        END
      ) DESC`);
    
    const results = await query;
    
    const profitabilityOverview = results.map(row => {
      const revenueGross = safeNumber(row.revenueGross);
      const revenueNet = safeNumber(row.revenueNet);
      const quantity = safeNumber(row.quantitySold);
      
      // Geschätzte Kosten (vereinfacht)
      const estimatedCosts = revenueNet * 0.75; // 75% als Gesamtkostenanteil
      const netProfit = revenueNet - estimatedCosts;
      const profitMargin = revenueNet > 0 ? (netProfit / revenueNet) * 100 : 0;
      
      return {
        name: row.identifier || 'Unbekannt',
        type: groupBy,
        data: {
          revenueGross: Math.round(revenueGross * 100) / 100,
          revenueNet: Math.round(revenueNet * 100) / 100,
          depositRevenue: 0,
          purchaseCosts: Math.round(estimatedCosts * 0.65 * 100) / 100,
          locationCosts: Math.round(estimatedCosts * 0.35 * 100) / 100,
          totalCosts: Math.round(estimatedCosts * 100) / 100,
          grossProfit: Math.round((revenueNet - estimatedCosts * 0.65) * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          transactionCount: safeNumber(row.transactionCount),
          quantitySold: quantity,
          isProfitable: netProfit > 0
        }
      };
    });
    
    const summary = {
      totalItems: profitabilityOverview.length,
      profitableItems: profitabilityOverview.filter(item => item.data.isProfitable).length,
      totalRevenue: profitabilityOverview.reduce((sum, item) => sum + item.data.revenueNet, 0),
      totalProfit: profitabilityOverview.reduce((sum, item) => sum + item.data.netProfit, 0),
      averageMargin: profitabilityOverview.length > 0 ? 
        profitabilityOverview.reduce((sum, item) => sum + item.data.profitMargin, 0) / profitabilityOverview.length : 0
    };
    
    res.json({
      success: true,
      timeframe: { start, end },
      groupBy,
      data: profitabilityOverview,
      summary: {
        ...summary,
        totalRevenue: Math.round(summary.totalRevenue * 100) / 100,
        totalProfit: Math.round(summary.totalProfit * 100) / 100,
        averageMargin: Math.round(summary.averageMargin * 100) / 100
      }
    });
    
  } catch (error) {
    console.error('Fehler in Wirtschaftlichkeitsübersicht:', error);
    res.status(500).json({ 
      success: false,
      error: "Fehler bei der Wirtschaftlichkeitsübersicht",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
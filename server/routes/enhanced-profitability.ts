import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { 
  transactions,
  products,
  machines,
  locations,
  locationCosts,
  purchaseConditions,
  suppliers
} from '../../shared/schema.js';
import { eq, and, gte, lte, desc, asc, sql, isNull, or } from 'drizzle-orm';

const router = Router();

// Enhanced profitability analysis with German business metrics
router.get('/overview', async (req, res) => {
  try {
    const { 
      period = 'month',
      startDate,
      endDate, 
      groupBy = 'location',
      locationId,
      machineId,
      productId 
    } = req.query;

    // Default date range if not provided
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    if (period === 'month') {
      defaultStartDate.setMonth(defaultStartDate.getMonth() - 1);
    } else if (period === 'week') {
      defaultStartDate.setDate(defaultStartDate.getDate() - 7);
    } else {
      defaultStartDate.setDate(defaultStartDate.getDate() - 1);
    }

    const start = startDate ? new Date(String(startDate)) : defaultStartDate;
    const end = endDate ? new Date(String(endDate)) : defaultEndDate;

    // Base transaction query with revenue calculation
    let revenueQuery = db
      .select({
        locationId: machines.locationId,
        locationName: machines.locationName,
        machineId: transactions.machineId,
        machineName: machines.machineName,
        productId: sql<number>`CAST(${transactions.productId} AS INTEGER)`,
        productName: transactions.productName,
        // Revenue calculations (German business metrics)
        umsatzBrutto: sql<number>`SUM(${transactions.price})`, // Gross revenue
        umsatzNetto: sql<number>`SUM(${transactions.price} / 1.19)`, // Net revenue (assuming 19% VAT)
        pfandUmsatz: sql<number>`SUM(COALESCE(${transactions.depositPrice}, 0))`, // Deposit revenue
        transactionCount: sql<number>`COUNT(*)`,
        quantitySold: sql<number>`SUM(${transactions.quantity})`,
        avgSalePrice: sql<number>`AVG(${transactions.price})`,
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .leftJoin(products, sql`CAST(${transactions.productId} AS INTEGER) = ${products.id}`)
      .where(and(
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ));

    // Apply filters
    const conditions = [
      gte(transactions.datetime, start),
      lte(transactions.datetime, end)
    ];

    if (locationId) conditions.push(eq(machines.locationId, Number(locationId)));
    if (machineId) conditions.push(eq(transactions.machineId, Number(machineId)));
    if (productId) conditions.push(sql`CAST(${transactions.productId} AS INTEGER) = ${Number(productId)}`);

    revenueQuery = revenueQuery.where(and(...conditions));

    // Group by selection
    const groupByFields = [];
    if (groupBy === 'location' || groupBy === 'total') {
      groupByFields.push(machines.locationId, machines.locationName);
    }
    if (groupBy === 'machine') {
      groupByFields.push(machines.locationId, machines.locationName, transactions.machineId, machines.machineName);
    }
    if (groupBy === 'product') {
      groupByFields.push(sql<number>`CAST(${transactions.productId} AS INTEGER)`, transactions.productName);
    }

    if (groupByFields.length > 0) {
      revenueQuery = revenueQuery.groupBy(...groupByFields);
    }

    const revenueData = await revenueQuery;

    // Get purchase costs for products
    const productIds = [...new Set(revenueData.map(row => row.productId).filter(Boolean))];
    let purchaseCosts: Record<number, number> = {};

    if (productIds.length > 0) {
      const costData = await db
        .select({
          productId: purchaseConditions.productId,
          avgCost: sql<number>`AVG(${purchaseConditions.unitPrice})`,
        })
        .from(purchaseConditions)
        .where(sql`${purchaseConditions.productId} = ANY(${productIds})`)
        .groupBy(purchaseConditions.productId);

      purchaseCosts = costData.reduce((acc, row) => {
        acc[row.productId] = row.avgCost || 0;
        return acc;
      }, {} as Record<number, number>);
    }

    // Get location costs with proper date filtering
    const locationIds = Array.from(new Set(revenueData.map((row: any) => row.locationId).filter(Boolean)));
    let locationCostData: Record<number, number> = {};

    if (locationIds.length > 0) {
      // Updated location cost query to use amountNet and proper date filtering
      const costs = await db
        .select({
          locationId: locationCosts.locationId,
          amountNet: sql<number>`SUM(${locationCosts.amountNet})`,
          costType: locationCosts.costType,
        })
        .from(locationCosts)
        .where(and(
          sql`${locationCosts.locationId} = ANY(ARRAY[${locationIds.join(',')}])`,
          // Date filtering: validFrom <= endDate AND (validTo IS NULL OR validTo >= startDate)
          sql`${locationCosts.validFrom} <= ${end.toISOString().split('T')[0]}`,
          or(
            isNull(locationCosts.validTo),
            sql`${locationCosts.validTo} >= ${start.toISOString().split('T')[0]}`
          ),
          eq(locationCosts.isActive, true)
        ))
        .groupBy(locationCosts.locationId, locationCosts.costType);

      // Sum amountNet for the requested date range per location
      costs.forEach((cost: any) => {
        const currentCost = locationCostData[cost.locationId] || 0;
        locationCostData[cost.locationId] = currentCost + (cost.amountNet || 0);
      });
    }

    // Calculate enhanced profitability metrics with proper cost allocation
    const enrichedData = revenueData.map((row: any) => {
      const purchaseCostNet = (purchaseCosts[row.productId] || 0) * (row.quantitySold || 0);
      
      // Allocate location costs proportionally
      let allocatedLocationCost = 0;
      if (groupBy === 'machine' || groupBy === 'product') {
        // Distribute location costs proportionally by revenue share
        const totalLocationRevenue = revenueData
          .filter((r: any) => r.locationId === row.locationId)
          .reduce((sum: number, r: any) => sum + (r.umsatzNetto || 0), 0);
        
        if (totalLocationRevenue > 0) {
          const revenueShare = (row.umsatzNetto || 0) / totalLocationRevenue;
          allocatedLocationCost = (locationCostData[row.locationId] || 0) * revenueShare;
        }
      } else {
        // For location grouping, use full location cost
        allocatedLocationCost = locationCostData[row.locationId] || 0;
      }

      // Include deposit revenue and calculate net revenue
      const revenueNet = (row.umsatzNetto || 0) - (row.pfandUmsatz || 0);
      const depositRevenue = row.pfandUmsatz || 0;
      
      const netProfit = revenueNet - purchaseCostNet - allocatedLocationCost;
      const profitMarginPercent = revenueNet > 0 ? (netProfit / revenueNet) * 100 : 0;

      return {
        period: `${start.toISOString().split('T')[0]} bis ${end.toISOString().split('T')[0]}`,
        periodDate: start.toISOString().split('T')[0],
        location: row.locationName || 'Unbekannt',
        locationId: row.locationId,
        machineId: row.machineId,
        machineName: row.machineName,
        productId: row.productId,
        productName: row.productName,
        // Updated fields according to requirements
        revenueNet,
        depositRevenue,
        purchaseCostNet,
        allocatedLocationCost,
        netProfit,
        profitMarginPercent,
        transactionCount: row.transactionCount || 0,
        quantitySold: row.quantitySold || 0,
        // Legacy fields for compatibility
        umsatzBrutto: row.umsatzBrutto || 0,
        umsatzNetto: row.umsatzNetto || 0,
        pfandUmsatz: row.pfandUmsatz || 0,
        wareneinsatz: purchaseCostNet,
        fixkosten: allocatedLocationCost,
        gesamtkosten: purchaseCostNet + allocatedLocationCost,
        rohertrag: revenueNet - purchaseCostNet,
        nettoErgebnis: netProfit,
        gewinnmarge: profitMarginPercent,
        istWirtschaftlich: netProfit > 0,
        avgSalePrice: row.avgSalePrice || 0,
        avgPurchasePrice: purchaseCosts[row.productId] || 0,
      };
    });

    // Calculate summary with proper totals
    const summary = {
      totalRevenueNet: enrichedData.reduce((sum, row) => sum + row.revenueNet, 0),
      totalDepositRevenue: enrichedData.reduce((sum, row) => sum + row.depositRevenue, 0),
      totalPurchaseCostNet: enrichedData.reduce((sum, row) => sum + row.purchaseCostNet, 0),
      totalAllocatedLocationCost: enrichedData.reduce((sum, row) => sum + row.allocatedLocationCost, 0),
      totalNetProfit: enrichedData.reduce((sum, row) => sum + row.netProfit, 0),
      averageProfitMargin: enrichedData.length > 0 ? enrichedData.reduce((sum, row) => sum + row.profitMarginPercent, 0) / enrichedData.length : 0,
      totalCosts: enrichedData.reduce((sum, row) => sum + row.purchaseCostNet + row.allocatedLocationCost, 0),
      profitableItems: enrichedData.filter(row => row.istWirtschaftlich).length,
      totalItems: enrichedData.length,
      profitabilityRate: enrichedData.length > 0 ? (enrichedData.filter(row => row.istWirtschaftlich).length / enrichedData.length) * 100 : 0,
      totalTransactions: enrichedData.reduce((sum, row) => sum + row.transactionCount, 0),
      totalQuantitySold: enrichedData.reduce((sum, row) => sum + row.quantitySold, 0),
      // Legacy fields for compatibility
      gesamtUmsatzBrutto: enrichedData.reduce((sum, row) => sum + row.umsatzBrutto, 0),
      gesamtUmsatzNetto: enrichedData.reduce((sum, row) => sum + row.umsatzNetto, 0),
      gesamtPfandUmsatz: enrichedData.reduce((sum, row) => sum + row.pfandUmsatz, 0),
      gesamtWareneinsatz: enrichedData.reduce((sum, row) => sum + row.wareneinsatz, 0),
      gesamtFixkosten: enrichedData.reduce((sum, row) => sum + row.fixkosten, 0),
      gesamtKosten: enrichedData.reduce((sum, row) => sum + row.gesamtkosten, 0),
      gesamtRohertrag: enrichedData.reduce((sum, row) => sum + row.rohertrag, 0),
      gesamtNettoErgebnis: enrichedData.reduce((sum, row) => sum + row.nettoErgebnis, 0),
    };

    res.json({
      success: true,
      data: enrichedData,
      summary
    });

  } catch (error) {
    console.error('Error fetching enhanced profitability:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Wirtschaftlichkeitsanalyse'
    });
  }
});

// Get detailed profitability for a specific location
router.get('/location/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { startDate, endDate } = req.query;

    // Default to current month if no dates provided
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : new Date(end.getFullYear(), end.getMonth(), 1);

    // Get revenue data grouped by product
    const revenueData = await db
      .select({
        productId: sql<number>`CAST(${transactions.productId} AS INTEGER)`,
        productName: transactions.productName,
        umsatzBrutto: sql<number>`SUM(${transactions.price})`,
        umsatzNetto: sql<number>`SUM(${transactions.price} / 1.19)`,
        pfandUmsatz: sql<number>`SUM(COALESCE(${transactions.depositPrice}, 0))`,
        transactionCount: sql<number>`COUNT(*)`,
        quantitySold: sql<number>`SUM(${transactions.quantity})`,
        avgSalePrice: sql<number>`AVG(${transactions.price})`,
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .where(and(
        eq(machines.locationId, Number(locationId)),
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ))
      .groupBy(sql<number>`CAST(${transactions.productId} AS INTEGER)`, transactions.productName);

    // Get location costs
    const locationCostsData = await db
      .select()
      .from(locationCosts)
      .where(and(
        eq(locationCosts.locationId, Number(locationId)),
        eq(locationCosts.isActive, true),
        gte(locationCosts.validFrom, start),
        lte(locationCosts.validUntil, end)
      ));

    // Get purchase costs
    const productIds = revenueData.map(row => row.productId).filter(Boolean);
    let purchaseCosts: Record<number, number> = {};

    if (productIds.length > 0) {
      const costData = await db
        .select({
          productId: purchaseConditions.productId,
          avgCost: sql<number>`AVG(${purchaseConditions.unitPrice})`,
        })
        .from(purchaseConditions)
        .where(sql`${purchaseConditions.productId} = ANY(${productIds})`)
        .groupBy(purchaseConditions.productId);

      purchaseCosts = costData.reduce((acc, row) => {
        acc[row.productId] = row.avgCost || 0;
        return acc;
      }, {} as Record<number, number>);
    }

    // Calculate detailed profitability
    const totalFixkosten = locationCostsData.reduce((sum, cost) => sum + (cost.amount || 0), 0);
    const totalProducts = revenueData.length;
    const fixkostenPerProduct = totalProducts > 0 ? totalFixkosten / totalProducts : 0;

    const detailedResults = revenueData.map(row => {
      const wareneinsatz = (purchaseCosts[row.productId] || 0) * (row.quantitySold || 0);
      const rohertrag = (row.umsatzNetto || 0) - wareneinsatz;
      const nettoErgebnis = rohertrag - fixkostenPerProduct;

      return {
        productId: row.productId,
        productName: row.productName,
        umsatzBrutto: row.umsatzBrutto || 0,
        umsatzNetto: row.umsatzNetto || 0,
        pfandUmsatz: row.pfandUmsatz || 0,
        wareneinsatz,
        fixkostenAnteil: fixkostenPerProduct,
        gesamtkosten: wareneinsatz + fixkostenPerProduct,
        rohertrag,
        nettoErgebnis,
        gewinnmarge: row.umsatzNetto > 0 ? (rohertrag / row.umsatzNetto) * 100 : 0,
        nettoMargeVorSteuern: row.umsatzNetto > 0 ? (nettoErgebnis / row.umsatzNetto) * 100 : 0,
        istWirtschaftlich: nettoErgebnis > 0,
        transactionCount: row.transactionCount || 0,
        quantitySold: row.quantitySold || 0,
        avgSalePrice: row.avgSalePrice || 0,
        avgPurchasePrice: purchaseCosts[row.productId] || 0,
      };
    });

    // Group costs by type for breakdown
    const costsBreakdown = locationCostsData.reduce((acc, cost) => {
      if (!acc[cost.costType]) {
        acc[cost.costType] = { total: 0, items: [] };
      }
      acc[cost.costType].total += cost.amount || 0;
      acc[cost.costType].items.push(cost);
      return acc;
    }, {} as Record<string, { total: number; items: any[] }>);

    res.json({
      success: true,
      data: {
        products: detailedResults,
        costs: costsBreakdown,
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        },
        summary: {
          gesamtUmsatzNetto: detailedResults.reduce((sum, row) => sum + row.umsatzNetto, 0),
          gesamtWareneinsatz: detailedResults.reduce((sum, row) => sum + row.wareneinsatz, 0),
          gesamtFixkosten: totalFixkosten,
          gesamtRohertrag: detailedResults.reduce((sum, row) => sum + row.rohertrag, 0),
          gesamtNettoErgebnis: detailedResults.reduce((sum, row) => sum + row.nettoErgebnis, 0),
          wirtschaftlicheProdukte: detailedResults.filter(row => row.istWirtschaftlich).length,
          gesamtProdukte: detailedResults.length,
        }
      }
    });

  } catch (error) {
    console.error('Error fetching location profitability:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Standort-Wirtschaftlichkeit'
    });
  }
});

export default router;
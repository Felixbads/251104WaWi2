/**
 * Vollständige Kosten- und Umsatzanalyse für Produkte
 * 
 * Zeigt transparente Aufstellung der Kosten je Produkt:
 * - Einkaufsbedingung je Stück, abzüglich Rabatt, plus Pfand
 * - Erlöse je Produkt, über Zeitraum, je Standort
 */

import { Router } from 'express';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { 
  products, 
  purchaseConditions, 
  suppliers, 
  transactions, 
  machines, 
  locations,
  locationCosts,
  supplierDiscountConditions
} from '../../shared/schema.js';
import { eq, and, gte, lte, sql, isNull, or } from 'drizzle-orm';



const router = Router();

interface ProductCostBreakdown {
  productId: number;
  productName: string;
  supplier: {
    id: number;
    name: string;
  };
  purchaseCondition: {
    unitPrice: number;
    taxRate: number;
    grossPrice: number;
    depositPerUnit: number;
    packagingUnit: string;
    packagingQuantity: number;
    minQuantity: number;
    validFrom: string | null;
    validTo: string | null;
  };
  discount: {
    discountRate: number;
    discountType: string; // 'percentage' | 'fixed'
    discountedPrice: number;
  };
  finalCost: {
    netCostPerUnit: number; // Einkaufspreis abzüglich Rabatt
    depositPerUnit: number; // Pfand
    totalCostPerUnit: number; // Gesamtkosten je Stück
    vatAmount: number; // MwSt-Betrag
    grossCostPerUnit: number; // Brutto-Gesamtkosten
  };
}

interface ProductRevenueAnalysis {
  productId: number;
  productName: string;
  revenueByPeriod: {
    totalRevenue: number;
    netRevenue: number;
    depositRevenue: number;
    vatAmount: number;
    quantitySold: number;
    transactionCount: number;
    avgSalePrice: number;
    avgMargin: number;
  };
  revenueByLocation: Array<{
    locationId: number;
    locationName: string;
    revenue: number;
    netRevenue: number;
    quantitySold: number;
    transactionCount: number;
    avgSalePrice: number;
  }>;
}

interface ProfitabilityAnalysis {
  productId: number;
  productName: string;
  costs: ProductCostBreakdown['finalCost'];
  revenue: ProductRevenueAnalysis['revenueByPeriod'];
  profitability: {
    grossProfit: number; // Bruttogewinn (Umsatz - Wareneinsatz)
    netProfit: number; // Nettogewinn (nach allen Kosten)
    profitMarginPercent: number;
    returnOnInvestment: number;
    isProfitable: boolean;
  };
  allocatedLocationCosts: number; // Anteilige Standortkosten
}

/**
 * GET /api/product-analysis/costs
 * Detaillierte Kostenaufstellung je Produkt
 */
router.get('/costs', async (req, res) => {
  try {
    const { productId, supplierId } = req.query;

    console.log('🔍 Produktkostenanalyse gestartet:', { productId, supplierId });

    // Base query für Produktkosten
    let query = db
      .select({
        product: products,
        purchaseCondition: purchaseConditions,
        supplier: suppliers,
      })
      .from(products)
      .leftJoin(purchaseConditions, eq(products.id, purchaseConditions.productId))
      .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id));

    // Filter anwenden
    const conditions = [];
    if (productId) {
      conditions.push(eq(products.id, Number(productId)));
    }
    if (supplierId) {
      conditions.push(eq(suppliers.id, Number(supplierId)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const productCostData = await query;

    // Rabattinformationen laden
    const supplierIds = Array.from(new Set(productCostData.map((row: any) => row.supplier?.id).filter(Boolean)));
    const discountConditions = supplierIds.length > 0 ? await db
      .select()
      .from(supplierDiscountConditions)
      .where(sql`${supplierDiscountConditions.supplierId} IN (${sql.join(supplierIds, sql`,`)})`) : [];

    // Kostenaufstellung je Produkt erstellen
    const costBreakdowns: ProductCostBreakdown[] = productCostData
      .filter((row: any) => row.purchaseCondition && row.supplier)
      .map((row: any) => {
        const product = row.product;
        const condition = row.purchaseCondition!;
        const supplier = row.supplier!;

        // Rabatt für diesen Lieferanten finden
        const supplierDiscount = discountConditions.find((dc: any) => dc.supplierId === supplier.id);
        const discountRate = supplierDiscount?.discountRate || 0;
        const discountType = supplierDiscount?.discountType || 'percentage';

        // Rabatt berechnen
        let discountedPrice = condition.unitPrice;
        if (discountType === 'percentage') {
          discountedPrice = condition.unitPrice * (1 - discountRate / 100);
        } else {
          discountedPrice = Math.max(0, condition.unitPrice - discountRate);
        }

        // Finale Kostenberechnung
        const netCostPerUnit = discountedPrice;
        const depositPerUnit = condition.depositPerUnit || 0;
        const totalCostPerUnit = netCostPerUnit + depositPerUnit;
        const vatAmount = totalCostPerUnit * (condition.taxRate / 100);
        const grossCostPerUnit = totalCostPerUnit + vatAmount;

        return {
          productId: product.id,
          productName: product.productName,
          supplier: {
            id: supplier.id,
            name: supplier.name,
          },
          purchaseCondition: {
            unitPrice: condition.unitPrice,
            taxRate: condition.taxRate || 19,
            grossPrice: condition.grossPrice || 0,
            depositPerUnit: condition.depositPerUnit || 0,
            packagingUnit: condition.packagingUnit || 'Stück',
            packagingQuantity: condition.packagingQuantity || 1,
            minQuantity: condition.minQuantity || 0,
            validFrom: condition.validFrom?.toISOString() || null,
            validTo: condition.validTo?.toISOString() || null,
          },
          discount: {
            discountRate,
            discountType,
            discountedPrice,
          },
          finalCost: {
            netCostPerUnit,
            depositPerUnit,
            totalCostPerUnit,
            vatAmount,
            grossCostPerUnit,
          },
        };
      });

    console.log('✅ Produktkostenanalyse abgeschlossen:', {
      productsAnalyzed: costBreakdowns.length,
      suppliersIncluded: supplierIds.length,
      discountsApplied: discountConditions.length,
    });

    res.json({
      success: true,
      data: costBreakdowns,
      summary: {
        totalProducts: costBreakdowns.length,
        suppliersAnalyzed: supplierIds.length,
        averageCostPerUnit: costBreakdowns.length > 0 
          ? costBreakdowns.reduce((sum, cb) => sum + cb.finalCost.totalCostPerUnit, 0) / costBreakdowns.length 
          : 0,
        totalDiscountsApplied: discountConditions.length,
      },
    });

  } catch (error) {
    console.error('❌ Fehler in Produktkostenanalyse:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Produktkostenanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler',
    });
  }
});

/**
 * GET /api/product-analysis/revenue
 * Detaillierte Umsatzanalyse je Produkt, Zeitraum und Standort
 */
router.get('/revenue', async (req, res) => {
  try {
    const { 
      productId, 
      startDate = '2025-07-01', 
      endDate = '2025-07-21',
      locationId,
      groupBy = 'product' // 'product', 'location', 'period'
    } = req.query;

    console.log('📊 Umsatzanalyse gestartet:', { productId, startDate, endDate, locationId, groupBy });

    const start = new Date(String(startDate));
    const end = new Date(String(endDate));

    // Basis-Query für Umsatzdaten
    let revenueQuery = db
      .select({
        transaction: transactions,
        machine: machines,
        location: locations,
        product: products,
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .leftJoin(locations, eq(machines.locationId, locations.id))
      .leftJoin(products, sql`CAST(${transactions.productId} AS INTEGER) = ${products.id}`);

    // Filter anwenden
    const conditions = [
      gte(transactions.datetime, start),
      lte(transactions.datetime, end),
    ];

    if (productId) {
      conditions.push(sql`CAST(${transactions.productId} AS INTEGER) = ${Number(productId)}`);
    }
    if (locationId) {
      conditions.push(eq(locations.id, Number(locationId)));
    }

    revenueQuery = revenueQuery.where(and(...conditions));

    const revenueData = await revenueQuery;

    // Umsatzanalyse je Produkt
    const revenueByProduct = new Map<number, {
      productName: string;
      totalRevenue: number;
      netRevenue: number;
      depositRevenue: number;
      vatAmount: number;
      quantitySold: number;
      transactionCount: number;
      transactions: any[];
      locationRevenue: Map<number, {
        locationName: string;
        revenue: number;
        netRevenue: number;
        quantitySold: number;
        transactionCount: number;
      }>;
    }>();

    // Daten gruppieren und berechnen
    revenueData.forEach((row: any) => {
      const transaction = row.transaction;
      const machine = row.machine;
      const location = row.location;
      const product = row.product;

      // Fallback für fehlende product_id
      const effectiveProductId = product?.id || parseInt(transaction.productId || '0') || 0;
      const effectiveProductName = product?.productName || transaction.productName || 'Unbekanntes Produkt';

      if (!revenueByProduct.has(effectiveProductId)) {
        revenueByProduct.set(effectiveProductId, {
          productName: effectiveProductName,
          totalRevenue: 0,
          netRevenue: 0,
          depositRevenue: 0,
          vatAmount: 0,
          quantitySold: 0,
          transactionCount: 0,
          transactions: [],
          locationRevenue: new Map(),
        });
      }

      const productRevenue = revenueByProduct.get(effectiveProductId)!;

      // Umsatzberechnung
      const salePrice = transaction.price || transaction.amount || 0;
      const quantity = transaction.quantity || 1;
      const depositPrice = product?.depositPrice || 0;

      // Netto-Umsatz berechnen (ohne Pfand und MwSt)
      const priceWithoutDeposit = Math.max(0, salePrice - depositPrice);
      const netPrice = priceWithoutDeposit / 1.19; // 19% MwSt entfernen
      const vatAmount = priceWithoutDeposit - netPrice;

      productRevenue.totalRevenue += salePrice * quantity;
      productRevenue.netRevenue += netPrice * quantity;
      productRevenue.depositRevenue += depositPrice * quantity;
      productRevenue.vatAmount += vatAmount * quantity;
      productRevenue.quantitySold += quantity;
      productRevenue.transactionCount += 1;
      productRevenue.transactions.push(transaction);

      // Umsatz je Standort
      if (location) {
        if (!productRevenue.locationRevenue.has(location.id)) {
          productRevenue.locationRevenue.set(location.id, {
            locationName: location.name,
            revenue: 0,
            netRevenue: 0,
            quantitySold: 0,
            transactionCount: 0,
          });
        }

        const locationRevenue = productRevenue.locationRevenue.get(location.id)!;
        locationRevenue.revenue += salePrice * quantity;
        locationRevenue.netRevenue += netPrice * quantity;
        locationRevenue.quantitySold += quantity;
        locationRevenue.transactionCount += 1;
      }
    });

    // Ergebnisse formatieren
    const revenueAnalysis: ProductRevenueAnalysis[] = Array.from(revenueByProduct.entries()).map(([productId, data]) => ({
      productId,
      productName: data.productName,
      revenueByPeriod: {
        totalRevenue: data.totalRevenue,
        netRevenue: data.netRevenue,
        depositRevenue: data.depositRevenue,
        vatAmount: data.vatAmount,
        quantitySold: data.quantitySold,
        transactionCount: data.transactionCount,
        avgSalePrice: data.quantitySold > 0 ? data.totalRevenue / data.quantitySold : 0,
        avgMargin: data.netRevenue > 0 ? ((data.netRevenue - data.depositRevenue) / data.netRevenue) * 100 : 0,
      },
      revenueByLocation: Array.from(data.locationRevenue.entries()).map(([locationId, locationData]) => ({
        locationId,
        locationName: locationData.locationName,
        revenue: locationData.revenue,
        netRevenue: locationData.netRevenue,
        quantitySold: locationData.quantitySold,
        transactionCount: locationData.transactionCount,
        avgSalePrice: locationData.quantitySold > 0 ? locationData.revenue / locationData.quantitySold : 0,
      })),
    }));

    console.log('✅ Umsatzanalyse abgeschlossen:', {
      productsAnalyzed: revenueAnalysis.length,
      totalTransactions: revenueData.length,
      timeframe: { start: startDate, end: endDate },
    });

    res.json({
      success: true,
      data: revenueAnalysis,
      summary: {
        productsAnalyzed: revenueAnalysis.length,
        totalTransactions: revenueData.length,
        totalRevenue: revenueAnalysis.reduce((sum, ra) => sum + ra.revenueByPeriod.totalRevenue, 0),
        totalNetRevenue: revenueAnalysis.reduce((sum, ra) => sum + ra.revenueByPeriod.netRevenue, 0),
        timeframe: { start: startDate, end: endDate },
      },
    });

  } catch (error) {
    console.error('❌ Fehler in Umsatzanalyse:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Umsatzanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler',
    });
  }
});

/**
 * GET /api/product-analysis/profitability
 * Vollständige Rentabilitätsanalyse mit korrekter Kostenallokation
 */
router.get('/profitability', async (req, res) => {
  try {
    const { 
      startDate = '2025-07-01', 
      endDate = '2025-07-21',
      locationId,
      productId,
      groupBy = 'product' // 'product', 'location', 'machine'
    } = req.query;

    console.log('💰 Vollständige Rentabilitätsanalyse gestartet:', { startDate, endDate, locationId, productId, groupBy });

    const start = new Date(String(startDate));
    const end = new Date(String(endDate));

    // 1. Kosten je Produkt laden
    const costsResponse = await fetch(`${req.protocol}://${req.get('host')}/api/product-analysis/costs${productId ? `?productId=${productId}` : ''}`);
    const costsData = await costsResponse.json();
    const productCosts = new Map<number, ProductCostBreakdown['finalCost']>();
    
    if (costsData.success) {
      costsData.data.forEach((cost: ProductCostBreakdown) => {
        productCosts.set(cost.productId, cost.finalCost);
      });
    }

    // 2. Umsätze je Produkt laden
    const revenueResponse = await fetch(`${req.protocol}://${req.get('host')}/api/product-analysis/revenue?startDate=${startDate}&endDate=${endDate}${locationId ? `&locationId=${locationId}` : ''}${productId ? `&productId=${productId}` : ''}`);
    const revenueData = await revenueResponse.json();

    // 3. Standortkosten für den Zeitraum laden
    const locationCostsData = await db
      .select({
        locationCost: locationCosts,
        location: locations,
      })
      .from(locationCosts)
      .leftJoin(locations, eq(locationCosts.locationId, locations.id))
      .where(and(
        sql`${locationCosts.validFrom} <= ${end.toISOString().split('T')[0]}`,
        or(
          isNull(locationCosts.validTo), 
          sql`${locationCosts.validTo} >= ${start.toISOString().split('T')[0]}`
        ),
        eq(locationCosts.isActive, true)
      ));

    // Standortkosten nach Location gruppieren
    const locationCostsByLocation = new Map<number, number>();
    locationCostsData.forEach((row: any) => {
      const locationId = row.locationCost.locationId;
      if (locationId) {
        const currentCost = locationCostsByLocation.get(locationId) || 0;
        locationCostsByLocation.set(locationId, currentCost + (row.locationCost.amountNet || 0));
      }
    });

    // 4. Rentabilitätsanalyse durchführen
    const profitabilityAnalysis: ProfitabilityAnalysis[] = [];

    if (revenueData.success) {
      revenueData.data.forEach((revenue: ProductRevenueAnalysis) => {
        const costs = productCosts.get(revenue.productId);
        
        if (costs) {
          // Wareneinsatz berechnen
          const purchaseCostNet = costs.netCostPerUnit * revenue.revenueByPeriod.quantitySold;
          
          // Anteilige Standortkosten berechnen
          // Verteile Standortkosten proportional zum Umsatzanteil je Standort
          let allocatedLocationCosts = 0;
          revenue.revenueByLocation.forEach(locationRevenue => {
            const locationCost = locationCostsByLocation.get(locationRevenue.locationId) || 0;
            // Vereinfachte Allokation: Kosten proportional zum Umsatz
            allocatedLocationCosts += locationCost * (locationRevenue.revenue / revenue.revenueByPeriod.totalRevenue || 0);
          });

          // Rentabilitätskennzahlen berechnen
          const grossProfit = revenue.revenueByPeriod.netRevenue - purchaseCostNet;
          const netProfit = grossProfit - allocatedLocationCosts;
          const profitMarginPercent = revenue.revenueByPeriod.netRevenue > 0 
            ? (netProfit / revenue.revenueByPeriod.netRevenue) * 100 
            : 0;
          const returnOnInvestment = (purchaseCostNet + allocatedLocationCosts) > 0 
            ? (netProfit / (purchaseCostNet + allocatedLocationCosts)) * 100 
            : 0;

          profitabilityAnalysis.push({
            productId: revenue.productId,
            productName: revenue.productName,
            costs,
            revenue: revenue.revenueByPeriod,
            profitability: {
              grossProfit,
              netProfit,
              profitMarginPercent,
              returnOnInvestment,
              isProfitable: netProfit > 0,
            },
            allocatedLocationCosts,
          });
        }
      });
    }

    // Sortiere nach Rentabilität
    profitabilityAnalysis.sort((a, b) => b.profitability.netProfit - a.profitability.netProfit);

    console.log('✅ Rentabilitätsanalyse abgeschlossen:', {
      productsAnalyzed: profitabilityAnalysis.length,
      profitableProducts: profitabilityAnalysis.filter(pa => pa.profitability.isProfitable).length,
      totalNetProfit: profitabilityAnalysis.reduce((sum, pa) => sum + pa.profitability.netProfit, 0),
    });

    res.json({
      success: true,
      data: profitabilityAnalysis,
      summary: {
        totalProducts: profitabilityAnalysis.length,
        profitableProducts: profitabilityAnalysis.filter(pa => pa.profitability.isProfitable).length,
        totalNetProfit: profitabilityAnalysis.reduce((sum, pa) => sum + pa.profitability.netProfit, 0),
        totalGrossProfit: profitabilityAnalysis.reduce((sum, pa) => sum + pa.profitability.grossProfit, 0),
        averageProfitMargin: profitabilityAnalysis.length > 0 
          ? profitabilityAnalysis.reduce((sum, pa) => sum + pa.profitability.profitMarginPercent, 0) / profitabilityAnalysis.length 
          : 0,
        timeframe: { start: startDate, end: endDate },
      },
    });

  } catch (error) {
    console.error('❌ Fehler in Rentabilitätsanalyse:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Rentabilitätsanalyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler',
    });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import { sql, eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { transactions, products, purchaseConditions, supplierDiscountConditions, machines } from '../../shared/schema';

const router = Router();

interface ProductProfitability {
  productId: number;
  productName: string;
  category: string;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  profitMargin: number;
  totalQuantitySold: number;
  averageSellingPrice: number;
  averageCostPrice: number;
  monthlySummary: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
    quantity: number;
  }>;
  locationBreakdown: Array<{
    location: string;
    revenue: number;
    profit: number;
    margin: number;
  }>;
}

// Calculate realistic profit margins using purchase conditions and discounts
async function calculateProductCosts(productId: number, quantity: number, revenue: number): Promise<{ costs: number; unitCost: number }> {
  try {
    // Get purchase conditions for the product
    const purchaseQuery = await db
      .select({
        unitPrice: purchaseConditions.unitPrice,
        supplierId: purchaseConditions.supplierId,
        packagingQuantity: purchaseConditions.packagingQuantity,
        depositPerUnit: purchaseConditions.depositPerUnit
      })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.productId, productId))
      .limit(1);

    if (purchaseQuery.length === 0) {
      // NO FALLBACK DATA - Return zero costs if no real purchase conditions
      return { costs: 0, unitCost: 0 };
    }

    const purchase = purchaseQuery[0];
    let unitCost = purchase.unitPrice || 0;

    // Apply supplier discounts
    const discountQuery = await db
      .select({
        discountType: supplierDiscountConditions.discountType,
        discountPercentage: supplierDiscountConditions.discountPercentage,
        thresholdQuantity: supplierDiscountConditions.thresholdQuantity,
        thresholdAmount: supplierDiscountConditions.thresholdAmount
      })
      .from(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.supplierId, purchase.supplierId))
      .orderBy(desc(supplierDiscountConditions.discountPercentage));

    // Apply applicable discount
    for (const discount of discountQuery) {
      if (discount.discountType === 'quantity_scale' && quantity >= (discount.thresholdQuantity || 0)) {
        unitCost = unitCost * (1 - (discount.discountPercentage || 0) / 100);
        break;
      } else if (discount.discountType === 'order_value' && revenue >= (discount.thresholdAmount || 0)) {
        unitCost = unitCost * (1 - (discount.discountPercentage || 0) / 100);
        break;
      }
    }

    const totalCosts = unitCost * quantity;
    return { costs: totalCosts, unitCost };
  } catch (error) {
    console.error('Error calculating product costs:', error);
    // NO FALLBACK - Return zero on error if no real purchase conditions
    return { costs: 0, unitCost: 0 };
  }
}

// Get product profitability analysis
router.get('/:productId/profitability', async (req: Request, res: Response) => {
  try {
    console.log(`[PRODUCT-PROFITABILITY] Request received for product ${req.params.productId}`);
    const productId = parseInt(req.params.productId);
    const { startDate, endDate } = req.query;

    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // Set default date range if not provided
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    // Get product information
    const productQuery = await db
      .select({
        id: products.id,
        productName: products.productName,
        category: products.category,
        price: products.price
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (productQuery.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productQuery[0];

    // Get transaction data for this product BY NAME - Fixed SQL
    const transactionData = await db
      .select({
        revenue: sql<number>`SUM(CASE 
          WHEN ${transactions.amount} > 0 THEN ${transactions.amount} 
          ELSE ${transactions.price} * ${transactions.quantity}
        END)`,
        quantity: sql<number>`SUM(${transactions.quantity})`,
        transactionCount: sql<number>`COUNT(*)`,
        avgPrice: sql<number>`AVG(CASE 
          WHEN ${transactions.amount} > 0 THEN ${transactions.amount} / ${transactions.quantity}
          ELSE ${transactions.price}
        END)`,
        month: sql<string>`DATE_TRUNC('month', ${transactions.datetime})`,
        locationName: machines.locationName
      })
      .from(transactions)
      .leftJoin(machines, eq(transactions.machineId, machines.id))
      .where(and(
        eq(transactions.productName, product.productName),
        gte(transactions.datetime, start),
        lte(transactions.datetime, end)
      ))
      .groupBy(
        sql`DATE_TRUNC('month', ${transactions.datetime})`,
        machines.locationName
      )
      .orderBy(sql`DATE_TRUNC('month', ${transactions.datetime})`);

    if (transactionData.length === 0) {
      return res.status(200).json({
        productId,
        productName: product.productName,
        category: product.category || 'Unbekannt',
        totalRevenue: 0,
        totalCosts: 0,
        totalProfit: 0,
        profitMargin: 0,
        totalQuantitySold: 0,
        averageSellingPrice: 0,
        averageCostPrice: 0,
        monthlySummary: [],
        locationBreakdown: []
      });
    }

    // Calculate totals
    const totalRevenue = transactionData.reduce((sum, row) => sum + (row.revenue || 0), 0);
    const totalQuantity = transactionData.reduce((sum, row) => sum + (row.quantity || 0), 0);
    const averageSellingPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;

    // Calculate costs
    const { costs: totalCosts, unitCost: averageCostPrice } = await calculateProductCosts(productId, totalQuantity, totalRevenue);
    
    const totalProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Group by month for monthly summary
    const monthlyData = new Map<string, { revenue: number; quantity: number; costs: number }>();
    
    for (const row of transactionData) {
      const monthKey = new Date(row.month).toISOString().substring(0, 7); // YYYY-MM format
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { revenue: 0, quantity: 0, costs: 0 });
      }
      
      const monthData = monthlyData.get(monthKey)!;
      monthData.revenue += row.revenue || 0;
      monthData.quantity += row.quantity || 0;
    }

    // Calculate costs for each month
    const monthlySummary = await Promise.all(
      Array.from(monthlyData.entries()).map(async ([month, data]) => {
        const { costs } = await calculateProductCosts(productId, data.quantity, data.revenue);
        return {
          month,
          revenue: data.revenue,
          costs: costs,
          profit: data.revenue - costs,
          quantity: data.quantity
        };
      })
    );

    // Group by location for location breakdown
    const locationData = new Map<string, { revenue: number; quantity: number }>();
    
    for (const row of transactionData) {
      const location = row.locationName || 'Unbekannter Standort';
      
      if (!locationData.has(location)) {
        locationData.set(location, { revenue: 0, quantity: 0 });
      }
      
      const locData = locationData.get(location)!;
      locData.revenue += row.revenue || 0;
      locData.quantity += row.quantity || 0;
    }

    const locationBreakdown = await Promise.all(
      Array.from(locationData.entries()).map(async ([location, data]) => {
        const { costs } = await calculateProductCosts(productId, data.quantity, data.revenue);
        const profit = data.revenue - costs;
        const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
        
        return {
          location,
          revenue: data.revenue,
          profit,
          margin
        };
      })
    );

    // Handle NaN values explicitly
    const safeRevenue = isNaN(totalRevenue) || totalRevenue === null ? 0 : totalRevenue;
    const safeCosts = isNaN(totalCosts) || totalCosts === null ? 0 : totalCosts;
    const safeQuantity = isNaN(totalQuantity) || totalQuantity === null ? 0 : totalQuantity;
    const safeProfit = safeRevenue - safeCosts;
    const safeMargin = safeRevenue > 0 ? (safeProfit / safeRevenue * 100) : 0;
    
    console.log(`[PRODUCT-PROFITABILITY] Calculated values for product ${productId}:`, {
      rawRevenue: totalRevenue, rawCosts: totalCosts, rawQuantity: totalQuantity,
      safeRevenue, safeCosts, safeQuantity, safeProfit, safeMargin
    });

    const profitabilityData: ProductProfitability = {
      productId,
      productName: product.productName,
      category: product.category || 'Unbekannt',
      totalRevenue: Math.round(safeRevenue * 100) / 100,
      totalCosts: Math.round(safeCosts * 100) / 100,
      totalProfit: Math.round(safeProfit * 100) / 100,
      profitMargin: Math.round(safeMargin * 100) / 100,
      totalQuantitySold: safeQuantity,
      averageSellingPrice: safeQuantity > 0 ? Math.round((safeRevenue / safeQuantity) * 100) / 100 : 0,
      averageCostPrice: safeQuantity > 0 ? Math.round((safeCosts / safeQuantity) * 100) / 100 : 0,
      monthlySummary: monthlySummary.map(item => ({
        month: item.month,
        revenue: Math.round(item.revenue * 100) / 100,
        costs: Math.round(item.costs * 100) / 100,
        profit: Math.round(item.profit * 100) / 100,
        quantity: item.quantity
      })),
      locationBreakdown: locationBreakdown.map(item => ({
        location: item.location,
        revenue: Math.round(item.revenue * 100) / 100,
        profit: Math.round(item.profit * 100) / 100,
        margin: Math.round(item.margin * 100) / 100
      }))
    };

    res.json(profitabilityData);
  } catch (error) {
    console.error('Error calculating product profitability:', error);
    res.status(500).json({ 
      error: "Failed to calculate product profitability", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
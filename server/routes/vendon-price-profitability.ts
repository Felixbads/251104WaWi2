import { Router, Request, Response } from 'express';
import { sql, eq, desc, and, gte, lte, ilike } from 'drizzle-orm';
import { db } from '../db';
import { transactions, products, purchaseConditions, supplierDiscountConditions, machines } from '../../shared/schema';

const router = Router();

interface VendonPriceProfitability {
  productId: number | null;
  productName: string;
  vendonPrice: number;
  category: string;
  totalSold: number;
  totalRevenue: number;
  totalCosts: number;
  netProfit: number;
  profitMargin: number;
  averageCostPrice: number;
  machineBreakdown: Array<{
    machineId: number;
    machineName: string;
    locationName: string;
    soldQuantity: number;
    revenue: number;
    profit: number;
    margin: number;
  }>;
  summary: {
    activeMachines: number;
    bestPerformingMachine: string;
    worstPerformingMachine: string;
    priceVariation: boolean;
  };
}

// NEW: Calculate profitability using Vendon prices instead of transaction amounts
async function calculateVendonProfitability(productIdentifier: string | number): Promise<VendonPriceProfitability | null> {
  try {
    // Find product by ID or name
    let productResult;
    if (typeof productIdentifier === 'number') {
      productResult = await db.select().from(products).where(eq(products.id, productIdentifier)).limit(1);
    } else {
      productResult = await db.select().from(products).where(ilike(products.productName, `%${productIdentifier}%`)).limit(1);
    }
    
    if (productResult.length === 0) {
      // Search by transaction productName if not found in products table
      const transactionQuery = await db
        .select({
          product_name: sql`DISTINCT ${transactions.productName}`.as('product_name'),
          count: sql`COUNT(*)`.as('count')
        })
        .from(transactions)
        .where(ilike(transactions.productName, typeof productIdentifier === 'string' ? `%${productIdentifier}%` : `%${productIdentifier}%`))
        .groupBy(transactions.productName)
        .limit(1);
        
      if (transactionQuery.length === 0) {
        return null;
      }
      
      // Product exists in transactions but not in products table - use default price estimation
      const transactionData = transactionQuery[0];
      const productName = transactionData.product_name;
      
      return await calculateTransactionOnlyProfitability(productName);
    }
    
    const product = productResult[0];
    const vendonPrice = product.price || 0;
    
    // Get all transactions for this product (by name matching)
    const transactionData = await db
      .select({
        machine_id: transactions.machineId,
        machine_name: transactions.machine_name, 
        quantity: transactions.quantity,
        datetime: transactions.datetime,
      })
      .from(transactions)
      .where(eq(transactions.product_name, product.product_name))
      .orderBy(desc(transactions.datetime));
    
    const totalSold = transactionData.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const totalRevenue = totalSold * vendonPrice;
    
    // Get purchase conditions for cost calculation
    const { costs: totalCosts, unitCost } = await calculateProductCosts(product.id, totalSold, totalRevenue);
    
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    
    // Calculate machine breakdown
    const machineMap = new Map<number, {
      machineName: string;
      soldQuantity: number;
      revenue: number;
    }>();
    
    for (const transaction of transactionData) {
      const machineId = transaction.machine_id;
      const existing = machineMap.get(machineId) || {
        machineName: transaction.machine_name || `Machine ${machineId}`,
        soldQuantity: 0,
        revenue: 0
      };
      
      existing.soldQuantity += transaction.quantity || 0;
      existing.revenue += (transaction.quantity || 0) * vendonPrice;
      machineMap.set(machineId, existing);
    }
    
    const machineBreakdown = Array.from(machineMap.entries()).map(([machineId, data]) => {
      const machineCosts = data.soldQuantity * unitCost;
      const machineProfit = data.revenue - machineCosts;
      const machineMargin = data.revenue > 0 ? (machineProfit / data.revenue) * 100 : 0;
      
      return {
        machineId,
        machineName: data.machineName,
        locationName: data.machineName, // Use machine name as location for now
        soldQuantity: data.soldQuantity,
        revenue: data.revenue,
        profit: machineProfit,
        margin: machineMargin
      };
    }).sort((a, b) => b.revenue - a.revenue);
    
    const activeMachines = machineBreakdown.length;
    const bestMachine = machineBreakdown[0];
    const worstMachine = machineBreakdown[machineBreakdown.length - 1];
    
    return {
      productId: product.id,
      productName: product.product_name,
      vendonPrice,
      category: product.category || 'Unbekannt',
      totalSold,
      totalRevenue,
      totalCosts,
      netProfit,
      profitMargin,
      averageCostPrice: unitCost,
      machineBreakdown,
      summary: {
        activeMachines,
        bestPerformingMachine: bestMachine?.machineName || 'N/A',
        worstPerformingMachine: worstMachine?.machineName || 'N/A',
        priceVariation: false // Single Vendon price for now
      }
    };
    
  } catch (error) {
    console.error('Error calculating Vendon profitability:', error);
    return null;
  }
}

// Handle products that exist only in transactions (not in products table)
async function calculateTransactionOnlyProfitability(productName: string): Promise<VendonPriceProfitability> {
  const transactionData = await db
    .select({
      machine_id: transactions.machineId,
      machine_name: transactions.machine_name,
      quantity: transactions.quantity,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(eq(transactions.product_name, productName));
  
  const totalSold = transactionData.reduce((sum, t) => sum + (t.quantity || 0), 0);
  
  // CRITICAL: For products without Vendon price data, estimate from highest transaction prices
  const validPrices = transactionData.filter(t => t.amount && t.amount > 0 && t.quantity && t.quantity > 0)
    .map(t => t.amount / t.quantity);
  
  const estimatedPrice = validPrices.length > 0 
    ? Math.max(...validPrices) // Use highest price as best estimate
    : 2.50; // Fallback for eggs based on typical German egg prices
    
  const totalRevenue = totalSold * estimatedPrice;
  
  // No purchase conditions available - show zero costs (authentic approach)
  const totalCosts = 0;
  const unitCost = 0;
  
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  
  // Machine breakdown
  const machineMap = new Map<number, {
    machineName: string;
    soldQuantity: number;
    revenue: number;
  }>();
  
  for (const transaction of transactionData) {
    const machineId = transaction.machine_id;
    const existing = machineMap.get(machineId) || {
      machineName: transaction.machine_name || `Machine ${machineId}`,
      soldQuantity: 0,
      revenue: 0
    };
    
    existing.soldQuantity += transaction.quantity || 0;
    existing.revenue += (transaction.quantity || 0) * estimatedPrice;
    machineMap.set(machineId, existing);
  }
  
  const machineBreakdown = Array.from(machineMap.entries()).map(([machineId, data]) => ({
    machineId,
    machineName: data.machineName,
    locationName: data.machineName,
    soldQuantity: data.soldQuantity,
    revenue: data.revenue,
    profit: data.revenue, // No costs available
    margin: 100 // 100% margin without cost data
  })).sort((a, b) => b.revenue - a.revenue);
  
  return {
    productId: null,
    productName,
    vendonPrice: estimatedPrice,
    category: 'Unbekannt',
    totalSold,
    totalRevenue,
    totalCosts,
    netProfit,
    profitMargin,
    averageCostPrice: unitCost,
    machineBreakdown,
    summary: {
      activeMachines: machineBreakdown.length,
      bestPerformingMachine: machineBreakdown[0]?.machineName || 'N/A',
      worstPerformingMachine: machineBreakdown[machineBreakdown.length - 1]?.machineName || 'N/A',
      priceVariation: validPrices.length > 1 && Math.max(...validPrices) - Math.min(...validPrices) > 0.1
    }
  };
}

// Calculate realistic product costs using purchase conditions
async function calculateProductCosts(productId: number, quantity: number, revenue: number): Promise<{ costs: number; unitCost: number }> {
  try {
    const purchaseQuery = await db
      .select({
        unitPrice: purchaseConditions.unitPrice,
        supplierId: purchaseConditions.supplierId,
        depositPerUnit: purchaseConditions.depositPerUnit
      })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.productId, productId))
      .limit(1);

    if (purchaseQuery.length === 0) {
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

    // Apply best applicable discount
    for (const discount of discountQuery) {
      if (discount.discountType === 'quantity_scale' && quantity >= (discount.thresholdQuantity || 0)) {
        unitCost = unitCost * (1 - (discount.discountPercentage || 0) / 100);
        break;
      } else if (discount.discountType === 'order_value' && revenue >= (discount.thresholdAmount || 0)) {
        unitCost = unitCost * (1 - (discount.discountPercentage || 0) / 100);
        break;
      }
    }

    const totalCosts = quantity * unitCost;
    return { costs: totalCosts, unitCost };

  } catch (error) {
    console.error('Error calculating product costs:', error);
    return { costs: 0, unitCost: 0 };
  }
}

// API endpoint for Vendon-based profitability analysis
router.get('/vendon-profitability/:identifier', async (req: Request, res: Response) => {
  try {
    const identifier = req.params.identifier;
    const productIdentifier = /^\d+$/.test(identifier) ? parseInt(identifier) : identifier;
    
    const profitability = await calculateVendonProfitability(productIdentifier);
    
    if (!profitability) {
      return res.status(404).json({
        success: false,
        error: 'Produkt nicht gefunden'
      });
    }
    
    res.json({
      success: true,
      data: profitability,
      message: 'Vendon-basierte Wirtschaftlichkeitsanalyse erfolgreich erstellt'
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Wirtschaftlichkeitsanalyse'
    });
  }
});

// Special endpoint for eggs analysis (by name)
router.get('/eggs-analysis', async (req: Request, res: Response) => {
  try {
    const eggsProfitability = await calculateVendonProfitability('6 frische Eier, Struppen');
    
    if (!eggsProfitability) {
      return res.status(404).json({
        success: false,
        error: 'Eier-Daten nicht gefunden'
      });
    }
    
    res.json({
      success: true,
      data: eggsProfitability,
      message: 'Eier-Wirtschaftlichkeitsanalyse basierend auf Vendon-Preisen'
    });
    
  } catch (error) {
    console.error('Eggs analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Eier-Analyse'
    });
  }
});

export default router;
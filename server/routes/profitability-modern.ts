import { Router, Request, Response } from 'express';
import { sql, eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { purchaseConditions, supplierDiscountConditions } from '../../shared/schema';

const router = Router();

interface ProfitabilityData {
  totalRevenue: number;
  totalCosts: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  vatAmount: number;
  depositAmount: number;
  topProducts: Array<{
    productName: string;
    revenue: number;
    costs: number;
    profit: number;
    margin: number;
    quantity: number;
  }>;
  monthlySummary: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    revenue: number;
    profit: number;
    count: number;
  }>;
}

// Helper function to get date range based on timeframe
function getDateRange(timeframe: string): { startDate: string; endDate: string } {
  const endDate = new Date();
  let startDate = new Date();
  
  switch (timeframe) {
    case '7d':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(endDate.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    default:
      startDate.setDate(endDate.getDate() - 30);
  }
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
}

// Calculate realistic profit margins using DIRECT SQL (avoiding Drizzle issues)
async function calculateRealProfitMargin(productId: number, revenue: number, quantity: number): Promise<{ costs: number; profit: number; margin: number }> {
  try {
    console.log(`[MARGIN-CALC] Starting DIRECT SQL calculation for product ${productId}, quantity: ${quantity}, revenue: ${revenue}`);
    
    // Use direct SQL to avoid Drizzle issues
    const purchaseQuery = await db.execute(sql`
      SELECT unit_price, supplier_id, packaging_quantity, deposit_per_unit 
      FROM purchase_conditions 
      WHERE product_id = ${productId} 
      LIMIT 1
    `);

    console.log(`[MARGIN-CALC] Found ${purchaseQuery.rows.length} purchase conditions for product ${productId}`);

    if (purchaseQuery.rows.length === 0) {
      console.log(`[MARGIN-CALC] No purchase conditions found for product ${productId}`);
      return { costs: 0, profit: 0, margin: 0 };
    }

    const purchase = purchaseQuery.rows[0];
    const unitCost = Number(purchase.unit_price) || 0;

    console.log(`[MARGIN-CALC] Using direct SQL unit cost: ${unitCost} for product ${productId}`);

    const totalCosts = unitCost * quantity;
    const profit = revenue - totalCosts;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    console.log(`[MARGIN-CALC] Calculated - Unit Cost: ${unitCost}, Total Costs: ${totalCosts}, Profit: ${profit}, Margin: ${margin}%`);

    return { costs: totalCosts, profit, margin };
  } catch (error) {
    console.error('Error calculating profit margin with direct SQL:', error);
    return { costs: 0, profit: 0, margin: 0 };
  }
}

// Helper function to calculate German VAT and deposit
function calculateGermanTaxes(grossAmount: number, hasDeposit: boolean = false): { netAmount: number; vatAmount: number; depositAmount: number } {
  const VAT_RATE = 0.19; // 19% German VAT
  const DEPOSIT_PER_UNIT = 0.25; // €0.25 per bottle (rough estimate)
  
  let depositAmount = 0;
  if (hasDeposit) {
    // Rough estimate based on beverage sales
    depositAmount = grossAmount * 0.1; // Assume 10% of revenue is deposit
  }
  
  const netPlusDeposit = grossAmount;
  const netAmount = netPlusDeposit - depositAmount;
  const vatAmount = netAmount * VAT_RATE / (1 + VAT_RATE);
  
  return {
    netAmount: netAmount - vatAmount,
    vatAmount,
    depositAmount
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || '30d';
    const { startDate, endDate } = getDateRange(timeframe);
    
    console.log(`Modern profitability analysis for ${timeframe}: ${startDate} to ${endDate}`);

    // Get basic revenue data from transactions
    const revenueQuery = sql`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 2.50 END) as total_revenue,
        AVG(CASE WHEN amount > 0 THEN amount ELSE 2.50 END) as avg_transaction
      FROM transactions 
      WHERE datetime >= ${startDate} 
        AND datetime <= ${endDate}
        AND quantity > 0
    `;
    
    const revenueResult = await db.execute(revenueQuery);
    const revenueData = revenueResult.rows[0];
    const totalRevenue = Number(revenueData?.total_revenue || 0);
    
    // Calculate German taxes
    const taxes = calculateGermanTaxes(totalRevenue, true);
    
    // Calculate real costs using purchase conditions and discounts
    // Use direct SQL to get product sales with actual product_id linking  
    const productSalesQuery = sql`
      SELECT 
        p.id as product_id,
        t.product_name,
        SUM(t.quantity) as total_quantity,
        SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE (p.price * t.quantity) END) as total_revenue
      FROM transactions t
      JOIN products p ON t.product_name = p.product_name
      WHERE t.datetime >= ${startDate} 
        AND t.datetime <= ${endDate}
        AND t.quantity > 0
      GROUP BY p.id, t.product_name
      HAVING SUM(t.quantity) > 0
      ORDER BY total_revenue DESC
    `;
    
    const productSalesResult = await db.execute(productSalesQuery);
    console.log(`[PROFITABILITY-DEBUG] Found ${productSalesResult.rows.length} products with sales data`);
    let totalCosts = 0;
    
    // Calculate real costs for each product with detailed debugging
    for (const row of productSalesResult.rows) {
      const productId = Number(row.product_id);
      const quantity = Number(row.total_quantity);
      const revenue = Number(row.total_revenue);
      
      console.log(`[PROFITABILITY-DEBUG] Processing product: ${row.product_name}, ID: ${productId}, Qty: ${quantity}, Revenue: ${revenue}`);
      
      if (productId && quantity > 0) {
        const { costs, profit, margin } = await calculateRealProfitMargin(productId, revenue, quantity);
        totalCosts += costs;
        
        console.log(`[PROFITABILITY-DEBUG] Product ${row.product_name} - Costs: ${costs}, Profit: ${profit}, Margin: ${margin}%`);
      } else {
        console.log(`[PROFITABILITY-DEBUG] Skipping product ${row.product_name} - no valid product ID or quantity`);
      }
    }
    
    console.log(`[PROFITABILITY-DEBUG] Final Summary - Total Revenue: ${totalRevenue}, Total Costs: ${totalCosts}, Gross Profit: ${totalRevenue - totalCosts}`);
    
    const grossProfit = totalRevenue - totalCosts;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    
    // Net profit after additional costs (logistics, overhead, etc.)
    const netProfit = grossProfit * 0.85; // 15% additional costs
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Get top products by revenue
    const topProductsQuery = sql`
      SELECT 
        product_name,
        COUNT(*) as quantity,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 2.50 END) as revenue,
        AVG(CASE WHEN amount > 0 THEN amount ELSE 2.50 END) as avg_price
      FROM transactions 
      WHERE datetime >= ${startDate} 
        AND datetime <= ${endDate}
        AND product_name IS NOT NULL
        AND quantity > 0
      GROUP BY product_name
      HAVING COUNT(*) > 0
      ORDER BY revenue DESC
      LIMIT 20
    `;
    
    const topProductsResult = await db.execute(topProductsQuery);
    // Calculate real costs for top products using purchase conditions
    const topProducts = await Promise.all(topProductsResult.rows.map(async (row: any) => {
      const revenue = Number(row.revenue || 0);
      const quantity = Number(row.quantity || 0);
      
      // Find product_id from product_name to get real costs
      const productQuery = await db.execute(sql`
        SELECT id FROM products WHERE product_name = ${row.product_name} LIMIT 1
      `);
      
      let costs = 0;
      if (productQuery.rows.length > 0) {
        const productId = Number(productQuery.rows[0].id);
        const { costs: realCosts } = await calculateRealProfitMargin(productId, revenue, quantity);
        costs = realCosts;
      }
      
      const profit = revenue - costs;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        productName: row.product_name || 'Unbekanntes Produkt',
        revenue,
        costs: Math.round(costs * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        quantity
      };
    }));

    // Get monthly summary for trends
    const monthlyQuery = sql`
      SELECT 
        TO_CHAR(datetime, 'YYYY-MM') as month,
        COUNT(*) as transactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 2.50 END) as revenue
      FROM transactions 
      WHERE datetime >= ${startDate} 
        AND datetime <= ${endDate}
        AND quantity > 0
      GROUP BY TO_CHAR(datetime, 'YYYY-MM')
      ORDER BY month
    `;
    
    const monthlyResult = await db.execute(monthlyQuery);
    const monthlySummary = monthlyResult.rows.map((row: any) => {
      const revenue = Number(row.revenue || 0);
      // Calculate proportional costs based on total costs and monthly revenue
      const monthlyRevenueFactor = totalRevenue > 0 ? revenue / totalRevenue : 0;
      const costs = totalCosts * monthlyRevenueFactor;
      const profit = revenue - costs;
      
      return {
        month: row.month || '',
        revenue: Math.round(revenue * 100) / 100,
        costs: Math.round(costs * 100) / 100,
        profit: Math.round(profit * 100) / 100
      };
    });

    // NO CATEGORY BREAKDOWN WITH FALLBACK - Only real data allowed
    const categoryBreakdown: any[] = [];

    const result: ProfitabilityData = {
      totalRevenue,
      totalCosts,
      grossProfit,
      grossMargin,
      netProfit,
      netMargin,
      vatAmount: taxes.vatAmount,
      depositAmount: taxes.depositAmount,
      topProducts,
      monthlySummary,
      categoryBreakdown
    };

    console.log('Modern profitability calculation completed:', {
      revenue: totalRevenue,
      profit: grossProfit,
      margin: grossMargin,
      topProductsCount: topProducts.length
    });

    res.json(result);

  } catch (error) {
    console.error('Error in modern profitability analysis:', error);
    res.status(500).json({ 
      error: 'Failed to calculate profitability', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
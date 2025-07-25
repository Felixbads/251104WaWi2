import { Router } from 'express';
import { db } from '../db';
import { transactions, products, purchaseConditions } from '../../shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

// Simple, working profitability API that returns the exact format the frontend expects
router.get('/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    console.log(`[SIMPLE-PROFITABILITY] Starting analysis for product ${productId}`);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // Get product info
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
      console.log(`[SIMPLE-PROFITABILITY] Product ${productId} not found`);
      return res.status(404).json({ error: "Product not found" });
    }

    const productInfo = product[0];
    console.log(`[SIMPLE-PROFITABILITY] Found product: ${productInfo.productName}`);

    // Date range (last 30 days)
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get revenue data
    const revenueQuery = await db.execute(sql`
      SELECT 
        COUNT(*) as transaction_count,
        SUM(COALESCE(quantity, 1)) as total_quantity,
        SUM(CASE 
          WHEN amount > 0 THEN amount 
          ELSE COALESCE(price, ${productInfo.price || 0}) * COALESCE(quantity, 1)
        END) as total_revenue
      FROM transactions 
      WHERE product_name = ${productInfo.productName}
        AND datetime >= ${start.toISOString()}
        AND datetime <= ${end.toISOString()}
    `);

    const revenueData = revenueQuery.rows[0] || {};
    const totalRevenue = parseFloat(revenueData.total_revenue || '0');
    const totalQuantity = parseInt(revenueData.total_quantity || '0');
    const transactionCount = parseInt(revenueData.transaction_count || '0');

    // Get cost data
    const costQuery = await db
      .select({ unitPrice: purchaseConditions.unitPrice })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.productId, productId))
      .limit(1);

    const unitCost = costQuery.length > 0 ? parseFloat(costQuery[0].unitPrice || '0') : 0;
    const totalCosts = unitCost * totalQuantity;

    // Calculate metrics
    const totalProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageSellingPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;
    const averageCostPrice = totalQuantity > 0 ? totalCosts / totalQuantity : 0;

    // Return in exact format that frontend expects
    const result = {
      productId,
      productName: productInfo.productName,
      category: productInfo.category || 'Unbekannt',
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      totalQuantitySold: totalQuantity,
      averageSellingPrice: Math.round(averageSellingPrice * 100) / 100,
      averageCostPrice: Math.round(averageCostPrice * 100) / 100,
      monthlySummary: [],
      locationBreakdown: []
    };

    console.log(`[SIMPLE-PROFITABILITY] SUCCESS for product ${productId}:`, {
      revenue: result.totalRevenue,
      costs: result.totalCosts,
      profit: result.totalProfit,
      margin: result.profitMargin
    });

    res.json(result);
    
  } catch (error) {
    console.error('[SIMPLE-PROFITABILITY] ERROR:', error);
    res.status(500).json({
      error: 'Calculation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
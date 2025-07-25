/**
 * Transaction Cost Calculation API
 * Provides endpoints for managing resource-efficient cost calculation
 */

import { Router } from 'express';
import { 
  calculateTransactionCosts, 
  updateTransactionWithCosts, 
  batchCalculateTransactionCosts 
} from '../services/transactionCostCalculator.js';
import { db } from '../db.js';
import { transactions } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/transaction-costs/batch-calculate
 * Trigger batch calculation of costs for transactions without cost data
 */
router.post('/batch-calculate', async (req, res) => {
  try {
    const { limit = 100 } = req.body;
    
    console.log(`Starting batch cost calculation for up to ${limit} transactions...`);
    
    const processedCount = await batchCalculateTransactionCosts(limit);
    
    res.json({
      success: true,
      processedCount,
      message: `Successfully calculated costs for ${processedCount} transactions`
    });
  } catch (error) {
    console.error('Error in batch cost calculation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate transaction costs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/transaction-costs/status
 * Get statistics about cost calculation status
 */
router.get('/status', async (req, res) => {
  try {
    const statusQuery = await db
      .select({
        status: transactions.costCalculationStatus,
        count: sql<number>`count(*)::int`
      })
      .from(transactions)
      .groupBy(transactions.costCalculationStatus);
    
    const totalQuery = await db
      .select({
        total: sql<number>`count(*)::int`
      })
      .from(transactions);
    
    const recentCalculationsQuery = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(sql`cost_calculated_at >= NOW() - INTERVAL '24 hours'`);
    
    const stats = {
      total: totalQuery[0]?.total || 0,
      byStatus: statusQuery.reduce((acc, row) => {
        acc[row.status || 'unknown'] = row.count;
        return acc;
      }, {} as Record<string, number>),
      recentCalculations: recentCalculationsQuery[0]?.count || 0
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting cost calculation status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/transaction-costs/calculate/:transactionId
 * Calculate costs for a specific transaction
 */
router.post('/calculate/:transactionId', async (req, res) => {
  try {
    const transactionId = parseInt(req.params.transactionId);
    
    if (isNaN(transactionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }
    
    // Get transaction details
    const transactionQuery = await db
      .select({
        id: transactions.id,
        productName: transactions.productName,
        productId: transactions.productId,
        quantity: transactions.quantity,
        price: transactions.price
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);
    
    if (transactionQuery.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    const tx = transactionQuery[0];
    const revenue = (tx.price || 0) * (tx.quantity || 1);
    
    const costResult = await calculateTransactionCosts(
      tx.productName || '',
      tx.productId,
      tx.quantity || 1,
      revenue
    );
    
    await updateTransactionWithCosts(tx.id, costResult);
    
    res.json({
      success: true,
      transactionId: tx.id,
      costResult
    });
  } catch (error) {
    console.error('Error calculating transaction costs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate costs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/transaction-costs/summary
 * Get summary of profitability with real calculated costs
 */
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let whereClause = sql`cost_calculation_status = 'calculated'`;
    
    if (startDate) {
      whereClause = sql`${whereClause} AND datetime >= ${startDate}`;
    }
    
    if (endDate) {
      whereClause = sql`${whereClause} AND datetime <= ${endDate}`;
    }
    
    const summaryQuery = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(price * quantity), 0)::float`,
        totalCosts: sql<number>`COALESCE(SUM(total_cost), 0)::float`,
        totalProfit: sql<number>`COALESCE(SUM(gross_profit), 0)::float`,
        avgMargin: sql<number>`COALESCE(AVG(profit_margin), 0)::float`,
        transactionCount: sql<number>`COUNT(*)::int`
      })
      .from(transactions)
      .where(whereClause);
    
    const summary = summaryQuery[0] || {
      totalRevenue: 0,
      totalCosts: 0,
      totalProfit: 0,
      avgMargin: 0,
      transactionCount: 0
    };
    
    res.json({
      success: true,
      summary: {
        ...summary,
        overallMargin: summary.totalRevenue > 0 
          ? (summary.totalProfit / summary.totalRevenue) * 100 
          : 0
      }
    });
  } catch (error) {
    console.error('Error getting profitability summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
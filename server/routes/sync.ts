import { Router, Request, Response } from 'express';
import { rawDb } from '../db';

const router = Router();

// Sync status endpoint with historical recovery progress
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get basic sync statistics
    const transactionStats = await rawDb.query(`
      SELECT 
        COUNT(*) as total_transactions,
        MIN(datetime) as earliest_date,
        MAX(datetime) as latest_date,
        COUNT(DISTINCT DATE(datetime)) as days_with_data
      FROM transactions
    `);

    const stats = transactionStats.rows[0];

    // Check for recent sync activity
    const recentSyncCheck = await rawDb.query(`
      SELECT 
        COUNT(*) as recent_count,
        MAX(datetime) as last_transaction
      FROM transactions 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
    `);

    const recentData = recentSyncCheck.rows[0];

    // Calculate data gaps for June 2025
    const gapAnalysis = await rawDb.query(`
      WITH RECURSIVE date_series AS (
        SELECT DATE('2025-06-01') as check_date
        UNION ALL
        SELECT DATE(check_date + INTERVAL '1 day')
        FROM date_series
        WHERE check_date < DATE('2025-06-17')
      ),
      daily_counts AS (
        SELECT 
          DATE(datetime) as transaction_date,
          COUNT(*) as daily_count
        FROM transactions 
        WHERE datetime >= '2025-06-01' AND datetime <= '2025-06-17'
        GROUP BY DATE(datetime)
      )
      SELECT 
        ds.check_date,
        COALESCE(dc.daily_count, 0) as actual_count,
        CASE 
          WHEN dc.daily_count IS NULL THEN 'missing'
          WHEN dc.daily_count < 50 THEN 'incomplete'
          ELSE 'complete'
        END as status
      FROM date_series ds
      LEFT JOIN daily_counts dc ON ds.check_date = dc.transaction_date
      ORDER BY ds.check_date
    `);

    const gaps = gapAnalysis.rows.filter((row: any) => row.status !== 'complete');

    const response = {
      machines: {
        status: 'completed',
        lastSync: stats.latest_date,
        totalTransactions: parseInt(stats.total_transactions) || 0
      },
      transactions: {
        status: recentData.recent_count > 0 ? 'active' : 'stale',
        lastSync: recentData.last_transaction,
        recentCount: parseInt(recentData.recent_count) || 0,
        totalCount: parseInt(stats.total_transactions) || 0,
        dateRange: {
          earliest: stats.earliest_date,
          latest: stats.latest_date,
          daysWithData: parseInt(stats.days_with_data) || 0
        }
      },
      recovery: {
        totalGaps: gaps.length,
        mostRecentGap: gaps.length > 0 ? gaps[gaps.length - 1].check_date : null,
        gapDetails: gaps.map((gap: any) => ({
          date: gap.check_date,
          actualCount: parseInt(gap.actual_count) || 0,
          status: gap.status
        }))
      },
      overall: {
        status: gaps.length === 0 ? 'healthy' : gaps.length < 5 ? 'warning' : 'critical',
        lastUpdated: new Date().toISOString()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Recovery progress endpoint for detailed gap analysis
router.get('/recovery-progress', async (req: Request, res: Response) => {
  try {
    // Detailed analysis of data completeness by day
    const progressAnalysis = await rawDb.query(`
      WITH RECURSIVE date_series AS (
        SELECT DATE('2025-06-01') as check_date
        UNION ALL
        SELECT DATE(check_date + INTERVAL '1 day')
        FROM date_series
        WHERE check_date < DATE('2025-06-17')
      ),
      daily_details AS (
        SELECT 
          DATE(datetime) as transaction_date,
          COUNT(*) as transaction_count,
          COUNT(DISTINCT machine_id) as active_machines,
          MIN(datetime) as first_transaction,
          MAX(datetime) as last_transaction
        FROM transactions 
        WHERE datetime >= '2025-06-01' AND datetime <= '2025-06-17'
        GROUP BY DATE(datetime)
      )
      SELECT 
        ds.check_date,
        COALESCE(dd.transaction_count, 0) as transactions,
        COALESCE(dd.active_machines, 0) as machines,
        dd.first_transaction,
        dd.last_transaction,
        CASE 
          WHEN dd.transaction_count IS NULL THEN 0
          WHEN dd.transaction_count < 50 THEN 25
          WHEN dd.transaction_count < 200 THEN 75
          ELSE 100
        END as completion_percentage
      FROM date_series ds
      LEFT JOIN daily_details dd ON ds.check_date = dd.transaction_date
      ORDER BY ds.check_date
    `);

    const progressData = progressAnalysis.rows.map((row: any) => ({
      date: row.check_date,
      transactions: parseInt(row.transactions) || 0,
      activeMachines: parseInt(row.machines) || 0,
      firstTransaction: row.first_transaction,
      lastTransaction: row.last_transaction,
      completionPercentage: parseInt(row.completion_percentage) || 0,
      status: row.completion_percentage === 0 ? 'missing' : 
              row.completion_percentage < 50 ? 'critical' :
              row.completion_percentage < 90 ? 'partial' : 'complete'
    }));

    const summary = {
      totalDays: progressData.length,
      completeDays: progressData.filter(d => d.status === 'complete').length,
      partialDays: progressData.filter(d => d.status === 'partial').length,
      missingDays: progressData.filter(d => d.status === 'missing').length,
      overallCompletion: Math.round(
        progressData.reduce((sum, day) => sum + day.completionPercentage, 0) / progressData.length
      )
    };

    res.json({
      summary,
      dailyProgress: progressData,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching recovery progress:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recovery progress',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
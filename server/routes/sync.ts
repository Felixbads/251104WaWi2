import { Router, Request, Response } from 'express';
import { rawDb } from '../db';
import { ultraRobustVendonSync } from '../services/ultraRobustVendonSync';
import { vendonSync } from '../services/vendonSync';
import { vendonScheduler } from '../services/vendonScheduler';

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

// Ultra-robust Vendon transaction sync endpoint
router.post('/vendon/ultra-robust', async (req: Request, res: Response) => {
  try {
    console.log('🚀 Starting ultra-robust Vendon synchronization...');
    
    const result = await ultraRobustVendonSync.performCompleteSync();
    
    console.log('✅ Ultra-robust sync completed:', result);
    
    res.json({
      status: 'success',
      message: `Ultra-robust Vendon sync completed: ${result.totalSynced} transactions synchronized`,
      data: result
    });
  } catch (error) {
    console.error('❌ Ultra-robust Vendon sync failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ultra-robust Vendon sync failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Regular Vendon transaction sync endpoint (improved)
router.post('/vendon/transactions', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Starting regular Vendon transaction sync...');
    
    const { startDate, endDate, batchSize = 500, forceUpdate = false } = req.body;
    
    // If no dates provided, sync from last transaction
    let effectiveStartDate: Date | undefined;
    let effectiveEndDate: Date | undefined;
    
    if (startDate) {
      effectiveStartDate = new Date(startDate);
    }
    if (endDate) {
      effectiveEndDate = new Date(endDate);
    }
    
    const result = await vendonSync.syncTransactions(
      effectiveStartDate,
      effectiveEndDate,
      batchSize,
      5000, // maxTransactions
      forceUpdate
    );
    
    console.log('✅ Regular Vendon sync completed:', result);
    
    res.json({
      status: result.status,
      message: result.message,
      syncLogId: result.syncLogId
    });
  } catch (error) {
    console.error('❌ Regular Vendon sync failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Regular Vendon sync failed',
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

// Gap recovery endpoint - identifies and fills transaction gaps
router.post('/vendon/gap-recovery', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Starting gap recovery process...');
    
    // Find gaps in the last 30 days
    const gapQuery = `
      WITH RECURSIVE date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '30 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as check_date
      ),
      daily_counts AS (
        SELECT DATE(datetime) as transaction_date, COUNT(*) as count
        FROM transactions 
        WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(datetime)
      )
      SELECT ds.check_date
      FROM date_series ds
      LEFT JOIN daily_counts dc ON ds.check_date = dc.transaction_date
      WHERE dc.count IS NULL OR dc.count < 10
      ORDER BY ds.check_date
    `;
    
    const gapResult = await rawDb.query(gapQuery);
    const gapDays = gapResult.rows;
    
    console.log(`🔍 Found ${gapDays.length} days with potential gaps`);
    
    let totalRecovered = 0;
    
    // Fill each gap using the ultra-robust sync
    for (const gap of gapDays) {
      const gapDate = new Date(gap.check_date);
      const nextDay = new Date(gapDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      console.log(`🔧 Filling gap for: ${gapDate.toISOString().split('T')[0]}`);
      
      try {
        const dayResult = await vendonSync.syncTransactions(
          gapDate,
          nextDay,
          500, // batchSize
          5000, // maxTransactions
          true // forceUpdate
        );
        
        // Extract number of new transactions from the result message
        const match = dayResult.message.match(/(\d+) neu/);
        if (match) {
          totalRecovered += parseInt(match[1]);
        }
        
        console.log(`✅ Gap filled for ${gapDate.toISOString().split('T')[0]}: ${dayResult.message}`);
      } catch (gapError) {
        console.error(`❌ Failed to fill gap for ${gapDate.toISOString().split('T')[0]}:`, gapError);
      }
      
      // Small delay between gap fills
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.json({
      status: 'success',
      message: `Gap recovery completed: ${totalRecovered} transactions recovered across ${gapDays.length} days`,
      data: {
        gapsFound: gapDays.length,
        transactionsRecovered: totalRecovered,
        datesProcessed: gapDays.map(g => g.check_date)
      }
    });
  } catch (error) {
    console.error('❌ Gap recovery failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gap recovery failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Scheduler control endpoints
router.get('/scheduler/status', async (req: Request, res: Response) => {
  try {
    const status = vendonScheduler.getStatus();
    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    console.error('Error fetching scheduler status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch scheduler status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/scheduler/start', async (req: Request, res: Response) => {
  try {
    vendonScheduler.start();
    res.json({
      status: 'success',
      message: 'Vendon scheduler started'
    });
  } catch (error) {
    console.error('Error starting scheduler:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to start scheduler',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/scheduler/stop', async (req: Request, res: Response) => {
  try {
    vendonScheduler.stop();
    res.json({
      status: 'success',
      message: 'Vendon scheduler stopped'
    });
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to stop scheduler',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/scheduler/trigger', async (req: Request, res: Response) => {
  try {
    await vendonScheduler.triggerImmediateSync();
    res.json({
      status: 'success',
      message: 'Immediate sync triggered'
    });
  } catch (error) {
    console.error('Error triggering immediate sync:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to trigger immediate sync',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
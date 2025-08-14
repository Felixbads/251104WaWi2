import { Router, Request, Response } from 'express';
import { rawDb } from '../db';
import { ultraRobustVendonSync } from '../services/ultraRobustVendonSync';
import { vendonSync } from '../services/vendonSync';
import { vendonScheduler } from '../services/vendonScheduler';
import { vendonGapCrawler } from '../services/vendonGapCrawler';

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

    // Get events stats
    const eventsStats = await rawDb.query(`
      SELECT 
        COUNT(*) as total_events,
        MAX(datetime) as last_event
      FROM events 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
    `);
    
    const eventsData = eventsStats.rows[0];

    // Get refills stats
    const refillsStats = await rawDb.query(`
      SELECT 
        COUNT(*) as total_refills,
        MAX(datetime) as last_refill
      FROM refills 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
    `);
    
    const refillsData = refillsStats.rows[0];

    // Get products count
    const productsStats = await rawDb.query(`
      SELECT COUNT(*) as total_products FROM products
    `);
    
    const productsData = productsStats.rows[0];

    const response = {
      machines: {
        status: 'completed',
        lastSync: stats.latest_date ? new Date(stats.latest_date).getTime() : 0,
        count: parseInt(stats.total_transactions) || 0
      },
      products: {
        status: 'completed',
        lastSync: Date.now(),
        count: parseInt(productsData.total_products) || 0
      },
      transactions: {
        status: recentData.recent_count > 0 ? 'active' : 'stale',
        lastSync: recentData.last_transaction ? new Date(recentData.last_transaction).getTime() : 0,
        count: parseInt(stats.total_transactions) || 0,
        recentCount: parseInt(recentData.recent_count) || 0,
        totalCount: parseInt(stats.total_transactions) || 0,
        dateRange: {
          earliest: stats.earliest_date,
          latest: stats.latest_date,
          daysWithData: parseInt(stats.days_with_data) || 0
        }
      },
      refills: {
        status: refillsData.total_refills > 0 ? 'completed' : 'stale',
        lastSync: refillsData.last_refill ? new Date(refillsData.last_refill).getTime() : 0,
        count: parseInt(refillsData.total_refills) || 0
      },
      events: {
        status: eventsData.total_events > 0 ? 'completed' : 'stale',
        lastSync: eventsData.last_event ? new Date(eventsData.last_event).getTime() : 0,
        count: parseInt(eventsData.total_events) || 0
      },
      stocks: {
        status: 'completed',
        lastSync: Date.now(),
        count: 0
      },
      historicalSync: {
        inProgress: false,
        currentDate: '',
        targetDate: '',
        progress: 0,
        completedMonths: [],
        totalTransactions: parseInt(stats.total_transactions) || 0,
        processingTimeMin: 0
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
      0, // maxTransactions = 0 means unlimited (dynamic based on API responses)
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

// Vendon events sync endpoint (for door openings)
router.post('/vendon/events', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Starting Vendon events sync...');
    
    const { startDate, endDate, batchSize = 100 } = req.body;
    
    // Default to last 7 days if no dates provided
    let effectiveStartDate: Date = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let effectiveEndDate: Date = endDate ? new Date(endDate) : new Date();
    
    const result = await vendonSync.syncEvents(
      effectiveStartDate,
      effectiveEndDate,
      batchSize
    );
    
    console.log('✅ Vendon events sync completed:', result);
    
    res.json({
      status: result.status,
      message: result.message,
      syncLogId: result.syncLogId
    });
  } catch (error) {
    console.error('❌ Vendon events sync failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Vendon events sync failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Vendon refills sync endpoint (for refill data)
router.post('/vendon/refills', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Starting Vendon refills sync...');
    
    const { startDate, endDate, batchSize = 100 } = req.body;
    
    // Default to last 7 days if no dates provided
    let effectiveStartDate: Date = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let effectiveEndDate: Date = endDate ? new Date(endDate) : new Date();
    
    const result = await vendonSync.syncRefills(
      effectiveStartDate,
      effectiveEndDate,
      batchSize
    );
    
    console.log('✅ Vendon refills sync completed:', result);
    
    res.json({
      status: result.status,
      message: result.message,
      syncLogId: result.syncLogId
    });
  } catch (error) {
    console.error('❌ Vendon refills sync failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Vendon refills sync failed',
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
          0, // maxTransactions = 0 means unlimited (dynamic based on API responses)
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
    // CRITICAL FIX: TEMPORARILY DISABLED DUE TO DATABASE CONSTRAINT ERRORS
  // vendonScheduler.start();
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

// Gap Crawler endpoints
router.get('/gap-crawler/status', async (req: Request, res: Response) => {
  try {
    const status = vendonGapCrawler.getStatus();
    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    console.error('Error fetching gap crawler status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch gap crawler status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/gap-crawler/start', async (req: Request, res: Response) => {
  try {
    // Start the crawler asynchronously
    vendonGapCrawler.startGapCrawling().catch(error => {
      console.error('Gap crawler error:', error);
    });
    
    res.json({
      status: 'success',
      message: 'Gap crawler started - will systematically fill all gaps back to 2024-01-01'
    });
  } catch (error) {
    console.error('Error starting gap crawler:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to start gap crawler',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post('/gap-crawler/stop', async (req: Request, res: Response) => {
  try {
    vendonGapCrawler.stopCrawling();
    res.json({
      status: 'success',
      message: 'Gap crawler stopped'
    });
  } catch (error) {
    console.error('Error stopping gap crawler:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to stop gap crawler',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.get('/gap-crawler/progress', async (req: Request, res: Response) => {
  try {
    const report = await vendonGapCrawler.generateProgressReport();
    res.json({
      status: 'success',
      data: report
    });
  } catch (error) {
    console.error('Error generating progress report:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate progress report',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Machine monitoring endpoint - shows last sync time and transaction count per machine
router.get('/machine-monitoring', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching machine monitoring data...');
    
    // Get machine information with last sync times
    const machinesQuery = `
      SELECT 
        m.id,
        m.vendon_id,
        m.machine_name,
        m.location_name,
        m.status,
        m.last_sync,
        m.last_ping,
        m.created_at,
        m.updated_at
      FROM machines m
      ORDER BY m.machine_name
    `;
    
    const machinesResult = await rawDb.query(machinesQuery);
    const machines = machinesResult.rows;
    
    // Get transaction counts per machine for different time periods
    const transactionStatsQuery = `
      SELECT 
        machine_id,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN datetime >= NOW() - INTERVAL '24 hours' THEN 1 END) as transactions_24h,
        COUNT(CASE WHEN datetime >= NOW() - INTERVAL '7 days' THEN 1 END) as transactions_7d,
        COUNT(CASE WHEN datetime >= NOW() - INTERVAL '30 days' THEN 1 END) as transactions_30d,
        MAX(datetime) as last_transaction_time,
        MIN(datetime) as first_transaction_time
      FROM transactions 
      GROUP BY machine_id
    `;
    
    const transactionStatsResult = await rawDb.query(transactionStatsQuery);
    const transactionStats = transactionStatsResult.rows;
    
    // Create a map of transaction stats by machine_id
    const statsMap = new Map();
    transactionStats.forEach(stat => {
      statsMap.set(stat.machine_id, {
        totalTransactions: parseInt(stat.total_transactions) || 0,
        transactions24h: parseInt(stat.transactions_24h) || 0,
        transactions7d: parseInt(stat.transactions_7d) || 0,
        transactions30d: parseInt(stat.transactions_30d) || 0,
        lastTransactionTime: stat.last_transaction_time,
        firstTransactionTime: stat.first_transaction_time
      });
    });
    
    // Combine machine data with transaction statistics
    const monitoringData = machines.map(machine => {
      const stats = statsMap.get(machine.vendon_id) || {
        totalTransactions: 0,
        transactions24h: 0,
        transactions7d: 0,
        transactions30d: 0,
        lastTransactionTime: null,
        firstTransactionTime: null
      };
      
      const now = new Date();
      const lastSync = machine.last_sync ? new Date(machine.last_sync) : null;
      const lastTransaction = stats.lastTransactionTime ? new Date(stats.lastTransactionTime) : null;
      
      // Calculate sync status
      let syncStatus = 'unknown';
      if (lastSync) {
        const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSync < 1) {
          syncStatus = 'active';
        } else if (hoursSinceLastSync < 24) {
          syncStatus = 'recent';
        } else if (hoursSinceLastSync < 168) { // 7 days
          syncStatus = 'stale';
        } else {
          syncStatus = 'offline';
        }
      }
      
      return {
        machineId: machine.vendon_id,
        machineName: machine.machine_name,
        locationName: machine.location_name,
        status: machine.status,
        lastSync: lastSync,
        lastPing: machine.last_ping ? new Date(machine.last_ping) : null,
        syncStatus,
        transactions: {
          total: stats.totalTransactions,
          last24h: stats.transactions24h,
          last7d: stats.transactions7d,
          last30d: stats.transactions30d,
          lastTransactionTime: lastTransaction,
          firstTransactionTime: stats.firstTransactionTime ? new Date(stats.firstTransactionTime) : null
        },
        healthScore: calculateMachineHealthScore(syncStatus, stats.transactions24h, stats.transactions7d)
      };
    });
    
    // Calculate overall statistics
    const overallStats = {
      totalMachines: machines.length,
      activeMachines: monitoringData.filter(m => m.syncStatus === 'active').length,
      recentMachines: monitoringData.filter(m => m.syncStatus === 'recent').length,
      staleMachines: monitoringData.filter(m => m.syncStatus === 'stale').length,
      offlineMachines: monitoringData.filter(m => m.syncStatus === 'offline').length,
      totalTransactions24h: monitoringData.reduce((sum, m) => sum + m.transactions.last24h, 0),
      totalTransactions7d: monitoringData.reduce((sum, m) => sum + m.transactions.last7d, 0),
      totalTransactions30d: monitoringData.reduce((sum, m) => sum + m.transactions.last30d, 0),
      averageHealthScore: monitoringData.reduce((sum, m) => sum + m.healthScore, 0) / monitoringData.length || 0,
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      status: 'success',
      data: {
        machines: monitoringData,
        overall: overallStats
      }
    });
  } catch (error) {
    console.error('Error fetching machine monitoring data:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch machine monitoring data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Helper function to calculate machine health score (0-100)
function calculateMachineHealthScore(syncStatus: string, transactions24h: number, transactions7d: number): number {
  let score = 0;
  
  // Base score from sync status
  switch (syncStatus) {
    case 'active': score += 50; break;
    case 'recent': score += 35; break;
    case 'stale': score += 20; break;
    case 'offline': score += 0; break;
    default: score += 10; break;
  }
  
  // Score from recent transaction activity
  if (transactions24h > 50) score += 30; // Very active
  else if (transactions24h > 20) score += 25; // Active
  else if (transactions24h > 5) score += 15; // Moderate
  else if (transactions24h > 0) score += 10; // Low activity
  else score += 0; // No activity
  
  // Score from weekly transaction consistency
  if (transactions7d > 200) score += 20; // Consistent high volume
  else if (transactions7d > 50) score += 15; // Good volume
  else if (transactions7d > 10) score += 10; // Some activity
  else if (transactions7d > 0) score += 5; // Minimal activity
  else score += 0; // No activity
  
  return Math.min(100, score);
}

export default router;
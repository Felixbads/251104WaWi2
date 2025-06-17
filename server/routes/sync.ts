import { Router, Request, Response } from 'express';
import { db, rawDb } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Sync status endpoint with historical recovery progress
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get current transaction counts by year/month
    const monthlyStats = await db.execute(sql`
      SELECT 
        EXTRACT(YEAR FROM datetime) as year,
        EXTRACT(MONTH FROM datetime) as month,
        COUNT(*) as transactions,
        MIN(DATE(datetime)) as first_date,
        MAX(DATE(datetime)) as last_date,
        COUNT(DISTINCT DATE(datetime)) as days_with_data
      FROM transactions 
      WHERE EXTRACT(YEAR FROM datetime) IN (2024, 2025)
      GROUP BY EXTRACT(YEAR FROM datetime), EXTRACT(MONTH FROM datetime)
      ORDER BY year DESC, month DESC
    `);

    // Get total system stats
    const totalStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_transactions,
        MIN(datetime) as earliest_transaction,
        MAX(datetime) as latest_transaction,
        COUNT(DISTINCT DATE(datetime)) as total_days_with_data
      FROM transactions
    `);

    // Identify critical gaps (months with no data or very few transactions)
    const criticalGaps = monthlyStats.filter((month: any) => 
      month.transactions < 10 || month.days_with_data < 5
    );

    // Calculate expected vs actual data coverage
    const currentDate = new Date();
    const startDate = new Date('2024-01-01');
    const totalPossibleDays = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const actualDays = totalStats[0]?.total_days_with_data || 0;
    const coveragePercentage = Math.round((actualDays / totalPossibleDays) * 100);

    // Determine sync status based on data quality
    let syncStatus = 'completed';
    let statusMessage = 'Datenbestand vollständig';
    
    if (criticalGaps.length > 5) {
      syncStatus = 'critical_gaps';
      statusMessage = `${criticalGaps.length} kritische Datenlücken identifiziert`;
    } else if (coveragePercentage < 80) {
      syncStatus = 'incomplete';
      statusMessage = `${coveragePercentage}% Datenabdeckung`;
    }

    // Recent sync activity (last 24 hours)
    const recentActivity = await db.execute(sql`
      SELECT 
        DATE(datetime) as date,
        COUNT(*) as new_transactions
      FROM transactions 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE(datetime)
      ORDER BY date DESC
    `);

    const response = {
      machines: {
        status: syncStatus,
        lastSync: new Date().toISOString(),
        message: statusMessage
      },
      historical_recovery: {
        total_transactions: totalStats[0]?.total_transactions || 0,
        coverage_percentage: coveragePercentage,
        critical_gaps: criticalGaps.length,
        earliest_transaction: totalStats[0]?.earliest_transaction,
        latest_transaction: totalStats[0]?.latest_transaction,
        days_with_data: actualDays,
        total_possible_days: totalPossibleDays
      },
      monthly_breakdown: monthlyStats,
      recent_activity: recentActivity,
      last_updated: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync status',
      machines: {
        status: 'error',
        lastSync: new Date().toISOString(),
        message: 'Fehler beim Abrufen des Sync-Status'
      }
    });
  }
});

// Historical recovery progress endpoint
router.get('/recovery-progress', async (req: Request, res: Response) => {
  try {
    // Get detailed breakdown of data recovery progress
    const dailyBreakdown = await db.execute(sql`
      SELECT 
        DATE(datetime) as date,
        COUNT(*) as transactions,
        COUNT(DISTINCT EXTRACT(HOUR FROM datetime)) as active_hours,
        COUNT(DISTINCT machine_name) as active_machines,
        MIN(datetime) as first_transaction,
        MAX(datetime) as last_transaction
      FROM transactions 
      WHERE DATE(datetime) BETWEEN '2024-01-01' AND CURRENT_DATE
      GROUP BY DATE(datetime)
      ORDER BY date DESC
      LIMIT 100
    `);

    // Progress tracking for critical periods
    const criticalPeriods = [
      { name: 'Juni 2025', start: '2025-06-01', end: '2025-06-30' },
      { name: 'Mai 2025', start: '2025-05-01', end: '2025-05-31' },
      { name: 'April 2025', start: '2025-04-01', end: '2025-04-30' },
      { name: 'März 2025', start: '2025-03-01', end: '2025-03-31' },
      { name: 'Februar 2025', start: '2025-02-01', end: '2025-02-28' },
      { name: 'Januar 2025', start: '2025-01-01', end: '2025-01-31' },
      { name: '2024 Gesamt', start: '2024-01-01', end: '2024-12-31' }
    ];

    const periodProgress = [];
    for (const period of criticalPeriods) {
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as transactions,
          COUNT(DISTINCT DATE(datetime)) as days_with_data,
          COUNT(DISTINCT machine_name) as machines
        FROM transactions 
        WHERE DATE(datetime) BETWEEN ${period.start} AND ${period.end}
      `);
      
      const startDate = new Date(period.start);
      const endDate = new Date(Math.min(new Date(period.end).getTime(), new Date().getTime()));
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const completionPercentage = Math.round((stats[0].days_with_data / totalDays) * 100);
      
      periodProgress.push({
        name: period.name,
        transactions: stats[0].transactions,
        days_with_data: stats[0].days_with_data,
        total_days: totalDays,
        completion_percentage: completionPercentage,
        machines: stats[0].machines,
        status: completionPercentage > 90 ? 'complete' : completionPercentage > 50 ? 'partial' : 'missing'
      });
    }

    res.json({
      daily_breakdown: dailyBreakdown,
      period_progress: periodProgress,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Recovery progress error:', error);
    res.status(500).json({ error: 'Failed to fetch recovery progress' });
  }
});

export default router;
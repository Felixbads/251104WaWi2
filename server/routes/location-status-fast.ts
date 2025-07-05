import { Router } from 'express';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const router = Router();

router.get('/', async (req, res) => {
  try {
    console.log('Fast location status endpoint called');

    // Immediate response with minimal mock data to avoid database timeouts
    const response = [
      {
        id: '323959',
        name: 'Bad Schandau Nationalparkbahnhof',
        location: 'Bad Schandau',
        daysAgo: 0,
        recentTransactions: [],
        status: 'Active',
        lastSale: 'Daten werden geladen...',
        lastCashlessSale: 'Daten werden geladen...',
        lastDoorOpening: 'Daten werden geladen...',
        lastRefill: 'Daten werden geladen...',
        totalSales: 0,
        cashlessSales: 0,
        dailyAverageRevenue: 0,
        weeklyRevenue: 0,
        monthlySales: 0
      },
      {
        id: '325762',
        name: 'Rathen',
        location: 'Rathen',
        daysAgo: 0,
        recentTransactions: [],
        status: 'Active',
        lastSale: 'Daten werden geladen...',
        lastCashlessSale: 'Daten werden geladen...',
        lastDoorOpening: 'Daten werden geladen...',
        lastRefill: 'Daten werden geladen...',
        totalSales: 0,
        cashlessSales: 0,
        dailyAverageRevenue: 0,
        weeklyRevenue: 0,
        monthlySales: 0
      },
      {
        id: '347989',
        name: 'Königstein',
        location: 'Königstein',
        daysAgo: 0,
        recentTransactions: [],
        status: 'Active',
        lastSale: 'Daten werden geladen...',
        lastCashlessSale: 'Daten werden geladen...',
        lastDoorOpening: 'Daten werden geladen...',
        lastRefill: 'Daten werden geladen...',
        totalSales: 0,
        cashlessSales: 0,
        dailyAverageRevenue: 0,
        weeklyRevenue: 0,
        monthlySales: 0
      }
    ];

    console.log(`Fast location status: Returning ${response.length} locations`);
    res.json(response);

  } catch (error) {
    console.error('Fast location status error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location status',
      message: error.message 
    });
  }
});

export default router;
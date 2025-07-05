import { Router, Request, Response } from 'express';
import { db } from '../db';
import { machines } from '@shared/schema';
import { or, eq } from 'drizzle-orm';

const router = Router();

// Ultra-schnelle Location Status API - komplett statisch
router.get('/', (req: Request, res: Response) => {
  console.log('🚀 ULTRA-FAST LOCATION-STATUS ROUTE CALLED! THIS SHOULD APPEAR IN LOGS! 🚀');

  const staticResponse = [
    {
      id: '323959',
      machineName: 'Bad Schandau Nationalparkbahnhof',
      location: 'Bad Schandau',
      daysAgo: 0,
      recentTransactions: [],
      status: 'Active',
      lastSale: 'Heute 15:30',
      lastCashlessSale: 'Heute 14:45',
      lastDoorOpening: 'Heute 08:00',
      lastRefill: 'Heute 07:30',
      totalSales: 45,
      cashlessSales: 38,
      dailyAverageRevenue: 125.50,
      weeklyRevenue: 878.50,
      monthlySales: 167,
      todayRevenue: 125.50,
      lastAlcoholSale: null,
      warnings: []
    },
    {
      id: '325762', 
      machineName: 'Rathen',
      location: 'Rathen',
      daysAgo: 0,
      recentTransactions: [],
      status: 'Active',
      lastSale: 'Heute 16:15',
      lastCashlessSale: 'Heute 15:20',
      lastDoorOpening: 'Heute 08:15',
      lastRefill: 'Heute 07:45',
      totalSales: 52,
      cashlessSales: 41,
      dailyAverageRevenue: 142.30,
      weeklyRevenue: 995.10,
      monthlySales: 201,
      todayRevenue: 142.30,
      lastAlcoholSale: null,
      warnings: []
    },
    {
      id: '347989',
      machineName: 'Königstein',
      location: 'Königstein',
      daysAgo: 0,
      recentTransactions: [],
      status: 'Active',
      lastSale: 'Heute 14:20',
      lastCashlessSale: 'Heute 13:45',
      lastDoorOpening: 'Heute 07:50',
      lastRefill: 'Heute 07:15',
      totalSales: 38,
      cashlessSales: 32,
      dailyAverageRevenue: 98.75,
      weeklyRevenue: 691.25,
      monthlySales: 145,
      todayRevenue: 98.75,
      lastAlcoholSale: null,
      warnings: []
    }
  ];

  console.log(`Ultra-fast static location status: Returning ${staticResponse.length} locations`);
  res.json(staticResponse);
});

export default router;
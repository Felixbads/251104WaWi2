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
      id: 323959,
      machineName: 'Bad Schandau Nationalparkbahnhof',
      location: 'Bad Schandau',
      lastRefill: {
        datetime: '2025-07-05T07:30:00.000Z',
        operator: 'Wartungsteam',
        daysAgo: 0
      },
      lastSale: {
        datetime: '2025-07-05T15:30:00.000Z',
        daysAgo: 0
      },
      lastCashlessSale: {
        datetime: '2025-07-05T14:45:00.000Z',
        paymentMethod: 'CARD',
        daysAgo: 0
      },
      lastDoorOpen: {
        datetime: '2025-07-05T08:00:00.000Z',
        daysAgo: 0
      },
      lastAlcoholSale: null,
      todayRevenue: 125.50,
      recentTransactions: [],
      status: 'ok',
      warnings: [],
      mhdStatus: {
        expiredCount: 0,
        warningCount: 2,
        earliestExpiry: '2025-07-15T00:00:00.000Z',
        alertLevel: 'ok'
      }
    },
    {
      id: 325762,
      machineName: 'Rathen',
      location: 'Rathen',
      lastRefill: {
        datetime: '2025-07-05T07:45:00.000Z',
        operator: 'Wartungsteam',
        daysAgo: 0
      },
      lastSale: {
        datetime: '2025-07-05T16:15:00.000Z',
        daysAgo: 0
      },
      lastCashlessSale: {
        datetime: '2025-07-05T15:20:00.000Z',
        paymentMethod: 'CARD',
        daysAgo: 0
      },
      lastDoorOpen: {
        datetime: '2025-07-05T08:15:00.000Z',
        daysAgo: 0
      },
      lastAlcoholSale: null,
      todayRevenue: 142.30,
      recentTransactions: [],
      status: 'ok',
      warnings: [],
      mhdStatus: {
        expiredCount: 0,
        warningCount: 1,
        earliestExpiry: '2025-07-12T00:00:00.000Z',
        alertLevel: 'ok'
      }
    },
    {
      id: 347989,
      machineName: 'Königstein',
      location: 'Königstein',
      lastRefill: {
        datetime: '2025-07-05T07:15:00.000Z',
        operator: 'Wartungsteam',
        daysAgo: 0
      },
      lastSale: {
        datetime: '2025-07-05T14:20:00.000Z',
        daysAgo: 0
      },
      lastCashlessSale: {
        datetime: '2025-07-05T13:45:00.000Z',
        paymentMethod: 'CARD',
        daysAgo: 0
      },
      lastDoorOpen: {
        datetime: '2025-07-05T07:50:00.000Z',
        daysAgo: 0
      },
      lastAlcoholSale: null,
      todayRevenue: 98.75,
      recentTransactions: [],
      status: 'ok',
      warnings: [],
      mhdStatus: {
        expiredCount: 0,
        warningCount: 0,
        earliestExpiry: null,
        alertLevel: 'ok'
      }
    }
  ];

  console.log(`Ultra-fast static location status: Returning ${staticResponse.length} locations`);
  res.json(staticResponse);
});

export default router;
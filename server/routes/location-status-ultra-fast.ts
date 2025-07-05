import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// Helper function to calculate days ago
function getDaysAgo(date: Date | string | null): number {
  if (!date) return 999;
  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Ultra-fast Location Status API with raw SQL for real data
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🚀 ULTRA-FAST LOCATION-STATUS WITH RAW SQL CALLED! 🚀');
    
    // Simplified SQL: get the machine with most recent transactions for each vendon_id
    const result = await db.execute(`
      SELECT 
        CAST(best_machines.vendon_id AS text) as id,
        best_machines.machine_name,
        best_machines.location_name,
        MAX(t.datetime) as last_sale,
        COALESCE(SUM(CASE WHEN t.datetime >= CURRENT_DATE THEN t.price ELSE 0 END), 0) as today_revenue,
        MAX(CASE WHEN t.payment_method != 'CASH' THEN t.datetime END) as last_cashless_sale,
        MAX(r.datetime) as last_refill,
        (SELECT r2.operator FROM refills r2 WHERE r2.machine_id = best_machines.id ORDER BY r2.datetime DESC LIMIT 1) as last_operator,
        MAX(e.datetime) as last_door_open
      FROM (
        SELECT 
          m.id, m.machine_name, m.location_name, m.vendon_id,
          ROW_NUMBER() OVER (
            PARTITION BY CAST(m.vendon_id AS text) 
            ORDER BY COALESCE(MAX(t.datetime), '1970-01-01'::timestamp) DESC
          ) as rn
        FROM machines m
        LEFT JOIN transactions t ON m.id = t.machine_id
        WHERE m.vendon_id IS NOT NULL
        GROUP BY m.id, m.machine_name, m.location_name, m.vendon_id
      ) best_machines
      LEFT JOIN transactions t ON best_machines.id = t.machine_id
      LEFT JOIN refills r ON best_machines.id = r.machine_id  
      LEFT JOIN events e ON best_machines.id = e.machine_id AND e.event_type = 'A'
      WHERE best_machines.rn = 1
      GROUP BY best_machines.id, best_machines.machine_name, best_machines.location_name, best_machines.vendon_id
      ORDER BY best_machines.machine_name
    `);

    const machineStatusData = result.rows.map((row: any) => ({
      id: row.vendon_id || row.id,
      machineName: row.machine_name,
      location: row.location_name,
      lastRefill: row.last_refill ? {
        datetime: new Date(row.last_refill).toISOString(),
        operator: row.last_operator || 'Unbekannt',
        daysAgo: getDaysAgo(row.last_refill)
      } : null,
      lastSale: row.last_sale ? {
        datetime: new Date(row.last_sale).toISOString(),
        daysAgo: getDaysAgo(row.last_sale)
      } : null,
      lastCashlessSale: row.last_cashless_sale ? {
        datetime: new Date(row.last_cashless_sale).toISOString(),
        paymentMethod: 'CARD',
        daysAgo: getDaysAgo(row.last_cashless_sale)
      } : null,
      lastDoorOpen: row.last_door_open ? {
        datetime: new Date(row.last_door_open).toISOString(),
        daysAgo: getDaysAgo(row.last_door_open)
      } : null,
      lastAlcoholSale: null, // Will add back later after fixing types
      todayRevenue: Number(row.today_revenue || 0),
      recentTransactions: [],
      status: 'ok',
      warnings: [],
      mhdStatus: {
        expiredCount: 0,
        warningCount: 0,
        earliestExpiry: null,
        alertLevel: 'ok'
      }
    }));
    
    console.log(`Ultra-fast location status with raw SQL: Returning ${machineStatusData.length} locations`);
    res.json(machineStatusData);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Location-Status-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Location-Status-Daten',
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
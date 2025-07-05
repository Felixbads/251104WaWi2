import { Router, Request, Response } from 'express';
import { db } from '../db';
import { machines, transactions, products, refills, events } from '@shared/schema';
import { sql, eq, desc, and, gte, lte, ne } from 'drizzle-orm';

const router = Router();

// Optimierte Location Status API für das Dashboard
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('Location-Status-Daten werden abgerufen (optimiert)...');
    
    // Zeitberechnungen
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('Hole alle Maschinen...');
    
    // Alle Maschinen mit allen benötigten Daten in wenigen Abfragen
    const [
      allMachines,
      todayRevenueData,
      weeklyRevenueData,
      lastSalesData,
      lastCashlessData,
      lastAlcoholData,
      lastRefillData,
      lastDoorData
    ] = await Promise.all([
      // Alle Maschinen
      db.select({
        id: machines.id,
        machineName: machines.machineName,
        locationId: machines.locationId
      }).from(machines),
      
      // Heutiger Umsatz
      db.select({
        machineId: transactions.machineId,
        total: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.datetime, todayStart),
          lte(transactions.datetime, todayEnd),
          sql`${transactions.machineId} IS NOT NULL`
        )
      )
      .groupBy(transactions.machineId),

      // Wöchentlicher Umsatz
      db.select({
        machineId: transactions.machineId,
        total: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.datetime, weekStart),
          sql`${transactions.machineId} IS NOT NULL`
        )
      )
      .groupBy(transactions.machineId),

      // Letzte Verkäufe pro Maschine
      db.execute(sql`
        SELECT DISTINCT ON (machine_id) 
          machine_id, datetime, product_name
        FROM transactions 
        WHERE machine_id IS NOT NULL 
        ORDER BY machine_id, datetime DESC
      `),

      // Letzte bargeldlose Verkäufe
      db.execute(sql`
        SELECT DISTINCT ON (machine_id) 
          machine_id, datetime, payment_method
        FROM transactions 
        WHERE machine_id IS NOT NULL 
          AND payment_method != 'CASH'
        ORDER BY machine_id, datetime DESC
      `),

      // Letzte Alkoholverkäufe
      db.execute(sql`
        SELECT DISTINCT ON (t.machine_id) 
          t.machine_id, t.datetime, t.product_name
        FROM transactions t
        LEFT JOIN products p ON t.product_id = p.id
        WHERE t.machine_id IS NOT NULL 
          AND p.is_alcoholic = true
        ORDER BY t.machine_id, t.datetime DESC
      `),

      // Letzte Refills
      db.execute(sql`
        SELECT DISTINCT ON (machine_id) 
          machine_id, datetime, operator
        FROM refills 
        WHERE machine_id IS NOT NULL 
        ORDER BY machine_id, datetime DESC
      `),

      // Letzte Türöffnungen
      db.execute(sql`
        SELECT DISTINCT ON (machine_id) 
          machine_id, datetime
        FROM events 
        WHERE machine_id IS NOT NULL 
          AND event_type = 'A'
        ORDER BY machine_id, datetime DESC
      `)
    ]);

    console.log(`${allMachines.length} Maschinen gefunden, aggregiere Daten...`);
    
    // Daten zu Maps konvertieren für schnellen Zugriff
    const todayRevenueMap = new Map(todayRevenueData.map(item => [item.machineId, item.total]));
    const weeklyRevenueMap = new Map(weeklyRevenueData.map(item => [item.machineId, item.total]));
    const lastSalesMap = new Map(lastSalesData.rows.map((item: any) => [item.machine_id, item]));
    const lastCashlessMap = new Map(lastCashlessData.rows.map((item: any) => [item.machine_id, item]));
    const lastAlcoholMap = new Map(lastAlcoholData.rows.map((item: any) => [item.machine_id, item]));
    const lastRefillMap = new Map(lastRefillData.rows.map((item: any) => [item.machine_id, item]));
    const lastDoorMap = new Map(lastDoorData.rows.map((item: any) => [item.machine_id, item]));
    
    const machineStatusData = [];
    
    for (const machine of allMachines) {
      // Hole Daten aus Maps
      const todayRevenue = todayRevenueMap.get(machine.id) || 0;
      const weeklyRevenue = weeklyRevenueMap.get(machine.id) || 0;
      const lastSale = lastSalesMap.get(machine.id);
      const lastCashless = lastCashlessMap.get(machine.id);
      const lastAlcohol = lastAlcoholMap.get(machine.id);
      const lastRefill = lastRefillMap.get(machine.id);
      const lastDoor = lastDoorMap.get(machine.id);
      
      // Tage berechnen
      const calculateDaysAgo = (dateTime: string | Date | null) => {
        if (!dateTime) return null;
        const date = new Date(dateTime);
        return Math.floor((today.getTime() - new Date(date.toDateString()).getTime()) / (1000 * 60 * 60 * 24));
      };

      // Status bestimmen
      const refillDaysAgo = lastRefill ? calculateDaysAgo(lastRefill.datetime) : null;
      const saleDaysAgo = lastSale ? calculateDaysAgo(lastSale.datetime) : null;
      
      let status = 'good';
      const warnings = [];
      
      if (refillDaysAgo !== null && refillDaysAgo > 14) {
        status = 'warning';
        warnings.push(`Letztes Refill vor ${refillDaysAgo} Tagen`);
      }
      
      if (saleDaysAgo !== null && saleDaysAgo > 7) {
        status = 'attention';
        warnings.push(`Letzter Verkauf vor ${saleDaysAgo} Tagen`);
      }

      if (saleDaysAgo !== null && saleDaysAgo > 14) {
        status = 'critical';
        warnings.push(`Kritisch: Kein Verkauf seit ${saleDaysAgo} Tagen`);
      }

      machineStatusData.push({
        id: machine.id,
        machineName: machine.machineName,
        location: machine.locationId,
        todayRevenue: Number(todayRevenue),
        weeklyRevenue: Number(weeklyRevenue),
        lastRefill: lastRefill ? {
          datetime: lastRefill.datetime,
          operator: lastRefill.operator || 'Unbekannt',
          daysAgo: refillDaysAgo
        } : null,
        lastSale: lastSale ? {
          datetime: lastSale.datetime,
          daysAgo: saleDaysAgo
        } : null,
        lastCashlessSale: lastCashless ? {
          datetime: lastCashless.datetime,
          paymentMethod: lastCashless.payment_method,
          daysAgo: calculateDaysAgo(lastCashless.datetime)
        } : null,
        lastAlcoholSale: lastAlcohol ? {
          datetime: lastAlcohol.datetime,
          productName: lastAlcohol.product_name,
          daysAgo: calculateDaysAgo(lastAlcohol.datetime)
        } : null,
        lastDoorOpen: lastDoor ? {
          datetime: lastDoor.datetime,
          daysAgo: calculateDaysAgo(lastDoor.datetime)
        } : null,
        recentTransactions: [],
        status,
        warnings
      });
    }
    
    console.log(`Location-Status für ${machineStatusData.length} Automaten erfolgreich abgerufen`);
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
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { machines, transactions, products } from '@shared/schema';
import { sql, eq, desc, and, gte, lte, ne } from 'drizzle-orm';

const router = Router();

// Location Status API für das Dashboard
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('Location-Status-Daten werden abgerufen...');
    
    // Alle Automaten abrufen
    const allMachines = await db.select({
      id: machines.id,
      machineName: machines.machineName,
      locationId: machines.locationId
    }).from(machines);
    
    const machineStatusData = [];
    
    for (const machine of allMachines) {
      // Heutiger Umsatz
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayRevenue = await db.select({
        total: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.machineId, machine.id),
          gte(transactions.datetime, todayStart),
          lte(transactions.datetime, todayEnd)
        )
      );
      
      // Letzter Verkauf
      const lastSale = await db.select({
        datetime: transactions.datetime,
        productName: transactions.productName
      })
      .from(transactions)
      .where(eq(transactions.machineId, machine.id))
      .orderBy(desc(transactions.datetime))
      .limit(1);
      
      // Letzte bargeldlose Zahlung
      const lastCashlessSale = await db.select({
        datetime: transactions.datetime,
        paymentMethod: transactions.paymentMethod
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.machineId, machine.id),
          ne(transactions.paymentMethod, 'CASH')
        )
      )
      .orderBy(desc(transactions.datetime))
      .limit(1);
      
      // Letzter Alkoholverkauf (basierend auf Produktnamen-Schlüsselwörtern)
      const lastAlcoholSale = await db.select({
        datetime: transactions.datetime,
        productName: transactions.productName
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.machineId, machine.id),
          sql`(
            LOWER(${transactions.productName}) LIKE '%bier%' OR 
            LOWER(${transactions.productName}) LIKE '%sekt%' OR 
            LOWER(${transactions.productName}) LIKE '%wein%' OR 
            LOWER(${transactions.productName}) LIKE '%pils%' OR
            LOWER(${transactions.productName}) LIKE '%radler%' OR
            LOWER(${transactions.productName}) LIKE '%weizen%'
          )`
        )
      )
      .orderBy(desc(transactions.datetime))
      .limit(1);
      
      // Letzte 3 Transaktionen
      const recentTransactions = await db.select({
        datetime: transactions.datetime,
        productName: transactions.productName,
        price: transactions.price
      })
      .from(transactions)
      .where(eq(transactions.machineId, machine.id))
      .orderBy(desc(transactions.datetime))
      .limit(3);
      
      // Tage seit letztem Verkauf berechnen
      const now = new Date();
      const lastSaleDate = lastSale[0]?.datetime;
      const daysSinceLastSale = lastSaleDate 
        ? Math.floor((now.getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      
      const lastCashlessSaleDate = lastCashlessSale[0]?.datetime;
      const daysSinceLastCashless = lastCashlessSaleDate
        ? Math.floor((now.getTime() - new Date(lastCashlessSaleDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
        
      const lastAlcoholSaleDate = lastAlcoholSale[0]?.datetime;
      const daysSinceLastAlcohol = lastAlcoholSaleDate
        ? Math.floor((now.getTime() - new Date(lastAlcoholSaleDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      
      // Status bewerten
      let status: 'ok' | 'warning' | 'error' = 'ok';
      const warnings: string[] = [];
      
      if (daysSinceLastSale !== null && daysSinceLastSale > 2) {
        status = 'warning';
        warnings.push('Keine Verkäufe seit über 2 Tagen');
      }
      
      if (daysSinceLastSale !== null && daysSinceLastSale > 5) {
        status = 'error';
        warnings.push('Keine Verkäufe seit über 5 Tagen');
      }
      
      machineStatusData.push({
        id: machine.id,
        machineName: machine.machineName,
        location: `Location ID: ${machine.locationId}`,
        lastRefill: null, // TODO: Füllungsdaten implementieren
        lastSale: lastSale[0] ? {
          datetime: lastSale[0].datetime.toISOString(),
          daysAgo: daysSinceLastSale
        } : null,
        lastCashlessSale: lastCashlessSale[0] ? {
          datetime: lastCashlessSale[0].datetime.toISOString(),
          paymentMethod: lastCashlessSale[0].paymentMethod,
          daysAgo: daysSinceLastCashless
        } : null,
        lastAlcoholSale: lastAlcoholSale[0] ? {
          datetime: lastAlcoholSale[0].datetime.toISOString(),
          productName: lastAlcoholSale[0].productName,
          daysAgo: daysSinceLastAlcohol
        } : null,
        lastDoorOpen: null, // TODO: Event-Daten implementieren
        todayRevenue: parseFloat(todayRevenue[0]?.total?.toString() || '0'),
        recentTransactions: recentTransactions.map(t => ({
          datetime: t.datetime.toISOString(),
          productName: t.productName || 'Unbekanntes Produkt',
          amount: parseFloat(t.price?.toString() || '0')
        })),
        status,
        warnings
      });
    }
    
    console.log(`Location-Status für ${machineStatusData.length} Automaten abgerufen`);
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
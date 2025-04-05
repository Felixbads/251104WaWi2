import { Router } from 'express';
import { db } from '../db';
import { transactions, orders, products, machines, suppliers, events } from '../../shared/schema';
import { count, eq, sql, desc, and, gt, lt, gte, lte, sum, avg } from 'drizzle-orm';
import { startOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();

// Export a function to register the routes
export function statisticsRoutes(app: any) {
  app.use('/api/statistics', router);
}

/**
 * Endpunkt für grundlegende Datenbankstatistiken
 * 
 * Diese Abfrage ist effizient und schnell, da sie nur einfache Zählungen durchführt
 * und keine komplexen JOIN-Operationen oder Aggregationen verwendet.
 */
router.get('/database', async (req, res) => {
  try {
    console.log('Datenbankstatistiken werden abgefragt...');
    
    // Parallele Abfragen für bessere Performance
    const [
      transactionsCount,
      openOrdersCount,
      productsCount,
      machinesCount,
      suppliersCount
    ] = await Promise.all([
      // Anzahl aller Transaktionen
      db.select({ count: count() }).from(transactions),
      
      // Anzahl offener Bestellungen
      db.select({ count: count() }).from(orders)
        .where(eq(orders.status, 'open')),
      
      // Anzahl aller Produkte
      db.select({ count: count() }).from(products),
      
      // Anzahl aller Automaten
      db.select({ count: count() }).from(machines),
      
      // Anzahl aller Lieferanten
      db.select({ count: count() }).from(suppliers)
    ]);

    // Daten aufbereiten und zurückgeben
    const responseData = {
      transactions: transactionsCount[0].count || 0,
      openOrders: openOrdersCount[0].count || 0,
      products: productsCount[0].count || 0,
      machines: machinesCount[0].count || 0,
      suppliers: suppliersCount[0].count || 0,
      lastUpdated: new Date().toISOString()
    };

    console.log('Datenbankstatistiken erfolgreich abgefragt:', responseData);
    return res.json(responseData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Datenbankstatistiken:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Datenbankstatistiken',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

/**
 * Endpunkt für Transaktions- und Verkaufsdaten mit Zeitraumfilter
 * 
 * Parameter:
 * - period: 'day', 'week', 'month', 'custom'
 * - startDate: (optional, für 'custom') Start-Datum im ISO-Format
 * - endDate: (optional, für 'custom') End-Datum im ISO-Format
 */
router.get('/sales', async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;

    // Zeitraumfilter definieren
    let startDateObj = new Date();
    let endDateObj = new Date();
    let prevStartDateObj = new Date();
    let prevEndDateObj = new Date();
    
    // Zeitraum-Berechnung basierend auf Parameter
    switch(period) {
      case 'day':
        startDateObj = startOfDay(startDateObj);
        prevStartDateObj = startOfDay(subDays(startDateObj, 1));
        prevEndDateObj = subDays(startDateObj, 1);
        break;
      case 'week':
        startDateObj = startOfWeek(startDateObj, { weekStartsOn: 1 }); // Woche beginnt Montag
        endDateObj = endOfWeek(startDateObj, { weekStartsOn: 1 });
        prevStartDateObj = startOfWeek(subDays(startDateObj, 7), { weekStartsOn: 1 });
        prevEndDateObj = endOfWeek(prevStartDateObj, { weekStartsOn: 1 });
        break;
      case 'month':
        startDateObj = startOfMonth(startDateObj);
        endDateObj = endOfMonth(startDateObj);
        prevStartDateObj = startOfMonth(new Date(startDateObj.getFullYear(), startDateObj.getMonth() - 1, 1));
        prevEndDateObj = endOfMonth(prevStartDateObj);
        break;
      case 'custom':
        if (startDate && endDate) {
          startDateObj = new Date(startDate as string);
          endDateObj = new Date(endDate as string);
          
          // Für Vergleichszeitraum: gleiches Zeitfenster vor dem gewählten Zeitraum
          const dayDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
          prevStartDateObj = new Date(startDateObj);
          prevStartDateObj.setDate(prevStartDateObj.getDate() - dayDiff);
          prevEndDateObj = new Date(endDateObj);
          prevEndDateObj.setDate(prevEndDateObj.getDate() - dayDiff);
        }
        break;
    }

    // Formatierte Zeiträume für Logs
    const currentPeriod = `${format(startDateObj, 'yyyy-MM-dd')} bis ${format(endDateObj, 'yyyy-MM-dd')}`;
    const prevPeriod = `${format(prevStartDateObj, 'yyyy-MM-dd')} bis ${format(prevEndDateObj, 'yyyy-MM-dd')}`;
    
    console.log(`Verkaufsdaten werden für Zeitraum ${currentPeriod} abgefragt`);
    console.log(`Vergleichszeitraum: ${prevPeriod}`);

    // String-Formate der Daten für SQL-Vergleiche
    const startDateStr = startDateObj.toISOString();
    const endDateStr = endDateObj.toISOString();
    const prevStartDateStr = prevStartDateObj.toISOString();
    const prevEndDateStr = prevEndDateObj.toISOString();

    // Parallel Abfragen für Transaktionsdaten
    const [
      currentPeriodStats,
      prevPeriodStats,
      topMachines,
      topProducts,
      paymentMethods,
      hourlyDistribution
    ] = await Promise.all([
      // Aktuelle Periode: Anzahl und Summe der Transaktionen
      db.select({
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`,
        avgValue: sql<number>`COALESCE(AVG(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        )),
      
      // Vorherige Periode: Anzahl und Summe der Transaktionen
      db.select({
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`,
        avgValue: sql<number>`COALESCE(AVG(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${prevStartDateStr}`,
          sql`datetime <= ${prevEndDateStr}`
        )),
      
      // Top 5 Automaten nach Umsatz in der aktuellen Periode
      db.select({
        machineId: transactions.machineId,
        machineName: transactions.machineName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`,
        avgValue: sql<number>`COALESCE(AVG(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(transactions.machineId, transactions.machineName)
        .orderBy(desc(sql<number>`COALESCE(SUM(price), 0)`))
        .limit(5),
      
      // Top 5 Produkte nach Umsatz in der aktuellen Periode
      db.select({
        productName: sql<string>`name`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(sql`name`)
        .orderBy(desc(sql<number>`COALESCE(SUM(price), 0)`))
        .limit(5),
      
      // Zahlungsmethoden-Verteilung
      db.select({
        paymentMethod: transactions.paymentMethod,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(transactions.paymentMethod),
      
      // Stündliche Verteilung (für Diagramm)
      db.select({
        hour: sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`)
        .orderBy(sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`)
    ]);

    // Profitberechnung (vereinfacht: 40% vom Umsatz)
    const currentProfit = (currentPeriodStats[0]?.revenue || 0) * 0.4;
    const prevProfit = (prevPeriodStats[0]?.revenue || 0) * 0.4;

    // Zahlungsmethoden formatieren
    const paymentStats = {
      cash: 0,
      card: 0,
      cashless: 0,
      other: 0
    };

    paymentMethods.forEach(pm => {
      switch (pm.paymentMethod?.toUpperCase()) {
        case 'CASH':
          paymentStats.cash += pm.revenue || 0;
          break;
        case 'CARD':
          paymentStats.card += pm.revenue || 0;
          break;
        case 'CASHLESS':
          paymentStats.cashless += pm.revenue || 0;
          break;
        default:
          paymentStats.other += pm.revenue || 0;
      }
    });

    // Daten aufbereiten und zurückgeben
    const responseData = {
      // Aktuelle Periode
      currentPeriod: {
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        transactions: currentPeriodStats[0]?.count || 0,
        revenue: currentPeriodStats[0]?.revenue || 0,
        avgValue: currentPeriodStats[0]?.avgValue || 0,
        profit: currentProfit
      },
      
      // Vorherige Periode
      previousPeriod: {
        startDate: prevStartDateObj.toISOString(),
        endDate: prevEndDateObj.toISOString(),
        transactions: prevPeriodStats[0]?.count || 0,
        revenue: prevPeriodStats[0]?.revenue || 0,
        avgValue: prevPeriodStats[0]?.avgValue || 0,
        profit: prevProfit
      },
      
      // Top-Daten
      topMachines,
      topProducts,
      
      // Zahlungsarten
      paymentMethods: paymentStats,
      
      // Stündliche Verteilung
      hourlyDistribution,
      
      // Metadaten
      metadata: {
        period,
        lastUpdated: new Date().toISOString()
      }
    };

    return res.json(responseData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Verkaufsdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Verkaufsdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

export default router;
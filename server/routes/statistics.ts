import { Router } from 'express';
import { db } from '../db';
import { 
  transactions, orders, products, machines, suppliers, events, 
  refills, refillDetails, weatherData, machineStocks 
} from '../../shared/schema';
import { count, eq, sql, desc, and, gt, lt, gte, lte, sum, avg, asc, isNotNull, not, or, inArray } from 'drizzle-orm';
import { 
  startOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  format, parseISO, addDays, addMonths, subMonths, differenceInDays
} from 'date-fns';

const router = Router();

// Export a function to register the routes
export function statisticsRoutes(app: any) {
  app.use('/api/statistics', router);
  
  // Erweiterte Machine Analytics Endpoint
  app.get('/api/machines/:id/analytics', async (req, res) => {
    try {
      console.log('Automaten-Analyse-Anfrage erhalten');
      const machineId = parseInt(req.params.id);
      const { period = 'month', startDate, endDate } = req.query;
      console.log(`Analyseparameter: machineId=${machineId}, period=${period}, startDate=${startDate}, endDate=${endDate}`);
      
      // Debug-Ausgaben
      console.log(`Vollständige Anfrageparameter:`, req.query);
      console.log(`Maschinentyp von machineId: ${typeof machineId}`);
      
      if (isNaN(machineId)) {
        return res.status(400).json({ 
          error: 'Fehler bei der Erstellung der Automatenanalyse',
          message: `Ungültige Maschinen-ID: ${req.params.id}`
        });
      }
      
      // Zeitraumfilter definieren
      let startDateObj = new Date();
      let endDateObj = new Date();
      
      if (period === 'day') {
        startDateObj = startOfDay(startDateObj);
        endDateObj = new Date(startDateObj);
        endDateObj.setHours(23, 59, 59, 999);
      } else if (period === 'week') {
        startDateObj = startOfWeek(startDateObj, { weekStartsOn: 1 });
        endDateObj = endOfWeek(startDateObj, { weekStartsOn: 1 });
      } else if (period === 'month') {
        startDateObj = startOfMonth(startDateObj);
        endDateObj = endOfMonth(startDateObj);
      } else if (period === 'year') {
        startDateObj = new Date(startDateObj.getFullYear(), 0, 1);
        endDateObj = new Date(startDateObj.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else if (period === 'custom' && startDate && endDate) {
        startDateObj = new Date(startDate as string);
        endDateObj = new Date(endDate as string);
      }
      
      // String-Formate der Daten für SQL-Vergleiche
      const startDateStr = startDateObj.toISOString();
      const endDateStr = endDateObj.toISOString();
      
      console.log(`Erweiterte Automatenanalyse für ID ${machineId} im Zeitraum ${startDateStr} bis ${endDateStr}`);
      
      // Basis-Statistiken abrufen
      const basicStats = await db.select({
        transactionCount: count(),
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        totalProfit: sql<number>`COALESCE(SUM(${transactions.price} - COALESCE(${transactions.costPrice}, 0)), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ));
      
      // Umsatz über Zeit (nach Tagen gruppiert)
      const revenueOverTimeData = await db.select({
        date: sql<string>`DATE(${transactions.datetime})`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        profit: sql<number>`COALESCE(SUM(${transactions.price} - COALESCE(${transactions.costPrice}, 0)), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`${transactions.datetime} >= ${startDateStr}`,
        sql`${transactions.datetime} <= ${endDateStr}`
      ))
      .groupBy(sql`DATE(${transactions.datetime})`)
      .orderBy(sql`DATE(${transactions.datetime})`);
      
      // Top Produkte nach Umsatz
      const topProductsData = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`,
        isNotNull(transactions.productName)
      ))
      .groupBy(transactions.productName)
      .orderBy(desc(sql<number>`COALESCE(SUM(${transactions.price}), 0)`))
      .limit(10);
      
      // Schlechteste Produkte nach Umsatz
      const worstProductsData = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`,
        isNotNull(transactions.productName)
      ))
      .groupBy(transactions.productName)
      .orderBy(asc(sql<number>`COALESCE(SUM(${transactions.price}), 0)`))
      .limit(10);
      
      // Struktur der Analytik-Daten
      const machineAnalytics = {
        machine: {
          machineId,
          period,
          startDate: startDateStr,
          endDate: endDateStr,
        },
        summary: {
          transactions: basicStats[0]?.transactionCount || 0,
          revenue: basicStats[0]?.totalRevenue || 0,
          profit: basicStats[0]?.totalProfit || 0,
        },
        revenueOverTime: revenueOverTimeData.map(item => ({
          date: item.date,
          count: item.count,
          revenue: item.revenue,
          profit: item.profit,
        })),
        topProducts: topProductsData.map(item => ({
          productName: item.productName,
          count: item.count,
          revenue: item.revenue,
        })),
        worstProducts: worstProductsData.map(item => ({
          productName: item.productName,
          count: item.count,
          revenue: item.revenue,
        })),
        generatedAt: new Date().toISOString()
      };
      
      console.log('Erweiterte Analytik erfolgreich erstellt');
      return res.json(machineAnalytics);
      
    } catch (error) {
      console.error(`Fehler bei erweiterter Automatenanalyse:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`Detaillierter Fehler: ${errorMessage}\nStack: ${errorStack}`);
      
      return res.status(500).json({ 
        error: 'Fehler bei der Erstellung der erweiterten Automatenanalyse',
        message: errorMessage
      });
    }
  });

  /**
   * Endpunkt für grundlegende Datenbankstatistiken
   * 
   * Diese Abfrage ist effizient und schnell, da sie nur einfache Zählungen durchführt
   * und keine komplexen JOIN-Operationen oder Aggregationen verwendet.
   */
  router.get('/basic', async (req, res) => {
    try {
      // Gesamtanzahl der Transaktionen
      const transactionsCount = await db.select({ count: count() })
        .from(transactions);
      
      // Gesamtanzahl der Produkte
      const productsCount = await db.select({ count: count() })
        .from(products);
      
      // Gesamtanzahl der Automaten
      const machinesCount = await db.select({ count: count() })
        .from(machines);
      
      // Gesamtanzahl der Refills
      const refillsCount = await db.select({ count: count() })
        .from(refills);
      
      // Gesamtanzahl der Ereignisse
      const eventsCount = await db.select({ count: count() })
        .from(events);
      
      // Ergebnis zusammenstellen
      const statistics = {
        transactions: transactionsCount[0]?.count || 0,
        products: productsCount[0]?.count || 0,
        machines: machinesCount[0]?.count || 0,
        refills: refillsCount[0]?.count || 0,
        events: eventsCount[0]?.count || 0,
        generatedAt: new Date().toISOString()
      };
      
      return res.json(statistics);
    } catch (error) {
      console.error("Fehler beim Abrufen der Basisstatistiken:", error);
      return res.status(500).json({ error: "Fehler beim Abrufen der Basisstatistiken" });
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
      // Parameter auslesen
      const { period = 'month', startDate, endDate } = req.query;
      
      // Zeitraumfilter definieren
      let startDateObj = new Date();
      let endDateObj = new Date();
      
      // Zeitraum-Berechnung basierend auf Parameter
      switch(period) {
        case 'day':
          startDateObj = startOfDay(startDateObj);
          endDateObj = endOfDay(startDateObj);
          break;
        case 'week':
          startDateObj = startOfWeek(startDateObj, { weekStartsOn: 1 });
          endDateObj = endOfWeek(startDateObj, { weekStartsOn: 1 });
          break;
        case 'month':
          startDateObj = startOfMonth(startDateObj);
          endDateObj = endOfMonth(startDateObj);
          break;
        case 'custom':
          if (startDate && endDate) {
            startDateObj = new Date(startDate as string);
            endDateObj = new Date(endDate as string);
          }
          break;
      }
      
      // String-Formate der Daten für SQL-Vergleiche
      const startDateStr = startDateObj.toISOString();
      const endDateStr = endDateObj.toISOString();
      
      // Zusammenfassende Statistik für den Zeitraum
      const summaryStats = await db.select({
        totalTransactions: count(),
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        avgTicket: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ));
      
      // Top 5 Produkte nach Verkaufshäufigkeit
      const topProducts = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`,
        isNotNull(transactions.productName)
      ))
      .groupBy(transactions.productName)
      .orderBy(desc(count()))
      .limit(5);
      
      // Automaten mit den meisten Verkäufen
      const topMachines = await db.select({
        machineId: transactions.machineId,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ))
      .groupBy(transactions.machineId)
      .orderBy(desc(count()))
      .limit(5);
      
      // Verkäufe pro Tag im angegebenen Zeitraum
      const salesByDay = await db.select({
        date: sql<string>`DATE(datetime)`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ))
      .groupBy(sql`DATE(datetime)`)
      .orderBy(sql`DATE(datetime)`);
      
      // Ergebnis zusammenstellen
      const salesStatistics = {
        period: {
          name: period,
          startDate: startDateStr,
          endDate: endDateStr,
        },
        summary: summaryStats[0] || { totalTransactions: 0, totalRevenue: 0, avgTicket: 0 },
        topProducts,
        topMachines,
        salesByDay,
        generatedAt: new Date().toISOString()
      };
      
      return res.json(salesStatistics);
    } catch (error) {
      console.error("Fehler beim Abrufen der Verkaufsstatistiken:", error);
      return res.status(500).json({ 
        error: "Fehler beim Abrufen der Verkaufsstatistiken",
        message: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    }
  });

  // Hilfsfunktion für endOfDay (fehlt in den Imports)
  function endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }
}
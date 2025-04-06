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
  
  // Machine Analytics Endpoint
  app.get('/api/machines/:id/analytics', async (req, res) => {
    try {
      console.log('Automaten-Analyse-Anfrage erhalten');
      const machineId = parseInt(req.params.id);
      const { period = 'month', startDate, endDate } = req.query;
      console.log(`Analyseparameter: machineId=${machineId}, period=${period}, startDate=${startDate}, endDate=${endDate}`);
      
      // Zusätzliche Debug-Ausgaben
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
      let prevStartDateObj = new Date();
      let prevEndDateObj = new Date();
      
      // Zeitraum-Berechnung basierend auf Parameter
      switch(period) {
        case 'day':
          startDateObj = startOfDay(startDateObj);
          endDateObj = new Date(startDateObj);
          endDateObj.setHours(23, 59, 59, 999);
          prevStartDateObj = startOfDay(subDays(startDateObj, 1));
          prevEndDateObj = subDays(endDateObj, 1);
          break;
        case 'week':
          startDateObj = startOfWeek(startDateObj, { weekStartsOn: 1 });
          endDateObj = endOfWeek(startDateObj, { weekStartsOn: 1 });
          prevStartDateObj = startOfWeek(subDays(startDateObj, 7), { weekStartsOn: 1 });
          prevEndDateObj = endOfWeek(prevStartDateObj, { weekStartsOn: 1 });
          break;
        case 'month':
          startDateObj = startOfMonth(startDateObj);
          endDateObj = endOfMonth(startDateObj);
          prevStartDateObj = startOfMonth(subMonths(startDateObj, 1));
          prevEndDateObj = endOfMonth(prevStartDateObj);
          break;
        case 'year':
          startDateObj = new Date(startDateObj.getFullYear(), 0, 1);
          endDateObj = new Date(startDateObj.getFullYear(), 11, 31, 23, 59, 59, 999);
          prevStartDateObj = new Date(startDateObj.getFullYear() - 1, 0, 1);
          prevEndDateObj = new Date(startDateObj.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
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

      // String-Formate der Daten für SQL-Vergleiche
      const startDateStr = startDateObj.toISOString();
      const endDateStr = endDateObj.toISOString();
      const prevStartDateStr = prevStartDateObj.toISOString();
      const prevEndDateStr = prevEndDateObj.toISOString();
      
      console.log(`Automatenanalyse für ID ${machineId} im Zeitraum ${startDateStr} bis ${endDateStr}`);
      
      // 1. Umsatz über die Zeit (nach Tag, Woche, Monat)
      const revenueOverTime = await db.select({
        date: sql<string>`DATE(datetime)`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        profit: sql<number>`COALESCE(SUM(${transactions.price}) * 0.4, 0)`, // Vereinfachte Gewinnberechnung (40% vom Umsatz)
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ))
      .groupBy(sql`DATE(datetime)`)
      .orderBy(sql`DATE(datetime)`);
      
      // 2. Vergleich mit Vorperiode
      const prevPeriodData = await db.select({
        totalCount: count(),
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        totalProfit: sql<number>`COALESCE(SUM(${transactions.price}) * 0.4, 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${prevStartDateStr}`,
        sql`datetime <= ${prevEndDateStr}`
      ));
      
      const currentPeriodData = await db.select({
        totalCount: count(),
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        totalProfit: sql<number>`COALESCE(SUM(${transactions.price}) * 0.4, 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ));
      
      // 3. Top-Produkte nach Umsatz
      const topProductsByRevenue = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        avgPrice: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
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
      
      // 4. Beste Produkte nach Marge/Ergebnis
      const topProductsByProfit = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        profit: sql<number>`COALESCE(SUM(
          ${transactions.price} - 
          COALESCE(${transactions.priceVat}, 0) - 
          COALESCE((
            CASE 
              WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
              ELSE 0
            END
          ), 0) - 
          COALESCE((
            CASE 
              WHEN products.cost_price IS NOT NULL THEN products.cost_price 
              ELSE ${transactions.price} * 0.6 -- Fallback: Schätzung der Kosten als 60% des Verkaufspreises
            END
          ), 0)
        ), 0)`,
        marginPerUnit: sql<number>`COALESCE(
          CASE
            WHEN COUNT(*) > 0 THEN
              (SUM(
                ${transactions.price} - 
                COALESCE(${transactions.priceVat}, 0) - 
                COALESCE((
                  CASE 
                    WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
                    ELSE 0
                  END
                ), 0) - 
                COALESCE((
                  CASE 
                    WHEN products.cost_price IS NOT NULL THEN products.cost_price 
                    ELSE ${transactions.price} * 0.6
                  END
                ), 0)
              ) / COUNT(*))
            ELSE 0
          END, 0)`
      })
      .from(transactions)
      .leftJoin(products, eq(sql`COALESCE(${transactions.productId}, "")`, sql`COALESCE(${products.vendonId}, "")`))
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`,
        isNotNull(transactions.productName)
      ))
      .groupBy(transactions.productName)
      .orderBy(desc(sql<number>`COALESCE(SUM(
        ${transactions.price} - 
        COALESCE(${transactions.priceVat}, 0) - 
        COALESCE((
          CASE 
            WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
            ELSE 0
          END
        ), 0) - 
        COALESCE((
          CASE 
            WHEN products.cost_price IS NOT NULL THEN products.cost_price 
            ELSE ${transactions.price} * 0.6
          END
        ), 0)
      ), 0)`))
      .limit(10);
      
      // 5. Schlechteste Produkte nach Ergebnis (negatives Ergebnis)
      const worstProductsByProfit = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        profit: sql<number>`COALESCE(SUM(
          ${transactions.price} - 
          COALESCE(${transactions.priceVat}, 0) - 
          COALESCE((
            CASE 
              WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
              ELSE 0
            END
          ), 0) - 
          COALESCE((
            CASE 
              WHEN products.cost_price IS NOT NULL THEN products.cost_price 
              ELSE ${transactions.price} * 0.6
            END
          ), 0)
        ), 0)`,
        marginPerUnit: sql<number>`COALESCE(
          CASE
            WHEN COUNT(*) > 0 THEN
              (SUM(
                ${transactions.price} - 
                COALESCE(${transactions.priceVat}, 0) - 
                COALESCE((
                  CASE 
                    WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
                    ELSE 0
                  END
                ), 0) - 
                COALESCE((
                  CASE 
                    WHEN products.cost_price IS NOT NULL THEN products.cost_price 
                    ELSE ${transactions.price} * 0.6
                  END
                ), 0)
              ) / COUNT(*))
            ELSE 0
          END, 0)`
      })
      .from(transactions)
      .leftJoin(products, eq(sql`COALESCE(${transactions.productId}, "")`, sql`COALESCE(${products.vendonId}, "")`))
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`,
        isNotNull(transactions.productName)
      ))
      .groupBy(transactions.productName)
      .orderBy(asc(sql<number>`COALESCE(SUM(
        ${transactions.price} - 
        COALESCE(${transactions.priceVat}, 0) - 
        COALESCE((
          CASE 
            WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
            ELSE 0
          END
        ), 0) - 
        COALESCE((
          CASE 
            WHEN products.cost_price IS NOT NULL THEN products.cost_price 
            ELSE ${transactions.price} * 0.6
          END
        ), 0)
      ), 0)`))
      .limit(10);
      
      // 6. Schlechteste Produkte nach Umsatz
      const worstProductsByRevenue = await db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        lastSale: sql<string>`MAX(datetime)`,
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
      
      // 7. Entnahmequote (Verkäufe vs. manuelle Entfernung)
      // Refill-Daten abrufen für Entnahmen vs. Verkäufe
      const refillData = await db.select({
        productName: refillDetails.productName,
        added: sql<number>`SUM(COALESCE(added, 0))`,
        removed: sql<number>`SUM(COALESCE(removed, 0))`,
      })
      .from(refills)
      .leftJoin(refillDetails, eq(refills.id, refillDetails.refillId))
      .where(and(
        eq(refills.machineId, machineId),
        sql`${refills.datetime} >= ${startDateStr}`,
        sql`${refills.datetime} <= ${endDateStr}`,
        isNotNull(refillDetails.productName)
      ))
      .groupBy(refillDetails.productName);
      
      // 8. "Produkt nicht auf Lager" Events
      const outOfStockEvents = await db.select({
        id: events.id,
        eventDateTime: events.eventDatetime,
        name: events.name,
        description: events.description,
        duration: events.duration,
        productName: sql<string>`
          CASE
            WHEN description LIKE '%Produktfüllstand%' 
            THEN SUBSTRING(description FROM 'Produktfüllstand ([^(]*)\\(' FOR '#')
            ELSE NULL
          END
        `,
      })
      .from(events)
      .where(and(
        eq(events.machineId, machineId),
        sql`${events.eventDatetime} >= ${startDateStr}`,
        sql`${events.eventDatetime} <= ${endDateStr}`,
        or(
          sql`${events.name} LIKE '%Produktfüllstand%'`,
          sql`${events.description} LIKE '%Produktfüllstand%'`
        ),
        sql`${events.description} LIKE '%minimum%'`
      ))
      .orderBy(desc(events.eventDatetime))
      .limit(50);
      
      // 9. Zusätzliche Analyse: Verkaufszeitverteilung (Stundenbasis)
      const hourlyDistribution = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ))
      .groupBy(sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`)
      .orderBy(sql<number>`EXTRACT(HOUR FROM datetime::timestamp)`);
      
      // 10. Tagebasierte Verkaufsverteilung (Wochentage)
      const weekdayDistribution = await db.select({
        weekday: sql<number>`EXTRACT(DOW FROM datetime::timestamp)`,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.machineId, machineId),
        sql`datetime >= ${startDateStr}`,
        sql`datetime <= ${endDateStr}`
      ))
      .groupBy(sql<number>`EXTRACT(DOW FROM datetime::timestamp)`)
      .orderBy(sql<number>`EXTRACT(DOW FROM datetime::timestamp)`);
      
      // Daten für Entnahmequote kombinieren (Verkäufe mit Refill-Entnahmen)
      const removalQuotas = [];
      
      // Für jedes Produkt, das aus den Refill-Daten bekannt ist
      for (const refill of refillData) {
        // Suche passende Verkaufsdaten
        const matchingSales = topProductsByRevenue.find(p => 
          p.productName === refill.productName
        ) || { count: 0, productName: refill.productName };
        
        // Berechne Quote
        const totalRemoved = Number(refill.removed) || 0;
        const totalSold = Number(matchingSales.count) || 0;
        const quota = totalRemoved === 0 ? 100 : (totalSold / (totalSold + totalRemoved)) * 100;
        
        removalQuotas.push({
          productName: refill.productName,
          sales: totalSold,
          manualRemovals: totalRemoved,
          quota: Math.round(quota * 10) / 10, // Auf eine Dezimalstelle runden
        });
      }
      
      // Berechne Tage seit letztem Verkauf für "schlechteste Produkte nach Umsatz"
      const now = new Date();
      const worstProductsWithDaysSinceLastSale = worstProductsByRevenue.map(product => {
        const lastSaleDate = product.lastSale ? new Date(product.lastSale) : null;
        const daysSinceLastSale = lastSaleDate 
          ? differenceInDays(now, lastSaleDate) 
          : null;
        
        return {
          ...product,
          daysSinceLastSale
        };
      });
      
      // Erstellung des vollständigen Analyseobjekts
      const machineAnalytics = {
        machine: {
          machineId,
          period,
          startDate: startDateStr,
          endDate: endDateStr,
          prevStartDate: prevStartDateStr,
          prevEndDate: prevEndDateStr,
        },
        summary: {
          currentPeriod: {
            transactions: currentPeriodData[0]?.totalCount || 0,
            revenue: currentPeriodData[0]?.totalRevenue || 0,
            profit: currentPeriodData[0]?.totalProfit || 0,
          },
          previousPeriod: {
            transactions: prevPeriodData[0]?.totalCount || 0,
            revenue: prevPeriodData[0]?.totalRevenue || 0,
            profit: prevPeriodData[0]?.totalProfit || 0,
          },
          change: {
            transactions: prevPeriodData[0]?.totalCount && currentPeriodData[0]?.totalCount
              ? ((currentPeriodData[0].totalCount - prevPeriodData[0].totalCount) / prevPeriodData[0].totalCount) * 100
              : 0,
            revenue: prevPeriodData[0]?.totalRevenue && currentPeriodData[0]?.totalRevenue
              ? ((currentPeriodData[0].totalRevenue - prevPeriodData[0].totalRevenue) / prevPeriodData[0].totalRevenue) * 100
              : 0,
            profit: prevPeriodData[0]?.totalProfit && currentPeriodData[0]?.totalProfit
              ? ((currentPeriodData[0].totalProfit - prevPeriodData[0].totalProfit) / prevPeriodData[0].totalProfit) * 100
              : 0,
          }
        },
        revenueOverTime,
        topProductsByRevenue,
        topProductsByProfit,
        worstProductsByProfit,
        worstProductsByRevenue: worstProductsWithDaysSinceLastSale,
        removalQuotas,
        outOfStockEvents,
        hourlyDistribution,
        weekdayDistribution,
        generatedAt: new Date().toISOString()
      };
      
      // Zusätzlicher Validierungsschritt vor dem Senden
      if (!machineAnalytics || !machineAnalytics.machine || !machineAnalytics.summary) {
        console.error('Fehler: Unvollständige Analysedaten wurden generiert');
        return res.status(500).json({
          error: 'Fehler bei der Erstellung der Automatenanalyse',
          message: 'Die erzeugten Analysedaten sind unvollständig'
        });
      }
      
      // Debug-Log der erfolgreichen Analyse für Troubleshooting
      console.log(`Erfolgreiche Analyse für Automat ${machineId} generiert mit ${topProductsByRevenue.length} Top-Produkten`);
      
      return res.json(machineAnalytics);
    } catch (error) {
      console.error(`Fehler bei Automatenanalyse:`, error);
      // Detailliertere Fehlermeldung für Debugging
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`Detaillierter Fehler: ${errorMessage}\nStack: ${errorStack}`);
      
      // Ursache präziser erfassen für bessere Fehlerbehandlung im Client
      let errorType = 'UNKNOWN_ERROR';
      if (errorMessage.includes('productId') || errorMessage.includes('vendonId')) {
        errorType = 'JOIN_ERROR';
      } else if (errorMessage.includes('undefined') || errorMessage.includes('null')) {
        errorType = 'NULL_ERROR';
      } else if (errorMessage.includes('database') || errorMessage.includes('SQL')) {
        errorType = 'DATABASE_ERROR';
      }
      
      return res.status(500).json({ 
        error: 'Fehler bei der Erstellung der Automatenanalyse',
        message: errorMessage,
        errorType,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      });
    }
  });
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
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        avgValue: sql<number>`COALESCE(AVG(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        )),
      
      // Vorherige Periode: Anzahl und Summe der Transaktionen
      db.select({
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
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
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
        avgValue: sql<number>`COALESCE(AVG(price), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(transactions.machineId, transactions.machineName)
        .orderBy(desc(sql<number>`COALESCE(SUM(${transactions.price}), 0)`))
        .limit(5),
      
      // Top 5 Produkte nach Umsatz in der aktuellen Periode
      db.select({
        productName: transactions.productName,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
      }).from(transactions)
        .where(and(
          sql`datetime >= ${startDateStr}`,
          sql`datetime <= ${endDateStr}`
        ))
        .groupBy(transactions.productName)
        .orderBy(desc(sql<number>`COALESCE(SUM(${transactions.price}), 0)`))
        .limit(5),
      
      // Zahlungsmethoden-Verteilung
      db.select({
        paymentMethod: transactions.paymentMethod,
        count: count(),
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
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
        revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
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

/**
 * 1. Top-Produkt nach wirtschaftlichem Ergebnis
 * Berechnung: Verkaufswert – Mehrwertsteuer – Pfand – Einkaufspreis netto
 * Parameter:
 * - period: 'day', 'week', 'month', 'custom' (optional, Standard: 'month')
 * - startDate: Start-Datum im ISO-Format (optional, für 'custom')
 * - endDate: End-Datum im ISO-Format (optional, für 'custom')
 * - limit: Anzahl der Ergebnisse (optional, Standard: 10)
 */
router.get('/product-performance', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate, limit = 10 } = req.query;
    
    // Zeitraumfilter berechnen (ähnlich wie bei /sales)
    let startDateObj = new Date();
    let endDateObj = new Date();
    
    // Zeitraum-Berechnung basierend auf Parameter
    switch(period) {
      case 'day':
        startDateObj = startOfDay(startDateObj);
        endDateObj = new Date(startDateObj);
        endDateObj.setHours(23, 59, 59, 999);
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
    
    // Formatierter Zeitraum für Logs
    const dateRange = `${format(startDateObj, 'yyyy-MM-dd')} bis ${format(endDateObj, 'yyyy-MM-dd')}`;
    console.log(`Produktleistung wird für Zeitraum ${dateRange} abgefragt`);
    
    // String-Formate der Daten für SQL-Vergleiche
    const startDateStr = startDateObj.toISOString();
    const endDateStr = endDateObj.toISOString();
    
    // Abfrage: Verkaufswert – Mehrwertsteuer – Pfand – Einkaufspreis netto
    // Hierfür müssen wir:
    // 1. Transaktionen mit Produktdaten verknüpfen
    // 2. Die nötigen Berechnungen durchführen
    
    const productPerformanceQuery = await db.select({
      productId: transactions.productId,
      productName: transactions.productName,
      totalSales: count(),
      totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(
        CASE 
          WHEN products.cost_price IS NOT NULL THEN products.cost_price 
          ELSE ${transactions.price} * 0.6 -- Fallback: Schätzung der Kosten als 60% des Verkaufspreises
        END
      ), 0)`,
      totalVat: sql<number>`COALESCE(SUM(${transactions.priceVat}), 0)`,
      totalDeposit: sql<number>`COALESCE(SUM(
        CASE 
          WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
          ELSE 0
        END
      ), 0)`,
      netProfit: sql<number>`COALESCE(SUM(
        ${transactions.price} - 
        COALESCE(${transactions.priceVat}, 0) - 
        COALESCE((
          CASE 
            WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
            ELSE 0
          END
        ), 0) - 
        COALESCE((
          CASE 
            WHEN products.cost_price IS NOT NULL THEN products.cost_price 
            ELSE ${transactions.price} * 0.6 -- Fallback: Schätzung der Kosten als 60% des Verkaufspreises
          END
        ), 0)
      ), 0)`,
      profitMargin: sql<number>`COALESCE(
        CASE
          WHEN SUM(${transactions.price}) > 0 THEN
            (SUM(
              ${transactions.price} - 
              COALESCE(${transactions.priceVat}, 0) - 
              COALESCE((
                CASE 
                  WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
                  ELSE 0
                END
              ), 0) - 
              COALESCE((
                CASE 
                  WHEN products.cost_price IS NOT NULL THEN products.cost_price 
                  ELSE ${transactions.price} * 0.6
                END
              ), 0)
            ) / SUM(${transactions.price})) * 100
          ELSE 0
        END, 0)`
    })
    .from(transactions)
    .leftJoin(products, eq(sql`COALESCE(${transactions.productId}, "")`, sql`COALESCE(${products.vendonId}, "")`))
    .where(and(
      sql`${transactions.datetime} >= ${startDateStr}`,
      sql`${transactions.datetime} <= ${endDateStr}`,
      isNotNull(transactions.productName)
    ))
    .groupBy(transactions.productId, transactions.productName)
    .orderBy(desc(sql<number>`COALESCE(SUM(
      ${transactions.price} - 
      COALESCE(${transactions.priceVat}, 0) - 
      COALESCE((
        CASE 
          WHEN products.deposit_price IS NOT NULL THEN products.deposit_price 
          ELSE 0
        END
      ), 0) - 
      COALESCE((
        CASE 
          WHEN products.cost_price IS NOT NULL THEN products.cost_price 
          ELSE ${transactions.price} * 0.6
        END
      ), 0)
    ), 0)`))
    .limit(Number(limit));
    
    return res.json({
      products: productPerformanceQuery,
      topPerformer: productPerformanceQuery.length > 0 ? productPerformanceQuery[0] : null,
      metadata: {
        period,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Produkt-Leistungsdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Produkt-Leistungsdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

/**
 * 2. Automat mit den meisten "Removed"-Produkten
 * Untersucht die Refill Details und zählt entfernte Produkte je Automat
 * Parameter:
 * - period: 'day', 'week', 'month', 'custom' (optional, Standard: 'month')
 * - startDate: Start-Datum im ISO-Format (optional, für 'custom')
 * - endDate: End-Datum im ISO-Format (optional, für 'custom')
 */
router.get('/removed-products', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    // Zeitraumfilter berechnen
    let startDateObj = new Date();
    let endDateObj = new Date();
    
    // Zeitraum-Berechnung basierend auf Parameter
    switch(period) {
      case 'day':
        startDateObj = startOfDay(startDateObj);
        endDateObj = new Date(startDateObj);
        endDateObj.setHours(23, 59, 59, 999);
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
    
    // Formatierter Zeitraum für Logs
    const dateRange = `${format(startDateObj, 'yyyy-MM-dd')} bis ${format(endDateObj, 'yyyy-MM-dd')}`;
    console.log(`Entfernte Produkte werden für Zeitraum ${dateRange} abgefragt`);
    
    // String-Formate der Daten für SQL-Vergleiche
    const startDateStr = startDateObj.toISOString();
    const endDateStr = endDateObj.toISOString();
    
    // Abfrage nach Automaten mit den meisten entfernten Produkten
    const machinesWithRemovedProducts = await db.select({
      machineId: refills.machineId,
      machineName: refills.machineName,
      totalRefills: count(refills.id),
      totalRemovedProducts: sql<number>`COALESCE(SUM(${refillDetails.removed}), 0)`,
      avgRemovedPerRefill: sql<number>`COALESCE(AVG(${refillDetails.removed}), 0)`
    })
    .from(refills)
    .innerJoin(refillDetails, eq(refills.id, refillDetails.refillId))
    .where(and(
      sql`${refills.datetime} >= ${startDateStr}`,
      sql`${refills.datetime} <= ${endDateStr}`,
      sql`${refillDetails.removed} > 0`
    ))
    .groupBy(refills.machineId, refills.machineName)
    .orderBy(desc(sql<number>`COALESCE(SUM(${refillDetails.removed}), 0)`));
    
    // Details zu entfernten Produkten für Top-Automaten
    let topProductsRemoved = [];
    let topMachine = null;
    
    if (machinesWithRemovedProducts.length > 0) {
      topMachine = machinesWithRemovedProducts[0];
      
      // Produkte, die am häufigsten aus dem Top-Automaten entfernt wurden
      topProductsRemoved = await db.select({
        productName: refillDetails.productName,
        totalRemoved: sum(refillDetails.removed),
        count: count()
      })
      .from(refillDetails)
      .innerJoin(refills, eq(refillDetails.refillId, refills.id))
      .where(and(
        sql`${refills.datetime} >= ${startDateStr}`,
        sql`${refills.datetime} <= ${endDateStr}`,
        eq(refills.machineId, topMachine.machineId),
        sql`${refillDetails.removed} > 0`
      ))
      .groupBy(refillDetails.productName)
      .orderBy(desc(sum(refillDetails.removed)))
      .limit(10);
    }
    
    return res.json({
      machines: machinesWithRemovedProducts,
      topMachine,
      topProductsRemoved,
      metadata: {
        period,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Daten zu entfernten Produkten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Daten zu entfernten Produkten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

/**
 * 3. Event-Häufigkeit je Automat
 * Ermittelt, welcher Automat die meisten Events erzeugt hat
 * Parameter:
 * - period: 'day', 'week', 'month', 'custom' (optional, Standard: 'month')
 * - startDate: Start-Datum im ISO-Format (optional, für 'custom')
 * - endDate: End-Datum im ISO-Format (optional, für 'custom')
 */
router.get('/event-frequency', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    // Zeitraumfilter berechnen
    let startDateObj = new Date();
    let endDateObj = new Date();
    
    // Zeitraum-Berechnung basierend auf Parameter
    switch(period) {
      case 'day':
        startDateObj = startOfDay(startDateObj);
        endDateObj = new Date(startDateObj);
        endDateObj.setHours(23, 59, 59, 999);
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
    
    // Formatierter Zeitraum für Logs
    const dateRange = `${format(startDateObj, 'yyyy-MM-dd')} bis ${format(endDateObj, 'yyyy-MM-dd')}`;
    console.log(`Event-Häufigkeit wird für Zeitraum ${dateRange} abgefragt`);
    
    // String-Formate der Daten für SQL-Vergleiche
    const startDateStr = startDateObj.toISOString();
    const endDateStr = endDateObj.toISOString();
    
    // Abfrage nach Automaten mit den meisten Events
    const machineEventsFrequency = await db.select({
      machineId: events.machineId,
      machineName: events.machineName,
      totalEvents: count()
    })
    .from(events)
    .where(and(
      sql`${events.datetime} >= ${startDateStr}`,
      sql`${events.datetime} <= ${endDateStr}`
    ))
    .groupBy(events.machineId, events.machineName)
    .orderBy(desc(count()))
    .limit(20);
    
    // Event-Typen für den Automaten mit den meisten Events
    let topMachineEventTypes = [];
    let topMachine = null;
    
    if (machineEventsFrequency.length > 0) {
      topMachine = machineEventsFrequency[0];
      
      // Häufigste Event-Typen für den Top-Automaten
      topMachineEventTypes = await db.select({
        eventType: events.eventType,
        description: events.description,
        count: count(),
        percentage: sql<number>`(COUNT(*) * 100.0 / 
          (SELECT COUNT(*) FROM ${events} 
           WHERE ${events.machineId} = ${topMachine.machineId}
           AND ${events.datetime} >= ${startDateStr}
           AND ${events.datetime} <= ${endDateStr})
        )`
      })
      .from(events)
      .where(and(
        eq(events.machineId, topMachine.machineId),
        sql`${events.datetime} >= ${startDateStr}`,
        sql`${events.datetime} <= ${endDateStr}`
      ))
      .groupBy(events.eventType, events.description)
      .orderBy(desc(count()))
      .limit(10);
    }
    
    // Gesamtverteilung der Event-Typen über alle Automaten
    const eventTypeDistribution = await db.select({
      eventType: events.eventType,
      count: count(),
      percentage: sql<number>`(COUNT(*) * 100.0 / 
        (SELECT COUNT(*) FROM ${events} 
         WHERE ${events.datetime} >= ${startDateStr}
         AND ${events.datetime} <= ${endDateStr})
      )`
    })
    .from(events)
    .where(and(
      sql`${events.datetime} >= ${startDateStr}`,
      sql`${events.datetime} <= ${endDateStr}`
    ))
    .groupBy(events.eventType)
    .orderBy(desc(count()))
    .limit(10);
    
    return res.json({
      machines: machineEventsFrequency,
      topMachine,
      topMachineEventTypes,
      eventTypeDistribution,
      metadata: {
        period,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Event-Häufigkeitsdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Event-Häufigkeitsdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

/**
 * 4. Wetter-Korrelation zum Verkaufsvolumen
 * Parameter:
 * - period: 'day', 'week', 'month', 'custom' (optional, Standard: 'month')
 * - startDate: Start-Datum im ISO-Format (optional, für 'custom')
 * - endDate: End-Datum im ISO-Format (optional, für 'custom')
 */
router.get('/weather-correlation', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    // Zeitraumfilter berechnen
    let startDateObj = new Date();
    let endDateObj = new Date();
    
    // Zeitraum-Berechnung basierend auf Parameter
    switch(period) {
      case 'day':
        startDateObj = startOfDay(startDateObj);
        endDateObj = new Date(startDateObj);
        endDateObj.setHours(23, 59, 59, 999);
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
    
    // Formatierter Zeitraum für Logs
    const dateRange = `${format(startDateObj, 'yyyy-MM-dd')} bis ${format(endDateObj, 'yyyy-MM-dd')}`;
    console.log(`Wetter-Korrelation wird für Zeitraum ${dateRange} abgefragt`);
    
    // String-Formate der Daten für SQL-Vergleiche
    const startDateStr = startDateObj.toISOString();
    const endDateStr = endDateObj.toISOString();
    
    // Abfrage der täglichen Verkaufszahlen und Wetterinfos
    // 1. Aggregierte Verkaufsdaten pro Tag
    const dailySales = await db.select({
      date: sql<string>`DATE(${transactions.datetime})`,
      totalTransactions: count(),
      totalRevenue: sum(transactions.price)
    })
    .from(transactions)
    .where(and(
      sql`${transactions.datetime} >= ${startDateStr}`,
      sql`${transactions.datetime} <= ${endDateStr}`
    ))
    .groupBy(sql<string>`DATE(${transactions.datetime})`)
    .orderBy(asc(sql<string>`DATE(${transactions.datetime})`));
    
    // 2. Tägliche Wetterdaten (Durchschnittswerte pro Tag)
    const dailyWeather = await db.select({
      date: weatherData.date,
      avgTemp: avg(weatherData.temp),
      maxTemp: sql<number>`MAX(${weatherData.temp})`,
      minTemp: sql<number>`MIN(${weatherData.temp})`,
      avgHumidity: avg(weatherData.humidity),
      avgClouds: avg(weatherData.clouds),
      totalPrecipitation: sum(weatherData.precipitation),
      avgWindSpeed: avg(weatherData.wind_speed),
      dominantWeather: sql<string>`
        (SELECT ${weatherData.weather_main} 
         FROM ${weatherData} w2 
         WHERE DATE(w2.timestamp) = DATE(${weatherData.timestamp}) 
         GROUP BY ${weatherData.weather_main} 
         ORDER BY COUNT(*) DESC 
         LIMIT 1)
      `
    })
    .from(weatherData)
    .where(and(
      sql`DATE(${weatherData.timestamp}) >= DATE(${startDateStr})`,
      sql`DATE(${weatherData.timestamp}) <= DATE(${endDateStr})`
    ))
    .groupBy(weatherData.date)
    .orderBy(asc(weatherData.date));
    
    // 3. Kombinierte Daten mit Korrelationsanalyse
    const combinedData = [];
    const temperatureCorrelation = { correlation: 0, dataPoints: [] };
    const humidityCorrelation = { correlation: 0, dataPoints: [] };
    const precipitationCorrelation = { correlation: 0, dataPoints: [] };
    
    // Map für einfacheren Zugriff auf Wetterdaten
    const weatherMap = new Map();
    dailyWeather.forEach(day => {
      const dateKey = day.date ? format(new Date(day.date), 'yyyy-MM-dd') : null;
      if (dateKey) weatherMap.set(dateKey, day);
    });
    
    // Kombiniere Verkaufs- und Wetterdaten
    for (const salesDay of dailySales) {
      const dateKey = salesDay.date ? format(new Date(salesDay.date), 'yyyy-MM-dd') : null;
      if (!dateKey) continue;
      
      const weatherDay = weatherMap.get(dateKey);
      
      if (salesDay && weatherDay) {
        const combinedDay = {
          date: dateKey,
          sales: {
            transactions: salesDay.totalTransactions || 0,
            revenue: salesDay.totalRevenue || 0
          },
          weather: {
            avgTemp: weatherDay.avgTemp || null,
            maxTemp: weatherDay.maxTemp || null,
            minTemp: weatherDay.minTemp || null,
            avgHumidity: weatherDay.avgHumidity || null,
            avgClouds: weatherDay.avgClouds || null,
            totalPrecipitation: weatherDay.totalPrecipitation || 0,
            avgWindSpeed: weatherDay.avgWindSpeed || null,
            dominantWeather: weatherDay.dominantWeather || null
          }
        };
        
        combinedData.push(combinedDay);
        
        // Sammle Daten für Korrelationsberechnung
        if (weatherDay.avgTemp !== null && salesDay.totalTransactions !== null) {
          temperatureCorrelation.dataPoints.push({
            x: weatherDay.avgTemp,
            y: salesDay.totalTransactions
          });
        }
        
        if (weatherDay.avgHumidity !== null && salesDay.totalTransactions !== null) {
          humidityCorrelation.dataPoints.push({
            x: weatherDay.avgHumidity,
            y: salesDay.totalTransactions
          });
        }
        
        if (weatherDay.totalPrecipitation !== null && salesDay.totalTransactions !== null) {
          precipitationCorrelation.dataPoints.push({
            x: weatherDay.totalPrecipitation,
            y: salesDay.totalTransactions
          });
        }
      }
    }
    
    // Berechne Korrelationskoeffizienten
    // Temperatur-Korrelation
    temperatureCorrelation.correlation = calculateCorrelation(
      temperatureCorrelation.dataPoints.map(p => p.x),
      temperatureCorrelation.dataPoints.map(p => p.y)
    );
    
    // Luftfeuchtigkeit-Korrelation
    humidityCorrelation.correlation = calculateCorrelation(
      humidityCorrelation.dataPoints.map(p => p.x),
      humidityCorrelation.dataPoints.map(p => p.y)
    );
    
    // Niederschlag-Korrelation
    precipitationCorrelation.correlation = calculateCorrelation(
      precipitationCorrelation.dataPoints.map(p => p.x),
      precipitationCorrelation.dataPoints.map(p => p.y)
    );
    
    // Gruppiere Verkaufsdaten nach Wetter-Kategorien
    const salesByWeatherType = {};
    combinedData.forEach(day => {
      const weatherType = day.weather.dominantWeather || 'Unknown';
      
      if (!salesByWeatherType[weatherType]) {
        salesByWeatherType[weatherType] = {
          transactions: 0,
          revenue: 0,
          days: 0
        };
      }
      
      salesByWeatherType[weatherType].transactions += day.sales.transactions || 0;
      salesByWeatherType[weatherType].revenue += day.sales.revenue || 0;
      salesByWeatherType[weatherType].days += 1;
    });
    
    // Berechne Durchschnitte pro Wetter-Kategorie
    Object.keys(salesByWeatherType).forEach(weatherType => {
      const category = salesByWeatherType[weatherType];
      if (category.days > 0) {
        category.avgTransactions = category.transactions / category.days;
        category.avgRevenue = category.revenue / category.days;
      }
    });
    
    return res.json({
      dailyData: combinedData,
      correlations: {
        temperature: temperatureCorrelation,
        humidity: humidityCorrelation,
        precipitation: precipitationCorrelation
      },
      salesByWeatherType,
      metadata: {
        period,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        daysAnalyzed: combinedData.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Wetter-Korrelationsdaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Wetter-Korrelationsdaten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

/**
 * Hilfsfunktion zur Berechnung des Pearson-Korrelationskoeffizienten
 */
function calculateCorrelation(x, y) {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) {
    return 0;
  }
  
  // Mittelwerte berechnen
  const xMean = x.reduce((sum, val) => sum + val, 0) / x.length;
  const yMean = y.reduce((sum, val) => sum + val, 0) / y.length;
  
  // Summen für Korrelationsberechnung
  let sumXY = 0;
  let sumXSquared = 0;
  let sumYSquared = 0;
  
  for (let i = 0; i < x.length; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    
    sumXY += xDiff * yDiff;
    sumXSquared += xDiff * xDiff;
    sumYSquared += yDiff * yDiff;
  }
  
  // Korrelation berechnen
  if (sumXSquared === 0 || sumYSquared === 0) {
    return 0;
  }
  
  return sumXY / Math.sqrt(sumXSquared * sumYSquared);
}

export default router;
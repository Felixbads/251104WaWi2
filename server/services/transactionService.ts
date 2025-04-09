import { db, rawDb } from "../db";
import { transactions, dataCoverage, insertDataCoverageSchema } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { format, sub, eachMonthOfInterval } from "date-fns";

/**
 * Service für Transaktionsdaten und deren Abdeckung
 */
export class TransactionService {
  /**
   * Aktualisiert die Datenabdeckung für Transaktionen
   */
  async updateTransactionDataCoverage(): Promise<any> {
    try {
      // Abrufen des Bereichs der vorhandenen Transaktionen
      const range = await db
        .select({
          minDate: sql<string>`min(datetime)`,
          maxDate: sql<string>`max(datetime)`,
          count: sql<number>`count(*)`
        })
        .from(transactions);
      
      if (range.length === 0 || !range[0].minDate || !range[0].maxDate) {
        console.log("Keine Transaktionsdaten gefunden für die Abdeckungsberechnung");
        return {
          coverage: 0,
          firstDate: null,
          lastDate: null,
          count: 0
        };
      }
      
      // Berechnung der Datenabdeckung
      const firstDate = new Date(range[0].minDate);
      const lastDate = new Date(range[0].maxDate);
      const count = range[0].count;
      
      console.log(`Transaktionen gefunden: ${count} im Zeitraum ${format(firstDate, 'yyyy-MM-dd')} bis ${format(lastDate, 'yyyy-MM-dd')}`);
      
      // Berechnung der monatlichen Abdeckung
      const monthlyData = await this.calculateMonthlyTransactionCoverage(firstDate, lastDate);
      
      // Berechnen der durchschnittlichen Abdeckung über alle Monate
      const monthCount = monthlyData.length;
      const completeness = monthlyData.reduce((acc, curr) => acc + curr.completeness, 0) / Math.max(1, monthCount);
      
      // Berechnung der Gesamtabdeckung (0-100%)
      const coverage = Math.min(100, Math.round(completeness));
      
      // Prüfen, ob bereits ein Datensatz für Transaktionsabdeckung existiert
      const existingCoverage = await db.query.dataCoverage.findFirst({
        where: eq(dataCoverage.data_type, "transaction")
      });
      
      // Datenbankoperationen je nach Existenz des Datensatzes
      if (existingCoverage) {
        await db.update(dataCoverage)
          .set({
            earliest_date: format(firstDate, 'yyyy-MM-dd'),
            latest_date: format(lastDate, 'yyyy-MM-dd'),
            data_points: count,
            data_quality: coverage,
            coverage_percentage: coverage,
            last_sync: new Date()
          })
          .where(eq(dataCoverage.data_type, "transaction"));
      } else {
        const coverageData = insertDataCoverageSchema.parse({
          data_type: "transaction",
          earliest_date: format(firstDate, 'yyyy-MM-dd'),
          latest_date: format(lastDate, 'yyyy-MM-dd'),
          data_points: count,
          data_quality: coverage,
          coverage_percentage: coverage,
          last_sync: new Date()
        });

        await db.insert(dataCoverage).values(coverageData);
      }

      console.log(`Transaktionsabdeckung aktualisiert: ${format(firstDate, 'yyyy-MM-dd')} bis ${format(lastDate, 'yyyy-MM-dd')}, ${count} Datenpunkte, ${coverage}% Abdeckung`);
      
      return {
        coverage,
        firstDate: format(firstDate, 'yyyy-MM-dd'),
        lastDate: format(lastDate, 'yyyy-MM-dd'),
        count,
        monthlyData
      };
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Transaktionsdatenabdeckung:', error);
      throw error;
    }
  }
  
  /**
   * Berechnet die monatliche Transaktionsabdeckung
   * 
   * @param startDate Startdatum
   * @param endDate Enddatum
   * @returns Array mit monatlichen Abdeckungsdaten
   */
  async calculateMonthlyTransactionCoverage(startDate: Date, endDate: Date) {
    // Alle Monate im Datumsbereich
    const months = eachMonthOfInterval({
      start: startDate,
      end: endDate
    });
    
    const result = [];
    
    for (const month of months) {
      const yearMonth = format(month, 'yyyy-MM');
      const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const endOfMonth = new Date(nextMonth.getTime() - 1); // Letzter Tag des Monats
      
      // Anzahl der Transaktionen im Monat
      const [countResult] = await db
        .select({
          count: sql<number>`count(*)`
        })
        .from(transactions)
        .where(
          sql`datetime >= ${startOfMonth.toISOString()} AND datetime <= ${endOfMonth.toISOString()}`
        );
      
      const transactionCount = countResult?.count || 0;
      
      // Berechne die Vollständigkeit der Daten für diesen Monat
      // Hier können wir verschiedene Heuristiken anwenden:
      // 1. Basierend auf der Anzahl der Tage mit Transaktionen
      // 2. Basierend auf der Gesamtzahl der Transaktionen verglichen mit dem Durchschnitt
      
      // Vereinfachte Implementierung: Wenn Transaktionen vorhanden sind, setzen wir die Vollständigkeit auf 100%
      const completeness = transactionCount > 0 ? 100 : 0;
      
      result.push({
        month: yearMonth,
        startDate: startOfMonth,
        endDate: endOfMonth,
        transactionCount,
        completeness
      });
    }
    
    return result;
  }
  
  /**
   * Holt monatliche Transaktionsdaten für die Visualisierung
   * 
   * @param startDate Startdatum (optional)
   * @param endDate Enddatum (optional)
   * @returns Monatliche Transaktionsdaten
   */
  async getMonthlyTransactionData(startDate?: Date, endDate?: Date) {
    // Wenn keine Daten angegeben sind, verwenden wir einen sinnvollen Standardbereich
    const defaultStartDate = startDate || sub(new Date(), { years: 2 }); // 2 Jahre zurück
    const defaultEndDate = endDate || new Date(); // Heute
    
    console.log(`Abfrage monatlicher Transaktionsdaten von ${format(defaultStartDate, 'yyyy-MM-dd')} bis ${format(defaultEndDate, 'yyyy-MM-dd')}`);
    
    // Optimierte Abfrage für alle Monate in einem einzigen SQL-Statement
    // Gruppiere die Transaktionen nach Jahr und Monat und zähle sie
    const monthlyTransactions = await db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM datetime)::integer`,
        month: sql<number>`EXTRACT(MONTH FROM datetime)::integer`,
        count: sql<number>`COUNT(*)`
      })
      .from(transactions)
      .where(
        sql`datetime >= ${defaultStartDate.toISOString()} AND datetime <= ${defaultEndDate.toISOString()}`
      )
      .groupBy(sql`EXTRACT(YEAR FROM datetime)`, sql`EXTRACT(MONTH FROM datetime)`)
      .orderBy(sql`EXTRACT(YEAR FROM datetime)`, sql`EXTRACT(MONTH FROM datetime)`);
    
    console.log(`Gefundene Monatsdaten: ${monthlyTransactions.length} Monate mit Transaktionen`);
    
    // Alle Monate im Datumsbereich
    const months = eachMonthOfInterval({
      start: defaultStartDate,
      end: defaultEndDate
    });
    
    // Erzeuge für jeden Monat im Bereich einen Eintrag
    const result = months.map(month => {
      const year = month.getFullYear();
      const monthNum = month.getMonth() + 1; // JavaScript Monate sind 0-basiert
      
      // Suche nach Daten für diesen Monat
      const monthData = monthlyTransactions.find(
        data => data.year === year && data.month === monthNum
      );
      
      return {
        month: format(month, 'yyyy-MM'),
        monthDate: month,
        transactionCount: monthData?.count || 0
      };
    });
    
    return result;
  }
}

// Singleton-Export
export const transactionService = new TransactionService();
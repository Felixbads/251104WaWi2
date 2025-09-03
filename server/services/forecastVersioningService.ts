/**
 * Forecast Versioning Service
 * 
 * Implementiert die Versionierung von Wetterprognosen (Phase 2 Verbesserung).
 * Bei erneutem Abruf für denselben Timestamp wird die Revision hochgezählt,
 * statt den alten Datensatz zu überschreiben.
 * 
 * Dies ermöglicht historische Nachvollziehbarkeit von Forecast-Snapshots.
 */

import { db } from '../db';
import { sql, eq, and, desc, max } from 'drizzle-orm';
import { weatherForecasts, InsertWeatherForecast } from '@shared/schema';

interface ForecastWithRevision extends Omit<InsertWeatherForecast, 'revision'> {
  revision?: number;
}

/**
 * Speichert eine neue Wetterprognose mit automatischer Revisions-Verwaltung
 * 
 * @param forecast - Forecast-Daten (ohne revision)
 * @returns Erfolgreich gespeicherte Revision-Nummer
 */
export async function saveVersionedForecast(forecast: ForecastWithRevision): Promise<number> {
  try {
    // Hole die aktuelle höchste Revision für diesen Zeitpunkt und Typ
    const existingRevisions = await db
      .select({
        maxRevision: max(weatherForecasts.revision)
      })
      .from(weatherForecasts)
      .where(
        and(
          eq(weatherForecasts.date, forecast.date),
          eq(weatherForecasts.hour, forecast.hour),
          eq(weatherForecasts.type, forecast.type)
        )
      );

    // Bestimme die nächste Revision-Nummer
    const currentMaxRevision = existingRevisions[0]?.maxRevision ?? 0;
    const nextRevision = currentMaxRevision + 1;

    console.log(`📦 Speichere Forecast ${forecast.date} ${forecast.hour} ${forecast.type} als Revision ${nextRevision}`);

    // Speichere mit neuer Revision
    const insertData: InsertWeatherForecast = {
      ...forecast,
      revision: nextRevision
    };

    await db.insert(weatherForecasts).values(insertData);

    console.log(`✅ Forecast Revision ${nextRevision} erfolgreich gespeichert`);
    return nextRevision;

  } catch (error) {
    console.error('❌ Fehler beim Speichern der versionierten Forecast:', error);
    throw error;
  }
}

/**
 * Holt die neueste Revision für einen bestimmten Zeitpunkt
 * 
 * @param date - Datum
 * @param hour - Stunde
 * @param type - Forecast-Typ
 * @returns Neueste Forecast-Revision oder null
 */
export async function getLatestForecastRevision(
  date: string, 
  hour: string, 
  type: string
): Promise<any | null> {
  try {
    const latest = await db
      .select()
      .from(weatherForecasts)
      .where(
        and(
          eq(weatherForecasts.date, date),
          eq(weatherForecasts.hour, hour),
          eq(weatherForecasts.type, type)
        )
      )
      .orderBy(desc(weatherForecasts.revision))
      .limit(1);

    return latest[0] || null;

  } catch (error) {
    console.error('❌ Fehler beim Abrufen der neuesten Forecast-Revision:', error);
    return null;
  }
}

/**
 * Holt alle Revisionen für einen bestimmten Zeitpunkt
 * 
 * @param date - Datum
 * @param hour - Stunde  
 * @param type - Forecast-Typ
 * @returns Array aller Revisionen, sortiert nach Revision (neueste zuerst)
 */
export async function getAllForecastRevisions(
  date: string,
  hour: string,
  type: string
): Promise<any[]> {
  try {
    const allRevisions = await db
      .select()
      .from(weatherForecasts)
      .where(
        and(
          eq(weatherForecasts.date, date),
          eq(weatherForecasts.hour, hour),
          eq(weatherForecasts.type, type)
        )
      )
      .orderBy(desc(weatherForecasts.revision));

    return allRevisions;

  } catch (error) {
    console.error('❌ Fehler beim Abrufen aller Forecast-Revisionen:', error);
    return [];
  }
}

/**
 * Bereinigt alte Forecast-Revisionen (behält nur die letzten N)
 * 
 * @param date - Datum
 * @param hour - Stunde
 * @param type - Forecast-Typ
 * @param keepRevisions - Anzahl der zu behaltenden Revisionen (Standard: 5)
 * @returns Anzahl der gelöschten Revisionen
 */
export async function cleanupOldRevisions(
  date: string,
  hour: string,
  type: string,
  keepRevisions: number = 5
): Promise<number> {
  try {
    // Hole alle Revisionen, sortiert nach Revision (neueste zuerst)
    const allRevisions = await getAllForecastRevisions(date, hour, type);

    if (allRevisions.length <= keepRevisions) {
      return 0; // Nichts zu löschen
    }

    // Bestimme zu löschende Revisionen (alles außer den neuesten N)
    const revisionsToDelete = allRevisions.slice(keepRevisions);

    if (revisionsToDelete.length === 0) {
      return 0;
    }

    console.log(`🧹 Bereinige ${revisionsToDelete.length} alte Forecast-Revisionen für ${date} ${hour} ${type}`);

    // Lösche alte Revisionen
    for (const revision of revisionsToDelete) {
      await db
        .delete(weatherForecasts)
        .where(eq(weatherForecasts.id, revision.id));
    }

    console.log(`✅ ${revisionsToDelete.length} alte Revisionen bereinigt`);
    return revisionsToDelete.length;

  } catch (error) {
    console.error('❌ Fehler beim Bereinigen alter Forecast-Revisionen:', error);
    return 0;
  }
}

/**
 * Batch-Bereinigung alter Revisionen für alle Forecasts
 * Wird täglich ausgeführt um Speicherplatz zu sparen
 * 
 * @param keepRevisions - Anzahl der zu behaltenden Revisionen pro Forecast
 * @returns Statistik über bereinigte Revisionen
 */
export async function batchCleanupOldRevisions(keepRevisions: number = 3): Promise<{
  totalCleaned: number;
  forecastsProcessed: number;
  errors: number;
}> {
  console.log(`🧹 Starte Batch-Bereinigung alter Forecast-Revisionen (behalte ${keepRevisions} pro Forecast)...`);

  const stats = {
    totalCleaned: 0,
    forecastsProcessed: 0,
    errors: 0
  };

  try {
    // Hole alle einzigartigen Forecast-Kombinationen (date, hour, type)
    const uniqueForecasts = await db
      .selectDistinct({
        date: weatherForecasts.date,
        hour: weatherForecasts.hour,
        type: weatherForecasts.type
      })
      .from(weatherForecasts);

    console.log(`📊 Gefunden: ${uniqueForecasts.length} eindeutige Forecast-Kombinationen`);

    // Verarbeite jede Kombination
    for (const forecast of uniqueForecasts) {
      try {
        const cleaned = await cleanupOldRevisions(
          forecast.date,
          forecast.hour,
          forecast.type,
          keepRevisions
        );

        stats.totalCleaned += cleaned;
        stats.forecastsProcessed++;

      } catch (error) {
        console.error(`❌ Fehler bei Bereinigung für ${forecast.date} ${forecast.hour} ${forecast.type}:`, error);
        stats.errors++;
      }
    }

    console.log(`✅ Batch-Bereinigung abgeschlossen: ${stats.totalCleaned} Revisionen gelöscht, ${stats.forecastsProcessed} Forecasts verarbeitet, ${stats.errors} Fehler`);

  } catch (error) {
    console.error('❌ Fehler bei Batch-Bereinigung:', error);
    stats.errors++;
  }

  return stats;
}

/**
 * Analysiert Forecast-Revisionen-Statistiken
 * Nützlich für Monitoring und Dashboard-Anzeige
 */
export async function getForecastRevisionStats(): Promise<{
  totalForecasts: number;
  totalRevisions: number;
  averageRevisionsPerForecast: number;
  maxRevisions: number;
  forecastsWithMultipleRevisions: number;
}> {
  try {
    // Gesamtanzahl Revisionen
    const totalRevisionsResult = await db
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(weatherForecasts);

    // Eindeutige Forecasts
    const uniqueForecastsResult = await db
      .selectDistinct({
        count: sql<number>`COUNT(DISTINCT CONCAT(${weatherForecasts.date}, '-', ${weatherForecasts.hour}, '-', ${weatherForecasts.type}))`
      })
      .from(weatherForecasts);

    // Höchste Revision
    const maxRevisionResult = await db
      .select({
        maxRev: max(weatherForecasts.revision)
      })
      .from(weatherForecasts);

    // Forecasts mit mehreren Revisionen
    const multipleRevisionsResult = await db
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(
        db
          .select({
            cnt: sql<number>`COUNT(*)`
          })
          .from(weatherForecasts)
          .groupBy(weatherForecasts.date, weatherForecasts.hour, weatherForecasts.type)
          .having(sql`COUNT(*) > 1`)
          .as('multi_rev')
      );

    const totalRevisions = totalRevisionsResult[0]?.count ?? 0;
    const totalForecasts = uniqueForecastsResult[0]?.count ?? 0;
    const maxRevisions = maxRevisionResult[0]?.maxRev ?? 0;
    const forecastsWithMultipleRevisions = multipleRevisionsResult[0]?.count ?? 0;

    const averageRevisionsPerForecast = totalForecasts > 0 
      ? Math.round((totalRevisions / totalForecasts) * 100) / 100
      : 0;

    return {
      totalForecasts,
      totalRevisions,
      averageRevisionsPerForecast,
      maxRevisions,
      forecastsWithMultipleRevisions
    };

  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Revision-Statistiken:', error);
    return {
      totalForecasts: 0,
      totalRevisions: 0,
      averageRevisionsPerForecast: 0,
      maxRevisions: 0,
      forecastsWithMultipleRevisions: 0
    };
  }
}
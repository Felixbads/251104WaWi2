/**
 * MHD-Optimierter Prognose-Service
 * Berechnet Befüllungsempfehlungen basierend auf Mindesthaltbarkeitsdatum und Verderbrisko
 */

import { db } from "../db";
import { 
  refillRecommendations, 
  products, 
  machines, 
  transactions, 
  inventoryBatches,
  machineStocks 
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql, avg } from "drizzle-orm";
import { format, addDays, startOfWeek, getWeek, getYear, subDays, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import * as openWeatherService from "./openWeatherService";
import { holidayService } from "./holidayService";

export interface MHDForecastParams {
  machineId: number;
  productId?: number;
  weekNumber?: number;
  year?: number;
  daysAhead?: number;
}

export interface ExpiryRiskAnalysis {
  productId: number;
  machineId: number;
  currentStock: number;
  daysUntilExpiry: number;
  avgDailySales: number;
  expiryRiskFactor: number;
  stockoutProbability: number;
  priorityScore: number;
  riskCategory: 'critical' | 'high' | 'medium' | 'low';
}

export interface WeeklyRecommendation {
  machineId: number;
  productId: number;
  weekNumber: number;
  year: number;
  recommendedQuantity: number;
  priorityScore: number;
  forecastBasis: {
    historical: number;
    weather: number;
    seasonal: number;
    holiday: number;
  };
  expiryRiskFactor: number;
  stockoutProbability: number;
  weatherImpact: number;
  seasonalFactor: number;
  holidayImpact: number;
  historicalAvgSales: number;
  currentStock: number;
  daysUntilExpiry: number;
  confidence: number;
}

/**
 * Berechnet Verderbrisiko-Score für ein Produkt in einem Automaten
 */
export async function calculateExpiryRisk(
  machineId: number,
  productId: number
): Promise<ExpiryRiskAnalysis> {
  console.log(`[MHD-FORECAST] Berechne Verderbrisiko für Maschine ${machineId}, Produkt ${productId}`);

  // 1. Aktuellen Bestand und MHD ermitteln
  const currentInventory = await db
    .select({
      quantity: machineStocks.currentQuantity,
      maxQuantity: machineStocks.maxQuantity,
    })
    .from(machineStocks)
    .where(
      and(
        eq(machineStocks.machineId, machineId),
        sql`${machineStocks.productName} = (SELECT product_name FROM products WHERE id = ${productId} LIMIT 1)`
      )
    );

  const currentStock = currentInventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
  
  // MHD aus Produktdaten ermitteln (vereinfacht)
  const productData = await db
    .select({ shelfLifeDays: products.shelfLifeDays })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const daysUntilExpiry = productData[0]?.shelfLifeDays || 365; // Default wenn kein MHD bekannt

  // 2. Durchschnittlichen täglichen Absatz berechnen (letzte 14 Tage)
  const twoWeeksAgo = subDays(new Date(), 14);
  const salesData = await db
    .select({
      totalQuantity: sql<number>`COALESCE(SUM(${transactions.quantity}), 0)`,
      totalDays: sql<number>`COALESCE(COUNT(DISTINCT DATE(${transactions.datetime})), 1)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.machineId, machineId),
        sql`${transactions.productName} = (SELECT product_name FROM products WHERE id = ${productId} LIMIT 1)`,
        gte(transactions.datetime, twoWeeksAgo)
      )
    );

  const avgDailySales = salesData[0] 
    ? (salesData[0].totalQuantity / salesData[0].totalDays) || 0.1 // Minimum 0.1 um Division durch 0 zu vermeiden
    : 0.1;

  // 3. Risiko-Faktoren berechnen
  const expiryRiskFactor = Math.max(0, Math.min(1, 
    (daysUntilExpiry - (currentStock / avgDailySales)) / Math.max(daysUntilExpiry, 1)
  ));

  const stockoutProbability = Math.max(0, Math.min(1,
    (avgDailySales * 3) / Math.max(currentStock, 0.1) // 3 Tage Vorlauf
  ));

  // 4. Priority Score: Höher = dringender (Kombination aus MHD-Risiko und Ausverkaufs-Risiko)
  const priorityScore = (expiryRiskFactor * 0.6) + (stockoutProbability * 0.4);

  // 5. Risiko-Kategorie bestimmen
  let riskCategory: 'critical' | 'high' | 'medium' | 'low';
  if (priorityScore >= 0.8 || daysUntilExpiry <= 2) riskCategory = 'critical';
  else if (priorityScore >= 0.6 || daysUntilExpiry <= 5) riskCategory = 'high';
  else if (priorityScore >= 0.4 || daysUntilExpiry <= 10) riskCategory = 'medium';
  else riskCategory = 'low';

  console.log(`[MHD-FORECAST] Risiko-Analyse: ${riskCategory}, Score: ${priorityScore.toFixed(3)}, MHD in ${daysUntilExpiry} Tagen`);

  return {
    productId,
    machineId,
    currentStock,
    daysUntilExpiry,
    avgDailySales,
    expiryRiskFactor,
    stockoutProbability,
    priorityScore,
    riskCategory,
  };
}

/**
 * Berechnet externe Einflussfaktoren (Wetter, Feiertage, Saison)
 */
async function calculateExternalFactors(
  machineId: number,
  productId: number,
  targetDate: Date
): Promise<{
  weatherImpact: number;
  seasonalFactor: number;
  holidayImpact: number;
}> {
  console.log(`[MHD-FORECAST] Berechne externe Faktoren für ${format(targetDate, 'yyyy-MM-dd')}`);

  // 1. Wetter-Einfluss (vereinfacht)
  let weatherImpact = 0;
  try {
    // Hole Maschinen-Standort für Wetter-Daten
    const machine = await db
      .select({ locationName: machines.locationName })
      .from(machines)
      .where(eq(machines.id, machineId))
      .limit(1);

    if (machine[0]?.locationName) {
      // Vereinfachte Wetter-Logik basierend auf Saison
      const month = targetDate.getMonth() + 1;
      if (month >= 6 && month <= 8) {
        weatherImpact = 0.1; // Sommer: +10% für Getränke
      } else if (month >= 12 || month <= 2) {
        weatherImpact = -0.05; // Winter: -5% für Getränke
      }
    }
  } catch (error) {
    console.warn(`[MHD-FORECAST] Wetter-Daten nicht verfügbar:`, error);
    weatherImpact = 0;
  }

  // 2. Saisonaler Faktor
  const month = targetDate.getMonth() + 1;
  let seasonalFactor = 1.0;
  
  // Vereinfachte saisonale Anpassungen
  if (month >= 6 && month <= 8) {
    seasonalFactor = 1.15; // Sommer: +15%
  } else if (month >= 11 || month <= 1) {
    seasonalFactor = 0.9; // Winter: -10%
  } else if (month >= 3 && month <= 5) {
    seasonalFactor = 1.05; // Frühling: +5%
  }

  // 3. Feiertags-Einfluss
  let holidayImpact = 0;
  try {
    const isHoliday = await holidayService.isHoliday(format(targetDate, 'yyyy-MM-dd'), 'SN');
    
    if (isHoliday) {
      holidayImpact = -0.3; // Feiertage: -30% Absatz
    }
    
    // Prüfe auch Wochenende
    const dayOfWeek = targetDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      holidayImpact = Math.min(holidayImpact, -0.15); // Wochenende: -15%
    }
  } catch (error) {
    console.warn(`[MHD-FORECAST] Feiertags-Daten nicht verfügbar:`, error);
    holidayImpact = 0;
  }

  return {
    weatherImpact,
    seasonalFactor,
    holidayImpact,
  };
}

/**
 * Generiert MHD-optimierte Befüllungsempfehlung für eine Woche
 */
export async function generateWeeklyRecommendation(
  params: MHDForecastParams
): Promise<WeeklyRecommendation> {
  const {
    machineId,
    productId,
    weekNumber = getWeek(new Date(), { locale: de }),
    year = getYear(new Date()),
    daysAhead = 7
  } = params;

  if (!productId) {
    throw new Error("ProductId ist erforderlich für MHD-Empfehlungen");
  }

  console.log(`[MHD-FORECAST] Generiere Empfehlung für KW ${weekNumber}/${year}, Maschine ${machineId}, Produkt ${productId}`);

  // 1. Aktuelle Risiko-Analyse
  const riskAnalysis = await calculateExpiryRisk(machineId, productId);

  // 2. Historische Verkaufsdaten für Baseline (letzte 4 Wochen)
  const fourWeeksAgo = subDays(new Date(), 28);
  const historicalData = await db
    .select({
      avgDailySales: sql<number>`COALESCE(AVG(daily_sales), 0)`,
    })
    .from(
      db.$with('daily_sales').as(
        db
          .select({
            date: sql<string>`DATE(${transactions.datetime})`,
            daily_sales: sql<number>`SUM(${transactions.quantity})`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.machineId, machineId),
              sql`${transactions.productName} = (SELECT product_name FROM products WHERE id = ${productId} LIMIT 1)`,
              gte(transactions.datetime, fourWeeksAgo)
            )
          )
          .groupBy(sql`DATE(${transactions.datetime})`)
      )
    );

  const historicalAvgSales = historicalData[0]?.avgDailySales || riskAnalysis.avgDailySales;

  // 3. Externe Faktoren für Zielwoche
  const weekStart = startOfWeek(new Date(year, 0, 1 + (weekNumber - 1) * 7), { locale: de });
  const externalFactors = await calculateExternalFactors(machineId, productId, weekStart);

  // 4. Berechne empfohlene Menge
  const baseDemand = historicalAvgSales * daysAhead;
  
  // Anpassung basierend auf externen Faktoren
  const adjustedDemand = baseDemand * 
    (1 + externalFactors.weatherImpact) * 
    externalFactors.seasonalFactor * 
    (1 + externalFactors.holidayImpact);

  // MHD-Korrektur: Reduziere Menge wenn hohe Verderbgefahr
  const mhdAdjustment = Math.max(0.3, 1 - (riskAnalysis.expiryRiskFactor * 0.5));
  
  const recommendedQuantity = Math.max(1, Math.round(adjustedDemand * mhdAdjustment));

  // 5. Konfidenz berechnen (basierend auf Datenverfügbarkeit)
  const confidence = Math.min(1, 
    0.3 + // Basis-Konfidenz
    (historicalData[0]?.avgDailySales > 0 ? 0.4 : 0) + // Historische Daten verfügbar
    (riskAnalysis.currentStock > 0 ? 0.2 : 0) + // Aktueller Bestand bekannt
    (riskAnalysis.daysUntilExpiry < 365 ? 0.1 : 0) // MHD bekannt
  );

  return {
    machineId,
    productId,
    weekNumber,
    year,
    recommendedQuantity,
    priorityScore: riskAnalysis.priorityScore,
    forecastBasis: {
      historical: 0.7,
      weather: 0.15,
      seasonal: 0.1,
      holiday: 0.05,
    },
    expiryRiskFactor: riskAnalysis.expiryRiskFactor,
    stockoutProbability: riskAnalysis.stockoutProbability,
    weatherImpact: externalFactors.weatherImpact,
    seasonalFactor: externalFactors.seasonalFactor,
    holidayImpact: externalFactors.holidayImpact,
    historicalAvgSales,
    currentStock: riskAnalysis.currentStock,
    daysUntilExpiry: riskAnalysis.daysUntilExpiry,
    confidence,
  };
}

/**
 * Speichert Empfehlung in der Datenbank
 */
export async function saveRecommendation(
  recommendation: WeeklyRecommendation,
  notes?: string
): Promise<number> {
  console.log(`[MHD-FORECAST] Speichere Empfehlung für Maschine ${recommendation.machineId}, Produkt ${recommendation.productId}`);

  const [saved] = await db
    .insert(refillRecommendations)
    .values({
      machineId: recommendation.machineId,
      productId: recommendation.productId,
      weekNumber: recommendation.weekNumber,
      year: recommendation.year,
      recommendedQuantity: recommendation.recommendedQuantity,
      priorityScore: recommendation.priorityScore,
      forecastBasis: JSON.stringify(recommendation.forecastBasis),
      expiryRiskFactor: recommendation.expiryRiskFactor,
      stockoutProbability: recommendation.stockoutProbability,
      weatherImpact: recommendation.weatherImpact,
      seasonalFactor: recommendation.seasonalFactor,
      holidayImpact: recommendation.holidayImpact,
      historicalAvgSales: recommendation.historicalAvgSales,
      currentStock: recommendation.currentStock,
      daysUntilExpiry: recommendation.daysUntilExpiry,
      confidence: recommendation.confidence,
      notes,
    })
    .returning({ id: refillRecommendations.id });

  return saved.id;
}

/**
 * Holt alle kritischen MHD-Produkte für Dashboard
 */
export async function getCriticalMHDProducts(): Promise<ExpiryRiskAnalysis[]> {
  console.log(`[MHD-FORECAST] Hole kritische MHD-Produkte für Dashboard`);

  // Alle aktiven Maschinen
  const activeMachines = await db
    .select({ id: machines.id })
    .from(machines)
    .where(eq(machines.status, "active"));

  // Alle Produkte mit kurzem MHD
  const shortShelfLifeProducts = await db
    .select({ 
      id: products.id,
      shelfLifeDays: products.shelfLifeDays 
    })
    .from(products)
    .where(lte(products.shelfLifeDays, 14)); // Kritisch: <= 14 Tage MHD

  const criticalProducts: ExpiryRiskAnalysis[] = [];

  // Analysiere jede Kombination
  for (const machine of activeMachines) {
    for (const product of shortShelfLifeProducts) {
      try {
        const analysis = await calculateExpiryRisk(machine.id, product.id);
        if (analysis.riskCategory === 'critical' || analysis.riskCategory === 'high') {
          criticalProducts.push(analysis);
        }
      } catch (error) {
        console.warn(`[MHD-FORECAST] Fehler bei Analyse M${machine.id}/P${product.id}:`, error);
      }
    }
  }

  // Sortiere nach Priority Score (höchstes Risiko zuerst)
  return criticalProducts.sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Batch-Generierung von Empfehlungen für alle kritischen Produkte
 */
export async function generateBatchRecommendations(
  weekNumber?: number,
  year?: number
): Promise<{ created: number; skipped: number; errors: number }> {
  const targetWeek = weekNumber || getWeek(new Date(), { locale: de });
  const targetYear = year || getYear(new Date());

  console.log(`[MHD-FORECAST] Batch-Generierung für KW ${targetWeek}/${targetYear}`);

  const criticalProducts = await getCriticalMHDProducts();
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of criticalProducts) {
    try {
      // Prüfe ob bereits Empfehlung existiert
      const existing = await db
        .select({ id: refillRecommendations.id })
        .from(refillRecommendations)
        .where(
          and(
            eq(refillRecommendations.machineId, product.machineId),
            eq(refillRecommendations.productId, product.productId),
            eq(refillRecommendations.weekNumber, targetWeek),
            eq(refillRecommendations.year, targetYear)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Generiere neue Empfehlung
      const recommendation = await generateWeeklyRecommendation({
        machineId: product.machineId,
        productId: product.productId,
        weekNumber: targetWeek,
        year: targetYear,
      });

      await saveRecommendation(
        recommendation, 
        `Auto-generiert für ${product.riskCategory} MHD-Risiko`
      );

      created++;
    } catch (error) {
      console.error(`[MHD-FORECAST] Fehler bei Empfehlung M${product.machineId}/P${product.productId}:`, error);
      errors++;
    }
  }

  console.log(`[MHD-FORECAST] Batch-Ergebnis: ${created} erstellt, ${skipped} übersprungen, ${errors} Fehler`);
  return { created, skipped, errors };
}
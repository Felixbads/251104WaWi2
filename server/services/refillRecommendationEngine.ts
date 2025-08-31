/**
 * Empfehlungs-Engine für MHD-optimierte Befüllungen
 * Koordiniert die Erstellung und Verwaltung von Befüllungsempfehlungen
 */

import { db } from "../db";
import { 
  refillRecommendations, 
  products, 
  machines, 
  suppliers,
  users 
} from "@shared/schema";
import { eq, and, gte, lte, desc, asc, inArray, sql } from "drizzle-orm";
import { format, addDays, startOfWeek, getWeek, getYear } from "date-fns";
import { de } from "date-fns/locale";
import * as mhdForecast from "./mhdOptimizedForecast";

export interface RecommendationFilter {
  machineIds?: number[];
  productIds?: number[];
  supplierIds?: number[];
  status?: string[];
  weekNumber?: number;
  year?: number;
  priorityThreshold?: number;
  riskCategory?: 'critical' | 'high' | 'medium' | 'low';
}

export interface GroupedRecommendations {
  bySupplier: SupplierRecommendations[];
  byMachine: MachineRecommendations[];
  summary: RecommendationSummary;
}

export interface SupplierRecommendations {
  supplierId: number;
  supplierName: string;
  totalProducts: number;
  totalQuantity: number;
  averagePriority: number;
  recommendations: RecommendationWithDetails[];
}

export interface MachineRecommendations {
  machineId: number;
  machineName: string;
  totalProducts: number;
  totalQuantity: number;
  criticalCount: number;
  recommendations: RecommendationWithDetails[];
}

export interface RecommendationWithDetails {
  id: number;
  machineId: number;
  machineName: string;
  productId: number;
  productName: string;
  supplierName?: string;
  weekNumber: number;
  year: number;
  recommendedQuantity: number;
  priorityScore: number;
  expiryRiskFactor: number;
  stockoutProbability: number;
  currentStock: number;
  daysUntilExpiry: number;
  confidence: number;
  status: string;
  notes?: string;
  createdAt: Date;
  riskCategory: 'critical' | 'high' | 'medium' | 'low';
  forecastBasis?: {
    historical: number;
    weather: number;
    seasonal: number;
    holiday: number;
  };
}

export interface RecommendationSummary {
  totalRecommendations: number;
  criticalCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  totalQuantity: number;
  averageConfidence: number;
  pendingCount: number;
  approvedCount: number;
}

/**
 * Holt Empfehlungen mit Filteroptionen
 */
export async function getRecommendations(
  filter: RecommendationFilter = {}
): Promise<RecommendationWithDetails[]> {
  console.log(`[RECOMMENDATION-ENGINE] Hole Empfehlungen mit Filter:`, filter);

  const conditions = [];

  if (filter.machineIds?.length) {
    conditions.push(inArray(refillRecommendations.machineId, filter.machineIds));
  }

  if (filter.productIds?.length) {
    conditions.push(inArray(refillRecommendations.productId, filter.productIds));
  }

  if (filter.status?.length) {
    conditions.push(inArray(refillRecommendations.status, filter.status));
  }

  if (filter.weekNumber) {
    conditions.push(eq(refillRecommendations.weekNumber, filter.weekNumber));
  }

  if (filter.year) {
    conditions.push(eq(refillRecommendations.year, filter.year));
  }

  if (filter.priorityThreshold) {
    conditions.push(gte(refillRecommendations.priorityScore, filter.priorityThreshold));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: refillRecommendations.id,
      machineId: refillRecommendations.machineId,
      machineName: machines.machineName,
      productId: refillRecommendations.productId,
      productName: products.productName,
      supplierName: suppliers.name,
      weekNumber: refillRecommendations.weekNumber,
      year: refillRecommendations.year,
      recommendedQuantity: refillRecommendations.recommendedQuantity,
      priorityScore: refillRecommendations.priorityScore,
      forecastBasis: refillRecommendations.forecastBasis,
      expiryRiskFactor: refillRecommendations.expiryRiskFactor,
      stockoutProbability: refillRecommendations.stockoutProbability,
      currentStock: refillRecommendations.currentStock,
      daysUntilExpiry: refillRecommendations.daysUntilExpiry,
      confidence: refillRecommendations.confidence,
      status: refillRecommendations.status,
      notes: refillRecommendations.notes,
      createdAt: refillRecommendations.createdAt,
    })
    .from(refillRecommendations)
    .leftJoin(machines, eq(refillRecommendations.machineId, machines.id))
    .leftJoin(products, eq(refillRecommendations.productId, products.id))
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(whereClause)
    .orderBy(desc(refillRecommendations.priorityScore), asc(refillRecommendations.daysUntilExpiry));

  return results.map(row => ({
    ...row,
    riskCategory: determineRiskCategory(row.priorityScore || 0, row.daysUntilExpiry || 365),
    forecastBasis: row.forecastBasis ? JSON.parse(row.forecastBasis) : undefined,
  }));
}

/**
 * Gruppiert Empfehlungen nach Lieferanten und Maschinen
 */
export async function getGroupedRecommendations(
  filter: RecommendationFilter = {}
): Promise<GroupedRecommendations> {
  console.log(`[RECOMMENDATION-ENGINE] Gruppiere Empfehlungen`);

  const recommendations = await getRecommendations(filter);

  // Gruppierung nach Lieferanten
  const supplierMap = new Map<number, SupplierRecommendations>();
  const machineMap = new Map<number, MachineRecommendations>();

  for (const rec of recommendations) {
    // Lieferanten-Gruppierung
    if (rec.supplierName) {
      const supplierId = rec.productId; // Vereinfacht - könnte verbessert werden
      if (!supplierMap.has(supplierId)) {
        supplierMap.set(supplierId, {
          supplierId,
          supplierName: rec.supplierName,
          totalProducts: 0,
          totalQuantity: 0,
          averagePriority: 0,
          recommendations: [],
        });
      }
      const supplier = supplierMap.get(supplierId)!;
      supplier.recommendations.push(rec);
      supplier.totalProducts++;
      supplier.totalQuantity += rec.recommendedQuantity;
    }

    // Maschinen-Gruppierung
    if (!machineMap.has(rec.machineId)) {
      machineMap.set(rec.machineId, {
        machineId: rec.machineId,
        machineName: rec.machineName || `Maschine ${rec.machineId}`,
        totalProducts: 0,
        totalQuantity: 0,
        criticalCount: 0,
        recommendations: [],
      });
    }
    const machine = machineMap.get(rec.machineId)!;
    machine.recommendations.push(rec);
    machine.totalProducts++;
    machine.totalQuantity += rec.recommendedQuantity;
    if (rec.riskCategory === 'critical') {
      machine.criticalCount++;
    }
  }

  // Durchschnittspriorität berechnen
  for (const supplier of supplierMap.values()) {
    supplier.averagePriority = supplier.recommendations.reduce((sum, rec) => 
      sum + (rec.priorityScore || 0), 0) / supplier.recommendations.length;
  }

  // Summary erstellen
  const summary: RecommendationSummary = {
    totalRecommendations: recommendations.length,
    criticalCount: recommendations.filter(r => r.riskCategory === 'critical').length,
    highRiskCount: recommendations.filter(r => r.riskCategory === 'high').length,
    mediumRiskCount: recommendations.filter(r => r.riskCategory === 'medium').length,
    lowRiskCount: recommendations.filter(r => r.riskCategory === 'low').length,
    totalQuantity: recommendations.reduce((sum, r) => sum + r.recommendedQuantity, 0),
    averageConfidence: recommendations.length > 0 
      ? recommendations.reduce((sum, r) => sum + (r.confidence || 0), 0) / recommendations.length 
      : 0,
    pendingCount: recommendations.filter(r => r.status === 'pending').length,
    approvedCount: recommendations.filter(r => r.status === 'approved').length,
  };

  return {
    bySupplier: Array.from(supplierMap.values()).sort((a, b) => b.averagePriority - a.averagePriority),
    byMachine: Array.from(machineMap.values()).sort((a, b) => b.criticalCount - a.criticalCount),
    summary,
  };
}

/**
 * Generiert Empfehlungen für eine spezifische Woche
 */
export async function generateWeeklyRecommendations(
  weekNumber?: number,
  year?: number,
  options: {
    onlyCritical?: boolean;
    machineIds?: number[];
    productIds?: number[];
  } = {}
): Promise<{ created: number; skipped: number; errors: number }> {
  const targetWeek = weekNumber || getWeek(new Date(), { locale: de });
  const targetYear = year || getYear(new Date());

  console.log(`[RECOMMENDATION-ENGINE] Generiere Empfehlungen für KW ${targetWeek}/${targetYear}`);

  if (options.onlyCritical) {
    // Nur kritische MHD-Produkte
    return await mhdForecast.generateBatchRecommendations(targetWeek, targetYear);
  }

  // Alle aktiven Maschinen
  let targetMachines = await db
    .select({ id: machines.id })
    .from(machines)
    .where(eq(machines.status, "active"));

  if (options.machineIds?.length) {
    targetMachines = targetMachines.filter(m => options.machineIds!.includes(m.id));
  }

  // Alle relevanten Produkte
  let targetProducts = await db
    .select({ 
      id: products.id,
      shelfLifeDays: products.shelfLifeDays 
    })
    .from(products);

  if (options.productIds?.length) {
    targetProducts = targetProducts.filter(p => options.productIds!.includes(p.id));
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const machine of targetMachines) {
    for (const product of targetProducts) {
      try {
        // Prüfe ob bereits Empfehlung existiert
        const existing = await db
          .select({ id: refillRecommendations.id })
          .from(refillRecommendations)
          .where(
            and(
              eq(refillRecommendations.machineId, machine.id),
              eq(refillRecommendations.productId, product.id),
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
        const recommendation = await mhdForecast.generateWeeklyRecommendation({
          machineId: machine.id,
          productId: product.id,
          weekNumber: targetWeek,
          year: targetYear,
        });

        // Speichere nur wenn empfohlene Menge > 0
        if (recommendation.recommendedQuantity > 0) {
          await mhdForecast.saveRecommendation(
            recommendation, 
            `Auto-generiert für KW ${targetWeek}/${targetYear}`
          );
          created++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`[RECOMMENDATION-ENGINE] Fehler bei M${machine.id}/P${product.id}:`, error);
        errors++;
      }
    }
  }

  console.log(`[RECOMMENDATION-ENGINE] Batch-Ergebnis: ${created} erstellt, ${skipped} übersprungen, ${errors} Fehler`);
  return { created, skipped, errors };
}

/**
 * Genehmigt eine Empfehlung
 */
export async function approveRecommendation(
  recommendationId: number,
  approvedBy: number,
  notes?: string
): Promise<boolean> {
  console.log(`[RECOMMENDATION-ENGINE] Genehmige Empfehlung ${recommendationId}`);

  const [updated] = await db
    .update(refillRecommendations)
    .set({
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
      notes: notes || undefined,
      updatedAt: new Date(),
    })
    .where(eq(refillRecommendations.id, recommendationId))
    .returning({ id: refillRecommendations.id });

  return !!updated;
}

/**
 * Batch-Genehmigung mehrerer Empfehlungen
 */
export async function batchApproveRecommendations(
  recommendationIds: number[],
  approvedBy: number,
  notes?: string
): Promise<{ approved: number; failed: number }> {
  console.log(`[RECOMMENDATION-ENGINE] Batch-Genehmigung für ${recommendationIds.length} Empfehlungen`);

  let approved = 0;
  let failed = 0;

  for (const id of recommendationIds) {
    try {
      const success = await approveRecommendation(id, approvedBy, notes);
      if (success) approved++;
      else failed++;
    } catch (error) {
      console.error(`[RECOMMENDATION-ENGINE] Fehler bei Genehmigung ${id}:`, error);
      failed++;
    }
  }

  return { approved, failed };
}

/**
 * Markiert Empfehlung als ausgeführt
 */
export async function markRecommendationExecuted(
  recommendationId: number,
  executedQuantity: number,
  notes?: string
): Promise<boolean> {
  console.log(`[RECOMMENDATION-ENGINE] Markiere Empfehlung ${recommendationId} als ausgeführt`);

  const [updated] = await db
    .update(refillRecommendations)
    .set({
      status: 'executed',
      executedAt: new Date(),
      notes: notes ? `${notes} | Ausgeführte Menge: ${executedQuantity}` : `Ausgeführte Menge: ${executedQuantity}`,
      updatedAt: new Date(),
    })
    .where(eq(refillRecommendations.id, recommendationId))
    .returning({ id: refillRecommendations.id });

  return !!updated;
}

/**
 * Erstellt Bestellliste basierend auf genehmigten Empfehlungen
 */
export async function createOrderList(
  weekNumber?: number,
  year?: number,
  supplierIds?: number[]
): Promise<SupplierRecommendations[]> {
  const targetWeek = weekNumber || getWeek(new Date(), { locale: de });
  const targetYear = year || getYear(new Date());

  console.log(`[RECOMMENDATION-ENGINE] Erstelle Bestellliste für KW ${targetWeek}/${targetYear}`);

  const filter: RecommendationFilter = {
    weekNumber: targetWeek,
    year: targetYear,
    status: ['approved'],
  };

  if (supplierIds?.length) {
    filter.supplierIds = supplierIds;
  }

  const grouped = await getGroupedRecommendations(filter);
  return grouped.bySupplier;
}

/**
 * Hilfsfunktion zur Bestimmung der Risiko-Kategorie
 */
function determineRiskCategory(
  priorityScore: number, 
  daysUntilExpiry: number
): 'critical' | 'high' | 'medium' | 'low' {
  if (priorityScore >= 0.8 || daysUntilExpiry <= 2) return 'critical';
  if (priorityScore >= 0.6 || daysUntilExpiry <= 5) return 'high';
  if (priorityScore >= 0.4 || daysUntilExpiry <= 10) return 'medium';
  return 'low';
}

/**
 * Holt Dashboard-Statistiken für MHD-Empfehlungen
 */
export async function getDashboardStats(): Promise<{
  criticalRecommendations: number;
  pendingApprovals: number;
  weeklyQuantity: number;
  averageConfidence: number;
  topRiskProducts: Array<{
    productName: string;
    machineName: string;
    daysUntilExpiry: number;
    priorityScore: number;
  }>;
}> {
  console.log(`[RECOMMENDATION-ENGINE] Hole Dashboard-Statistiken`);

  const currentWeek = getWeek(new Date(), { locale: de });
  const currentYear = getYear(new Date());

  // Aktuelle Woche Statistiken
  const weeklyStats = await db
    .select({
      criticalCount: sql<number>`COUNT(CASE WHEN ${refillRecommendations.priorityScore} >= 0.8 THEN 1 END)`,
      pendingCount: sql<number>`COUNT(CASE WHEN ${refillRecommendations.status} = 'pending' THEN 1 END)`,
      totalQuantity: sql<number>`COALESCE(SUM(${refillRecommendations.recommendedQuantity}), 0)`,
      avgConfidence: sql<number>`COALESCE(AVG(${refillRecommendations.confidence}), 0)`,
    })
    .from(refillRecommendations)
    .where(
      and(
        eq(refillRecommendations.weekNumber, currentWeek),
        eq(refillRecommendations.year, currentYear)
      )
    );

  // Top Risiko-Produkte
  const topRiskProducts = await db
    .select({
      productName: products.productName,
      machineName: machines.machineName,
      daysUntilExpiry: refillRecommendations.daysUntilExpiry,
      priorityScore: refillRecommendations.priorityScore,
    })
    .from(refillRecommendations)
    .leftJoin(products, eq(refillRecommendations.productId, products.id))
    .leftJoin(machines, eq(refillRecommendations.machineId, machines.id))
    .where(
      and(
        eq(refillRecommendations.weekNumber, currentWeek),
        eq(refillRecommendations.year, currentYear),
        gte(refillRecommendations.priorityScore, 0.6)
      )
    )
    .orderBy(desc(refillRecommendations.priorityScore))
    .limit(5);

  const stats = weeklyStats[0] || {
    criticalCount: 0,
    pendingCount: 0,
    totalQuantity: 0,
    avgConfidence: 0,
  };

  return {
    criticalRecommendations: Number(stats.criticalCount),
    pendingApprovals: Number(stats.pendingCount),
    weeklyQuantity: Number(stats.totalQuantity),
    averageConfidence: Number(stats.avgConfidence),
    topRiskProducts: topRiskProducts.map(p => ({
      productName: p.productName || 'Unbekannt',
      machineName: p.machineName || 'Unbekannt',
      daysUntilExpiry: p.daysUntilExpiry || 0,
      priorityScore: p.priorityScore || 0,
    })),
  };
}
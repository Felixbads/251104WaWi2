/**
 * MHD-optimierter Refill-Template Service
 * Erweitert bestehende Vendon-Synchronisation um MHD-basierte Anpassungen für kurzlebige Produkte
 */

import { db } from "../db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { 
  refillTemplates,
  refillTemplateProducts,
  products,
  machines,
  type RefillTemplate,
  type RefillTemplateProduct
} from "../../shared/schema";
import { RefillTemplateVendonService } from "./refillTemplateVendonService";
import * as mhdForecast from "./mhdOptimizedForecast";
import * as recommendationEngine from "./refillRecommendationEngine";
import { getWeek, getYear } from "date-fns";
import { de } from "date-fns/locale";

export interface MHDOptimizedTemplate {
  template: RefillTemplate;
  products: (RefillTemplateProduct & {
    originalQuantity: number;
    adjustedQuantity: number;
    mhdDays: number;
    riskCategory: 'critical' | 'high' | 'medium' | 'low';
    adjustmentReason: string;
  })[];
  summary: {
    totalProducts: number;
    adjustedProducts: number;
    criticalProducts: number;
    totalReduction: number;
    averageConfidence: number;
  };
}

export interface MHDProductCategory {
  productId: number;
  productName: string;
  shelfLifeDays: number;
  category: 'kurzlebig' | 'mittel' | 'langlebig';
  requiresAdjustment: boolean;
}

/**
 * Klassifiziert Produkte basierend auf MHD in Kategorien
 */
export async function categorizeProductsByMHD(): Promise<MHDProductCategory[]> {
  console.log('[MHD-REFILL] Kategorisiere Produkte nach MHD');

  const allProducts = await db
    .select({
      id: products.id,
      productName: products.productName,
      shelfLifeDays: products.shelfLifeDays,
      category: products.category,
    })
    .from(products)
    .where(eq(products.status, 'active'));

  return allProducts.map(product => {
    const mhdDays = product.shelfLifeDays || 365; // Default wenn MHD nicht bekannt
    
    let category: 'kurzlebig' | 'mittel' | 'langlebig';
    let requiresAdjustment = false;

    if (mhdDays <= 7) {
      category = 'kurzlebig';
      requiresAdjustment = true;
    } else if (mhdDays <= 30) {
      category = 'mittel';
      requiresAdjustment = true;
    } else {
      category = 'langlebig';
      requiresAdjustment = false;
    }

    // Spezielle Anpassung für Milch, Käse, Wurst etc.
    const productName = product.productName?.toLowerCase() || '';
    if (productName.includes('milch') || 
        productName.includes('käse') || 
        productName.includes('wurst') ||
        productName.includes('joghurt') ||
        productName.includes('sahne') ||
        productName.includes('butter') ||
        productName.includes('quark')) {
      category = 'kurzlebig';
      requiresAdjustment = true;
    }

    return {
      productId: product.id,
      productName: product.productName || `Produkt ${product.id}`,
      shelfLifeDays: mhdDays,
      category,
      requiresAdjustment,
    };
  });
}

/**
 * Importiert Template von Vendon und wendet MHD-Optimierungen an
 */
export async function importAndOptimizeFromVendon(
  machineId: number,
  vendonMachineId: string
): Promise<{ success: boolean; template?: MHDOptimizedTemplate; error?: string }> {
  try {
    console.log(`[MHD-REFILL] Importiere und optimiere Template von Vendon für Maschine ${machineId}`);

    // 1. Import von Vendon
    const importResult = await RefillTemplateVendonService.importTemplatesFromVendon(
      machineId,
      vendonMachineId
    );

    if (!importResult.success) {
      return { success: false, error: importResult.error };
    }

    // 2. Hole das neueste Template für diese Maschine
    const template = await db
      .select()
      .from(refillTemplates)
      .where(eq(refillTemplates.machineId, machineId))
      .orderBy(refillTemplates.createdAt)
      .limit(1);

    if (template.length === 0) {
      return { success: false, error: 'Kein Template nach Import gefunden' };
    }

    const templateData = template[0];

    // 3. Optimiere das Template
    const optimizedTemplate = await optimizeTemplateForMHD(templateData.id);

    if (!optimizedTemplate.success) {
      return { success: false, error: optimizedTemplate.error };
    }

    return { success: true, template: optimizedTemplate.template };

  } catch (error) {
    console.error('[MHD-REFILL] Fehler beim Import und Optimierung:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Optimiert ein bestehendes Template basierend auf MHD-Vorhersagen
 */
export async function optimizeTemplateForMHD(
  templateId: number
): Promise<{ success: boolean; template?: MHDOptimizedTemplate; error?: string }> {
  try {
    console.log(`[MHD-REFILL] Optimiere Template ${templateId} für MHD`);

    // Template und Produkte laden
    const template = await db
      .select()
      .from(refillTemplates)
      .where(eq(refillTemplates.id, templateId))
      .limit(1);

    if (template.length === 0) {
      return { success: false, error: 'Template nicht gefunden' };
    }

    const templateData = template[0];

    const templateProducts = await db
      .select()
      .from(refillTemplateProducts)
      .where(eq(refillTemplateProducts.templateId, templateId));

    // Produktkategorien laden
    const productCategories = await categorizeProductsByMHD();
    const categoryMap = new Map(productCategories.map(cat => [cat.productId, cat]));

    // Optimierte Produkte erstellen
    const optimizedProducts = [];
    let totalReduction = 0;
    let adjustedProducts = 0;
    let criticalProducts = 0;

    for (const product of templateProducts) {
      const originalQuantity = product.quantity;
      let adjustedQuantity = originalQuantity;
      let adjustmentReason = 'Keine Anpassung notwendig';
      let riskCategory: 'critical' | 'high' | 'medium' | 'low' = 'low';
      let mhdDays = 365;

      // Finde Produkt-ID durch Namensvergleich (falls nicht direkt verknüpft)
      let productId: number | undefined = product.productId || undefined;

      if (!productId) {
        // Suche Produkt-ID über Namen
        const productMatch = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.productName, product.productName))
          .limit(1);
        
        if (productMatch.length > 0) {
          productId = productMatch[0].id;
        }
      }

      if (productId) {
        const category = categoryMap.get(productId);
        
        if (category?.requiresAdjustment) {
          try {
            // MHD-Risikoanalyse durchführen
            const riskAnalysis = await mhdForecast.calculateExpiryRisk(
              templateData.machineId,
              productId
            );

            riskCategory = riskAnalysis.riskCategory;
            mhdDays = riskAnalysis.daysUntilExpiry;

            // Mengenanpassung basierend auf Risiko
            if (riskAnalysis.riskCategory === 'critical') {
              adjustedQuantity = Math.max(1, Math.round(originalQuantity * 0.3)); // 70% Reduktion
              adjustmentReason = 'Kritisches MHD-Risiko: 70% Reduktion';
              criticalProducts++;
            } else if (riskAnalysis.riskCategory === 'high') {
              adjustedQuantity = Math.max(1, Math.round(originalQuantity * 0.5)); // 50% Reduktion  
              adjustmentReason = 'Hohes MHD-Risiko: 50% Reduktion';
            } else if (riskAnalysis.riskCategory === 'medium') {
              adjustedQuantity = Math.max(1, Math.round(originalQuantity * 0.7)); // 30% Reduktion
              adjustmentReason = 'Mittleres MHD-Risiko: 30% Reduktion';
            }

            // Berücksichtige auch ausverkaufte Produkte
            if (riskAnalysis.currentStock === 0 && riskAnalysis.avgDailySales > 0) {
              // Erhöhe Menge für ausverkaufte aber beliebte Produkte leicht
              adjustedQuantity = Math.min(originalQuantity, Math.round(adjustedQuantity * 1.2));
              adjustmentReason += ' + Ausverkaufs-Kompensation';
            }

            if (adjustedQuantity !== originalQuantity) {
              adjustedProducts++;
              totalReduction += (originalQuantity - adjustedQuantity);
            }

          } catch (error) {
            console.warn(`[MHD-REFILL] Fehler bei Risikoanalyse für Produkt ${productId}:`, error);
          }
        }
      }

      optimizedProducts.push({
        ...product,
        originalQuantity,
        adjustedQuantity,
        mhdDays,
        riskCategory,
        adjustmentReason,
      });
    }

    // Aktualisiere das Template mit optimierten Mengen
    for (const product of optimizedProducts) {
      if (product.adjustedQuantity !== product.originalQuantity) {
        await db
          .update(refillTemplateProducts)
          .set({ 
            quantity: product.adjustedQuantity,
            updatedAt: new Date(),
          })
          .where(eq(refillTemplateProducts.id, product.id));
      }
    }

    // Markiere Template als MHD-optimiert
    await db
      .update(refillTemplates)
      .set({ 
        description: `${templateData.description || ''} [MHD-optimiert am ${new Date().toLocaleDateString('de-DE')}]`,
        updatedAt: new Date(),
      })
      .where(eq(refillTemplates.id, templateId));

    const summary = {
      totalProducts: templateProducts.length,
      adjustedProducts,
      criticalProducts,
      totalReduction,
      averageConfidence: adjustedProducts > 0 ? 0.8 : 1.0, // Höhere Konfidenz wenn Anpassungen gemacht
    };

    console.log(`[MHD-REFILL] Template optimiert: ${adjustedProducts}/${templateProducts.length} Produkte angepasst`);

    return {
      success: true,
      template: {
        template: templateData,
        products: optimizedProducts,
        summary,
      }
    };

  } catch (error) {
    console.error('[MHD-REFILL] Fehler bei Template-Optimierung:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fehler bei MHD-Optimierung'
    };
  }
}

/**
 * Synchronisiert optimiertes Template zurück zu Vendon
 */
export async function syncOptimizedTemplateToVendon(
  templateId: number,
  machineVendonId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[MHD-REFILL] Synchronisiere optimiertes Template ${templateId} zu Vendon`);

    // Standard Vendon-Sync verwenden (das Template ist bereits optimiert)
    const syncResult = await RefillTemplateVendonService.syncTemplateToVendon(
      templateId,
      machineVendonId
    );

    if (syncResult.success) {
      // Markiere als zu Vendon synchronisiert
      await db
        .update(refillTemplates)
        .set({
          description: (await db
            .select({ description: refillTemplates.description })
            .from(refillTemplates)
            .where(eq(refillTemplates.id, templateId))
            .limit(1)
          )[0]?.description + ` [Sync zu Vendon: ${new Date().toLocaleString('de-DE')}]`,
          updatedAt: new Date(),
        })
        .where(eq(refillTemplates.id, templateId));

      console.log(`[MHD-REFILL] Template erfolgreich zu Vendon synchronisiert`);
    }

    return syncResult;

  } catch (error) {
    console.error('[MHD-REFILL] Fehler beim Vendon-Sync:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fehler beim Vendon-Sync'
    };
  }
}

/**
 * Vollständiger Workflow: Import → MHD-Optimierung → Upload zu Vendon
 */
export async function fullMHDOptimizedWorkflow(
  machineId: number,
  vendonMachineId: string
): Promise<{ 
  success: boolean; 
  template?: MHDOptimizedTemplate; 
  vendonSync?: boolean;
  error?: string 
}> {
  try {
    console.log(`[MHD-REFILL] Starte vollständigen MHD-Workflow für Maschine ${machineId}`);

    // 1. Import und Optimierung
    const importResult = await importAndOptimizeFromVendon(machineId, vendonMachineId);
    
    if (!importResult.success || !importResult.template) {
      return { success: false, error: importResult.error };
    }

    // 2. Synchronisation zurück zu Vendon
    const syncResult = await syncOptimizedTemplateToVendon(
      importResult.template.template.id,
      vendonMachineId
    );

    return {
      success: true,
      template: importResult.template,
      vendonSync: syncResult.success,
      error: syncResult.success ? undefined : `Template optimiert, aber Vendon-Sync fehlgeschlagen: ${syncResult.error}`
    };

  } catch (error) {
    console.error('[MHD-REFILL] Fehler im vollständigen Workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Workflow-Fehler'
    };
  }
}

/**
 * Batch-Verarbeitung für mehrere Maschinen
 */
export async function batchMHDOptimization(
  machineIds?: number[]
): Promise<{
  success: boolean;
  results: Array<{
    machineId: number;
    machineName: string;
    success: boolean;
    adjustedProducts: number;
    error?: string;
  }>;
}> {
  console.log('[MHD-REFILL] Starte Batch-MHD-Optimierung');

  let targetMachines = await db
    .select({
      id: machines.id,
      machineName: machines.machineName,
      vendonId: machines.vendonId,
    })
    .from(machines)
    .where(eq(machines.status, 'active'));

  if (machineIds?.length) {
    targetMachines = targetMachines.filter(m => machineIds.includes(m.id));
  }

  const results = [];

  for (const machine of targetMachines) {
    if (!machine.vendonId) {
      results.push({
        machineId: machine.id,
        machineName: machine.machineName || `Maschine ${machine.id}`,
        success: false,
        adjustedProducts: 0,
        error: 'Keine Vendon-ID verfügbar'
      });
      continue;
    }

    try {
      const workflowResult = await fullMHDOptimizedWorkflow(machine.id, machine.vendonId);
      
      results.push({
        machineId: machine.id,
        machineName: machine.machineName || `Maschine ${machine.id}`,
        success: workflowResult.success,
        adjustedProducts: workflowResult.template?.summary.adjustedProducts || 0,
        error: workflowResult.error,
      });

    } catch (error) {
      results.push({
        machineId: machine.id,
        machineName: machine.machineName || `Maschine ${machine.id}`,
        success: false,
        adjustedProducts: 0,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[MHD-REFILL] Batch-Optimierung abgeschlossen: ${successCount}/${results.length} erfolgreich`);

  return {
    success: successCount > 0,
    results
  };
}
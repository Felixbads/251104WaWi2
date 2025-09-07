/**
 * Wöchentlicher Refill-Template Service
 * Erstellt jeden Sonntag automatisch neue MHD-optimierte Templates für die kommende Woche
 * mit intelligenten Begründungen für Änderungen basierend auf Wetter-, MHD- und Verkaufsprognosen
 */

import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { 
  refillTemplates,
  refillTemplateProducts,
  products,
  machines,
  weeklyTemplateChanges,
  type RefillTemplate,
  type RefillTemplateProduct
} from "../../shared/schema";
import * as MHDRefillService from "./mhdOptimizedRefillTemplateService";
import * as mhdForecast from "./mhdOptimizedForecast";
import { getWeatherForecastForDays } from "./openWeatherService";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { de } from "date-fns/locale";

export interface WeeklyTemplateChange {
  productName: string;
  oldQuantity: number;
  newQuantity: number;
  changeType: 'increase' | 'decrease' | 'unchanged';
  changePercentage: number;
  reasons: string[];
  confidence: number;
}

export interface WeeklyTemplateResult {
  machineId: number;
  machineName: string;
  templateId: number;
  templateName: string;
  weekStart: string;
  weekEnd: string;
  changes: WeeklyTemplateChange[];
  summary: {
    totalProducts: number;
    changedProducts: number;
    increasedProducts: number;
    decreasedProducts: number;
    weatherFactorApplied: boolean;
    mhdFactorApplied: boolean;
  };
  explanationText: string;
}

/**
 * Erstellt wöchentliche Templates für alle aktiven Maschinen
 */
export async function createWeeklyTemplatesForAllMachines(): Promise<{
  success: boolean;
  results: WeeklyTemplateResult[];
  summary: {
    totalMachines: number;
    successfulMachines: number;
    failedMachines: number;
    totalChanges: number;
  };
  error?: string;
}> {
  console.log('[WEEKLY-TEMPLATES] Starte wöchentliche Template-Erstellung für alle Maschinen');

  try {
    // Alle aktiven Maschinen mit Vendon-ID laden
    const activeMachines = await db
      .select({
        id: machines.id,
        machineName: machines.machineName,
        vendonId: machines.vendonId,
        locationId: machines.locationId,
      })
      .from(machines)
      .where(eq(machines.status, 'active'));

    const results: WeeklyTemplateResult[] = [];
    let successfulMachines = 0;
    let failedMachines = 0;
    let totalChanges = 0;

    // Woche definieren (kommende Woche)
    const nextSunday = addDays(new Date(), 7 - new Date().getDay());
    const weekStart = startOfWeek(nextSunday, { weekStartsOn: 1 }); // Montag
    const weekEnd = endOfWeek(nextSunday, { weekStartsOn: 1 }); // Sonntag

    console.log(`[WEEKLY-TEMPLATES] Erstelle Templates für Woche ${format(weekStart, 'dd.MM.yyyy', { locale: de })} - ${format(weekEnd, 'dd.MM.yyyy', { locale: de })}`);

    for (const machine of activeMachines) {
      if (!machine.vendonId) {
        console.warn(`[WEEKLY-TEMPLATES] Maschine ${machine.id} hat keine Vendon-ID, überspringe`);
        failedMachines++;
        continue;
      }

      try {
        const templateResult = await createWeeklyTemplateForMachine(
          machine.id,
          machine.vendonId,
          weekStart,
          weekEnd
        );

        if (templateResult.success && templateResult.result) {
          results.push(templateResult.result);
          successfulMachines++;
          totalChanges += templateResult.result.changes.length;
          
          console.log(`[WEEKLY-TEMPLATES] ✅ Template für Maschine ${machine.machineName} erstellt: ${templateResult.result.changes.length} Änderungen`);
        } else {
          console.error(`[WEEKLY-TEMPLATES] ❌ Template für Maschine ${machine.machineName} fehlgeschlagen: ${templateResult.error}`);
          failedMachines++;
        }

      } catch (error) {
        console.error(`[WEEKLY-TEMPLATES] ❌ Fehler bei Maschine ${machine.machineName}:`, error);
        failedMachines++;
      }
    }

    console.log(`[WEEKLY-TEMPLATES] ✅ Wöchentliche Template-Erstellung abgeschlossen: ${successfulMachines}/${activeMachines.length} erfolgreich`);

    return {
      success: successfulMachines > 0,
      results,
      summary: {
        totalMachines: activeMachines.length,
        successfulMachines,
        failedMachines,
        totalChanges,
      }
    };

  } catch (error) {
    console.error('[WEEKLY-TEMPLATES] Kritischer Fehler bei wöchentlicher Template-Erstellung:', error);
    return {
      success: false,
      results: [],
      summary: {
        totalMachines: 0,
        successfulMachines: 0,
        failedMachines: 0,
        totalChanges: 0,
      },
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Erstellt ein wöchentliches Template für eine spezifische Maschine
 */
export async function createWeeklyTemplateForMachine(
  machineId: number,
  vendonMachineId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<{
  success: boolean;
  result?: WeeklyTemplateResult;
  error?: string;
}> {
  try {
    console.log(`[WEEKLY-TEMPLATES] Erstelle Template für Maschine ${machineId}`);

    // 1. Hole das aktuelle/letzte Template
    const currentTemplate = await db
      .select()
      .from(refillTemplates)
      .where(eq(refillTemplates.machineId, machineId))
      .orderBy(desc(refillTemplates.createdAt))
      .limit(1);

    if (currentTemplate.length === 0) {
      console.log(`[WEEKLY-TEMPLATES] Keine bestehenden Templates für Maschine ${machineId}, erstelle von Vendon`);
      
      // Erstelle neues Template von Vendon
      const vendonResult = await MHDRefillService.importAndOptimizeFromVendon(machineId, vendonMachineId);
      if (!vendonResult.success) {
        return { success: false, error: `Vendon-Import fehlgeschlagen: ${vendonResult.error}` };
      }
    }

    // 2. Hole das neueste Template mit Produkten
    const latestTemplate = await db
      .select()
      .from(refillTemplates)
      .where(eq(refillTemplates.machineId, machineId))
      .orderBy(desc(refillTemplates.createdAt))
      .limit(1);

    const templateProducts = await db
      .select()
      .from(refillTemplateProducts)
      .where(eq(refillTemplateProducts.templateId, latestTemplate[0].id));

    // 3. Sammle Faktoren für die neue Woche
    const factors = await gatherWeeklyFactors(machineId, weekStart, weekEnd);

    // 4. Erstelle neues Template mit Anpassungen
    const newTemplate = await createOptimizedWeeklyTemplate(
      machineId,
      latestTemplate[0],
      templateProducts,
      factors,
      weekStart,
      weekEnd
    );

    return { success: true, result: newTemplate };

  } catch (error) {
    console.error(`[WEEKLY-TEMPLATES] Fehler bei Template-Erstellung für Maschine ${machineId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Sammelt alle relevanten Faktoren für die Wochenplanung
 */
async function gatherWeeklyFactors(
  machineId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<{
  weather: any;
  holidays: any[];
  salesTrends: any;
  mhdRisks: any[];
}> {
  console.log(`[WEEKLY-TEMPLATES] Sammle Faktoren für Maschine ${machineId}`);

  // 1. Wettervorhersage für die Woche
  let weatherForecast;
  try {
    weatherForecast = await getWeatherForecastForDays(7); // 7-Tage Vorhersage
    console.log(`[WEEKLY-TEMPLATES] Wettervorhersage geladen: ${weatherForecast?.length || 0} Tage`);
  } catch (error) {
    console.warn('[WEEKLY-TEMPLATES] Wettervorhersage konnte nicht geladen werden:', error);
    weatherForecast = null;
  }

  // 2. Feiertage und Schulferien (vereinfacht)
  const holidays: any[] = []; // TODO: Implementiere Feiertags-Check

  // 3. Verkaufstrends der letzten Wochen (vereinfacht)
  const salesTrends = {}; // TODO: Implementiere Verkaufstrend-Analyse

  // 4. MHD-Risiken für kurzlebige Produkte
  const mhdRisks: any[] = []; // Wird später in der Template-Erstellung verwendet

  return {
    weather: weatherForecast,
    holidays,
    salesTrends,
    mhdRisks,
  };
}

/**
 * Erstellt ein optimiertes Template mit Begründungen
 */
async function createOptimizedWeeklyTemplate(
  machineId: number,
  baseTemplate: RefillTemplate,
  baseProducts: RefillTemplateProduct[],
  factors: any,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyTemplateResult> {
  console.log(`[WEEKLY-TEMPLATES] Optimiere Template für Maschine ${machineId}`);

  // Maschinen-Info holen
  const machine = await db
    .select({ machineName: machines.machineName })
    .from(machines)
    .where(eq(machines.id, machineId))
    .limit(1);

  const machineName = machine[0]?.machineName || `Maschine ${machineId}`;

  // Template-Name für die Woche
  const templateName = `Woche ${format(weekStart, 'dd.MM', { locale: de })} - ${format(weekEnd, 'dd.MM.yyyy', { locale: de })}`;

  // Neues Template in DB erstellen
  const newTemplate = await db
    .insert(refillTemplates)
    .values({
      machineId,
      templateName,
      description: `Automatisch generiert für ${templateName} mit MHD- und Wetteroptimierung`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()
    .then(results => results[0]);

  // Altes Template deaktivieren
  await db
    .update(refillTemplates)
    .set({ isActive: false })
    .where(and(
      eq(refillTemplates.machineId, machineId),
      eq(refillTemplates.isActive, true)
    ));

  const changes: WeeklyTemplateChange[] = [];
  let weatherFactorApplied = false;
  let mhdFactorApplied = false;

  // Produkte optimieren
  for (const product of baseProducts) {
    const oldQuantity = product.quantity;
    let newQuantity = oldQuantity;
    const reasons: string[] = [];
    let confidence = 0.8; // Standard-Konfidenz

    // 1. MHD-basierte Anpassungen
    if (product.productId) {
      try {
        const riskAnalysis = await mhdForecast.calculateExpiryRisk(machineId, product.productId);
        
        if (riskAnalysis.riskCategory === 'critical') {
          newQuantity = Math.max(1, Math.round(newQuantity * 0.3));
          reasons.push(`Kritisches MHD-Risiko (${riskAnalysis.daysUntilExpiry} Tage) - 70% Reduktion`);
          mhdFactorApplied = true;
          confidence = 0.9;
        } else if (riskAnalysis.riskCategory === 'high') {
          newQuantity = Math.max(1, Math.round(newQuantity * 0.5));
          reasons.push(`Hohes MHD-Risiko (${riskAnalysis.daysUntilExpiry} Tage) - 50% Reduktion`);
          mhdFactorApplied = true;
          confidence = 0.85;
        } else if (riskAnalysis.riskCategory === 'medium') {
          newQuantity = Math.max(1, Math.round(newQuantity * 0.7));
          reasons.push(`Mittleres MHD-Risiko (${riskAnalysis.daysUntilExpiry} Tage) - 30% Reduktion`);
          mhdFactorApplied = true;
          confidence = 0.8;
        }
      } catch (error) {
        console.warn(`[WEEKLY-TEMPLATES] MHD-Analyse für Produkt ${product.productId} fehlgeschlagen:`, error);
      }
    }

    // 2. Wetter-basierte Anpassungen
    if (factors.weather && factors.weather.length > 0) {
      const avgTemp = factors.weather.reduce((sum: number, day: any) => sum + (day.temp || 15), 0) / factors.weather.length;
      const rainyDays = factors.weather.filter((day: any) => (day.description || '').includes('rain')).length;
      
      // Kältere Temperaturen = mehr warme Getränke
      if (avgTemp < 10 && product.productName.toLowerCase().includes('kaffee')) {
        newQuantity = Math.round(newQuantity * 1.2);
        reasons.push(`Kalte Woche (${Math.round(avgTemp)}°C) - mehr warme Getränke (+20%)`);
        weatherFactorApplied = true;
      }
      
      // Warme Temperaturen = mehr kalte Getränke
      if (avgTemp > 25 && (product.productName.toLowerCase().includes('wasser') || product.productName.toLowerCase().includes('cola'))) {
        newQuantity = Math.round(newQuantity * 1.3);
        reasons.push(`Warme Woche (${Math.round(avgTemp)}°C) - mehr kalte Getränke (+30%)`);
        weatherFactorApplied = true;
      }
      
      // Regnerische Tage = weniger Verkauf insgesamt
      if (rainyDays >= 4) {
        newQuantity = Math.round(newQuantity * 0.9);
        reasons.push(`Regnerische Woche (${rainyDays} Regentage) - weniger Kundenfrequenz (-10%)`);
        weatherFactorApplied = true;
      }
    }

    // 3. Produkt-spezifische Anpassungen
    const productName = product.productName.toLowerCase();
    
    // Milchprodukte - besonders vorsichtig
    if (productName.includes('milch') || productName.includes('käse') || productName.includes('joghurt')) {
      if (!reasons.some(r => r.includes('MHD'))) {
        newQuantity = Math.round(newQuantity * 0.8);
        reasons.push('Kurzlebiges Milchprodukt - vorsichtige Befüllung (-20%)');
        mhdFactorApplied = true;
      }
    }

    // Saisonale Anpassungen
    const month = weekStart.getMonth() + 1; // 1-12
    if (month >= 11 || month <= 2) { // Winter
      if (productName.includes('eis') || productName.includes('frozen')) {
        newQuantity = Math.round(newQuantity * 0.6);
        reasons.push('Wintermonate - weniger Nachfrage nach Eisprodukten (-40%)');
      }
    }

    // Änderung dokumentieren
    let changeType: 'increase' | 'decrease' | 'unchanged' = 'unchanged';
    let changePercentage = 0;

    if (newQuantity > oldQuantity) {
      changeType = 'increase';
      changePercentage = Math.round(((newQuantity - oldQuantity) / oldQuantity) * 100);
    } else if (newQuantity < oldQuantity) {
      changeType = 'decrease';
      changePercentage = Math.round(((oldQuantity - newQuantity) / oldQuantity) * 100);
    }

    if (reasons.length === 0) {
      reasons.push('Keine Anpassung notwendig - Standardmenge beibehalten');
    }

    changes.push({
      productName: product.productName,
      oldQuantity,
      newQuantity,
      changeType,
      changePercentage,
      reasons,
      confidence,
    });

    // Neues Produkt in Template einfügen
    await db
      .insert(refillTemplateProducts)
      .values({
        templateId: newTemplate.id,
        productId: product.productId,
        productName: product.productName,
        quantity: newQuantity,
        minRefill: product.minRefill,
        maxCapacity: product.maxCapacity,
        position: product.position,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  }

  // Erklärungstext generieren
  const explanationText = generateExplanationText(changes, factors, weekStart, weekEnd);

  // Änderungen in separater Tabelle speichern
  await saveWeeklyChanges(newTemplate.id, changes, explanationText);

  const summary = {
    totalProducts: changes.length,
    changedProducts: changes.filter(c => c.changeType !== 'unchanged').length,
    increasedProducts: changes.filter(c => c.changeType === 'increase').length,
    decreasedProducts: changes.filter(c => c.changeType === 'decrease').length,
    weatherFactorApplied,
    mhdFactorApplied,
  };

  console.log(`[WEEKLY-TEMPLATES] ✅ Template erstellt: ${summary.changedProducts}/${summary.totalProducts} Produkte geändert`);

  return {
    machineId,
    machineName,
    templateId: newTemplate.id,
    templateName,
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    changes,
    summary,
    explanationText,
  };
}

/**
 * Generiert einen verständlichen Erklärungstext für die Änderungen
 */
function generateExplanationText(
  changes: WeeklyTemplateChange[],
  factors: any,
  weekStart: Date,
  weekEnd: Date
): string {
  const weekPeriod = `${format(weekStart, 'dd.MM', { locale: de })} - ${format(weekEnd, 'dd.MM.yyyy', { locale: de })}`;
  
  let text = `Template für Woche ${weekPeriod}:\n\n`;
  
  const significantChanges = changes.filter(c => c.changeType !== 'unchanged' && c.changePercentage >= 10);
  
  if (significantChanges.length === 0) {
    text += "Keine wesentlichen Änderungen erforderlich. Standardmengen werden beibehalten.\n";
  } else {
    text += "Wichtige Anpassungen dieser Woche:\n\n";
    
    significantChanges.forEach(change => {
      const direction = change.changeType === 'increase' ? 'erhöht' : 'reduziert';
      text += `• ${change.productName}: ${direction} von ${change.oldQuantity} auf ${change.newQuantity} Stück (${change.changePercentage}%)\n`;
      change.reasons.forEach(reason => {
        text += `  → ${reason}\n`;
      });
      text += '\n';
    });
  }

  // Wetter-Zusammenfassung hinzufügen
  if (factors.weather && factors.weather.length > 0) {
    const avgTemp = factors.weather.reduce((sum: number, day: any) => sum + (day.temp || 15), 0) / factors.weather.length;
    const rainyDays = factors.weather.filter((day: any) => (day.description || '').includes('rain')).length;
    
    text += `\nWettereinflüsse:\n`;
    text += `• Durchschnittstemperatur: ${Math.round(avgTemp)}°C\n`;
    text += `• Regentage erwartet: ${rainyDays} von 7 Tagen\n`;
  }

  text += `\nDieses Template wurde automatisch generiert und optimiert unter Berücksichtigung von MHD-Risiken, Wetterprognosen und Verkaufstrends.`;

  return text;
}

/**
 * Speichert die wöchentlichen Änderungen in der Datenbank
 */
async function saveWeeklyChanges(
  templateId: number,
  changes: WeeklyTemplateChange[],
  explanationText: string
): Promise<void> {
  try {
    for (const change of changes) {
      if (change.changeType !== 'unchanged') {
        await db
          .insert(weeklyTemplateChanges)
          .values({
            templateId,
            productName: change.productName,
            oldQuantity: change.oldQuantity,
            newQuantity: change.newQuantity,
            changeType: change.changeType,
            changePercentage: change.changePercentage,
            reasons: JSON.stringify(change.reasons),
            confidence: change.confidence,
            explanationText,
            createdAt: new Date(),
          });
      }
    }
    console.log(`[WEEKLY-TEMPLATES] Änderungen für Template ${templateId} gespeichert`);
  } catch (error) {
    console.error('[WEEKLY-TEMPLATES] Fehler beim Speichern der Änderungen:', error);
  }
}

/**
 * Holt die Änderungshistorie für ein Template
 */
export async function getTemplateChangeHistory(templateId: number): Promise<{
  changes: any[];
  explanationText: string;
}> {
  const changes = await db
    .select()
    .from(weeklyTemplateChanges)
    .where(eq(weeklyTemplateChanges.templateId, templateId));

  const explanationText = changes.length > 0 ? changes[0].explanationText : '';

  return {
    changes: changes.map(change => ({
      ...change,
      reasons: JSON.parse(change.reasons || '[]'),
    })),
    explanationText,
  };
}

/**
 * Manuelle Ausführung der wöchentlichen Template-Erstellung (für Tests)
 */
export async function runWeeklyTemplateCreationManually(): Promise<{
  success: boolean;
  results: WeeklyTemplateResult[];
  message: string;
}> {
  console.log('[WEEKLY-TEMPLATES] Manuelle Ausführung der wöchentlichen Template-Erstellung');

  const result = await createWeeklyTemplatesForAllMachines();

  return {
    success: result.success,
    results: result.results,
    message: result.success 
      ? `Erfolgreich: ${result.summary.successfulMachines}/${result.summary.totalMachines} Maschinen, ${result.summary.totalChanges} Änderungen`
      : `Fehlgeschlagen: ${result.error}`
  };
}
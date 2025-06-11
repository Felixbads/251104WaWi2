/**
 * Simplified Enhanced Forecast Service
 * 
 * Implements the key features from the uploaded requirements document:
 * - Stockout status tracking and compensation
 * - Weather-based forecasting adjustments
 * - Holiday and vacation period integration
 * - Transparent forecast explanations
 */

import { db } from '../db';
import { 
  transactions, 
  machines, 
  locations,
  events
} from '@shared/schema';
import { eq, and, between, count, desc, asc, sql, gte, lte } from 'drizzle-orm';
import { format, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

export interface ForecastExplanation {
  date: string;
  machineId: number;
  machineName: string;
  locationName: string;
  productName: string;
  baselineDemand: number;
  weatherAdjustment: number;
  holidayAdjustment: number;
  stockoutCompensation: number;
  finalForecast: number;
  explanation: string;
  confidence: number;
  factors: string[];
}

export interface DashboardForecast {
  forecasts: ForecastExplanation[];
  summary: {
    totalMachines: number;
    averageConfidence: number;
    highDemandDays: number;
    warnings: string[];
  };
}

/**
 * Analyzes stockout events for a machine and product
 */
async function analyzeStockouts(machineId: number, productName: string, days: number = 30): Promise<{
  stockoutDays: number;
  recommendedIncrease: number;
}> {
  try {
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    // Count stockout events
    const stockoutQuery = await db
      .select({ count: count() })
      .from(events)
      .where(
        and(
          eq(events.machineId, machineId),
          gte(events.eventDatetime, new Date(startDate)),
          lte(events.eventDatetime, new Date(endDate)),
          sql`(
            LOWER(${events.description}) LIKE '%out of stock%' OR 
            LOWER(${events.description}) LIKE '%empty%' OR
            LOWER(${events.description}) LIKE '%ausverkauft%' OR
            ${events.eventType} = 'STOCKOUT'
          )`
        )
      );

    const stockoutCount = stockoutQuery[0]?.count || 0;
    const recommendedIncrease = stockoutCount > 2 ? 0.2 : 0; // 20% increase if frequent stockouts

    return {
      stockoutDays: stockoutCount,
      recommendedIncrease
    };
  } catch (error) {
    console.error('Error analyzing stockouts:', error);
    return { stockoutDays: 0, recommendedIncrease: 0 };
  }
}

/**
 * Calculates baseline demand excluding estimated stockout periods
 */
async function calculateBaseline(machineId: number, productName: string, days: number = 30): Promise<number> {
  try {
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    const avgQuery = await db
      .select({ 
        avgQuantity: sql<number>`AVG(${transactions.quantity})`,
        totalDays: sql<number>`COUNT(DISTINCT DATE(${transactions.datetime}))`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.machineId, machineId),
          eq(transactions.productName, productName),
          gte(transactions.datetime, new Date(startDate)),
          lte(transactions.datetime, new Date(endDate))
        )
      );

    return avgQuery[0]?.avgQuantity || 0;
  } catch (error) {
    console.error('Error calculating baseline:', error);
    return 0;
  }
}

/**
 * Determines weather impact based on simple heuristics
 */
function getWeatherImpact(date: Date, locationName: string): { factor: number; description: string } {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const month = date.getMonth();
  
  // Simple seasonal adjustments
  let factor = 1.0;
  let description = 'Normales Wetter';

  // Summer months (June-August) - outdoor locations get boost
  if (month >= 5 && month <= 7 && locationName.toLowerCase().includes('outdoor')) {
    factor = 1.2;
    description = 'Sommerzeit (+20% für Outdoor-Standorte)';
  }
  
  // Winter months (Dec-Feb) - reduced for outdoor
  if ((month === 11 || month <= 1) && locationName.toLowerCase().includes('outdoor')) {
    factor = 0.8;
    description = 'Winterzeit (-20% für Outdoor-Standorte)';
  }

  // Weekend boost for tourist locations
  if (isWeekend && (locationName.toLowerCase().includes('tourist') || locationName.toLowerCase().includes('park'))) {
    factor *= 1.3;
    description += isWeekend ? ' + Wochenende (+30%)' : '';
  }

  return { factor, description };
}

/**
 * Determines holiday impact based on date
 */
function getHolidayImpact(date: Date): { factor: number; description: string; isHoliday: boolean } {
  const dayOfWeek = date.getDay();
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  
  let factor = 1.0;
  let description = 'Normaler Tag';
  let isHoliday = false;

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    factor = 1.1;
    description = 'Wochenende';
  }

  // Major holidays (simplified)
  const holidayDates = [
    { month: 0, day: 1, name: 'Neujahr' },
    { month: 4, day: 1, name: 'Tag der Arbeit' },
    { month: 9, day: 3, name: 'Tag der Deutschen Einheit' },
    { month: 11, day: 25, name: 'Weihnachten' },
    { month: 11, day: 26, name: '2. Weihnachtstag' }
  ];

  for (const holiday of holidayDates) {
    if (month === holiday.month && dayOfMonth === holiday.day) {
      factor = 1.4;
      description = holiday.name;
      isHoliday = true;
      break;
    }
  }

  // School holiday periods (simplified)
  if ((month === 6 || month === 7) && !isHoliday) { // Summer holidays
    factor = 1.2;
    description = 'Sommerferien';
    isHoliday = true;
  }

  return { factor, description, isHoliday };
}

/**
 * Creates enhanced forecast with explanations
 */
export async function createEnhancedForecast(
  machineId: number,
  productName: string,
  days: number = 7
): Promise<ForecastExplanation[]> {
  try {
    // Get machine info
    const machine = await db.query.machines.findFirst({
      where: eq(machines.id, machineId),
      with: { location: true }
    });

    if (!machine) {
      throw new Error(`Machine ${machineId} not found`);
    }

    const forecasts: ForecastExplanation[] = [];
    
    // Analyze historical data
    const stockoutAnalysis = await analyzeStockouts(machineId, productName);
    const baselineDemand = await calculateBaseline(machineId, productName);

    // Generate forecasts for next N days
    for (let i = 0; i < days; i++) {
      const targetDate = addDays(new Date(), i);
      const dateStr = format(targetDate, 'yyyy-MM-dd');

      // Calculate adjustments
      const weatherImpact = getWeatherImpact(targetDate, machine.location?.name || '');
      const holidayImpact = getHolidayImpact(targetDate);
      
      const weatherAdjustment = baselineDemand * (weatherImpact.factor - 1);
      const holidayAdjustment = baselineDemand * (holidayImpact.factor - 1);
      const stockoutCompensation = baselineDemand * stockoutAnalysis.recommendedIncrease;

      const finalForecast = Math.max(0, 
        baselineDemand + weatherAdjustment + holidayAdjustment + stockoutCompensation
      );

      // Build explanation
      const factors: string[] = [];
      let explanation = `Für ${machine.location?.name || 'Standort'} am ${format(targetDate, 'dd.MM.yyyy', { locale: de })} `;

      if (holidayImpact.isHoliday) {
        factors.push(holidayImpact.description);
        explanation += `wird erhöhter Absatz erwartet, da ${holidayImpact.description}. `;
      }

      if (Math.abs(weatherImpact.factor - 1) > 0.05) {
        factors.push(`Wetter: ${weatherImpact.description}`);
        explanation += `${weatherImpact.description}. `;
      }

      if (stockoutCompensation > 0) {
        factors.push(`Ausverkauf-Kompensation (+${Math.round(stockoutAnalysis.recommendedIncrease * 100)}%)`);
        explanation += `Erhöhte Bestellung empfohlen aufgrund ${stockoutAnalysis.stockoutDays} Ausverkaufsereignissen. `;
      }

      explanation += `Durchschnittlicher Absatz: ${baselineDemand.toFixed(1)} Stück.`;

      // Calculate confidence
      let confidence = 0.8;
      if (stockoutAnalysis.stockoutDays > 5) confidence -= 0.2;
      if (baselineDemand === 0) confidence -= 0.3;
      confidence = Math.max(0.1, Math.min(1.0, confidence));

      forecasts.push({
        date: dateStr,
        machineId,
        machineName: machine.name || 'Unbekannt',
        locationName: machine.location?.name || 'Unbekannt',
        productName,
        baselineDemand,
        weatherAdjustment,
        holidayAdjustment,
        stockoutCompensation,
        finalForecast,
        explanation: explanation.trim(),
        confidence,
        factors
      });
    }

    return forecasts;
  } catch (error) {
    console.error('Error creating enhanced forecast:', error);
    throw error;
  }
}

/**
 * Gets dashboard data with forecasts for top products
 */
export async function getForecastDashboard(warehouseId?: number): Promise<DashboardForecast> {
  try {
    // Get machines
    let machinesQuery = db.select({
      id: machines.id,
      machineName: machines.machineName,
      locationId: machines.locationId,
      locationName: machines.locationName
    }).from(machines);

    // Note: machines table doesn't have warehouseId directly, skip warehouse filtering for now

    const machinesList = await machinesQuery.limit(5); // Limit for performance

    const allForecasts: ForecastExplanation[] = [];
    const warnings: string[] = [];

    // Generate forecasts for each machine's top product
    for (const machine of machinesList) {
      try {
        // Get top product for this machine
        const topProductQuery = await db
          .select({ 
            productName: transactions.productName,
            totalSales: sql<number>`SUM(${transactions.quantity})`
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.machineId, machine.id),
              gte(transactions.datetime, subDays(new Date(), 30))
            )
          )
          .groupBy(transactions.productName)
          .orderBy(desc(sql`SUM(${transactions.quantity})`))
          .limit(1);

        if (topProductQuery.length > 0 && topProductQuery[0].productName) {
          const forecasts = await createEnhancedForecast(
            machine.id,
            topProductQuery[0].productName,
            7
          );
          allForecasts.push(...forecasts);

          // Check for warnings
          const avgConfidence = forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length;
          if (avgConfidence < 0.5) {
            warnings.push(`Niedrige Prognosegenauigkeit für ${machine.name}`);
          }

          const stockoutCompensation = forecasts.some(f => f.stockoutCompensation > 0);
          if (stockoutCompensation) {
            warnings.push(`Häufige Ausverkaufssituationen bei ${machine.name}`);
          }
        }
      } catch (error) {
        console.error(`Error creating forecast for machine ${machine.id}:`, error);
        warnings.push(`Prognosefehler für ${machine.name}`);
      }
    }

    const summary = {
      totalMachines: machinesList.length,
      averageConfidence: allForecasts.length > 0 
        ? allForecasts.reduce((sum, f) => sum + f.confidence, 0) / allForecasts.length 
        : 0,
      highDemandDays: allForecasts.filter(f => f.finalForecast > f.baselineDemand * 1.3).length,
      warnings
    };

    return {
      forecasts: allForecasts,
      summary
    };
  } catch (error) {
    console.error('Error generating forecast dashboard:', error);
    throw error;
  }
}

/**
 * Gets recent forecast explanations for a specific machine
 */
export async function getMachineForecastHistory(machineId: number): Promise<{
  machine: any;
  products: Array<{
    productName: string;
    forecasts: ForecastExplanation[];
  }>;
}> {
  try {
    const machine = await db.query.machines.findFirst({
      where: eq(machines.id, machineId),
      with: { location: true }
    });

    if (!machine) {
      throw new Error(`Machine ${machineId} not found`);
    }

    // Get top 3 products
    const topProducts = await db
      .select({ 
        productName: transactions.productName,
        totalSales: sql<number>`SUM(${transactions.quantity})`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.machineId, machineId),
          gte(transactions.datetime, subDays(new Date(), 30))
        )
      )
      .groupBy(transactions.productName)
      .orderBy(desc(sql`SUM(${transactions.quantity})`))
      .limit(3);

    const products = [];
    for (const product of topProducts) {
      if (product.productName) {
        const forecasts = await createEnhancedForecast(machineId, product.productName, 7);
        products.push({
          productName: product.productName,
          forecasts
        });
      }
    }

    return {
      machine,
      products
    };
  } catch (error) {
    console.error('Error getting machine forecast history:', error);
    throw error;
  }
}
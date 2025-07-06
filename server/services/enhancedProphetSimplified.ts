/**
 * Vereinfachter Enhanced Prophet Service
 * 
 * Bietet grundlegende erweiterte Prognosefunktionen ohne komplexe saisonale Anreicherung
 */

import { pool } from '../db';

export interface SimplifiedForecastInput {
  machineId?: number;
  productId?: number;
  startDate: Date;
  endDate: Date;
  forecastHorizon?: number;
}

export interface SimplifiedForecastResult {
  date: Date;
  predictedSales: number;
  confidence: number;
  machineId?: number;
  productId?: number;
  seasonalAdjustment: number;
  weekdayFactor: number;
  monthlyFactor: number;
}

export class SimplifiedEnhancedProphetService {
  /**
   * Erstellt vereinfachte erweiterte Prognosen
   */
  async createSimplifiedForecast(input: SimplifiedForecastInput): Promise<SimplifiedForecastResult[]> {
    try {
      console.log('[SIMPLIFIED-PROPHET] Erstelle vereinfachte Prognose:', input);

      // Hole historische Daten
      const historicalData = await this.getHistoricalData(input);
      
      if (historicalData.length === 0) {
        console.warn('[SIMPLIFIED-PROPHET] Keine historischen Daten gefunden');
        return [];
      }

      // Berechne Basisstatistiken
      const stats = this.calculateBasicStats(historicalData);
      
      // Erstelle Prognose
      const forecast = this.generateForecast(input, stats);
      
      console.log(`[SIMPLIFIED-PROPHET] Erstellt ${forecast.length} Prognose-Datenpunkte`);
      return forecast;
    } catch (error) {
      console.error('[SIMPLIFIED-PROPHET] Fehler:', error);
      throw error;
    }
  }

  /**
   * Hole historische Daten ohne saisonale Spalten
   */
  private async getHistoricalData(input: SimplifiedForecastInput) {
    let query = `
      SELECT 
        t.datetime,
        t.machine_id,
        t.product_id,
        t.product_name,
        t.quantity,
        t.price,
        EXTRACT(DOW FROM t.datetime) as day_of_week,
        EXTRACT(MONTH FROM t.datetime) as month_of_year,
        EXTRACT(HOUR FROM t.datetime) as hour_of_day
      FROM transactions t
      WHERE t.datetime >= $1 AND t.datetime <= $2
    `;
    
    const params = [input.startDate, input.endDate];
    let paramIndex = 3;
    
    if (input.machineId) {
      query += ` AND t.machine_id = $${paramIndex}`;
      params.push(input.machineId as any);
      paramIndex++;
    }
    
    if (input.productId) {
      query += ` AND t.product_id = $${paramIndex}`;
      params.push(input.productId as any);
    }
    
    query += ` ORDER BY t.datetime`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Berechne Basisstatistiken
   */
  private calculateBasicStats(data: any[]) {
    const dailyData = this.aggregateByDay(data);
    
    const quantities = dailyData.map(d => d.totalQuantity);
    const avgSales = quantities.reduce((a, b) => a + b, 0) / quantities.length;
    const maxSales = Math.max(...quantities);
    const minSales = Math.min(...quantities);
    
    // Wochentag-Faktoren
    const weekdayFactors = this.calculateWeekdayFactors(dailyData);
    
    // Monatliche Faktoren
    const monthlyFactors = this.calculateMonthlyFactors(dailyData);
    
    return {
      avgSales,
      maxSales,
      minSales,
      weekdayFactors,
      monthlyFactors,
      variance: this.calculateVariance(quantities, avgSales)
    };
  }

  /**
   * Aggregiere Daten nach Tagen
   */
  private aggregateByDay(data: any[]) {
    const dailyMap = new Map();
    
    for (const transaction of data) {
      const dateKey = transaction.datetime.toISOString().split('T')[0];
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          totalQuantity: 0,
          transactionCount: 0,
          dayOfWeek: transaction.day_of_week,
          monthOfYear: transaction.month_of_year
        });
      }
      
      const dayData = dailyMap.get(dateKey);
      dayData.totalQuantity += transaction.quantity || 1;
      dayData.transactionCount += 1;
    }
    
    return Array.from(dailyMap.values());
  }

  /**
   * Berechne Wochentag-Faktoren
   */
  private calculateWeekdayFactors(dailyData: any[]) {
    const weekdayMap = new Map();
    
    for (const day of dailyData) {
      const dow = day.dayOfWeek;
      if (!weekdayMap.has(dow)) {
        weekdayMap.set(dow, []);
      }
      weekdayMap.get(dow).push(day.totalQuantity);
    }
    
    const factors = new Map();
    const overallAvg = dailyData.reduce((sum, d) => sum + d.totalQuantity, 0) / dailyData.length;
    
    for (const [dow, quantities] of Array.from(weekdayMap.entries())) {
      const dowAvg = quantities.reduce((a: number, b: number) => a + b, 0) / quantities.length;
      factors.set(dow, dowAvg / overallAvg);
    }
    
    return factors;
  }

  /**
   * Berechne monatliche Faktoren
   */
  private calculateMonthlyFactors(dailyData: any[]) {
    const monthlyMap = new Map();
    
    for (const day of dailyData) {
      const month = day.monthOfYear;
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, []);
      }
      monthlyMap.get(month).push(day.totalQuantity);
    }
    
    const factors = new Map();
    const overallAvg = dailyData.reduce((sum, d) => sum + d.totalQuantity, 0) / dailyData.length;
    
    for (const [month, quantities] of Array.from(monthlyMap.entries())) {
      const monthAvg = quantities.reduce((a: number, b: number) => a + b, 0) / quantities.length;
      factors.set(month, monthAvg / overallAvg);
    }
    
    return factors;
  }

  /**
   * Berechne Varianz
   */
  private calculateVariance(values: number[], mean: number) {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Generiere Prognose
   */
  private generateForecast(input: SimplifiedForecastInput, stats: any): SimplifiedForecastResult[] {
    const forecast: SimplifiedForecastResult[] = [];
    const startDate = new Date(input.endDate);
    const days = input.forecastHorizon || 7;
    
    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(startDate);
      forecastDate.setDate(startDate.getDate() + i);
      
      const dayOfWeek = forecastDate.getDay();
      const monthOfYear = forecastDate.getMonth() + 1;
      
      const weekdayFactor = stats.weekdayFactors.get(dayOfWeek) || 1.0;
      const monthlyFactor = stats.monthlyFactors.get(monthOfYear) || 1.0;
      
      const basePrediction = stats.avgSales;
      const adjustedPrediction = basePrediction * weekdayFactor * monthlyFactor;
      
      // Berechne Konfidenz basierend auf Varianz
      const confidence = Math.max(0.6, Math.min(0.95, 1 - (Math.sqrt(stats.variance) / stats.avgSales)));
      
      forecast.push({
        date: forecastDate,
        predictedSales: Math.round(adjustedPrediction * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        machineId: input.machineId,
        productId: input.productId,
        seasonalAdjustment: weekdayFactor * monthlyFactor,
        weekdayFactor: weekdayFactor,
        monthlyFactor: monthlyFactor
      });
    }
    
    return forecast;
  }

  /**
   * Identifiziere aktive Maschinen (die in den letzten 7 Tagen Transaktionen hatten)
   */
  private async getActiveMachineIds(): Promise<number[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const result = await pool.query(`
      SELECT DISTINCT machine_id 
      FROM transactions 
      WHERE datetime >= $1 AND machine_id IS NOT NULL
      ORDER BY machine_id
    `, [sevenDaysAgo]);
    
    return result.rows.map(row => row.machine_id);
  }

  /**
   * Generiere Analytics-Zusammenfassung (fokussiert auf aktive Maschinen)
   */
  async generateAnalytics() {
    try {
      console.log('[SIMPLIFIED-PROPHET] Generiere Analytics für aktive Maschinen...');
      
      // Aktive Maschinen identifizieren (letzte 7 Tage)
      const activeMachineIds = await this.getActiveMachineIds();
      
      if (activeMachineIds.length === 0) {
        throw new Error('Keine aktiven Maschinen gefunden');
      }
      
      console.log(`[SIMPLIFIED-PROPHET] Fokus auf ${activeMachineIds.length} aktive Maschinen:`, activeMachineIds.slice(0, 5));
      
      // Analytics nur für diese aktiven Maschinen (letzte 30 Tage)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(DISTINCT machine_id) as active_machines,
          COUNT(DISTINCT product_id) as active_products,
          AVG(quantity) as avg_quantity,
          MIN(datetime) as earliest_transaction,
          MAX(datetime) as latest_transaction
        FROM transactions 
        WHERE datetime >= $1 
        AND machine_id = ANY($2)
      `, [thirtyDaysAgo, activeMachineIds]);
      
      // Zusätzlich: Top-Maschinen nach Transaktionsvolumen
      const topMachines = await pool.query(`
        SELECT 
          m.machine_name,
          m.vendon_id,
          COUNT(t.id) as transaction_count,
          MAX(t.datetime) as last_transaction
        FROM machines m
        JOIN transactions t ON m.id = t.machine_id
        WHERE t.datetime >= $1
        AND t.machine_id = ANY($2)
        GROUP BY m.id, m.machine_name, m.vendon_id
        ORDER BY transaction_count DESC
        LIMIT 5
      `, [thirtyDaysAgo, activeMachineIds]);
      
      return {
        success: true,
        summary: {
          totalTransactions: parseInt(stats.rows[0].total_transactions),
          activeMachines: parseInt(stats.rows[0].active_machines),
          activeProducts: parseInt(stats.rows[0].active_products),
          averageQuantity: Math.round(parseFloat(stats.rows[0].avg_quantity || 0)),
          dataRange: {
            from: stats.rows[0].earliest_transaction,
            to: stats.rows[0].latest_transaction
          }
        },
        activeMachinesFocus: {
          totalActiveMachines: activeMachineIds.length,
          focusNote: 'Nur aktive Maschinen der letzten 7 Tage werden analysiert',
          machineIds: activeMachineIds,
          topMachines: topMachines.rows.map(row => ({
            name: row.machine_name,
            vendonId: row.vendon_id,
            transactionCount: parseInt(row.transaction_count),
            lastTransaction: row.last_transaction
          }))
        },
        capabilities: [
          `Fokus auf ${activeMachineIds.length} aktive Maschinen`,
          'Wochentag-basierte Prognosen',
          'Monatliche Saisonalität',
          'Konfidenz-Bewertung',
          'Maschinen-spezifische Prognosen',
          'Produkt-spezifische Prognosen'
        ],
        modelType: 'Optimiertes Enhanced Prophet System (Aktive Maschinen)',
        version: '1.1-active-focus'
      };
    } catch (error) {
      console.error('[SIMPLIFIED-PROPHET] Analytics-Fehler:', error);
      throw error;
    }
  }
}

export const simplifiedEnhancedProphetService = new SimplifiedEnhancedProphetService();
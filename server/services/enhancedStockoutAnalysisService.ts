/**
 * ENHANCED STOCKOUT ANALYSIS SERVICE
 * 
 * Intelligente Ausverkaufs-Analyse mit verlorenen Verkäufen und
 * Optimierung der Nachfüll-Häufigkeit für maximale Rentabilität
 */

import { pool } from '../db';
import { StockoutDetectionService, StockoutEvent, StockoutImpact } from './stockoutDetectionService';

export interface LostSalesAnalysis {
  machineId: number;
  machineName: string;
  productId: number;
  productName: string;
  locationId: number;
  
  // Ausverkaufs-Statistiken
  stockoutFrequency: number;           // Ausverkäufe pro Monat
  avgStockoutDuration: number;         // Durchschnittliche Dauer in Stunden
  totalLostSales: number;              // Verlorene Verkäufe gesamt
  totalLostRevenue: number;            // Verlorener Umsatz
  
  // Nachfüll-Optimierung
  currentRefillFrequency: number;      // Aktuelle Nachfüllungen pro Monat
  optimalRefillFrequency: number;      // Optimale Nachfüllungen pro Monat
  potentialRevenueIncrease: number;    // Potenzielle Umsatzsteigerung
  
  // Prognose-Adjustierung
  actualDemandEstimate: number;        // Geschätzte echte Nachfrage
  observedSales: number;               // Beobachtete Verkäufe
  demandSuppression: number;           // Nachfrage-Unterdrückung (0-1)
}

export interface RefillOptimizationResult {
  machineId: number;
  productId: number;
  currentStrategy: {
    refillsPerMonth: number;
    avgStockoutDays: number;
    revenuePerMonth: number;
  };
  optimizedStrategy: {
    refillsPerMonth: number;
    estimatedStockoutDays: number;
    projectedRevenuePerMonth: number;
    revenueIncrease: number;
    costIncrease: number;
    netBenefit: number;
  };
  confidence: number;
}

export class EnhancedStockoutAnalysisService {
  private stockoutService: StockoutDetectionService;

  constructor() {
    this.stockoutService = new StockoutDetectionService();
  }

  /**
   * Analysiert verlorene Verkäufe für alle Produkte an allen Standorten
   */
  async analyzeLostSalesComprehensive(
    daysBack: number = 90,
    machineId?: number,
    productId?: number
  ): Promise<LostSalesAnalysis[]> {
    console.log(`📊 Starte umfassende Lost Sales Analyse (${daysBack} Tage)...`);
    
    let machineFilter = machineId ? 'AND m.id = $2' : '';
    let productFilter = productId ? `AND p.id = ${machineId ? '$3' : '$2'}` : '';
    let params = [daysBack];
    
    if (machineId) params.push(machineId);
    if (productId) params.push(productId);
    
    const query = `
      WITH stockout_analysis AS (
        -- Identifiziere Stockout-Ereignisse durch Refill-Analyse
        SELECT DISTINCT
          m.id as machine_id,
          m.machine_name,
          m.location_id,
          rd.product_id,
          p.product_name,
          r.datetime as refill_time,
          
          -- Letzte Transaktion vor Refill
          LAG(t.datetime) OVER (
            PARTITION BY m.id, rd.product_id 
            ORDER BY r.datetime
          ) as last_sale_before_refill,
          
          -- Erste Transaktion nach Refill
          LEAD(t.datetime) OVER (
            PARTITION BY m.id, rd.product_id 
            ORDER BY r.datetime
          ) as first_sale_after_refill,
          
          rd.quantity as refill_quantity,
          
          -- Berechne Stockout-Dauer
          EXTRACT(EPOCH FROM (r.datetime - LAG(t.datetime) OVER (
            PARTITION BY m.id, rd.product_id 
            ORDER BY r.datetime
          ))) / 3600 as stockout_hours

        FROM machines m
        INNER JOIN refills r ON m.id = r.machine_id
        INNER JOIN refill_details rd ON r.id = rd.refill_id
        LEFT JOIN products p ON rd.product_id = p.id
        LEFT JOIN transactions t ON t.machine_id = m.id 
          AND t.product_id = rd.product_id
          AND t.datetime BETWEEN r.datetime - INTERVAL '7 days' AND r.datetime + INTERVAL '1 hour'
        
        WHERE r.datetime >= NOW() - INTERVAL '${daysBack} days'
          ${machineFilter}
          ${productFilter}
          AND p.id IS NOT NULL
          
      ), sales_velocity AS (
        -- Berechne Verkaufsgeschwindigkeit pro Produkt/Maschine
        SELECT 
          machine_id,
          product_id,
          COUNT(*) as total_sales,
          AVG(quantity) as avg_quantity_per_sale,
          COUNT(*) / GREATEST(EXTRACT(DAYS FROM (MAX(datetime) - MIN(datetime))), 1) as sales_per_day,
          AVG(price_wo_vat) as avg_price
        FROM transactions
        WHERE datetime >= NOW() - INTERVAL '${daysBack} days'
          AND product_id IS NOT NULL
        GROUP BY machine_id, product_id
        
      ), lost_sales_calculation AS (
        SELECT 
          sa.machine_id,
          sa.machine_name,
          sa.location_id,
          sa.product_id,
          sa.product_name,
          
          -- Stockout-Statistiken
          COUNT(sa.refill_time) as stockout_count,
          AVG(sa.stockout_hours) as avg_stockout_hours,
          SUM(sa.stockout_hours) as total_stockout_hours,
          
          -- Verkaufs-Velocity
          COALESCE(sv.sales_per_day, 0) as observed_sales_per_day,
          COALESCE(sv.avg_price, 0) as avg_unit_price,
          
          -- Verlorene Verkäufe berechnen
          COALESCE(sv.sales_per_day * SUM(sa.stockout_hours) / 24, 0) as estimated_lost_sales,
          COALESCE(sv.sales_per_day * SUM(sa.stockout_hours) / 24 * sv.avg_price, 0) as estimated_lost_revenue,
          
          -- Refill-Häufigkeit
          COUNT(sa.refill_time) / (${daysBack / 30.0}) as current_refills_per_month
          
        FROM stockout_analysis sa
        LEFT JOIN sales_velocity sv ON sa.machine_id = sv.machine_id 
          AND sa.product_id = sv.product_id
        WHERE sa.stockout_hours > 0
        GROUP BY 
          sa.machine_id, sa.machine_name, sa.location_id,
          sa.product_id, sa.product_name,
          sv.sales_per_day, sv.avg_price
      )
      
      SELECT 
        machine_id,
        machine_name,
        location_id,
        product_id,
        product_name,
        
        stockout_count / (${daysBack / 30.0}) as stockout_frequency_per_month,
        ROUND(avg_stockout_hours, 2) as avg_stockout_duration_hours,
        ROUND(estimated_lost_sales, 0) as total_lost_sales,
        ROUND(estimated_lost_revenue, 2) as total_lost_revenue,
        
        current_refills_per_month,
        observed_sales_per_day,
        avg_unit_price,
        total_stockout_hours
        
      FROM lost_sales_calculation
      WHERE estimated_lost_sales > 0
      ORDER BY estimated_lost_revenue DESC, stockout_frequency_per_month DESC
    `;

    const result = await pool.query(query, params);
    
    return result.rows.map((row: any) => this.calculateOptimalRefillStrategy(row));
  }

  /**
   * Berechnet optimale Refill-Strategie basierend auf Lost Sales
   */
  private calculateOptimalRefillStrategy(stockoutData: any): LostSalesAnalysis {
    const {
      machine_id: machineId,
      machine_name: machineName,
      location_id: locationId,
      product_id: productId,
      product_name: productName,
      stockout_frequency_per_month: stockoutFrequency,
      avg_stockout_duration_hours: avgStockoutDuration,
      total_lost_sales: totalLostSales,
      total_lost_revenue: totalLostRevenue,
      current_refills_per_month: currentRefillFrequency,
      observed_sales_per_day: observedSalesPerDay,
      avg_unit_price: avgUnitPrice,
      total_stockout_hours: totalStockoutHours
    } = stockoutData;

    // Schätze echte Nachfrage (beobachtete Verkäufe + verlorene Verkäufe)
    const actualDemandEstimate = observedSalesPerDay * 30 + totalLostSales;
    const demandSuppression = totalLostSales / Math.max(actualDemandEstimate, 1);
    
    // Berechne optimale Refill-Häufigkeit
    // Ziel: Reduziere Stockouts um 80% durch häufigere Refills
    const stockoutReductionTarget = 0.8;
    const currentStockoutRatio = totalStockoutHours / (24 * 30); // Anteil der Zeit mit Stockout
    const targetStockoutRatio = currentStockoutRatio * (1 - stockoutReductionTarget);
    
    // Optimale Refill-Frequenz basierend auf Nachfrage-Profil
    const optimalRefillFrequency = Math.max(
      currentRefillFrequency * (1 + stockoutReductionTarget),
      currentRefillFrequency + 2 // Mindestens 2 zusätzliche Refills
    );
    
    // Potenzielle Umsatzsteigerung durch weniger Stockouts
    const potentialRevenueIncrease = totalLostRevenue * stockoutReductionTarget;

    return {
      machineId,
      machineName,
      productId,
      productName,
      locationId,
      
      stockoutFrequency,
      avgStockoutDuration,
      totalLostSales,
      totalLostRevenue,
      
      currentRefillFrequency,
      optimalRefillFrequency,
      potentialRevenueIncrease,
      
      actualDemandEstimate,
      observedSales: observedSalesPerDay * 30,
      demandSuppression
    };
  }

  /**
   * Optimiert Refill-Strategien für maximalen ROI
   */
  async optimizeRefillStrategies(
    machineId?: number,
    minRevenuePotential: number = 100
  ): Promise<RefillOptimizationResult[]> {
    console.log('🎯 Optimiere Refill-Strategien für maximalen ROI...');
    
    const lostSalesAnalysis = await this.analyzeLostSalesComprehensive(90, machineId);
    
    return lostSalesAnalysis
      .filter(analysis => analysis.potentialRevenueIncrease >= minRevenuePotential)
      .map(analysis => {
        const refillCostEstimate = 15; // Durchschnittliche Kosten pro Refill
        
        const currentRevenue = analysis.observedSales * 30 * 
          (analysis.totalLostRevenue / Math.max(analysis.totalLostSales, 1));
        
        const optimizedRevenue = currentRevenue + analysis.potentialRevenueIncrease;
        const additionalRefillCosts = (analysis.optimalRefillFrequency - analysis.currentRefillFrequency) * refillCostEstimate;
        
        return {
          machineId: analysis.machineId,
          productId: analysis.productId,
          currentStrategy: {
            refillsPerMonth: analysis.currentRefillFrequency,
            avgStockoutDays: analysis.avgStockoutDuration / 24,
            revenuePerMonth: currentRevenue
          },
          optimizedStrategy: {
            refillsPerMonth: analysis.optimalRefillFrequency,
            estimatedStockoutDays: (analysis.avgStockoutDuration / 24) * 0.2, // 80% Reduktion
            projectedRevenuePerMonth: optimizedRevenue,
            revenueIncrease: analysis.potentialRevenueIncrease,
            costIncrease: additionalRefillCosts,
            netBenefit: analysis.potentialRevenueIncrease - additionalRefillCosts
          },
          confidence: Math.min(0.95, 0.6 + (analysis.stockoutFrequency * 0.1))
        };
      })
      .filter(result => result.optimizedStrategy.netBenefit > 0)
      .sort((a, b) => b.optimizedStrategy.netBenefit - a.optimizedStrategy.netBenefit);
  }

  /**
   * Berechnet Stockout-Korrektur-Faktor für Prophet-Prognosen
   */
  async calculateStockoutCorrectionFactor(
    machineId: number,
    productId: number,
    forecastDate: Date
  ): Promise<number> {
    // Hole historische Stockout-Daten für ähnliche Zeiträume
    const dayOfWeek = forecastDate.getDay();
    const monthOfYear = forecastDate.getMonth() + 1;
    
    const query = `
      WITH historical_stockouts AS (
        SELECT 
          m.id as machine_id,
          rd.product_id,
          r.datetime as refill_time,
          EXTRACT(DOW FROM r.datetime) as dow,
          EXTRACT(MONTH FROM r.datetime) as month,
          
          -- Berechne Nachfrage-Unterdrückung basierend auf Verkaufs-Velocity
          CASE 
            WHEN sales_before.sales_per_day > 0 THEN
              LEAST(0.5, -- Max 50% Unterdrückung
                (EXTRACT(EPOCH FROM (r.datetime - LAG(t.datetime) OVER (
                  PARTITION BY m.id, rd.product_id 
                  ORDER BY r.datetime
                ))) / 3600) * sales_before.sales_per_day / 24
                / GREATEST(sales_before.sales_per_day * 7, 1) -- Normalisiert auf Wochenbasis
              )
            ELSE 0.1 -- Standard-Unterdrückung bei wenig Daten
          END as demand_suppression
          
        FROM machines m
        INNER JOIN refills r ON m.id = r.machine_id
        INNER JOIN refill_details rd ON r.id = rd.refill_id
        LEFT JOIN transactions t ON t.machine_id = m.id 
          AND t.product_id = rd.product_id
          AND t.datetime BETWEEN r.datetime - INTERVAL '7 days' AND r.datetime
        LEFT JOIN (
          -- Durchschnittliche Verkaufsgeschwindigkeit vor Refill
          SELECT 
            machine_id, product_id,
            COUNT(*) / 7.0 as sales_per_day
          FROM transactions
          WHERE datetime >= NOW() - INTERVAL '180 days'
          GROUP BY machine_id, product_id
        ) sales_before ON m.id = sales_before.machine_id AND rd.product_id = sales_before.product_id
        
        WHERE m.id = $1 
          AND rd.product_id = $2
          AND r.datetime >= NOW() - INTERVAL '180 days'
      )
      
      SELECT 
        AVG(demand_suppression) as avg_suppression,
        COUNT(*) as sample_size,
        STDDEV(demand_suppression) as suppression_stddev
      FROM historical_stockouts
      WHERE dow = $3 AND month = $4
    `;

    try {
      const result = await pool.query(query, [machineId, productId, dayOfWeek, monthOfYear]);
      
      if (result.rows.length > 0 && result.rows[0].sample_size > 2) {
        const avgSuppression = parseFloat(result.rows[0].avg_suppression) || 0;
        const stddev = parseFloat(result.rows[0].suppression_stddev) || 0;
        
        // Korrektur-Faktor: 1 + geschätzte Nachfrage-Unterdrückung
        // Mit Konfidenz-Adjustierung basierend auf Datenmenge
        const confidenceAdjustment = Math.min(1, result.rows[0].sample_size / 10);
        const adjustedSuppression = avgSuppression * confidenceAdjustment;
        
        return 1 + Math.min(adjustedSuppression, 0.5); // Max 50% Aufschlag
      }
      
      return 1.0; // Keine Korrektur wenn keine Daten
    } catch (error) {
      console.error('Fehler bei Stockout-Korrektur-Berechnung:', error);
      return 1.0;
    }
  }

  /**
   * Erstellt Dashboard-Daten für Stockout-Analyse
   */
  async getStockoutAnalyticsDashboard(machineId?: number): Promise<{
    summary: any;
    topLosses: LostSalesAnalysis[];
    optimizationOpportunities: RefillOptimizationResult[];
    trendData: any[];
  }> {
    console.log('📊 Erstelle Stockout Analytics Dashboard...');

    const [lostSalesAnalysis, optimizationResults] = await Promise.all([
      this.analyzeLostSalesComprehensive(90, machineId),
      this.optimizeRefillStrategies(machineId)
    ]);

    const summary = {
      totalMachines: new Set(lostSalesAnalysis.map(a => a.machineId)).size,
      totalProducts: new Set(lostSalesAnalysis.map(a => a.productId)).size,
      totalLostRevenue: lostSalesAnalysis.reduce((sum, a) => sum + a.totalLostRevenue, 0),
      totalPotentialIncrease: optimizationResults.reduce((sum, o) => sum + o.optimizedStrategy.netBenefit, 0),
      avgStockoutFrequency: lostSalesAnalysis.reduce((sum, a) => sum + a.stockoutFrequency, 0) / Math.max(lostSalesAnalysis.length, 1),
      avgDemandSuppression: lostSalesAnalysis.reduce((sum, a) => sum + a.demandSuppression, 0) / Math.max(lostSalesAnalysis.length, 1)
    };

    // Trend-Analyse: Verlorene Umsätze der letzten 12 Wochen
    const trendQuery = `
      WITH weekly_losses AS (
        SELECT 
          DATE_TRUNC('week', r.datetime) as week_start,
          SUM(
            COALESCE(sv.sales_per_day, 0) * 
            EXTRACT(EPOCH FROM (r.datetime - LAG(t.datetime) OVER (
              PARTITION BY m.id, rd.product_id 
              ORDER BY r.datetime
            ))) / 3600 / 24 *
            COALESCE(sv.avg_price, 0)
          ) as weekly_lost_revenue
        FROM machines m
        INNER JOIN refills r ON m.id = r.machine_id
        INNER JOIN refill_details rd ON r.id = rd.refill_id
        LEFT JOIN transactions t ON t.machine_id = m.id 
          AND t.product_id = rd.product_id
          AND t.datetime BETWEEN r.datetime - INTERVAL '7 days' AND r.datetime + INTERVAL '1 hour'
        LEFT JOIN (
          SELECT 
            machine_id, product_id,
            COUNT(*) / 90.0 as sales_per_day,
            AVG(price_wo_vat) as avg_price
          FROM transactions
          WHERE datetime >= NOW() - INTERVAL '90 days'
          GROUP BY machine_id, product_id
        ) sv ON m.id = sv.machine_id AND rd.product_id = sv.product_id
        WHERE r.datetime >= NOW() - INTERVAL '12 weeks'
          ${machineId ? `AND m.id = ${machineId}` : ''}
        GROUP BY DATE_TRUNC('week', r.datetime)
        ORDER BY week_start
      )
      SELECT 
        week_start,
        ROUND(weekly_lost_revenue, 2) as lost_revenue
      FROM weekly_losses
      WHERE weekly_lost_revenue > 0
    `;

    const trendResult = await pool.query(trendQuery);

    return {
      summary,
      topLosses: lostSalesAnalysis.slice(0, 20),
      optimizationOpportunities: optimizationResults.slice(0, 15),
      trendData: trendResult.rows
    };
  }
}
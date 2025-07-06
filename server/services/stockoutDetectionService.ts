/**
 * Stock-Out Detection Service
 * 
 * Erkennt ausverkaufte Produkte aus Events und Transaktionsdaten
 * für bessere Prognosen und Bestandsmanagement
 */

import { pool } from '../db.js';

export interface StockoutEvent {
  machineId: number;
  productId: number | null;
  stockId: number | null;
  detectedAt: Date;
  lastSaleTime: Date | null;
  refillTime: Date | null;
  estimatedOutageMinutes: number;
  detectionMethod: 'REFILL_PATTERN' | 'SALES_GAP' | 'EVENT_SEQUENCE';
  confidence: number; // 0-1
}

export interface StockoutImpact {
  machineId: number;
  productName: string;
  outageStart: Date;
  outageEnd: Date;
  missedSalesEstimate: number;
  lostRevenue: number;
}

export class StockoutDetectionService {
  constructor() {
  }

  /**
   * Erkennt Stockouts basierend auf Refill-Events
   */
  async detectStockoutsFromRefills(machineId?: number, days: number = 30): Promise<StockoutEvent[]> {
    const machineFilter = machineId ? 'AND r.machine_id = $2' : '';
    const params = machineId ? [days, machineId] : [days];
    
    const query = `
      SELECT DISTINCT
        r.machine_id,
        rd.product_id,
        rd.stock_id,
        r.datetime as refill_time,
        LAG(t.datetime) OVER (
          PARTITION BY rd.product_id, r.machine_id 
          ORDER BY r.datetime
        ) as last_sale_before_refill,
        LEAD(t.datetime) OVER (
          PARTITION BY rd.product_id, r.machine_id 
          ORDER BY r.datetime
        ) as first_sale_after_refill,
        rd.quantity as refill_quantity
      FROM refills r
      JOIN refill_details rd ON r.id = rd.refill_id
      LEFT JOIN transactions t ON t.stock_id = rd.stock_id 
        AND t.datetime BETWEEN r.datetime - INTERVAL '4 hours' AND r.datetime + INTERVAL '1 hour'
      WHERE r.datetime >= NOW() - INTERVAL '${days} days'
        ${machineFilter}
      ORDER BY r.machine_id, rd.product_id, r.datetime
    `;

    const result = await pool.query(query, params);
    
    return result.rows.map((row: any) => ({
      machineId: row.machine_id,
      productId: row.product_id,
      stockId: row.stock_id,
      detectedAt: row.refill_time,
      lastSaleTime: row.last_sale_before_refill,
      refillTime: row.refill_time,
      estimatedOutageMinutes: this.calculateOutageMinutes(
        row.last_sale_before_refill,
        row.refill_time
      ),
      detectionMethod: 'REFILL_PATTERN',
      confidence: this.calculateRefillConfidence(row)
    }));
  }

  /**
   * Erkennt Stockouts durch Verkaufslücken
   */
  async detectStockoutsFromSalesGaps(machineId?: number, days: number = 7): Promise<StockoutEvent[]> {
    const machineFilter = machineId ? 'AND machine_id = $2' : '';
    const params = machineId ? [days, machineId] : [days];

    // Finde ungewöhnlich lange Pausen zwischen Verkäufen
    const query = `
      WITH sales_with_gaps AS (
        SELECT 
          machine_id,
          product_id,
          stock_id,
          datetime,
          LEAD(datetime) OVER (
            PARTITION BY machine_id, product_id 
            ORDER BY datetime
          ) as next_sale,
          EXTRACT(EPOCH FROM (
            LEAD(datetime) OVER (
              PARTITION BY machine_id, product_id 
              ORDER BY datetime
            ) - datetime
          )) / 60 as gap_minutes
        FROM transactions
        WHERE datetime >= NOW() - INTERVAL '${days} days'
          AND product_id IS NOT NULL
          ${machineFilter}
      ),
      unusual_gaps AS (
        SELECT *,
          AVG(gap_minutes) OVER (
            PARTITION BY machine_id, product_id
          ) as avg_gap,
          STDDEV(gap_minutes) OVER (
            PARTITION BY machine_id, product_id
          ) as stddev_gap
        FROM sales_with_gaps
        WHERE gap_minutes IS NOT NULL
      )
      SELECT 
        machine_id,
        product_id,
        stock_id,
        datetime as last_sale,
        next_sale,
        gap_minutes,
        avg_gap,
        stddev_gap
      FROM unusual_gaps
      WHERE gap_minutes > (avg_gap + 2 * COALESCE(stddev_gap, 60))
        AND gap_minutes > 120 -- Mindestens 2 Stunden Pause
      ORDER BY machine_id, product_id, datetime
    `;

    const result = await pool.query(query, params);
    
    return result.rows.map((row: any) => ({
      machineId: row.machine_id,
      productId: row.product_id,
      stockId: row.stock_id,
      detectedAt: new Date(row.next_sale),
      lastSaleTime: new Date(row.last_sale),
      refillTime: null,
      estimatedOutageMinutes: Math.floor(row.gap_minutes),
      detectionMethod: 'SALES_GAP',
      confidence: this.calculateGapConfidence(row)
    }));
  }

  /**
   * Kombinierte Stockout-Erkennung
   */
  async detectAllStockouts(machineId?: number, days: number = 7): Promise<StockoutEvent[]> {
    const [refillStockouts, gapStockouts] = await Promise.all([
      this.detectStockoutsFromRefills(machineId, days),
      this.detectStockoutsFromSalesGaps(machineId, days)
    ]);

    // Deduplicates und sortiert nach Konfidenz
    const allStockouts = [...refillStockouts, ...gapStockouts];
    const uniqueStockouts = this.deduplicateStockouts(allStockouts);
    
    return uniqueStockouts.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Berechnet verpasste Verkäufe durch Stockouts
   */
  async calculateStockoutImpact(stockouts: StockoutEvent[]): Promise<StockoutImpact[]> {
    const impacts: StockoutImpact[] = [];

    for (const stockout of stockouts) {
      if (!stockout.productId || !stockout.lastSaleTime) continue;

      // Durchschnittliche Verkaufsrate für das Produkt berechnen
      const salesRateQuery = `
        SELECT 
          p.name as product_name,
          COUNT(*) as sales_count,
          AVG(t.price) as avg_price,
          EXTRACT(EPOCH FROM (MAX(t.datetime) - MIN(t.datetime))) / 3600 as hours_span
        FROM transactions t
        JOIN products p ON t.product_id = p.id
        WHERE t.product_id = $1 
          AND t.machine_id = $2
          AND t.datetime >= NOW() - INTERVAL '30 days'
        GROUP BY p.name
      `;

      const salesData = await pool.query(salesRateQuery, [
        stockout.productId,
        stockout.machineId
      ]);

      if (salesData.rows.length > 0) {
        const row = salesData.rows[0];
        const salesPerHour = row.sales_count / Math.max(row.hours_span, 1);
        const outageHours = stockout.estimatedOutageMinutes / 60;
        const missedSales = Math.round(salesPerHour * outageHours);
        const lostRevenue = missedSales * row.avg_price;

        impacts.push({
          machineId: stockout.machineId,
          productName: row.product_name,
          outageStart: stockout.lastSaleTime,
          outageEnd: stockout.refillTime || stockout.detectedAt,
          missedSalesEstimate: missedSales,
          lostRevenue: lostRevenue
        });
      }
    }

    return impacts;
  }

  /**
   * Speichert Stockout-Events für Analyse
   */
  async saveStockoutEvents(stockouts: StockoutEvent[]): Promise<void> {
    for (const stockout of stockouts) {
      await pool.query(`
        INSERT INTO events (
          machine_id, event_type, event_name, datetime, notes, additional_data
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [
        stockout.machineId,
        'STOCKOUT',
        'Product Stockout Detected',
        stockout.detectedAt,
        `Product ${stockout.productId} out of stock for ${stockout.estimatedOutageMinutes} minutes`,
        JSON.stringify({
          productId: stockout.productId,
          stockId: stockout.stockId,
          detectionMethod: stockout.detectionMethod,
          confidence: stockout.confidence,
          estimatedOutageMinutes: stockout.estimatedOutageMinutes
        })
      ]);
    }
  }

  private calculateOutageMinutes(lastSale: Date | null, refillTime: Date): number {
    if (!lastSale) return 0;
    return Math.max(0, (refillTime.getTime() - lastSale.getTime()) / (1000 * 60));
  }

  private calculateRefillConfidence(row: any): number {
    let confidence = 0.7; // Base confidence für Refill-Pattern
    
    // Höhere Konfidenz wenn große Refill-Menge
    if (row.refill_quantity > 10) confidence += 0.1;
    
    // Höhere Konfidenz wenn längere Verkaufspause vor Refill
    if (row.last_sale_before_refill) {
      const gapHours = (new Date(row.refill_time).getTime() - 
                       new Date(row.last_sale_before_refill).getTime()) / (1000 * 60 * 60);
      if (gapHours > 4) confidence += 0.1;
      if (gapHours > 12) confidence += 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  private calculateGapConfidence(row: any): number {
    const gapRatio = row.gap_minutes / Math.max(row.avg_gap, 60);
    const stddevRatio = row.stddev_gap ? row.gap_minutes / row.stddev_gap : 1;
    
    let confidence = 0.5; // Base confidence für Gap-Detection
    
    if (gapRatio > 3) confidence += 0.2;
    if (gapRatio > 5) confidence += 0.1;
    if (stddevRatio > 2) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }

  private deduplicateStockouts(stockouts: StockoutEvent[]): StockoutEvent[] {
    const seen = new Set<string>();
    return stockouts.filter(stockout => {
      const key = `${stockout.machineId}-${stockout.productId}-${stockout.detectedAt.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
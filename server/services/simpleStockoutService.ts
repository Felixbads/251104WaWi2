/**
 * Vereinfachte Stockout-Erkennung Service
 * 
 * Grundlegende Stockout-Erkennung ohne komplexe SQL-Joins
 */

import { pool } from '../db';

export interface SimpleStockoutEvent {
  machineId: number;
  machineName: string;
  refillTime: Date;
  timeSinceLastSale: number; // Minuten
  detectionMethod: 'REFILL_PATTERN';
  confidence: number;
}

export class SimpleStockoutService {
  /**
   * Erkennt Stockouts durch Analyse der Refill-Zeiten
   */
  async detectStockouts(machineId?: number, days: number = 7): Promise<SimpleStockoutEvent[]> {
    try {
      let query = `
        SELECT 
          r.machine_id,
          m.machine_name,
          r.datetime as refill_time
        FROM refills r
        LEFT JOIN machines m ON r.machine_id = m.id
        WHERE r.datetime >= NOW() - INTERVAL '${days} days'
      `;
      
      const params: any[] = [];
      if (machineId) {
        query += ' AND r.machine_id = $1';
        params.push(machineId);
      }
      
      query += ' ORDER BY r.machine_id, r.datetime DESC';

      const result = await pool.query(query, params);
      
      const stockouts: SimpleStockoutEvent[] = [];
      
      for (const refill of result.rows) {
        // Suche nach letztem Verkauf vor diesem Refill
        const lastSaleQuery = `
          SELECT datetime 
          FROM transactions 
          WHERE machine_id = $1 
            AND datetime < $2
          ORDER BY datetime DESC 
          LIMIT 1
        `;
        
        const saleResult = await pool.query(lastSaleQuery, [
          refill.machine_id, 
          refill.refill_time
        ]);
        
        if (saleResult.rows.length > 0) {
          const lastSaleTime = new Date(saleResult.rows[0].datetime);
          const refillTime = new Date(refill.refill_time);
          const timeDiff = (refillTime.getTime() - lastSaleTime.getTime()) / (1000 * 60); // Minuten
          
          // Stockout wahrscheinlich wenn mehr als 4 Stunden zwischen letztem Verkauf und Refill
          if (timeDiff > 240) {
            stockouts.push({
              machineId: refill.machine_id,
              machineName: refill.machine_name || 'Unbekannt',
              refillTime: refillTime,
              timeSinceLastSale: Math.round(timeDiff),
              detectionMethod: 'REFILL_PATTERN',
              confidence: Math.min(timeDiff / 1440, 1.0) // Max 1.0 bei 24h
            });
          }
        }
      }
      
      return stockouts;
    } catch (error) {
      console.error('Fehler bei Stockout-Erkennung:', error);
      return [];
    }
  }

  /**
   * Analysiert Stockout-Auswirkungen
   */
  async analyzeStockoutImpact(stockouts: SimpleStockoutEvent[]): Promise<any[]> {
    const impacts = [];
    
    for (const stockout of stockouts) {
      // Berechne geschätzte verpasste Verkäufe
      const avgSalesPerHour = await this.getAverageSalesPerHour(stockout.machineId);
      const outageHours = stockout.timeSinceLastSale / 60;
      const missedSales = Math.round(avgSalesPerHour * outageHours);
      
      impacts.push({
        machineId: stockout.machineId,
        machineName: stockout.machineName,
        outageMinutes: stockout.timeSinceLastSale,
        estimatedMissedSales: missedSales,
        confidence: stockout.confidence
      });
    }
    
    return impacts;
  }

  private async getAverageSalesPerHour(machineId: number): Promise<number> {
    const query = `
      SELECT COUNT(*) as sales_count
      FROM transactions 
      WHERE machine_id = $1 
        AND datetime >= NOW() - INTERVAL '7 days'
    `;
    
    const result = await pool.query(query, [machineId]);
    const salesCount = parseInt(result.rows[0]?.sales_count || '0');
    
    // Durchschnittliche Verkäufe pro Stunde (7 Tage = 168 Stunden)
    return salesCount / 168;
  }
}
/**
 * Stock Ratio Service - Verwaltet Verhältnisse zwischen aktuellem und maximalem Bestand
 * 
 * Hauptfunktionen:
 * - Automatische Erkennung der maximalen Kapazität beim Nachfüllen
 * - Berechnung von Füllstand-Verhältnissen
 * - Optimierung der Bestandsanzeige für externe APIs
 */

import { db } from '../db';
import { machineStocks, refills, refillDetails } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface StockRatio {
  machineId: number;
  machineName: string;
  productVendonId: string;
  productName: string;
  selectionNumber: string;
  currentQuantity: number;
  maxQuantity: number;
  fillRatio: number; // 0.0 bis 1.0 (0% bis 100%)
  fillPercentage: number; // 0 bis 100
  status: 'full' | 'high' | 'medium' | 'low' | 'critical' | 'empty';
  lastFilled: Date | null;
  lastSync: Date | null;
}

export interface MachineStockSummary {
  machineId: number;
  machineName: string;
  totalSlots: number;
  filledSlots: number;
  averageFillRatio: number;
  averageFillPercentage: number;
  lastRefill: Date | null;
  stockRatios: StockRatio[];
}

export class StockRatioService {
  
  /**
   * Aktualisiert die maximale Kapazität basierend auf Nachfüllungsdaten
   * Diese Methode wird bei jeder Vendon-Synchronisation aufgerufen
   */
  async updateMaxQuantityFromRefills(): Promise<void> {
    console.log('🔄 Aktualisiere maximale Kapazitäten basierend auf Nachfüllungen...');
    
    try {
      // Hole die neuesten Nachfülldetails mit der aktuellen Menge nach Nachfüllung
      const latestRefillData = await db
        .select({
          machineId: refills.machineId,
          productId: refillDetails.productId,
          currentStock: refillDetails.currentStock,
          amountMax: refillDetails.amountMax,
          position: refillDetails.position,
          datetime: refills.datetime
        })
        .from(refillDetails)
        .innerJoin(refills, eq(refillDetails.refillId, refills.id))
        .where(sql`${refillDetails.currentStock} > 0`)
        .orderBy(desc(refills.datetime));
      
      console.log(`📊 ${latestRefillData.length} Nachfüllungsdatensätze zur Verarbeitung gefunden`);
      
      let updatedCount = 0;
      
      for (const refillData of latestRefillData) {
        try {
          // Finde den entsprechenden machine_stock Eintrag
          const machineStock = await db
            .select()
            .from(machineStocks)
            .where(
              and(
                eq(machineStocks.machineId, refillData.machineId || 0),
                eq(machineStocks.productVendonId, refillData.productId || ''),
                eq(machineStocks.selectionNumber, refillData.position || '')
              )
            )
            .limit(1);
          
          if (machineStock.length > 0) {
            const currentStock = machineStock[0];
            const newMaxQuantity = Math.max(
              refillData.currentStock || 0,
              refillData.amountMax || 0,
              currentStock.maxQuantity || 0
            );
            
            // Aktualisiere nur wenn die neue maximale Menge größer ist
            if (newMaxQuantity > (currentStock.maxQuantity || 0)) {
              await db
                .update(machineStocks)
                .set({
                  maxQuantity: newMaxQuantity,
                  lastFilled: refillData.datetime,
                  updatedAt: new Date()
                })
                .where(eq(machineStocks.id, currentStock.id));
              
              updatedCount++;
              console.log(`✅ Maximale Kapazität aktualisiert: Maschine ${refillData.machineId}, Position ${refillData.position}, Max: ${newMaxQuantity}`);
            }
          }
        } catch (error) {
          console.error('❌ Fehler beim Aktualisieren der maximalen Kapazität:', error);
        }
      }
      
      console.log(`🎯 ${updatedCount} maximale Kapazitäten erfolgreich aktualisiert`);
      
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren der maximalen Kapazitäten:', error);
      throw error;
    }
  }
  
  /**
   * Berechnet Füllstand-Verhältnisse für eine spezifische Maschine
   */
  async calculateStockRatiosForMachine(machineId: number): Promise<StockRatio[]> {
    try {
      const stockData = await db
        .select({
          machineId: machineStocks.machineId,
          machineName: sql<string>`COALESCE(m.name, m.machine_name, 'Unbekannte Maschine')`.as('machineName'),
          productVendonId: machineStocks.productVendonId,
          productName: sql<string>`COALESCE(p.product_name, 'Unbekanntes Produkt')`.as('productName'),
          selectionNumber: machineStocks.selectionNumber,
          currentQuantity: machineStocks.quantity,
          maxQuantity: machineStocks.maxQuantity,
          lastFilled: machineStocks.lastFilled,
          lastSync: machineStocks.lastSync
        })
        .from(machineStocks)
        .leftJoin(sql`machines m`, sql`m.id = ${machineStocks.machineId}`)
        .leftJoin(sql`products p`, sql`p.vendon_id = ${machineStocks.productVendonId}`)
        .where(eq(machineStocks.machineId, machineId))
        .orderBy(machineStocks.selectionNumber);
      
      return stockData.map(stock => this.calculateStockRatio(stock));
      
    } catch (error) {
      console.error(`❌ Fehler beim Berechnen der Verhältnisse für Maschine ${machineId}:`, error);
      return [];
    }
  }
  
  /**
   * Berechnet Füllstand-Verhältnisse für alle Maschinen
   */
  async calculateAllStockRatios(): Promise<MachineStockSummary[]> {
    try {
      // Hole alle Maschinen-IDs
      const machines = await db
        .select({ 
          id: sql<number>`DISTINCT ${machineStocks.machineId}`.as('id'),
          name: sql<string>`COALESCE(m.name, m.machine_name, 'Unbekannte Maschine')`.as('name')
        })
        .from(machineStocks)
        .leftJoin(sql`machines m`, sql`m.id = ${machineStocks.machineId}`)
        .where(sql`${machineStocks.machineId} IS NOT NULL`);
      
      const summaries: MachineStockSummary[] = [];
      
      for (const machine of machines) {
        const stockRatios = await this.calculateStockRatiosForMachine(machine.id);
        
        if (stockRatios.length > 0) {
          const averageFillRatio = stockRatios.reduce((sum, ratio) => sum + ratio.fillRatio, 0) / stockRatios.length;
          const lastRefill = stockRatios.reduce((latest, ratio) => {
            if (!ratio.lastFilled) return latest;
            if (!latest) return ratio.lastFilled;
            return ratio.lastFilled > latest ? ratio.lastFilled : latest;
          }, null as Date | null);
          
          summaries.push({
            machineId: machine.id,
            machineName: machine.name,
            totalSlots: stockRatios.length,
            filledSlots: stockRatios.filter(ratio => ratio.currentQuantity > 0).length,
            averageFillRatio,
            averageFillPercentage: Math.round(averageFillRatio * 100),
            lastRefill,
            stockRatios
          });
        }
      }
      
      return summaries.sort((a, b) => a.machineName.localeCompare(b.machineName));
      
    } catch (error) {
      console.error('❌ Fehler beim Berechnen aller Verhältnisse:', error);
      return [];
    }
  }
  
  /**
   * Berechnet das Verhältnis für einen einzelnen Stock-Eintrag
   */
  private calculateStockRatio(stock: any): StockRatio {
    const currentQuantity = stock.currentQuantity || 0;
    const maxQuantity = stock.maxQuantity || 0;
    
    let fillRatio = 0;
    let status: StockRatio['status'] = 'empty';
    
    if (maxQuantity > 0) {
      fillRatio = currentQuantity / maxQuantity;
      
      if (fillRatio >= 0.9) status = 'full';
      else if (fillRatio >= 0.7) status = 'high';
      else if (fillRatio >= 0.4) status = 'medium';
      else if (fillRatio >= 0.2) status = 'low';
      else if (fillRatio > 0) status = 'critical';
      else status = 'empty';
    } else if (currentQuantity > 0) {
      // Wenn maxQuantity nicht gesetzt ist, aber Bestand vorhanden, schätze 50% Füllung
      fillRatio = 0.5;
      status = 'medium';
    }
    
    return {
      machineId: stock.machineId,
      machineName: stock.machineName,
      productVendonId: stock.productVendonId || '',
      productName: stock.productName,
      selectionNumber: stock.selectionNumber || '',
      currentQuantity,
      maxQuantity,
      fillRatio,
      fillPercentage: Math.round(fillRatio * 100),
      status,
      lastFilled: stock.lastFilled,
      lastSync: stock.lastSync
    };
  }
  
  /**
   * Gibt formatierte Daten für externe APIs zurück
   */
  async getFormattedStockDataForExternalAPI(): Promise<{
    machines: Array<{
      machineId: number;
      machineName: string;
      averageFillPercentage: number;
      totalSlots: number;
      filledSlots: number;
      lastRefill: string | null;
      products: Array<{
        productName: string;
        selectionNumber: string;
        currentQuantity: number;
        maxQuantity: number;
        fillPercentage: number;
        status: string;
      }>;
    }>;
    summary: {
      totalMachines: number;
      totalSlots: number;
      averageSystemFillPercentage: number;
      lastUpdated: string;
    };
  }> {
    const stockSummaries = await this.calculateAllStockRatios();
    
    const machines = stockSummaries.map(summary => ({
      machineId: summary.machineId,
      machineName: summary.machineName,
      averageFillPercentage: summary.averageFillPercentage,
      totalSlots: summary.totalSlots,
      filledSlots: summary.filledSlots,
      lastRefill: summary.lastRefill ? summary.lastRefill.toISOString() : null,
      products: summary.stockRatios.map(ratio => ({
        productName: ratio.productName,
        selectionNumber: ratio.selectionNumber,
        currentQuantity: ratio.currentQuantity,
        maxQuantity: ratio.maxQuantity,
        fillPercentage: ratio.fillPercentage,
        status: ratio.status
      }))
    }));
    
    const totalSlots = stockSummaries.reduce((sum, summary) => sum + summary.totalSlots, 0);
    const averageSystemFillPercentage = stockSummaries.length > 0 
      ? Math.round(stockSummaries.reduce((sum, summary) => sum + summary.averageFillPercentage, 0) / stockSummaries.length)
      : 0;
    
    return {
      machines,
      summary: {
        totalMachines: stockSummaries.length,
        totalSlots,
        averageSystemFillPercentage,
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

// Export eine Singleton-Instanz
export const stockRatioService = new StockRatioService();
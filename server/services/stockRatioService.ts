/**
 * Stock Ratio Service - Berechnet Füllstandsverhältnisse basierend auf echten Vendon API-Daten
 */

import { fetchMachineProducts } from './vendonAPI';

export interface MachineStockData {
  machineId: number;
  machineName: string;
  vendonId: number;
  products: ProductStockInfo[];
  totalFillLevel: number; // Durchschnittlicher Füllstand
  criticalProducts: number; // Anzahl kritischer Produkte
  lastUpdate: Date;
}

export interface ProductStockInfo {
  id: number;
  stockId: number;
  stockArticle: string;
  name: string;
  type: string;
  units: string;
  amount: number; // Aktueller Bestand
  amountMax: number; // Maximale Kapazität
  amountStandard: number; // Standard-Nachfüllstand
  amountCritical: number; // Kritischer Bestand
  fillRatio: number; // Verhältnis (amount / amountMax)
  isCritical: boolean; // Ist unter kritischem Level
  isRefillable: boolean;
  lastPurchase: number | null; // Unix Timestamp
  refillUnitSize: number;
  minRefill: number;
  selections: any[]; // Auswahlnummern
}

/**
 * Holt echte Bestandsdaten für eine Maschine von der Vendon API
 */
export async function getMachineStockData(vendonId: number, machineName: string): Promise<MachineStockData | null> {
  try {
    console.log(`[STOCK RATIO] Abrufen der Bestandsdaten für Maschine ${vendonId} (${machineName})`);
    
    const vendonProducts = await fetchMachineProducts(vendonId);
    
    if (!vendonProducts || !Array.isArray(vendonProducts)) {
      console.error(`[STOCK RATIO] Keine gültigen Produktdaten für Maschine ${vendonId}`);
      return null;
    }

    const products: ProductStockInfo[] = vendonProducts.map((product: any) => {
      const amount = product.amount || 0;
      const amountMax = product.amount_max || 1; // Vermeide Division durch 0
      const amountCritical = product.amount_critical || 0;
      
      const fillRatio = Math.min(amount / amountMax, 1); // Max 100%
      const isCritical = amount <= amountCritical;

      return {
        id: product.id,
        stockId: product.stock_id,
        stockArticle: product.stock_article || '',
        name: product.name || 'Unbekanntes Produkt',
        type: product.type || 'PRODUCT',
        units: product.units || 'Stück',
        amount,
        amountMax,
        amountStandard: product.amount_standart || 0,
        amountCritical,
        fillRatio,
        isCritical,
        isRefillable: product.refillable || false,
        lastPurchase: product.last_purchase || null,
        refillUnitSize: product.refill_unit_size || 1,
        minRefill: product.min_refill || 1,
        selections: product.selections || []
      };
    });

    // Berechne Gesamt-Füllstand (Durchschnitt aller Produkte)
    const totalFillLevel = products.length > 0 
      ? products.reduce((sum, p) => sum + p.fillRatio, 0) / products.length 
      : 0;

    // Zähle kritische Produkte
    const criticalProducts = products.filter(p => p.isCritical).length;

    console.log(`[STOCK RATIO] ✅ Erfolgreich ${products.length} Produkte analysiert für ${machineName}`);
    console.log(`[STOCK RATIO] Gesamt-Füllstand: ${(totalFillLevel * 100).toFixed(1)}%, Kritische Produkte: ${criticalProducts}`);

    return {
      machineId: vendonId, // Für Kompatibilität verwenden wir vendonId als machineId
      machineName,
      vendonId,
      products,
      totalFillLevel,
      criticalProducts,
      lastUpdate: new Date()
    };

  } catch (error) {
    console.error(`[STOCK RATIO] Fehler beim Abrufen der Bestandsdaten für Maschine ${vendonId}:`, error);
    return null;
  }
}

/**
 * Berechnet aggregierte Statistiken für mehrere Maschinen
 */
export function calculateStockStatistics(machines: MachineStockData[]) {
  if (machines.length === 0) {
    return {
      totalMachines: 0,
      averageFillLevel: 0,
      totalCriticalProducts: 0,
      machinesWithCriticalStock: 0,
      bestPerforming: null,
      worstPerforming: null
    };
  }

  const totalFillLevel = machines.reduce((sum, m) => sum + m.totalFillLevel, 0) / machines.length;
  const totalCriticalProducts = machines.reduce((sum, m) => sum + m.criticalProducts, 0);
  const machinesWithCriticalStock = machines.filter(m => m.criticalProducts > 0).length;

  // Beste und schlechteste Maschine
  const sortedByFillLevel = [...machines].sort((a, b) => b.totalFillLevel - a.totalFillLevel);
  const bestPerforming = sortedByFillLevel[0];
  const worstPerforming = sortedByFillLevel[sortedByFillLevel.length - 1];

  return {
    totalMachines: machines.length,
    averageFillLevel: totalFillLevel,
    totalCriticalProducts,
    machinesWithCriticalStock,
    bestPerforming,
    worstPerforming
  };
}

// Hilfsfunktion um alle aktiven Maschinen zu erhalten
async function getAllActiveMachines() {
  const { storage } = await import('../storage');
  try {
    const machines = await storage.getMachines();
    return machines.filter((m: any) => m.status === 'active' && m.vendonId);
  } catch (error) {
    console.error('[STOCK RATIO] Fehler beim Abrufen der Maschinen:', error);
    return [];
  }
}

// Stock Ratio Service Klasse
export class StockRatioService {

  /**
   * Berechnet Stock-Ratios für eine einzelne Maschine
   */
  async calculateStockRatiosForMachine(machineId: number): Promise<any[]> {
    try {
      const { storage } = await import('../storage');
      
      // Hole Maschineninformationen
      const machine = await storage.getMachineById(machineId);
      if (!machine || !machine.vendonId) {
        console.error(`[STOCK RATIO] Maschine ${machineId} nicht gefunden oder keine VendonId`);
        return [];
      }

      const stockData = await getMachineStockData(machine.vendonId, machine.machineName);
      if (!stockData) {
        return [];
      }

      // Formatiere für die API-Response
      return stockData.products.map(product => ({
        productId: product.id,
        productName: product.name,
        currentQuantity: product.amount,
        maxQuantity: product.amountMax,
        fillRatio: product.fillRatio,
        fillPercentage: Math.round(product.fillRatio * 100),
        isCritical: product.isCritical,
        criticalLevel: product.amountCritical,
        machineName: stockData.machineName,
        machineId: stockData.machineId,
        selections: product.selections,
        units: product.units
      }));

    } catch (error) {
      console.error(`[STOCK RATIO] Fehler bei calculateStockRatiosForMachine für ${machineId}:`, error);
      return [];
    }
  }

  /**
   * Berechnet Stock-Ratios für alle Maschinen
   */
  async calculateAllStockRatios() {
    try {
      const machines = await getAllActiveMachines();
      console.log(`[STOCK RATIO] Berechne Stock-Ratios für ${machines.length} Maschinen`);

      const stockSummaries = [];

      for (const machine of machines) {
        if (!machine.vendonId) continue;

        const stockData = await getMachineStockData(machine.vendonId, machine.machineName);
        if (!stockData) continue;

        const filledSlots = stockData.products.filter(p => p.amount > 0).length;
        
        stockSummaries.push({
          machineId: machine.id,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          totalSlots: stockData.products.length,
          filledSlots,
          averageFillPercentage: Math.round(stockData.totalFillLevel * 100),
          criticalProducts: stockData.criticalProducts,
          lastUpdate: stockData.lastUpdate
        });

        // Kurze Pause zwischen API-Aufrufen
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[STOCK RATIO] ✅ Stock-Ratios für ${stockSummaries.length} Maschinen berechnet`);
      return stockSummaries;

    } catch (error) {
      console.error('[STOCK RATIO] Fehler bei calculateAllStockRatios:', error);
      return [];
    }
  }

  /**
   * Formatiert Stock-Daten für externe APIs
   */
  async getFormattedStockDataForExternalAPI() {
    try {
      const stockSummaries = await this.calculateAllStockRatios();
      
      const formattedData = {
        timestamp: new Date().toISOString(),
        totalMachines: stockSummaries.length,
        systemStatistics: {
          averageFillPercentage: stockSummaries.length > 0 
            ? Math.round(stockSummaries.reduce((sum, s) => sum + s.averageFillPercentage, 0) / stockSummaries.length)
            : 0,
          totalSlots: stockSummaries.reduce((sum, s) => sum + s.totalSlots, 0),
          totalFilledSlots: stockSummaries.reduce((sum, s) => sum + s.filledSlots, 0),
          machinesWithCriticalStock: stockSummaries.filter(s => s.criticalProducts > 0).length
        },
        machines: stockSummaries.map(summary => ({
          id: summary.machineId,
          name: summary.machineName,
          vendonId: summary.vendonId,
          fillPercentage: summary.averageFillPercentage,
          status: summary.averageFillPercentage < 20 ? 'critical' 
                : summary.averageFillPercentage < 50 ? 'low' 
                : summary.averageFillPercentage >= 80 ? 'full' : 'normal',
          totalSlots: summary.totalSlots,
          filledSlots: summary.filledSlots,
          criticalProducts: summary.criticalProducts,
          lastUpdate: summary.lastUpdate
        }))
      };

      return formattedData;

    } catch (error) {
      console.error('[STOCK RATIO] Fehler bei getFormattedStockDataForExternalAPI:', error);
      return {
        timestamp: new Date().toISOString(),
        totalMachines: 0,
        systemStatistics: {
          averageFillPercentage: 0,
          totalSlots: 0,
          totalFilledSlots: 0,
          machinesWithCriticalStock: 0
        },
        machines: [],
        error: 'Fehler beim Abrufen der Stock-Daten'
      };
    }
  }

  /**
   * Aktualisiert maximale Kapazitäten basierend auf Refill-Daten
   */
  async updateMaxQuantityFromRefills() {
    console.log('[STOCK RATIO] Starte Aktualisierung der maximalen Kapazitäten aus Refill-Daten...');
    
    try {
      // Implementierung würde hier erfolgen, basierend auf verfügbaren Refill-Daten
      // Für jetzt als Platzhalter markiert
      console.log('[STOCK RATIO] ⚠️ updateMaxQuantityFromRefills noch nicht vollständig implementiert');
      
      return {
        updatedMachines: 0,
        updatedProducts: 0,
        message: 'Funktion noch in Entwicklung - verwendet Vendon API für Echtzeit-Maximalwerte'
      };

    } catch (error) {
      console.error('[STOCK RATIO] Fehler bei updateMaxQuantityFromRefills:', error);
      throw error;
    }
  }
}

// Singleton-Instanz für den Export
export const stockRatioService = new StockRatioService();
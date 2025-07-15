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
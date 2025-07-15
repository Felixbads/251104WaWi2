/**
 * Stock Sync Service - Schlanker Service für regelmäßige Vendon API Stock-Synchronisation
 * 
 * Holt Bestandsdaten von der Vendon API und speichert sie in der machine_stocks Tabelle.
 * Ersetzt Live-API-Calls mit datenbankbasierten Abfragen für bessere Performance.
 */

import { db } from '../db';
import { machineStocks, machines, syncLogs } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { fetchMachineStock } from './vendonAPI';

export class StockSyncService {
  private isRunning = false;

  async syncAllMachineStocks(): Promise<{ success: boolean; message: string; stats: any }> {
    if (this.isRunning) {
      return { 
        success: false, 
        message: 'Stock sync bereits aktiv', 
        stats: {} 
      };
    }

    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log('[StockSync] Starte vollständige Maschinenbestand-Synchronisation...');
      
      // Log Sync-Start in sync_logs
      const [syncLog] = await db.insert(syncLogs).values({
        syncType: 'machine_stocks',
        startDate: startTime,
        syncStatus: 'running',
        entityType: 'machine_stocks'
      }).returning();

      // Hole alle aktiven Maschinen
      const activeMachines = await db
        .select({
          id: machines.id,
          vendonId: machines.vendonId,
          machineName: machines.machineName
        })
        .from(machines)
        .where(eq(machines.isActive, true));

      console.log(`[StockSync] Gefunden: ${activeMachines.length} aktive Maschinen`);

      let syncedMachines = 0;
      let totalProducts = 0;
      let errors = 0;

      for (const machine of activeMachines) {
        try {
          const vendonId = parseInt(machine.vendonId);
          if (isNaN(vendonId)) {
            console.warn(`[StockSync] Ungültige Vendon ID: ${machine.vendonId}`);
            continue;
          }

          console.log(`[StockSync] Synchronisiere Maschine: ${machine.machineName} (${vendonId})`);
          
          // Hole Bestandsdaten von Vendon API
          const stockData = await fetchMachineStock(vendonId);
          
          if (!stockData || !stockData.products) {
            console.warn(`[StockSync] Keine Produktdaten für Maschine ${vendonId}`);
            continue;
          }

          // Aktualisiere oder erstelle Bestände für alle Produkte
          for (const product of stockData.products) {
            try {
              // Prüfe ob bereits vorhanden
              const existingStock = await db
                .select()
                .from(machineStocks)
                .where(
                  and(
                    eq(machineStocks.machineId, machine.id),
                    eq(machineStocks.productVendonId, product.productId || '')
                  )
                )
                .limit(1);

              const stockRecord = {
                machineId: machine.id,
                machineVendonId: machine.vendonId,
                productVendonId: product.productId || '',
                selectionNumber: product.selectionNumber || '',
                quantity: product.quantity || 0,
                maxQuantity: product.maxQuantity || 0,
                status: 'active',
                lastFilled: product.lastFilled ? new Date(product.lastFilled) : null,
                rawData: JSON.stringify(product),
                lastSync: new Date()
              };

              if (existingStock.length > 0) {
                // Update existierenden Eintrag
                await db
                  .update(machineStocks)
                  .set(stockRecord)
                  .where(eq(machineStocks.id, existingStock[0].id));
              } else {
                // Neuen Eintrag erstellen
                await db
                  .insert(machineStocks)
                  .values(stockRecord);
              }

              totalProducts++;
            } catch (productError) {
              console.error(`[StockSync] Fehler bei Produkt ${product.productId}:`, productError);
              errors++;
            }
          }

          syncedMachines++;
          
          // Kurze Pause zwischen Maschinen
          await this.sleep(500);

        } catch (machineError) {
          console.error(`[StockSync] Fehler bei Maschine ${machine.vendonId}:`, machineError);
          errors++;
        }
      }

      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      // Update Sync-Log
      await db
        .update(syncLogs)
        .set({
          endDate: endTime,
          syncStatus: 'completed',
          itemsFound: syncedMachines,
          itemsSaved: totalProducts,
          errors: errors,
          durationSeconds: duration
        })
        .where(eq(syncLogs.id, syncLog.id));

      const stats = {
        totalMachines: activeMachines.length,
        syncedMachines,
        totalProducts,
        errors,
        duration: `${duration}s`
      };

      console.log(`[StockSync] ✅ Synchronisation abgeschlossen:`, stats);

      return {
        success: true,
        message: `${syncedMachines} Maschinen und ${totalProducts} Produkte synchronisiert`,
        stats
      };

    } catch (error) {
      console.error('[StockSync] Kritischer Fehler:', error);
      return {
        success: false,
        message: error.message,
        stats: { errors: 1 }
      };
    } finally {
      this.isRunning = false;
    }
  }

  async syncSingleMachine(vendonId: number): Promise<{ success: boolean; message: string; products?: number }> {
    try {
      console.log(`[StockSync] Synchronisiere einzelne Maschine: ${vendonId}`);

      // Hole Maschineninformationen
      const [machine] = await db
        .select({
          id: machines.id,
          vendonId: machines.vendonId,
          machineName: machines.machineName
        })
        .from(machines)
        .where(eq(machines.vendonId, vendonId.toString()))
        .limit(1);

      if (!machine) {
        return { success: false, message: `Maschine ${vendonId} nicht gefunden` };
      }

      // Hole Bestandsdaten von Vendon API
      const stockData = await fetchMachineStock(vendonId);
      
      if (!stockData || !stockData.products) {
        return { success: false, message: `Keine Bestandsdaten für Maschine ${vendonId}` };
      }

      let productsUpdated = 0;

      // Aktualisiere alle Produkte für diese Maschine
      for (const product of stockData.products) {
        const existingStock = await db
          .select()
          .from(machineStocks)
          .where(
            and(
              eq(machineStocks.machineId, machine.id),
              eq(machineStocks.productVendonId, product.productId || '')
            )
          )
          .limit(1);

        const stockRecord = {
          machineId: machine.id,
          machineVendonId: machine.vendonId,
          productVendonId: product.productId || '',
          selectionNumber: product.selectionNumber || '',
          quantity: product.quantity || 0,
          maxQuantity: product.maxQuantity || 0,
          status: 'active',
          lastFilled: product.lastFilled ? new Date(product.lastFilled) : null,
          rawData: JSON.stringify(product),
          lastSync: new Date()
        };

        if (existingStock.length > 0) {
          await db
            .update(machineStocks)
            .set(stockRecord)
            .where(eq(machineStocks.id, existingStock[0].id));
        } else {
          await db
            .insert(machineStocks)
            .values(stockRecord);
        }

        productsUpdated++;
      }

      console.log(`[StockSync] ✅ Maschine ${vendonId}: ${productsUpdated} Produkte synchronisiert`);

      return {
        success: true,
        message: `${productsUpdated} Produkte für Maschine ${machine.machineName} synchronisiert`,
        products: productsUpdated
      };

    } catch (error) {
      console.error(`[StockSync] Fehler bei Maschine ${vendonId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getStockStats(): Promise<any> {
    try {
      const totalStocks = await db
        .select()
        .from(machineStocks);

      const recentSync = await db
        .select()
        .from(syncLogs)
        .where(eq(syncLogs.syncType, 'machine_stocks'))
        .orderBy(syncLogs.startDate)
        .limit(1);

      return {
        totalStockEntries: totalStocks.length,
        lastSync: recentSync[0]?.startDate || null,
        isRunning: this.isRunning
      };
    } catch (error) {
      console.error('[StockSync] Fehler bei Stats:', error);
      return { error: error.message };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton Export
export const stockSyncService = new StockSyncService();
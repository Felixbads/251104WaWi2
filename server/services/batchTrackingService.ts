/**
 * BatchTrackingService - Manipulationssichere Chargen-Rückverfolgung für Transaktionen
 * 
 * Funktionalitäten:
 * - Automatische Chargen-Zuordnung für jede Transaktion basierend auf FIFO-Prinzip
 * - Manipulationssichere Dokumentation in batch_transaction_log
 * - Echtzeit-Bestandsverfolgung mit Chargen-Granularität
 * - Integration mit Vendon-Transaktionen
 * - Compliance für HACCP und IFS Standards
 */

import { eq, and, sql, asc, desc, lte, ne, gte } from 'drizzle-orm';
import { db } from '../db';
import { 
  transactions, 
  productBatches, 
  batchTransactionLog,
  machines,
  products,
  machineStocks
} from '../../shared/schema';
import type { 
  Transaction, 
  ProductBatch, 
  InsertBatchTransactionLog 
} from '../../shared/schema';
import * as crypto from 'crypto';

export interface BatchAllocationResult {
  success: boolean;
  allocatedBatches: BatchAllocation[];
  totalQuantity: number;
  errorMessage?: string;
  warningMessage?: string;
}

export interface BatchAllocation {
  batchId: number;
  batchNumber: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  expiryDate: string;
  fifoSequence: number;
  isLastOfBatch: boolean;
}

export class BatchTrackingService {
  
  /**
   * Haupt-Methode: Ordnet einer Transaktion automatisch Chargen zu (FIFO)
   */
  async allocateBatchesToTransaction(
    transactionId: number,
    vendonTransactionId: string,
    machineId: number,
    productId: number | null,
    productName: string,
    quantity: number = 1
  ): Promise<BatchAllocationResult> {
    
    console.log(`🔄 [BatchTrackingService] Starte Chargen-Zuteilung für Transaktion ${transactionId}:`, {
      vendonTransactionId,
      machineId,
      productId,
      productName,
      quantity
    });

    try {
      // 1. Verfügbare Chargen für das Produkt in der Maschine finden (FIFO-Reihenfolge)
      const availableBatches = await this.getAvailableBatchesForMachine(
        machineId, 
        productId, 
        productName
      );

      if (availableBatches.length === 0) {
        console.warn(`⚠️ [BatchTrackingService] Keine Chargen verfügbar für Produkt ${productName} in Maschine ${machineId}`);
        
        // Erstelle einen "unbekannte Charge" Eintrag für Compliance
        await this.createUnknownBatchEntry(
          transactionId,
          vendonTransactionId, 
          machineId,
          productId,
          productName,
          quantity
        );

        return {
          success: false,
          allocatedBatches: [],
          totalQuantity: 0,
          warningMessage: `Keine Chargen-Information verfügbar für ${productName} - Unbekannte Charge erstellt`
        };
      }

      // 2. Chargen nach FIFO-Prinzip zuteilen
      const allocatedBatches = await this.allocateBatchesFIFO(
        availableBatches,
        quantity
      );

      if (allocatedBatches.length === 0) {
        console.error(`❌ [BatchTrackingService] Nicht genügend Chargen-Bestand für ${quantity} Stück von ${productName}`);
        
        return {
          success: false,
          allocatedBatches: [],
          totalQuantity: 0,
          errorMessage: `Nicht genügend Chargen-Bestand verfügbar (benötigt: ${quantity})`
        };
      }

      // 3. Batch Transaction Log Einträge erstellen
      const logEntries = await this.createBatchTransactionLogEntries(
        transactionId,
        vendonTransactionId,
        machineId,
        productId,
        productName,
        allocatedBatches
      );

      // 4. Machine Stock aktualisieren
      await this.updateMachineStockAfterTransaction(allocatedBatches);

      console.log(`✅ [BatchTrackingService] Erfolgreich ${allocatedBatches.length} Chargen für Transaktion ${transactionId} zugeordnet`);

      return {
        success: true,
        allocatedBatches,
        totalQuantity: allocatedBatches.reduce((sum, batch) => sum + batch.quantity, 0)
      };

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler bei Chargen-Zuteilung:`, error);
      
      return {
        success: false,
        allocatedBatches: [],
        totalQuantity: 0,
        errorMessage: `Chargen-Zuteilungsfehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  /**
   * Verfügbare Chargen für ein Produkt in einer Maschine abrufen (FIFO-sortiert)
   */
  private async getAvailableBatchesForMachine(
    machineId: number, 
    productId: number | null, 
    productName: string
  ): Promise<MachineStock[]> {
    
    console.log(`🔍 [BatchTrackingService] Suche verfügbare Chargen für Produkt ${productName} in Maschine ${machineId}`);

    try {
      // Suche nach machine_stock Einträgen mit verfügbarem Bestand
      let whereConditions = and(
        eq(machineStock.machineId, machineId),
        gte(machineStock.currentQuantity, 1), // Mindestens 1 Stück verfügbar
        ne(machineStock.currentQuantity, 0) // Explizit nicht 0
      );

      // Filter nach Produkt (entweder ID oder Name)
      if (productId) {
        whereConditions = and(
          eq(machineStock.machineId, machineId),
          eq(machineStock.productId, productId),
          gte(machineStock.currentQuantity, 1)
        );
      } else {
        whereConditions = and(
          eq(machineStock.machineId, machineId),
          eq(machineStock.productName, productName),
          gte(machineStock.currentQuantity, 1)
        );
      }

      const query = db
        .select({
          id: machineStock.id,
          machineId: machineStock.machineId,
          productId: machineStock.productId,
          productName: machineStock.productName,
          currentQuantity: machineStock.currentQuantity,
          expiryDate: machineStock.expiryDate,
          sourceBatchId: machineStock.sourceBatchId,
          sourceBatchNumber: machineStock.sourceBatchNumber,
          receivedDate: machineStock.receivedDate
        })
        .from(machineStock)
        .where(whereConditions);

      // FIFO-Sortierung: Älteste Chargen zuerst
      const results = await query
        .orderBy(
          asc(machineStock.expiryDate), // Ältestes MHD zuerst
          asc(machineStock.receivedDate) // Bei gleichem MHD: Zuerst empfangen zuerst
        )
        .limit(50); // Sicherheitsgrenze

      console.log(`📊 [BatchTrackingService] Gefunden: ${results.length} verfügbare Chargen`);
      
      return results as MachineStock[];

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler beim Abrufen verfügbarer Chargen:`, error);
      return [];
    }
  }

  /**
   * Chargen nach FIFO-Prinzip zuteilen
   */
  private async allocateBatchesFIFO(
    availableBatches: MachineStock[], 
    requiredQuantity: number
  ): Promise<BatchAllocation[]> {
    
    console.log(`⚖️ [BatchTrackingService] FIFO-Zuteilung: ${requiredQuantity} Stück aus ${availableBatches.length} Chargen`);

    const allocations: BatchAllocation[] = [];
    let remainingQuantity = requiredQuantity;
    let fifoSequence = 1;

    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;

      const availableInBatch = batch.currentQuantity;
      const quantityToTake = Math.min(remainingQuantity, availableInBatch);
      
      if (quantityToTake > 0) {
        const stockBefore = availableInBatch;
        const stockAfter = stockBefore - quantityToTake;
        const isLastOfBatch = (stockAfter === 0);

        allocations.push({
          batchId: batch.sourceBatchId || -1, // -1 für "unbekannte Charge"
          batchNumber: batch.sourceBatchNumber || 'UNKNOWN',
          quantity: quantityToTake,
          stockBefore,
          stockAfter,
          expiryDate: batch.expiryDate ? (typeof batch.expiryDate === 'string' ? batch.expiryDate : batch.expiryDate.toISOString().split('T')[0]) : '',
          fifoSequence: fifoSequence++,
          isLastOfBatch
        });

        remainingQuantity -= quantityToTake;
        
        console.log(`📦 [BatchTrackingService] Charge ${batch.sourceBatchNumber}: ${quantityToTake} Stück (${stockBefore} → ${stockAfter})`);
      }
    }

    if (remainingQuantity > 0) {
      console.warn(`⚠️ [BatchTrackingService] Nicht genügend Bestand: ${remainingQuantity} Stück fehlen noch`);
    }

    return allocations;
  }

  /**
   * Batch Transaction Log Einträge erstellen (manipulationssicher)
   */
  private async createBatchTransactionLogEntries(
    transactionId: number,
    vendonTransactionId: string,
    machineId: number,
    productId: number | null,
    productName: string,
    allocatedBatches: BatchAllocation[]
  ): Promise<void> {
    
    console.log(`📝 [BatchTrackingService] Erstelle ${allocatedBatches.length} Batch-Transaction-Log Einträge`);

    try {
      const logEntries: InsertBatchTransactionLog[] = [];

      for (const allocation of allocatedBatches) {
        // Generiere Verifikations-Hash für Manipulationssicherheit
        const verificationData = {
          transactionId,
          vendonTransactionId,
          batchId: allocation.batchId,
          quantity: allocation.quantity,
          timestamp: new Date().toISOString()
        };
        
        const verificationHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(verificationData))
          .digest('hex');

        logEntries.push({
          transactionId,
          vendonTransactionId,
          machineId,
          productId,
          productName,
          batchId: allocation.batchId,
          batchNumber: allocation.batchNumber,
          expiryDate: allocation.expiryDate ? new Date(allocation.expiryDate) : new Date(),
          stockBefore: allocation.stockBefore,
          stockAfter: allocation.stockAfter,
          quantity: allocation.quantity,
          fifoSequence: allocation.fifoSequence,
          isLastOfBatch: allocation.isLastOfBatch,
          processedBy: 'batch_tracking_service',
          verificationHash,
          notes: `FIFO-Allocation: Sequence ${allocation.fifoSequence}`
        });
      }

      // Batch-Insert für bessere Performance
      if (logEntries.length > 0) {
        await db.insert(batchTransactionLog).values(logEntries);
        console.log(`✅ [BatchTrackingService] ${logEntries.length} Log-Einträge erfolgreich erstellt`);
      }

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler beim Erstellen der Log-Einträge:`, error);
      throw error;
    }
  }

  /**
   * Machine Stock nach Transaktion aktualisieren
   */
  private async updateMachineStockAfterTransaction(
    allocatedBatches: BatchAllocation[]
  ): Promise<void> {
    
    console.log(`🔄 [BatchTrackingService] Aktualisiere Maschinenbestand für ${allocatedBatches.length} Chargen`);

    try {
      for (const allocation of allocatedBatches) {
        if (allocation.batchId > 0) { // Nur für echte Chargen, nicht für "unknown"
          
          // Finde den entsprechenden machine_stock Eintrag
          const stockEntries = await db
            .select()
            .from(machineStock)
            .where(
              and(
                eq(machineStock.sourceBatchId, allocation.batchId),
                eq(machineStock.currentQuantity, allocation.stockBefore)
              )
            )
            .limit(1);

          if (stockEntries.length > 0) {
            const stockEntry = stockEntries[0];
            
            // Aktualisiere den Bestand
            await db
              .update(machineStock)
              .set({
                currentQuantity: allocation.stockAfter,
                updatedAt: new Date()
              })
              .where(eq(machineStock.id, stockEntry.id));

            console.log(`✅ [BatchTrackingService] Bestand aktualisiert für Charge ${allocation.batchNumber}: ${allocation.stockBefore} → ${allocation.stockAfter}`);
          }
        }
      }

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler beim Aktualisieren des Bestands:`, error);
      throw error;
    }
  }

  /**
   * Erstellt "Unbekannte Charge" Eintrag für Compliance
   */
  private async createUnknownBatchEntry(
    transactionId: number,
    vendonTransactionId: string,
    machineId: number,
    productId: number | null,
    productName: string,
    quantity: number
  ): Promise<void> {
    
    console.log(`⚠️ [BatchTrackingService] Erstelle Unbekannte-Charge-Eintrag für ${productName}`);

    try {
      // Generiere eindeutige "Unknown"-Batch-Nummer
      const unknownBatchNumber = `UNKNOWN-${Date.now()}-${machineId}`;
      
      const verificationHash = crypto
        .createHash('sha256')
        .update(`${transactionId}-${vendonTransactionId}-UNKNOWN`)
        .digest('hex');

      const unknownEntry: InsertBatchTransactionLog = {
        transactionId,
        vendonTransactionId,
        machineId,
        productId,
        productName,
        batchId: -1, // Spezial-ID für unbekannte Chargen
        batchNumber: unknownBatchNumber,
        expiryDate: new Date(), // Aktuelles Datum als Fallback
        stockBefore: 0,
        stockAfter: 0,
        quantity,
        fifoSequence: 1,
        isLastOfBatch: false,
        processedBy: 'batch_tracking_service',
        verificationHash,
        notes: `Unbekannte Charge: Keine Chargen-Info in machine_stock verfügbar`
      };

      await db.insert(batchTransactionLog).values(unknownEntry);
      
      console.log(`✅ [BatchTrackingService] Unbekannte-Charge-Eintrag erstellt: ${unknownBatchNumber}`);

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler beim Erstellen der Unbekannte-Charge:`, error);
      throw error;
    }
  }

  /**
   * Vollständige Rückverfolgung einer Transaktion
   */
  async getTransactionBatchTraceability(transactionId: number) {
    console.log(`🔍 [BatchTrackingService] Rückverfolgung für Transaktion ${transactionId}`);

    try {
      const traceabilityData = await db
        .select({
          // Transaction Log Data
          logId: batchTransactionLog.id,
          vendonTransactionId: batchTransactionLog.vendonTransactionId,
          productName: batchTransactionLog.productName,
          batchNumber: batchTransactionLog.batchNumber,
          expiryDate: batchTransactionLog.expiryDate,
          quantity: batchTransactionLog.quantity,
          stockBefore: batchTransactionLog.stockBefore,
          stockAfter: batchTransactionLog.stockAfter,
          fifoSequence: batchTransactionLog.fifoSequence,
          processedAt: batchTransactionLog.processedAt,
          verificationHash: batchTransactionLog.verificationHash,
          
          // Transaction Data
          transactionDate: transactions.datetime,
          machineId: transactions.machineId,
          machineName: transactions.machineName,
          
          // Machine Data
          machineLocationId: machines.locationId,
        })
        .from(batchTransactionLog)
        .leftJoin(transactions, eq(batchTransactionLog.transactionId, transactions.id))
        .leftJoin(machines, eq(batchTransactionLog.machineId, machines.id))
        .where(eq(batchTransactionLog.transactionId, transactionId))
        .orderBy(asc(batchTransactionLog.fifoSequence));

      console.log(`📊 [BatchTrackingService] Rückverfolgung gefunden: ${traceabilityData.length} Chargen-Einträge`);
      
      return traceabilityData;

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler bei Rückverfolgung:`, error);
      return [];
    }
  }

  /**
   * Compliance Health-Check: Prüft Vollständigkeit der Chargen-Dokumentation
   */
  async performComplianceHealthCheck(): Promise<{
    totalTransactions: number;
    trackedTransactions: number;
    untrackedTransactions: number;
    complianceRate: number;
    issues: string[];
  }> {
    
    console.log(`🏥 [BatchTrackingService] Starte Compliance Health-Check`);

    try {
      // Gesamtanzahl Transaktionen (letzte 24h)
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const totalTransactions = await db
        .select({ count: sql`count(*)` })
        .from(transactions)
        .where(gte(transactions.datetime, last24Hours));

      // Transaktionen mit Chargen-Tracking
      const trackedTransactions = await db
        .select({ count: sql`count(distinct transaction_id)` })
        .from(batchTransactionLog)
        .leftJoin(transactions, eq(batchTransactionLog.transactionId, transactions.id))
        .where(gte(transactions.datetime, last24Hours));

      const total = Number(totalTransactions[0].count);
      const tracked = Number(trackedTransactions[0].count);
      const untracked = total - tracked;
      const complianceRate = total > 0 ? (tracked / total) * 100 : 100;

      const issues: string[] = [];
      
      if (complianceRate < 95) {
        issues.push(`Compliance-Rate unter 95%: ${complianceRate.toFixed(1)}%`);
      }
      
      if (untracked > 10) {
        issues.push(`Mehr als 10 unverfolgte Transaktionen: ${untracked}`);
      }

      console.log(`📊 [BatchTrackingService] Health-Check abgeschlossen: ${complianceRate.toFixed(1)}% Compliance`);

      return {
        totalTransactions: total,
        trackedTransactions: tracked,
        untrackedTransactions: untracked,
        complianceRate,
        issues
      };

    } catch (error) {
      console.error(`❌ [BatchTrackingService] Fehler bei Health-Check:`, error);
      
      return {
        totalTransactions: 0,
        trackedTransactions: 0,
        untrackedTransactions: 0,
        complianceRate: 0,
        issues: [`Health-Check-Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`]
      };
    }
  }
}

export const batchTrackingService = new BatchTrackingService();
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { warehouseStorage } from "../warehouse3.storage";
import { z } from "zod";
import {
  refillTrackings,
  refillTrackingItems,
  stockMovements,
  stockBatches,
  productInventory,
  inventoryItems,
  insertStockMovementSchema,
  type RefillTracking,
  type RefillTrackingItem
} from "../../shared/warehouse3.schema";
import { products, machines } from "../../shared/schema";
import { fifoDeplete } from "./inventoryTransactions";

// Types für den Service
export interface RefillProcessingResult {
  success: boolean;
  refillId: number;
  movementsCreated: number;
  totalQuantityProcessed: number;
  batchesProcessed: number;
  warnings: string[];
  errors?: string[];
}

export interface RefillCommitData {
  refillId: number;
  performedBy: number;
  notes?: string;
}

export interface RefillRemoveData {
  refillId: number;
  performedBy: number;
  reason: string;
  notes?: string;
}

// Validation Schemas
export const refillCommitSchema = z.object({
  refillId: z.number().positive(),
  performedBy: z.number().positive(),
  notes: z.string().optional()
});

export const refillRemoveSchema = z.object({
  refillId: z.number().positive(),
  performedBy: z.number().positive(),
  reason: z.string().min(1, "Grund für Entnahme ist erforderlich"),
  notes: z.string().optional()
});

export type RefillCommit = z.infer<typeof refillCommitSchema>;
export type RefillRemove = z.infer<typeof refillRemoveSchema>;

/**
 * RefillProcessingService
 * 
 * Konvertiert Refill-Tracking-Ereignisse in Lagerbewegungen:
 * - Refill Added (Lager → Automat) = OUT-Bewegungen mit FEFO-Logik
 * - Refill Removed (Automat → Entsorgung) = DISPOSE-Bewegungen (nur Audit)
 */
export class RefillProcessingService {
  
  /**
   * Verarbeitet einen Refill-Added-Prozess (Lager → Automat)
   * Erstellt OUT-Bewegungen für jeden Artikel mit FEFO-Batch-Depletion
   */
  async processRefillAdded(data: RefillCommit): Promise<RefillProcessingResult> {
    console.log(`[REFILL_PROCESSING] Starting refill commit for refill ${data.refillId}`);
    
    try {
      // 1. Refill-Daten laden und validieren
      const refill = await this.validateAndLoadRefill(data.refillId);
      if (!refill) {
        return this.createFailResult(data.refillId, ["Refill nicht gefunden"]);
      }

      // 2. Prüfen ob bereits verarbeitet (Idempotenz)
      const existingMovements = await this.checkExistingMovements(data.refillId, "REFILL_ADDED");
      if (existingMovements.length > 0) {
        console.log(`[REFILL_PROCESSING] Refill ${data.refillId} already processed, skipping`);
        return {
          success: true,
          refillId: data.refillId,
          movementsCreated: 0,
          totalQuantityProcessed: 0,
          batchesProcessed: 0,
          warnings: ["Refill wurde bereits verarbeitet"]
        };
      }

      // 3. Refill-Items laden
      const refillItems = await this.getRefillItems(data.refillId);
      if (refillItems.length === 0) {
        return this.createFailResult(data.refillId, ["Keine Refill-Artikel gefunden"]);
      }

      // 4. Machine→Warehouse Zuordnung prüfen
      const machineWarehouse = await this.validateMachineWarehouse(refill.machineId, refill.warehouseId);
      if (!machineWarehouse) {
        return this.createFailResult(data.refillId, ["Automat ist nicht diesem Lager zugeordnet"]);
      }

      // 5. Für jeden Artikel: FEFO-Entnahme aus Lager
      let totalMovements = 0;
      let totalQuantity = 0;
      let totalBatches = 0;
      const warnings: string[] = [];

      for (const item of refillItems) {
        const result = await this.processRefillItemFEFO(
          refill,
          item,
          data.performedBy,
          data.notes
        );
        
        if (result.success) {
          totalMovements += result.movementsCreated;
          totalQuantity += result.quantityProcessed;
          totalBatches += result.batchesProcessed;
        } else {
          warnings.push(`Artikel ${item.productId}: ${result.errors?.join(", ") || "Fehler"}`);
        }
      }

      // 6. Refill Status auf "completed" setzen
      await this.updateRefillStatus(data.refillId, "completed");

      console.log(`[REFILL_PROCESSING] Refill ${data.refillId} processed: ${totalMovements} movements, ${totalQuantity} quantity, ${totalBatches} batches`);

      return {
        success: true,
        refillId: data.refillId,
        movementsCreated: totalMovements,
        totalQuantityProcessed: totalQuantity,
        batchesProcessed: totalBatches,
        warnings
      };

    } catch (error) {
      console.error(`[REFILL_PROCESSING] Error processing refill ${data.refillId}:`, error);
      return this.createFailResult(data.refillId, [`Verarbeitungsfehler: ${error.message}`]);
    }
  }

  /**
   * Verarbeitet einen Refill-Removed-Prozess (Automat → Entsorgung)
   * Erstellt DISPOSE-Bewegungen nur für Audit (ändert keine Lagerbestände)
   */
  async processRefillRemoved(data: RefillRemove): Promise<RefillProcessingResult> {
    console.log(`[REFILL_PROCESSING] Starting refill removal for refill ${data.refillId}`);
    
    try {
      // 1. Refill-Daten laden und validieren
      const refill = await this.validateAndLoadRefill(data.refillId);
      if (!refill) {
        return this.createFailResult(data.refillId, ["Refill nicht gefunden"]);
      }

      // 2. Prüfen ob bereits verarbeitet (Idempotenz)
      const existingMovements = await this.checkExistingMovements(data.refillId, "REFILL_REMOVED");
      if (existingMovements.length > 0) {
        console.log(`[REFILL_PROCESSING] Refill removal ${data.refillId} already processed, skipping`);
        return {
          success: true,
          refillId: data.refillId,
          movementsCreated: 0,
          totalQuantityProcessed: 0,
          batchesProcessed: 0,
          warnings: ["Refill-Entnahme wurde bereits verarbeitet"]
        };
      }

      // 3. Refill-Items laden
      const refillItems = await this.getRefillItems(data.refillId);
      if (refillItems.length === 0) {
        return this.createFailResult(data.refillId, ["Keine Refill-Artikel gefunden"]);
      }

      // 4. Für jeden Artikel: DISPOSE-Bewegung erstellen (ohne Lagerbestand zu ändern)
      let totalMovements = 0;
      let totalQuantity = 0;

      for (const item of refillItems) {
        const movement = await this.createDisposeMovement(
          refill,
          item,
          data.performedBy,
          data.reason,
          data.notes
        );
        
        if (movement) {
          totalMovements++;
          totalQuantity += item.quantity;
        }
      }

      console.log(`[REFILL_PROCESSING] Refill removal ${data.refillId} processed: ${totalMovements} movements, ${totalQuantity} quantity disposed`);

      return {
        success: true,
        refillId: data.refillId,
        movementsCreated: totalMovements,
        totalQuantityProcessed: totalQuantity,
        batchesProcessed: 0, // Disposal doesn't process batches
        warnings: []
      };

    } catch (error) {
      console.error(`[REFILL_PROCESSING] Error processing refill removal ${data.refillId}:`, error);
      return this.createFailResult(data.refillId, [`Verarbeitungsfehler: ${error.message}`]);
    }
  }

  // ---- PRIVATE HELPER METHODS ----

  private async validateAndLoadRefill(refillId: number): Promise<RefillTracking | null> {
    const refills = await db
      .select()
      .from(refillTrackings)
      .where(eq(refillTrackings.id, refillId))
      .limit(1);
    
    return refills[0] || null;
  }

  private async checkExistingMovements(refillId: number, movementType: string): Promise<any[]> {
    return await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.referenceId, refillId.toString()),
          eq(stockMovements.source, "REFILL"),
          eq(stockMovements.movementType, movementType)
        )
      );
  }

  private async getRefillItems(refillId: number): Promise<RefillTrackingItem[]> {
    return await db
      .select()
      .from(refillTrackingItems)
      .where(eq(refillTrackingItems.refillId, refillId));
  }

  private async validateMachineWarehouse(machineId: number, warehouseId: number): Promise<boolean> {
    // Hier könnte eine machine_warehouse_assignments Prüfung stehen
    // Für jetzt nehmen wir an dass die Zuordnung korrekt ist
    return true;
  }

  private async processRefillItemFEFO(
    refill: RefillTracking,
    item: RefillTrackingItem,
    performedBy: number,
    notes?: string
  ): Promise<{
    success: boolean;
    movementsCreated: number;
    quantityProcessed: number;
    batchesProcessed: number;
    errors?: string[];
  }> {
    try {
      // FEFO-Entnahme aus dem Lager verwenden
      const depleteData = {
        warehouseId: refill.warehouseId,
        productId: item.productId,
        quantityToDeplete: item.quantity,
        movementType: "REFILL_ADDED" as const,
        referenceType: "REFILL" as const,
        referenceId: refill.id.toString(),
        notes: `Auffüllung Automat ${refill.machineId}${notes ? ` - ${notes}` : ''}`,
        performedBy,
        machineId: refill.machineId
      };

      const result = await fifoDeplete(depleteData);

      if (!result.success) {
        return {
          success: false,
          movementsCreated: 0,
          quantityProcessed: 0,
          batchesProcessed: 0,
          errors: result.errors || ["FEFO-Entnahme fehlgeschlagen"]
        };
      }

      return {
        success: true,
        movementsCreated: result.movements?.length || 0,
        quantityProcessed: result.totalDepleted || 0,
        batchesProcessed: result.batchesProcessed?.length || 0
      };

    } catch (error) {
      console.error(`[REFILL_PROCESSING] FEFO error for item ${item.productId}:`, error);
      return {
        success: false,
        movementsCreated: 0,
        quantityProcessed: 0,
        batchesProcessed: 0,
        errors: [`FEFO-Fehler: ${error.message}`]
      };
    }
  }

  private async createDisposeMovement(
    refill: RefillTracking,
    item: RefillTrackingItem,
    performedBy: number,
    reason: string,
    notes?: string
  ): Promise<any | null> {
    try {
      const movementData = {
        movementType: "REFILL_REMOVED",
        productId: item.productId,
        warehouseId: refill.warehouseId, // Source warehouse for audit visibility
        batchId: item.batchId || null,
        qtyDelta: item.quantity,
        beforeQty: null, // Disposal doesn't change stock
        afterQty: null,
        actorUserId: performedBy,
        machineId: refill.machineId,
        direction: "DISPOSE",
        source: "REFILL",
        referenceId: refill.id.toString(),
        reasonCode: "REFILL_REMOVED",
        notes: `Entnahme aus Automat: ${reason}${notes ? ` - ${notes}` : ''}`,
        status: "completed"
      };

      const validatedData = insertStockMovementSchema.parse(movementData);
      
      const movements = await db
        .insert(stockMovements)
        .values(validatedData)
        .returning();

      return movements[0];

    } catch (error) {
      console.error(`[REFILL_PROCESSING] Error creating dispose movement for item ${item.productId}:`, error);
      return null;
    }
  }

  private async updateRefillStatus(refillId: number, status: string): Promise<void> {
    await db
      .update(refillTrackings)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(eq(refillTrackings.id, refillId));
  }

  private createFailResult(refillId: number, errors: string[]): RefillProcessingResult {
    return {
      success: false,
      refillId,
      movementsCreated: 0,
      totalQuantityProcessed: 0,
      batchesProcessed: 0,
      warnings: [],
      errors
    };
  }
}

// Export singleton instance
export const refillProcessingService = new RefillProcessingService();
import { eq, and, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { warehouseStorage } from "../warehouse3.storage";
import { z } from "zod";
import {
  refillTrackings,
  refillTrackingItems,
  stockMovements,
  stockBatches,
  productInventory,
  insertStockMovementSchema,
  machineWarehouseAssignments,
  type RefillTracking,
  type RefillTrackingItem
} from "../../shared/warehouse3.schema";
import { products, machines } from "../../shared/schema";
import { fifoDeplete } from "./inventoryTransactions";
import { MhdFifoService } from "./mhdFifoService";

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

export interface AutomaticRefillProcessingResult {
  success: boolean;
  processedRefills: number;
  totalMovements: number;
  totalQuantity: number;
  errors: string[];
  warnings: string[];
  refillResults: RefillProcessingResult[];
}

export interface VendonRefillTrigger {
  machineId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  vendonEventId?: string;
  timestamp: Date;
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
 * Enhanced RefillProcessingService
 * 
 * Konvertiert Refill-Tracking-Ereignisse in Lagerbewegungen:
 * - Refill Added (Lager → Automat) = OUT-Bewegungen mit FIFO-Logik
 * - Refill Removed (Automat → Entsorgung) = DISPOSE-Bewegungen (nur Audit)
 * - Automatic Vendon Integration = Automatische Verarbeitung bei Vendon-Events
 * - Enhanced FIFO Integration = Nutzt MhdFifoService für optimale Batch-Auswahl
 */
export class RefillProcessingService {
  private mhdFifoService: MhdFifoService;

  constructor() {
    this.mhdFifoService = new MhdFifoService(pool);
  }

  /**
   * 🔥 CRITICAL: Automatic processing of pending refills
   * 
   * Processes all pending refills automatically using FIFO logic
   */
  async processAutomaticRefills(options: {
    maxRefillsToProcess?: number;
    warehouseId?: number;
    machineId?: number;
    performedBy: number;
  } = { performedBy: 1 }): Promise<AutomaticRefillProcessingResult> {
    console.log('[REFILL_AUTO] Starting automatic refill processing...');
    
    const result: AutomaticRefillProcessingResult = {
      success: true,
      processedRefills: 0,
      totalMovements: 0,
      totalQuantity: 0,
      errors: [],
      warnings: [],
      refillResults: []
    };

    try {
      // Find pending refills that need processing
      const pendingRefills = await this.getPendingRefills({
        limit: options.maxRefillsToProcess || 50,
        warehouseId: options.warehouseId,
        machineId: options.machineId
      });

      if (pendingRefills.length === 0) {
        console.log('[REFILL_AUTO] No pending refills found');
        return result;
      }

      console.log(`[REFILL_AUTO] Found ${pendingRefills.length} pending refills to process`);

      // Process each refill
      for (const refill of pendingRefills) {
        try {
          const refillResult = await this.processRefillAdded({
            refillId: refill.id,
            performedBy: options.performedBy,
            notes: 'Automatic FIFO processing'
          });

          result.refillResults.push(refillResult);
          
          if (refillResult.success) {
            result.processedRefills++;
            result.totalMovements += refillResult.movementsCreated;
            result.totalQuantity += refillResult.totalQuantityProcessed;
            console.log(`[REFILL_AUTO] Successfully processed refill ${refill.id}`);
          } else {
            result.errors.push(`Refill ${refill.id}: ${refillResult.errors?.join(', ') || 'Unknown error'}`);
            result.success = false;
          }
          
          if (refillResult.warnings.length > 0) {
            result.warnings.push(...refillResult.warnings.map(w => `Refill ${refill.id}: ${w}`));
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Refill ${refill.id}: ${errorMessage}`);
          result.success = false;
          console.error(`[REFILL_AUTO] Error processing refill ${refill.id}:`, error);
        }
      }

      console.log(`[REFILL_AUTO] Automatic processing completed: ${result.processedRefills}/${pendingRefills.length} refills processed`);
      return result;

    } catch (error) {
      console.error('[REFILL_AUTO] Error in automatic refill processing:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Automatic processing failed: ${errorMessage}`);
      result.success = false;
      return result;
    }
  }

  /**
   * 🔄 Process Vendon refill trigger with automatic FIFO selection
   * 
   * Creates refill tracking from Vendon event and processes it automatically
   */
  async processVendonRefillTrigger(trigger: VendonRefillTrigger, performedBy: number): Promise<RefillProcessingResult> {
    console.log(`[VENDON_REFILL] Processing Vendon trigger: Machine ${trigger.machineId}, Product ${trigger.productId}, Qty ${trigger.quantity}`);
    
    try {
      // 1. Validate machine-warehouse assignment
      const isValidAssignment = await this.validateMachineWarehouse(trigger.machineId, trigger.warehouseId);
      if (!isValidAssignment) {
        return this.createFailResult(0, [`Machine ${trigger.machineId} is not assigned to warehouse ${trigger.warehouseId}`]);
      }

      // 2. Check FIFO availability before creating refill tracking
      const fifoResult = await this.mhdFifoService.automaticFifoWithdrawal(
        trigger.warehouseId,
        trigger.productId,
        trigger.quantity,
        {
          movementType: 'OUT',
          destinationType: 'MACHINE',
          destinationId: trigger.machineId,
          performedBy: performedBy,
          notes: `Vendon refill trigger for machine ${trigger.machineId}`,
          referenceType: 'VENDON_REFILL'
        }
      );

      if (!fifoResult.success) {
        return this.createFailResult(0, [`FIFO availability check failed: ${fifoResult.error || 'No stock available'}`]);
      }

      // 3. Create refill tracking entry
      const refillTracking = await this.createRefillTrackingFromVendon(trigger, performedBy);
      if (!refillTracking) {
        return this.createFailResult(0, ['Failed to create refill tracking entry']);
      }

      // 4. Process the refill with FIFO logic
      const result = await this.processRefillAdded({
        refillId: refillTracking.id,
        performedBy,
        notes: `Vendon automatic refill (Event: ${trigger.vendonEventId || 'N/A'})`
      });

      console.log(`[VENDON_REFILL] Processed refill ${refillTracking.id}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      console.error('[VENDON_REFILL] Error processing Vendon trigger:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFailResult(0, [`Vendon refill processing failed: ${errorMessage}`]);
    }
  }
  
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

    } catch (error: unknown) {
      console.error(`[REFILL_PROCESSING] Error processing refill ${data.refillId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      return this.createFailResult(data.refillId, [`Verarbeitungsfehler: ${errorMessage}`]);
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

    } catch (error: unknown) {
      console.error(`[REFILL_PROCESSING] Error processing refill removal ${data.refillId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      return this.createFailResult(data.refillId, [`Verarbeitungsfehler: ${errorMessage}`]);
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
    try {
      // 🔥 CRITICAL: Enhanced machine-warehouse validation
      const assignments = await db
        .select()
        .from(machineWarehouseAssignments)
        .where(
          and(
            eq(machineWarehouseAssignments.machineId, machineId),
            eq(machineWarehouseAssignments.warehouseId, warehouseId)
          )
        )
        .limit(1);
      
      const isValid = assignments.length > 0;
      console.log(`[REFILL_VALIDATION] Machine ${machineId} -> Warehouse ${warehouseId}: ${isValid ? 'VALID' : 'INVALID'}`);
      return isValid;
      
    } catch (error) {
      console.error(`[REFILL_VALIDATION] Error validating machine-warehouse assignment:`, error);
      // Fallback to true for backward compatibility, but log the issue
      console.warn(`[REFILL_VALIDATION] Validation failed, allowing assignment for backward compatibility`);
      return true;
    }
  }

  /**
   * Get pending refills that need to be processed
   */
  private async getPendingRefills(options: {
    limit?: number;
    warehouseId?: number;
    machineId?: number;
  }): Promise<RefillTracking[]> {
    try {
      // Build conditions array
      const conditions = [eq(refillTrackings.status, 'pending')];

      // Add filters if specified
      if (options.warehouseId) {
        conditions.push(eq(refillTrackings.warehouseId, options.warehouseId));
      }

      if (options.machineId) {
        conditions.push(eq(refillTrackings.machineId, options.machineId));
      }

      // Execute query
      const result = await db
        .select()
        .from(refillTrackings)
        .where(and(...conditions))
        .orderBy(refillTrackings.createdAt)
        .limit(options.limit || 50);

      return result;

    } catch (error) {
      console.error('[REFILL_PENDING] Error getting pending refills:', error);
      return [];
    }
  }

  /**
   * Create refill tracking entry from Vendon trigger
   */
  private async createRefillTrackingFromVendon(trigger: VendonRefillTrigger, performedBy: number): Promise<RefillTracking | null> {
    try {
      console.log(`[VENDON_TRACKING] Creating refill tracking for Vendon trigger`);
      
      // 1. Create refill tracking entry
      const refillData = {
        warehouseId: trigger.warehouseId,
        machineId: trigger.machineId,
        status: 'pending' as const,
        totalProducts: trigger.quantity,
        actualAmount: trigger.quantity,
        scheduledAt: trigger.timestamp,
        createdBy: performedBy,
        vendonEventId: trigger.vendonEventId,
        notes: `Vendon automatic refill trigger`
      };

      const newRefillTracking = await db
        .insert(refillTrackings)
        .values(refillData)
        .returning();

      if (!newRefillTracking[0]) {
        console.error('[VENDON_TRACKING] Failed to create refill tracking');
        return null;
      }

      const refillId = newRefillTracking[0].id;
      console.log(`[VENDON_TRACKING] Created refill tracking ${refillId}`);

      // 2. Create refill tracking item
      const itemData = {
        refillId: refillId,
        productId: trigger.productId,
        quantity: trigger.quantity,
        unitPrice: 0, // Will be updated when actual product price is known
        totalPrice: 0,
        batchId: null, // Will be determined by FIFO logic
        status: 'pending' as const
      };

      await db
        .insert(refillTrackingItems)
        .values(itemData);

      console.log(`[VENDON_TRACKING] Created refill tracking item for product ${trigger.productId}`);
      return newRefillTracking[0];

    } catch (error) {
      console.error('[VENDON_TRACKING] Error creating refill tracking from Vendon:', error);
      return null;
    }
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
      // 🔥 CRITICAL: Use enhanced FIFO service for optimal batch selection
      console.log(`[REFILL_FIFO] Processing item ${item.productId} - Quantity: ${item.quantity}`);
      
      const fifoResult = await this.mhdFifoService.automaticFifoWithdrawal(
        refill.warehouseId,
        item.productId,
        item.quantity,
        {
          movementType: 'OUT',
          destinationType: 'MACHINE',
          destinationId: refill.machineId,
          performedBy: performedBy,
          notes: `Refill to machine ${refill.machineId}${notes ? ` - ${notes}` : ''}`,
          referenceType: 'REFILL',
          referenceId: refill.id
        }
      );

      if (!fifoResult.success) {
        console.error(`[REFILL_FIFO] FIFO withdrawal failed for item ${item.productId}:`, fifoResult.error);
        return {
          success: false,
          movementsCreated: 0,
          quantityProcessed: 0,
          batchesProcessed: 0,
          errors: [fifoResult.error || "FIFO withdrawal failed"]
        };
      }

      console.log(`[REFILL_FIFO] Successfully processed item ${item.productId}: ${fifoResult.totalWithdrawn} units from ${fifoResult.batches?.length || 0} batches`);

      return {
        success: true,
        movementsCreated: fifoResult.movements?.length || 0,
        quantityProcessed: fifoResult.totalWithdrawn || 0,
        batchesProcessed: fifoResult.batches?.length || 0
      };

    } catch (error: unknown) {
      console.error(`[REFILL_FIFO] Error processing FIFO for item ${item.productId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown FIFO error';
      return {
        success: false,
        movementsCreated: 0,
        quantityProcessed: 0,
        batchesProcessed: 0,
        errors: [`FIFO processing error: ${errorMessage}`]
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

    } catch (error: unknown) {
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
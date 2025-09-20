import { eq, and, desc, sql, asc, gte, lte, isNull } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { 
  stockMovements, 
  stockBatches,
  productInventory,
  type StockMovement,
  type StockBatch,
  insertStockMovementSchema
} from '@shared/warehouse3.schema';

// ========================================
// TYPES AND SCHEMAS
// ========================================

/**
 * Input data for creating an inventory movement with FIFO support
 */
export const createMovementInputSchema = z.object({
  // Core movement data
  movementType: z.enum(['RECEIPT', 'FILL', 'ADJUST', 'TRANSFER', 'EXPIRY']),
  productId: z.number().positive(),
  warehouseId: z.number().positive(),
  qtyDelta: z.number(), // Can be negative for OUT movements
  
  // Actor information (required)
  actorUserId: z.number().positive(),
  
  // Optional references
  machineId: z.number().positive().optional(),
  orderId: z.number().positive().optional(),
  batchId: z.number().positive().optional(),
  
  // Movement metadata
  source: z.string().optional().default('SYSTEM'),
  referenceId: z.string().optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional().default('completed'),
  notes: z.string().optional(),
  
  // Batch-specific fields (for FIFO)
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(), // ISO date string
  
  // Location tracking
  locationFrom: z.string().optional(),
  locationTo: z.string().optional()
});

export type CreateMovementInput = z.infer<typeof createMovementInputSchema>;

/**
 * Result of creating an inventory movement
 */
export interface MovementResult {
  movement: StockMovement;
  batchesProcessed: BatchProcessResult[];
  totalQuantityProcessed: number;
  inventoryUpdated: boolean;
}

export interface BatchProcessResult {
  batchId: number;
  batchNumber: string;
  quantityUsed: number;
  stockBefore: number;
  stockAfter: number;
  expiryDate: string;
}

// ========================================
// CENTRALIZED INVENTORY MOVEMENT SERVICE
// ========================================

/**
 * Centralized Inventory Movement Service
 * 
 * Provides atomic, FIFO-compliant inventory movements with full audit trail
 * Replaces scattered stockMovements.insert() calls throughout the codebase
 */
export class CentralizedInventoryMovement {
  constructor(
    private db: PgDatabase<any>,
    private rawDb: any // For raw SQL when needed
  ) {}

  /**
   * Create an inventory movement with automatic FIFO batch processing
   * 
   * @param input Movement input data
   * @param tx Optional transaction context (for atomic operations)
   * @returns Movement result with batch processing details
   */
  async createInventoryMovement(
    input: CreateMovementInput, 
    tx?: PgTransaction<any, any, any>
  ): Promise<MovementResult> {
    // Validate input
    const validatedInput = createMovementInputSchema.parse(input);
    
    // ATOMICITY FIX: If no transaction provided, wrap in one for atomicity
    if (tx) {
      return this.executeMovement(validatedInput, tx);
    } else {
      return this.db.transaction(async (transactionClient) => {
        return this.executeMovement(validatedInput, transactionClient);
      });
    }
  }
  
  /**
   * Execute the actual movement within a transaction context
   */
  private async executeMovement(
    validatedInput: CreateMovementInput,
    dbClient: any
  ): Promise<MovementResult> {
    
    try {
      console.log(`[INVENTORY_MOVEMENT] Creating ${validatedInput.movementType} movement: ${validatedInput.qtyDelta} units of product ${validatedInput.productId}`);
      
      // 1. Get current inventory state for audit trail
      const currentInventory = await this.getCurrentInventoryState(
        validatedInput.productId, 
        validatedInput.warehouseId, 
        dbClient
      );
      
      // 2. Process batches using FIFO logic (for OUT movements)
      let batchesProcessed: BatchProcessResult[] = [];
      
      if (validatedInput.qtyDelta < 0) {
        // OUT movement - use FIFO to determine which batches to consume
        batchesProcessed = await this.processFifoBatches(
          validatedInput,
          Math.abs(validatedInput.qtyDelta),
          dbClient
        );
      } else if (validatedInput.batchId && validatedInput.qtyDelta > 0) {
        // IN movement with specific batch
        batchesProcessed = await this.processSpecificBatch(
          validatedInput,
          validatedInput.qtyDelta,
          dbClient
        );
      }
      
      // 3. Calculate before/after quantities for audit trail
      const beforeQty = currentInventory.totalQuantity;
      const afterQty = beforeQty + validatedInput.qtyDelta;
      
      // 4. Create stock movement records (one per batch for OUT movements)
      const movements: StockMovement[] = [];
      const baseMovementData = {
        movementType: validatedInput.movementType,
        productId: validatedInput.productId,
        warehouseId: validatedInput.warehouseId,
        qtyDelta: validatedInput.qtyDelta,
        beforeQty: beforeQty,
        afterQty: afterQty,
        actorUserId: validatedInput.actorUserId,
        machineId: validatedInput.machineId,
        orderId: validatedInput.orderId,
        occurredAt: new Date(),
        source: validatedInput.source,
        referenceId: validatedInput.referenceId,
        direction: validatedInput.direction || (validatedInput.qtyDelta < 0 ? 'OUT' : 'IN'),
        status: validatedInput.status,
        notes: validatedInput.notes,
        locationFrom: validatedInput.locationFrom,
        locationTo: validatedInput.locationTo,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      if (batchesProcessed.length > 0) {
        // AUDIT TRAIL FIX: Create one movement record per batch consumed
        for (const batchInfo of batchesProcessed) {
          const [movement] = await dbClient
            .insert(stockMovements)
            .values({
              ...baseMovementData,
              batchId: batchInfo.batchId,
              qtyDelta: validatedInput.qtyDelta < 0 ? -batchInfo.quantityUsed : batchInfo.quantityUsed,
              batchNumber: batchInfo.batchNumber,
              expiryDate: batchInfo.expiryDate
            })
            .returning();
          movements.push(movement);
        }
      } else {
        // Single movement for non-batch operations
        const [movement] = await dbClient
          .insert(stockMovements)
          .values({
            ...baseMovementData,
            batchId: validatedInput.batchId,
            batchNumber: validatedInput.batchNumber,
            expiryDate: validatedInput.expiryDate
          })
          .returning();
        movements.push(movement);
      }
      
      // 5. Update inventory totals if needed
      const inventoryUpdated = await this.updateInventoryTotals(
        validatedInput.productId,
        validatedInput.warehouseId,
        validatedInput.qtyDelta,
        dbClient
      );
      
      console.log(`[INVENTORY_MOVEMENT] ✅ Created ${movements.length} movement record(s): ${batchesProcessed.length} batches processed`);
      
      return {
        movement: movements[0], // Return first movement for compatibility
        batchesProcessed,
        totalQuantityProcessed: Math.abs(validatedInput.qtyDelta),
        inventoryUpdated
      };
      
    } catch (error) {
      console.error('[INVENTORY_MOVEMENT] Error creating movement:', error);
      throw error;
    }
  }

  /**
   * Get current inventory state for audit purposes
   */
  private async getCurrentInventoryState(
    productId: number, 
    warehouseId: number, 
    dbClient: any
  ): Promise<{ totalQuantity: number; activeBatches: number }> {
    // Get total quantity from all active batches
    const result = await dbClient
      .select({
        totalQuantity: sql<number>`COALESCE(SUM(${stockBatches.currentQuantity}), 0)`,
        activeBatches: sql<number>`COUNT(*)`
      })
      .from(stockBatches)
      .where(and(
        eq(stockBatches.productId, productId),
        eq(stockBatches.warehouseId, warehouseId),
        eq(stockBatches.status, 'active'),
        gte(stockBatches.currentQuantity, 1)
      ));
    
    return {
      totalQuantity: Number(result[0]?.totalQuantity || 0),
      activeBatches: Number(result[0]?.activeBatches || 0)
    };
  }

  /**
   * Process batches using FIFO logic for OUT movements
   * Consumes oldest batches first (by expiry date)
   */
  private async processFifoBatches(
    input: CreateMovementInput,
    quantityNeeded: number,
    dbClient: any
  ): Promise<BatchProcessResult[]> {
    console.log(`[FIFO] Processing ${quantityNeeded} units using FIFO logic`);
    
    // Get available batches sorted by FIFO order (expiry date ASC)
    const availableBatches = await dbClient
      .select()
      .from(stockBatches)
      .where(and(
        eq(stockBatches.productId, input.productId),
        eq(stockBatches.warehouseId, input.warehouseId),
        eq(stockBatches.status, 'active'),
        gte(stockBatches.currentQuantity, 1)
      ))
      .orderBy(
        asc(stockBatches.expiryDate),  // FIFO: oldest expiry first
        asc(stockBatches.receivedDate), // Secondary: oldest received first
        asc(stockBatches.id)            // Tertiary: deterministic ordering
      );
    
    if (availableBatches.length === 0) {
      throw new Error(`Keine verfügbaren Chargen für Produkt ${input.productId} in Lager ${input.warehouseId}`);
    }
    
    const batchesProcessed: BatchProcessResult[] = [];
    let remainingQuantity = quantityNeeded;
    
    // Process batches in FIFO order
    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;
      
      const quantityToUse = Math.min(remainingQuantity, batch.currentQuantity);
      const stockBefore = batch.currentQuantity;
      const stockAfter = stockBefore - quantityToUse;
      
      console.log(`[FIFO] Using ${quantityToUse} from batch ${batch.batchNumber} (expires: ${batch.expiryDate})`);
      
      // Update batch quantity
      await dbClient
        .update(stockBatches)
        .set({
          currentQuantity: stockAfter,
          updatedAt: new Date()
        })
        .where(eq(stockBatches.id, batch.id));
      
      batchesProcessed.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityUsed: quantityToUse,
        stockBefore,
        stockAfter,
        expiryDate: batch.expiryDate
      });
      
      remainingQuantity -= quantityToUse;
    }
    
    if (remainingQuantity > 0) {
      throw new Error(`Nicht genügend Bestand verfügbar. Benötigt: ${quantityNeeded}, verfügbar: ${quantityNeeded - remainingQuantity}`);
    }
    
    console.log(`[FIFO] ✅ Processed ${batchesProcessed.length} batches in FIFO order`);
    return batchesProcessed;
  }

  /**
   * Process a specific batch for IN movements
   */
  private async processSpecificBatch(
    input: CreateMovementInput,
    quantity: number,
    dbClient: any
  ): Promise<BatchProcessResult[]> {
    if (!input.batchId) {
      return []; // No specific batch processing needed
    }
    
    // INTEGRITY FIX: Get the specific batch with product/warehouse validation
    const [batch] = await dbClient
      .select()
      .from(stockBatches)
      .where(and(
        eq(stockBatches.id, input.batchId),
        eq(stockBatches.productId, input.productId),
        eq(stockBatches.warehouseId, input.warehouseId)
      ));
    
    if (!batch) {
      throw new Error(`Charge ${input.batchId} nicht für Produkt ${input.productId} in Lager ${input.warehouseId} gefunden oder ungültige Zuordnung`);
    }
    
    const stockBefore = batch.currentQuantity;
    const stockAfter = stockBefore + quantity;
    
    // Update batch quantity
    await dbClient
      .update(stockBatches)
      .set({
        currentQuantity: stockAfter,
        updatedAt: new Date()
      })
      .where(eq(stockBatches.id, batch.id));
    
    return [{
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantityUsed: quantity,
      stockBefore,
      stockAfter,
      expiryDate: batch.expiryDate
    }];
  }

  /**
   * Update inventory totals in productInventory table
   */
  private async updateInventoryTotals(
    productId: number,
    warehouseId: number,
    qtyDelta: number,
    dbClient: any
  ): Promise<boolean> {
    try {
      // Try to update existing record
      const updateResult = await dbClient
        .update(productInventory)
        .set({
          currentStock: sql`${productInventory.currentStock} + ${qtyDelta}`,
          updatedAt: new Date()
        })
        .where(and(
          eq(productInventory.productId, productId),
          eq(productInventory.warehouseId, warehouseId)
        ))
        .returning({ id: productInventory.id });
      
      if (updateResult.length > 0) {
        console.log(`[INVENTORY] Updated existing inventory record for product ${productId}`);
        return true;
      }
      
      // If no existing record, create new one (for positive quantities only)
      if (qtyDelta > 0) {
        await dbClient
          .insert(productInventory)
          .values({
            productId,
            warehouseId,
            currentStock: qtyDelta,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        
        console.log(`[INVENTORY] Created new inventory record for product ${productId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn(`[INVENTORY] Could not update inventory totals: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

// ========================================
// FACTORY FUNCTION
// ========================================

/**
 * Create a centralized inventory movement service instance
 */
export function createInventoryMovementService(db: PgDatabase<any>, rawDb: any): CentralizedInventoryMovement {
  return new CentralizedInventoryMovement(db, rawDb);
}

// ========================================
// CONVENIENCE FUNCTIONS
// ========================================

/**
 * Quick helper for creating RECEIPT movements
 */
export async function createReceiptMovement(
  service: CentralizedInventoryMovement,
  productId: number,
  warehouseId: number,
  quantity: number,
  actorUserId: number,
  batchId?: number,
  tx?: PgTransaction<any, any, any>
): Promise<MovementResult> {
  return service.createInventoryMovement({
    movementType: 'RECEIPT',
    productId,
    warehouseId,
    qtyDelta: quantity,
    actorUserId,
    batchId,
    source: 'RECEIPT',
    direction: 'IN',
    status: 'completed'
  }, tx);
}

/**
 * Quick helper for creating FILL movements (refills to machines)
 */
export async function createFillMovement(
  service: CentralizedInventoryMovement,
  productId: number,
  warehouseId: number,
  quantity: number,
  actorUserId: number,
  machineId: number,
  tx?: PgTransaction<any, any, any>
): Promise<MovementResult> {
  return service.createInventoryMovement({
    movementType: 'FILL',
    productId,
    warehouseId,
    qtyDelta: -quantity, // Negative for OUT movement
    actorUserId,
    machineId,
    source: 'REFILL',
    direction: 'OUT',
    status: 'completed'
  }, tx);
}
import { eq, and, desc, sql, asc, gte, lte, isNull } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { PgTransaction } from 'drizzle-orm/pg-core';
import crypto from 'crypto';
import { z } from 'zod';
import { 
  stockMovements, 
  stockBatches,
  productInventory,
  movementGroups,
  movementAttempts,
  type StockMovement,
  type StockBatch,
  type MovementGroup,
  type MovementAttempt,
  insertStockMovementSchema,
  ReasonCodeEnum,
  InitiatedByEnum
} from '@shared/warehouse3.schema';

// ========================================
// TYPES AND SCHEMAS
// ========================================

/**
 * Enhanced input data for creating an inventory movement with comprehensive audit trail
 */
export const createMovementInputSchema = z.object({
  // Core movement data
  movementType: z.enum(['RECEIPT', 'FILL', 'ADJUST', 'TRANSFER', 'EXPIRY']),
  productId: z.number().positive(),
  warehouseId: z.number().positive(),
  qtyDelta: z.number(), // Can be negative for OUT movements
  
  // Actor information (required)
  actorUserId: z.number().positive(),
  
  // COMPREHENSIVE AUDIT TRAIL - Enhanced user context
  actorUsername: z.string().optional(), // Username snapshot
  actorRole: z.string().optional(), // Role snapshot
  actorIp: z.string().optional(), // Will be hashed for privacy
  actorUserAgent: z.string().optional(), // Browser/client info
  initiatedBy: z.enum(['user', 'system', 'job', 'integration']).optional().default('user'),
  integrationId: z.string().optional(), // External system ID
  requestSessionId: z.string().optional(), // Session tracking
  
  // AUDIT CORRELATION - Request tracking
  correlationId: z.string().optional(), // Cross-service correlation
  reasonCode: z.enum(Object.values(ReasonCodeEnum) as [string, ...string[]]).optional(),
  
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
 * Enhanced result of creating an inventory movement with comprehensive audit trail
 */
export interface MovementResult {
  movement: StockMovement;
  movementGroup: MovementGroup;
  batchesProcessed: BatchProcessResult[];
  totalQuantityProcessed: number;
  inventoryUpdated: boolean;
  auditTrail: {
    movementGroupId: string;
    correlationId: string;
    perRowHashing: boolean; // ARCHITECT FIX: Match actual return type
    beforeQty: number;
    afterQty: number;
  };
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
// AUDIT TRAIL UTILITIES
// ========================================

/**
 * Generate a unique movement group ID for correlating related movements
 */
function generateMovementGroupId(): string {
  return crypto.randomUUID();
}

/**
 * Generate correlation ID for cross-service request tracking
 */
function generateCorrelationId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : `corr_${id}`;
}

/**
 * Hash IP address for privacy compliance (GDPR-safe)
 */
function hashIpAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * Generate tamper-evident hash for movement integrity
 * Enhanced per-row hash including all critical fields with HMAC
 * 
 * CANONICALIZATION RULES (for verification reproducibility):
 * - All optional fields normalized to explicit null (never undefined)  
 * - utcOccurredAt converted to ISO string format
 * - Keys sorted alphabetically for consistent JSON
 * - HMAC with server secret for tamper evidence
 */
function generateMovementHash(movementData: any): string {
  // ARCHITECT FIX: Normalize optional fields to explicit null for DB state match
  const canonical = {
    // Core movement data
    productId: movementData.productId,
    warehouseId: movementData.warehouseId,
    qtyDelta: movementData.qtyDelta,
    actorUserId: movementData.actorUserId,
    movementType: movementData.movementType,
    
    // Per-row specific fields - NORMALIZED to explicit null
    batchId: movementData.batchId ?? null, // Prevent undefined vs null mismatch
    beforeQty: movementData.beforeQty,
    afterQty: movementData.afterQty,
    reasonCode: movementData.reasonCode ?? null, // Prevent undefined vs null mismatch
    
    // Temporal integrity - consistent ISO format
    timestamp: movementData.utcOccurredAt?.toISOString() ?? null,
    
    // Identity and correlation - normalized
    movementGroupId: movementData.movementGroupId ?? null,
    correlationId: movementData.correlationId ?? null
  };
  
  // ARCHITECT FIX: Production security guard for HMAC secret
  const serverSecret = process.env.MOVEMENT_HASH_SECRET;
  if (!serverSecret && process.env.NODE_ENV === 'production') {
    throw new Error('MOVEMENT_HASH_SECRET must be set in production for tamper-evident audit trail');
  }
  const effectiveSecret = serverSecret || 'default-development-secret-change-in-production';
  const canonicalString = JSON.stringify(canonical, Object.keys(canonical).sort());
  
  return crypto.createHmac('sha256', effectiveSecret)
    .update(canonicalString)
    .digest('hex');
}

/**
 * ARCHITECT REQUIREMENT: Hash verification utility  
 * Recomputes movement hash from stored database row for tamper verification
 */
export function verifyMovementHashFromDbRow(dbRow: any): { 
  isValid: boolean; 
  computedHash: string; 
  storedHash: string;
} {
  // Recompute hash using exact stored values from DB
  const computedHash = generateMovementHash({
    productId: dbRow.productId || dbRow.product_id,
    warehouseId: dbRow.warehouseId || dbRow.source_warehouse_id,
    qtyDelta: dbRow.qtyDelta || dbRow.qty_delta,
    actorUserId: dbRow.actorUserId || dbRow.performed_by,
    movementType: dbRow.movementType || dbRow.movement_type,
    batchId: dbRow.batchId || dbRow.batch_id, // Will be null if not set
    beforeQty: dbRow.beforeQty || dbRow.before_qty,
    afterQty: dbRow.afterQty || dbRow.after_qty,
    reasonCode: dbRow.reasonCode || dbRow.reason_code, // Will be null if not set
    utcOccurredAt: dbRow.utcOccurredAt || dbRow.utc_occurred_at,
    movementGroupId: dbRow.movementGroupId || dbRow.movement_group_id,
    correlationId: dbRow.correlationId || dbRow.correlation_id
  });
  
  const storedHash = dbRow.movementHash || dbRow.movement_hash;
  
  return {
    isValid: computedHash === storedHash,
    computedHash,
    storedHash
  };
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
    
    // Generate tracking IDs for failure logging (outside transaction)
    const correlationId = validatedInput.correlationId || generateCorrelationId('inv');
    const movementGroupId = generateMovementGroupId();
    
    try {
      // ATOMICITY FIX: If no transaction provided, wrap in one for atomicity
      if (tx) {
        return this.executeMovement(validatedInput, tx, correlationId, movementGroupId);
      } else {
        return this.db.transaction(async (transactionClient) => {
          return this.executeMovement(validatedInput, transactionClient, correlationId, movementGroupId);
        });
      }
    } catch (error) {
      // FAILURE LOGGING OUTSIDE TRANSACTION - Critical requirement from architect
      console.log(`[FAILURE_AUDIT] Recording movement attempt failure outside transaction`);
      await this.recordMovementAttemptFailure(validatedInput, correlationId, movementGroupId, error);
      throw error; // Re-throw after logging
    }
  }
  
  /**
   * Execute the actual movement within a transaction context with comprehensive audit trail
   */
  private async executeMovement(
    validatedInput: CreateMovementInput,
    dbClient: any,
    correlationId: string,
    movementGroupId: string
  ): Promise<MovementResult> {
    
    try {
      console.log(`[INVENTORY_MOVEMENT] Creating ${validatedInput.movementType} movement: ${validatedInput.qtyDelta} units of product ${validatedInput.productId}`);
      
      // COMPREHENSIVE AUDIT TRAIL - Use passed-in tracking IDs
      const utcOccurredAt = new Date();
      
      console.log(`[AUDIT_TRAIL] Movement Group: ${movementGroupId}, Correlation: ${correlationId}`);
      
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
      
      // 4. COMPREHENSIVE AUDIT TRAIL - Prepare enhanced movement data
      const movements: StockMovement[] = [];
      
      const baseMovementData = {
        movementType: validatedInput.movementType,
        productId: validatedInput.productId,
        warehouseId: validatedInput.warehouseId,
        qtyDelta: validatedInput.qtyDelta,
        beforeQty: beforeQty,
        afterQty: afterQty,
        actorUserId: validatedInput.actorUserId,
        
        // COMPREHENSIVE AUDIT TRAIL - Enhanced tracking
        movementGroupId: movementGroupId,
        correlationId: correlationId,
        reasonCode: validatedInput.reasonCode,
        actorUsernameSnapshot: validatedInput.actorUsername,
        actorRoleSnapshot: validatedInput.actorRole,
        actorIpHash: hashIpAddress(validatedInput.actorIp),
        actorUserAgent: validatedInput.actorUserAgent,
        initiatedBy: validatedInput.initiatedBy,
        integrationId: validatedInput.integrationId,
        requestSessionId: validatedInput.requestSessionId,
        
        // References and metadata
        machineId: validatedInput.machineId,
        orderId: validatedInput.orderId,
        destinationWarehouseId: undefined, // For transfers
        
        // Enhanced timestamps
        occurredAt: new Date(),
        utcOccurredAt: utcOccurredAt,
        source: validatedInput.source,
        referenceId: validatedInput.referenceId,
        direction: validatedInput.direction || (validatedInput.qtyDelta < 0 ? 'OUT' : 'IN'),
        status: validatedInput.status,
        notes: validatedInput.notes,
        locationFrom: validatedInput.locationFrom,
        locationTo: validatedInput.locationTo,
        
        // AUDIT INTEGRITY
        schemaVersion: 2,
        // movementHash will be computed per-row below
        
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      if (batchesProcessed.length > 0) {
        // AUDIT TRAIL FIX: Create one movement record per batch with ALIGNED per-row beforeQty/afterQty
        let cumulativeQty = beforeQty; // Track cumulative quantity for per-row fidelity
        
        for (const batchInfo of batchesProcessed) {
          const perRowQtyDelta = validatedInput.qtyDelta < 0 ? -batchInfo.quantityUsed : batchInfo.quantityUsed;
          const perRowBeforeQty = cumulativeQty;
          const perRowAfterQty = cumulativeQty + perRowQtyDelta;
          
          // ARCHITECT FIX: Generate per-row hash using EXACT persisted fields
          const perRowMovementHash = generateMovementHash({
            productId: validatedInput.productId,
            warehouseId: validatedInput.warehouseId,
            qtyDelta: perRowQtyDelta,
            actorUserId: validatedInput.actorUserId,
            movementType: validatedInput.movementType,
            batchId: batchInfo.batchId,
            beforeQty: perRowBeforeQty, // EXACT persisted beforeQty
            afterQty: perRowAfterQty, // EXACT persisted afterQty
            reasonCode: validatedInput.reasonCode,
            utcOccurredAt: utcOccurredAt,
            movementGroupId: movementGroupId,
            correlationId: correlationId
          });
          
          const [movement] = await dbClient
            .insert(stockMovements)
            .values({
              ...baseMovementData,
              batchId: batchInfo.batchId,
              qtyDelta: perRowQtyDelta,
              beforeQty: perRowBeforeQty, // ALIGNED: Per-row beforeQty
              afterQty: perRowAfterQty, // ALIGNED: Per-row afterQty  
              batchNumber: batchInfo.batchNumber,
              expiryDate: batchInfo.expiryDate,
              movementHash: perRowMovementHash // Hash matches persisted data
            })
            .returning();
          movements.push(movement);
          
          // Update cumulative for next iteration
          cumulativeQty = perRowAfterQty;
        }
      } else {
        // Single movement for non-batch operations with per-row hash
        const singleRowMovementHash = generateMovementHash({
          productId: validatedInput.productId,
          warehouseId: validatedInput.warehouseId,
          qtyDelta: validatedInput.qtyDelta,
          actorUserId: validatedInput.actorUserId,
          movementType: validatedInput.movementType,
          batchId: validatedInput.batchId,
          beforeQty: beforeQty,
          afterQty: afterQty,
          reasonCode: validatedInput.reasonCode,
          utcOccurredAt: utcOccurredAt,
          movementGroupId: movementGroupId,
          correlationId: correlationId
        });
        
        const [movement] = await dbClient
          .insert(stockMovements)
          .values({
            ...baseMovementData,
            batchId: validatedInput.batchId,
            batchNumber: validatedInput.batchNumber,
            expiryDate: validatedInput.expiryDate,
            movementHash: singleRowMovementHash // Per-row hash
          })
          .returning();
        movements.push(movement);
      }
      
      // 4.5. COMPATIBILITY BRIDGE: Also write to legacy inventory_movements table
      // This ensures frontend compatibility while transitioning to new system
      await this.writeLegacyInventoryMovements(
        validatedInput,
        beforeQty, 
        afterQty,
        batchesProcessed.length > 0 ? batchesProcessed : null,
        dbClient
      );
      
      // 5. CREATE MOVEMENT GROUP for logical grouping and audit trail
      const [movementGroup] = await dbClient
        .insert(movementGroups)
        .values({
          id: movementGroupId,
          movementType: validatedInput.movementType,
          productId: validatedInput.productId,
          warehouseId: validatedInput.warehouseId,
          totalQtyDelta: validatedInput.qtyDelta,
          beforeQty: beforeQty,
          afterQty: afterQty,
          actorUserId: validatedInput.actorUserId,
          correlationId: correlationId,
          reasonCode: validatedInput.reasonCode,
          status: validatedInput.status,
          occurredAt: utcOccurredAt,
          machineId: validatedInput.machineId,
          orderId: validatedInput.orderId,
          notes: validatedInput.notes,
          createdAt: new Date()
        })
        .returning();
      
      // 6. Update inventory totals if needed
      const inventoryUpdated = await this.updateInventoryTotals(
        validatedInput.productId,
        validatedInput.warehouseId,
        validatedInput.qtyDelta,
        dbClient
      );
      
      console.log(`[INVENTORY_MOVEMENT] ✅ Created ${movements.length} movement record(s): ${batchesProcessed.length} batches processed`);
      console.log(`[AUDIT_TRAIL] ✅ Movement Group ${movementGroupId} created with per-row hashing`);
      
      // ENHANCED RETURN with comprehensive audit trail
      return {
        movement: movements[0], // Return first movement for compatibility
        movementGroup: movementGroup, // New: Movement group for logical grouping
        batchesProcessed,
        totalQuantityProcessed: Math.abs(validatedInput.qtyDelta),
        inventoryUpdated,
        auditTrail: { // New: Comprehensive audit information
          movementGroupId: movementGroupId,
          correlationId: correlationId,
          perRowHashing: true, // Per-row hashes computed for each movement
          beforeQty: beforeQty,
          afterQty: afterQty
        }
      };
      
    } catch (error) {
      console.error('[INVENTORY_MOVEMENT] Error creating movement:', error);
      throw error;
    }
  }

  /**
   * FAILURE LOGGING OUTSIDE TRANSACTION - Critical architect requirement
   * Records movement attempt failures in append-only table outside transaction boundary
   */
  private async recordMovementAttemptFailure(
    input: CreateMovementInput,
    correlationId: string,
    movementGroupId: string,
    error: any
  ): Promise<void> {
    try {
      // Use raw database connection to ensure this is outside any transaction
      // FIX: Use only schema-defined fields
      await this.rawDb.query(`
        INSERT INTO movement_attempts (
          movement_group_id, correlation_id, attempt_type, status,
          product_id, warehouse_id, intended_qty_delta, actor_user_id,
          error_code, error_message, occurred_at, created_at
        ) VALUES (
          $1, $2, 'initial', 'failed', $3, $4, $5, $6,
          $7, $8, NOW(), NOW()
        )
      `, [
        movementGroupId,
        correlationId,
        input.productId,
        input.warehouseId,
        input.qtyDelta, // Maps to intended_qty_delta
        input.actorUserId,
        error.code || 'UNKNOWN_ERROR',
        error.message || 'Unknown error occurred'
      ]);
      
      console.log(`[FAILURE_AUDIT] ✅ Recorded failure attempt for correlation ${correlationId}`);
    } catch (logError) {
      // Never throw from failure logging - just log the meta-error
      console.error('[FAILURE_AUDIT] ❌ Failed to record movement attempt failure:', logError);
    }
  }

  /**
   * COMPATIBILITY BRIDGE: Write to legacy inventory_movements table
   * This ensures frontend works while we transition to new stockMovements system
   */
  private async writeLegacyInventoryMovements(
    input: CreateMovementInput,
    beforeQty: number,
    afterQty: number,
    batchesProcessed: BatchProcessResult[] | null,
    dbClient: any
  ): Promise<void> {
    console.log(`[LEGACY_BRIDGE] Writing to inventory_movements table for compatibility`);
    
    try {
      // Map movement types to legacy format
      const legacyMovementType = this.mapToLegacyMovementType(input.movementType);
      
      // Base movement data for legacy table
      const baseData = {
        product_id: input.productId,
        quantity: input.qtyDelta,
        movement_type: legacyMovementType,
        source_warehouse_id: input.qtyDelta < 0 ? input.warehouseId : null,
        destination_warehouse_id: input.qtyDelta > 0 ? input.warehouseId : null,
        machine_id: input.machineId || null,
        reference_type: 'centralized_movement',
        reference_id: input.correlationId,
        notes: input.notes || `${input.movementType} movement via centralized service`,
        performed_by: input.actorUserId,
        performed_at: new Date(),
        // CRITICAL: Set the missing stock tracking fields
        previous_stock: beforeQty,
        current_stock: afterQty,
        // Enhanced audit fields
        actor_username_snapshot: input.actorUsername,
        actor_role_snapshot: input.actorRole,
        correlation_id: input.correlationId,
        initiated_by: input.initiatedBy || 'user',
        schema_version: 2
      };

      if (batchesProcessed && batchesProcessed.length > 0) {
        // Create one legacy movement per batch for detailed tracking
        for (const batch of batchesProcessed) {
          const batchMovementData = {
            ...baseData,
            quantity: input.qtyDelta < 0 ? -batch.quantityUsed : batch.quantityUsed,
            batch_id: batch.batchId,
            batch_number: batch.batchNumber,
            expiry_date: new Date(batch.expiryDate),
            previous_stock: batch.stockBefore,
            current_stock: batch.stockAfter,
            notes: `${baseData.notes} (Batch: ${batch.batchNumber})`
          };

          await dbClient.query(`
            INSERT INTO inventory_movements (
              product_id, quantity, movement_type, source_warehouse_id, 
              destination_warehouse_id, machine_id, reference_type, reference_id,
              notes, performed_by, performed_at, previous_stock, current_stock,
              batch_id, batch_number, expiry_date, actor_username_snapshot,
              actor_role_snapshot, correlation_id, initiated_by, schema_version
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
              $14, $15, $16, $17, $18, $19, $20, $21
            )
          `, [
            batchMovementData.product_id,
            batchMovementData.quantity,
            batchMovementData.movement_type,
            batchMovementData.source_warehouse_id,
            batchMovementData.destination_warehouse_id,
            batchMovementData.machine_id,
            batchMovementData.reference_type,
            batchMovementData.reference_id,
            batchMovementData.notes,
            batchMovementData.performed_by,
            batchMovementData.performed_at,
            batchMovementData.previous_stock,
            batchMovementData.current_stock,
            batchMovementData.batch_id,
            batchMovementData.batch_number,
            batchMovementData.expiry_date,
            batchMovementData.actor_username_snapshot,
            batchMovementData.actor_role_snapshot,
            batchMovementData.correlation_id,
            batchMovementData.initiated_by,
            batchMovementData.schema_version
          ]);
        }
      } else {
        // Single movement without batch details
        await dbClient.query(`
          INSERT INTO inventory_movements (
            product_id, quantity, movement_type, source_warehouse_id,
            destination_warehouse_id, machine_id, reference_type, reference_id,
            notes, performed_by, performed_at, previous_stock, current_stock,
            actor_username_snapshot, actor_role_snapshot, correlation_id,
            initiated_by, schema_version
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18
          )
        `, [
          baseData.product_id,
          baseData.quantity,
          baseData.movement_type,
          baseData.source_warehouse_id,
          baseData.destination_warehouse_id,
          baseData.machine_id,
          baseData.reference_type,
          baseData.reference_id,
          baseData.notes,
          baseData.performed_by,
          baseData.performed_at,
          baseData.previous_stock,
          baseData.current_stock,
          baseData.actor_username_snapshot,
          baseData.actor_role_snapshot,
          baseData.correlation_id,
          baseData.initiated_by,
          baseData.schema_version
        ]);
      }
      
      console.log(`[LEGACY_BRIDGE] ✅ Successfully wrote legacy movements with stock tracking`);
    } catch (error) {
      console.error('[LEGACY_BRIDGE] ❌ Failed to write legacy movements:', error);
      // Don't throw - this is a compatibility feature, not critical
    }
  }

  /**
   * Map new movement types to legacy format
   */
  private mapToLegacyMovementType(movementType: string): string {
    const mapping: Record<string, string> = {
      'FILL': 'REFILL',
      'RECEIPT': 'IN', 
      'ADJUST': 'ADJUSTMENT',
      'TRANSFER': 'TRANSFER',
      'EXPIRY': 'EXPIRY'
    };
    return mapping[movementType] || movementType;
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
    status: 'completed',
    initiatedBy: 'user', // Fix LSP error - add required field
    reasonCode: 'DELIVERY_RECEIPT'
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
    status: 'completed',
    initiatedBy: 'user', // Fix LSP error - add required field
    reasonCode: 'MACHINE_REFILL'
  }, tx);
}
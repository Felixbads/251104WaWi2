/**
 * WAREHOUSE3 TRANSFER SERVICE
 * 
 * Comprehensive warehouse transfer functionality with FIFO integration
 * Provides secure, audited transfers between warehouses using warehouse3 FIFO principles
 */

import { db } from '../db';
import { 
  warehouses, 
  inventoryItems, 
  productBatches, 
  inventoryMovements,
  products
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

// Transfer-related types
export interface TransferRequest {
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  items: TransferItem[];
  notes?: string;
  transferType: 'MANUAL' | 'AUTOMATIC' | 'EMERGENCY';
  performedBy: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

export interface TransferItem {
  productId: number;
  quantity: number;
  selectedBatchIds?: number[];
  useOldestFirst?: boolean; // Use FIFO principle
  notes?: string;
}

export interface TransferResult {
  success: boolean;
  transferId?: string;
  itemsTransferred: number;
  totalQuantityTransferred: number;
  batchesProcessed: number;
  sourceMovements: any[];
  destinationMovements: any[];
  errors: string[];
  warnings: string[];
  executionTime: number;
  summary: string;
}

export interface TransferValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sourceWarehouseExists: boolean;
  destinationWarehouseExists: boolean;
  stockValidation: {
    [productId: number]: {
      requested: number;
      available: number;
      sufficient: boolean;
    };
  };
}

export class WarehouseTransferService {

  constructor() {
    // Service ready for transfer operations
  }

  /**
   * Validate a transfer request before execution
   */
  async validateTransferRequest(request: TransferRequest): Promise<TransferValidation> {
    console.log('[WAREHOUSE_TRANSFER] Validating transfer request:', {
      sourceWarehouseId: request.sourceWarehouseId,
      destinationWarehouseId: request.destinationWarehouseId,
      itemCount: request.items.length
    });

    const validation: TransferValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      sourceWarehouseExists: false,
      destinationWarehouseExists: false,
      stockValidation: {}
    };

    try {
      // 1. Basic validation
      if (request.sourceWarehouseId === request.destinationWarehouseId) {
        validation.errors.push('Source and destination warehouses cannot be the same');
        validation.isValid = false;
      }

      if (!request.items || request.items.length === 0) {
        validation.errors.push('At least one item must be specified for transfer');
        validation.isValid = false;
      }

      // 2. Check if warehouses exist
      const [sourceWarehouse] = await db.select()
        .from(warehouses)
        .where(eq(warehouses.id, request.sourceWarehouseId))
        .limit(1);

      const [destinationWarehouse] = await db.select()
        .from(warehouses)
        .where(eq(warehouses.id, request.destinationWarehouseId))
        .limit(1);

      validation.sourceWarehouseExists = !!sourceWarehouse;
      validation.destinationWarehouseExists = !!destinationWarehouse;

      if (!sourceWarehouse) {
        validation.errors.push(`Source warehouse ${request.sourceWarehouseId} not found`);
        validation.isValid = false;
      }

      if (!destinationWarehouse) {
        validation.errors.push(`Destination warehouse ${request.destinationWarehouseId} not found`);
        validation.isValid = false;
      }

      // 3. Validate stock availability for each item
      for (const item of request.items) {
        if (item.quantity <= 0) {
          validation.errors.push(`Invalid quantity ${item.quantity} for product ${item.productId}`);
          validation.isValid = false;
          continue;
        }

        // Check available stock in source warehouse
        const [inventoryItem] = await db.select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.warehouseId, request.sourceWarehouseId),
            eq(inventoryItems.productId, item.productId)
          ))
          .limit(1);

        const availableQuantity = inventoryItem?.quantity || 0;
        const sufficient = availableQuantity >= item.quantity;

        validation.stockValidation[item.productId] = {
          requested: item.quantity,
          available: availableQuantity,
          sufficient
        };

        if (!sufficient) {
          validation.errors.push(
            `Insufficient stock for product ${item.productId}: requested ${item.quantity}, available ${availableQuantity}`
          );
          validation.isValid = false;
        } else if (availableQuantity === item.quantity) {
          validation.warnings.push(
            `Transfer will completely deplete stock for product ${item.productId} in source warehouse`
          );
        }

        // Validate batch selection if specified
        if (item.selectedBatchIds && item.selectedBatchIds.length > 0) {
          const batches = await db.select()
            .from(productBatches)
            .where(and(
              eq(productBatches.warehouseId, request.sourceWarehouseId),
              eq(productBatches.productId, item.productId)
            ));

          const selectedBatches = batches.filter(batch => item.selectedBatchIds!.includes(batch.id));
          const selectedQuantity = selectedBatches.reduce((sum, batch) => sum + (batch.currentQuantity || 0), 0);

          if (selectedQuantity < item.quantity) {
            validation.errors.push(
              `Selected batches for product ${item.productId} have insufficient quantity: selected ${selectedQuantity}, needed ${item.quantity}`
            );
            validation.isValid = false;
          }
        }
      }

      console.log('[WAREHOUSE_TRANSFER] Validation completed:', {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      });

      return validation;

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Validation error:', error);
      validation.isValid = false;
      validation.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return validation;
    }
  }

  /**
   * Execute a warehouse transfer with FIFO integration
   */
  async executeTransfer(request: TransferRequest): Promise<TransferResult> {
    const startTime = Date.now();
    console.log('[WAREHOUSE_TRANSFER] Starting transfer execution:', {
      sourceWarehouseId: request.sourceWarehouseId,
      destinationWarehouseId: request.destinationWarehouseId,
      itemCount: request.items.length,
      transferType: request.transferType,
      priority: request.priority
    });

    const result: TransferResult = {
      success: false,
      itemsTransferred: 0,
      totalQuantityTransferred: 0,
      batchesProcessed: 0,
      sourceMovements: [],
      destinationMovements: [],
      errors: [],
      warnings: [],
      executionTime: 0,
      summary: ''
    };

    try {
      // 1. Validate the transfer request
      const validation = await this.validateTransferRequest(request);
      if (!validation.isValid) {
        result.errors = validation.errors;
        result.warnings = validation.warnings;
        result.summary = `Transfer validation failed: ${validation.errors.join(', ')}`;
        return result;
      }

      // Add warnings from validation
      result.warnings = validation.warnings;

      // 2. Generate unique transfer ID
      const transferId = `TXF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      result.transferId = transferId;

      // 3. Execute transfer within transaction
      await db.transaction(async (tx) => {
        console.log('[WAREHOUSE_TRANSFER] Starting database transaction for transfer:', transferId);

        for (const item of request.items) {
          console.log(`[WAREHOUSE_TRANSFER] Processing item: product ${item.productId}, quantity ${item.quantity}`);

          // Use FIFO-based batch processing
          if (!item.selectedBatchIds || item.selectedBatchIds.length === 0) {
            console.log('[WAREHOUSE_TRANSFER] Using automatic FIFO batch selection');
            
            // Process using FIFO automatic batch selection
            const batchResult = await this.processAutomaticFifoTransfer(
              tx,
              request.sourceWarehouseId,
              request.destinationWarehouseId,
              item.productId,
              item.quantity,
              {
                transferId,
                performedBy: request.performedBy,
                notes: item.notes || request.notes || '',
                priority: request.priority
              }
            );

            if (!batchResult.success) {
              throw new Error(`FIFO transfer failed for product ${item.productId}: ${batchResult.error}`);
            }

            result.sourceMovements.push(batchResult.sourceMovement);
            result.destinationMovements.push(batchResult.destinationMovement);
            result.batchesProcessed += batchResult.batchesProcessed;

          } else {
            // Manual batch selection - process specific batches
            console.log('[WAREHOUSE_TRANSFER] Using manual batch selection:', item.selectedBatchIds);
            
            const batchResult = await this.processBatchTransfer(
              tx,
              request.sourceWarehouseId,
              request.destinationWarehouseId,
              item.productId,
              item.quantity,
              item.selectedBatchIds,
              {
                transferId,
                performedBy: request.performedBy,
                notes: item.notes || request.notes || '',
                priority: request.priority
              }
            );

            if (!batchResult.success) {
              throw new Error(`Batch transfer failed for product ${item.productId}: ${batchResult.error}`);
            }

            result.sourceMovements.push(batchResult.sourceMovement);
            result.destinationMovements.push(batchResult.destinationMovement);
            result.batchesProcessed += batchResult.batchesProcessed;
          }

          result.itemsTransferred++;
          result.totalQuantityTransferred += item.quantity;
          console.log(`[WAREHOUSE_TRANSFER] Item completed: ${result.itemsTransferred}/${request.items.length}`);
        }

        console.log('[WAREHOUSE_TRANSFER] All items processed successfully');
      });

      result.success = true;
      result.executionTime = Date.now() - startTime;
      result.summary = `Successfully transferred ${result.itemsTransferred} items (${result.totalQuantityTransferred} total quantity) using ${result.batchesProcessed} batches in ${result.executionTime}ms`;

      console.log('[WAREHOUSE_TRANSFER] Transfer completed successfully:', {
        transferId: result.transferId,
        itemsTransferred: result.itemsTransferred,
        totalQuantity: result.totalQuantityTransferred,
        batchesProcessed: result.batchesProcessed,
        executionTime: result.executionTime
      });

      return result;

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Transfer execution failed:', error);
      result.success = false;
      result.executionTime = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.summary = `Transfer failed: ${result.errors.join(', ')}`;
      return result;
    }
  }

  /**
   * Process automatic FIFO transfer (selects oldest batches first)
   */
  private async processAutomaticFifoTransfer(
    tx: any,
    sourceWarehouseId: number,
    destinationWarehouseId: number,
    productId: number,
    quantity: number,
    transferContext: {
      transferId: string;
      performedBy: number;
      notes: string;
      priority: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    sourceMovement: any;
    destinationMovement: any;
    batchesProcessed: number;
  }> {
    console.log('[WAREHOUSE_TRANSFER] Processing automatic FIFO transfer:', {
      sourceWarehouseId,
      destinationWarehouseId,
      productId,
      quantity,
      transferId: transferContext.transferId
    });

    try {
      // Get available batches sorted by FIFO order (oldest first)
      const availableBatches = await tx.select()
        .from(productBatches)
        .where(and(
          eq(productBatches.warehouseId, sourceWarehouseId),
          eq(productBatches.productId, productId),
          eq(productBatches.status, 'active'),
          sql`${productBatches.currentQuantity} > 0`
        ))
        .orderBy(productBatches.expiryDate, productBatches.createdAt); // FIFO order

      // Validate sufficient quantity
      const totalAvailable = availableBatches.reduce((sum, batch) => sum + (batch.currentQuantity || 0), 0);
      if (totalAvailable < quantity) {
        return {
          success: false,
          error: `Insufficient total quantity: available ${totalAvailable}, needed ${quantity}`,
          sourceMovement: null,
          destinationMovement: null,
          batchesProcessed: 0
        };
      }

      // Process batches in FIFO order
      let remainingQuantity = quantity;
      let batchesProcessed = 0;
      const batchDetails: any[] = [];

      for (const batch of availableBatches) {
        if (remainingQuantity <= 0) break;

        const batchQuantity = Math.min(batch.currentQuantity || 0, remainingQuantity);
        const newCurrentQuantity = (batch.currentQuantity || 0) - batchQuantity;

        // Update source batch
        await tx.update(productBatches)
          .set({ 
            currentQuantity: newCurrentQuantity,
            updatedAt: new Date()
          })
          .where(eq(productBatches.id, batch.id));

        // Create corresponding batch in destination warehouse
        await tx.insert(productBatches).values({
          warehouseId: destinationWarehouseId,
          productId: productId,
          batchNumber: `${batch.batchNumber}-TXF-${Date.now().toString().slice(-6)}`,
          expiryDate: batch.expiryDate,
          initialQuantity: batchQuantity,
          currentQuantity: batchQuantity,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        batchDetails.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: batchQuantity,
          expiryDate: batch.expiryDate
        });

        remainingQuantity -= batchQuantity;
        batchesProcessed++;
        console.log(`[WAREHOUSE_TRANSFER] Processed batch ${batch.batchNumber}: ${batchQuantity} transferred`);
      }

      // Update inventory items
      await this.updateInventoryForTransfer(tx, sourceWarehouseId, destinationWarehouseId, productId, quantity);

      // Create movement records
      const sourceMovement = await this.createMovementRecord(tx, {
        productId,
        sourceWarehouseId,
        destinationWarehouseId: null,
        movementType: 'TRANSFER_OUT',
        quantity: -quantity,
        referenceType: 'WAREHOUSE_TRANSFER',
        referenceId: transferContext.transferId,
        performedBy: transferContext.performedBy,
        notes: `Automatic FIFO transfer to warehouse ${destinationWarehouseId}: ${transferContext.notes}`,
        priority: transferContext.priority,
        batchDetails
      });

      const destinationMovement = await this.createMovementRecord(tx, {
        productId,
        sourceWarehouseId: null,
        destinationWarehouseId,
        movementType: 'TRANSFER_IN',
        quantity: quantity,
        referenceType: 'WAREHOUSE_TRANSFER',
        referenceId: transferContext.transferId,
        performedBy: transferContext.performedBy,
        notes: `Automatic FIFO transfer from warehouse ${sourceWarehouseId}: ${transferContext.notes}`,
        priority: transferContext.priority,
        batchDetails
      });

      console.log(`[WAREHOUSE_TRANSFER] Automatic FIFO transfer completed: ${batchesProcessed} batches processed`);

      return {
        success: true,
        sourceMovement,
        destinationMovement,
        batchesProcessed
      };

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Automatic FIFO transfer error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sourceMovement: null,
        destinationMovement: null,
        batchesProcessed: 0
      };
    }
  }

  /**
   * Process manual batch transfer (when specific batches are selected)
   */
  private async processBatchTransfer(
    tx: any,
    sourceWarehouseId: number,
    destinationWarehouseId: number,
    productId: number,
    quantity: number,
    selectedBatchIds: number[],
    transferContext: {
      transferId: string;
      performedBy: number;
      notes: string;
      priority: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    sourceMovement: any;
    destinationMovement: any;
    batchesProcessed: number;
  }> {
    console.log('[WAREHOUSE_TRANSFER] Processing manual batch transfer:', {
      sourceWarehouseId,
      destinationWarehouseId,
      productId,
      quantity,
      selectedBatchIds,
      transferId: transferContext.transferId
    });

    try {
      // Get selected batches
      const batches = await tx.select()
        .from(productBatches)
        .where(and(
          eq(productBatches.warehouseId, sourceWarehouseId),
          eq(productBatches.productId, productId)
        ));

      const selectedBatches = batches.filter((batch: any) => selectedBatchIds.includes(batch.id))
        .sort((a: any, b: any) => new Date(a.expiryDate || '').getTime() - new Date(b.expiryDate || '').getTime()); // FIFO order

      // Validate sufficient quantity in selected batches
      const availableQuantity = selectedBatches.reduce((sum: number, batch: any) => sum + (batch.currentQuantity || 0), 0);
      if (availableQuantity < quantity) {
        return {
          success: false,
          error: `Insufficient quantity in selected batches: available ${availableQuantity}, needed ${quantity}`,
          sourceMovement: null,
          destinationMovement: null,
          batchesProcessed: 0
        };
      }

      // Process batches in FIFO order
      let remainingQuantity = quantity;
      let batchesProcessed = 0;
      const batchDetails: any[] = [];

      for (const batch of selectedBatches) {
        if (remainingQuantity <= 0) break;

        const batchQuantity = Math.min(batch.currentQuantity || 0, remainingQuantity);
        const newCurrentQuantity = (batch.currentQuantity || 0) - batchQuantity;

        // Update source batch
        await tx.update(productBatches)
          .set({ 
            currentQuantity: newCurrentQuantity,
            updatedAt: new Date()
          })
          .where(eq(productBatches.id, batch.id));

        // Create corresponding batch in destination warehouse
        await tx.insert(productBatches).values({
          warehouseId: destinationWarehouseId,
          productId: productId,
          batchNumber: `${batch.batchNumber}-TXF-${Date.now().toString().slice(-6)}`,
          expiryDate: batch.expiryDate,
          initialQuantity: batchQuantity,
          currentQuantity: batchQuantity,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        batchDetails.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: batchQuantity,
          expiryDate: batch.expiryDate
        });

        remainingQuantity -= batchQuantity;
        batchesProcessed++;
        console.log(`[WAREHOUSE_TRANSFER] Processed batch ${batch.batchNumber}: ${batchQuantity} transferred`);
      }

      // Update inventory items
      await this.updateInventoryForTransfer(tx, sourceWarehouseId, destinationWarehouseId, productId, quantity);

      // Create movement records
      const sourceMovement = await this.createMovementRecord(tx, {
        productId,
        sourceWarehouseId,
        destinationWarehouseId: null,
        movementType: 'TRANSFER_OUT',
        quantity: -quantity,
        referenceType: 'WAREHOUSE_TRANSFER',
        referenceId: transferContext.transferId,
        performedBy: transferContext.performedBy,
        notes: `Manual batch transfer to warehouse ${destinationWarehouseId}: ${transferContext.notes}`,
        priority: transferContext.priority,
        batchDetails
      });

      const destinationMovement = await this.createMovementRecord(tx, {
        productId,
        sourceWarehouseId: null,
        destinationWarehouseId,
        movementType: 'TRANSFER_IN',
        quantity: quantity,
        referenceType: 'WAREHOUSE_TRANSFER',
        referenceId: transferContext.transferId,
        performedBy: transferContext.performedBy,
        notes: `Manual batch transfer from warehouse ${sourceWarehouseId}: ${transferContext.notes}`,
        priority: transferContext.priority,
        batchDetails
      });

      console.log(`[WAREHOUSE_TRANSFER] Manual batch transfer completed: ${batchesProcessed} batches processed`);

      return {
        success: true,
        sourceMovement,
        destinationMovement,
        batchesProcessed
      };

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Manual batch transfer error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sourceMovement: null,
        destinationMovement: null,
        batchesProcessed: 0
      };
    }
  }

  /**
   * Update inventory items for transfer
   */
  private async updateInventoryForTransfer(
    tx: any,
    sourceWarehouseId: number,
    destinationWarehouseId: number,
    productId: number,
    quantity: number
  ): Promise<void> {
    // Update source inventory
    const [sourceItem] = await tx.select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, sourceWarehouseId),
        eq(inventoryItems.productId, productId)
      ))
      .limit(1);

    if (sourceItem) {
      await tx.update(inventoryItems)
        .set({ 
          quantity: (sourceItem.quantity || 0) - quantity,
          updatedAt: new Date()
        })
        .where(and(
          eq(inventoryItems.warehouseId, sourceWarehouseId),
          eq(inventoryItems.productId, productId)
        ));
    }

    // Update destination inventory
    const [destItem] = await tx.select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, destinationWarehouseId),
        eq(inventoryItems.productId, productId)
      ))
      .limit(1);

    if (destItem) {
      await tx.update(inventoryItems)
        .set({ 
          quantity: (destItem.quantity || 0) + quantity,
          updatedAt: new Date()
        })
        .where(and(
          eq(inventoryItems.warehouseId, destinationWarehouseId),
          eq(inventoryItems.productId, productId)
        ));
    } else {
      await tx.insert(inventoryItems).values({
        warehouseId: destinationWarehouseId,
        productId: productId,
        quantity: quantity,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  /**
   * Create movement record for audit trail
   */
  private async createMovementRecord(tx: any, movement: {
    productId: number;
    sourceWarehouseId: number | null;
    destinationWarehouseId: number | null;
    movementType: string;
    quantity: number;
    referenceType: string;
    referenceId: string;
    performedBy: number;
    notes: string;
    priority: string;
    batchDetails?: any[];
  }): Promise<any> {
    const [created] = await tx.insert(inventoryMovements).values({
      productId: movement.productId,
      sourceWarehouseId: movement.sourceWarehouseId,
      destinationWarehouseId: movement.destinationWarehouseId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      performedBy: movement.performedBy,
      notes: movement.notes,
      createdAt: new Date(),
      performedAt: new Date()
    }).returning();

    return created;
  }

  /**
   * Get transfer history for a warehouse
   */
  async getTransferHistory(warehouseId: number, options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    transferType?: string;
  } = {}): Promise<{
    transfers: any[];
    totalCount: number;
  }> {
    console.log('[WAREHOUSE_TRANSFER] Getting transfer history for warehouse:', warehouseId);

    try {
      const { limit = 50, offset = 0, startDate, endDate, transferType } = options;

      // Build base query for movements related to transfers
      let whereConditions = [
        sql`(${inventoryMovements.sourceWarehouseId} = ${warehouseId} OR ${inventoryMovements.destinationWarehouseId} = ${warehouseId})`,
        eq(inventoryMovements.referenceType, 'WAREHOUSE_TRANSFER')
      ];

      if (startDate) {
        whereConditions.push(sql`${inventoryMovements.performedAt} >= ${startDate}`);
      }
      if (endDate) {
        whereConditions.push(sql`${inventoryMovements.performedAt} <= ${endDate}`);
      }

      const transfers = await db.select({
        movementId: inventoryMovements.id,
        transferId: inventoryMovements.referenceId,
        productId: inventoryMovements.productId,
        productName: products.productName,
        sourceWarehouseId: inventoryMovements.sourceWarehouseId,
        destinationWarehouseId: inventoryMovements.destinationWarehouseId,
        movementType: inventoryMovements.movementType,
        quantity: inventoryMovements.quantity,
        performedAt: inventoryMovements.performedAt,
        performedBy: inventoryMovements.performedBy,
        notes: inventoryMovements.notes
      })
        .from(inventoryMovements)
        .leftJoin(products, eq(inventoryMovements.productId, products.id))
        .where(and(...whereConditions))
        .orderBy(desc(inventoryMovements.performedAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count }] = await db.select({ count: sql`count(*)` })
        .from(inventoryMovements)
        .where(and(...whereConditions));

      return {
        transfers,
        totalCount: Number(count)
      };

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Error getting transfer history:', error);
      throw error;
    }
  }

  /**
   * Get available products for transfer from a warehouse
   */
  async getAvailableProductsForTransfer(warehouseId: number): Promise<{
    productId: number;
    productName: string;
    availableQuantity: number;
    batchCount: number;
    oldestExpiryDate?: Date;
  }[]> {
    console.log('[WAREHOUSE_TRANSFER] Getting available products for transfer from warehouse:', warehouseId);

    try {
      const availableProducts = await db.select({
        productId: inventoryItems.productId,
        productName: products.productName,
        availableQuantity: inventoryItems.quantity,
        batchCount: sql<number>`COUNT(${productBatches.id})`,
        oldestExpiryDate: sql<Date>`MIN(${productBatches.expiryDate})`
      })
        .from(inventoryItems)
        .leftJoin(products, eq(inventoryItems.productId, products.id))
        .leftJoin(productBatches, and(
          eq(productBatches.warehouseId, inventoryItems.warehouseId),
          eq(productBatches.productId, inventoryItems.productId),
          eq(productBatches.status, 'active')
        ))
        .where(and(
          eq(inventoryItems.warehouseId, warehouseId),
          eq(inventoryItems.status, 'active'),
          sql`${inventoryItems.quantity} > 0`
        ))
        .groupBy(inventoryItems.productId, products.productName, inventoryItems.quantity)
        .orderBy(products.productName);

      return availableProducts.map(product => ({
        productId: product.productId,
        productName: product.productName || `Product ${product.productId}`,
        availableQuantity: product.availableQuantity || 0,
        batchCount: Number(product.batchCount) || 0,
        oldestExpiryDate: product.oldestExpiryDate || undefined
      }));

    } catch (error) {
      console.error('[WAREHOUSE_TRANSFER] Error getting available products:', error);
      throw error;
    }
  }
}

export default WarehouseTransferService;
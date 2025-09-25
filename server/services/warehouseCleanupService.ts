/**
 * Warehouse Cleanup Service
 * 
 * Implements comprehensive data integrity cleanup for warehouse3 system:
 * - Orphaned batch records cleanup
 * - Missing movement protocol entries
 * - Data consistency validation
 * - Automated cleanup procedures
 */

import { Pool, QueryResult } from 'pg';
import { eq, and, isNull, lt, sql } from 'drizzle-orm';
import { DrizzleWarehouseStorage } from '../warehouse3.storage';

// Type für rawDb
interface DatabaseClient {
  query(text: string, params?: any[]): Promise<QueryResult<any>>;
  connect?(): Promise<any>;
}

export interface CleanupResult {
  success: boolean;
  itemsCleaned: number;
  details: string[];
  errors: string[];
}

export interface CleanupReport {
  orphanedBatches: CleanupResult;
  missingMovements: CleanupResult;
  inconsistentStock: CleanupResult;
  expiredData: CleanupResult;
  totalItemsCleaned: number;
  executionTime: number;
}

export class WarehouseCleanupService {
  private db: DatabaseClient;
  private warehouseStorage: DrizzleWarehouseStorage;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.warehouseStorage = new DrizzleWarehouseStorage();
  }

  /**
   * 🔥 CRITICAL: Comprehensive warehouse data integrity cleanup
   * 
   * Performs all cleanup operations in sequence with transaction safety
   */
  async performFullCleanup(options: {
    cleanupOrphanedBatches?: boolean;
    createMissingMovements?: boolean;
    fixInconsistentStock?: boolean;
    removeExpiredData?: boolean;
    dryRun?: boolean;
  } = {}): Promise<CleanupReport> {
    const {
      cleanupOrphanedBatches = true,
      createMissingMovements = true,
      fixInconsistentStock = true,
      removeExpiredData = true,
      dryRun = false
    } = options;

    const startTime = Date.now();
    console.log(`[WAREHOUSE_CLEANUP] ${dryRun ? 'DRY RUN - ' : ''}Starting comprehensive cleanup...`);

    const report: CleanupReport = {
      orphanedBatches: { success: false, itemsCleaned: 0, details: [], errors: [] },
      missingMovements: { success: false, itemsCleaned: 0, details: [], errors: [] },
      inconsistentStock: { success: false, itemsCleaned: 0, details: [], errors: [] },
      expiredData: { success: false, itemsCleaned: 0, details: [], errors: [] },
      totalItemsCleaned: 0,
      executionTime: 0
    };

    try {
      if (!dryRun) {
        await this.db.query('BEGIN');
      }

      // 1. Clean up orphaned batch records
      if (cleanupOrphanedBatches) {
        console.log('[WAREHOUSE_CLEANUP] Step 1: Cleaning orphaned batch records...');
        report.orphanedBatches = await this.cleanupOrphanedBatches(dryRun);
      }

      // 2. Create missing movement protocol entries
      if (createMissingMovements) {
        console.log('[WAREHOUSE_CLEANUP] Step 2: Creating missing movement entries...');
        report.missingMovements = await this.createMissingMovementEntries(dryRun);
      }

      // 3. Fix inconsistent stock quantities
      if (fixInconsistentStock) {
        console.log('[WAREHOUSE_CLEANUP] Step 3: Fixing inconsistent stock quantities...');
        report.inconsistentStock = await this.fixInconsistentStockQuantities(dryRun);
      }

      // 4. Remove expired and obsolete data
      if (removeExpiredData) {
        console.log('[WAREHOUSE_CLEANUP] Step 4: Removing expired data...');
        report.expiredData = await this.removeExpiredData(dryRun);
      }

      // Calculate totals
      report.totalItemsCleaned = 
        report.orphanedBatches.itemsCleaned +
        report.missingMovements.itemsCleaned +
        report.inconsistentStock.itemsCleaned +
        report.expiredData.itemsCleaned;

      if (!dryRun) {
        await this.db.query('COMMIT');
      }

      report.executionTime = Date.now() - startTime;
      console.log(`[WAREHOUSE_CLEANUP] ${dryRun ? 'DRY RUN - ' : ''}Cleanup completed successfully: ${report.totalItemsCleaned} items cleaned in ${report.executionTime}ms`);

      return report;

    } catch (error) {
      if (!dryRun) {
        await this.db.query('ROLLBACK');
      }
      console.error('[WAREHOUSE_CLEANUP] Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned batch records that have no corresponding inventory items or movements
   */
  private async cleanupOrphanedBatches(dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      itemsCleaned: 0,
      details: [],
      errors: []
    };

    try {
      // Find orphaned batches in product_batches table
      const orphanedBatchesQuery = `
        SELECT 
          pb.id,
          pb.batch_number,
          pb.product_id,
          pb.warehouse_id,
          pb.current_quantity,
          pb.status,
          p.product_name,
          w.name as warehouse_name
        FROM product_batches pb
        LEFT JOIN products p ON pb.product_id = p.id
        LEFT JOIN warehouses w ON pb.warehouse_id = w.id
        WHERE (
          -- Batches with zero quantity and no recent movements
          (pb.current_quantity = 0 AND pb.updated_at < NOW() - INTERVAL '30 days')
          OR
          -- Batches referencing non-existent products
          p.id IS NULL
          OR
          -- Batches referencing non-existent warehouses
          w.id IS NULL
          OR
          -- Batches marked as consumed but still have quantity
          (pb.status = 'consumed' AND pb.current_quantity > 0)
          OR
          -- Expired batches that should be cleaned up
          (pb.status = 'expired' AND pb.updated_at < NOW() - INTERVAL '90 days')
        )
      `;

      const orphanedBatches = await this.db.query(orphanedBatchesQuery);

      if (orphanedBatches.rows.length === 0) {
        result.success = true;
        result.details.push('No orphaned batches found');
        return result;
      }

      console.log(`[CLEANUP_ORPHANED] Found ${orphanedBatches.rows.length} orphaned batches`);

      for (const batch of orphanedBatches.rows) {
        const batchDesc = `Batch ${batch.batch_number} (ID: ${batch.id}) - Product: ${batch.product_name || 'MISSING'} - Warehouse: ${batch.warehouse_name || 'MISSING'}`;
        
        if (dryRun) {
          result.details.push(`[DRY RUN] Would clean: ${batchDesc}`);
          result.itemsCleaned++;
        } else {
          // Create movement record for audit trail before cleanup
          await this.db.query(`
            INSERT INTO inventory_movements (
              product_id,
              quantity,
              movement_type,
              status,
              source_type,
              source_id,
              destination_type,
              performed_at,
              batch_id,
              batch_number,
              notes,
              reference_type,
              source_warehouse_id
            ) VALUES (
              $1, $2, 'CLEANUP', 'completed', 'warehouse', $3, 'cleanup',
              NOW(), $4, $5, $6, 'CLEANUP', $3
            )
          `, [
            batch.product_id,
            batch.current_quantity || 0,
            batch.warehouse_id,
            batch.id,
            batch.batch_number,
            `Automatic cleanup: ${batchDesc}`
          ]);

          // Mark batch as cleaned up
          await this.db.query(`
            UPDATE product_batches 
            SET 
              status = 'cleaned_up',
              current_quantity = 0,
              updated_at = NOW(),
              notes = COALESCE(notes, '') || ' [CLEANUP: ' || NOW() || ']'
            WHERE id = $1
          `, [batch.id]);

          result.details.push(`Cleaned: ${batchDesc}`);
          result.itemsCleaned++;
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('[CLEANUP_ORPHANED] Error:', error);
      result.errors.push(`Orphaned batches cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Create missing movement protocol entries for stock changes that lack proper documentation
   */
  private async createMissingMovementEntries(dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      itemsCleaned: 0,
      details: [],
      errors: []
    };

    try {
      // Find inventory changes that lack movement records
      const missingMovementsQuery = `
        WITH recent_stock_changes AS (
          SELECT 
            pb.id as batch_id,
            pb.product_id,
            pb.warehouse_id,
            pb.batch_number,
            pb.current_quantity,
            pb.initial_quantity,
            pb.updated_at,
            p.product_name,
            w.name as warehouse_name,
            (pb.initial_quantity - pb.current_quantity) as quantity_used
          FROM product_batches pb
          JOIN products p ON pb.product_id = p.id
          JOIN warehouses w ON pb.warehouse_id = w.id
          WHERE pb.updated_at > NOW() - INTERVAL '7 days'
            AND pb.initial_quantity != pb.current_quantity
            AND pb.status = 'active'
        )
        SELECT 
          rsc.*
        FROM recent_stock_changes rsc
        LEFT JOIN inventory_movements im ON (
          im.batch_id = rsc.batch_id 
          AND im.product_id = rsc.product_id
          AND im.performed_at >= rsc.updated_at - INTERVAL '1 hour'
          AND im.performed_at <= rsc.updated_at + INTERVAL '1 hour'
        )
        WHERE im.id IS NULL
          AND rsc.quantity_used > 0
      `;

      const missingMovements = await this.db.query(missingMovementsQuery);

      if (missingMovements.rows.length === 0) {
        result.success = true;
        result.details.push('No missing movement entries found');
        return result;
      }

      console.log(`[CLEANUP_MOVEMENTS] Found ${missingMovements.rows.length} missing movement entries`);

      for (const movement of missingMovements.rows) {
        const movementDesc = `Movement for batch ${movement.batch_number} - ${movement.quantity_used} units used`;
        
        if (dryRun) {
          result.details.push(`[DRY RUN] Would create: ${movementDesc}`);
          result.itemsCleaned++;
        } else {
          // Create missing movement record
          await this.db.query(`
            INSERT INTO inventory_movements (
              product_id,
              quantity,
              movement_type,
              status,
              source_type,
              source_id,
              destination_type,
              performed_at,
              batch_id,
              batch_number,
              notes,
              reference_type,
              source_warehouse_id
            ) VALUES (
              $1, $2, 'OUT', 'completed', 'warehouse', $3, 'unknown',
              $4, $5, $6, $7, 'RECONSTRUCTION', $3
            )
          `, [
            movement.product_id,
            movement.quantity_used,
            movement.warehouse_id,
            movement.updated_at,
            movement.batch_id,
            movement.batch_number,
            `Reconstructed movement entry: ${movementDesc}`
          ]);

          result.details.push(`Created: ${movementDesc}`);
          result.itemsCleaned++;
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('[CLEANUP_MOVEMENTS] Error:', error);
      result.errors.push(`Missing movements creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Fix inconsistent stock quantities between batches and inventory items
   */
  private async fixInconsistentStockQuantities(dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      itemsCleaned: 0,
      details: [],
      errors: []
    };

    try {
      // Find inconsistent stock quantities
      const inconsistentStockQuery = `
        WITH batch_totals AS (
          SELECT 
            pb.warehouse_id,
            pb.product_id,
            SUM(pb.current_quantity) as total_batch_quantity
          FROM product_batches pb
          WHERE pb.status = 'active' AND pb.current_quantity > 0
          GROUP BY pb.warehouse_id, pb.product_id
        ),
        inventory_totals AS (
          SELECT 
            ii.warehouse_id,
            ii.product_id,
            ii.quantity as inventory_quantity
          FROM inventory_items ii
          WHERE ii.status = 'active'
        )
        SELECT 
          COALESCE(bt.warehouse_id, it.warehouse_id) as warehouse_id,
          COALESCE(bt.product_id, it.product_id) as product_id,
          COALESCE(bt.total_batch_quantity, 0) as batch_quantity,
          COALESCE(it.inventory_quantity, 0) as inventory_quantity,
          ABS(COALESCE(bt.total_batch_quantity, 0) - COALESCE(it.inventory_quantity, 0)) as difference,
          p.product_name,
          w.name as warehouse_name
        FROM batch_totals bt
        FULL OUTER JOIN inventory_totals it ON (
          bt.warehouse_id = it.warehouse_id AND bt.product_id = it.product_id
        )
        JOIN products p ON p.id = COALESCE(bt.product_id, it.product_id)
        JOIN warehouses w ON w.id = COALESCE(bt.warehouse_id, it.warehouse_id)
        WHERE COALESCE(bt.total_batch_quantity, 0) != COALESCE(it.inventory_quantity, 0)
          AND ABS(COALESCE(bt.total_batch_quantity, 0) - COALESCE(it.inventory_quantity, 0)) > 0
      `;

      const inconsistentStock = await this.db.query(inconsistentStockQuery);

      if (inconsistentStock.rows.length === 0) {
        result.success = true;
        result.details.push('No inconsistent stock quantities found');
        return result;
      }

      console.log(`[CLEANUP_STOCK] Found ${inconsistentStock.rows.length} stock inconsistencies`);

      for (const item of inconsistentStock.rows) {
        const itemDesc = `${item.product_name} in ${item.warehouse_name}: Batch total=${item.batch_quantity}, Inventory=${item.inventory_quantity}`;
        
        if (dryRun) {
          result.details.push(`[DRY RUN] Would sync: ${itemDesc}`);
          result.itemsCleaned++;
        } else {
          // Update inventory_items to match batch totals (batch data is more accurate)
          await this.db.query(`
            INSERT INTO inventory_items (
              warehouse_id, product_id, quantity, updated_at
            ) VALUES ($1, $2, $3, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET 
              quantity = $3,
              updated_at = NOW(),
              notes = COALESCE(notes, '') || ' [SYNC: ' || NOW() || ']'
          `, [
            item.warehouse_id,
            item.product_id,
            item.batch_quantity
          ]);

          // Create movement record for the correction
          await this.db.query(`
            INSERT INTO inventory_movements (
              product_id,
              quantity,
              movement_type,
              status,
              source_type,
              source_id,
              destination_type,
              performed_at,
              notes,
              reference_type,
              source_warehouse_id,
              previous_stock,
              current_stock
            ) VALUES (
              $1, $2, 'ADJUSTMENT', 'completed', 'warehouse', $3, 'warehouse',
              NOW(), $4, 'SYNC_CORRECTION', $3, $5, $6
            )
          `, [
            item.product_id,
            item.difference,
            item.warehouse_id,
            `Stock synchronization: ${itemDesc}`,
            item.inventory_quantity,
            item.batch_quantity
          ]);

          result.details.push(`Synced: ${itemDesc}`);
          result.itemsCleaned++;
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('[CLEANUP_STOCK] Error:', error);
      result.errors.push(`Stock inconsistency fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Remove expired and obsolete data older than retention periods
   */
  private async removeExpiredData(dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      itemsCleaned: 0,
      details: [],
      errors: []
    };

    try {
      // Clean up old completed movements (older than 1 year)
      const oldMovementsQuery = `
        SELECT COUNT(*) as count
        FROM inventory_movements 
        WHERE status = 'completed' 
          AND performed_at < NOW() - INTERVAL '1 year'
      `;

      const oldMovementsCount = await this.db.query(oldMovementsQuery);
      const movementsToClean = oldMovementsCount.rows[0].count;

      if (movementsToClean > 0) {
        if (dryRun) {
          result.details.push(`[DRY RUN] Would archive ${movementsToClean} old movement records`);
          result.itemsCleaned += parseInt(movementsToClean);
        } else {
          // Archive old movements instead of deleting (for audit compliance)
          await this.db.query(`
            UPDATE inventory_movements 
            SET 
              status = 'archived',
              notes = COALESCE(notes, '') || ' [ARCHIVED: ' || NOW() || ']'
            WHERE status = 'completed' 
              AND performed_at < NOW() - INTERVAL '1 year'
          `);

          result.details.push(`Archived ${movementsToClean} old movement records`);
          result.itemsCleaned += parseInt(movementsToClean);
        }
      }

      // Clean up old expired batches (older than 6 months)
      const oldExpiredBatchesQuery = `
        SELECT COUNT(*) as count
        FROM product_batches 
        WHERE status = 'expired' 
          AND updated_at < NOW() - INTERVAL '6 months'
      `;

      const oldExpiredBatchesCount = await this.db.query(oldExpiredBatchesQuery);
      const batchesToClean = oldExpiredBatchesCount.rows[0].count;

      if (batchesToClean > 0) {
        if (dryRun) {
          result.details.push(`[DRY RUN] Would remove ${batchesToClean} old expired batches`);
          result.itemsCleaned += parseInt(batchesToClean);
        } else {
          await this.db.query(`
            UPDATE product_batches 
            SET 
              status = 'removed',
              current_quantity = 0,
              notes = COALESCE(notes, '') || ' [REMOVED: ' || NOW() || ']'
            WHERE status = 'expired' 
              AND updated_at < NOW() - INTERVAL '6 months'
          `);

          result.details.push(`Removed ${batchesToClean} old expired batches`);
          result.itemsCleaned += parseInt(batchesToClean);
        }
      }

      if (result.itemsCleaned === 0) {
        result.details.push('No expired data found for cleanup');
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('[CLEANUP_EXPIRED] Error:', error);
      result.errors.push(`Expired data cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Get cleanup status and recommendations
   */
  async getCleanupStatus(): Promise<{
    orphanedBatches: number;
    missingMovements: number;
    inconsistentStock: number;
    expiredData: number;
    recommendations: string[];
  }> {
    try {
      const [orphanedCount, missingMovementsCount, inconsistentStockCount, expiredDataCount] = await Promise.all([
        this.db.query(`
          SELECT COUNT(*) as count
          FROM product_batches pb
          LEFT JOIN products p ON pb.product_id = p.id
          LEFT JOIN warehouses w ON pb.warehouse_id = w.id
          WHERE (
            (pb.current_quantity = 0 AND pb.updated_at < NOW() - INTERVAL '30 days')
            OR p.id IS NULL OR w.id IS NULL
            OR (pb.status = 'consumed' AND pb.current_quantity > 0)
            OR (pb.status = 'expired' AND pb.updated_at < NOW() - INTERVAL '90 days')
          )
        `),
        this.db.query(`
          SELECT COUNT(*) as count FROM (
            SELECT pb.id FROM product_batches pb
            WHERE pb.updated_at > NOW() - INTERVAL '7 days'
              AND pb.initial_quantity != pb.current_quantity
              AND pb.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM inventory_movements im 
                WHERE im.batch_id = pb.id 
                  AND im.performed_at >= pb.updated_at - INTERVAL '1 hour'
                  AND im.performed_at <= pb.updated_at + INTERVAL '1 hour'
              )
          ) missing_movements
        `),
        this.db.query(`
          SELECT COUNT(*) as count FROM (
            WITH batch_totals AS (
              SELECT warehouse_id, product_id, SUM(current_quantity) as total
              FROM product_batches 
              WHERE status = 'active' AND current_quantity > 0
              GROUP BY warehouse_id, product_id
            )
            SELECT 1 FROM batch_totals bt
            JOIN inventory_items ii ON bt.warehouse_id = ii.warehouse_id AND bt.product_id = ii.product_id
            WHERE bt.total != ii.quantity
          ) inconsistent
        `),
        this.db.query(`
          SELECT 
            (SELECT COUNT(*) FROM inventory_movements WHERE status = 'completed' AND performed_at < NOW() - INTERVAL '1 year') +
            (SELECT COUNT(*) FROM product_batches WHERE status = 'expired' AND updated_at < NOW() - INTERVAL '6 months') as count
        `)
      ]);

      const recommendations = [];
      const orphaned = parseInt(orphanedCount.rows[0].count);
      const missing = parseInt(missingMovementsCount.rows[0].count);
      const inconsistent = parseInt(inconsistentStockCount.rows[0].count);
      const expired = parseInt(expiredDataCount.rows[0].count);

      if (orphaned > 0) recommendations.push(`Clean up ${orphaned} orphaned batch records`);
      if (missing > 0) recommendations.push(`Create ${missing} missing movement entries`);
      if (inconsistent > 0) recommendations.push(`Fix ${inconsistent} stock inconsistencies`);
      if (expired > 0) recommendations.push(`Archive/remove ${expired} expired data records`);

      if (recommendations.length === 0) {
        recommendations.push('No cleanup needed - data integrity is good');
      }

      return {
        orphanedBatches: orphaned,
        missingMovements: missing,
        inconsistentStock: inconsistent,
        expiredData: expired,
        recommendations
      };

    } catch (error) {
      console.error('[CLEANUP_STATUS] Error:', error);
      throw error;
    }
  }
}
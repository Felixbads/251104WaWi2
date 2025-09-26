/**
 * MHD FIFO Service
 * 
 * Implementiert die First In First Out (FIFO) Logik für die MHD-Übertragung
 * vom Lager zu den Automaten bei Refill-Prozessen.
 */
import { Pool, QueryResult } from 'pg';

export interface FifoMhdTransfer {
  batchId: number;
  expiryDate: string;
  quantityUsed: number;
  quantityRemaining: number;
}

// Type für rawDb
interface DatabaseClient {
  query(text: string, params?: any[]): Promise<QueryResult<any>>;
  connect?(): Promise<any>;
}

export class MhdFifoService {
  private rawDb: DatabaseClient; // Raw PostgreSQL client for transactional queries

  constructor(rawDb: DatabaseClient) {
    this.rawDb = rawDb; // Raw PostgreSQL client for direct queries and transactions
  }

  /**
   * Überträgt MHD-Daten von Lagerbatches zu Automaten-Bestand (FIFO)
   * 
   * @param machineId - ID des Automaten
   * @param productId - ID des Produkts 
   * @param quantityAdded - Hinzugefügte Menge beim Refill
   * @param warehouseId - ID des Lagers
   * @param stockId - Vendon Stock ID aus Refill-Daten
   * @returns FIFO MHD Transfer Details
   */
  async transferMhdFromWarehouse(
    machineId: number,
    productId: string,
    quantityAdded: number,
    warehouseId: number,
    stockId: number,
    client?: DatabaseClient  // Optional transaction client
  ): Promise<FifoMhdTransfer[]> {
    const transfers: FifoMhdTransfer[] = [];
    const dbClient = client || this.rawDb; // Use provided client or default
    
    try {
      
      console.log(`[MHD_FIFO] Transferring ${quantityAdded} units of product ${productId} to machine ${machineId}`);

      // 1. Hole verfügbare Product Batches für dieses Produkt (FIFO-sortiert)
      // WICHTIG: Filtere abgelaufene Chargen aus (expiry_date >= CURRENT_DATE)
      const batchesResult = await dbClient.query(`
        SELECT pb.id, pb.expiry_date, pb.current_quantity as quantity, pb.batch_number, pb.incoming_date
        FROM product_batches pb
        JOIN products p ON pb.product_id = p.id
        WHERE pb.warehouse_id = $1 
          AND p.vendon_id = $2
          AND pb.current_quantity > 0
          AND pb.status = 'active'
          AND (pb.expiry_date IS NULL OR pb.expiry_date >= CURRENT_DATE)  -- Keine abgelaufenen Chargen
        ORDER BY pb.incoming_date ASC, pb.expiry_date ASC
      `, [warehouseId, productId]);

      if (batchesResult.rows.length === 0) {
        console.log(`[MHD_FIFO] No product batches found for product ${productId} in warehouse ${warehouseId}`);
        return transfers; // Safe return - no transaction state change
      }

      let remainingQuantity = quantityAdded;
      
      // 2. FIFO: Verwende älteste Chargen zuerst
      for (const batch of batchesResult.rows) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromThisBatch = Math.min(remainingQuantity, batch.quantity);
        
        console.log(`[MHD_FIFO] Using ${quantityFromThisBatch} from batch ${batch.batch_number} (expiry: ${batch.expiry_date})`);

        // 3. Erstelle/Update Machine Stock mit MHD-Daten
        await dbClient.query(`
          INSERT INTO machine_stocks (
            machine_id, machine_vendon_id, product_vendon_id, quantity, 
            expiry_date, batch_id, received_date, status
          ) VALUES (
            $1, 
            (SELECT vendon_id FROM machines WHERE id = $1),
            $2,
            $3,
            $4,
            $5,
            NOW(),
            'active'
          )
          ON CONFLICT (machine_id, product_vendon_id, batch_id) 
          DO UPDATE SET 
            quantity = machine_stocks.quantity + $3,
            received_date = NOW(),
            updated_at = NOW()
        `, [
          machineId,
          productId,
          quantityFromThisBatch,
          batch.expiry_date,
          batch.id
        ]);

        // 4. Reduziere Lagerbestand in product_batches
        await dbClient.query(`
          UPDATE product_batches 
          SET current_quantity = current_quantity - $1, updated_at = NOW()
          WHERE id = $2
        `, [quantityFromThisBatch, batch.id]);

        // 5. Dokumentiere den Transfer
        transfers.push({
          batchId: batch.id,
          expiryDate: batch.expiry_date,
          quantityUsed: quantityFromThisBatch,
          quantityRemaining: batch.quantity - quantityFromThisBatch
        });

        remainingQuantity -= quantityFromThisBatch;
      }

      console.log(`[MHD_FIFO] Successfully transferred ${quantityAdded - remainingQuantity} units with MHD data`);
      
      return transfers;
      
    } catch (error) {
      console.error('[MHD_FIFO] Error in FIFO transfer:', error);
      throw error; // Let parent transaction handle rollback
    }
  }

  /**
   * 🔥 CRITICAL: Automatic FIFO Withdrawal with Inventory Transaction Integration
   * 
   * Automatically selects batches using FIFO principles and creates inventory movements
   * 
   * @param warehouseId - ID des Lagers
   * @param productId - ID des Produkts (numeric)
   * @param requestedQuantity - Angeforderte Menge
   * @param movementType - Art der Bewegung (default: 'OUT')
   * @param destinationType - Zieltyp (default: 'machine')
   * @param destinationId - Ziel-ID (z.B. Automaten-ID)
   * @param performedBy - Benutzer-ID
   * @param notes - Zusätzliche Notizen
   * @returns FIFO Withdrawal Details mit Bewegungsprotokoll
   */
  async automaticFifoWithdrawal(
    warehouseId: number,
    productId: number,
    requestedQuantity: number,
    options: {
      movementType?: string;
      destinationType?: string;
      destinationId?: number;
      performedBy?: number;
      notes?: string;
      referenceType?: string;
      referenceId?: number;
    } = {},
    client?: DatabaseClient  // Optional transaction client
  ): Promise<{
    success: boolean;
    totalWithdrawn: number;
    batches: FifoMhdTransfer[];
    movements: any[];
    error?: string;
  }> {
    const {
      movementType = 'OUT',
      destinationType = 'machine',
      destinationId,
      performedBy,
      notes = 'Automatic FIFO Withdrawal',
      referenceType,
      referenceId
    } = options;

    const withdrawalResult = {
      success: false,
      totalWithdrawn: 0,
      batches: [] as FifoMhdTransfer[],
      movements: [] as any[],
      error: undefined as string | undefined
    };

    const dbClient = client || this.rawDb; // Use provided client or default

    try {
      
      console.log(`[FIFO_AUTO] Starting automatic FIFO withdrawal: ${requestedQuantity} units of product ${productId} from warehouse ${warehouseId}`);

      // 1. Hole verfügbare Batches mit FIFO-Sortierung (modernere product_batches Tabelle)
      const batchesResult = await dbClient.query(`
        SELECT 
          pb.id, 
          pb.batch_number, 
          pb.current_quantity, 
          pb.expiry_date, 
          pb.received_date,
          pb.location_in_warehouse,
          p.product_name,
          p.sku
        FROM product_batches pb
        JOIN products p ON pb.product_id = p.id
        WHERE pb.warehouse_id = $1 
          AND pb.product_id = $2
          AND pb.current_quantity > 0
          AND pb.status = 'active'
          AND (pb.expiry_date IS NULL OR pb.expiry_date > CURRENT_DATE)
        ORDER BY pb.expiry_date ASC NULLS LAST, pb.received_date ASC
      `, [warehouseId, productId]);

      if (batchesResult.rows.length === 0) {
        withdrawalResult.error = `No available batches for product ${productId} in warehouse ${warehouseId}`;
        return withdrawalResult; // Safe return - no transaction changes
      }

      let remainingQuantity = requestedQuantity;
      
      // 2. FIFO: Verwende älteste Chargen zuerst
      for (const batch of batchesResult.rows) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromThisBatch = Math.min(remainingQuantity, batch.current_quantity);
        
        console.log(`[FIFO_AUTO] Withdrawing ${quantityFromThisBatch} from batch ${batch.batch_number} (expiry: ${batch.expiry_date || 'no expiry'})`);

        // 3. Update Batch-Bestand
        await this.rawDb.query(`
          UPDATE product_batches 
          SET 
            current_quantity = current_quantity - $1, 
            updated_at = NOW(),
            version = version + 1
          WHERE id = $2 AND current_quantity >= $1
        `, [quantityFromThisBatch, batch.id]);

        // 4. Erstelle Inventory Movement Record für vollständige Nachverfolgung
        const movementResult = await this.rawDb.query(`
          INSERT INTO inventory_movements (
            product_id,
            quantity,
            movement_type,
            status,
            source_type,
            source_id,
            destination_type,
            destination_id,
            performed_at,
            performed_by,
            batch_id,
            batch_number,
            expiry_date,
            notes,
            reference_type,
            reference_id,
            source_warehouse_id,
            destination_warehouse_id
          ) VALUES (
            $1, $2, $3, 'completed', 'warehouse', $4, $5, $6,
            NOW(), $7, $8, $9, $10, $11, $12, $13, $4,
            CASE WHEN $5 = 'warehouse' THEN $6 ELSE NULL END
          )
          RETURNING id, performed_at
        `, [
          productId,
          quantityFromThisBatch,
          movementType,
          warehouseId,
          destinationType,
          destinationId,
          performedBy,
          batch.id,
          batch.batch_number,
          batch.expiry_date,
          notes,
          referenceType,
          referenceId
        ]);

        // 5. Dokumentiere die Batch-Verwendung
        withdrawalResult.batches.push({
          batchId: batch.id,
          expiryDate: batch.expiry_date || '',
          quantityUsed: quantityFromThisBatch,
          quantityRemaining: batch.current_quantity - quantityFromThisBatch
        });

        // 6. Dokumentiere die Bewegung
        withdrawalResult.movements.push({
          id: movementResult.rows[0].id,
          batchId: batch.id,
          batchNumber: batch.batch_number,
          quantity: quantityFromThisBatch,
          expiryDate: batch.expiry_date,
          performedAt: movementResult.rows[0].performed_at
        });

        remainingQuantity -= quantityFromThisBatch;
      }

      withdrawalResult.totalWithdrawn = requestedQuantity - remainingQuantity;
      withdrawalResult.success = true;

      await this.rawDb.query('COMMIT');
      
      console.log(`[FIFO_AUTO] Successfully completed automatic withdrawal: ${withdrawalResult.totalWithdrawn}/${requestedQuantity} units`);
      
      if (remainingQuantity > 0) {
        console.log(`[FIFO_AUTO] WARNING: Could not fulfill complete request. Remaining: ${remainingQuantity} units`);
      }

      return withdrawalResult;
      
    } catch (error) {
      await this.rawDb.query('ROLLBACK');
      console.error('[FIFO_AUTO] Error in automatic FIFO withdrawal:', error);
      withdrawalResult.error = error instanceof Error ? error.message : 'Unknown error';
      return withdrawalResult;
    }
  }

  /**
   * Prüft auf ablaufende MHD-Produkte in einem Automaten
   * 
   * @param machineId - ID des Automaten
   * @param daysAhead - Tage vorausschauend (default: 7)
   * @returns Ablaufende Produkte mit MHD-Informationen
   */
  async getExpiringProducts(machineId: number, daysAhead: number = 7) {
    const result = await this.rawDb.query(`
      SELECT 
        ms.product_vendon_id,
        p.product_name,
        ms.quantity,
        ms.expiry_date,
        ib.batch_number,
        DATE_PART('day', ms.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM machine_stocks ms
      LEFT JOIN products p ON ms.product_vendon_id = p.vendon_id
      LEFT JOIN inventory_batches ib ON ms.batch_id = ib.id
      WHERE ms.machine_id = $1
        AND ms.expiry_date IS NOT NULL
        AND ms.expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
        AND ms.quantity > 0
      ORDER BY ms.expiry_date ASC
    `, [machineId]);

    return result.rows;
  }

  /**
   * 🔥 CALCULATE FIFO BATCH ALLOCATION (für Frontend-Anzeige)
   * 
   * Berechnet FIFO-basierte Batch-Zuordnung für Automaten-Bestand
   */
  async calculateFifoBatchAllocation(
    machineId: number, 
    productIdentifier: string, 
    currentQuantity: number
  ): Promise<{
    batches: Array<{
      batchId: number;
      batchNumber: string;
      quantity: number;
      expiryDate: string;
      daysUntilExpiry: number;
    }>;
    earliestMhd: string | null;
    totalBatches: number;
    mhdStatus: 'ok' | 'warning' | 'expired';
  }> {
    try {
      console.log(`[FIFO_CALC] Calculating FIFO allocation for machine ${machineId}, product ${productIdentifier}`);

      // 🔥 FIXED: FIFO-Batch-Zuordnung basierend auf machine_stocks mit korrekten Spalten
      const batchResult = await this.rawDb.query(`
        SELECT 
          ms.batch_id,
          ms.expiry_date,
          ms.quantity,
          COALESCE(pb.batch_number, CONCAT('BATCH-', ms.batch_id)) as batch_number,
          CASE 
            WHEN ms.expiry_date IS NOT NULL THEN 
              (ms.expiry_date::date - CURRENT_DATE::date)
            ELSE NULL 
          END as days_until_expiry
        FROM machine_stocks ms
        LEFT JOIN products p ON ms.product_vendon_id = p.vendon_id
        LEFT JOIN product_batches pb ON ms.batch_id = pb.id
        WHERE ms.machine_id = $1 
          AND (ms.product_vendon_id = $2 OR p.product_name ILIKE $3)
          AND ms.quantity > 0
        ORDER BY ms.expiry_date ASC NULLS LAST, ms.received_date ASC
      `, [machineId, productIdentifier, `%${productIdentifier}%`]);

      // Verarbeitung und Status-Berechnung
      const batches = batchResult.rows.map(row => ({
        batchId: row.batch_id,
        batchNumber: row.batch_number || `BATCH-${row.batch_id}`,
        quantity: row.quantity,
        expiryDate: row.expiry_date,
        daysUntilExpiry: row.days_until_expiry || 999
      }));

      const earliestMhd = batches.length > 0 ? batches[0].expiryDate : null;
      const mhdStatus = batches.some(b => b.daysUntilExpiry < 0) ? 'expired' :
                       batches.some(b => b.daysUntilExpiry <= 7) ? 'warning' : 'ok';

      console.log(`[FIFO_CALC] Berechnung abgeschlossen: ${batches.length} Chargen, Status: ${mhdStatus}`);

      return {
        batches,
        earliestMhd,
        totalBatches: batches.length,
        mhdStatus
      };

    } catch (error) {
      console.error('[FIFO_CALC] Fehler bei FIFO-Berechnung:', error);
      throw error;
    }
  }

  /**
   * MHD-optimierte Nachbestellungslogik
   * 
   * @param warehouseId - ID des Lagers  
   * @param daysAhead - Tage vorausschauend für MHD-Prognose
   * @returns Empfohlene Nachbestellungen basierend auf FIFO und MHD
   */
  async batchOptimizedReorder(warehouseId: number, daysAhead: number = 30) {
    try {
      const result = await this.rawDb.query(`
        WITH expiring_stock AS (
          SELECT 
            p.vendon_id as product_vendon_id,
            p.product_name,
            SUM(ib.quantity) as expiring_quantity,
            MIN(ib.expiry_date) as earliest_expiry,
            COUNT(ib.id) as batch_count
          FROM inventory_batches ib
          JOIN products p ON ib.product_id = p.id
          WHERE ib.warehouse_id = $1
            AND ib.status = 'active'
            AND ib.quantity > 0
            AND ib.expiry_date IS NOT NULL
            AND ib.expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
          GROUP BY p.vendon_id, p.product_name
        ),
        low_stock AS (
          SELECT 
            p.vendon_id as product_vendon_id,
            p.product_name,
            SUM(ib.quantity) as total_quantity,
            p.minimum_stock_level,
            CASE 
              WHEN p.minimum_stock_level IS NOT NULL 
              THEN (p.minimum_stock_level - SUM(ib.quantity))
              ELSE 0
            END as reorder_suggestion
          FROM products p
          LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.warehouse_id = $1 AND ib.status = 'active'
          WHERE p.is_active = true
          GROUP BY p.vendon_id, p.product_name, p.minimum_stock_level
          HAVING SUM(ib.quantity) <= COALESCE(p.minimum_stock_level, 0)
        )
        SELECT 
          COALESCE(es.product_vendon_id, ls.product_vendon_id) as product_vendon_id,
          COALESCE(es.product_name, ls.product_name) as product_name,
          es.expiring_quantity,
          es.earliest_expiry,
          es.batch_count,
          ls.total_quantity,
          ls.minimum_stock_level,
          ls.reorder_suggestion,
          CASE 
            WHEN es.earliest_expiry IS NOT NULL THEN 'EXPIRING'
            WHEN ls.reorder_suggestion > 0 THEN 'LOW_STOCK'
            ELSE 'NORMAL'
          END as priority_reason
        FROM expiring_stock es
        FULL OUTER JOIN low_stock ls ON es.product_vendon_id = ls.product_vendon_id
        ORDER BY 
          CASE 
            WHEN es.earliest_expiry IS NOT NULL THEN es.earliest_expiry
            ELSE CURRENT_DATE + INTERVAL '999 days'
          END ASC,
          ls.reorder_suggestion DESC
      `, [warehouseId]);

      return result.rows;
      
    } catch (error) {
      console.error('[MHD_FIFO] Error in batch optimized reorder:', error);
      throw error;
    }
  }

  /**
   * Ablaufwarnungssystem mit 7/14/30 Tage Vorlauf
   * 
   * @param warehouseId - ID des Lagers (optional, null = alle Lager)
   * @param alertLevels - Array der Warnstufen in Tagen [7, 14, 30]
   * @returns Strukturierte Ablaufwarnungen nach Dringlichkeit
   */
  async expiryAlertSystem(
    warehouseId?: number, 
    alertLevels: number[] = [7, 14, 30]
  ) {
    try {
      const whereClause = warehouseId ? 'AND ib.warehouse_id = $2' : '';
      const params = warehouseId ? [alertLevels.join(','), warehouseId] : [alertLevels.join(',')];
      
      const result = await this.rawDb.query(`
        WITH alert_batches AS (
          SELECT 
            ib.id as batch_id,
            ib.batch_number,
            ib.quantity,
            ib.expiry_date,
            ib.warehouse_id,
            w.name as warehouse_name,
            p.vendon_id as product_vendon_id,
            p.product_name,
            DATE_PART('day', ib.expiry_date - CURRENT_DATE) as days_until_expiry,
            CASE 
              WHEN DATE_PART('day', ib.expiry_date - CURRENT_DATE) <= 7 THEN 'CRITICAL'
              WHEN DATE_PART('day', ib.expiry_date - CURRENT_DATE) <= 14 THEN 'HIGH'
              WHEN DATE_PART('day', ib.expiry_date - CURRENT_DATE) <= 30 THEN 'MEDIUM'
              ELSE 'LOW'
            END as alert_level,
            ib.quantity * COALESCE(p.purchase_price, 0) as potential_loss_value
          FROM inventory_batches ib
          JOIN products p ON ib.product_id = p.id
          JOIN warehouses w ON ib.warehouse_id = w.id
          WHERE ib.status = 'active'
            AND ib.quantity > 0
            AND ib.expiry_date IS NOT NULL
            AND ib.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
            ${whereClause}
        )
        SELECT 
          alert_level,
          COUNT(*) as batch_count,
          SUM(quantity) as total_quantity,
          SUM(potential_loss_value) as total_potential_loss,
          json_agg(
            json_build_object(
              'batch_id', batch_id,
              'batch_number', batch_number,
              'product_name', product_name,
              'product_vendon_id', product_vendon_id,
              'warehouse_name', warehouse_name,
              'quantity', quantity,
              'expiry_date', expiry_date,
              'days_until_expiry', days_until_expiry,
              'potential_loss_value', potential_loss_value
            ) ORDER BY days_until_expiry ASC
          ) as batches
        FROM alert_batches
        GROUP BY alert_level
        ORDER BY 
          CASE alert_level
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            ELSE 4
          END
      `, params);

      return result.rows;
      
    } catch (error) {
      console.error('[MHD_FIFO] Error in expiry alert system:', error);
      throw error;
    }
  }

  /**
   * Automatische Batch-Zusammenführung für ähnliche MHD
   * 
   * @param warehouseId - ID des Lagers
   * @param maxDaysDifference - Maximale Tage Unterschied für Zusammenführung (default: 3)
   * @returns Zusammengeführte Batches
   */
  async batchConsolidation(warehouseId: number, maxDaysDifference: number = 3) {
    try {
      await this.rawDb.query('BEGIN');
      
      console.log(`[MHD_FIFO] Starting batch consolidation for warehouse ${warehouseId}`);

      // Finde Batches mit ähnlichen MHD für das gleiche Produkt
      const consolidationCandidates = await this.rawDb.query(`
        WITH similar_batches AS (
          SELECT 
            ib1.id as batch1_id,
            ib1.batch_number as batch1_number,
            ib1.quantity as batch1_quantity,
            ib1.expiry_date as batch1_expiry,
            ib2.id as batch2_id,
            ib2.batch_number as batch2_number,
            ib2.quantity as batch2_quantity,
            ib2.expiry_date as batch2_expiry,
            p.vendon_id as product_vendon_id,
            p.product_name,
            ABS(DATE_PART('day', ib1.expiry_date - ib2.expiry_date)) as days_difference
          FROM inventory_batches ib1
          JOIN inventory_batches ib2 ON ib1.product_id = ib2.product_id 
            AND ib1.warehouse_id = ib2.warehouse_id
            AND ib1.id < ib2.id  -- Vermeide Duplikate
          JOIN products p ON ib1.product_id = p.id
          WHERE ib1.warehouse_id = $1
            AND ib1.status = 'active' 
            AND ib2.status = 'active'
            AND ib1.quantity > 0 
            AND ib2.quantity > 0
            AND ib1.expiry_date IS NOT NULL 
            AND ib2.expiry_date IS NOT NULL
            AND ABS(DATE_PART('day', ib1.expiry_date - ib2.expiry_date)) <= $2
        )
        SELECT * FROM similar_batches
        ORDER BY product_vendon_id, days_difference ASC
      `, [warehouseId, maxDaysDifference]);

      const consolidatedBatches = [];
      
      for (const candidate of consolidationCandidates.rows) {
        // Wähle das Batch mit dem früheren Datum als Hauptbatch
        const mainBatchId = candidate.batch1_expiry <= candidate.batch2_expiry 
          ? candidate.batch1_id : candidate.batch2_id;
        const mergeBatchId = candidate.batch1_expiry <= candidate.batch2_expiry 
          ? candidate.batch2_id : candidate.batch1_id;
        const mergeQuantity = candidate.batch1_expiry <= candidate.batch2_expiry 
          ? candidate.batch2_quantity : candidate.batch1_quantity;

        // Führe Batches zusammen
        await this.rawDb.query(`
          UPDATE inventory_batches 
          SET quantity = quantity + $1, 
              updated_at = NOW(),
              batch_number = batch_number || '+' || (SELECT batch_number FROM inventory_batches WHERE id = $2)
          WHERE id = $3
        `, [mergeQuantity, mergeBatchId, mainBatchId]);

        // Markiere das zusammengeführte Batch als inaktiv
        await this.rawDb.query(`
          UPDATE inventory_batches 
          SET status = 'consolidated', quantity = 0, updated_at = NOW()
          WHERE id = $1
        `, [mergeBatchId]);

        consolidatedBatches.push({
          productName: candidate.product_name,
          mainBatchId: mainBatchId,
          mergedBatchId: mergeBatchId,
          quantityMerged: mergeQuantity,
          daysDifference: candidate.days_difference
        });

        console.log(`[MHD_FIFO] Consolidated batch ${mergeBatchId} into ${mainBatchId} (${mergeQuantity} units)`);
      }

      await this.rawDb.query('COMMIT');
      
      console.log(`[MHD_FIFO] Successfully consolidated ${consolidatedBatches.length} batch pairs`);
      return consolidatedBatches;
      
    } catch (error) {
      await this.rawDb.query('ROLLBACK');
      console.error('[MHD_FIFO] Error in batch consolidation:', error);
      throw error;
    }
  }

  /**
   * Erstellt automatisch Testdaten für MHD-System (nur für Demo)
   */
  async createTestMhdData(warehouseId: number, productVendonId: string) {
    try {
      // Finde das Produkt
      const productResult = await this.rawDb.query(
        'SELECT id FROM products WHERE vendon_id = $1',
        [productVendonId]
      );

      if (productResult.rows.length === 0) {
        console.log(`[MHD_FIFO] Product ${productVendonId} not found for test data creation`);
        return;
      }

      const productId = productResult.rows[0].id;

      // Erstelle Test-Inventory-Batches mit verschiedenen MHD
      const testBatches = [
        { quantity: 10, daysUntilExpiry: 5, batchNumber: 'TEST-001' },   // Bald ablaufend
        { quantity: 15, daysUntilExpiry: 10, batchNumber: 'TEST-002' },  // Ablaufend
        { quantity: 20, daysUntilExpiry: 30, batchNumber: 'TEST-003' },  // Normal
      ];

      for (const batch of testBatches) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + batch.daysUntilExpiry);

        await this.rawDb.query(`
          INSERT INTO inventory_batches (
            warehouse_id, product_id, quantity, batch_number, 
            expiry_date, incoming_date, status
          ) VALUES ($1, $2, $3, $4, $5, NOW(), 'active')
          ON CONFLICT DO NOTHING
        `, [
          warehouseId,
          productId,
          batch.quantity,
          batch.batchNumber,
          expiryDate.toISOString().split('T')[0]
        ]);
      }

      console.log(`[MHD_FIFO] Created test MHD data for product ${productVendonId}`);
      
    } catch (error) {
      console.error('[MHD_FIFO] Error creating test data:', error);
    }
  }
}
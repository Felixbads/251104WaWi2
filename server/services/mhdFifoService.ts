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
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
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
    stockId: number
  ): Promise<FifoMhdTransfer[]> {
    const transfers: FifoMhdTransfer[] = [];
    
    try {
      await this.db.query('BEGIN');
      
      console.log(`[MHD_FIFO] Transferring ${quantityAdded} units of product ${productId} to machine ${machineId}`);

      // 1. Hole verfügbare Inventory Batches für dieses Produkt (FIFO-sortiert)
      // WICHTIG: Filtere abgelaufene Chargen aus (expiry_date >= CURRENT_DATE)
      const batchesResult = await this.db.query(`
        SELECT ib.id, ib.expiry_date, ib.quantity, ib.batch_number, ib.incoming_date
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        WHERE ib.warehouse_id = $1 
          AND p.vendon_id = $2
          AND ib.quantity > 0
          AND ib.status = 'active'
          AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)  -- Keine abgelaufenen Chargen
        ORDER BY ib.incoming_date ASC, ib.expiry_date ASC
      `, [warehouseId, productId]);

      if (batchesResult.rows.length === 0) {
        console.log(`[MHD_FIFO] No inventory batches found for product ${productId} in warehouse ${warehouseId}`);
        return transfers;
      }

      let remainingQuantity = quantityAdded;
      
      // 2. FIFO: Verwende älteste Chargen zuerst
      for (const batch of batchesResult.rows) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromThisBatch = Math.min(remainingQuantity, batch.quantity);
        
        console.log(`[MHD_FIFO] Using ${quantityFromThisBatch} from batch ${batch.batch_number} (expiry: ${batch.expiry_date})`);

        // 3. Erstelle/Update Machine Stock mit MHD-Daten
        await this.db.query(`
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

        // 4. Reduziere Lagerbestand in inventory_batches
        await this.db.query(`
          UPDATE inventory_batches 
          SET quantity = quantity - $1, updated_at = NOW()
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

      await this.db.query('COMMIT');
      
      console.log(`[MHD_FIFO] Successfully transferred ${quantityAdded - remainingQuantity} units with MHD data`);
      
      return transfers;
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[MHD_FIFO] Error in FIFO transfer:', error);
      throw error;
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
    const result = await this.db.query(`
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
   * Automatische FIFO-Entnahme mit MHD-Optimierung
   * 
   * @param warehouseId - ID des Lagers
   * @param productId - Vendon ID des Produkts
   * @param quantityToDeplete - Zu entnehmende Menge
   * @param movementType - Art der Bewegung ('OUT' | 'TRANSFER' | 'REFILL')
   * @param allowPartialBatches - Teilentnahmen aus Batches erlauben
   * @returns FIFO-Entnahme Details mit verwendeten Batches
   */
  async automaticFifoWithdrawal(
    warehouseId: number,
    productId: string,
    quantityToDeplete: number,
    movementType: 'OUT' | 'TRANSFER' | 'REFILL' = 'OUT',
    allowPartialBatches: boolean = true
  ): Promise<FifoMhdTransfer[]> {
    const withdrawals: FifoMhdTransfer[] = [];
    
    try {
      await this.db.query('BEGIN');
      
      console.log(`[MHD_FIFO] Starting automatic FIFO withdrawal: ${quantityToDeplete} units of product ${productId}`);

      // Hole verfügbare Batches (FIFO-sortiert, keine abgelaufenen)
      const batchesResult = await this.db.query(`
        SELECT ib.id, ib.expiry_date, ib.quantity, ib.batch_number, ib.incoming_date,
               CASE 
                 WHEN ib.expiry_date IS NULL THEN 999
                 ELSE DATE_PART('day', ib.expiry_date - CURRENT_DATE)
               END as days_until_expiry
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        WHERE ib.warehouse_id = $1 
          AND p.vendon_id = $2
          AND ib.quantity > 0
          AND ib.status = 'active'
          AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
        ORDER BY ib.incoming_date ASC, ib.expiry_date ASC NULLS LAST
      `, [warehouseId, productId]);

      if (batchesResult.rows.length === 0) {
        console.warn(`[MHD_FIFO] No available batches for product ${productId} in warehouse ${warehouseId}`);
        await this.db.query('ROLLBACK');
        return withdrawals;
      }

      let remainingQuantity = quantityToDeplete;
      
      // FIFO-Entnahme: Älteste Batches zuerst
      for (const batch of batchesResult.rows) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromThisBatch = allowPartialBatches 
          ? Math.min(remainingQuantity, batch.quantity)
          : (batch.quantity >= remainingQuantity ? remainingQuantity : 0);
          
        if (quantityFromThisBatch <= 0) continue;
        
        // Warne bei bald ablaufenden Produkten (< 7 Tage)
        if (batch.days_until_expiry < 7 && batch.days_until_expiry > 0) {
          console.warn(`[MHD_FIFO] WARNING: Using batch ${batch.batch_number} expiring in ${batch.days_until_expiry} days`);
        }

        // Reduziere Batch-Bestand
        await this.db.query(`
          UPDATE inventory_batches 
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE id = $2 AND quantity >= $1
        `, [quantityFromThisBatch, batch.id]);

        // Dokumentiere Entnahme
        withdrawals.push({
          batchId: batch.id,
          expiryDate: batch.expiry_date,
          quantityUsed: quantityFromThisBatch,
          quantityRemaining: batch.quantity - quantityFromThisBatch
        });

        remainingQuantity -= quantityFromThisBatch;
        
        console.log(`[MHD_FIFO] Withdrew ${quantityFromThisBatch} from batch ${batch.batch_number} (${remainingQuantity} remaining)`);
      }

      if (remainingQuantity > 0) {
        console.warn(`[MHD_FIFO] Could not fulfill complete withdrawal: ${remainingQuantity} units short`);
      }

      await this.db.query('COMMIT');
      
      console.log(`[MHD_FIFO] Successfully withdrew ${quantityToDeplete - remainingQuantity} units using FIFO`);
      return withdrawals;
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[MHD_FIFO] Error in automatic FIFO withdrawal:', error);
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
      const result = await this.db.query(`
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
      
      const result = await this.db.query(`
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
      await this.db.query('BEGIN');
      
      console.log(`[MHD_FIFO] Starting batch consolidation for warehouse ${warehouseId}`);

      // Finde Batches mit ähnlichen MHD für das gleiche Produkt
      const consolidationCandidates = await this.db.query(`
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
        await this.db.query(`
          UPDATE inventory_batches 
          SET quantity = quantity + $1, 
              updated_at = NOW(),
              batch_number = batch_number || '+' || (SELECT batch_number FROM inventory_batches WHERE id = $2)
          WHERE id = $3
        `, [mergeQuantity, mergeBatchId, mainBatchId]);

        // Markiere das zusammengeführte Batch als inaktiv
        await this.db.query(`
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

      await this.db.query('COMMIT');
      
      console.log(`[MHD_FIFO] Successfully consolidated ${consolidatedBatches.length} batch pairs`);
      return consolidatedBatches;
      
    } catch (error) {
      await this.db.query('ROLLBACK');
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
      const productResult = await this.db.query(
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

        await this.db.query(`
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
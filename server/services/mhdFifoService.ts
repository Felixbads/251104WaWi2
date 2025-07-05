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
      const batchesResult = await this.db.query(`
        SELECT ib.id, ib.expiry_date, ib.quantity, ib.batch_number, ib.incoming_date
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        WHERE ib.warehouse_id = $1 
          AND p.vendon_id = $2
          AND ib.quantity > 0
          AND ib.status = 'active'
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
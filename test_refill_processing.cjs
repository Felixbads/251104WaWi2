/**
 * Test script für Refill-Verarbeitung mit Lagerbestandsabzug
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testRefillProcessing(refillId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log(`[REFILL_PROCESS] Processing refill ${refillId}`);
    
    // Refill-Daten abrufen
    const refillResult = await client.query(
      'SELECT r.*, m.machine_name FROM refills r LEFT JOIN machines m ON r.machine_id = m.id WHERE r.id = $1',
      [refillId]
    );
    
    if (refillResult.rows.length === 0) {
      throw new Error('Refill nicht gefunden');
    }
    
    const refill = refillResult.rows[0];
    console.log(`[REFILL_PROCESS] Found refill for machine: ${refill.machine_name}`);
    
    // Machine-Warehouse-Assignment abrufen
    const assignmentResult = await client.query(
      'SELECT warehouse_id FROM machine_warehouse_assignments WHERE machine_id = $1',
      [refill.machine_id]
    );
    
    if (assignmentResult.rows.length === 0) {
      console.log(`[REFILL_PROCESS] No warehouse assignment found for machine ${refill.machine_id}`);
      throw new Error('Keine Lager-Zuordnung für diesen Automaten gefunden');
    }
    
    const warehouseId = assignmentResult.rows[0].warehouse_id;
    console.log(`[REFILL_PROCESS] Using warehouse: ${warehouseId}`);
    
    // Refill-Details abrufen
    const detailsResult = await client.query(
      'SELECT * FROM refill_details WHERE refill_id = $1',
      [refillId]
    );
    
    const details = detailsResult.rows;
    console.log(`[REFILL_PROCESS] Found ${details.length} refill details`);
    
    if (details.length === 0) {
      throw new Error('Keine Refill-Details gefunden');
    }
    
    let processedItems = 0;
    
    // Für jedes Detail Inventarabzug erstellen
    for (const detail of details) {
      const quantity = detail.added || detail.quantity || 0; // Use 'added' for refills
      
      if (quantity <= 0) {
        console.log(`[REFILL_PROCESS] Skipping detail ${detail.id} - no quantity to deduct`);
        continue;
      }
      
      // Produkt anhand des Namens finden
      let productId = null;
      
      if (detail.vendon_product_id) {
        // Zuerst über Vendon-ID suchen
        const productByVendonResult = await client.query(
          'SELECT id FROM products WHERE vendon_id = $1',
          [detail.vendon_product_id]
        );
        
        if (productByVendonResult.rows.length > 0) {
          productId = productByVendonResult.rows[0].id;
        }
      }
      
      if (!productId && detail.product_name) {
        // Fallback: über Namen suchen
        const productByNameResult = await client.query(
          'SELECT id FROM products WHERE LOWER(product_name) = LOWER($1)',
          [detail.product_name]
        );
        
        if (productByNameResult.rows.length > 0) {
          productId = productByNameResult.rows[0].id;
        }
      }
      
      if (!productId) {
        console.log(`[REFILL_PROCESS] Product not found for detail: ${detail.product_name}`);
        continue;
      }
      
      console.log(`[REFILL_PROCESS] Processing product ${productId}: ${detail.product_name}, quantity: ${quantity}`);
      
      // Aktuellen Lagerbestand abrufen
      const inventoryResult = await client.query(
        'SELECT quantity FROM inventory_items WHERE warehouse_id = $1 AND product_id = $2',
        [warehouseId, productId]
      );
      
      let currentStock = 0;
      if (inventoryResult.rows.length > 0) {
        currentStock = inventoryResult.rows[0].quantity;
      }
      
      const newStock = Math.max(0, currentStock - quantity);
      
      // Lagerbestand aktualisieren oder erstellen
      await client.query(`
        INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity, updated_at)
        VALUES ($1, $2, $3, 0, NOW())
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = $3, updated_at = NOW()
      `, [warehouseId, productId, newStock]);
      
      // Inventarbewegung erstellen
      await client.query(`
        INSERT INTO inventory_movements (
          source_warehouse_id, product_id, quantity, movement_type, direction,
          reference_type, reference_id, machine_id, previous_stock, current_stock,
          notes, performed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'refill', 'OUT', 'REFILL', $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
      `, [
        warehouseId, productId, quantity, refillId.toString(), refill.machine_id,
        currentStock, newStock, `Refill ${refill.machine_name}: ${detail.product_name}`
      ]);
      
      console.log(`[REFILL_PROCESS] Created inventory movement: ${quantity} units of product ${productId} from warehouse ${warehouseId} (${currentStock} -> ${newStock})`);
      processedItems++;
    }
    
    // Refill als verarbeitet markieren
    await client.query(
      'UPDATE refills SET process_status = $1, processed_at = NOW() WHERE id = $2',
      ['processed', refillId]
    );
    
    await client.query('COMMIT');
    console.log(`[REFILL_PROCESS] Successfully processed refill ${refillId} - ${processedItems} items processed`);
    
    return {
      success: true,
      message: 'Refill erfolgreich verarbeitet - Lagerbestände wurden aktualisiert',
      refillId,
      processedItems
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[REFILL_PROCESS] Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const refillId = process.argv[2] || 325;
    console.log(`Testing refill processing for refill ID: ${refillId}`);
    
    const result = await testRefillProcessing(parseInt(refillId));
    console.log('Result:', result);
    
    // Verify inventory movements were created
    const movementsResult = await pool.query(
      'SELECT COUNT(*) as count FROM inventory_movements WHERE reference_id = $1 AND reference_type = $2',
      [refillId.toString(), 'REFILL']
    );
    
    console.log(`Inventory movements created: ${movementsResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await pool.end();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}
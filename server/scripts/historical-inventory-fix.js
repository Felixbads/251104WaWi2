#!/usr/bin/env node

/**
 * KRITISCHE HISTORISCHE INVENTORY-REDUKTION
 * 
 * Dieses Script repariert die fehlenden Inventory-Reduktionen
 * für 4.714 historische Verkäufe seit 29. August 2025
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function processHistoricalInventoryReductions() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starte historische Inventory-Reduktion...');
    
    // Hole alle zu verarbeitenden Transaktionen
    const transactionsQuery = `
      SELECT 
        t.id,
        t.machine_id,
        CAST(t.product_id AS INTEGER) as product_id,
        t.product_name,
        t.quantity,
        t.datetime,
        t.price,
        mwa.warehouse_id
      FROM transactions t
      JOIN machine_warehouse_assignments mwa ON t.machine_id = mwa.machine_id
      WHERE t.datetime >= '2025-08-29'
        AND t.product_id IS NOT NULL
        AND t.quantity > 0
      ORDER BY t.datetime ASC
    `;
    
    const transactionsResult = await client.query(transactionsQuery);
    const transactions = transactionsResult.rows;
    
    console.log(`📊 Gefunden: ${transactions.length} historische Verkäufe zu verarbeiten`);
    
    let processed = 0;
    let errors = 0;
    
    for (const transaction of transactions) {
      try {
        // 1. Hole aktuellen Lagerbestand
        const inventoryQuery = `
          SELECT quantity FROM inventory_items 
          WHERE warehouse_id = $1 AND product_id = $2
          LIMIT 1
        `;
        
        const inventoryResult = await client.query(inventoryQuery, [
          transaction.warehouse_id, 
          transaction.product_id
        ]);
        
        let currentStock = 0;
        if (inventoryResult.rows.length > 0) {
          currentStock = inventoryResult.rows[0].quantity;
        }

        const previousStock = currentStock;
        const soldQuantity = Math.abs(transaction.quantity);
        const newStock = Math.max(0, currentStock - soldQuantity);

        // 2. Aktualisiere Lagerbestand
        const updateQuery = `
          INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (warehouse_id, product_id)
          DO UPDATE SET 
            quantity = $3,
            updated_at = NOW()
        `;
        
        await client.query(updateQuery, [
          transaction.warehouse_id, 
          transaction.product_id, 
          newStock
        ]);

        // 3. Erstelle SALE Inventory Movement
        const movementQuery = `
          INSERT INTO inventory_movements (
            product_id,
            source_warehouse_id,
            machine_id,
            movement_type,
            quantity,
            previous_stock,
            current_stock,
            reference_type,
            reference_id,
            notes,
            performed_at,
            initiated_by,
            correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        
        await client.query(movementQuery, [
          transaction.product_id,
          transaction.warehouse_id,
          transaction.machine_id,
          'SALE',
          -soldQuantity, // Negative für Ausgang
          previousStock,
          newStock,
          'transaction',
          transaction.id,
          `HISTORISCHE KORREKTUR: ${soldQuantity}x ${transaction.product_name} (${transaction.datetime})`,
          new Date(transaction.datetime),
          'historical_fix',
          `historical_sale_${transaction.id}`
        ]);

        processed++;
        
        if (processed % 100 === 0) {
          console.log(`📦 Verarbeitet: ${processed}/${transactions.length} (${Math.round(processed/transactions.length*100)}%)`);
        }

      } catch (error) {
        console.error(`❌ Fehler bei Transaktion ${transaction.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`✅ Historische Inventory-Reduktion abgeschlossen:`);
    console.log(`   📊 Verarbeitet: ${processed} Verkäufe`);
    console.log(`   ❌ Fehler: ${errors}`);
    console.log(`   🎯 Erfolgreich: ${processed - errors}`);
    
  } catch (error) {
    console.error('💥 Kritischer Fehler:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Script ausführen (ES6 Module)
processHistoricalInventoryReductions()
  .then(() => {
    console.log('🎉 HISTORISCHE INVENTORY-REPARATUR ABGESCHLOSSEN!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script fehlgeschlagen:', error);
    process.exit(1);
  });

export { processHistoricalInventoryReductions };
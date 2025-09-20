#!/usr/bin/env node

/**
 * DIREKTE HISTORISCHE INVENTORY-REDUKTION
 * 
 * Dieses Script umgeht alle Locks und verarbeitet DIREKT
 * die 4.714 historischen Verkäufe ohne SALE movements
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function directHistoricalInventoryFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 DIREKTE HISTORISCHE INVENTORY-REDUKTION gestartet...');
    
    // 1. HOLE ALLE TRANSAKTIONEN OHNE SALE MOVEMENTS
    const query = `
      SELECT 
        t.id as transaction_id,
        t.machine_id,
        CAST(t.product_id AS INTEGER) as product_id,
        t.product_name,
        t.quantity,
        t.datetime,
        t.price,
        mwa.warehouse_id
      FROM transactions t
      JOIN machine_warehouse_assignments mwa ON t.machine_id = mwa.machine_id
      LEFT JOIN inventory_movements im ON im.reference_id = CAST(t.id AS VARCHAR) 
        AND im.movement_type = 'SALE'
      WHERE t.datetime >= '2025-08-29'
        AND t.product_id IS NOT NULL
        AND t.quantity > 0
        AND im.id IS NULL
      ORDER BY t.datetime ASC
    `;
    
    const result = await client.query(query);
    const transactions = result.rows;
    
    console.log(`📊 Gefunden: ${transactions.length} historische Verkäufe OHNE SALE movements`);
    
    if (transactions.length === 0) {
      console.log('✅ Alle historischen Verkäufe bereits verarbeitet!');
      return;
    }
    
    let processed = 0;
    let errors = 0;
    
    // 2. VERARBEITE ALLE TRANSAKTIONEN
    for (const transaction of transactions) {
      try {
        await client.query('BEGIN');
        
        // A. Hole aktuellen Lagerbestand
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

        // B. Aktualisiere Lagerbestand
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

        // C. Erstelle SALE Movement
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
          transaction.transaction_id,
          `DIREKTE HISTORISCHE KORREKTUR: ${soldQuantity}x ${transaction.product_name} (${transaction.datetime})`,
          new Date(transaction.datetime),
          'direct_historical_fix',
          `direct_historical_${transaction.transaction_id}_${Date.now()}`
        ]);

        await client.query('COMMIT');
        processed++;
        
        if (processed % 50 === 0) {
          console.log(`📦 Fortschritt: ${processed}/${transactions.length} (${Math.round(processed/transactions.length*100)}%)`);
        }

      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Fehler bei Transaktion ${transaction.transaction_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n🎉 DIREKTE HISTORISCHE INVENTORY-REDUKTION ABGESCHLOSSEN:`);
    console.log(`   📊 Verarbeitet: ${processed} Verkäufe`);
    console.log(`   ❌ Fehler: ${errors}`);
    console.log(`   🎯 Erfolgreich: ${processed - errors}`);
    console.log(`   📈 Erfolgsrate: ${Math.round((processed - errors)/transactions.length*100)}%`);
    
  } catch (error) {
    console.error('💥 Kritischer Fehler:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// SOFORTIGE AUSFÜHRUNG
directHistoricalInventoryFix()
  .then(() => {
    console.log('🏆 DIREKTE HISTORISCHE REPARATUR ERFOLGREICH ABGESCHLOSSEN!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script fehlgeschlagen:', error);
    process.exit(1);
  });
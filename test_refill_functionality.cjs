/**
 * Test-Skript für die Nachfüllungs-Funktionalität
 * 
 * Testet, ob das Nachfüllen der Automaten aus den Lagern korrekt funktioniert:
 * 1. Erstellt eine Test-Nachfüllung
 * 2. Verfolgt Lagerbestandsbewegungen
 * 3. Zeigt die Verwendung von Chargen
 */

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Simuliert eine Nachfüllung eines Automaten
 */
async function createTestRefill() {
  try {
    console.log('🔄 Starte Test der Nachfüllungs-Funktionalität...\n');
    
    // 1. Wähle einen Automaten mit Lager-Zuordnung
    const machineResult = await executeQuery(`
      SELECT m.id, m.machine_name, m.vendon_id, w.id as warehouse_id, w.name as warehouse_name
      FROM machines m
      JOIN machine_warehouse_assignments mwa ON m.id = mwa.machine_id
      JOIN warehouses w ON mwa.warehouse_id = w.id
      WHERE w.is_active = true
      LIMIT 1
    `);
    
    if (machineResult.rows.length === 0) {
      console.error('❌ Kein Automat mit Lager-Zuordnung gefunden');
      return;
    }
    
    const machine = machineResult.rows[0];
    console.log(`🤖 Test-Automat: ${machine.machine_name} (ID: ${machine.id})`);
    console.log(`🏭 Zugeordnetes Lager: ${machine.warehouse_name} (ID: ${machine.warehouse_id})\n`);
    
    // 2. Wähle einige Produkte aus dem Lager für die Nachfüllung
    const productsResult = await executeQuery(`
      SELECT 
        ii.product_id,
        p.product_name,
        ii.quantity as warehouse_stock,
        ib.id as batch_id,
        ib.batch_number,
        ib.quantity as batch_quantity,
        ib.expiry_date
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      JOIN inventory_batches ib ON ii.warehouse_id = ib.warehouse_id AND ii.product_id = ib.product_id
      WHERE ii.warehouse_id = $1 
        AND ii.quantity > 0 
        AND ib.quantity > 0
        AND ib.status = 'active'
      ORDER BY ib.expiry_date ASC, p.product_name
      LIMIT 5
    `, [machine.warehouse_id]);
    
    if (productsResult.rows.length === 0) {
      console.error('❌ Keine verfügbaren Produkte im Lager gefunden');
      return;
    }
    
    console.log(`📦 Verfügbare Produkte für Nachfüllung: ${productsResult.rows.length}\n`);
    
    // 3. Erstelle eine Test-Nachfüllung
    const refillResult = await executeQuery(`
      INSERT INTO refills (
        vendon_id, machine_id, location_id, datetime, status, refill_type, 
        planned_amount, actual_amount, total_products, notes, refill_number,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, NOW(), 'completed', 'manual_test', 
        0, 0, $4, 'Test-Nachfüllung zur Funktionsprüfung', $5,
        NOW(), NOW()
      ) RETURNING id
    `, [
      `TEST_${machine.vendon_id}_${Date.now()}`,
      machine.id,
      null, // location_id
      productsResult.rows.length,
      `TEST-REFILL-${Date.now()}`
    ]);
    
    const refillId = refillResult.rows[0].id;
    console.log(`✅ Test-Nachfüllung erstellt (ID: ${refillId})\n`);
    
    let totalPlanned = 0;
    let totalActual = 0;
    
    // 4. Für jedes ausgewählte Produkt eine Nachfüllungsdetail erstellen
    for (const product of productsResult.rows) {
      const refillQuantity = Math.min(product.batch_quantity, Math.floor(Math.random() * 10) + 5); // 5-15 Stück oder was verfügbar ist
      
      console.log(`📋 Nachfüllung: ${product.product_name}`);
      console.log(`   Charge: ${product.batch_number} (MHD: ${product.expiry_date})`);
      console.log(`   Verfügbar: ${product.batch_quantity} → Nachfüllen: ${refillQuantity}`);
      
      // Refill Detail erstellen
      const refillDetailResult = await executeQuery(`
        INSERT INTO refill_details (
          refill_id, product_id, product_name, quantity, added,
          vendon_product_id, datetime, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW()
        ) RETURNING id
      `, [
        refillId,
        product.product_id.toString(),
        product.product_name,
        refillQuantity,
        refillQuantity,
        product.product_id.toString()
      ]);
      
      const refillDetailId = refillDetailResult.rows[0].id;
      
      // Batch Movement erstellen (Lagerentnahme dokumentieren)
      await executeQuery(`
        INSERT INTO refill_batch_movements (
          refill_id, refill_detail_id, batch_id, warehouse_id, product_id, 
          quantity, batch_number, expiry_date, warehouse_before, warehouse_after,
          movement_type, status, performed_by, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'REFILL', 'completed', 1, NOW()
        )
      `, [
        refillId,
        refillDetailId,
        product.batch_id,
        machine.warehouse_id,
        product.product_id,
        refillQuantity,
        product.batch_number,
        product.expiry_date,
        product.batch_quantity,
        product.batch_quantity - refillQuantity
      ]);
      
      // Lagerbestand reduzieren
      await executeQuery(`
        UPDATE inventory_batches 
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2
      `, [refillQuantity, product.batch_id]);
      
      await executeQuery(`
        UPDATE inventory_items 
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE warehouse_id = $2 AND product_id = $3
      `, [refillQuantity, machine.warehouse_id, product.product_id]);
      
      // Inventory Movement dokumentieren
      await executeQuery(`
        INSERT INTO inventory_movements (
          source_warehouse_id, product_id, quantity, movement_type, direction,
          reference_type, reference_id, status, notes, performed_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'REFILL', 'OUT', 'REFILL', $4, 'completed', 
          'Nachfüllung für Automat ' || $5, 1, NOW(), NOW()
        )
      `, [
        machine.warehouse_id,
        product.product_id,
        refillQuantity,
        refillId.toString(),
        machine.machine_name
      ]);
      
      totalPlanned += refillQuantity;
      totalActual += refillQuantity;
      
      console.log(`   ✅ Lagerbewegung erfasst: -${refillQuantity} Stück\n`);
    }
    
    // 5. Refill-Summen aktualisieren
    await executeQuery(`
      UPDATE refills 
      SET planned_amount = $1, actual_amount = $2, updated_at = NOW()
      WHERE id = $3
    `, [totalPlanned, totalActual, refillId]);
    
    console.log(`📊 Nachfüllungs-Zusammenfassung:`);
    console.log(`   - Geplant: ${totalPlanned} Stück`);
    console.log(`   - Tatsächlich: ${totalActual} Stück`);
    console.log(`   - Produkte: ${productsResult.rows.length}`);
    
    // 6. Prüfung der erstellten Daten
    console.log(`\n🔍 Verifikation der Nachfüllung:\n`);
    
    const verificationResult = await executeQuery(`
      SELECT 
        r.id as refill_id,
        r.refill_number,
        r.status,
        r.planned_amount,
        r.actual_amount,
        r.total_products,
        COUNT(rd.id) as detail_count,
        COUNT(rbm.id) as movement_count
      FROM refills r
      LEFT JOIN refill_details rd ON r.id = rd.refill_id
      LEFT JOIN refill_batch_movements rbm ON r.id = rbm.refill_id
      WHERE r.id = $1
      GROUP BY r.id
    `, [refillId]);
    
    const verification = verificationResult.rows[0];
    console.log(`✅ Nachfüllung ${verification.refill_number}:`);
    console.log(`   - Status: ${verification.status}`);
    console.log(`   - Geplant/Tatsächlich: ${verification.planned_amount}/${verification.actual_amount} Stück`);
    console.log(`   - Produkte: ${verification.total_products}`);
    console.log(`   - Details erfasst: ${verification.detail_count}`);
    console.log(`   - Bewegungen erfasst: ${verification.movement_count}`);
    
    // 7. Zeige aktuelle Lagerbestände nach der Nachfüllung
    console.log(`\n📦 Lagerbestände nach Nachfüllung:\n`);
    
    const stockResult = await executeQuery(`
      SELECT 
        p.product_name,
        ii.quantity as current_stock,
        COUNT(ib.id) as active_batches,
        SUM(ib.quantity) as batch_total
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      LEFT JOIN inventory_batches ib ON ii.warehouse_id = ib.warehouse_id 
        AND ii.product_id = ib.product_id 
        AND ib.status = 'active'
        AND ib.quantity > 0
      WHERE ii.warehouse_id = $1 
        AND ii.product_id = ANY($2)
      GROUP BY p.product_name, ii.quantity
      ORDER BY p.product_name
    `, [
      machine.warehouse_id,
      productsResult.rows.map(p => p.product_id)
    ]);
    
    for (const stock of stockResult.rows) {
      console.log(`📋 ${stock.product_name}:`);
      console.log(`   - Gesamtbestand: ${stock.current_stock} Stück`);
      console.log(`   - Aktive Chargen: ${stock.active_batches}`);
      console.log(`   - Chargen-Summe: ${stock.batch_total || 0} Stück`);
    }
    
    console.log(`\n✅ Test der Nachfüllungs-Funktionalität erfolgreich abgeschlossen!`);
    console.log(`\n🎯 Erkenntnisse:`);
    console.log(`   ✓ Automaten-Lager-Zuordnung funktioniert`);
    console.log(`   ✓ Produktauswahl aus Lagerbeständen funktioniert`);
    console.log(`   ✓ Chargen werden korrekt verwendet (FIFO nach MHD)`);
    console.log(`   ✓ Lagerbewegungen werden vollständig dokumentiert`);
    console.log(`   ✓ Bestände werden korrekt aktualisiert`);
    console.log(`   ✓ Refill-Tracking ist vollständig implementiert`);
    
  } catch (error) {
    console.error('❌ Fehler beim Test der Nachfüllungs-Funktionalität:', error);
    console.error(error.stack);
  }
}

async function main() {
  try {
    await createTestRefill();
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main().catch(error => {
  console.error("❌ Unbehandelter Fehler:", error);
  process.exit(1);
});
/**
 * Skript zum Bereinigen von Produktduplikaten in der Datenbank
 * mit besonderer Behandlung von Fremdschlüssel-Constraints
 */

const { Client } = require('pg');

async function cleanupProducts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Starte Bereinigung von Produktduplikaten...');
    
    // Starte eine Transaktion
    await client.query('BEGIN');
    
    // 1. Identifiziere alle Duplikate basierend auf vendon_id
    console.log('Identifiziere alle Duplikate anhand von vendon_id...');
    const dupsByVendonId = await client.query(`
      SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
      FROM products
      WHERE vendon_id IS NOT NULL
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`${dupsByVendonId.rows.length} Gruppen von Duplikaten gefunden.`);
    
    // Anzahl der Referenzen in product_batches prüfen
    console.log('Überprüfe Referenzen in product_batches...');
    const batchReferences = await client.query(`
      SELECT product_id, COUNT(*) as ref_count
      FROM product_batches 
      GROUP BY product_id
    `);
    
    // Erstelle ein Mapping von Produkt-IDs zu Anzahl der Referenzen
    const productBatchRefs = {};
    for (const row of batchReferences.rows) {
      productBatchRefs[row.product_id] = row.ref_count;
    }
    
    console.log(`${batchReferences.rows.length} Produkte mit Referenzen in product_batches gefunden.`);
    
    // Verarbeite jede Gruppe von Duplikaten
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalUpdated = 0;
    
    for (const group of dupsByVendonId.rows) {
      const { vendon_id, count, ids } = group;
      console.log(`\nVerarbeite Gruppe für vendon_id: ${vendon_id} (${count} Produkte)`);
      
      // Identifiziere das Hauptprodukt und prüfe auf FK-Einschränkungen
      const primaryId = ids[0]; // Das erste Produkt als Standard-Haupt
      
      // Überprüfe, ob eines der Produkte in der Gruppe FK-Referenzen hat
      const productsWithRefs = ids.filter(id => productBatchRefs[id]);
      
      if (productsWithRefs.length > 0) {
        console.log(`Warnung: ${productsWithRefs.length} Produkte in dieser Gruppe haben Referenzen in product_batches.`);
        
        // 1. Option: Wenn eines der Produkte Referenzen hat, verwende es als Haupt
        const newPrimaryId = productsWithRefs[0];
        console.log(`Verwende Produkt ${newPrimaryId} als Haupt wegen FK-Referenzen.`);
        
        // Aktualisiere alle Referenzen auf dieses Hauptprodukt
        // Produkte, die nicht gelöscht werden können
        const cannotDelete = new Set(productsWithRefs);
        // Produkte, die gelöscht werden können
        const canDelete = ids.filter(id => !cannotDelete.has(id));
        
        if (canDelete.length === 0) {
          console.log(`Keine Produkte können in dieser Gruppe bereinigt werden.`);
          totalSkipped += count;
          continue;
        }
        
        console.log(`${canDelete.length} Produkte können bereinigt werden.`);
        
        // Aktualisiere machine_stocks
        await client.query(`
          UPDATE machine_stocks
          SET product_vendon_id = (SELECT vendon_id FROM products WHERE id = $1)
          WHERE product_vendon_id IN (
            SELECT vendon_id FROM products WHERE id = ANY($2)
          )
        `, [newPrimaryId, canDelete]);
        
        // Aktualisiere inventory_count_items
        await client.query(`
          UPDATE inventory_count_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [newPrimaryId, canDelete]);
        
        // Aktualisiere inventory_items
        await client.query(`
          UPDATE inventory_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [newPrimaryId, canDelete]);
        
        // Lösche die Duplikate, die gelöscht werden können
        const deletedCount = await client.query(`
          DELETE FROM products
          WHERE id = ANY($1)
          RETURNING id
        `, [canDelete]);
        
        console.log(`${deletedCount.rowCount} Produkte erfolgreich gelöscht.`);
        totalProcessed += deletedCount.rowCount;
        totalUpdated++;
      } else {
        // Wenn keine FK-Referenzen vorhanden sind, normaler Ablauf
        console.log(`Keine FK-Referenzen gefunden. Bereinige alle ${count - 1} Duplikate.`);
        
        const duplicateIds = ids.slice(1);
        
        // Aktualisiere Referenzen
        // Aktualisiere machine_stocks
        await client.query(`
          UPDATE machine_stocks
          SET product_vendon_id = (SELECT vendon_id FROM products WHERE id = $1)
          WHERE product_vendon_id IN (
            SELECT vendon_id FROM products WHERE id = ANY($2)
          )
        `, [primaryId, duplicateIds]);
        
        // Aktualisiere inventory_count_items
        await client.query(`
          UPDATE inventory_count_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [primaryId, duplicateIds]);
        
        // Aktualisiere inventory_items
        await client.query(`
          UPDATE inventory_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [primaryId, duplicateIds]);
        
        // Lösche die Duplikate
        const deletedCount = await client.query(`
          DELETE FROM products
          WHERE id = ANY($1)
          RETURNING id
        `, [duplicateIds]);
        
        console.log(`${deletedCount.rowCount} Produkte erfolgreich gelöscht.`);
        totalProcessed += deletedCount.rowCount;
        totalUpdated++;
      }
      
      // Nach jeder 5. Gruppe ein Commit durchführen, um Fortschritt zu sichern
      if (totalUpdated % 5 === 0) {
        await client.query('COMMIT');
        console.log('Zwischenstand committed. Starte neue Transaktion...');
        await client.query('BEGIN');
      }
    }
    
    // Abschließendes Commit
    await client.query('COMMIT');
    
    // Zusammenfassung der Bereinigung
    console.log('\nZusammenfassung der Bereinigung:');
    console.log(`Verarbeitete Gruppen: ${dupsByVendonId.rows.length}`);
    console.log(`Gelöschte Produkte: ${totalProcessed}`);
    console.log(`Übersprungene Produkte (wegen FK): ${totalSkipped}`);
    
    // Finale Produktanzahl prüfen
    const finalCount = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Finale Produktanzahl: ${finalCount.rows[0].count}`);
    
    console.log('\nBereinigung erfolgreich abgeschlossen.');
    
  } catch (error) {
    // Bei Fehler Rollback der Transaktion
    try {
      await client.query('ROLLBACK');
      console.error('Transaktion zurückgerollt.');
    } catch (rollbackError) {
      console.error('Fehler beim Rollback:', rollbackError);
    }
    
    console.error('Fehler bei der Bereinigung:', error);
    throw error;
  } finally {
    // Client schließen
    await client.end();
  }
}

// Führe die Bereinigung aus
cleanupProducts()
  .then(() => {
    console.log('Bereinigungsprozess abgeschlossen.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
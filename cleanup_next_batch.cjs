/**
 * Skript zum Bereinigen einer weiteren Batch von Produktduplikaten
 * Dieses Skript kann mehrfach ausgeführt werden, um schrittweise Duplikate zu entfernen
 */

const { Client } = require('pg');

// Konfiguration
const BATCH_SIZE = 10; // Anzahl der Gruppen pro Durchlauf

async function cleanupNextBatch() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Starte Bereinigung der nächsten Batch von Produktduplikaten...');
    
    // Anzahl der bereits bearbeiteten Gruppen ermitteln anhand der "bereinigten" vendon_ids
    // Ein vendon_id gilt als "bereinigt", wenn es nur eine Instanz davon in der Datenbank gibt
    const processedQuery = await client.query(`
      WITH duplicates AS (
        SELECT vendon_id 
        FROM products 
        GROUP BY vendon_id 
        HAVING COUNT(*) > 1
      )
      SELECT COUNT(*) AS remaining_count 
      FROM duplicates
    `);
    
    const remainingGroups = parseInt(processedQuery.rows[0].remaining_count);
    console.log(`Noch ${remainingGroups} Gruppen von Duplikaten zu bereinigen.`);
    
    if (remainingGroups === 0) {
      console.log('Alle Duplikate wurden bereits bereinigt!');
      return { processed: 0, remaining: 0 };
    }
    
    // Starte eine Transaktion
    await client.query('BEGIN');
    
    // Identifiziere die nächsten zu bearbeitenden Gruppen
    console.log(`Hole die nächsten ${BATCH_SIZE} Gruppen...`);
    const dupsByVendonId = await client.query(`
      SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
      FROM products
      WHERE vendon_id IS NOT NULL
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT $1
    `, [BATCH_SIZE]);
    
    console.log(`${dupsByVendonId.rows.length} Gruppen für Bearbeitung geladen.`);
    
    // Überprüfe Referenzen in product_batches
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
    
    // Verarbeite jede Gruppe
    let totalProcessed = 0;
    
    for (const group of dupsByVendonId.rows) {
      const { vendon_id, count, ids } = group;
      console.log(`\nVerarbeite Gruppe für vendon_id: ${vendon_id} (${count} Produkte)`);
      
      // Überprüfe, ob eines der Produkte in der Gruppe FK-Referenzen hat
      const productsWithRefs = ids.filter(id => productBatchRefs[id]);
      
      let primaryId;
      let canDelete;
      
      if (productsWithRefs.length > 0) {
        console.log(`Warnung: ${productsWithRefs.length} Produkte in dieser Gruppe haben Referenzen in product_batches.`);
        
        // Verwende ein Produkt mit Referenzen als Haupt
        primaryId = productsWithRefs[0];
        console.log(`Verwende Produkt ${primaryId} als Haupt wegen FK-Referenzen.`);
        
        // Produkte, die nicht gelöscht werden können
        const cannotDelete = new Set(productsWithRefs);
        // Produkte, die gelöscht werden können
        canDelete = ids.filter(id => !cannotDelete.has(id));
        
        if (canDelete.length === 0) {
          console.log(`Keine Produkte können in dieser Gruppe bereinigt werden. Überspringe.`);
          continue;
        }
      } else {
        // Wenn keine FK-Referenzen vorhanden sind, normaler Ablauf
        console.log(`Keine FK-Referenzen gefunden. Bereinige alle ${count - 1} Duplikate.`);
        primaryId = ids[0];
        canDelete = ids.slice(1);
      }
      
      console.log(`${canDelete.length} Produkte können bereinigt werden.`);
      
      // Aktualisiere machine_stocks
      await client.query(`
        UPDATE machine_stocks
        SET product_vendon_id = (SELECT vendon_id FROM products WHERE id = $1)
        WHERE product_vendon_id IN (
          SELECT vendon_id FROM products WHERE id = ANY($2)
        )
      `, [primaryId, canDelete]);
      
      // Aktualisiere inventory_count_items
      try {
        await client.query(`
          UPDATE inventory_count_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [primaryId, canDelete]);
      } catch (error) {
        console.log(`Warnung: Fehler beim Aktualisieren von inventory_count_items: ${error.message}`);
      }
      
      // Aktualisiere inventory_items
      try {
        await client.query(`
          UPDATE inventory_items
          SET product_id = $1
          WHERE product_id = ANY($2)
        `, [primaryId, canDelete]);
      } catch (error) {
        console.log(`Warnung: Fehler beim Aktualisieren von inventory_items: ${error.message}`);
      }
      
      // Lösche die Duplikate
      try {
        const deletedCount = await client.query(`
          DELETE FROM products
          WHERE id = ANY($1)
          RETURNING id
        `, [canDelete]);
        
        console.log(`${deletedCount.rowCount} Produkte erfolgreich gelöscht.`);
        totalProcessed += deletedCount.rowCount;
      } catch (error) {
        console.log(`Fehler beim Löschen von Produkten: ${error.message}`);
        console.log('Versuche, Referenzen im Einzelnen zu aktualisieren und zu löschen...');
        
        // Individuelle Verarbeitung bei Fehler
        let individuallyProcessed = 0;
        
        for (const id of canDelete) {
          try {
            await client.query('BEGIN NESTED');
            
            // Versuche, ein einzelnes Produkt zu löschen
            await client.query(`DELETE FROM products WHERE id = $1`, [id]);
            
            await client.query('COMMIT NESTED');
            individuallyProcessed++;
          } catch (err) {
            await client.query('ROLLBACK NESTED');
            console.log(`Konnte Produkt ID ${id} nicht löschen: ${err.message}`);
          }
        }
        
        console.log(`${individuallyProcessed} Produkte wurden im Einzelverfahren gelöscht.`);
        totalProcessed += individuallyProcessed;
      }
    }
    
    // Commit der Änderungen
    await client.query('COMMIT');
    
    // Prüfe verbleibende Duplikate
    const remainingQuery = await client.query(`
      WITH duplicates AS (
        SELECT vendon_id 
        FROM products 
        GROUP BY vendon_id 
        HAVING COUNT(*) > 1
      )
      SELECT COUNT(*) AS remaining_count 
      FROM duplicates
    `);
    
    const stillRemaining = parseInt(remainingQuery.rows[0].remaining_count);
    
    console.log('\nZusammenfassung:');
    console.log(`${totalProcessed} Produkte wurden in diesem Durchlauf bereinigt.`);
    console.log(`Noch ${stillRemaining} Gruppen von Duplikaten übrig.`);
    
    return { processed: totalProcessed, remaining: stillRemaining };
  } catch (error) {
    // Bei Fehler Rollback der Transaktion
    try {
      await client.query('ROLLBACK');
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
cleanupNextBatch()
  .then(result => {
    console.log(`\nBereinigungsprozess abgeschlossen. ${result.processed} Produkte bereinigt.`);
    console.log(`Noch ${result.remaining} Duplikatgruppen übrig.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
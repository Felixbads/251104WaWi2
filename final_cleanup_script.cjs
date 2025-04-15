/**
 * Finales Skript zur Bereinigung von Produktduplikaten
 * Mit Behandlung aller bekannten Fremdschlüsselbeziehungen
 */

const { Client } = require('pg');

// Konfiguration
const BATCH_SIZE = 5; // Kleinere Batch-Größe für schnellere Ausführung

async function cleanupDuplicateProducts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Starte finale Bereinigung von Produktduplikaten...');
    
    // Identifiziere die verbliebenen Duplikate
    const remainingQuery = await client.query(`
      WITH duplicates AS (
        SELECT vendon_id, COUNT(*) as count 
        FROM products 
        WHERE vendon_id IS NOT NULL
        GROUP BY vendon_id 
        HAVING COUNT(*) > 1
      )
      SELECT COUNT(*) AS remaining_count,
             SUM(count) AS total_products
      FROM duplicates
    `);
    
    const remainingGroups = parseInt(remainingQuery.rows[0].remaining_count);
    const totalProducts = parseInt(remainingQuery.rows[0].total_products);
    console.log(`Noch ${remainingGroups} Gruppen mit insgesamt ${totalProducts} Produkten zu bereinigen.`);
    
    if (remainingGroups === 0) {
      console.log('Keine Duplikate mehr vorhanden!');
      return { processed: 0, remaining: 0 };
    }
    
    // Identifiziere alle Fremdschlüsselbeziehungen zu Produkten
    console.log('Identifiziere alle Fremdschlüsselbeziehungen zu Produkten...');
    
    // Finde alle Tabellen mit Fremdschlüsseln auf die Produkt-Tabelle
    const fkTablesQuery = await client.query(`
      SELECT 
        tc.table_name AS table_name,
        kcu.column_name AS column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'products'
        AND ccu.column_name = 'id'
        AND tc.table_schema = 'public'
    `);
    
    console.log(`${fkTablesQuery.rows.length} Tabellen mit Fremdschlüsseln auf products gefunden.`);
    
    // Sammle alle Produkt-IDs mit Referenzen
    const referencedProductIds = new Set();
    
    for (const fkTable of fkTablesQuery.rows) {
      const { table_name, column_name } = fkTable;
      console.log(`Prüfe Referenzen in ${table_name}.${column_name}...`);
      
      const refsQuery = await client.query(`
        SELECT DISTINCT ${column_name} AS product_id
        FROM ${table_name}
        WHERE ${column_name} IS NOT NULL
      `);
      
      let tableRefs = 0;
      for (const row of refsQuery.rows) {
        referencedProductIds.add(row.product_id);
        tableRefs++;
      }
      
      console.log(`${tableRefs} Produkte werden in ${table_name} referenziert.`);
    }
    
    console.log(`Insgesamt ${referencedProductIds.size} verschiedene Produkte haben Fremdschlüsselreferenzen.`);
    
    // Hole die nächsten zu bearbeitenden Gruppen
    const dupsByVendonId = await client.query(`
      SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
      FROM products
      WHERE vendon_id IS NOT NULL
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT $1
    `, [BATCH_SIZE]);
    
    console.log(`Bearbeite ${dupsByVendonId.rows.length} Gruppen von Duplikaten...`);
    
    let totalProcessed = 0;
    let totalGroups = 0;
    
    // Beginne eine Transaktion
    await client.query('BEGIN');
    
    for (const group of dupsByVendonId.rows) {
      const { vendon_id, count, ids } = group;
      totalGroups++;
      
      console.log(`\nVerarbeite Gruppe ${totalGroups}/${dupsByVendonId.rows.length} für vendon_id: ${vendon_id} (${count} Produkte)`);
      
      // Finde referenzierte Produkte in dieser Gruppe
      const referencedIds = ids.filter(id => referencedProductIds.has(id));
      
      let primaryId;
      let canDelete;
      
      if (referencedIds.length > 0) {
        console.log(`${referencedIds.length} Produkte in dieser Gruppe haben Fremdschlüsselreferenzen.`);
        
        // Verwende ein Produkt mit Referenzen als Hauptprodukt
        primaryId = referencedIds[0];
        console.log(`Verwende Produkt ${primaryId} als Hauptprodukt.`);
        
        // Produkte, die nicht gelöscht werden können
        const cannotDelete = new Set(referencedIds);
        
        // Produkte, die gelöscht werden können
        canDelete = ids.filter(id => !cannotDelete.has(id));
        
        if (canDelete.length === 0) {
          console.log(`Keine Produkte können in dieser Gruppe bereinigt werden. Überspringe.`);
          continue;
        }
      } else {
        console.log(`Keine Fremdschlüsselreferenzen gefunden. Bereinige alle ${count - 1} Duplikate.`);
        primaryId = ids[0];
        canDelete = ids.slice(1);
      }
      
      console.log(`${canDelete.length} Produkte können bereinigt werden.`);
      
      try {
        // Aktualisiere machine_stocks
        await client.query(`
          UPDATE machine_stocks
          SET product_vendon_id = (SELECT vendon_id FROM products WHERE id = $1)
          WHERE product_vendon_id IN (
            SELECT vendon_id FROM products WHERE id = ANY($2)
          )
        `, [primaryId, canDelete]);
        
        // Lösche die Duplikate
        const deletedResult = await client.query(`
          DELETE FROM products
          WHERE id = ANY($1)
          RETURNING id
        `, [canDelete]);
        
        console.log(`${deletedResult.rowCount} Produkte erfolgreich gelöscht.`);
        totalProcessed += deletedResult.rowCount;
      } catch (error) {
        console.log(`Fehler: ${error.message}`);
        console.log('Versuche individuelle Verarbeitung...');
        
        // Bei Fehlern versuche jeden Datensatz individuell zu löschen
        let individualSuccess = 0;
        
        for (const id of canDelete) {
          try {
            // Aktualisiere machine_stocks für dieses eine Produkt
            await client.query(`
              UPDATE machine_stocks
              SET product_vendon_id = (SELECT vendon_id FROM products WHERE id = $1)
              WHERE product_vendon_id = (SELECT vendon_id FROM products WHERE id = $2)
            `, [primaryId, id]);
            
            // Versuche das Produkt zu löschen
            await client.query(`DELETE FROM products WHERE id = $1`, [id]);
            individualSuccess++;
            
            // Commit nach jedem erfolgreichen Löschen
            if (individualSuccess % 10 === 0) {
              console.log(`${individualSuccess} von ${canDelete.length} Produkten verarbeitet...`);
            }
          } catch (err) {
            // Bei Fehler nur eine Warnung ausgeben
            console.log(`Konnte Produkt ID ${id} nicht löschen: ${err.message}`);
          }
        }
        
        console.log(`${individualSuccess} Produkte im Einzelverfahren gelöscht.`);
        totalProcessed += individualSuccess;
      }
    }
    
    // Commit der Änderungen
    await client.query('COMMIT');
    
    // Abschließende Überprüfung
    const finalCheckQuery = await client.query(`
      WITH duplicates AS (
        SELECT vendon_id, COUNT(*) as count 
        FROM products 
        WHERE vendon_id IS NOT NULL
        GROUP BY vendon_id 
        HAVING COUNT(*) > 1
      )
      SELECT COUNT(*) AS remaining_count 
      FROM duplicates
    `);
    
    const remainingAfter = parseInt(finalCheckQuery.rows[0].remaining_count);
    
    console.log('\nZusammenfassung:');
    console.log(`${totalProcessed} Produkte wurden in diesem Durchlauf bereinigt.`);
    console.log(`Noch ${remainingAfter} Gruppen von Duplikaten übrig.`);
    
    // Produktanzahl überprüfen
    const countQuery = await client.query(`SELECT COUNT(*) FROM products`);
    console.log(`Aktuelle Gesamtanzahl von Produkten: ${countQuery.rows[0].count}`);
    
    return { processed: totalProcessed, remaining: remainingAfter };
    
  } catch (error) {
    // Bei allgemeinem Fehler
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
cleanupDuplicateProducts()
  .then(result => {
    console.log(`\nBereinigungsprozess abgeschlossen. ${result.processed} Produkte bereinigt.`);
    console.log(`Noch ${result.remaining} Duplikatgruppen übrig.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
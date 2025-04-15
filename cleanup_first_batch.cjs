/**
 * Dieses Skript bereinigt nur den ersten Batch (10 Gruppen) der Produktduplikate
 * nach vendon_id, um die Verarbeitung in kleinere Schritte aufzuteilen.
 */

const { Client } = require('pg');

async function cleanupFirstBatch() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Starte Bereinigung des ersten Batches von Produktduplikaten...');
    
    // Starte eine Transaktion
    await client.query('BEGIN');
    
    // Identifiziere Duplikate nach vendon_id
    console.log('Identifiziere die ersten 10 Gruppen von Duplikaten nach vendon_id...');
    const dupsByVendonId = await client.query(`
      SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
      FROM products
      WHERE vendon_id IS NOT NULL
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log(`${dupsByVendonId.rows.length} Gruppen von Duplikaten gefunden.`);
    
    let totalCleanedVendonId = 0;
    
    for (const group of dupsByVendonId.rows) {
      const { vendon_id, count, ids } = group;
      console.log(`Bereinige ${count - 1} Duplikate für vendon_id: ${vendon_id}`);
      
      // Wähle ein Hauptprodukt (das erste in der Liste)
      const primaryId = ids[0];
      const duplicateIds = ids.slice(1);
      
      // Hole vendon_id des Hauptprodukts
      const primaryProduct = await client.query(`
        SELECT vendon_id FROM products WHERE id = $1
      `, [primaryId]);
      
      const primaryVendonId = primaryProduct.rows[0].vendon_id;
      
      // Aktualisiere machine_stocks
      console.log(`Aktualisiere machine_stocks für vendon_id: ${vendon_id}`);
      await client.query(`
        UPDATE machine_stocks
        SET product_vendon_id = $1
        WHERE product_vendon_id IN (
          SELECT vendon_id FROM products WHERE id = ANY($2)
        )
      `, [primaryVendonId, duplicateIds]);
      
      // Aktualisiere inventory_count_items
      console.log(`Aktualisiere inventory_count_items für vendon_id: ${vendon_id}`);
      await client.query(`
        UPDATE inventory_count_items
        SET product_id = $1
        WHERE product_id = ANY($2)
      `, [primaryId, duplicateIds]);
      
      // Aktualisiere inventory_items
      console.log(`Aktualisiere inventory_items für vendon_id: ${vendon_id}`);
      await client.query(`
        UPDATE inventory_items
        SET product_id = $1
        WHERE product_id = ANY($2)
      `, [primaryId, duplicateIds]);
      
      // Lösche die Duplikate
      console.log(`Lösche ${duplicateIds.length} Duplikate für vendon_id: ${vendon_id}`);
      await client.query(`
        DELETE FROM products
        WHERE id = ANY($1)
      `, [duplicateIds]);
      
      totalCleanedVendonId += duplicateIds.length;
    }
    
    // Commit der Transaktion
    await client.query('COMMIT');
    
    console.log(`Bereinigung abgeschlossen: ${totalCleanedVendonId} Produkte mit duplizierter vendon_id bereinigt.`);
    
  } catch (error) {
    // Bei Fehler Rollback der Transaktion
    await client.query('ROLLBACK');
    console.error('Fehler bei der Bereinigung:', error);
    throw error;
  } finally {
    // Client schließen
    client.end();
  }
}

// Führe die Bereinigung aus
cleanupFirstBatch()
  .then(() => {
    console.log('Bereinigungsprozess abgeschlossen.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
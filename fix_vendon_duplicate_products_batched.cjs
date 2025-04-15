/**
 * Skript zum Bereinigen von Produktduplikaten in der Datenbank
 * Dieses Skript ist eine einmalige Korrekturmaßnahme für bestehende Duplikate.
 * 
 * WICHTIG: Diese Version des Skripts verarbeitet die Daten in Batches,
 * um Timeouts zu vermeiden und einzelne Schritte gezielt ausführen zu können.
 */

// PostgreSQL-Client direkt einbinden
const { Client } = require('pg');

/**
 * Hauptfunktion zur Bereinigung von Duplikaten
 * Verarbeitet die Daten in kleineren Batches
 */
async function cleanupDuplicateProducts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Starte Bereinigung von Produktduplikaten...');
    
    // Wähle die Schritte, die ausgeführt werden sollen (zur einfacheren Steuerung)
    const steps = {
      cleanVendonId: true,     // Duplikate nach vendon_id bereinigen
      cleanProductName: true,  // Duplikate nach Produktnamen bereinigen
      cleanMachineStocks: true // Duplizierte Lagerbestände bereinigen
    };

    // Konfiguriere die Batchgrößen
    const BATCH_SIZE = 10;  // Anzahl der Gruppen pro Batch
    
    // 1. Duplikate nach vendon_id bereinigen
    let totalCleanedVendonId = 0;
    
    if (steps.cleanVendonId) {
      console.log('Identifiziere Duplikate anhand von vendon_id...');
      
      const dupsByVendonId = await client.query(`
        SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
        FROM products
        WHERE vendon_id IS NOT NULL
        GROUP BY vendon_id
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `);
      
      console.log(`${dupsByVendonId.rows.length} Gruppen von Duplikaten nach vendon_id gefunden.`);
      
      // Verarbeite Batches
      for (let i = 0; i < dupsByVendonId.rows.length; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, dupsByVendonId.rows.length);
        console.log(`Verarbeite vendon_id Batch ${i} bis ${batchEnd - 1} von ${dupsByVendonId.rows.length}`);
        
        // Starte Transaktion für diesen Batch
        await client.query('BEGIN');
        
        // Verarbeite jede Gruppe in diesem Batch
        for (let j = i; j < batchEnd; j++) {
          const group = dupsByVendonId.rows[j];
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
          await client.query(`
            UPDATE machine_stocks
            SET product_vendon_id = $1
            WHERE product_vendon_id IN (
              SELECT vendon_id FROM products WHERE id = ANY($2)
            )
          `, [primaryVendonId, duplicateIds]);
          
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
          await client.query(`
            DELETE FROM products
            WHERE id = ANY($1)
          `, [duplicateIds]);
          
          totalCleanedVendonId += duplicateIds.length;
        }
        
        // Commit die Änderungen für diesen Batch
        await client.query('COMMIT');
        console.log(`Batch ${i} bis ${batchEnd - 1} abgeschlossen und committed.`);
      }
      
      console.log(`Bereinigt: ${totalCleanedVendonId} Produkte mit duplizierter vendon_id`);
    }
    
    // 2. Duplikate nach Produktnamen bereinigen
    let totalCleanedByName = 0;
    
    if (steps.cleanProductName) {
      console.log('Identifiziere Duplikate anhand von Produktnamen...');
      
      const dupsByName = await client.query(`
        SELECT LOWER(TRIM(product_name)) as normalized_name, COUNT(*) as count, array_agg(id) as ids
        FROM products
        GROUP BY LOWER(TRIM(product_name))
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `);
      
      console.log(`${dupsByName.rows.length} Gruppen von Duplikaten nach Produktnamen gefunden.`);
      
      // Verarbeite Batches
      for (let i = 0; i < dupsByName.rows.length; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, dupsByName.rows.length);
        console.log(`Verarbeite Produktnamen Batch ${i} bis ${batchEnd - 1} von ${dupsByName.rows.length}`);
        
        // Starte Transaktion für diesen Batch
        await client.query('BEGIN');
        
        // Verarbeite jede Gruppe in diesem Batch
        for (let j = i; j < batchEnd; j++) {
          const group = dupsByName.rows[j];
          const { normalized_name, count, ids } = group;
          console.log(`Bereinige ${count - 1} Duplikate für Produktname: ${normalized_name}`);
          
          // Finde das beste Hauptprodukt (bevorzuge Produkte mit vendon_id)
          const productsInfo = await client.query(`
            SELECT id, vendon_id
            FROM products
            WHERE id = ANY($1)
            ORDER BY vendon_id IS NOT NULL DESC, id ASC
          `, [ids]);
          
          if (productsInfo.rows.length === 0) {
            console.log(`Überspringe leere Gruppe für ${normalized_name}`);
            continue;
          }
          
          const primaryId = productsInfo.rows[0].id;
          const duplicateIds = ids.filter(id => id !== primaryId);
          
          if (duplicateIds.length === 0) {
            console.log(`Keine Duplikate zum Bereinigen für ${normalized_name}`);
            continue;
          }
          
          // Aktualisiere machine_stocks (wenn die Spalte product_id existiert)
          try {
            await client.query(`
              UPDATE machine_stocks
              SET product_id = $1
              WHERE product_id = ANY($2)
            `, [primaryId, duplicateIds]);
          } catch (err) {
            console.log(`Spalte product_id in machine_stocks existiert nicht oder ein anderer Fehler trat auf: ${err.message}`);
          }
          
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
          await client.query(`
            DELETE FROM products
            WHERE id = ANY($1)
          `, [duplicateIds]);
          
          totalCleanedByName += duplicateIds.length;
        }
        
        // Commit die Änderungen für diesen Batch
        await client.query('COMMIT');
        console.log(`Batch ${i} bis ${batchEnd - 1} abgeschlossen und committed.`);
      }
      
      console.log(`Bereinigt: ${totalCleanedByName} Produkte mit duplizierten Produktnamen`);
    }
    
    // 3. Duplizierte Lagerbestände bereinigen
    let totalCleanedStocks = 0;
    
    if (steps.cleanMachineStocks) {
      console.log('Bereinige duplizierte Lagerbestände...');
      
      const dupMachineStocks = await client.query(`
        SELECT machine_id, product_vendon_id, COUNT(*) as count, array_agg(id) as ids
        FROM machine_stocks
        WHERE product_vendon_id IS NOT NULL
        GROUP BY machine_id, product_vendon_id
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `);
      
      console.log(`${dupMachineStocks.rows.length} Gruppen von duplizierten Lagerbeständen gefunden.`);
      
      // Verarbeite Batches
      for (let i = 0; i < dupMachineStocks.rows.length; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, dupMachineStocks.rows.length);
        console.log(`Verarbeite Lagerbestände Batch ${i} bis ${batchEnd - 1} von ${dupMachineStocks.rows.length}`);
        
        // Starte Transaktion für diesen Batch
        await client.query('BEGIN');
        
        // Verarbeite jede Gruppe in diesem Batch
        for (let j = i; j < batchEnd; j++) {
          const group = dupMachineStocks.rows[j];
          const { machine_id, product_vendon_id, count, ids } = group;
          console.log(`Bereinige ${count - 1} duplizierte Lagerbestände für Maschine ${machine_id}, Produkt ${product_vendon_id}`);
          
          if (!product_vendon_id) {
            console.log(`Überspringe Gruppe ohne product_vendon_id`);
            continue;
          }
          
          // Wähle ein Haupt-Stock (das erste in der Liste)
          const primaryId = ids[0];
          const duplicateIds = ids.slice(1);
          
          if (duplicateIds.length === 0) {
            console.log(`Keine Duplikate zum Bereinigen für Maschine ${machine_id}, Produkt ${product_vendon_id}`);
            continue;
          }
          
          // Summiere die Quantity und aktualisiere das Hauptprodukt
          const stockData = await client.query(`
            SELECT SUM(quantity) as total_quantity
            FROM machine_stocks
            WHERE id = ANY($1)
          `, [ids]);
          
          const totalQuantity = stockData.rows[0].total_quantity || 0;
          
          await client.query(`
            UPDATE machine_stocks
            SET quantity = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [totalQuantity, primaryId]);
          
          // Lösche die duplizierten Stocks
          await client.query(`
            DELETE FROM machine_stocks
            WHERE id = ANY($1)
          `, [duplicateIds]);
          
          totalCleanedStocks += duplicateIds.length;
        }
        
        // Commit die Änderungen für diesen Batch
        await client.query('COMMIT');
        console.log(`Batch ${i} bis ${batchEnd - 1} abgeschlossen und committed.`);
      }
      
      console.log(`Bereinigt: ${totalCleanedStocks} duplizierte Lagerbestände`);
    }
    
    // Erstelle eine Zusammenfassung der Bereinigung
    const productCountAfter = (await client.query('SELECT COUNT(*) FROM products')).rows[0].count;
    
    console.log('\nZusammenfassung der Bereinigung:');
    console.log(`Bereinigte Duplikate nach vendon_id: ${totalCleanedVendonId}`);
    console.log(`Bereinigte Duplikate nach Produktnamen: ${totalCleanedByName}`);
    console.log(`Produkte nach der Bereinigung: ${productCountAfter}`);
    console.log(`Bereinigte duplizierte Lagerbestände: ${totalCleanedStocks}`);
    
    console.log('\nBereinigung erfolgreich abgeschlossen.');
    
  } catch (error) {
    // Bei Fehler wird der aktuelle Batch zurückgerollt (jeder vorherige Batch bleibt bestehen)
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
cleanupDuplicateProducts()
  .then(() => {
    console.log('Bereinigungsprozess abgeschlossen.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
/**
 * Skript zum Bereinigen von Produktduplikaten in der Datenbank
 * Dieses Skript ist eine einmalige Korrekturmaßnahme für bestehende Duplikate.
 * 
 * Die verbesserte syncProducts-Funktion wurde bereits angepasst, um zukünftige
 * Duplikate zu verhindern, dieses Skript bereinigt die vorhandenen Probleme.
 */

// Um das Skript auszuführen:
// node fix_vendon_duplicate_products.js

// PostgreSQL-Client direkt einbinden (funktioniert in Node.js-Projekten)
const { Client } = require('pg');

// Datenbankverbindung herstellen
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Hauptfunktion zur Bereinigung von Duplikaten
 */
async function cleanupDuplicateProducts() {
  await client.connect();
  
  try {
    console.log('Starte Bereinigung von Produktduplikaten...');
    
    // Beginne eine Transaktion, um Datenbankintegrität zu gewährleisten
    await client.query('BEGIN');
    
    // 1. Identifiziere Duplikate basierend auf vendon_id
    console.log('Identifiziere Duplikate anhand von vendon_id...');
    const dupsByVendonId = await client.query(`
      SELECT vendon_id, COUNT(*) as count, array_agg(id) as ids
      FROM products
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`${dupsByVendonId.rows.length} Gruppen von Duplikaten nach vendon_id gefunden.`);
    
    // Bereinige Duplikate basierend auf vendon_id
    let totalCleanedVendonId = 0;
    
    for (const group of dupsByVendonId.rows) {
      const { vendon_id, count, ids } = group;
      console.log(`Bereinige ${count} Duplikate für vendon_id: ${vendon_id}`);
      
      // 1.1 Wähle ein Hauptprodukt (das erste in der Liste)
      const primaryId = ids[0];
      const duplicateIds = ids.slice(1);
      
      // 1.2 Aktualisiere Referenzen auf Duplikate zu dem Hauptprodukt
      // Aktualisiere machine_stocks
      await client.query(`
        UPDATE machine_stocks
        SET product_id = $1
        WHERE product_id = ANY($2)
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
      
      // 1.3 Lösche die Duplikate
      await client.query(`
        DELETE FROM products
        WHERE id = ANY($1)
      `, [duplicateIds]);
      
      totalCleanedVendonId += duplicateIds.length;
    }
    
    console.log(`Bereinigt: ${totalCleanedVendonId} Produkte mit duplizierter vendon_id`);
    
    // 2. Identifiziere Duplikate basierend auf normalisiertem Produktnamen
    console.log('Identifiziere Duplikate anhand von Produktnamen...');
    const dupsByName = await client.query(`
      SELECT LOWER(TRIM(product_name)) as normalized_name, COUNT(*) as count, array_agg(id) as ids
      FROM products
      GROUP BY LOWER(TRIM(product_name))
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`${dupsByName.rows.length} Gruppen von Duplikaten nach Produktnamen gefunden.`);
    
    // Bereinige Duplikate basierend auf Produktnamen
    let totalCleanedByName = 0;
    
    for (const group of dupsByName.rows) {
      const { normalized_name, count, ids } = group;
      console.log(`Bereinige ${count} Duplikate für Produktname: ${normalized_name}`);
      
      // 2.1 Finde das beste Hauptprodukt (bevorzuge Produkte mit vendon_id)
      const productsInfo = await client.query(`
        SELECT id, vendon_id
        FROM products
        WHERE id = ANY($1)
        ORDER BY vendon_id IS NOT NULL DESC, id ASC
      `, [ids]);
      
      const primaryId = productsInfo.rows[0].id;
      const duplicateIds = ids.filter(id => id !== primaryId);
      
      // 2.2 Aktualisiere Referenzen zu dem Hauptprodukt
      // Aktualisiere machine_stocks
      await client.query(`
        UPDATE machine_stocks
        SET product_id = $1
        WHERE product_id = ANY($2)
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
      
      // 2.3 Lösche die Duplikate
      await client.query(`
        DELETE FROM products
        WHERE id = ANY($1)
      `, [duplicateIds]);
      
      totalCleanedByName += duplicateIds.length;
    }
    
    console.log(`Bereinigt: ${totalCleanedByName} Produkte mit duplizierten Produktnamen`);
    
    // 3. Bereinige duplizierte Lagerbestände (gleiche Maschine, gleiches Produkt)
    console.log('Bereinige duplizierte Lagerbestände...');
    const dupMachineStocks = await client.query(`
      SELECT machine_id, product_id, COUNT(*) as count, array_agg(id) as ids
      FROM machine_stocks
      GROUP BY machine_id, product_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`${dupMachineStocks.rows.length} Gruppen von duplizierten Lagerbeständen gefunden.`);
    
    let totalCleanedStocks = 0;
    
    for (const group of dupMachineStocks.rows) {
      const { machine_id, product_id, count, ids } = group;
      console.log(`Bereinige ${count} duplizierte Lagerbestände für Maschine ${machine_id}, Produkt ${product_id}`);
      
      // 3.1 Wähle ein Haupt-Stock (das erste in der Liste)
      const primaryId = ids[0];
      const duplicateIds = ids.slice(1);
      
      // 3.2 Summiere die Quantity und aktualisiere das Hauptprodukt
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
      
      // 3.3 Lösche die duplizierten Stocks
      await client.query(`
        DELETE FROM machine_stocks
        WHERE id = ANY($1)
      `, [duplicateIds]);
      
      totalCleanedStocks += duplicateIds.length;
    }
    
    console.log(`Bereinigt: ${totalCleanedStocks} duplizierte Lagerbestände`);
    
    // Erstelle eine Zusammenfassung der Bereinigung
    const productCountBefore = (await client.query('SELECT COUNT(*) FROM products')).rows[0].count;
    const productCountAfter = productCountBefore - totalCleanedVendonId - totalCleanedByName;
    
    console.log('\nZusammenfassung der Bereinigung:');
    console.log(`Produkte vor der Bereinigung: ${productCountBefore}`);
    console.log(`Bereinigte Duplikate: ${totalCleanedVendonId + totalCleanedByName}`);
    console.log(`Produkte nach der Bereinigung: ${productCountAfter}`);
    console.log(`Bereinigte duplizierte Lagerbestände: ${totalCleanedStocks}`);
    
    // Commit der Transaktion
    await client.query('COMMIT');
    console.log('\nBereinigung erfolgreich abgeschlossen.');
    
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
cleanupDuplicateProducts()
  .then(() => {
    console.log('Bereinigungsprozess abgeschlossen.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Bereinigungsprozess fehlgeschlagen:', error);
    process.exit(1);
  });
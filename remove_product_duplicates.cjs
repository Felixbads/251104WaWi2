#!/usr/bin/env node

const { Client } = require('pg');

// Direkte Verwendung der Umgebungsvariable
const DATABASE_URL = process.env.DATABASE_URL;

async function removeDuplicateProducts() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Verbindung zur Datenbank hergestellt.');

    // Ermittle die Anzahl der Produkte vor der Bereinigung
    const countBefore = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Anzahl der Produkte vor der Bereinigung: ${countBefore.rows[0].count}`);

    // Finde die Duplikate - Gruppen von Produkten mit der gleichen vendon_id
    const duplicates = await client.query(`
      SELECT vendon_id, COUNT(*), array_agg(id ORDER BY id) as ids
      FROM products
      GROUP BY vendon_id
      HAVING COUNT(*) > 1
    `);

    console.log(`${duplicates.rows.length} Duplikate gefunden.`);

    // Beginne eine Transaktion
    await client.query('BEGIN');

    // Für jede Gruppe von Duplikaten
    let removedCount = 0;
    for (const row of duplicates.rows) {
      const ids = row.ids;
      const keepId = ids[0]; // Behalte das erste Produkt (niedrigste ID)
      const removeIds = ids.slice(1); // Entferne alle anderen Duplikate

      console.log(`Für vendon_id ${row.vendon_id}: Behalte Produkt ${keepId}, entferne ${removeIds.join(', ')}`);

      // Lösche die duplizierten Produkte
      const result = await client.query(
        'DELETE FROM products WHERE id = ANY($1)',
        [removeIds]
      );

      removedCount += result.rowCount;
    }

    // Commit der Transaktion
    await client.query('COMMIT');

    // Ermittle die Anzahl der Produkte nach der Bereinigung
    const countAfter = await client.query('SELECT COUNT(*) FROM products');
    
    console.log(`Bereinigung abgeschlossen. ${removedCount} Duplikate wurden entfernt.`);
    console.log(`Anzahl der Produkte vor der Bereinigung: ${countBefore.rows[0].count}`);
    console.log(`Anzahl der Produkte nach der Bereinigung: ${countAfter.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fehler bei der Bereinigung:', error);
  } finally {
    await client.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe die Funktion aus
removeDuplicateProducts().then(() => {
  console.log('Prozess abgeschlossen.');
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
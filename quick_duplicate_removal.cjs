#!/usr/bin/env node

/**
 * Schnelles Skript zum Entfernen von Duplikaten direkt mit einer SQL-Abfrage
 */

const { Client } = require('pg');

// Direkte Verwendung der Umgebungsvariable
const DATABASE_URL = process.env.DATABASE_URL;

async function quickRemoveDuplicateProducts() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Verbindung zur Datenbank hergestellt.');

    // Ermittle die Anzahl der Produkte vor der Bereinigung
    const countBefore = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Anzahl der Produkte vor der Bereinigung: ${countBefore.rows[0].count}`);

    // Führe alles in einer einzigen SQL-Anweisung aus
    const result = await client.query(`
      WITH duplicate_groups AS (
        SELECT vendon_id, array_agg(id ORDER BY id) as ids
        FROM products
        GROUP BY vendon_id
        HAVING COUNT(*) > 1
      ),
      duplicate_count AS (
        SELECT COUNT(*) as count FROM duplicate_groups
      ),
      to_delete AS (
        SELECT unnest(ids[2:]) as id
        FROM duplicate_groups
      )
      DELETE FROM products
      WHERE id IN (SELECT id FROM to_delete)
      RETURNING id;
    `);

    const removedCount = result.rowCount;
    console.log(`Bereinigung abgeschlossen. ${removedCount} Duplikate wurden entfernt.`);

    // Ermittle die Anzahl der Produkte nach der Bereinigung
    const countAfter = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Anzahl der Produkte nach der Bereinigung: ${countAfter.rows[0].count}`);

  } catch (error) {
    console.error('Fehler bei der Bereinigung:', error);
  } finally {
    await client.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe die Funktion aus
quickRemoveDuplicateProducts().then(() => {
  console.log('Prozess abgeschlossen.');
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
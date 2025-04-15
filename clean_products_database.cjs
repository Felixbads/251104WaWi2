#!/usr/bin/env node

const { Client } = require('pg');
const dotenv = require('dotenv');

// Lade Umgebungsvariablen
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function cleanDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Verbindung zur Datenbank hergestellt.');

    // Beginne eine Transaktion
    await client.query('BEGIN');

    console.log('Lösche alle Daten aus abhängigen Tabellen...');
    
    // Lösche Daten aus allen referenzierenden Tabellen in der richtigen Reihenfolge
    const tablesToClean = [
      'order_items',
      'inventory_count_items',
      'inventory_items',
      'inventory_movements',
      'purchase_conditions',
      'inventory_batches',
      'refill_batch_movements',
      'product_batches',
      'product_movements'
    ];

    for (const table of tablesToClean) {
      console.log(`Lösche Daten aus ${table}...`);
      await client.query(`DELETE FROM ${table}`);
      console.log(`Daten aus ${table} erfolgreich gelöscht.`);
    }

    // Lösche die Produkte
    console.log('Lösche alle Produkte...');
    await client.query('DELETE FROM products');
    console.log('Alle Produkte erfolgreich gelöscht.');

    // Commit der Transaktion
    await client.query('COMMIT');
    console.log('Transaktion erfolgreich abgeschlossen.');

    // Aktuellen Status der Datenbank anzeigen
    const counts = await Promise.all([
      client.query('SELECT COUNT(*) FROM products'),
      ...tablesToClean.map(table => client.query(`SELECT COUNT(*) FROM ${table}`))
    ]);

    console.log('Aktuelle Datenbankstatus:');
    console.log(`products: ${counts[0].rows[0].count} Einträge`);
    
    for (let i = 0; i < tablesToClean.length; i++) {
      console.log(`${tablesToClean[i]}: ${counts[i+1].rows[0].count} Einträge`);
    }

  } catch (error) {
    // Bei Fehler: Rollback der Transaktion
    await client.query('ROLLBACK');
    console.error('Fehler beim Bereinigen der Datenbank:', error);
    process.exit(1);
  } finally {
    // Verbindung schließen
    await client.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe die Funktion aus
cleanDatabase().then(() => {
  console.log('Datenbankbereinigung abgeschlossen.');
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
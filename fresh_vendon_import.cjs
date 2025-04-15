#!/usr/bin/env node

const { Client } = require('pg');
const dotenv = require('dotenv');
const axios = require('axios');

// Lade Umgebungsvariablen
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = 'http://localhost:3000';

async function performFreshImport() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Verbindung zur Datenbank hergestellt.');

    // Prüfe, ob die Datenbank leer ist
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCount.rows[0].count) > 0) {
      console.log('WARNUNG: Die Produkttabelle ist nicht leer. Bitte zuerst die Datenbank leeren mit node clean_products_database.cjs');
      return;
    }

    console.log('Starte den Neuimport der Produkte von Vendon...');
    
    // Rufe die Sync-API auf
    console.log('Rufe die Sync-API auf...');
    const syncResponse = await axios.post(`${BASE_URL}/api/sync/vendon/products`, {
      fullSync: true
    });
    
    console.log('Sync-Vorgang gestartet:', syncResponse.data);
    console.log('Bitte warten Sie, bis der Sync-Vorgang abgeschlossen ist.');
    console.log('Sie können den Status mit dem Befehl "curl http://localhost:3000/api/sync/status" überprüfen.');

  } catch (error) {
    console.error('Fehler beim Neuimport:', error.response?.data || error.message);
  } finally {
    await client.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe die Funktion aus
performFreshImport().then(() => {
  console.log('Import-Vorgang initiiert.');
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
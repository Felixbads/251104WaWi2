/**
 * Löscht alle Einträge aus der Transactions-Tabelle
 * 
 * Dieses Skript sollte VOR einem Import ausgeführt werden, wenn eine
 * vollständige Neueinfügung gewünscht ist.
 */

const { Pool } = require('pg');
const fs = require('fs');

// Datenbankverbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync('./clear_transactions.log', logMessage);
}

// Tabelle leeren
async function clearTransactionsTable() {
  try {
    // Anzahl der Einträge vor dem Löschen
    const countBefore = await pool.query('SELECT COUNT(*) FROM transactions');
    log(`Vor dem Löschen: ${countBefore.rows[0].count} Einträge in der Tabelle`);

    // Alle Einträge löschen
    await pool.query('DELETE FROM transactions');
    log('Alle Einträge aus der transactions-Tabelle wurden gelöscht');

    // Anzahl der Einträge nach dem Löschen
    const countAfter = await pool.query('SELECT COUNT(*) FROM transactions');
    log(`Nach dem Löschen: ${countAfter.rows[0].count} Einträge in der Tabelle`);

    // Optional: Sequenz zurücksetzen
    await pool.query('ALTER SEQUENCE transactions_id_seq RESTART WITH 1');
    log('ID-Sequenz wurde zurückgesetzt');

    return {
      beforeCount: parseInt(countBefore.rows[0].count),
      afterCount: parseInt(countAfter.rows[0].count)
    };
  } catch (error) {
    log(`Fehler beim Löschen der Tabelle: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  }
}

// Hauptfunktion
async function main() {
  log('=== LÖSCHEN DER TRANSACTIONS-TABELLE ===');
  log(`Zeitstempel: ${new Date().toISOString()}`);

  try {
    // Bestätigung einholen
    if (process.argv.includes('--confirm')) {
      const result = await clearTransactionsTable();
      log(`Vorgang abgeschlossen: ${result.beforeCount} Einträge wurden gelöscht.`);
    } else {
      log('WARNUNG: Diese Aktion löscht ALLE Transaktionen aus der Datenbank!');
      log('Führen Sie den Befehl mit dem Parameter --confirm aus, um fortzufahren.');
      log('Beispiel: node clear_transactions_table.cjs --confirm');
    }
  } catch (error) {
    log(`Unbehandelter Fehler: ${error.message}`);
  } finally {
    // Verbindung schließen
    await pool.end();
    log('Datenbankverbindung geschlossen');
  }
}

// Skript ausführen
main().catch(error => {
  console.error(`Kritischer Fehler: ${error.message}`);
  process.exit(1);
});
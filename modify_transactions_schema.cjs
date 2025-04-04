/**
 * Modifiziert das Transaktions-Schema, um Duplikate in der Vendon ID mit unterschiedlichen Zeitstempeln zu erlauben
 */

const { Pool } = require('pg');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  logFilePath: './modify_schema.log'
};

// Datenbankverbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Schema-Änderungen durchführen
async function modifySchema() {
  const client = await pool.connect();
  
  try {
    // Transaktion starten
    await client.query('BEGIN');
    
    log('Transaktionsdaten sichern und Tabelle leeren...');
    
    // Zuerst alle Daten löschen (da wir die Struktur ändern)
    await client.query('DELETE FROM transactions');
    log('Alle Transaktionsdaten wurden gelöscht');
    
    // Existierende Unique-Constraint entfernen
    log('Entferne bestehenden Unique-Constraint für vendon_id...');
    await client.query('ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_vendon_id_unique');
    
    // Neuen Composite-Key erstellen
    log('Erstelle zusammengesetzten Unique-Constraint für vendon_id + datetime...');
    await client.query('ALTER TABLE transactions ADD CONSTRAINT transactions_vendon_id_datetime_unique UNIQUE (vendon_id, datetime)');
    
    // Transaktion abschließen
    await client.query('COMMIT');
    log('Schema-Änderungen erfolgreich abgeschlossen');
    
  } catch (error) {
    // Bei Fehler Transaktion zurückrollen
    await client.query('ROLLBACK');
    log(`Fehler bei Schema-Änderung: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  } finally {
    // Client wieder freigeben
    client.release();
  }
}

// Hauptfunktion
async function main() {
  log('=== MODIFIKATION DES TRANSAKTIONS-SCHEMAS ===');
  log(`Zeitstempel: ${new Date().toISOString()}`);
  
  try {
    // Bestätigung überprüfen
    if (process.argv.includes('--confirm')) {
      await modifySchema();
      log('Schema wurde erfolgreich aktualisiert');
    } else {
      log('WARNUNG: Diese Aktion verändert das Datenbankschema und löscht alle bestehenden Transaktionen!');
      log('Führen Sie den Befehl mit dem Parameter --confirm aus, um fortzufahren.');
      log('Beispiel: node modify_transactions_schema.cjs --confirm');
    }
  } catch (error) {
    log(`Unbehandelter Fehler: ${error.message}`);
  } finally {
    // Pool schließen
    await pool.end();
    log('Datenbankverbindung geschlossen');
  }
}

// Skript ausführen
main().catch(error => {
  log(`Kritischer Fehler: ${error.message}`);
  process.exit(1);
});
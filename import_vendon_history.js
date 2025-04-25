/**
 * Vendon Historischer Transaktions-Import
 * 
 * Dieses Skript importiert historische Vendon-Transaktionen tagesweise.
 * Es verwendet einen robusten Algorithmus, der:
 * - Tagesweise importiert von einem konfigurierten Startdatum bis heute
 * - Paginavigation mit 100er-Batches
 * - Fortschritt in einer sync_state Tabelle speichert
 * - Fehlerbehandlung und automatische Wiederholungen implementiert
 * - Detaillierte Logs und Metriken ausgibt
 * 
 * Verwendung:
 *   node import_vendon_history.js [--start-date=YYYY-MM-DD] [--end-date=YYYY-MM-DD] [--batch-size=100]
 * 
 * Beispiele:
 *   node import_vendon_history.js --start-date=2022-01-01
 *   node import_vendon_history.js --start-date=2022-01-01 --end-date=2022-12-31
 */

require('dotenv').config();
const { Pool } = require('pg');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Import der Importer-Klasse
// Wir müssen TypeScript transpilieren
require('esbuild-register');
const { importVendonHistory } = require('./server/services/vendonHistoryImporter');

// Kommandozeilenargumente parsen
const argv = yargs(hideBin(process.argv))
  .option('start-date', {
    describe: 'Startdatum für den Import (YYYY-MM-DD)',
    type: 'string',
  })
  .option('end-date', {
    describe: 'Enddatum für den Import (YYYY-MM-DD)',
    type: 'string',
  })
  .option('batch-size', {
    describe: 'Anzahl der Transaktionen pro Batch (max. 100)',
    type: 'number',
    default: 100
  })
  .option('request-delay', {
    describe: 'Verzögerung zwischen API-Anfragen in ms',
    type: 'number',
    default: 1000
  })
  .option('retry-delay', {
    describe: 'Verzögerung zwischen Wiederholungsversuchen in ms',
    type: 'number',
    default: 5000
  })
  .option('max-retries', {
    describe: 'Maximale Anzahl von Wiederholungsversuchen bei Fehlern',
    type: 'number',
    default: 3
  })
  .help()
  .argv;

// Hauptfunktion
async function main() {
  console.log('🚀 Starte Vendon Historischen Transaktions-Import');
  
  // Konfiguration aus Kommandozeilenargumenten
  const config = {
    startDate: argv['start-date'],
    endDate: argv['end-date'],
    batchSize: argv['batch-size'],
    requestDelay: argv['request-delay'],
    retryDelay: argv['retry-delay'],
    maxRetries: argv['max-retries']
  };
  
  // Parameter anzeigen
  console.log('Konfiguration:');
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined) {
      console.log(`- ${key}: ${value}`);
    }
  }
  
  // Datenbankverbindung erstellen
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log('Verbindung zur Datenbank hergestellt.');
    
    // Importer starten
    console.log('Starte den Import...');
    const result = await importVendonHistory(pool, config);
    
    // Ergebnis anzeigen
    console.log('✅ Import abgeschlossen!');
    console.log('Zusammenfassung:');
    console.log(`- Verarbeitete Tage: ${result.summary.daysProcessed}`);
    console.log(`- Gefundene Transaktionen: ${result.summary.totalItems}`);
    console.log(`- Gespeicherte Transaktionen: ${result.summary.savedItems}`);
    console.log(`- Duplikate: ${result.summary.duplicateItems}`);
    console.log(`- Fehler: ${result.summary.errorItems}`);
    console.log(`- Gesamtdauer: ${result.summary.durationSeconds.toFixed(2)} Sekunden`);
    
    // Detaillierte tägliche Ergebnisse
    console.log('\nTägliche Ergebnisse:');
    for (const day of result.dailyResults) {
      const status = day.completed ? '✅' : '❌';
      console.log(`${status} ${day.date}: ${day.savedItems}/${day.totalItems} gespeichert, ${day.duplicateItems} Duplikate, ${day.errorItems} Fehler, ${day.duration.toFixed(2)}s`);
    }
    
    // Statuscheck
    if (result.summary.errorItems > 0) {
      console.log('\n⚠️ Es sind Fehler aufgetreten. Prüfen Sie die Logs für Details.');
    } else {
      console.log('\n🎉 Der Import wurde vollständig und fehlerfrei abgeschlossen!');
    }
  } catch (error) {
    console.error('❌ Fehler beim Import:', error);
    process.exit(1);
  } finally {
    // Verbindung schließen
    await pool.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Skript ausführen
main().catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});
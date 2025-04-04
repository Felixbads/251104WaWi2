/**
 * Setzt den Import-Status zurück und führt den Import aus
 * 
 * Dieses Skript setzt zunächst den Status zurück (oder löscht Transaktionen auf Wunsch),
 * bevor der Import-Prozess gestartet wird.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  clearScriptPath: './clear_transactions_table.cjs',
  importRunnerPath: './run_import_split_excel_chunks_limited.cjs',
  statusFilePath: './import_split_chunks_limited_status.json',
  logFilePath: './reset_and_run_import.log'
};

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Status-Datei zurücksetzen
function resetStatusFile() {
  const initialStatus = {
    processedChunks: [],
    currentChunk: null,
    currentPosition: 0,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastProcessed: null,
    running: false,
    completed: false,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  };
  
  fs.writeFileSync(CONFIG.statusFilePath, JSON.stringify(initialStatus, null, 2));
  log('Status-Datei wurde zurückgesetzt');
}

// Transaktionen-Tabelle leeren
function clearTransactionsTable() {
  return new Promise((resolve, reject) => {
    log('Lösche Transaktionen-Tabelle...');
    
    exec(`node ${CONFIG.clearScriptPath} --confirm`, (error, stdout, stderr) => {
      if (error) {
        log(`Fehler beim Löschen der Tabelle: ${error.message}`);
        return reject(error);
      }
      
      if (stderr) {
        log(`Fehlerausgabe: ${stderr}`);
      }
      
      log('Transaktionen wurden erfolgreich gelöscht');
      resolve();
    });
  });
}

// Import-Runner ausführen
function runImportProcess() {
  return new Promise((resolve, reject) => {
    log('Starte Import-Prozess...');
    
    // Bestimmen, ob die Duplikatprüfung übersprungen werden soll
    const skipDuplicateCheckArg = process.argv.includes('--skip-duplicate-check') ? ' --skip-duplicate-check' : '';
    
    const childProcess = exec(`node ${CONFIG.importRunnerPath}${skipDuplicateCheckArg}`, (error, stdout, stderr) => {
      if (error) {
        log(`Fehler beim Import-Prozess: ${error.message}`);
        return reject(error);
      }
      
      if (stderr) {
        log(`Fehlerausgabe: ${stderr}`);
      }
      
      resolve();
    });
    
    // Ausgabe in Echtzeit
    childProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
  });
}

// Hauptfunktion
async function main() {
  log('=== RESET UND IMPORT ===');
  log(`Zeitstempel: ${new Date().toISOString()}`);
  
  try {
    // Optionen aus Befehlszeilenargumenten lesen
    const shouldClearTable = process.argv.includes('--clear-table');
    
    if (shouldClearTable) {
      log('Option --clear-table wurde ausgewählt');
      await clearTransactionsTable();
    } else {
      log('Tabelle wird nicht gelöscht. Verwende --clear-table, um Transaktionen zu löschen.');
    }
    
    // Status zurücksetzen
    resetStatusFile();
    
    // Import starten
    log('Starte Import-Prozess...');
    await runImportProcess();
    
  } catch (error) {
    log(`Fehler beim Ausführen: ${error.message}`);
  }
  
  log('Prozess beendet');
}

// Skript ausführen
main().catch(error => {
  log(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
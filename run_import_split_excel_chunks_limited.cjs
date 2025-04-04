/**
 * Führt den limitierten Import der aufgeteilten Excel-Dateien aus
 * 
 * Dieses Skript führt den begrenzten Import mehrfach aus, wobei der Status zwischen
 * den einzelnen Aufrufen beibehalten wird, um alle Chunks vollständig zu importieren.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  scriptPath: './import_split_excel_chunks_limited.cjs',
  statusFilePath: './import_split_chunks_limited_status.json',
  logFilePath: './run_import_split_chunks.log',
  maxRuns: 100,             // Maximale Anzahl der Durchläufe
  delayBetweenRuns: 2000    // Verzögerung zwischen den Durchläufen in ms
};

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Status abrufen
function getStatus() {
  try {
    if (fs.existsSync(CONFIG.statusFilePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    }
  } catch (error) {
    log(`Fehler beim Lesen der Status-Datei: ${error.message}`);
  }
  
  return {
    processedChunks: [],
    currentChunk: null,
    currentPosition: 0,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastProcessed: null,
    running: false,
    completed: false
  };
}

// Ausführung eines einzelnen Import-Laufs
function runImport() {
  return new Promise((resolve, reject) => {
    log(`\n=== STARTE IMPORT-LAUF ===`);
    log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const child = exec(`node ${CONFIG.scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        log(`Fehler beim Ausführen des Skripts: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        log(`Fehlerausgabe: ${stderr}`);
      }
      
      // Ausgabe nicht im Hauptlog anzeigen, um die Datei nicht zu groß werden zu lassen
      
      resolve();
    });
    
    // Timeout für die Ausführung (60 Sekunden)
    const timeout = setTimeout(() => {
      log('Import-Timeout erreicht (60s), beende Prozess...');
      child.kill();
      
      // Warte kurz, damit das Skript ordnungsgemäß beendet werden kann
      setTimeout(() => {
        // Status auf "nicht laufend" zurücksetzen, falls ein Timeout auftritt
        try {
          const status = getStatus();
          if (status.running) {
            status.running = false;
            fs.writeFileSync(CONFIG.statusFilePath, JSON.stringify(status, null, 2));
            log('Status auf "nicht laufend" zurückgesetzt nach Timeout');
          }
        } catch (err) {
          log(`Fehler beim Zurücksetzen des Status: ${err.message}`);
        }
        
        resolve({ timeout: true });
      }, 1000);
    }, 60000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
    });
  });
}

// Hauptfunktion
async function main() {
  log(`=== EXCEL-CHUNK-IMPORT (LIMITIERT) ===`);
  log(`Maximale Anzahl an Durchläufen: ${CONFIG.maxRuns}`);
  log(`Zeitstempel: ${new Date().toISOString()}`);
  
  // Status vor dem ersten Durchlauf anzeigen
  const initialStatus = getStatus();
  log('\nInitialer Status:');
  
  if (initialStatus.completed) {
    log('Import bereits abgeschlossen.');
    return;
  }
  
  log(`- Verarbeitete Chunks: ${initialStatus.processedChunks.length}`);
  log(`- Aktueller Chunk: ${initialStatus.currentChunk || 'Noch keiner'}`);
  log(`- Position im Chunk: ${initialStatus.currentPosition}`);
  log(`- Importierte Zeilen: ${initialStatus.importedCount}`);
  log(`- Übersprungene Zeilen: ${initialStatus.skippedCount}`);
  
  // Durchläufe ausführen
  let consecutiveErrors = 0;
  
  for (let i = 0; i < CONFIG.maxRuns; i++) {
    log(`\n--- Durchlauf ${i+1}/${CONFIG.maxRuns} ---`);
    
    try {
      await runImport();
      consecutiveErrors = 0; // Zurücksetzen bei Erfolg
    } catch (error) {
      log(`Fehler im Durchlauf ${i+1}: ${error.message}`);
      consecutiveErrors++;
      
      // Bei 3 aufeinanderfolgenden Fehlern abbrechen
      if (consecutiveErrors >= 3) {
        log(`Import nach 3 aufeinanderfolgenden Fehlern abgebrochen.`);
        break;
      }
    }
    
    // Status nach dem Durchlauf prüfen
    const status = getStatus();
    
    // Statusanzeige
    log(`\nStatus nach Durchlauf ${i+1}:`);
    log(`- Verarbeitete Chunks: ${status.processedChunks.length}`);
    log(`- Aktueller Chunk: ${status.currentChunk || 'Keiner'}`);
    log(`- Position im Chunk: ${status.currentPosition}`);
    log(`- Importierte Zeilen: ${status.importedCount}`);
    log(`- Übersprungene Zeilen: ${status.skippedCount}`);
    
    // Prüfen, ob der Import abgeschlossen ist
    if (status.completed) {
      log('\n=== IMPORT ABGESCHLOSSEN ===');
      log(`Import erfolgreich abgeschlossen nach ${i+1} Durchläufen.`);
      break;
    }
    
    // Kurze Pause zwischen den Durchläufen
    if (i < CONFIG.maxRuns - 1 && !status.completed) {
      log(`\nPause vor nächstem Durchlauf (${CONFIG.delayBetweenRuns}ms)...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRuns));
    }
  }
  
  log('\n=== PROZESS BEENDET ===');
  log(`Zeitstempel: ${new Date().toISOString()}`);
}

// Skript ausführen
main().catch(error => {
  log(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
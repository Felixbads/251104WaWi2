/**
 * Ausführung des Excel-Import in mehreren Chunks für die große Datei
 * 
 * Dieses Skript führt den Import in mehreren Durchläufen aus,
 * wobei nach jedem Chunk eine Pause eingelegt wird, um Memory-Probleme zu vermeiden.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  scriptPath: './import_excel_in_chunks.cjs',
  statusFilePath: './excel_large_chunk_import_status.json',
  maxRuns: 1000,             // Maximale Anzahl der Durchläufe
  delayBetweenRuns: 3000,    // Verzögerung zwischen den Durchläufen in ms (3 Sekunden)
  logFilePath: './run_large_import.log'
};

// Status-Management
function getStatus() {
  try {
    if (fs.existsSync(CONFIG.statusFilePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    }
  } catch (error) {
    console.error('Fehler beim Lesen der Status-Datei:', error);
  }
  
  return {
    currentRow: 0,
    totalRows: 0,
    importedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    running: false,
    completed: false
  };
}

// Logging
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Ausführung eines einzelnen Chunk-Imports
function runChunkImport() {
  return new Promise((resolve, reject) => {
    log(`=== STARTE CHUNK-IMPORT ===`);
    log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const startTime = new Date();
    
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
      resolve({ timeout: true });
    }, 60000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
      
      // Berechne die Laufzeit
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime - startTime) / 1000);
      log(`Chunk-Durchlauf nach ${durationSeconds} Sekunden beendet.`);
    });
  });
}

// Hauptfunktion
async function main() {
  log(`=== EXCEL-IMPORT IN CHUNKS (GROSSE DATEI) ===`);
  log(`Maximale Anzahl an Durchläufen: ${CONFIG.maxRuns}`);
  log(`Zeitstempel: ${new Date().toISOString()}`);
  
  // Status vor dem ersten Durchlauf anzeigen
  const initialStatus = getStatus();
  log('\nInitialer Status:');
  
  if (initialStatus.totalRows > 0) {
    const progress = ((initialStatus.currentRow / initialStatus.totalRows) * 100).toFixed(2);
    log(`- Verarbeitete Zeilen: ${initialStatus.currentRow}/${initialStatus.totalRows} (${progress}%)`);
    log(`- Importiert: ${initialStatus.importedCount}, Übersprungen: ${initialStatus.skippedCount}`);
    log(`- Letzte Verarbeitung: ${initialStatus.lastProcessed || 'Noch nicht gestartet'}`);
    
    if (initialStatus.completed) {
      log('- Status: Abgeschlossen');
      log('\nImport bereits abgeschlossen!');
      return;
    }
  } else {
    log('- Noch keine Verarbeitung gestartet');
  }
  
  // Durchläufe ausführen
  let consecutiveErrors = 0;
  
  for (let i = 0; i < CONFIG.maxRuns; i++) {
    log(`\n--- Durchlauf ${i+1}/${CONFIG.maxRuns} ---`);
    
    try {
      await runChunkImport();
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
    if (status.totalRows > 0) {
      const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
      log(`\nStatus nach Durchlauf ${i+1}:`);
      log(`- Verarbeitete Zeilen: ${status.currentRow}/${status.totalRows} (${progress}%)`);
      log(`- Importiert: ${status.importedCount}, Übersprungen: ${status.skippedCount}`);
      log(`- Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
      
      // Berechnen der geschätzten verbleibenden Zeit
      if (status.startTime && status.currentRow > 0) {
        const startTime = new Date(status.startTime);
        const now = new Date();
        const elapsedMs = now - startTime;
        const msPerRow = elapsedMs / status.currentRow;
        const remainingRows = status.totalRows - status.currentRow;
        const remainingMs = msPerRow * remainingRows;
        
        // Formatieren der verbleibenden Zeit
        const remainingHours = Math.floor(remainingMs / 3600000);
        const remainingMinutes = Math.floor((remainingMs % 3600000) / 60000);
        
        log(`- Geschätzte verbleibende Zeit: ca. ${remainingHours} Stunden, ${remainingMinutes} Minuten`);
      }
    }
    
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
  
  // Abschließenden Status anzeigen
  const finalStatus = getStatus();
  if (finalStatus.totalRows > 0) {
    const progress = ((finalStatus.currentRow / finalStatus.totalRows) * 100).toFixed(2);
    log(`\nFinaler Status:`);
    log(`- Verarbeitete Zeilen: ${finalStatus.currentRow}/${finalStatus.totalRows} (${progress}%)`);
    log(`- Importiert: ${finalStatus.importedCount}, Übersprungen: ${finalStatus.skippedCount}`);
    log(`- Letzte Verarbeitung: ${finalStatus.lastProcessed || 'Keine Verarbeitung'}`);
    
    if (finalStatus.startTime) {
      const startTime = new Date(finalStatus.startTime);
      const endTime = new Date();
      const durationMs = endTime - startTime;
      const durationHours = Math.floor(durationMs / 3600000);
      const durationMinutes = Math.floor((durationMs % 3600000) / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);
      
      log(`- Gesamtlaufzeit: ${durationHours}h ${durationMinutes}m ${durationSeconds}s`);
    }
  }
}

// Skript ausführen
main().catch(error => {
  log(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
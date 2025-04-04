/**
 * Ausführung des Excel-Import in mehreren Chunks
 * 
 * Dieses Skript führt den Import in mehreren Durchläufen aus,
 * wobei nach jedem Chunk eine Pause eingelegt wird, um Memory-Probleme zu vermeiden.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  scriptPath: './import_excel_in_chunks.cjs',
  statusFilePath: './excel_chunk_import_status.json',
  maxRuns: 200,              // Maximale Anzahl der Durchläufe
  delayBetweenRuns: 2000     // Verzögerung zwischen den Durchläufen in ms
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

// Ausführung eines einzelnen Chunk-Imports
function runChunkImport() {
  return new Promise((resolve, reject) => {
    console.log(`\n=== STARTE CHUNK-IMPORT ===`);
    console.log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const child = exec(`node ${CONFIG.scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Fehler beim Ausführen des Skripts: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Fehlerausgabe: ${stderr}`);
      }
      
      // Ausgabe anzeigen
      console.log(stdout);
      
      resolve();
    });
    
    // Timeout für die Ausführung (60 Sekunden)
    const timeout = setTimeout(() => {
      console.log('Import-Timeout erreicht (60s), beende Prozess...');
      child.kill();
      resolve({ timeout: true });
    }, 60000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
    });
  });
}

// Hauptfunktion
async function main() {
  console.log(`=== EXCEL-IMPORT IN CHUNKS ===`);
  console.log(`Maximale Anzahl an Durchläufen: ${CONFIG.maxRuns}`);
  
  // Status vor dem ersten Durchlauf anzeigen
  const initialStatus = getStatus();
  console.log('\nInitialer Status:');
  
  if (initialStatus.totalRows > 0) {
    const progress = ((initialStatus.currentRow / initialStatus.totalRows) * 100).toFixed(2);
    console.log(`- Verarbeitete Zeilen: ${initialStatus.currentRow}/${initialStatus.totalRows} (${progress}%)`);
    console.log(`- Importiert: ${initialStatus.importedCount}, Übersprungen: ${initialStatus.skippedCount}`);
    console.log(`- Letzte Verarbeitung: ${initialStatus.lastProcessed || 'Noch nicht gestartet'}`);
    
    if (initialStatus.completed) {
      console.log('- Status: Abgeschlossen');
      console.log('\nImport bereits abgeschlossen!');
      return;
    }
  } else {
    console.log('- Noch keine Verarbeitung gestartet');
  }
  
  // Durchläufe ausführen
  for (let i = 0; i < CONFIG.maxRuns; i++) {
    console.log(`\n--- Durchlauf ${i+1}/${CONFIG.maxRuns} ---`);
    
    await runChunkImport();
    
    // Status nach dem Durchlauf prüfen
    const status = getStatus();
    
    // Statusanzeige
    if (status.totalRows > 0) {
      const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
      console.log(`\nStatus nach Durchlauf ${i+1}:`);
      console.log(`- Verarbeitete Zeilen: ${status.currentRow}/${status.totalRows} (${progress}%)`);
      console.log(`- Importiert: ${status.importedCount}, Übersprungen: ${status.skippedCount}`);
      console.log(`- Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    }
    
    // Prüfen, ob der Import abgeschlossen ist
    if (status.completed) {
      console.log('\n=== IMPORT ABGESCHLOSSEN ===');
      console.log(`Import erfolgreich abgeschlossen nach ${i+1} Durchläufen.`);
      break;
    }
    
    // Kurze Pause zwischen den Durchläufen
    if (i < CONFIG.maxRuns - 1 && !status.completed) {
      console.log(`\nPause vor nächstem Durchlauf (${CONFIG.delayBetweenRuns}ms)...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRuns));
    }
  }
  
  console.log('\n=== PROZESS BEENDET ===');
}

// Skript ausführen
main().catch(error => {
  console.error(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
/**
 * Ausführung des inkrementellen Direktimports aus großer Excel-Datei
 * 
 * Dieses Skript führt den inkrementellen Import mehrfach hintereinander aus,
 * mit kurzen Pausen zwischen den Durchläufen, um eine bessere Kontrolle über
 * den Prozess zu haben und Timeouts zu vermeiden.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  maxRuns: 100,               // Maximale Anzahl der Durchläufe
  delayBetweenRuns: 2000,     // Verzögerung zwischen Durchläufen in ms (2 Sekunden)
  scriptPath: './incremental_direct_import.cjs',
  statusFilePath: './direct_import_status_large.json'
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
    processedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    running: false
  };
}

// Ausführung eines einzelnen Durchlaufs
function runImport() {
  return new Promise((resolve, reject) => {
    console.log(`\n=== STARTE DURCHLAUF ===`);
    console.log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const child = exec(`node ${CONFIG.scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Fehler beim Ausführen des Skripts: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Fehlerausgabe: ${stderr}`);
      }
      // Ausgabe nicht ausgeben, da sie sehr umfangreich sein kann
      
      resolve();
    });
    
    // Timeout für die Ausführung (45 Sekunden)
    const timeout = setTimeout(() => {
      console.log('Import-Timeout erreicht (45s), beende Prozess...');
      child.kill();
      resolve(); // Trotzdem als erfolgreich betrachten, damit wir weitermachen können
    }, 45000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
    });
  });
}

// Hauptfunktion
async function main() {
  console.log(`=== STARTE INKREMENTELLEN DIREKTIMPORT PROZESS (Große Datei) ===`);
  console.log(`Maximale Anzahl Durchläufe: ${CONFIG.maxRuns}`);
  
  // Status vor dem ersten Durchlauf anzeigen
  const initialStatus = getStatus();
  console.log('\nErster Status:');
  if (initialStatus.totalRows > 0) {
    const progress = ((initialStatus.currentRow / initialStatus.totalRows) * 100).toFixed(2);
    console.log(`- Verarbeitete Zeilen: ${initialStatus.currentRow}/${initialStatus.totalRows} (${progress}%)`);
    console.log(`- Importiert: ${initialStatus.processedCount}, Übersprungen: ${initialStatus.skippedCount}`);
    console.log(`- Letzte Verarbeitung: ${initialStatus.lastProcessed || 'Noch nicht gestartet'}`);
  } else {
    console.log('- Noch keine Verarbeitung gestartet oder Status zurückgesetzt');
  }
  
  // Durchläufe ausführen
  for (let i = 0; i < CONFIG.maxRuns; i++) {
    console.log(`\n--- Durchlauf ${i+1}/${CONFIG.maxRuns} ---`);
    
    await runImport();
    
    // Status nach dem Durchlauf prüfen
    const status = getStatus();
    
    // Prüfen, ob alle Daten verarbeitet wurden
    if (status.totalRows > 0 && status.currentRow >= status.totalRows) {
      console.log('\n=== IMPORT ABGESCHLOSSEN ===');
      console.log(`Alle ${status.totalRows} Zeilen verarbeitet!`);
      console.log(`Importiert: ${status.processedCount}, Übersprungen: ${status.skippedCount}`);
      console.log(`Letzte Verarbeitung: ${status.lastProcessed}`);
      break;
    }
    
    // Status anzeigen
    if (status.totalRows > 0) {
      const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
      console.log(`\nStatus nach Durchlauf ${i+1}:`);
      console.log(`- Verarbeitete Zeilen: ${status.currentRow}/${status.totalRows} (${progress}%)`);
      console.log(`- Importiert: ${status.processedCount}, Übersprungen: ${status.skippedCount}`);
      console.log(`- Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    }
    
    // Kurze Pause zwischen den Durchläufen
    if (i < CONFIG.maxRuns - 1) {
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
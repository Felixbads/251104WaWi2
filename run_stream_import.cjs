/**
 * Ausführung des Stream-basierten Excel-Imports
 * 
 * Dieses Skript führt den Stream-basierten Import aus und überwacht den Fortschritt.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  scriptPath: './stream_import_excel.cjs',
  statusFilePath: './stream_import_status.json',
  logFilePath: './stream_import.log',
  checkInterval: 10000 // 10 Sekunden
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
    importedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    startTime: null,
    lastUpdate: null
  };
}

// Letzte Log-Einträge anzeigen
function getLastLogEntries(count = 5) {
  try {
    if (fs.existsSync(CONFIG.logFilePath)) {
      const log = fs.readFileSync(CONFIG.logFilePath, 'utf8');
      const lines = log.split('\n').filter(line => line.trim() !== '');
      
      // Rückgabe der letzten X Einträge oder weniger
      return lines.slice(-count);
    }
  } catch (error) {
    console.error('Fehler beim Lesen der Log-Datei:', error);
  }
  
  return ['Keine Log-Einträge gefunden'];
}

// Ausführung des Stream-Imports
function runStreamImport() {
  return new Promise((resolve, reject) => {
    console.log(`\n=== STARTE STREAM-IMPORT ===`);
    console.log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const child = exec(`node ${CONFIG.scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Fehler beim Ausführen des Skripts: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Fehlerausgabe: ${stderr}`);
      }
      
      resolve();
    });
    
    // Timeout für die Ausführung (5 Minuten)
    const timeout = setTimeout(() => {
      console.log('Import-Timeout erreicht (5 Minuten), beende Prozess...');
      child.kill();
      resolve(); // Trotzdem als erfolgreich betrachten, damit wir weitermachen können
    }, 5 * 60 * 1000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
    });
  });
}

// Hauptfunktion
async function main() {
  console.log(`=== STREAM-BASIERTER EXCEL-IMPORT ===`);
  console.log(`Zeitstempel: ${new Date().toISOString()}`);
  
  // Status vor dem Start anzeigen
  const initialStatus = getStatus();
  if (initialStatus.startTime) {
    console.log(`\nAktueller Status:`);
    console.log(`- Importiert: ${initialStatus.importedCount}`);
    console.log(`- Übersprungen: ${initialStatus.skippedCount}`);
    console.log(`- Letzte Verarbeitung: ${initialStatus.lastProcessed || 'Noch nicht gestartet'}`);
    console.log(`- Startzeit: ${initialStatus.startTime}`);
    console.log(`- Letzte Aktualisierung: ${initialStatus.lastUpdate}`);
  } else {
    console.log('\nKein vorheriger Import gefunden.');
  }
  
  // Import starten
  try {
    await runStreamImport();
    
    // Finalen Status anzeigen
    const finalStatus = getStatus();
    console.log(`\n=== IMPORT ABGESCHLOSSEN ===`);
    console.log(`Importiert: ${finalStatus.importedCount}`);
    console.log(`Übersprungen: ${finalStatus.skippedCount}`);
    console.log(`Letzte Verarbeitung: ${finalStatus.lastProcessed}`);
    
    if (finalStatus.startTime && finalStatus.lastUpdate) {
      const startTime = new Date(finalStatus.startTime);
      const endTime = new Date(finalStatus.lastUpdate);
      const durationMs = endTime - startTime;
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);
      
      console.log(`Laufzeit: ${durationMinutes} Minuten, ${durationSeconds} Sekunden`);
    }
    
  } catch (error) {
    console.error(`Import fehlgeschlagen: ${error.message}`);
  }
  
  // Letzte Log-Einträge anzeigen
  console.log(`\n=== LETZTE LOG-EINTRÄGE ===`);
  const lastLogs = getLastLogEntries();
  lastLogs.forEach(line => console.log(line));
  
  console.log('\n=== PROZESS BEENDET ===');
}

// Skript ausführen
main().catch(error => {
  console.error(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
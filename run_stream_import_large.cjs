/**
 * Ausführung des Stream-basierten Excel-Imports für große Dateien
 * 
 * Dieses Skript führt den Stream-basierten Import speziell für die große Excel-Datei aus
 * und überwacht den Fortschritt.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const CONFIG = {
  scriptPath: './stream_import_excel.cjs',
  statusFilePath: './stream_import_large_status.json',
  logFilePath: './stream_import_large.log',
  checkInterval: 15000, // 15 Sekunden
  maxAttempts: 20        // 20 Versuche
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
function getLastLogEntries(count = 10) {
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

// Ausführung eines einzelnen Import-Durchlaufs
function runStreamImport() {
  return new Promise((resolve, reject) => {
    console.log(`\n=== STARTE STREAM-IMPORT DURCHLAUF ===`);
    console.log(`Führe Skript aus: ${CONFIG.scriptPath}`);
    
    const startTime = new Date();
    
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
      
      // Status speichern
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime - startTime) / 1000);
      console.log(`Durchlauf nach ${durationSeconds} Sekunden beendet (Timeout).`);
      
      resolve({ timeout: true });
    }, 5 * 60 * 1000);
    
    child.on('exit', () => {
      clearTimeout(timeout);
      
      // Berechne die Laufzeit
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime - startTime) / 1000);
      console.log(`Durchlauf nach ${durationSeconds} Sekunden beendet.`);
    });
  });
}

// Hauptfunktion
async function main() {
  console.log(`=== STREAM-BASIERTER EXCEL-IMPORT FÜR GROSSE DATEI ===`);
  console.log(`Zeitstempel: ${new Date().toISOString()}`);
  console.log(`Maximale Anzahl Versuche: ${CONFIG.maxAttempts}`);
  
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
    let lastImportedCount = initialStatus.importedCount || 0;
    let lastSkippedCount = initialStatus.skippedCount || 0;
    let consecutiveNoProgress = 0;
    
    for (let attempt = 1; attempt <= CONFIG.maxAttempts; attempt++) {
      console.log(`\n--- Versuch ${attempt}/${CONFIG.maxAttempts} ---`);
      
      const result = await runStreamImport();
      
      // Kurze Pause zwischen den Versuchen
      if (attempt < CONFIG.maxAttempts) {
        console.log(`\nWarte ${CONFIG.checkInterval/1000} Sekunden vor dem nächsten Versuch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
      }
      
      // Status nach dem Durchlauf prüfen
      const currentStatus = getStatus();
      console.log(`\nStatus nach Versuch ${attempt}:`);
      console.log(`- Importiert: ${currentStatus.importedCount}`);
      console.log(`- Übersprungen: ${currentStatus.skippedCount}`);
      console.log(`- Letzte Verarbeitung: ${currentStatus.lastProcessed || 'Noch nicht gestartet'}`);
      
      // Prüfen, ob Fortschritt erzielt wurde
      const newImported = currentStatus.importedCount - lastImportedCount;
      const newSkipped = currentStatus.skippedCount - lastSkippedCount;
      console.log(`- Neue Importe in diesem Durchlauf: ${newImported}`);
      console.log(`- Neue Übersprungen in diesem Durchlauf: ${newSkipped}`);
      
      if (newImported === 0 && newSkipped === 0) {
        consecutiveNoProgress++;
        console.log(`- Keine Fortschritte in ${consecutiveNoProgress} aufeinanderfolgenden Durchläufen`);
        
        // Wenn 3 Durchläufe hintereinander keinen Fortschritt zeigen, brechen wir ab
        if (consecutiveNoProgress >= 3) {
          console.log(`\n=== IMPORT ABGEBROCHEN ===`);
          console.log(`Keine Fortschritte in 3 aufeinanderfolgenden Durchläufen.`);
          console.log(`Es scheint, dass der Import abgeschlossen oder blockiert ist.`);
          break;
        }
      } else {
        consecutiveNoProgress = 0;
        lastImportedCount = currentStatus.importedCount;
        lastSkippedCount = currentStatus.skippedCount;
      }
      
      // Letzte Log-Einträge anzeigen
      console.log(`\nLetzte Log-Einträge:`);
      const lastLogs = getLastLogEntries(5);
      lastLogs.forEach(line => console.log(line));
    }
    
    // Finalen Status anzeigen
    const finalStatus = getStatus();
    console.log(`\n=== IMPORT ABGESCHLOSSEN ===`);
    console.log(`Gesamtergebnis:`);
    console.log(`- Importiert: ${finalStatus.importedCount}`);
    console.log(`- Übersprungen: ${finalStatus.skippedCount}`);
    console.log(`- Letzte Verarbeitung: ${finalStatus.lastProcessed}`);
    
    if (finalStatus.startTime && finalStatus.lastUpdate) {
      const startTime = new Date(finalStatus.startTime);
      const endTime = new Date(finalStatus.lastUpdate);
      const durationMs = endTime - startTime;
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);
      
      console.log(`- Gesamtlaufzeit: ${durationMinutes} Minuten, ${durationSeconds} Sekunden`);
    }
    
  } catch (error) {
    console.error(`Import fehlgeschlagen: ${error.message}`);
  }
  
  console.log('\n=== PROZESS BEENDET ===');
}

// Skript ausführen
main().catch(error => {
  console.error(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});
/**
 * Status-Check für den Excel-Chunk-Import der großen Datei
 * 
 * Dieses Skript überprüft den aktuellen Status des Chunk-basierten Imports
 * und gibt eine Zusammenfassung des Fortschritts aus.
 */

const fs = require('fs');

// Konfiguration
const CONFIG = {
  statusFilePath: './excel_large_chunk_import_status.json',
  logFilePath: './excel_large_chunk_import.log'
};

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return {
    hours: hours,
    minutes: minutes % 60,
    seconds: seconds % 60,
    formatted: `${hours}h ${minutes % 60}m ${seconds % 60}s`
  };
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getLastLogLines(count = 10) {
  try {
    if (!fs.existsSync(CONFIG.logFilePath)) {
      return 'Keine Log-Datei gefunden.';
    }
    
    const log = fs.readFileSync(CONFIG.logFilePath, 'utf8');
    const lines = log.split('\n').filter(line => line.trim() !== '');
    
    return lines.slice(-count).join('\n');
  } catch (error) {
    return `Fehler beim Lesen der Log-Datei: ${error.message}`;
  }
}

// Status des Imports anzeigen
function showStatus() {
  console.log("\n=== STATUS DES EXCEL-CHUNK-IMPORTS (GROSSE DATEI) ===\n");
  
  try {
    if (!fs.existsSync(CONFIG.statusFilePath)) {
      console.log("Keine Status-Datei gefunden. Der Import wurde vermutlich noch nicht gestartet.");
      return;
    }
    
    const status = JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    
    console.log("Import-Status:");
    console.log(`- Status: ${status.completed ? 'Abgeschlossen' : status.running ? 'Läuft' : 'Pausiert'}`);
    
    if (status.totalRows > 0) {
      const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
      console.log(`- Fortschritt: ${status.currentRow}/${status.totalRows} Zeilen (${progress}%)`);
      console.log(`- Transaktionen: ${status.importedCount} importiert, ${status.skippedCount} übersprungen`);
      
      if (status.startTime && status.lastUpdate) {
        const startTime = new Date(status.startTime);
        const lastUpdate = new Date(status.lastUpdate);
        const now = new Date();
        
        const runningDuration = formatDuration(now - startTime);
        const lastUpdateDuration = formatDuration(now - lastUpdate);
        
        console.log(`- Startzeit: ${formatDateTime(status.startTime)}`);
        console.log(`- Letztes Update: ${formatDateTime(status.lastUpdate)} (vor ${lastUpdateDuration.formatted})`);
        console.log(`- Laufzeit: ${runningDuration.formatted}`);
        
        // Geschätzte verbleibende Zeit
        if (!status.completed && status.currentRow > 0) {
          const msPerRow = (lastUpdate - startTime) / status.currentRow;
          const remainingRows = status.totalRows - status.currentRow;
          const remainingMs = msPerRow * remainingRows;
          
          const remainingTime = formatDuration(remainingMs);
          console.log(`- Geschätzte verbleibende Zeit: ${remainingTime.formatted}`);
          
          // Geschätzte Fertigstellung
          const estimatedCompletionTime = new Date(now.getTime() + remainingMs);
          console.log(`- Geschätzte Fertigstellung: ${formatDateTime(estimatedCompletionTime.toISOString())}`);
        }
      }
    } else {
      console.log("Der Import wurde noch nicht gestartet oder die Gesamtzahl der Zeilen ist noch nicht bekannt.");
    }
    
    console.log("\nLetzte Log-Einträge:");
    console.log(getLastLogLines(15));
    
  } catch (error) {
    console.error("Fehler beim Lesen der Status-Datei:", error.message);
  }
}

// Hauptfunktion
function main() {
  showStatus();
}

// Skript ausführen
main();
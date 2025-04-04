const fs = require('fs');

// Konfiguration
const statusFilePath = './excel_import_status.json';
const logFilePath = './excel_import_full.log';

/**
 * Überprüfe den Status des Excel-Imports
 */
function checkImportStatus() {
  console.log('=== EXCEL-IMPORT STATUS CHECK ===');
  
  // Prüfe, ob Status-Datei existiert
  if (!fs.existsSync(statusFilePath)) {
    console.log('Keine Status-Datei gefunden. Import ist entweder noch nicht gestartet oder in der ersten Phase.');
    
    // Prüfe das Log
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n');
      
      // Zeige die letzten 5 Log-Einträge
      if (logLines.length > 0) {
        console.log('\nAktuelle Import-Aktivität (letzte 5 Log-Einträge):');
        const lastEntries = logLines.slice(-5);
        lastEntries.forEach(line => {
          if (line.trim() !== '') {
            console.log(`  ${line}`);
          }
        });
      } else {
        console.log('Log-Datei ist leer. Import könnte noch nicht gestartet sein.');
      }
    } else {
      console.log('Keine Log-Datei gefunden. Import ist möglicherweise noch nicht gestartet.');
    }
    
    return;
  }
  
  // Status-Datei lesen
  try {
    const statusContent = fs.readFileSync(statusFilePath, 'utf8');
    const status = JSON.parse(statusContent);
    
    console.log('\nImport-Status:');
    console.log('---------------');
    console.log(`Gesamtanzahl Zeilen: ${status.totalRows}`);
    console.log(`Bisher verarbeitet: ${status.totalProcessed} Zeilen (${status.totalRows > 0 ? ((status.totalProcessed / status.totalRows) * 100).toFixed(2) : 0}%)`);
    console.log(`Importiert: ${status.importedCount}`);
    console.log(`Übersprungen: ${status.skippedCount}`);
    console.log(`Nächste Startzeile: ${status.startRow}`);
    console.log(`Letzte Verarbeitung: ${status.lastProcessed || 'Nicht bekannt'}`);
    console.log(`Status: ${status.completed ? 'Abgeschlossen' : (status.failed ? 'Fehlgeschlagen' : 'In Bearbeitung')}`);
    
    if (status.failed) {
      console.log(`Fehler: ${status.errorMessage}`);
    }
    
    // Fortschrittsanzeige
    if (status.totalRows > 0 && !status.completed && !status.failed) {
      const progressPercent = (status.totalProcessed / status.totalRows) * 100;
      const progressBar = createProgressBar(progressPercent);
      console.log(`\nFortschritt: ${progressBar} ${progressPercent.toFixed(2)}%`);
    }
    
    // Zeige letzten Log-Eintrag
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim() !== '');
      
      if (logLines.length > 0) {
        console.log('\nLetzter Log-Eintrag:');
        console.log(`  ${logLines[logLines.length - 1]}`);
      }
    }
    
  } catch (error) {
    console.error(`Fehler beim Lesen oder Parsen der Status-Datei: ${error.message}`);
  }
}

/**
 * Erstellt eine visuelle Fortschrittsanzeige
 */
function createProgressBar(percent, length = 30) {
  const filledLength = Math.floor(length * (percent / 100));
  const emptyLength = length - filledLength;
  
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);
  
  return `[${filled}${empty}]`;
}

// Führe die Statusprüfung aus
checkImportStatus();
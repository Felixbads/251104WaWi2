const { execSync } = require('child_process');
const fs = require('fs');

// Konfiguration
const config = {
  // Hauptskript
  processingScript: './process_large_excel_complete.cjs',
  
  // Status-Datei
  statusFile: './import_status.json',
  
  // Maximale Anzahl von Durchläufen
  maxRuns: 50,
  
  // Wartezeit zwischen Durchläufen in Millisekunden
  delayBetweenRuns: 5000
};

/**
 * Prüft, ob der Import abgeschlossen ist
 */
function isImportCompleted() {
  try {
    if (fs.existsSync(config.statusFile)) {
      const statusContent = fs.readFileSync(config.statusFile, 'utf8');
      const status = JSON.parse(statusContent);
      return status.completed === true;
    }
  } catch (error) {
    console.error(`Fehler beim Prüfen des Status: ${error.message}`);
  }
  
  return false;
}

/**
 * Führt das Verarbeitungsskript aus
 */
function runProcessingScript() {
  try {
    console.log(`\n=== STARTE DURCHLAUF ===`);
    console.log(`Führe Skript aus: ${config.processingScript}`);
    
    // Führe das Skript aus und erfasse die Ausgabe
    const output = execSync(`node ${config.processingScript}`, { 
      encoding: 'utf8',
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024 // 10 MB Buffer für große Ausgaben
    });
    
    console.log(`Skript-Ausführung abgeschlossen.`);
    return true;
  } catch (error) {
    // Prüfe, ob es sich um einen normalen Exit-Code 10 handelt (unvollständig, muss fortgesetzt werden)
    if (error.status === 10) {
      console.log('Durchlauf teilweise abgeschlossen, Fortsetzung erforderlich.');
      return true;
    }
    
    console.error(`Fehler bei der Skriptausführung: ${error.message}`);
    return false;
  }
}

/**
 * Warte für eine bestimmte Zeit
 */
function sleep(ms) {
  console.log(`Warte ${ms / 1000} Sekunden vor dem nächsten Durchlauf...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Hauptfunktion zur Ausführung des Prozesses
 */
async function runCompleteImport() {
  console.log('=== STARTE VOLLSTÄNDIGEN EXCEL-IMPORT PROZESS ===');
  console.log(`Maximale Anzahl Durchläufe: ${config.maxRuns}`);
  
  // Durchläufe ausführen bis Abschluss oder maximale Anzahl erreicht
  let run = 1;
  
  while (run <= config.maxRuns) {
    console.log(`\n--- Durchlauf ${run}/${config.maxRuns} ---`);
    
    // Führe das Skript aus
    const success = runProcessingScript();
    
    if (!success) {
      console.error(`Fehler im Durchlauf ${run}, breche Import ab.`);
      break;
    }
    
    // Prüfe, ob der Import abgeschlossen ist
    if (isImportCompleted()) {
      console.log(`\n=== IMPORT ERFOLGREICH ABGESCHLOSSEN ===`);
      console.log(`Benötigte Durchläufe: ${run}`);
      break;
    }
    
    // Warte zwischen den Durchläufen, wenn nicht der letzte Durchlauf
    if (run < config.maxRuns) {
      await sleep(config.delayBetweenRuns);
    }
    
    run++;
  }
  
  // Wenn die maximale Anzahl von Durchläufen erreicht wurde
  if (run > config.maxRuns && !isImportCompleted()) {
    console.log(`\n=== MAXIMALE ANZAHL VON DURCHLÄUFEN ERREICHT ===`);
    console.log('Der Import ist noch nicht vollständig abgeschlossen.');
    console.log('Führen Sie das Skript erneut aus, um den Import fortzusetzen.');
  }
  
  console.log('\n=== ENDE DES IMPORT-PROZESSES ===');
}

// Starte den Import-Prozess
console.time('Total Import Time');

runCompleteImport()
  .then(() => {
    console.timeEnd('Total Import Time');
  })
  .catch(error => {
    console.error(`Unerwarteter Fehler: ${error.message}`);
    console.timeEnd('Total Import Time');
  });
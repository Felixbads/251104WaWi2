const { execSync } = require('child_process');
const fs = require('fs');

// Konfiguration
const config = {
  // Importskripte
  smallFileScript: './direct_excel_import.cjs',
  largeFileScript: './incremental_excel_import.cjs',
  
  // Status-Datei
  statusFile: './excel_import_status.json',
  
  // Maximale Anzahl von Durchläufen für große Dateien
  maxRuns: 50,
  
  // Wartezeit zwischen Durchläufen in Millisekunden
  delayBetweenRuns: 8000,
  
  // Maximale Wartezeit nach einem fehlgeschlagenen Durchlauf
  errorDelayBetweenRuns: 15000
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
function runImportScript(scriptPath) {
  try {
    console.log(`\n=== STARTE DURCHLAUF ===`);
    console.log(`Führe Skript aus: ${scriptPath}`);
    
    // Führe das Skript aus und erfasse die Ausgabe
    const output = execSync(`node ${scriptPath}`, { 
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
 * Importiert eine kleine Excel-Datei
 */
async function importSmallExcel() {
  console.log('=== STARTE IMPORT EINER KLEINEN EXCEL-DATEI ===');
  
  // Führe das Skript für kleine Dateien aus
  const success = runImportScript(config.smallFileScript);
  
  if (success) {
    console.log('Import der kleinen Excel-Datei abgeschlossen.');
  } else {
    console.error('Fehler beim Import der kleinen Excel-Datei.');
  }
  
  return success;
}

/**
 * Importiert eine große Excel-Datei in mehreren Durchläufen
 */
async function importLargeExcel() {
  console.log('=== STARTE IMPORT EINER GROSSEN EXCEL-DATEI ===');
  console.log(`Maximale Anzahl Durchläufe: ${config.maxRuns}`);
  
  // Durchläufe ausführen bis Abschluss oder maximale Anzahl erreicht
  let run = 1;
  
  while (run <= config.maxRuns) {
    console.log(`\n--- Durchlauf ${run}/${config.maxRuns} ---`);
    
    // Führe das Skript aus
    const success = runImportScript(config.largeFileScript);
    
    if (!success) {
      console.error(`Fehler im Durchlauf ${run}, warte länger vor dem nächsten Versuch.`);
      // Warte länger bei Fehlern, breche aber nicht sofort ab
      await sleep(config.errorDelayBetweenRuns);
      continue;
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
    return false;
  }
  
  return true;
}

/**
 * Hauptfunktion zur Ausführung des Prozesses
 */
async function main() {
  console.log('=== EXCEL-IMPORT PROZESS ===');
  console.log('Dieses Skript führt die Excel-Import-Operationen aus.');
  console.log('\nWählen Sie eine Option:');
  console.log('1. Import einer kleinen Excel-Datei (1.xlsx)');
  console.log('2. Import einer großen Excel-Datei (Report...)');
  
  // Lese die Auswahl aus der Kommandozeile
  const args = process.argv.slice(2);
  let option = args[0] || '';
  
  if (!['1', '2'].includes(option)) {
    console.log('\nKeine gültige Option angegeben. Verwenden Sie:');
    console.log('node run_excel_import.cjs 1  # für kleine Datei');
    console.log('node run_excel_import.cjs 2  # für große Datei');
    process.exit(1);
  }
  
  // Starte den entsprechenden Import
  console.time('Total Import Time');
  
  let success;
  if (option === '1') {
    success = await importSmallExcel();
  } else {
    success = await importLargeExcel();
  }
  
  console.timeEnd('Total Import Time');
  
  if (success) {
    console.log('\n=== IMPORT-PROZESS ERFOLGREICH ABGESCHLOSSEN ===');
  } else {
    console.log('\n=== IMPORT-PROZESS MIT FEHLERN BEENDET ===');
  }
}

// Starte den Import-Prozess
main()
  .catch(error => {
    console.error(`Unerwarteter Fehler: ${error.message}`);
  });
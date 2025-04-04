/**
 * Wrapper-Skript für den optimierten Excel-Import
 * 
 * Dieses Skript steuert den direkten Import von Excel-Daten in die Datenbank und
 * führt automatisch wiederholte Durchläufe durch, bis alle Daten importiert sind.
 */

const { exec } = require('child_process');
const fs = require('fs');

// Konfiguration
const config = {
  statusFile: './excel_large_import_status.json',
  importScript: './optimized_excel_to_db.cjs',
  maxRuns: 100,    // Maximale Anzahl der Durchläufe
  waitBetweenRuns: 3000 // Wartezeit zwischen Durchläufen in ms
};

/**
 * Führt einen einzelnen Import-Durchlauf aus
 */
function runImportProcess(runNumber, totalRuns) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Durchlauf ${runNumber}/${totalRuns} ---\n`);
    console.log('=== STARTE DURCHLAUF ===');
    console.log(`Führe Skript aus: ${config.importScript}`);
    
    const process = exec(`node ${config.importScript}`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 10) {
          // Exit-Code 10 bedeutet erfolgreiche Teilverarbeitung, weiterer Durchlauf erforderlich
          console.log('Teilimport abgeschlossen, weiterer Durchlauf erforderlich.');
          resolve({ completed: false, success: true });
        } else {
          console.error(`Fehler bei der Ausführung: ${error.message}`);
          reject(error);
        }
        return;
      }
      
      if (stderr) {
        console.error(`Standardfehlerausgabe:\n${stderr}`);
      }
      
      // Überprüfe Status-Datei
      if (fs.existsSync(config.statusFile)) {
        try {
          const statusContent = fs.readFileSync(config.statusFile, 'utf8');
          const status = JSON.parse(statusContent);
          
          if (status.completed) {
            console.log('\n=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===');
            resolve({ completed: true, success: true });
          } else if (status.failed) {
            console.log(`\n=== IMPORT FEHLGESCHLAGEN ===\nFehler: ${status.errorMessage}`);
            resolve({ completed: true, success: false, error: status.errorMessage });
          } else {
            console.log('Teilimport abgeschlossen, weiterer Durchlauf erforderlich.');
            resolve({ completed: false, success: true });
          }
        } catch (err) {
          console.error(`Fehler beim Lesen der Status-Datei: ${err.message}`);
          reject(err);
        }
      } else {
        console.log('Keine Status-Datei gefunden, erster Durchlauf läuft noch oder Import ist fehlgeschlagen.');
        resolve({ completed: false, success: true });
      }
    });
  });
}

/**
 * Startet den Import-Prozess mit Wiederholungen
 */
async function startImportProcess(maxRuns) {
  console.log('=== STARTE OPTIMIERTEN EXCEL-IMPORT PROZESS ===');
  console.log(`Maximale Anzahl Durchläufe: ${maxRuns}\n`);
  
  // Falls Statusdatei existiert, zeige letzten Status
  if (fs.existsSync(config.statusFile)) {
    try {
      const statusContent = fs.readFileSync(config.statusFile, 'utf8');
      const status = JSON.parse(statusContent);
      
      console.log('Letzter Status:');
      console.log(`- Startzeile: ${status.startRow}`);
      console.log(`- Verarbeitet: ${status.processedRows}/${status.totalRows} Zeilen (${((status.processedRows / status.totalRows) * 100).toFixed(2)}%)`);
      console.log(`- Importiert: ${status.importedCount}, Übersprungen: ${status.skippedCount}`);
      console.log(`- Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
      console.log('');
      
      if (status.completed) {
        console.log('Import ist bereits vollständig abgeschlossen.');
        return;
      } else if (status.failed) {
        console.log(`Import ist fehlgeschlagen: ${status.errorMessage}`);
        
        // Warten auf Bestätigung zum Fortsetzen
        console.log('Fortsetzen? (Ja/Nein)');
        const answer = await new Promise(resolve => {
          process.stdin.once('data', data => {
            const answer = data.toString().trim().toLowerCase();
            resolve(answer);
          });
        });
        
        if (answer !== 'ja' && answer !== 'j' && answer !== 'yes' && answer !== 'y') {
          console.log('Import-Prozess beendet.');
          return;
        }
        
        // Status zurücksetzen
        status.failed = false;
        status.errorMessage = null;
        fs.writeFileSync(config.statusFile, JSON.stringify(status, null, 2));
      }
    } catch (err) {
      console.error(`Fehler beim Lesen der Status-Datei: ${err.message}`);
    }
  }
  
  let runCount = 0;
  
  while (runCount < maxRuns) {
    runCount++;
    
    try {
      const result = await runImportProcess(runCount, maxRuns);
      
      if (result.completed) {
        if (result.success) {
          console.log(`\nImport erfolgreich nach ${runCount} Durchläufen abgeschlossen!`);
        } else {
          console.log(`\nImport fehlgeschlagen nach ${runCount} Durchläufen: ${result.error}`);
        }
        break;
      } else {
        // Kurze Pause zwischen den Durchläufen
        await new Promise(resolve => setTimeout(resolve, config.waitBetweenRuns));
      }
    } catch (error) {
      console.error(`\nFehler bei Durchlauf ${runCount}: ${error.message}`);
      console.log('Versuche nächsten Durchlauf...');
      
      // Längere Pause bei Fehlern
      await new Promise(resolve => setTimeout(resolve, config.waitBetweenRuns * 2));
    }
  }
  
  if (runCount >= maxRuns) {
    console.log(`\nMaximale Anzahl an Durchläufen (${maxRuns}) erreicht, Import unvollständig.`);
    
    // Letzten Status anzeigen
    if (fs.existsSync(config.statusFile)) {
      try {
        const statusContent = fs.readFileSync(config.statusFile, 'utf8');
        const status = JSON.parse(statusContent);
        
        console.log('Aktueller Status:');
        console.log(`- Verarbeitet: ${status.processedRows}/${status.totalRows} Zeilen (${((status.processedRows / status.totalRows) * 100).toFixed(2)}%)`);
        console.log(`- Importiert: ${status.importedCount}, Übersprungen: ${status.skippedCount}`);
      } catch (err) {
        console.error(`Fehler beim Lesen der Status-Datei: ${err.message}`);
      }
    }
  }
}

// Starte den Import-Prozess
startImportProcess(config.maxRuns);
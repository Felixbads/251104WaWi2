/**
 * Skript zum effizienten Zählen der Zeilen in einer Excel-Datei
 * Vermeidet Speicherprobleme durch chunk-basiertes Lesen
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Zählt die Zeilen in einer Excel-Datei mit einem optimierten Ansatz
 * 
 * @param {string} filePath - Pfad zur Excel-Datei
 * @param {object} options - Optionen für das Zählen
 * @returns {object} - Ergebnis mit Zeilenanzahl und Metadaten
 */
function countExcelRows(filePath, options = {}) {
  console.log(`Zähle Zeilen in Excel-Datei: ${filePath}`);
  
  try {
    // Dateiinformationen
    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`Dateiname: ${path.basename(filePath)}`);
    console.log(`Dateigröße: ${fileSizeKB} KB (${fileSizeMB} MB)`);
    
    // Schrittgröße für das Lesen (Anzahl der Zeilen pro Schritt)
    const stepSize = options.stepSize || 1000;
    console.log(`Verwende Schrittgröße von ${stepSize} Zeilen`);
    
    // Zuerst nur die minimalen Informationen über das Workbook lesen
    console.log('\nLese Arbeitsblatt-Informationen...');
    const workbook = xlsx.readFile(filePath, {
      bookSheets: true,  // Nur Arbeitsblattinformationen laden
      cellFormula: false // Keine Formeln laden
    });
    
    console.log('Verfügbare Arbeitsblätter:');
    workbook.SheetNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    
    // Verwende das erste Arbeitsblatt oder das angegebene
    const sheetName = options.sheetName || workbook.SheetNames[0];
    console.log(`\nVerwende Arbeitsblatt: ${sheetName}`);
    
    // Zuerst die Header-Zeile lesen, um die Struktur zu verstehen
    console.log('Lese Header-Zeile...');
    const headerWorkbook = xlsx.readFile(filePath, {
      sheetRows: 1, // Nur erste Zeile
      cellDates: false
    });
    
    const headerSheet = headerWorkbook.Sheets[sheetName];
    if (!headerSheet) {
      throw new Error(`Arbeitsblatt ${sheetName} nicht gefunden.`);
    }
    
    // Extrahiere Headers
    const headers = xlsx.utils.sheet_to_json(headerSheet, { header: 1 })[0];
    console.log(`Gefundene Spalten: ${headers ? headers.length : 0}`);
    
    if (headers && headers.length > 0) {
      console.log('Spaltennamen:');
      headers.slice(0, Math.min(10, headers.length)).forEach((header, idx) => {
        console.log(`  ${idx+1}. ${header}`);
      });
    }
    
    // Schätzung der Zeilenanzahl durch schrittweises Lesen
    console.log('\nZähle Zeilen durch schrittweises Lesen...');
    
    let currentRow = 0;
    let totalRows = 0;
    let isEmpty = false;
    let startTime = Date.now();
    
    // Zähle in Schritten, um Speicherprobleme zu vermeiden
    while (!isEmpty) {
      // Aktuellen Fortschritt anzeigen
      const elapsedTime = (Date.now() - startTime) / 1000;
      console.log(`  Aktuell gezählt: ${totalRows} Zeilen in ${elapsedTime.toFixed(2)} Sekunden`);
      
      // Lese den nächsten Block
      const nextRow = currentRow + stepSize;
      console.log(`  Lese Zeilen ${currentRow} bis ${nextRow}...`);
      
      try {
        // Lese diesen Chunk
        const chunkWorkbook = xlsx.readFile(filePath, {
          sheetRows: nextRow, // Lese bis zu dieser Zeile
          cellFormula: false,
          cellNF: false,
          cellHTML: false,
          cellText: false,
          cellDates: false,
          sheetStubs: false
        });
        
        const chunkSheet = chunkWorkbook.Sheets[sheetName];
        
        if (!chunkSheet) {
          console.log('  Arbeitsblatt existiert nicht mehr. Beende Zählung.');
          isEmpty = true;
          continue;
        }
        
        // Bestimme die maximale Zeilennummer in diesem Chunk
        const range = xlsx.utils.decode_range(chunkSheet['!ref']);
        const maxRow = range.e.r + 1; // Zeilennummern sind 0-basiert
        
        if (maxRow <= currentRow) {
          // Keine neuen Zeilen gefunden
          console.log('  Keine weiteren Zeilen gefunden. Beende Zählung.');
          isEmpty = true;
          totalRows = maxRow;
        } else {
          // Aktualisiere den Zähler
          totalRows = maxRow;
          currentRow = nextRow;
          
          // Wenn das Ende des Chunks nicht erreicht wurde, sind wir fertig
          if (maxRow < nextRow) {
            console.log(`  Ende der Datei erreicht bei Zeile ${maxRow}.`);
            isEmpty = true;
          }
        }
      } catch (error) {
        console.error(`  Fehler beim Lesen des Chunks: ${error.message}`);
        
        // Versuche mit größeren Schritten fortzufahren oder beende
        if (stepSize < 10) {
          console.log('  Zu viele Fehler. Beende Zählung.');
          isEmpty = true;
        } else {
          // Reduziere die Schrittgröße und versuche es erneut
          totalRows = currentRow;
          isEmpty = true;
          console.log(`  Konnte nicht über Zeile ${currentRow} hinauslesen.`);
        }
      }
      
      // Sicherheitsabbruch bei zu vielen Durchläufen
      if (currentRow > 1000000) {
        console.log('  Maximale Anzahl von Zeilen erreicht. Beende Zählung.');
        isEmpty = true;
      }
    }
    
    // Berechne die tatsächliche Anzahl von Datenzeilen (ohne Header)
    const dataRows = totalRows > 0 ? totalRows - 1 : 0;
    
    // Zusammenfassung
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\n=== Zusammenfassung ===');
    console.log(`Arbeitsblatt: ${sheetName}`);
    console.log(`Gesamtanzahl Zeilen: ${totalRows} (inklusive Header)`);
    console.log(`Anzahl Datenzeilen: ${dataRows}`);
    console.log(`Anzahl Spalten: ${headers ? headers.length : 'unbekannt'}`);
    console.log(`Dauer: ${totalTime.toFixed(2)} Sekunden`);
    
    return {
      success: true,
      fileName: path.basename(filePath),
      fileSize: {
        bytes: stats.size,
        kilobytes: parseFloat(fileSizeKB),
        megabytes: parseFloat(fileSizeMB)
      },
      sheetName,
      totalRows,
      dataRows,
      columnCount: headers ? headers.length : 0,
      columnNames: headers || [],
      timeTaken: totalTime
    };
    
  } catch (error) {
    console.error(`Fehler beim Zählen der Excel-Zeilen:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Hauptfunktion
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node count_excel_rows.cjs <dateipfad> [--step-size=1000]');
    return;
  }
  
  const filePath = args[0];
  
  // Optionen parsen
  const options = {
    stepSize: 1000
  };
  
  // Step-Size parsen
  const stepArg = args.find(arg => arg.startsWith('--step-size='));
  if (stepArg) {
    options.stepSize = parseInt(stepArg.split('=')[1], 10);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  const result = countExcelRows(filePath, options);
  
  if (result.success) {
    console.log('\nErgebnisse:');
    console.log(JSON.stringify(result, null, 2));
  }
}

// Ausführen der Hauptfunktion
if (require.main === module) {
  main();
}

// Export für die Verwendung in anderen Skripten
module.exports = { countExcelRows };
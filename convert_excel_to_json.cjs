/**
 * Konvertiert Excel-Datei in JSON-Format für einfacheren Import
 * Lösung für Probleme mit der direkten Excel-Verarbeitung
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  chunkSize: 1000, // Anzahl der Zeilen pro Datei
  outputDir: './json_chunks', // Ausgabeverzeichnis
  // Automatisches Mapping von Automatennamen zu IDs
  machineMapping: {
    'Pfaffendorf': 51, 
    'Bahnhof Bad Schandau': 52, 
    'Bad Schandau, Nationalparkbahnhof': 52, 
    'Rathen': 53
  }
};

/**
 * Formatiert eine Transaktion aus Excel für den Import
 * 
 * @param {Object} row - Excel-Zeile als Objekt
 * @param {Object} machineMapping - Zuordnung von Automatennamen zu IDs
 * @param {number} rowIndex - Zeilenindex für Nachverfolgung
 * @returns {Object} Formatierte Transaktion
 */
function formatTransaction(row, machineMapping, rowIndex) {
  // Neues Objekt mit gemappten Feldern erstellen
  const mappedRow = {};
  
  // Eindeutige Transaktions-ID erzeugen, falls nicht vorhanden
  if (!row['Transaction ID']) {
    // Erzeuge eine eindeutige ID basierend auf Datum und anderen verfügbaren Daten
    const date = row['Date / Time'] || new Date().toISOString();
    const productName = row['Produktname'] || 'unknown';
    const price = row['Preis (inkl. MwSt.)'] || '0';
    mappedRow['vendonId'] = `imported-${date}-${productName}-${price}`.replace(/[^a-zA-Z0-9]/g, '-');
  } else {
    mappedRow['vendonId'] = row['Transaction ID'];
  }
  
  // Datum korrekt formatieren
  if (row['Date / Time']) {
    // Verschiedene Datumsformate berücksichtigen
    let dateValue = row['Date / Time'];
    
    if (typeof dateValue === 'string') {
      // String-Datum parsen
      mappedRow['datetime'] = new Date(dateValue).toISOString();
    } else if (dateValue instanceof Date) {
      // Date-Objekt direkt verwenden
      mappedRow['datetime'] = dateValue.toISOString();
    } else {
      // Fallback
      mappedRow['datetime'] = new Date().toISOString();
    }
  } else {
    mappedRow['datetime'] = new Date().toISOString();
  }
  
  // Automatische Zuordnung von Automatennamen zu IDs, falls die ID fehlt
  if ((!row['Automaten-ID'] || row['Automaten-ID'] === '') && row['Automatenname']) {
    const machineName = row['Automatenname'];
    if (machineMapping[machineName]) {
      mappedRow['machineId'] = machineMapping[machineName];
    }
  } else if (row['Automaten-ID']) {
    // Verwende die vorhandene ID
    mappedRow['machineId'] = Number(row['Automaten-ID']);
  }
  
  // Maschinenname
  mappedRow['machineName'] = row['Automatenname'] || null;
  
  // Produktinformationen
  mappedRow['productId'] = row['Produktnr.'] ? String(row['Produktnr.']) : null;
  mappedRow['productName'] = row['Produktname'] || null;
  
  // Preis und Mengeninformationen
  mappedRow['quantity'] = row['Menge'] ? Number(row['Menge']) : 1;
  mappedRow['price'] = row['Preis (inkl. MwSt.)'] ? Number(row['Preis (inkl. MwSt.)']) : 0;
  mappedRow['priceWoVat'] = row['Preis (ohne MwSt.)'] ? Number(row['Preis (ohne MwSt.)']) : null;
  mappedRow['vat'] = row['MwSt. %'] ? Number(row['MwSt. %']) : null;
  mappedRow['currency'] = row['Währung'] || 'EUR';
  
  // Zahlungsinformationen
  if (row['Transaktionstyp']) {
    const paymentTypeMap = {
      'BAR': 'CASH',
      'BARGELDLOS': 'CASHLESS'
    };
    mappedRow['paymentMethod'] = paymentTypeMap[row['Transaktionstyp']] || row['Transaktionstyp'];
    mappedRow['paymentType'] = row['Transaktionstyp'];
  }
  
  // Metadaten
  mappedRow['source'] = 'excel-import';
  mappedRow['metadata'] = JSON.stringify({
    importedFromExcel: true,
    importDate: new Date().toISOString(),
    originalRow: rowIndex
  });
  
  // Status und Verarbeitung
  mappedRow['status'] = 'completed';
  mappedRow['processingStatus'] = 'processed';
  mappedRow['syncedAt'] = new Date().toISOString();
  mappedRow['createdAt'] = new Date().toISOString();
  
  return mappedRow;
}

/**
 * Konvertiert eine Excel-Datei in separate JSON-Dateien für den Import
 * 
 * @param {string} filePath - Pfad zur Excel-Datei
 * @param {Object} options - Optionen für die Konvertierung
 * @returns {Object} Ergebnis der Konvertierung
 */
async function convertExcelToJson(filePath, options = {}) {
  console.log(`\nKonvertiere Excel-Datei in JSON: ${filePath}`);
  
  // Parameter zusammenführen
  const params = {
    chunkSize: options.chunkSize || CONFIG.chunkSize,
    outputDir: options.outputDir || CONFIG.outputDir,
    machineMapping: options.machineMapping || CONFIG.machineMapping
  };
  
  console.log(`Optionen: Chunk-Größe=${params.chunkSize}, Ausgabeverzeichnis=${params.outputDir}`);
  
  try {
    // Überprüfe Dateigröße
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log(`Dateigröße: ${fileSizeMB} MB`);
    
    // Erstelle Ausgabeverzeichnis, falls es nicht existiert
    if (!fs.existsSync(params.outputDir)) {
      fs.mkdirSync(params.outputDir, { recursive: true });
      console.log(`Ausgabeverzeichnis erstellt: ${params.outputDir}`);
    }
    
    // Fortschrittsvariablen initialisieren
    let totalRows = 0;
    let processedRows = 0;
    let startTime = Date.now();
    
    // Lese die Struktur
    console.log('\nLese Arbeitsblatt-Struktur...');
    
    // Versuche zuerst nur die Struktur zu lesen
    const workbook = xlsx.readFile(filePath, {
      bookSheets: true,
      cellFormula: false
    });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Keine Arbeitsblätter in der Excel-Datei gefunden.');
    }
    
    const sheetName = workbook.SheetNames[0];
    console.log(`Verwende Arbeitsblatt: ${sheetName}`);
    
    // Lese die Header-Zeile
    console.log('Lese Header-Zeile...');
    const headerWorkbook = xlsx.readFile(filePath, {
      sheetRows: 1, // Nur Header-Zeile
      cellDates: true
    });
    
    if (!headerWorkbook.Sheets[sheetName]) {
      throw new Error(`Arbeitsblatt ${sheetName} konnte nicht gelesen werden.`);
    }
    
    const headerWorksheet = headerWorkbook.Sheets[sheetName];
    const headers = xlsx.utils.sheet_to_json(headerWorksheet, { header: 1 })[0];
    
    if (!headers || headers.length === 0) {
      throw new Error('Keine Header-Zeilen gefunden.');
    }
    
    console.log(`Gefundene Spalten: ${headers.length}`);
    console.log('Spaltenüberschriften:');
    headers.slice(0, 10).forEach((header, idx) => {
      console.log(`  ${idx+1}. ${header}`);
    });
    
    // Chunks-basierte Verarbeitung
    console.log('\nBeginne Chunk-basierte Verarbeitung...');
    
    // Importstatistik initialisieren
    const importStats = {
      totalChunks: 0,
      processedChunks: 0,
      totalRows: 0,
      convertedFiles: 0,
      startTime: Date.now()
    };
    
    // Verarbeite die Datei in Chunks
    let currentRow = 1; // Start nach der Header-Zeile
    let chunkIndex = 1;
    let isComplete = false;
    
    // Verwende einen inkrementellen Ansatz
    while (!isComplete) {
      importStats.totalChunks++;
      
      console.log(`\nVerarbeite Chunk ${importStats.totalChunks}...`);
      console.log(`Lese Zeilen ${currentRow} bis ${currentRow + params.chunkSize - 1}...`);
      
      try {
        // Lese diesen Chunk aus der Datei
        const chunkWorkbook = xlsx.readFile(filePath, {
          sheetRows: currentRow + params.chunkSize, // Lese bis zum Ende dieses Chunks
          cellDates: true
        });
        
        if (!chunkWorkbook.Sheets[sheetName]) {
          console.log('Keine weiteren Daten gefunden. Konvertierung abgeschlossen.');
          isComplete = true;
          continue;
        }
        
        const chunkWorksheet = chunkWorkbook.Sheets[sheetName];
        
        // Konvertiere nur die relevanten Zeilen dieses Chunks in JSON
        const range = {
          s: { r: currentRow, c: 0 }, // Startzeile für diesen Chunk
          e: { r: currentRow + params.chunkSize - 1, c: headers.length - 1 } // Endzeile für diesen Chunk
        };
        
        // Konvertiere den Bereich in A1-Notation
        const rangeStr = xlsx.utils.encode_range(range);
        
        // Lese nur die Zeilen aus diesem Bereich
        const jsonData = xlsx.utils.sheet_to_json(chunkWorksheet, {
          range: rangeStr,
          defval: null,
          blankrows: false
        });
        
        if (!jsonData || jsonData.length === 0) {
          console.log('Keine weiteren Daten gefunden. Konvertierung abgeschlossen.');
          isComplete = true;
          continue;
        }
        
        console.log(`Chunk enthält ${jsonData.length} Zeilen.`);
        
        // Verarbeite die Daten
        const processedData = jsonData.map((row, index) => {
          // Erzeuge eine strukturierte Transaktion aus den Rohdaten
          return formatTransaction(row, params.machineMapping, currentRow + index);
        });
        
        // Fortschritt aktualisieren
        processedRows += processedData.length;
        importStats.totalRows += processedData.length;
        
        // Speichere den Chunk als JSON-Datei
        const chunkFileName = `${path.basename(filePath, path.extname(filePath))}_chunk${chunkIndex}.json`;
        const chunkFilePath = path.join(params.outputDir, chunkFileName);
        
        fs.writeFileSync(chunkFilePath, JSON.stringify(processedData, null, 2));
        console.log(`Chunk als JSON-Datei gespeichert: ${chunkFilePath}`);
        importStats.convertedFiles++;
        
        // Fortschritt anzeigen
        importStats.processedChunks++;
        const elapsedSeconds = Math.floor((Date.now() - importStats.startTime) / 1000);
        const rowsPerSecond = Math.floor(processedRows / (elapsedSeconds || 1));
        
        console.log(`Fortschritt: ${processedRows} Zeilen verarbeitet in ${elapsedSeconds} Sekunden (${rowsPerSecond} Zeilen/s)`);
        
        // Für den nächsten Chunk
        currentRow += params.chunkSize;
        chunkIndex++;
        
        // Sicherheitsabbruch, falls die Datei zu groß ist oder ein Problem vorliegt
        if (importStats.totalChunks > 1000) {
          console.log('Maximale Anzahl von Chunks erreicht. Beende Konvertierung.');
          isComplete = true;
        }
        
      } catch (chunkError) {
        console.error(`Fehler beim Verarbeiten von Chunk ${importStats.totalChunks}:`, chunkError.message);
        
        // Versuche mit dem nächsten Chunk fortzufahren
        currentRow += params.chunkSize;
        chunkIndex++;
        
        // Bei wiederholten Fehlern abbrechen
        if (importStats.totalChunks >= 5 && importStats.processedChunks === 0) {
          console.error('Zu viele Fehler. Beende Konvertierung.');
          isComplete = true;
        }
      }
    }
    
    // Zusammenfassung
    const totalTimeSeconds = Math.floor((Date.now() - importStats.startTime) / 1000);
    console.log('\n=== Konvertierungs-Zusammenfassung ===');
    console.log(`Gesamtzeit: ${totalTimeSeconds} Sekunden`);
    console.log(`Verarbeitete Chunks: ${importStats.processedChunks} von ${importStats.totalChunks}`);
    console.log(`Verarbeitete Zeilen: ${importStats.totalRows}`);
    console.log(`Erzeugte JSON-Dateien: ${importStats.convertedFiles}`);
    console.log(`Speicherort: ${params.outputDir}`);
    
    // Importanweisungen
    console.log('\n=== Importanweisungen ===');
    console.log('Um die generierten JSON-Dateien zu importieren, führen Sie den folgenden Befehl für jede Datei aus:');
    console.log('curl -X POST http://localhost:5000/api/vendon/import/json -H "Content-Type: application/json" -d @dateiname.json');
    console.log('\nOder verwenden Sie das Skript import_json_files.cjs:');
    console.log('node import_json_files.cjs --dir=./json_chunks');
    
    return {
      success: true,
      message: 'Konvertierung abgeschlossen',
      stats: {
        totalRows: importStats.totalRows,
        convertedFiles: importStats.convertedFiles,
        totalTimeSeconds,
        outputDir: params.outputDir
      }
    };
    
  } catch (error) {
    console.error(`Fehler bei der Konvertierung der Excel-Datei:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node convert_excel_to_json.cjs <dateipfad> [--chunk-size=1000] [--output-dir=./json_chunks]');
    return;
  }
  
  const filePath = args[0];
  
  // Optionen parsen
  const options = {
    chunkSize: CONFIG.chunkSize,
    outputDir: CONFIG.outputDir
  };
  
  // Chunk-Größe parsen
  const chunkArg = args.find(arg => arg.startsWith('--chunk-size='));
  if (chunkArg) {
    options.chunkSize = parseInt(chunkArg.split('=')[1], 10);
  }
  
  // Ausgabeverzeichnis parsen
  const outputArg = args.find(arg => arg.startsWith('--output-dir='));
  if (outputArg) {
    options.outputDir = outputArg.split('=')[1];
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  
  // Konvertiere Excel zu JSON
  const result = await convertExcelToJson(filePath, options);
  
  if (result.success) {
    console.log(`\nKonvertierung erfolgreich: ${result.message}`);
    console.log('Statistik:', result.stats);
  } else {
    console.error(`\nKonvertierung fehlgeschlagen: ${result.message}`);
  }
}

// Ausführen der Hauptfunktion
if (require.main === module) {
  main().catch(err => {
    console.error('Unbehandelte Ausnahme:', err);
    process.exit(1);
  });
}

// Export für die Verwendung in anderen Skripten
module.exports = { convertExcelToJson, formatTransaction };
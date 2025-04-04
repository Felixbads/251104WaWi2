/**
 * Stream-basierter Import von Excel-Dateien
 * 
 * Dieses Skript verwendet einen Chunk-basierten Ansatz, um große Excel-Dateien
 * zu verarbeiten, ohne den gesamten Inhalt auf einmal in den Speicher zu laden.
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Konfiguration
const CONFIG = {
  // API-Endpunkt für den Import
  apiEndpoint: 'http://localhost:3000/api/vendon/import/excel',
  // Größe der Chunks (Anzahl der Zeilen pro Verarbeitung)
  chunkSize: 100,
  // Automatisches Mapping von Automatennamen zu IDs
  machineMapping: {
    'Pfaffendorf': 51, 
    'Bahnhof Bad Schandau': 52, 
    'Bad Schandau, Nationalparkbahnhof': 52, 
    'Rathen': 53
  }
};

/**
 * Liest und importiert Excel-Daten in Chunks
 */
async function streamImportExcel(filePath, options = {}) {
  console.log(`\nStreaming-Import der Excel-Datei: ${filePath}`);
  
  // Parameter zusammenführen
  const params = {
    chunkSize: options.chunkSize || CONFIG.chunkSize,
    dryRun: options.dryRun || false,
    apiEndpoint: options.apiEndpoint || CONFIG.apiEndpoint,
    machineMapping: options.machineMapping || CONFIG.machineMapping
  };
  
  console.log(`Optionen: Chunk-Größe=${params.chunkSize}, Dry-Run=${params.dryRun}`);
  
  try {
    // Überprüfe Dateigröße
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log(`Dateigröße: ${fileSizeMB} MB`);
    
    // Fortschrittsvariablen initialisieren
    let totalRows = 0;
    let processedRows = 0;
    let savedRows = 0;
    let duplicateRows = 0;
    let errorRows = 0;
    let startTime = Date.now();
    
    // Lese Workbook mit minimalem Lesen
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
    
    // Bestimme die Gesamtzahl der Zeilen (sofern möglich)
    // Wir müssen dies in chunks tun, um Timeouts zu vermeiden
    console.log('\nSchätze Zeilenanzahl...');
    
    // Lese die ersten Zeilen, um die Struktur zu ermitteln
    console.log('Lese Header-Zeilen...');
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
    
    // Wir können die genaue Zeilenzahl nicht im Voraus bestimmen, ohne die ganze Datei zu lesen
    // Stattdessen lesen wir in Chunks und verarbeiten diese
    console.log('\nBeginne Chunk-basierte Verarbeitung...');
    
    // Importstatistik initialisieren
    const importStats = {
      totalChunks: 0,
      processedChunks: 0,
      savedRows: 0,
      duplicateRows: 0,
      errorRows: 0,
      startTime: Date.now()
    };
    
    // Verarbeite die Datei in Chunks
    let currentRow = 1; // Start nach der Header-Zeile
    let isComplete = false;
    
    while (!isComplete) {
      importStats.totalChunks++;
      
      console.log(`\nVerarbeite Chunk ${importStats.totalChunks}...`);
      console.log(`Lese Zeilen ${currentRow} bis ${currentRow + params.chunkSize - 1}...`);
      
      try {
        // Lese den nächsten Chunk
        const chunkWorkbook = xlsx.readFile(filePath, {
          sheetRows: currentRow + params.chunkSize, // Lese bis zum Ende dieses Chunks
          cellDates: true
        });
        
        if (!chunkWorkbook.Sheets[sheetName]) {
          console.log('Keine weiteren Daten gefunden. Import abgeschlossen.');
          isComplete = true;
          continue;
        }
        
        const chunkWorksheet = chunkWorkbook.Sheets[sheetName];
        
        // Konvertiere nur die relevanten Zeilen dieses Chunks in JSON (ohne die bereits verarbeiteten Zeilen)
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
          console.log('Keine weiteren Daten gefunden. Import abgeschlossen.');
          isComplete = true;
          continue;
        }
        
        console.log(`Chunk enthält ${jsonData.length} Zeilen.`);
        
        // Verarbeite die Daten
        const processedData = jsonData.map((row, index) => {
          // Erzeuge eine strukturierte Transaktion aus den Rohdaten
          return formatTransaction(row, params.machineMapping, currentRow + index);
        });
        
        // Update der verarbeiteten Zeilen
        processedRows += processedData.length;
        
        // Wenn es ein Dry-Run ist, keine API-Aufrufe machen
        if (params.dryRun) {
          console.log(`Dry-Run: Würde ${processedData.length} Zeilen importieren.`);
          
          // Zeige das erste Element zur Überprüfung
          if (processedData.length > 0) {
            console.log('\nBeispiel für verarbeitete Daten:');
            console.log(JSON.stringify(processedData[0], null, 2));
          }
        } else {
          // Sende den Chunk an die API
          console.log(`Sende ${processedData.length} Zeilen an API...`);
          
          try {
            const response = await axios.post(params.apiEndpoint, {
              transactions: processedData,
              skipExistingCheck: false // Prüfe auf Duplikate
            });
            
            if (response.data && response.data.status === 'success') {
              console.log(`Chunk ${importStats.totalChunks} erfolgreich importiert: ${response.data.stats.saved} gespeichert, ${response.data.stats.duplicates} Duplikate`);
              importStats.savedRows += response.data.stats.saved;
              importStats.duplicateRows += response.data.stats.duplicates;
              importStats.errorRows += response.data.stats.errors;
            } else {
              console.error(`Fehler beim Import von Chunk ${importStats.totalChunks}:`, response.data);
              importStats.errorRows += processedData.length;
            }
          } catch (apiError) {
            console.error(`API-Fehler bei Chunk ${importStats.totalChunks}:`, apiError.message);
            importStats.errorRows += processedData.length;
          }
        }
        
        // Aktualisiere den Fortschritt
        importStats.processedChunks++;
        const elapsedSeconds = Math.floor((Date.now() - importStats.startTime) / 1000);
        const rowsPerSecond = Math.floor(processedRows / (elapsedSeconds || 1));
        
        console.log(`Fortschritt: ${processedRows} Zeilen verarbeitet in ${elapsedSeconds} Sekunden (${rowsPerSecond} Zeilen/s)`);
        
        // Für den nächsten Chunk
        currentRow += params.chunkSize;
        
        // Sicherheitsabbruch, falls die Datei zu groß ist oder ein Problem vorliegt
        if (importStats.totalChunks > 1000) {
          console.log('Maximale Anzahl von Chunks erreicht. Beende Import.');
          isComplete = true;
        }
        
      } catch (chunkError) {
        console.error(`Fehler beim Verarbeiten von Chunk ${importStats.totalChunks}:`, chunkError.message);
        errorRows += params.chunkSize; // Schätze Fehler für diesen Chunk
        
        // Versuche mit dem nächsten Chunk fortzufahren
        currentRow += params.chunkSize;
        
        // Bei wiederholten Fehlern abbrechen
        if (importStats.totalChunks >= 3 && importStats.errorRows >= processedRows) {
          console.error('Zu viele Fehler. Beende Import.');
          isComplete = true;
        }
      }
    }
    
    // Zusammenfassung
    const totalTimeSeconds = Math.floor((Date.now() - importStats.startTime) / 1000);
    console.log('\n=== Import-Zusammenfassung ===');
    console.log(`Gesamtzeit: ${totalTimeSeconds} Sekunden`);
    console.log(`Verarbeitete Chunks: ${importStats.processedChunks} von ${importStats.totalChunks}`);
    console.log(`Verarbeitete Zeilen: ca. ${processedRows}`);
    
    if (!params.dryRun) {
      console.log(`Gespeicherte Zeilen: ${importStats.savedRows}`);
      console.log(`Duplikate: ${importStats.duplicateRows}`);
      console.log(`Fehler: ${importStats.errorRows}`);
    }
    
    return {
      success: true,
      message: params.dryRun ? 'Dry-Run abgeschlossen' : 'Import abgeschlossen',
      stats: {
        processedRows,
        savedRows: importStats.savedRows,
        duplicateRows: importStats.duplicateRows,
        errorRows: importStats.errorRows,
        totalTimeSeconds
      }
    };
    
  } catch (error) {
    console.error(`Fehler beim Stream-Import der Excel-Datei:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Formatiert eine Transaktionszeile für den Import
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
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node stream_import_excel.cjs <dateipfad> [--dry-run] [--chunk-size=100]');
    return;
  }
  
  const filePath = args[0];
  
  // Optionen parsen
  const options = {
    dryRun: args.includes('--dry-run'),
    chunkSize: 100
  };
  
  // Chunk-Größe parsen
  const chunkArg = args.find(arg => arg.startsWith('--chunk-size='));
  if (chunkArg) {
    options.chunkSize = parseInt(chunkArg.split('=')[1], 10);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  
  // Stream-basierter Import
  const result = await streamImportExcel(filePath, options);
  
  if (result.success) {
    console.log(`\nImport erfolgreich: ${result.message}`);
    console.log('Statistik:', result.stats);
  } else {
    console.error(`\nImport fehlgeschlagen: ${result.message}`);
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
module.exports = { streamImportExcel };
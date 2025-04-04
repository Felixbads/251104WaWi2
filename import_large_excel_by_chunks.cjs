const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration für die große Excel-Datei
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx', // Große Excel-Datei
  outputDir: './split_excel_large',
  chunkSize: 25, // Kleinere Chunks für die große Datei
  maxChunks: 10, // Begrenzte Anzahl von Chunks für Tests
  
  // Zeitlimits und Prozesssteuerung
  maxProcessingTime: 120000, // 2 Minuten maximale Verarbeitungszeit
  useMemoryEfficientMode: true, // Speichereffiziente Verarbeitung 
  
  // API-Konfiguration
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 2000, // Längere Wartezeit zwischen API-Anfragen
  
  // Mapping für Maschinen-IDs
  telemetryToMachineMap: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

/**
 * Zeigt die Dateigröße in lesbarem Format an
 */
function getReadableFileSize(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats.size;
  const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
  return fileSizeInMB.toFixed(2) + ' MB';
}

/**
 * Erstellt das Ausgabeverzeichnis, falls es nicht existiert
 */
function createOutputDirIfNeeded() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
  }
}

/**
 * Verzögerungsfunktion für asynchrones Warten
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Teilt eine große Excel-Datei in Chunks auf und verarbeitet sie direkt
 * ohne das gesamte Blatt in den Speicher zu laden
 */
async function splitAndProcessLargeExcel() {
  try {
    // Startzeit für Zeitbegrenzung festlegen
    const startTime = Date.now();
    
    // Hilfsfunktion zur Prüfung, ob Zeitlimit überschritten wurde
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    console.log(`Verarbeitung der großen Excel-Datei: ${config.inputExcelFile}`);
    console.log(`Dateigröße: ${getReadableFileSize(config.inputExcelFile)}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei für Low-Memory-Verarbeitung öffnen
    console.log('Öffne Excel-Datei mit optimierten Einstellungen für große Dateien...');
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,  // Keine Formeln verarbeiten
      cellHTML: false,     // Kein HTML verarbeiten
      cellStyles: false,   // Keine Stile verarbeiten
      cellNF: false,       // Keine Zahlenformate
      cellDates: true,     // Datumsformate beibehalten
      sheetStubs: true,    // Leere Zellen berücksichtigen
      bookDeps: false,     // Keine Abhängigkeiten verfolgen
      bookVBA: false,      // Kein VBA-Code laden
      dense: true,         // Optimierung für große Dateien
      WTF: false           // Weniger Warnungen ausgeben
    });
    
    // Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich des Arbeitsblatts ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const totalRows = range.e.r - range.s.r; // Gesamtanzahl der Zeilen (ohne Header)
    
    console.log(`Arbeitsblatt '${sheetName}' hat ${totalRows} Datenzeilen.`);
    
    // Spaltenüberschriften aus der ersten Zeile lesen
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
        headers[c] = worksheet[cellAddress].v;
      } else {
        headers[c] = `Column_${c}`;
      }
    }
    
    console.log(`${Object.keys(headers).length} Spalten gefunden.`);
    
    // Verarbeitung einrichten
    const rows = range.s.r + 1; // Beginne bei erster Datenzeile (nach Header)
    const maxRow = config.maxChunks > 0 
      ? Math.min(rows + (config.chunkSize * config.maxChunks), range.e.r + 1)
      : range.e.r + 1;
    
    console.log(`Verarbeite Zeilen ${rows} bis ${maxRow - 1} (maximal ${config.maxChunks} Chunks mit je ${config.chunkSize} Zeilen).`);
    
    // Statistik
    const stats = {
      processedChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      totalRows: 0,
      savedTransactions: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Chunks verarbeiten
    let currentChunk = [];
    let currentChunkNumber = 1;
    let rowsProcessed = 0;
    
    for (let r = rows; r < maxRow; r++) {
      // Prüfe, ob das Zeitlimit überschritten wurde
      if (isTimeExceeded()) {
        console.log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, breche Verarbeitung ab.`);
        break;
      }
      
      // Zeile verarbeiten
      const rowData = {};
      let hasData = false;
      
      // Alle Zellen der Zeile lesen
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r, c });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          rowData[headers[c]] = worksheet[cellAddress].v;
          hasData = true;
        }
      }
      
      // Nur Zeilen mit Daten hinzufügen
      if (hasData) {
        currentChunk.push(rowData);
        rowsProcessed++;
      }
      
      // Wenn der Chunk voll ist oder wir am Ende sind
      if (currentChunk.length >= config.chunkSize || r === maxRow - 1) {
        if (currentChunk.length > 0) {
          // Erstelle ein neues Arbeitsblatt für den Chunk
          const newWorksheet = xlsx.utils.json_to_sheet(currentChunk);
          const newWorkbook = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Data');
          
          // Definiere den Ausgabepfad
          const outputPath = path.join(config.outputDir, `chunk_${currentChunkNumber}.xlsx`);
          
          // Schreibe die neue Excel-Datei
          xlsx.writeFile(newWorkbook, outputPath);
          
          console.log(`Chunk ${currentChunkNumber} geschrieben: ${outputPath} (${currentChunk.length} Zeilen)`);
          
          // Konvertiere in Vendon-Format und importiere
          console.log(`Importiere Chunk ${currentChunkNumber}...`);
          
          try {
            // Konvertiere die Daten
            const vendonTransactions = convertToVendonFormat(currentChunk);
            
            // Importiere die Daten
            const result = await importTransactionChunk(vendonTransactions, currentChunkNumber);
            stats.processedChunks++;
            
            if (result.success) {
              stats.successfulChunks++;
              if (result.result && result.result.stats) {
                stats.savedTransactions += result.result.stats.saved || 0;
                stats.duplicates += result.result.stats.duplicates || 0;
                stats.errors += result.result.stats.errors || 0;
                stats.totalRows += result.result.stats.total || 0;
              }
            } else {
              stats.failedChunks++;
            }
            
            // Warte zwischen den Anfragen
            if (r < maxRow - 1) {
              console.log(`Warte ${config.delayBetweenRequests}ms vor dem nächsten Chunk...`);
              await sleep(config.delayBetweenRequests);
            }
          } catch (error) {
            console.error(`Fehler beim Importieren von Chunk ${currentChunkNumber}:`, error.message);
            stats.failedChunks++;
          }
          
          // Zurücksetzen für nächsten Chunk
          currentChunk = [];
          currentChunkNumber++;
          
          // Ressourcen freigeben
          if (config.useMemoryEfficientMode) {
            global.gc && global.gc(); // Garbage Collection, wenn verfügbar
          }
        }
      }
    }
    
    console.log(`\nGesamtverarbeitung abgeschlossen!`);
    console.log(`${rowsProcessed} Zeilen in ${currentChunkNumber - 1} Excel-Dateien aufgeteilt.`);
    console.log(`Gesamtstatistik:
      - Verarbeitete Chunks: ${stats.processedChunks}
      - Erfolgreiche Chunks: ${stats.successfulChunks}
      - Fehlgeschlagene Chunks: ${stats.failedChunks}
      - Verarbeitete Zeilen: ${stats.totalRows}
      - Gespeicherte Transaktionen: ${stats.savedTransactions}
      - Duplikate: ${stats.duplicates}
      - Fehler: ${stats.errors}
    `);
    
    return stats;
  } catch (error) {
    console.error(`Fehler bei der Excel-Verarbeitung:`, error);
    console.error(error.stack);
    return null;
  }
}

/**
 * Konvertiert Excel-Daten in das Vendon-Transaktionsformat
 */
function convertToVendonFormat(excelData) {
  return excelData.map((row, index) => {
    // Datum im ISO-Format konvertieren
    let dateTime;
    try {
      dateTime = new Date(row['Date / Time']);
      if (isNaN(dateTime.getTime())) {
        // Fallback für ungültiges Datum
        dateTime = new Date();
        console.warn(`Ungültiges Datum in Zeile ${index + 1}: "${row['Date / Time']}", verwende aktuelles Datum.`);
      }
    } catch (e) {
      dateTime = new Date();
      console.warn(`Fehler beim Parsen des Datums in Zeile ${index + 1}: ${e.message}`);
    }
    
    const isoDate = dateTime.toISOString();
    
    // Erstelle eine eindeutige ID für die Transaktion basierend auf mehreren Feldern
    const uniqueId = `${dateTime.getTime()}-${row['Produktnr.'] || '000'}-${row['Telemetrieeinheit'] || '0'}-${index}`;
    const vendonId = `imported-excel-${uniqueId}`;
    
    // Maschinen-ID aus der Telemetrieeinheit zuordnen
    let machineId = null;
    const telemetryUnit = row['Telemetrieeinheit'];
    if (telemetryUnit && config.telemetryToMachineMap[telemetryUnit]) {
      machineId = config.telemetryToMachineMap[telemetryUnit];
    }
    
    return {
      vendonId: vendonId,
      datetime: isoDate,
      machineName: row['Automatenname'] || 'Unbekannt',
      machineId: machineId,
      productId: row['Produktnr.'] ? row['Produktnr.'].toString() : '0',
      productName: row['Produktname'] || 'Unbekanntes Produkt',
      quantity: row['Menge'] || 1,
      price: row['Preis (inkl. MwSt.)'] || 0,
      priceWoVat: row['Preis (ohne MwSt.)'] || 0,
      vat: row['MwSt. %'] || 0,
      currency: row['Währung'] || 'EUR',
      source: "excel-import",
      metadata: JSON.stringify({
        importedFromExcel: true,
        importDate: new Date().toISOString(),
        originalRow: index + 1,
        telemetryUnit: telemetryUnit,
        address: row['Adresse'],
        transactionType: row['Transaktionstyp']
      }),
      status: "completed",
      processingStatus: "processed",
      syncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  });
}

/**
 * Importiert einen Chunk von Transaktionen über die API
 */
async function importTransactionChunk(transactions, chunkIndex) {
  try {
    console.log(`Importiere Chunk ${chunkIndex} mit ${transactions.length} Transaktionen...`);
    
    const requestBody = {
      transactions: transactions,
      skipExistingCheck: false
    };
    
    const response = await axios.post(config.apiEndpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Import von Chunk ${chunkIndex} abgeschlossen. Status: ${response.status}`);
    console.log(`Ergebnis: ${JSON.stringify(response.data.stats)}`);
    
    return {
      success: true,
      result: response.data,
      chunkIndex
    };
  } catch (error) {
    console.error(`Fehler beim Importieren von Chunk ${chunkIndex}:`, error.message);
    return {
      success: false,
      error: error.message,
      chunkIndex
    };
  }
}

// Starte die Verarbeitung
console.time('Total Processing Time');

splitAndProcessLargeExcel()
  .then(stats => {
    console.log('Verarbeitung abgeschlossen!');
    console.timeEnd('Total Processing Time');
  })
  .catch(error => {
    console.error('Unerwarteter Fehler:', error);
    console.timeEnd('Total Processing Time');
  });